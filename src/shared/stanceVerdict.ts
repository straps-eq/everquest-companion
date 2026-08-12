// THE TWO ANSWERS FOR ONE MOB, IN PLAIN WORDS — "you are in X; if you switched to Y it would
// save you Z", and the same sentence for damage.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────
//
// The owner's report was not that the numbers were wrong. It was that the tab is CONFUSING:
// "It should be clear — you are in X, if you switched to Y it would save you." The pieces of that
// sentence were all on screen and none of them was the sentence. `calloutFor` said "Wear
// Defensive — you take 59% of the full hit", which is a statement about Defensive and says nothing
// about what you are wearing now; the comparison only appeared inside the MISMATCH callout, and
// `detectMismatch` refuses in four separate cases (thin sample, no stance committed, already best,
// gain under 10%). So in the common case the user saw a recommendation with no baseline, and in
// the "you are already right" case he saw nothing at all telling him so.
//
// This module computes the COMPARISON unconditionally, including every case where the honest
// answer is a refusal, and phrases it. Nothing here re-derives arithmetic: `adviseFor` pools and
// ranks the incoming side, `rankOffense` the outgoing one, and both are imported. What is added is
// the pairing (worn vs best) and the words.
//
// ── AND WHY BOTH SURFACES READ IT ───────────────────────────────────────────────────────────
//
// The Stances tab and the new stance OVERLAY answer the same question in very different amounts of
// space, and the one thing that must never differ between them is WHICH STANCE THEY NAME. Two
// copies of "is the worn stance the best one" is exactly how a floating meter ends up contradicting
// the tab behind it. So the verdicts are computed here and each surface only decides how much of
// the text it has room for. The precedent is `stanceMismatchLine`, which likewise lives in shared
// beside the decision it states.
//
// ── THE SUSTAIN / DPS PAIRING IS THE POINT ──────────────────────────────────────────────────
//
// The owner's second ask — "what stance will help for sustain and what will help for dps for each
// mob" — is not two independent questions, and presenting them as two independent answers would be
// the same mistake in a new place: Offensive doubles your melee AND drops every mitigation you
// had. So `MobVerdict` carries both, and the DPS verdict states its own COST in the same breath
// (`costLine`), measured off the incoming profile rather than asserted.

import { adviseFor, MIN_CONFIDENT_HITS } from './stanceAdvice'
import type { StanceAdvice, TargetProfile } from './stanceAdvice'
import { STANCE_EFFECTS } from './stances'
import type { RankedStance } from './stances'
import {
  OFFENSE_UNKNOWN,
  meleeShare,
  offenseUnknown,
  outgoingFor,
  rankOffense,
  unknownOffense,
  unscaleOutgoing
} from './stanceOffense'
import type { OffenseProfile, OffenseSample, OutgoingProfile, RankedOffense } from './stanceOffense'

/** Display name for a stance key, or the key itself when the table has never heard of it. */
export function stanceName(key: string): string {
  return STANCE_EFFECTS[key.toLowerCase()]?.name ?? key
}

/** A fraction as a whole percent ('59%'). */
function pct(fraction: number): string {
  return `${String(Math.round(fraction * 100))}%`
}

/** A multiple as a signed percentage change ('+80%'). 1.8 → '+80%', 0.5 → '-50%'. */
function plusPct(multiple: number): string {
  const delta = Math.round((multiple - 1) * 100)
  return `${delta >= 0 ? '+' : ''}${String(delta)}%`
}

// ── POOLING THE OUTGOING SAMPLES ────────────────────────────────────────────────────────────

/**
 * Pool one target's outgoing samples into ONE un-scaled profile — the mirror of `pooledProfile`.
 *
 * Each sample is divided by the multipliers of the stance it was dealt in, which is what makes
 * damage measured in Offensive comparable with damage measured in Defensive at all. Samples dealt
 * in a stance whose effect is UNMEASURED (Striker, Berserker, Ranged) are dropped whole rather
 * than un-scaled, and the count is reported: dividing by a multiplier nobody has measured would
 * be an invention, and a profile built entirely inside Striker must read "nothing usable" rather
 * than silently as "no damage".
 */
export function pooledOutgoing(samples: readonly OffenseSample[]): {
  profile: OutgoingProfile
  hits: number
  refusedHits: number
} {
  let melee = 0
  let spell = 0
  let hits = 0
  let refusedHits = 0
  for (const s of samples) {
    const un = unscaleOutgoing({ melee: s.melee, spell: s.spell }, s.stanceKey)
    if (un === null) {
      refusedHits += s.hits
      continue
    }
    melee += un.melee
    spell += un.spell
    hits += s.hits
  }
  return { profile: { melee, spell }, hits, refusedHits }
}

