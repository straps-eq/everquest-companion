// WHAT THE PANEL SAYS, decided here — the whole of the stance view's arithmetic-adjacent logic,
// in a plain module the node suite can run.
//
// ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────────────────────
//
// None of the MATHS lives here. `shared/stances.ts` owns the wiki's multipliers and the ranking,
// `shared/stanceAdvice.ts` owns the pooling, the confidence gate and the mismatch verdict, and
// this module is forbidden from re-deriving any of it — a second copy of "which stance wins"
// that disagrees with the one the alert fires on is the worst outcome this feature could have.
// What lives here is the SHAPING: joining a target to its advice, turning fractions into the
// words on screen, and — the part that actually needed a test — enumerating the CAVEATS.
//
// ── THE CAVEATS ARE THE FEATURE ─────────────────────────────────────────────────────────────
//
// The advice layer refuses in four different ways and each refusal is invisible in the ranking
// itself: a two-hit sample ranks exactly as confidently as a four-hundred-hit one, Evasive wins
// every ranking on a number the log cannot verify, and a profile built entirely inside Evasive
// reads as "no damage" rather than "nothing usable". So `caveatsFor` walks the advice and emits
// one plain sentence per real reservation, the view renders them ON the card rather than in a
// tooltip, and this file's test pins the exact conditions under which each one appears. That is
// world-model law 1 (anything inferred is LABELED inferred) applied to a surface whose entire
// content is inference.
//
// ── THE TIER LABEL, AND WHERE IT COMES FROM ─────────────────────────────────────────────────
//
// `TIER_LABELS` ('d0', 'd1 · Awakened', …) lives in `src/main/log/parseWorld.ts`, and the
// renderer bundle may not import from `src/main` (ZoneStrip.tsx's header states the same rule).
// The renderer's OWN copy of that table is `lib/tierChip.ts` — `TIER_STYLES[n].long` is
// 'D2 · Adaptive' where main's is 'd2 · Adaptive', the same five names with the app's chip
// casing — so the label is read from there rather than re-typed a third time here.

import { adviseFor, detectMismatch, MIN_CONFIDENT_HITS } from '../../../../shared/stanceAdvice'
import type { StanceAdvice, StanceAdvicePayload, StanceMismatch, StanceSample, TargetProfile } from '../../../../shared/stanceAdvice'
import { mitigationFor, STANCE_EFFECTS, unmitigate } from '../../../../shared/stances'
import type { DamageProfile } from '../../../../shared/stances'
import { tierStyle } from '../../lib/tierChip'

/** A fraction (0.617) as the panel prints it ('62%'). Rounded, never truncated. */
export function pct(fraction: number): string {
  return `${String(Math.round(fraction * 100))}%`
}

/**
 * The physical/magical split as two integers that ADD TO 100.
 *
 * Rounding each half independently prints "62% physical · 39% magical" often enough to look like
 * a bug, so the magical half is rounded and the physical half is whatever is left. `null` when
 * nothing usable was measured — a 50/50 default would be a fabricated profile (law 1).
 */
export function splitPct(magicalShare: number | null): { physical: number; magical: number } | null {
  if (magicalShare === null) return null
  const magical = Math.round(magicalShare * 100)
  return { physical: 100 - magical, magical }
}

/** How a stance key reads on screen. `''` is the ledger's real "nothing was committed" bucket. */
export function stanceLabel(stanceKey: string): string {
  if (stanceKey === '') return 'No stance committed'
  return STANCE_EFFECTS[stanceKey.toLowerCase()]?.name ?? stanceKey
}

/**
 * ONE RAW OBSERVATION, and the correction applied to it.
 *
 * This is the row behind the "show me the observations" expander, and it exists so the
 * un-mitigation is LEGIBLE rather than merely claimed: the sample says what the log printed
 * (physical/magical/hits as they landed), the multipliers say what was divided out, and
 * `unmitigated` is the result that went into the pool. A refused sample carries `null` and says
 * why — `unmitigate` returns null for an endurance-gated stance because a hit that got past a
 * 95% evade is full-sized, not 5%-sized.
 */
export interface SampleRow {
  stanceKey: string
  stanceLabel: string
  hits: number
  /** as observed, post-mitigation */
  observed: DamageProfile
  /** the multipliers divided out; 1/1 for the no-stance bucket */
  multiplier: DamageProfile
  /** what the mob swung for, or null when the sample was refused */
  unmitigated: DamageProfile | null
  /** true when this sample contributed NOTHING to the pooled profile */
  refused: boolean
}

