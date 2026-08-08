// FROM MEASURED HITS TO A STANCE — the pooling layer, and the wire shape the engine fills in.
//
// stances.ts owns what a stance DOES (the wiki's multipliers). This owns what to do with a pile
// of observations: pool them into one un-biased profile for a target, rank the stances the
// character can actually wear, and decide whether the answer is worth saying out loud.
//
// ── THE TARGET IS (MOB, ZONE, TIER), NOT (MOB) ──────────────────────────────────────────────
//
// EQ Legends encodes instance difficulty in the zone name — `The Plane of Fear - Solo 2
// (Adaptive)` is d2 — and `zoneTier()` already decodes it for every consumer of a zone event. A
// d0 Cazic-Thule and a d2 Cazic-Thule are not the same fight and must not pool: on the real log
// they disagree so hard about which stance wins that pooling them would average a real answer
// into a wrong one.
//
// ── CONFIDENCE IS A GATE, NOT A DECORATION ──────────────────────────────────────────────────
//
// Two hits are not a damage profile. Below MIN_CONFIDENT_HITS the advice still renders — the
// user asked what the log says and the answer is "not much yet" — but `confident` is false and
// nothing downstream may ALERT on it. The wrong-stance alert firing off four hits would train
// the user to ignore it, which is worse than not shipping it.

import {
  type DamageProfile,
  type RankedStance,
  STANCE_EFFECTS,
  bestEmergency,
  bestSustained,
  magicalShare,
  rankStances,
  unmitigate
} from './stances'
// TYPE-ONLY, and deliberately so: `StanceMismatchEvent` below extends the shared event base, and
// logEvents.ts imports THAT type back for its union. `import type` is erased at compile time, so
// the pair is a type-level cycle and never a runtime one — the same construction alertGroups.ts
// and alertGroupsRefused.ts use, for the same reason.
import type { LogEventBase } from './logEvents'

/** Landed damage against you from one target, while wearing one stance. */
export interface StanceSample {
  /** lowercase stance key; '' when no stance was ever committed in this span */
  stanceKey: string
  /** observed (post-mitigation) physical damage taken */
  physical: number
  /** observed (post-mitigation) magical damage taken */
  magical: number
  /** landed hits behind those amounts */
  hits: number
}

/** Everything measured about one (mob, zone, tier) target. The engine's ledger row. */
export interface TargetProfile {
  /** `idKey`'d mob name — the case-stable join key */
  mobKey: string
  /** display name, first spelling seen */
  mobName: string
  /** zone with the tier suffix stripped (`zoneTier().base`) */
  zoneBase: string
  /** 0..4, `zoneTier().tier` */
  tier: number
  samples: StanceSample[]
  /** epoch ms of the most recent hit — "is this still current" */
  lastSeenTs: number
  /** the single biggest landed hit, as observed (NOT un-mitigated) */
  biggestHit: number
}

/** Below this many pooled hits the profile is reported but never alerted on. */
export const MIN_CONFIDENT_HITS = 40

export interface StanceAdvice {
  /** un-mitigated, pooled over every usable sample */
  profile: DamageProfile
  /** hits behind `profile` (evasive samples excluded — see `unmitigate`) */
  hits: number
  /** 0..1 magical share of the un-mitigated profile; null when nothing usable was measured */
  magicalShare: number | null
  /** best-first by expected damage alone; empty when the loadout has no defensive stance */
  ranked: RankedStance[]
  /**
   * The best stance that can be HELD — `ranked` minus anything whose reduction can fail. This,
   * not `ranked[0]`, is the recommendation: Evasive wins the raw arithmetic almost everywhere
   * and is survive-mode rather than a standing choice (see `bestSustained`).
   */
  sustained: RankedStance | null
  /** The best endurance-gated option, offered separately as an escape hatch. Usually Evasive. */
  emergency: RankedStance | null
  /** hits >= MIN_CONFIDENT_HITS */
  confident: boolean
  /** hits dropped because they were taken in an endurance-gated stance */
  evadedHitsIgnored: number
}

/**
 * Pool a target's samples into ONE un-mitigated profile.
 *
 * Each sample is divided by the multipliers of the stance it was taken in, which is what makes
 * the result comparable across stances at all — see `unmitigate`. Evasive samples are dropped
 * whole rather than un-mitigated (a hit that got past a 95% evade is full-sized, not 5%-sized),
 * and the count of what was dropped is reported so a profile built entirely inside Evasive
 * reads as "nothing usable" instead of silently as "no damage".
 */