// ── THE SUSTAIN VERDICT ─────────────────────────────────────────────────────────────────────

/**
 * Why a sustain comparison could not be made, or 'ok' when it could.
 *   'noMeasurement' — nothing usable measured (every hit landed while you were in Evasive, or the
 *                     mob has never hit you).
 *   'thin'          — measured, but under MIN_CONFIDENT_HITS. The comparison is still SHOWN (the
 *                     user asked what the log says) and simply labelled as early.
 *   'unknownWorn'   — the log has printed no stance commit this session, so there is no baseline
 *                     to compare against. NOT an assumption of Balanced.
 *   'noneHoldable'  — every defensive stance the loadout can wear here can fail on empty endurance.
 */
export type VerdictBlock = 'ok' | 'noMeasurement' | 'thin' | 'unknownWorn' | 'noneHoldable'

export interface SustainVerdict {
  /** the stance worn now, display name; null when the log never said */
  worn: string | null
  /** fraction of the full hit you take in the worn stance; null when unknown/unmeasured */
  wornFraction: number | null
  /** the best stance you can HOLD (never the endurance-gated one), display name */
  best: string | null
  bestFraction: number | null
  /** true when `worn` IS `best` — "stay put" */
  alreadyBest: boolean
  /**
   * How much of the mob's damage switching would remove, as a fraction of what you take NOW.
   * The number a human means by "it would save you 20%". Null unless both sides are known.
   */
  saves: number | null
  /** 'ok' when a real comparison is on offer; otherwise why not. `thin` still carries numbers. */
  block: VerdictBlock
  /** the whole verdict as one sentence — the tab's headline and the overlay's line */
  line: string
  /** the advice this was computed from, so a surface can show the ranking without re-pooling */
  advice: StanceAdvice
}

/** The fraction of the full hit taken in one stance, or null for an unknown key. */
function fractionIn(advice: StanceAdvice, stanceKey: string | null): number | null {
  if (!stanceKey) return null
  const e = STANCE_EFFECTS[stanceKey.toLowerCase()]
  if (!e) return null
  const total = advice.profile.physical + advice.profile.magical
  if (total <= 0) return null
  return (advice.profile.physical * e.physical + advice.profile.magical * e.magical) / total
}

/**
 * "You are in X; switching to Y would save you Z" for the incoming half — stated in every case,
 * including the four where the answer is that it cannot be stated.
 *
 * The BEST is `advice.sustained` and never `ranked[0]`: Evasive wins the raw arithmetic against
 * almost everything on a 95% evade the log can never verify (it costs 2 endurance per point and
 * fails outright when endurance runs out), so it is survive-mode and is offered elsewhere.
 */
export function sustainVerdict(
  target: TargetProfile | undefined,
  availableKeys: readonly string[],
  currentKey: string | null
): SustainVerdict {
  const advice = adviseFor(target ?? emptyTarget(), availableKeys)
  const best = advice.sustained
  const wornFraction = fractionIn(advice, currentKey)
  // The shared half of every branch below. Assembled once so a refusal and an answer can never
  // disagree about what is worn or what the ranking said.
  const base = {
    worn: currentKey ? stanceName(currentKey) : null,
    wornFraction,
    best: best ? best.effect.name : null,
    bestFraction: best ? best.fraction : null,
    advice
  }
  // ONE BRANCH PER CASE, each in its own builder. The four refusals are not edge cases to be
  // squeezed into a ternary — they are most of what this function says on a fresh session.
  if (advice.hits === 0) return sustainNothing(base, target)
  if (!best) return sustainNoneHoldable(base, advice)
  if (wornFraction === null) return sustainUnknownWorn(base, best)
  return sustainComparison(base, { advice, best, wornFraction, currentKey })
}

/** The shared fields every sustain branch fills in identically. */
type SustainBase = Pick<SustainVerdict, 'worn' | 'wornFraction' | 'best' | 'bestFraction' | 'advice'>

/** Nothing usable measured — either the mob has never hit you, or every hit landed in Evasive. */
function sustainNothing(base: SustainBase, target: TargetProfile | undefined): SustainVerdict {
  return {
    ...base,
    alreadyBest: false,
    saves: null,
    block: 'noMeasurement',
    line: target
      ? `Nothing usable measured yet against ${target.mobName} — every hit it landed came while you were in Evasive, which says nothing about how hard it hits.`
      : 'This one has never hit you, so there is nothing to compare.'
  }
}