/** Every sample the ledger holds for a target, un-mitigated the same way `pooledProfile` does. */
export function sampleRows(samples: readonly StanceSample[]): SampleRow[] {
  return samples.map((s) => {
    const observed = { physical: s.physical, magical: s.magical }
    const un = unmitigate(observed, s.stanceKey)
    return {
      stanceKey: s.stanceKey,
      stanceLabel: stanceLabel(s.stanceKey),
      hits: s.hits,
      observed,
      multiplier: mitigationFor(s.stanceKey),
      unmitigated: un,
      refused: un === null
    }
  })
}

/** Why a caveat is on screen. The kind is the stable handle; the text is what the user reads. */
export type CaveatKind =
  /** nothing usable was measured — every sample was refused, or there are none */
  | 'nothing'
  /** fewer than MIN_CONFIDENT_HITS pooled hits: reported, never recommended */
  | 'thin'
  /** the winning stance's reduction can fail for a reason the log cannot show */
  | 'gated'
  /** hits were dropped from the pool, and how many */
  | 'evaded'
  /** the loadout has no defensive stance to rank at all */
  | 'noStances'

export interface StanceCaveat {
  kind: CaveatKind
  text: string
}

/** The "thin sample" sentence — shared by the caveat and the card's headline chip. */
function thinText(hits: number): string {
  return (
    `Thin sample: ${String(hits)} pooled hit${hits === 1 ? '' : 's'}, under the ${String(MIN_CONFIDENT_HITS)} ` +
    'this needs to have an opinion. This is what the log has seen so far, not a recommendation.'
  )
}

/**
 * The endurance sentence, and the reason it is a whole sentence rather than a chip.
 *
 * Evasive's 0.05 is arithmetically dominant, so it wins essentially every ranking it appears in
 * — on a 95% evade that "will fail if you have insufficient endurance", and THE LOG NEVER PRINTS
 * ENDURANCE: not a pool, not a tick, not a failure. So the app cannot verify the number it just
 * put at the top of the list is sustainable for one more second, and it has to say so where the
 * ranking is, not behind a hover.
 */
function gatedText(name: string): string {
  return (
    `${name} tops this ranking on its 95% evade, which is ENDURANCE-GATED — the wiki says evasion ` +
    'fails when endurance runs out. The log never prints endurance, so this app cannot tell you ' +
    'whether you can hold it.'
  )
}

/** The dropped-hits sentence. `stances` names the refused buckets so it is checkable. */
function evadedText(hits: number, stances: readonly string[]): string {
  const worn = stances.length > 0 ? ` (worn: ${stances.join(', ')})` : ''
  return (
    `${String(hits)} hit${hits === 1 ? '' : 's'} left out of this profile${worn}: a hit that gets past a 95% ` +
    'evade is full-sized, not 5%-sized, so dividing it back out would invent a monster twenty ' +
    'times too big. Evasive samples measure nothing about how hard this mob hits.'
  )
}

/**
 * Every reservation this advice carries, in the order the card shows them.
 *
 * `refusedStances` comes from the sample rows rather than being re-derived, so the names in the
 * dropped-hits sentence are the same buckets the observations table shows as refused.
 */
export function caveatsFor(advice: StanceAdvice, refusedStances: readonly string[]): StanceCaveat[] {
  const out: StanceCaveat[] = []
  if (advice.hits === 0) {
    out.push({
      kind: 'nothing',
      text:
        'Nothing usable measured yet. Every hit this mob has landed on you arrived while an ' +
        'endurance-gated stance was worn, so none of them says how hard it hits.'
    })
  } else if (!advice.confident) {
    out.push({ kind: 'thin', text: thinText(advice.hits) })
  }
  const best = advice.ranked[0]
  if (best?.effect.enduranceGated) out.push({ kind: 'gated', text: gatedText(best.effect.name) })
  if (advice.evadedHitsIgnored > 0) {
    out.push({ kind: 'evaded', text: evadedText(advice.evadedHitsIgnored, refusedStances) })
  }
  if (advice.hits > 0 && advice.ranked.length === 0) {
    out.push({
      kind: 'noStances',
      text:
        'This class loadout has no defensive stance to rank — the offensive stances say nothing ' +
        'about incoming damage, so they are left out rather than ranked last.'
    })
  }
  return out
}

