// WHAT A STANCE ACTUALLY DOES — the decision table behind the stance recommendation.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
//
// `classes.json` has always carried `stances` as `name → [classes]` — WHO may wear each stance,
// never what wearing it DOES. The scrape reads a three-column wiki table (Stance / Description /
// Classes) and kept two of them, so the numbers were fetched and discarded on every run. They
// are quantified and they are exactly what a recommendation needs:
//
//     Defensive    "All incoming melee damage is reduced by 50% and incoming magical damage
//                   is reduced by 20%."
//     Mage Hunter  "All incoming spell damage is reduced by 50% and incoming physical damage
//                   is reduced by 20%."
//
// ── WHY THE NUMBERS ARE HAND-AUTHORED HERE RATHER THAN REGEXED OUT OF THE PROSE ─────────────
//
// The same argument law 12 makes for the wiki↔client slot join: a table a human wrote and
// verified, never a fuzzy match. These are eleven sentences of English that a scraper would
// have to interpret ("reduced by 50%" — of what, against which damage class, with what
// exception?), and getting one wrong silently produces a confident wrong recommendation.
//
// So the numbers are written down ONCE, here, each beside the wiki's own sentence. The scraped
// prose is the PROVENANCE, not the source: `tests/stances.test.mts` asserts every `wiki` string
// below still appears verbatim in the scraped `classes.json` description, so a wiki edit that
// changes a number FAILS THE SUITE instead of quietly invalidating the advice.
//
// ── WHAT IS DELIBERATELY NOT MODELLED ───────────────────────────────────────────────────────
//
// Endurance. Every stance except Balanced charges endurance when its effect fires, Evasive
// charges TWO per point evaded, and the wiki states plainly that "evasion will fail if you have
// insufficient endurance". THE LOG NEVER PRINTS ENDURANCE — not a pool, not a tick, not a
// failure. So the cost side of every one of these trades is unmeasurable here, which is why
// `enduranceGated` is a flag the UI must surface rather than a number this file pretends to
// know. Evasive's 0.05 is arithmetically dominant and practically unverified, and any surface
// that ranks it first has to say so.

/**
 * The two buckets every incoming hit falls into. The wiki names them twice with different
 * words — Defensive says "melee"/"magical", Mage Hunter says "physical"/"spell" — and they are
 * the same partition seen from two sides, so one pair of names is used throughout.
 */
export type DamageClass = 'physical' | 'magical'

export interface StanceEffect {
  /** lowercase key: matches both `classes.json` stances and a `stanceChange` event's `stance`. */
  key: string
  /** display name, wiki casing */
  name: string
  /** multiplier on incoming PHYSICAL damage. 1 = untouched. */
  physical: number
  /** multiplier on incoming MAGICAL damage. 1 = untouched. */
  magical: number
  /**
   * The reduction can FAIL for reasons the log cannot show (Evasive: "evasion will fail if you
   * have insufficient endurance, or while playing dead"). A ranking may not present these as
   * simply better than an ungated stance.
   */
  enduranceGated: boolean
  /** No upkeep cost at all — the sustainable floor. True for Balanced alone. */
  free: boolean
  /** Purely offensive: it changes nothing about damage taken. */
  offensiveOnly: boolean
  /** The wiki's own sentence, verbatim. Pinned by tests/stances.test.mts against the scrape. */
  wiki: string
}

/**
 * All nine stances. `physical`/`magical` are MULTIPLIERS (0.5 = "reduced by 50%").
 *
 * The five offensive stances carry 1/1 because they state nothing about incoming damage — that
 * is a reading of the wiki's silence as "no effect", which is the only reading available and is
 * flagged by `offensiveOnly` so a caller can exclude them from a defensive ranking rather than
 * ranking them last on a number this file invented.
 */
export const STANCE_EFFECTS: Readonly<Record<string, StanceEffect>> = {
  balanced: {
    key: 'balanced',
    name: 'Balanced',
    physical: 0.9,
    magical: 0.9,
    enduranceGated: false,
    free: true,
    offensiveOnly: false,
    wiki: 'All incoming damage is reduced by 10% and your chance to hit is increased by 10%.'
  },
  channeler: {
    key: 'channeler',
    name: 'Channeler',
    physical: 0.6,
    magical: 0.6,
    enduranceGated: false,
    free: false,
    offensiveOnly: false,
    wiki: 'All incoming damage is reduced by 40% and your chance to successfully channel is increased.'
  },
  defensive: {
    key: 'defensive',
    name: 'Defensive',
    physical: 0.5,
    magical: 0.8,
    enduranceGated: false,
    free: false,
    offensiveOnly: false,
    wiki: 'All incoming melee damage is reduced by 50% and incoming magical damage is reduced by 20%.'
  },
  'mage hunter': {
    key: 'mage hunter',
    name: 'Mage Hunter',
    physical: 0.8,
    magical: 0.5,
    enduranceGated: false,
    free: false,
    offensiveOnly: false,
    wiki: 'All incoming spell damage is reduced by 50% and incoming physical damage is reduced by 20%.'
  },
  evasive: {
    key: 'evasive',
    name: 'Evasive',
    physical: 0.05,
    magical: 0.05,
    enduranceGated: true,
    free: false,
    offensiveOnly: false,
    wiki: 'You have a 95% chance to evade all incoming attacks.'
  },
  berserker: {
    key: 'berserker',
    name: 'Berserker',
    physical: 1,
    magical: 1,
    enduranceGated: false,
    free: false,
    offensiveOnly: true,
    wiki: 'While this stance is active, attack speed and combat skill recharge rate is doubled'
  },
  offensive: {
    key: 'offensive',
    name: 'Offensive',
    physical: 1,
    magical: 1,
    enduranceGated: false,
    free: false,
    offensiveOnly: true,
    wiki: 'Outgoing melee damage is increased by 100% and your chance to hit is increased by 25%.'
  },
  ranged: {
    key: 'ranged',
    name: 'Ranged',
    physical: 1,
    magical: 1,
    enduranceGated: false,
    free: false,
    offensiveOnly: true,
    wiki: 'Your range attack has no minimum distance, gains a 25% accuracy bonus, and can double and triple attack.'
  },
  striker: {
    key: 'striker',
    name: 'Striker',
    physical: 1,
    magical: 1,
    enduranceGated: false,
    free: false,
    offensiveOnly: true,
    wiki: 'Outgoing weapon skill abilities deal 3x damage and non-weapon skill abilities deal 5x damage'
  }
}

