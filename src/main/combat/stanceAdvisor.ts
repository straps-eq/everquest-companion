// THE STANCE ADVISOR — WHEN to say "you are in the wrong stance", and (mostly) when not to.
//
// The three other pieces of this feature already exist and none of them decides anything about
// timing: shared/stances.ts holds the wiki's multipliers, main/combat/stanceLedger.ts measures
// what each mob actually hits you with per stance, and shared/stanceAdvice.ts's `detectMismatch`
// turns those two into a claim — or, four times out of five, into a refusal. This file owns the
// one remaining question, and it is the hard one.
//
// ── WHY THIS NEEDS A THROTTLE UNLIKE ANY OTHER ALERT IN THE APP ─────────────────────────────
//
// Every shipped alert fires on a DISCRETE LOG LINE. A mez broke; a spell fizzled; a mote
// dropped. The line happens once, the alert fires once, and the cooldown in alertGroups.ts is
// only there to collapse a burst of near-duplicates.
//
// "You are in the wrong stance" is not an event. It is a STATE, and it is CONTINUOUSLY TRUE for
// as long as the fight lasts — from the moment the ledger reaches MIN_CONFIDENT_HITS until the
// player either switches stance or the mob dies. The natural place to evaluate it is the
// incoming-damage fold, which runs on EVERY landed hit: the reference window
// (tests/fixtures/w44-poison-slow-per-mob.log) takes 23,455 damage across ~700 incoming hits in
// under three minutes. An event per tick would be hundreds of identical alerts per pull. That is
// not a noisy feature, it is a feature the user turns off inside one fight — and a turned-off
// alert is worth less than no alert, because they believed they were covered.
//
// So the throttle is not a rate limit bolted on afterwards; it is the design:
//
//   ONE FIRE PER (target, recommended stance) PER ENGAGEMENT. `target` is the ledger's own row
//     identity (mob, zone, tier) — the same triple the measurement is scoped to, so a d0 pull
//     and a d2 pull of the same mob are separately advisable, which they must be (a d2 Cazic-
//     Thule is a different fight; stanceAdvice.ts's header has the numbers). The RECOMMENDED
//     stance is part of the key rather than a single "spoken" flag because a profile that shifts
//     mid-fight (the mob switches to casting) produces a genuinely DIFFERENT piece of advice,
//     and "switch to Mage Hunter now" is not the alert the player already heard. It is bounded:
//     at most one fire per stance in the loadout (≤ 9) per engagement, and the group's own
//     60-second cooldown collapses a flip-flop into one.
//
//   RE-ARM ON A STANCE CHANGE. `applyStance` is the single writer of the engine's stance, and it
//     calls `onStanceChange()`. The player ACTED on (or against) the advice, so every fire and
//     every refusal recorded under the old stance describes a character who no longer exists. If
//     the new stance is also wrong, saying so once more is the honest behaviour — and if it is
//     right, `detectMismatch` refuses on "already best" and nothing is said.
//
//   RE-ARM WHEN THE ENGAGEMENT ENDS, on two independent axes, because "the fight ended" has two
//     honest meanings here and only one of them is the encounter model's:
//       * the engine finalized the encounter (lifecycle.ts `finalizeCurrent` → `onEngagementEnd`)
//         — the death-close / linger / fallback rules already decide this for the meter and there
//         is no reason for this feature to hold a second opinion about when a pull ended;
//       * this TARGET stopped hitting you for ADVICE_REARM_IDLE_MS. The encounter is not always
//         the right unit: encounter.ts records that exactly one marathon charm-grind fight in the
//         owner's whole log ran to 5,259 instants, and inside a fight like that "the same mob is
//         on you again half an hour later" is a new engagement by any reading. The window reused
//         is FALLBACK_IDLE_MS — the engine's own number for "no attributed damage, this is over"
//         — rather than a new constant nobody has measured.
//
//   AND, UNDERNEATH BOTH, A RE-EVALUATION FLOOR. Refusals are the common case (too few hits, no
//     stance committed, already best, trivial gain) and a refusal is not remembered — it must be
//     re-decided as the ledger grows. Re-deciding on every tick would run `pooledProfile` +
//     `rankStances` hundreds of times a pull for a question whose answer changes on the timescale
//     of a fight, so a target is evaluated at most once per ADVICE_EVAL_INTERVAL_MS of LOG time.
//     Nothing is lost: the advice is still delivered within five seconds of becoming true.
//
// ── INERT DURING REPLAY, DELIBERATELY ───────────────────────────────────────────────────────
//
// The startup scan folds the whole log (1.4M lines) with live=false. This advisor evaluates
// NOTHING there and emits nothing. Two reasons: the alerts module drops non-live events anyway
// (a replayed fight from three hours ago is not actionable), and the startup fold is a measured
// budget — `npm run bench:replay` attributes it per consumer, and thousands of derived events
// drained through every listener would be a real cost paid for nothing. The LEDGER still accrues
// through the whole replay, so the first live hit is evaluated against a fully warm measurement.