export function pooledProfile(samples: readonly StanceSample[]): {
  profile: DamageProfile
  hits: number
  evadedHitsIgnored: number
} {
  let physical = 0
  let magical = 0
  let hits = 0
  let evadedHitsIgnored = 0
  for (const s of samples) {
    const un = unmitigate({ physical: s.physical, magical: s.magical }, s.stanceKey)
    if (un === null) {
      evadedHitsIgnored += s.hits
      continue
    }
    physical += un.physical
    magical += un.magical
    hits += s.hits
  }
  return { profile: { physical, magical }, hits, evadedHitsIgnored }
}

/** Pool, rank, and gate. `availableKeys` is the stances the character's classes can wear. */
export function adviseFor(target: TargetProfile, availableKeys: readonly string[]): StanceAdvice {
  const { profile, hits, evadedHitsIgnored } = pooledProfile(target.samples)
  const ranked = hits > 0 ? rankStances(profile, availableKeys) : []
  return {
    profile,
    hits,
    magicalShare: magicalShare(profile),
    ranked,
    sustained: bestSustained(ranked),
    emergency: bestEmergency(ranked),
    confident: hits >= MIN_CONFIDENT_HITS,
    evadedHitsIgnored
  }
}

/**
 * THE DERIVED SIGNAL behind the wrong-stance alert.
 *
 * `alertGroupsRefused.ts` set the rule this follows: "Pet died" was refused because an AlertDef
 * "matches text, not entities" and the binding it needed "needs a derived event before it can
 * ship". A suboptimal stance is the same kind of claim — nothing in the log says it, it is a
 * join over the mob's measured profile, the wiki's multipliers and the stance currently worn —
 * so the engine decides it here and the alert binds to the RESULT.
 *
 * It refuses in four situations, and each refusal is the difference between a useful alert and
 * one the user turns off:
 *   * not confident yet — too few hits to have an opinion;
 *   * no stance committed — nothing to be wrong about, and the log may simply predate the first
 *     commit of the session;
 *   * already in the best stance;
 *   * the gain is trivial (`MIN_GAIN`) — being told to switch for a 2% improvement, mid-fight,
 *     at an endurance cost this model cannot see, is bad advice even when the arithmetic is right.
 */
export const MIN_GAIN = 0.1

export interface StanceMismatch {
  target: TargetProfile
  advice: StanceAdvice
  currentKey: string
  /** the stance that would take less damage */
  bestKey: string
  /** fraction of unmitigated damage taken now vs under `bestKey` (0.68 vs 0.62) */
  currentFraction: number
  bestFraction: number
  /** currentFraction - bestFraction, always >= MIN_GAIN */
  gain: number
}

/**
 * THE WIRE SHAPE — what `IPC.getStanceAdvice` ('combat:stanceAdvice') answers with.
 *
 * All three fields in ONE payload because all three are inputs to the SAME arithmetic and must
 * describe one instant: `adviseFor(target, availableStances)` and
 * `detectMismatch(target, availableStances, currentStance)` each take two of them, and a
 * ranking built from targets read at t against a loadout read at t+1 describes a character who
 * existed at neither. It is the same argument the group roster rides the combat snapshot on.
 *
 * Everything here is DERIVED, and each field carries its own honesty:
 *   * `targets` are measurements — what the log printed, un-corrected (the un-mitigation happens
 *     in `pooledProfile`, on the way to advice, never in the ledger).
 *   * `currentStance` is null when the log has never printed a stance commit this session. That
 *     is not "no stance"; it is "we were not told", and `detectMismatch` refuses on it rather
 *     than assuming Balanced.
 *   * `availableStances` comes from the INFERRED class combo, so it deliberately over-offers
 *     while the loadout is unresolved (main/data/stanceLoadout.ts has the reasoning). A surface
 *     that presents it as fact is misreading it — label it with the combo's own confidence.
 */
export interface StanceAdvicePayload {
  /** every (mob, zone, tier) that has hit you this session, most-recently-hit first */
  targets: TargetProfile[]
  /** lowercase stance key currently worn, or null when none was ever committed */
  currentStance: string | null
  /**
   * lowercase stance keys the class loadout can wear, sorted. An UNRESOLVED combo widens this
   * (every candidate class contributes its stances); it is empty only when the combo module has
   * produced no interval at all, i.e. nothing has been observed yet.
   */
  availableStances: string[]
}