/** There is no stance to hold: either nothing defensive to rank, or everything can fail. */
function sustainNoneHoldable(base: SustainBase, advice: StanceAdvice): SustainVerdict {
  return {
    ...base,
    alreadyBest: false,
    saves: null,
    block: 'noneHoldable',
    line:
      advice.ranked.length === 0
        ? 'Your classes have no defensive stance to rank here, so there is nothing to switch to.'
        : 'Every defensive stance you can wear here can fail when endurance runs out, so there is none you can just stay in.'
  }
}

/** No stance commit this session, so there is no baseline — and Balanced is NOT assumed. */
function sustainUnknownWorn(base: SustainBase, best: RankedStance): SustainVerdict {
  return {
    ...base,
    alreadyBest: false,
    saves: null,
    block: 'unknownWorn',
    line: `The log has not said which stance you are in this session, so there is nothing to compare. ${best.effect.name} is the best you could hold here — it takes ${pct(best.fraction)} of the full hit.`
  }
}

/** THE SENTENCE THE REPORT ASKED FOR: worn, better, and the difference between them. */
function sustainComparison(
  base: SustainBase,
  m: { advice: StanceAdvice; best: RankedStance; wornFraction: number; currentKey: string | null }
): SustainVerdict {
  const { advice, best, wornFraction } = m
  const alreadyBest = best.effect.key === m.currentKey?.toLowerCase()
  const saves = wornFraction > 0 ? (wornFraction - best.fraction) / wornFraction : null
  const early = advice.confident
    ? ''
    : ` Early days — only ${String(advice.hits)} hit${advice.hits === 1 ? '' : 's'} measured of the ${String(MIN_CONFIDENT_HITS)} this needs.`
  return {
    ...base,
    alreadyBest,
    saves,
    block: advice.confident ? 'ok' : 'thin',
    line: alreadyBest
      ? `You are in ${String(base.worn)}, and that is the best stance you can hold here: you take ${pct(wornFraction)} of what it swings for.${early}`
      : `You are in ${String(base.worn)} and take ${pct(wornFraction)} of what it swings for. ${best.effect.name} would take ${pct(best.fraction)} — that is ${pct(saves ?? 0)} of its damage gone.${early}`
  }
}

/** A target with nothing measured — so `sustainVerdict` can answer for a mob that only ever
 *  appears in the OFFENSE ledger (you killed it without being touched). */
function emptyTarget(): TargetProfile {
  return { mobKey: '', mobName: '', zoneBase: '', tier: 0, samples: [], lastSeenTs: 0, biggestHit: 0 }
}

// ── THE DPS VERDICT ─────────────────────────────────────────────────────────────────────────

export interface DpsVerdict {
  /** the stance worn now, display name; null when the log never said */
  worn: string | null
  /** the best-damage stance that has actually been MEASURED, display name */
  best: string | null
  /** what `best` would multiply your damage by, against the stance worn now (1.8 = +80%) */
  gain: number | null
  /** true when the worn stance already IS the best measured one */
  alreadyBest: boolean
  /** share of your damage to this mob that is melee, 0..1 — the whole reason the answer is
   *  per-mob. Null when nothing usable was measured. */
  meleeShare: number | null
  /** hits behind the profile, and the ones dropped for having been dealt in an unmeasured stance */
  hits: number
  refusedHits: number
  block: VerdictBlock
  line: string
  /**
   * WHAT THE DPS PICK COSTS, in the same breath. Null when the incoming side cannot price it —
   * never omitted silently when it can, because "switch to Offensive" without "and take twice the
   * damage" is the half-truth this pairing exists to prevent.
   */
  costLine: string | null
  /** loadout stances whose effect on your damage this app has NOT established, with the reason */
  unknown: { key: string; name: string; why: string }[]
  ranked: RankedOffense[]
}

/**
 * "Offensive would deal +80% against this one" — the outgoing half, with its own refusals and its
 * own price tag.
 *
 * `sustain` is the SAME mob's incoming verdict, passed in rather than recomputed, so the cost
 * sentence prices the switch off the same measurement the sustain answer used.
 */