import { FALLBACK_IDLE_MS } from './encounter'
import { detectMismatch, stanceMismatchEvent, type StanceMismatchEvent } from '../../shared/stanceAdvice'
import type { StanceLedger } from './stanceLedger'

/**
 * How much LOG time must pass before a target is re-evaluated. Five seconds is one GCD-ish beat:
 * short enough that advice arrives while it still matters, long enough that a 4-hits-per-second
 * pull runs the arithmetic ~20 times instead of ~700.
 */
export const ADVICE_EVAL_INTERVAL_MS = 5_000

/**
 * How long a target must go WITHOUT hitting you before the next hit counts as a new engagement.
 * FALLBACK_IDLE_MS is the engine's own "no attributed damage, close the fight" window; reusing it
 * means this feature cannot disagree with the meter about when a fight stopped happening.
 */
export const ADVICE_REARM_IDLE_MS = FALLBACK_IDLE_MS

/**
 * Max targets holding arming state at once. An arm is one small object per (mob, zone, tier)
 * being fought RIGHT NOW; the ledger's own measured bound is 59 rows for a whole session
 * (STANCE_TARGET_CAP's note), and everything here is cleared at the end of every engagement, so
 * 200 is a bound rather than a policy. Drop-oldest by last hit, like every other ring here.
 */
export const ADVICE_ARM_CAP = 200

/** What the engine has to be told to make this file useful. Both are PULLS, installed once. */
export interface StanceAdvisorDeps {
  /**
   * The stance keys this character can actually wear, read at the instant of the evaluation.
   * A pull rather than a stored list: the class loadout is INFERRED and re-derived whenever
   * evidence arrives (main/data/stanceLoadout.ts), so a copy taken at wiring time describes a
   * character we had not finished identifying. Deliberately widened while the combo is
   * unresolved — which is safe HERE for the same reason the read-only advisor panel says it is:
   * `rankStances` only ever recommends a stance the list contains, and over-offering costs a
   * recommendation the player may not be able to press, never a wrong one about the mob.
   */
  availableStances: () => readonly string[]
  /** Where the derived event goes — `bus.emitDerived` in the app, a collector in tests. */
  emit: (ev: StanceMismatchEvent, live: boolean) => void
}

/** One incoming landed hit, as the ingest fold hands it to the advisor. */
export interface StanceAdvisorHit {
  /** the ledger row this hit was folded into (`StanceLedger.note`'s return) */
  rowKey: string
  /** the stance worn AT THIS INSTANT, lowercase; '' when none has ever been committed */
  stanceKey: string
  ts: number
  /** the primary event's seq, stamped onto the derived event (the buffExpired contract) */
  seq: number
  /** false during the historical scan — the advisor is inert then (see the header) */
  live: boolean
}

/** Per-target arming state. Cleared wholesale on a stance change or the end of an engagement. */
interface Arm {
  /** newest hit from this target — drives the idle re-arm */
  lastHitTs: number
  /** when `detectMismatch` last ran for this target (0 = never) */
  lastEvalTs: number
  /** recommended stance keys already spoken for this target, this engagement */
  spoken: Set<string>
}

/**
 * The session's arming state. One per engine, owned by `EngineState`, written only by the
 * incoming branch of the ingest fold. Purely additive: it moves no damage total and, without
 * `install()`, it does nothing at all — which is exactly what every existing test and the
 * replay bench see.
 */