export function detectMismatch(
  target: TargetProfile,
  availableKeys: readonly string[],
  currentKey: string | null
): StanceMismatch | null {
  if (!currentKey) return null
  const advice = adviseFor(target, availableKeys)
  if (!advice.confident) return null
  // AGAINST THE SUSTAINED PICK, never `ranked[0]`. Evasive wins the raw arithmetic against
  // almost every mob, so alerting on the ranking would have told the player to pop survive-mode
  // in every fight he has — advice he would correctly stop listening to. An alert that fires
  // wrongly is worse than no alert (the standing argument in alertGroupsRefused.ts).
  const best = advice.sustained
  if (!best) return null
  const cur = STANCE_EFFECTS[currentKey.toLowerCase()]
  if (!cur || best.effect.key === cur.key) return null
  const total = advice.profile.physical + advice.profile.magical
  if (total <= 0) return null
  // An offensive stance has no entry in `ranked`, so its fraction is computed directly: wearing
  // Striker against a mob that is hitting you IS the mismatch this alert exists to catch.
  const currentFraction = (advice.profile.physical * cur.physical + advice.profile.magical * cur.magical) / total
  const gain = currentFraction - best.fraction
  // EPSILON, and it is not pedantry. A Monk's only holdable option is Balanced at 0.9, so
  // standing in an offensive stance is a gain of exactly MIN_GAIN — except `1 - 0.9` is
  // 0.09999999999999998 in IEEE-754, which is `< 0.1`, so the single most common mismatch a
  // Monk can have would never once have fired. The threshold means "at least a tenth"; a
  // difference that exists only in the last bit of a double is not the case it excludes.
  if (gain < MIN_GAIN - 1e-9) return null
  return {
    target,
    advice,
    currentKey: cur.key,
    bestKey: best.effect.key,
    currentFraction,
    bestFraction: best.fraction,
    gain
  }
}

// ── THE DERIVED EVENT ───────────────────────────────────────────────────────────────────────
//
// WHY THE EVENT LIVES HERE AND NOT IN logEvents.ts. Two reasons, and the second is the honest
// one. (1) This is where the claim is DECIDED — `detectMismatch` above produces the only thing
// that can populate it, and a shape that can only be built by one function belongs beside that
// function. (2) logEvents.ts stands at 392 of the 400-code-line factoring ceiling, so the
// alternative was to grow the file past a limit the repo enforces rather than exempt. The union
// in logEvents.ts imports the type back; both directions are `import type`, so nothing about the
// module graph changes at runtime.
//
// WHY THERE IS AN EVENT AT ALL — alertGroupsRefused.ts wrote the rule down for "Pet died": an
// AlertDef "matches text, not entities … needs a derived event before it can ship". A suboptimal
// stance is exactly that shape and worse: the log never prints one sentence about it. It is a
// JOIN over the mob's measured damage profile, the wiki's multipliers and the stance worn right
// now, so the ENGINE decides it (main/combat/stanceAdvisor.ts owns WHEN) and the alert binds to
// the result. No regex over any log line could ever express it.

/**
 * "You are in a materially worse stance than the measurement supports, against THIS mob."
 *
 * Synthesized by the combat engine, handed to the bus through `emitDerived` (the same path
 * `buffExpired`, `epoch` and `offlineGap` take), matched by the alerts module like any other
 * event. Every field is DERIVED — nothing here was printed by the game, which is why `raw` says
 * so out loud (see `stanceMismatchEvent`).
 */
export interface StanceMismatchEvent extends LogEventBase {
  kind: 'stanceMismatch'
  /** The mob whose measured profile produced this, display spelling. Also the alert's `target`
   *  field, so `cooldownScope:'target'` scopes a clock per mob without extra machinery. */
  target: string
  /** Zone base name (tier suffix stripped), or '' when nothing has printed a zone line yet. */
  zone: string
  /** Instance difficulty, 0..4 — a d0 Cazic-Thule is not a d2 one and they never pooled. */
  tier: number
  /** Lowercase key of the stance worn at this instant. Never '' — a mismatch needs a stance. */
  stance: string
  /** Lowercase key of the stance the measurement recommends instead. */
  best: string
  /**
   * Whole percent LESS damage `best` would take than `stance`, RELATIVE to what is being taken
   * now — the number a human means by "38% less". `MIN_GAIN` gates the ABSOLUTE difference
   * between the two fractions, which is a different (and always smaller) quantity; both come
   * from the same two numbers, and this is the one the sentence states.
   */
  lessPct: number
  /** Pooled landed hits behind the claim. Never below MIN_CONFIDENT_HITS — detectMismatch's gate. */
  hits: number
}