export function dpsVerdict(
  offense: OffenseProfile | undefined,
  availableKeys: readonly string[],
  currentKey: string | null,
  sustain?: SustainVerdict
): DpsVerdict {
  const pooled = pooledOutgoing(offense?.samples ?? [])
  const ranked = rankOffense(pooled.profile, availableKeys)
  const best = ranked[0] ?? null
  // `OutgoingEffect` deliberately carries no display name: STANCE_EFFECTS is the ONE place a
  // stance's spelling lives, and a second copy on the outgoing table is a second thing to drift.
  const base: DpsBase = {
    worn: currentKey ? stanceName(currentKey) : null,
    best: best ? stanceName(best.effect.key) : null,
    meleeShare: meleeShare(pooled.profile),
    hits: pooled.hits,
    refusedHits: pooled.refusedHits,
    unknown: unknownOffense(availableKeys).map((key) => ({
      key,
      name: stanceName(key),
      why: OFFENSE_UNKNOWN[key] ?? 'This app has not established what this stance does to your damage.'
    })),
    ranked
  }
  // Same branch-per-case shape as the sustain half: two refusals, then the comparison.
  if (pooled.hits === 0 || !best) return dpsNothing(base, pooled.refusedHits)
  const wornOut = outgoingFor(currentKey)
  if (!wornOut) return dpsUnknownEffect(base, best, currentKey)
  const now = pooled.profile.melee * wornOut.melee + pooled.profile.spell * wornOut.spell
  return dpsComparison(base, { best, now, currentKey, sustain })
}

/** The shared fields every DPS branch fills in identically. */
type DpsBase = Pick<DpsVerdict, 'worn' | 'best' | 'meleeShare' | 'hits' | 'refusedHits' | 'unknown' | 'ranked'>

/** Nothing usable: no damage of yours measured, or all of it dealt in an unmeasured stance. */
function dpsNothing(base: DpsBase, refusedHits: number): DpsVerdict {
  return {
    ...base,
    gain: null,
    alreadyBest: false,
    block: 'noMeasurement',
    line:
      refusedHits > 0
        ? `Nothing usable yet: all ${String(refusedHits)} of your hits on this one landed in a stance whose effect on your damage has never been measured.`
        : 'No damage of yours measured against this one yet.',
    costLine: null
  }
}

/**
 * The stance you are WEARING has no measured effect on your damage (Striker, Berserker, Ranged) —
 * or the log never said what you are wearing. Either way the app declines to claim a direction:
 * `gain: null` is "we cannot tell", which is not the same as "no difference".
 */
function dpsUnknownEffect(base: DpsBase, best: RankedOffense, currentKey: string | null): DpsVerdict {
  return {
    ...base,
    gain: null,
    alreadyBest: false,
    block: currentKey ? 'ok' : 'unknownWorn',
    line: currentKey
      ? `${String(base.best)} is the best measured stance for damage here (${plusPct(best.ratio)} over no stance at all). What ${String(base.worn)} is doing to your damage has never been measured, so the app cannot tell you whether switching gains or loses.`
      : `The log has not said which stance you are in, so there is nothing to compare. ${String(base.best)} is the best measured stance for damage here.`,
    costLine: null
  }
}

/** The damage comparison, with the mix that makes it per-mob and the price of the switch. */
function dpsComparison(
  base: DpsBase,
  m: { best: RankedOffense; now: number; currentKey: string | null; sustain: SustainVerdict | undefined }
): DpsVerdict {
  const gain = m.now > 0 ? m.best.expected / m.now : null
  const alreadyBest = m.best.effect.key === m.currentKey?.toLowerCase()
  const mix = base.meleeShare === null ? '' : ` ${pct(base.meleeShare)} of your damage to it is melee.`
  const thin = base.hits < MIN_CONFIDENT_HITS
  const early = thin
    ? ` Early days — only ${String(base.hits)} of your hits measured of the ${String(MIN_CONFIDENT_HITS)} this needs.`
    : ''
  return {
    ...base,
    gain,
    alreadyBest,
    block: thin ? 'thin' : 'ok',
    line: dpsLine({ base, gain, alreadyBest, mix, early }),
    costLine: alreadyBest ? null : costLine(m.best, m.sustain)
  }
}

/** The three sentences the comparison can produce, kept out of the object literal so each is
 *  readable on its own line. */
function dpsLine(a: {
  base: DpsBase
  gain: number | null
  alreadyBest: boolean
  mix: string
  early: string
}): string {
  const { base, gain, mix, early } = a
  if (a.alreadyBest) {
    return `You are in ${String(base.worn)}, which is already the best measured stance for damage here.${mix}${early}`
  }
  if (gain === null || gain <= 1.005) {
    return `No measured damage gain here: ${String(base.best)} would deal about the same as ${String(base.worn)}.${mix}${early}`
  }
  return `${String(base.best)} would deal ${plusPct(gain)} damage against this one compared with ${String(base.worn)}.${mix}${early}`
}

/**
 * THE PRICE OF THE DPS PICK, priced off the incoming measurement.
 *
 * Three outcomes, and each is a different fact:
 *   * the damage pick is ALSO the stance you would hold anyway → say so; there is no trade.
 *   * the incoming side has measured this mob → state both fractions, so the trade is a number.
 *   * it has not → say that the cost is unmeasured rather than implying there is none.
 */