/** One stance in the ranking, with everything the row needs already decided. */
export interface RankedRow {
  key: string
  name: string
  /** expected damage taken as a share of the un-mitigated total (0.62) */
  fraction: number
  /** that share, printed ('62%') */
  percent: string
  /** expected damage taken, in points, over the pooled profile */
  expected: number
  /** first in the ranking */
  best: boolean
  /** the stance currently worn */
  current: boolean
  enduranceGated: boolean
  free: boolean
}

function rankedRows(advice: StanceAdvice, currentKey: string | null): RankedRow[] {
  const cur = currentKey?.toLowerCase() ?? null
  return advice.ranked.map((r, i) => ({
    key: r.effect.key,
    name: r.effect.name,
    fraction: r.fraction,
    percent: pct(r.fraction),
    expected: r.expected,
    best: i === 0,
    current: r.effect.key === cur,
    enduranceGated: r.effect.enduranceGated,
    free: r.effect.free
  }))
}

/** Everything one card renders. Built once per payload; the card component decides nothing. */
export interface StanceTargetRow {
  /** (mob, zone, tier) — the same composite the ledger keys its rows on */
  key: string
  mobName: string
  zoneBase: string
  tier: number
  /** 'D2 · Adaptive' (lib/tierChip — main's TIER_LABELS is not importable here) */
  tierLabel: string
  lastSeenTs: number
  /** the single biggest landed hit, AS OBSERVED — never un-mitigated */
  biggestHit: number
  advice: StanceAdvice
  ranked: RankedRow[]
  samples: SampleRow[]
  /** the split of the un-mitigated profile, as two integers summing to 100; null if unmeasured */
  split: { physical: number; magical: number } | null
  /** how many samples actually reached the pool — "corrected across N stances you wore" */
  usedSamples: number
  mismatch: StanceMismatch | null
  caveats: StanceCaveat[]
  /** the stance worn right now IS one this mob was measured in */
  currentStanceKey: string | null
}

/**
 * Join one target to its advice and its verdict.
 *
 * Both come from the shared layer and neither is recomputed: `adviseFor` pools + ranks, and
 * `detectMismatch` decides whether the "you are in the wrong stance" callout appears at all (it
 * refuses on a thin sample, on no committed stance, on already-best, and on a trivial gain).
 * A card that decided that for itself would disagree with the alert sooner or later.
 */
export function buildStanceRow(target: TargetProfile, payload: StanceAdvicePayload): StanceTargetRow {
  const advice = adviseFor(target, payload.availableStances)
  const samples = sampleRows(target.samples)
  return {
    key: `${target.mobKey}|${target.zoneBase}|${String(target.tier)}`,
    mobName: target.mobName,
    zoneBase: target.zoneBase,
    tier: target.tier,
    tierLabel: tierStyle(target.tier).long,
    lastSeenTs: target.lastSeenTs,
    biggestHit: target.biggestHit,
    advice,
    ranked: rankedRows(advice, payload.currentStance),
    samples,
    split: splitPct(advice.magicalShare),
    usedSamples: samples.filter((s) => !s.refused && s.hits > 0).length,
    mismatch: detectMismatch(target, payload.availableStances, payload.currentStance),
    caveats: caveatsFor(
      advice,
      samples.filter((s) => s.refused).map((s) => s.stanceLabel)
    ),
    currentStanceKey: payload.currentStance
  }
}

/** Every target, most-recently-hit first. The engine already sorts; this makes it independent. */
export function buildStanceRows(payload: StanceAdvicePayload): StanceTargetRow[] {
  return payload.targets
    .map((t) => buildStanceRow(t, payload))
    .sort((a, b) => b.lastSeenTs - a.lastSeenTs)
}

/**
 * The wrong-stance callout, in one sentence.
 *
 * It names both fractions rather than only the gain, because "switch, you would take 12% less"
 * is unactionable without knowing whether that is 95%→83% or 20%→8%. `gain` is the shared
 * layer's own number (already past MIN_GAIN) and is not recomputed.
 */
export function mismatchLine(m: StanceMismatch): string {
  const current = STANCE_EFFECTS[m.currentKey]?.name ?? m.currentKey
  const best = STANCE_EFFECTS[m.bestKey]?.name ?? m.bestKey
  return (
    `You are in ${current}: against ${m.target.mobName} that takes ${pct(m.currentFraction)} of what it ` +
    `swings for. ${best} would take ${pct(m.bestFraction)} — ${pct(m.gain)} of its damage, gone.`
  )
}

/** How many of the visible targets are in the wrong stance right now — the view's headline. */
export function mismatchCount(rows: readonly StanceTargetRow[]): number {
  return rows.filter((r) => r.mismatch !== null).length
}
