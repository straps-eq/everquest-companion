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
  magicalShare,
  rankStances,
  unmitigate
} from './stances'

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
  /** best-first; empty when the loadout has no defensive stance at all */
  ranked: RankedStance[]
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
  return {
    profile,
    hits,
    magicalShare: magicalShare(profile),
    ranked: hits > 0 ? rankStances(profile, availableKeys) : [],
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

export function detectMismatch(
  target: TargetProfile,
  availableKeys: readonly string[],
  currentKey: string | null
): StanceMismatch | null {
  if (!currentKey) return null
  const advice = adviseFor(target, availableKeys)
  if (!advice.confident || advice.ranked.length === 0) return null
  const best = advice.ranked[0]
  const cur = STANCE_EFFECTS[currentKey.toLowerCase()]
  if (!cur || best.effect.key === cur.key) return null
  const total = advice.profile.physical + advice.profile.magical
  if (total <= 0) return null
  // An offensive stance has no entry in `ranked`, so its fraction is computed directly: wearing
  // Striker against a mob that is hitting you IS the mismatch this alert exists to catch.
  const currentFraction = (advice.profile.physical * cur.physical + advice.profile.magical * cur.magical) / total
  const gain = currentFraction - best.fraction
  if (gain < MIN_GAIN) return null
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