function costLine(best: RankedOffense, sustain: SustainVerdict | undefined): string | null {
  const key = best.effect.key
  const name = stanceName(key)
  const holdKey = sustain?.advice.sustained?.effect.key
  if (holdKey && holdKey === key) {
    return `No trade-off here: ${name} is also the best stance you can hold against it.`
  }
  const inDps = sustain ? fractionIn(sustain.advice, key) : null
  if (!sustain || sustain.advice.hits === 0 || inDps === null || sustain.bestFraction === null) {
    return `What that costs you in damage taken is not measured yet — this one has not hit you enough for the app to price the trade.`
  }
  return `It costs you sustain: in ${name} you take ${pct(inDps)} of what it swings for, against ${pct(sustain.bestFraction)} in ${String(sustain.best)}.`
}

// ── THE PAIR ────────────────────────────────────────────────────────────────────────────────

/** Both answers for one mob, keyed so the two ledgers' rows can be paired. */
export interface MobVerdict {
  /** the composite (mobKey, zoneBase, tier) key both ledgers build identically */
  key: string
  mobName: string
  zoneBase: string
  tier: number
  /** the later of the two ledgers' timestamps — "when was I last involved with this thing" */
  lastSeenTs: number
  sustain: SustainVerdict
  dps: DpsVerdict
}

/** The composite key, built the way both ledgers build it. */
export function mobKeyOf(t: { mobKey: string; zoneBase: string; tier: number }): string {
  return `${t.mobKey}|${t.zoneBase}|${String(t.tier)}`
}

/**
 * Pair one mob's two measurements into one verdict.
 *
 * EITHER SIDE MAY BE ABSENT and the pairing must survive it: a mob that beat on you while you
 * killed something else has no offense row, and a mob you burned down untouched has no target row.
 * The display fields are taken from whichever side exists, preferring the incoming one only
 * because that is the ledger the tab has always been built around.
 */
export function mobVerdict(
  pair: { target?: TargetProfile; offense?: OffenseProfile },
  availableKeys: readonly string[],
  currentKey: string | null
): MobVerdict {
  const sustain = sustainVerdict(pair.target, availableKeys, currentKey)
  return {
    ...identityOf(pair),
    lastSeenTs: Math.max(pair.target?.lastSeenTs ?? 0, pair.offense?.lastSeenTs ?? 0),
    sustain,
    dps: dpsVerdict(pair.offense, availableKeys, currentKey, sustain)
  }
}

/**
 * WHO the row is about, taken from whichever ledger has it — the absent-side case resolved ONCE
 * rather than field by field. Both ledgers carry the same four identity fields and build the
 * composite key the same way, so either row answers this completely.
 */
function identityOf(pair: {
  target?: TargetProfile
  offense?: OffenseProfile
}): Pick<MobVerdict, 'key' | 'mobName' | 'zoneBase' | 'tier'> {
  const id = pair.target ?? pair.offense
  if (!id) return { key: '', mobName: '', zoneBase: '', tier: 0 }
  return { key: mobKeyOf(id), mobName: id.mobName, zoneBase: id.zoneBase, tier: id.tier }
}

/**
 * Every mob either ledger knows about, most-recently-involved first — the overlay's whole list and
 * the tab's selector superset.
 *
 * The union rather than an intersection, because both one-sided cases are real and both are worth
 * an answer: the mob hitting you that you are not fighting still has a sustain verdict, and the
 * mob you are killing that has not touched you still has a DPS one.
 */
export function mobVerdicts(
  payload: { targets: readonly TargetProfile[]; offense: readonly OffenseProfile[] },
  availableKeys: readonly string[],
  currentKey: string | null
): MobVerdict[] {
  const byKey = new Map<string, { target?: TargetProfile; offense?: OffenseProfile }>()
  for (const t of payload.targets) byKey.set(mobKeyOf(t), { target: t })
  for (const o of payload.offense) {
    const key = mobKeyOf(o)
    const at = byKey.get(key)
    if (at) at.offense = o
    else byKey.set(key, { offense: o })
  }
  return [...byKey.values()]
    .map((pair) => mobVerdict(pair, availableKeys, currentKey))
    .sort((a, b) => b.lastSeenTs - a.lastSeenTs)
}

/** True when a loadout contains a stance whose damage effect is unmeasured — the flag a compact
 *  surface uses to decide whether it owes the user a footnote. */
export function loadoutHasUnknownOffense(availableKeys: readonly string[]): boolean {
  return availableKeys.some((k) => offenseUnknown(k))
}