/** Multipliers for a stance key, or 1/1 for an unknown one (never a guessed reduction). */
export function mitigationFor(stanceKey: string | null | undefined): { physical: number; magical: number } {
  const e = stanceKey ? STANCE_EFFECTS[stanceKey.toLowerCase()] : undefined
  return e ? { physical: e.physical, magical: e.magical } : { physical: 1, magical: 1 }
}

/** A mob's damage, split by class. Amounts, in points. */
export interface DamageProfile {
  physical: number
  magical: number
}

/**
 * UN-MITIGATE an observation: recover what the mob SWUNG FOR from what actually landed on you.
 *
 * This is the correction that makes the whole feature possible, and it exists because the raw
 * observation is biased by the very thing being recommended. Damage is measured AFTER the
 * stance reduced it, so the melee/spell split you can see depends on what you were wearing:
 * the same Cazic-Thule reads 64.7% spell from inside Defensive and 37.9% from inside Mage
 * Hunter, purely because each stance shrinks a different half of the same attack pattern.
 * Dividing each half by the multiplier that shrank it recovers the mob's own profile — measured
 * on the real log, those two readings converge to 53.4% and 49.4%, and the Plane-of-Fear fetid
 * fiend converges from a 15-point disagreement to 0.6.
 *
 * EVASIVE IS REFUSED HERE, and that refusal is the point. Its multiplier is 0.05 because 95% of
 * swings are evaded ENTIRELY — the survivors are not 5%-sized hits, they are full-sized hits
 * that got through. Dividing a landed hit by 0.05 would multiply it twentyfold and invent a
 * monster. The honest answer for an evasive sample is "this tells us nothing about size", so it
 * returns null and callers must drop the sample rather than fold a fiction into the profile.
 */
export function unmitigate(observed: DamageProfile, stanceKey: string | null | undefined): DamageProfile | null {
  const key = stanceKey?.toLowerCase()
  const e = key ? STANCE_EFFECTS[key] : undefined
  if (e?.enduranceGated) return null
  const m = mitigationFor(key)
  return { physical: observed.physical / m.physical, magical: observed.magical / m.magical }
}

export interface RankedStance {
  effect: StanceEffect
  /** expected damage TAKEN under this stance, given the profile. Lower is better. */
  expected: number
  /** `expected` as a fraction of the unmitigated total (0.62 = "you take 62% of it"). */
  fraction: number
}

/**
 * Rank the stances a character can actually wear, best-first, against an UN-MITIGATED profile.
 *
 * The comparison is a closed form, not a fitted threshold — which is why it needs no outcome
 * data and is therefore immune to the confound that sinks the obvious approach. Measuring "how
 * much damage did I take in each stance" cannot work: a player switches to Defensive BECAUSE
 * the fight turned dangerous, so the stance correlates with the danger and the measurement
 * grades the situation rather than the choice. This grades neither. It asks only what the mob
 * swings for and applies the stated multipliers:
 *
 *     defensive   = 0.5·physical + 0.8·magical
 *     mage hunter = 0.8·physical + 0.5·magical
 *     defensive < mage hunter  ⟺  0.3·magical < 0.3·physical  ⟺  magical < physical
 *
 * So for a Paladin the whole decision is "does this mob hit me harder with its fists or its
 * spells", and nothing else. Offensive-only stances are EXCLUDED rather than ranked last: they
 * say nothing about incoming damage, and a list that ends "…and Striker, 100%" implies Striker
 * was measured and found wanting when it was never in the running.
 */
export function rankStances(profile: DamageProfile, availableKeys: readonly string[]): RankedStance[] {
  const total = profile.physical + profile.magical
  const out: RankedStance[] = []
  for (const k of availableKeys) {
    const e = STANCE_EFFECTS[k.toLowerCase()]
    if (!e || e.offensiveOnly) continue
    const expected = profile.physical * e.physical + profile.magical * e.magical
    out.push({ effect: e, expected, fraction: total > 0 ? expected / total : 1 })
  }
  // Ties break toward the stance that cannot fail, then toward the one that costs nothing:
  // between two equal numbers the dependable one is the better advice.
  return out.sort(
    (a, b) =>
      a.expected - b.expected ||
      Number(a.effect.enduranceGated) - Number(b.effect.enduranceGated) ||
      Number(b.effect.free) - Number(a.effect.free)
  )
}

/** The share of a profile that is magical, 0..1. `null` when nothing was measured. */
export function magicalShare(profile: DamageProfile): number | null {
  const total = profile.physical + profile.magical
  return total > 0 ? profile.magical / total : null
}