/** Display name for a stance key ('mage hunter' → 'Mage Hunter'), or the key when unknown. */
function stanceName(key: string): string {
  return STANCE_EFFECTS[key]?.name ?? key
}

/**
 * THE SENTENCE, and it is the alert's whole user-facing copy: `raw` is what the recent-fires
 * panel and the event feed show. (No speech mode reads it — shared/speechText.ts only ever
 * speaks the alert's name, a spell name or a custom phrase — so length here buys honesty at no
 * cost to the ears.)
 *
 * Four rules it follows:
 *   * NAME THE THING. The mob, the stance to switch to, the stance worn, the measured gain and
 *     the sample size behind it. "You might want a different stance" is not worth interrupting
 *     a fight for; "Cazic-Thule: Defensive would take 38% less than Mage Hunter" is.
 *   * SAY WHERE. The measurement is scoped to (mob, zone, tier) and the tier is part of that
 *     identity, so a d2 claim never reads as a claim about the d0 fight. The zone clause is
 *     dropped entirely when the ledger's row has no zone (a session that began mid-zone) rather
 *     than printed as an empty one — an absent fact, stated as absent.
 *   * CARRY THE ASTERISK THE MATHS CANNOT. `stances.ts` says it outright: Evasive's 0.05 is
 *     "arithmetically dominant and practically unverified … any surface that ranks it first has
 *     to say so", because the game charges endurance for every point evaded and THE LOG NEVER
 *     PRINTS ENDURANCE. So when the winner is endurance-gated the sentence says so. This is not
 *     a second opinion about the ranking — `detectMismatch` decided it and this states exactly
 *     what it decided — it is the flag `StanceEffect.enduranceGated` exists to be surfaced by.
 *   * NEVER IMPERSONATE THE GAME. Every other alert in the app quotes a sentence EQ printed.
 *     This one cannot, so it says whose opinion it is (world-model law 1: anything inferred is
 *     labeled). A user who reads this must not go looking for the line in their log.
 */
export function stanceMismatchLine(ev: Omit<StanceMismatchEvent, 'kind' | 'seq' | 'ts' | 'raw'>): string {
  const where = ev.zone ? ` in ${ev.zone}${ev.tier > 0 ? ` d${ev.tier}` : ''}` : ''
  const best = stanceName(ev.best)
  const gated = STANCE_EFFECTS[ev.best]?.enduranceGated
    ? ` ${best} can fail outright when endurance runs out, and the log never shows endurance.`
    : ''
  return (
    `Stance advice — ${ev.target}${where}: ${best} would take ${ev.lessPct}% less than ` +
    `${stanceName(ev.stance)}, measured over ${ev.hits} landed hits this session.${gated} ` +
    `Derived by this app from your own damage taken — the game never says this.`
  )
}

/**
 * Build the derived event from a mismatch the engine just decided.
 *
 * The ONLY constructor, so the wire fields and the sentence can never disagree: `lessPct` is
 * computed once and the line is rendered from the same object that goes on the bus. `seq`/`ts`
 * are the PRIMARY event's — the incoming hit that triggered the evaluation — exactly as the
 * buffs module stamps `buffExpired`, so the derived event slots into the stream coherently.
 */
export function stanceMismatchEvent(m: StanceMismatch, seq: number, ts: number): StanceMismatchEvent {
  const fields = {
    target: m.target.mobName,
    zone: m.target.zoneBase,
    tier: m.target.tier,
    stance: m.currentKey,
    best: m.bestKey,
    // Relative to what you take NOW, not to the un-mitigated total: currentFraction is > 0 for
    // every stance in the table (the smallest multiplier in the game is Evasive's 0.05).
    lessPct: Math.round((m.gain / m.currentFraction) * 100),
    hits: m.advice.hits
  }
  return { kind: 'stanceMismatch', seq, ts, raw: stanceMismatchLine(fields), ...fields }
}