export class StanceAdvisor {
  private deps: StanceAdvisorDeps | null = null
  private arms = new Map<string, Arm>()

  /** Wire the loadout pull + the derived-event sink (pipeline.ts, once, at startup). */
  install(deps: StanceAdvisorDeps): void {
    this.deps = deps
  }

  /** Character switch / rescan. The deps survive (they are wiring, not character state). */
  reset(): void {
    this.arms.clear()
  }

  /**
   * The player committed a DIFFERENT stance (procRouting.ts `applyStance`, the one writer).
   *
   * Everything recorded is stale in both directions: a fire said "switch to X" about a stance
   * that is no longer worn, and a refusal ("already best") was a judgement about that same
   * stance. So the whole map goes, and the next hit from any target starts a fresh engagement's
   * worth of arming. A no-op re-assert of the same stance never reaches here — applyStance drops
   * it before touching state — so stance spam cannot re-arm anything.
   */
  onStanceChange(): void {
    this.arms.clear()
  }

  /** The engine finalized the encounter (lifecycle.ts). The next hit is a new engagement. */
  onEngagementEnd(): void {
    this.arms.clear()
  }

  /**
   * Fold one incoming hit: maybe evaluate, maybe emit. The whole throttle is here.
   *
   * Ordered cheapest-first, because this runs inside the damage fold: no deps → nothing; replay
   * → nothing; no stance committed → nothing (`detectMismatch` refuses on it anyway, and this
   * saves building the profile to be told so); inside the evaluation floor → nothing but a
   * timestamp write. The steady-state cost of an ongoing fight is one map lookup and a compare.
   */
  consider(ledger: StanceLedger, hit: StanceAdvisorHit): void {
    const deps = this.deps
    if (!deps || !hit.live || !hit.stanceKey) return
    const arm = this.armFor(hit)
    if (hit.ts - arm.lastEvalTs < ADVICE_EVAL_INTERVAL_MS) return
    arm.lastEvalTs = hit.ts
    const target = ledger.targetByKey(hit.rowKey)
    if (!target) return
    // EVERY REFUSAL IS RESPECTED AND NONE IS REMEMBERED. detectMismatch declines on low
    // confidence, no stance, already-best and a sub-MIN_GAIN improvement; the first of those
    // stops being true as the fight goes on, which is why a refusal only costs the next
    // evaluation slot rather than the engagement.
    const m = detectMismatch(target, deps.availableStances(), hit.stanceKey)
    if (!m) return
    if (arm.spoken.has(m.bestKey)) return
    arm.spoken.add(m.bestKey)
    deps.emit(stanceMismatchEvent(m, hit.seq, hit.ts), hit.live)
  }

  /**
   * This target's arm, minting a fresh one when the previous engagement with it has lapsed.
   *
   * A lapsed arm is REPLACED rather than mutated, which also zeroes `lastEvalTs` — so the first
   * hit of a new engagement is evaluated immediately instead of waiting out an interval that
   * started during the last one.
   */
  private armFor(hit: StanceAdvisorHit): Arm {
    const prev = this.arms.get(hit.rowKey)
    if (prev && hit.ts - prev.lastHitTs < ADVICE_REARM_IDLE_MS) {
      prev.lastHitTs = hit.ts
      return prev
    }
    const arm: Arm = { lastHitTs: hit.ts, lastEvalTs: 0, spoken: new Set() }
    if (!prev && this.arms.size >= ADVICE_ARM_CAP) this.dropOldest()
    this.arms.set(hit.rowKey, arm)
    return arm
  }

  /** Evict the target whose most recent hit is furthest in the past (StanceLedger's rule). */
  private dropOldest(): void {
    let oldestKey: string | undefined
    let oldestTs = Number.POSITIVE_INFINITY
    for (const [k, arm] of this.arms) {
      if (arm.lastHitTs < oldestTs) {
        oldestTs = arm.lastHitTs
        oldestKey = k
      }
    }
    if (oldestKey !== undefined) this.arms.delete(oldestKey)
  }
}
