// WHAT A STANCE DOES TO *YOUR* DAMAGE — the outgoing half of the stance advisor, and the mirror
// image of stances.ts / stanceAdvice.ts.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
//
// The shipped feature answers one question: "what is this mob hitting me with, and which stance
// takes least of it". The owner asked for the other one — "what stance will help for sustain and
// what will help for DPS, for each mob" — and nothing in the app could answer it: the five
// offensive stances carry `physical: 1, magical: 1` in STANCE_EFFECTS and are deliberately
// EXCLUDED from every ranking, because they say nothing about incoming damage.
//
// ── WHY THE NUMBERS HERE ARE MEASURED AND NOT QUOTED ────────────────────────────────────────
//
// The incoming side takes its multipliers from the wiki because the wiki states them plainly and
// the log can never verify them (you cannot see the swing that was reduced). THE OUTGOING SIDE IS
// DIFFERENT, and this is the whole reason this module can exist honestly: your own damage is
// printed line by line, you switch stances hundreds of times a session, and the mob's AC is held
// constant by keying on (mob, zone, tier). So the effect of a stance on your damage is a
// MEASUREMENT, and it was measured before a single number below was written.
//
// THE EXPERIMENT (live log, `eqlog_Straps_freeport.txt`, 176,695 lines, 2026-08-12; 114 stance
// commits; 27,389 landed self melee hits). For every stance commit, the mean per-hit damage
// against THE SAME MOB in the minutes before and after — each window CLAMPED to the adjoining
// commits, so both sides are one stance and one stance only. Gear, level, buffs and the mob are
// constant across a boundary five minutes wide, which is what kills the drift confound that a
// whole-log pool cannot rule out. Results, median over same-mob pairs (n>=15 landed hits a side):
//
//     INTO offensive      24 pairs   median 1.71   (mage hunter -> offensive: 1.90 over 11 pairs)
//     OUT OF offensive    21 pairs   median 0.60   (offensive -> defensive: 0.58 over 8 pairs)
//     NEITHER SIDE        28 pairs   median 0.97   ← every non-offensive transition, no effect
//
// And pooled per mob, where the samples are largest and the ±5-minute window's leakage cannot
// dilute the ratio, it lands on the wiki's own number:
//
//     master yael  slash   offensive 176.3 (n=502)  vs mage hunter  86.2 (n=944)   = 2.05
//     lord nagafen slash   offensive 146.3 (n=416)  vs channeler    74.8 (n=116)   = 1.96
//     a dracoliche slash   offensive 173.6 (n=145)  vs mage hunter  87.8 (n=201)   = 1.98
//     innoruuk     slash   offensive 131.0 (n= 41)  vs defensive    63.6 (n=382)   = 2.06
//     master yael  smite   offensive  47.3 (n= 84)  vs mage hunter  23.2 (n=134)   = 2.04
//
// So Offensive's wiki sentence — "Outgoing melee damage is increased by 100%" — is CONFIRMED at
// 2.0, and the measurement settles an ambiguity the sentence itself does not: "melee damage"
// covers the special attacks too. `bash` (1.87), `punch` (1.67), `claw` (1.89), `kick` (2.06) and
// `smite` (2.04) all double alongside `slash`. One bucket, not two.
//
// ── WHAT THE MEASUREMENT REFUSES TO SUPPORT, AND WHY THAT IS THE POINT ──────────────────────
//
// STRIKER, BERSERKER AND RANGED GET NO NUMBER. The wiki makes three specific claims — Striker's
// "weapon skill abilities deal 3x damage and non-weapon skill abilities deal 5x", Berserker's
// doubled attack speed, Ranged's accuracy bonus — and this log supports none of them:
//   * `offensive -> striker` reads 0.62 over 4 pairs, which is just the ordinary drop OUT of
//     Offensive (0.58-0.71 into every other stance). No 3x appears on any melee verb: striker
//     slash means 61.6 against a defensive 74.2. Whatever "weapon skill ability" names, it is
//     not the thing that prints `You slash`, and the log does not distinguish it.
//   * BERSERKER WAS NEVER WORN — zero commits in the whole log. Its effect is on attack SPEED
//     anyway, i.e. on the rate of swings rather than the size of one, so even a per-hit
//     measurement of it would answer the wrong question.
//   * RANGED has ONE commit and 13 landed hits, and the owner of this log has never fired a bow.
// A number invented for any of the three would rank it against Offensive's measured 2.0 and win
// or lose on fiction. So `outgoingFor` returns NULL for them, `rankOffense` leaves them out
// rather than ranking them last, and `unknownOffense` hands the UI their names so the refusal is
// VISIBLE rather than a silent absence. This is `rankStances`'s treatment of offensive-only
// stances, applied in the other direction.
//
// ACCURACY IS NOT MODELLED AT ALL. Offensive also claims "+25% chance to hit" and Balanced
// "+10%", and this log cannot see either: `You try to …` — the avoided-swing family the engine's
// MISS_RE parses — occurs ZERO times in 176,695 lines. Your own misses are simply not written
// down here, so hit rate has no denominator and every figure in this module is about the size of
// a hit that landed. That makes the model CONSERVATIVE in a useful direction: Offensive's real
// advantage can only be larger than the 2.0 stated here, never smaller.
//
// CRIT RATE IS FLAT, so the doubling is not a crit artifact: 9.8% of melee hits crit in
// Offensive against 10.5% in Defensive and 11.3% in Mage Hunter, over 27,389 hits.

/**
 * The two buckets YOUR outgoing damage falls into — chosen because the measurement above found
 * exactly one boundary, and it is this one.
 *
 * 'melee' is every hit that printed a melee VERB: the weapon swings (`slash`, `pierce`, `crush`,
 * `hit`) and the named skill lanes alike (`bash`, `kick`, `smite`, `punch`, `claw`, `backstab`).
 * They are one bucket because they measurably move together — all of them ~2x in Offensive.
 *
 * 'spell' is everything that arrives named (`… points of magic damage by Smiting Strike.`), plus
 * DoT ticks and damage shields. Flat under every stance, and the evidence is as clean as this log
 * gets: `Smiting Strike` reads 256.0 before a commit and 256.0 after it across twelve separate
 * transitions, and `Lifetap Strike` sits within 11% of itself in all six stances it fired in.
 */
export type OutgoingBucket = 'melee' | 'spell'

/** What wearing one stance does to the SIZE of your hits, per bucket. */
export interface OutgoingEffect {
  /** lowercase stance key — the same key STANCE_EFFECTS and a `stanceChange` event use. */
  key: string
  /** multiplier on your per-hit MELEE damage. 1 = untouched. */
  melee: number
  /** multiplier on your per-hit SPELL/proc damage. 1 = untouched. */
  spell: number
  /**
   * The sentence behind the numbers, for a UI that has to say where they came from. It is a
   * MEASUREMENT, so this quotes the experiment rather than the wiki (the wiki's own sentence is
   * already on `StanceEffect.wiki`, and for the flat stances there is no wiki sentence at all —
   * their silence about outgoing damage is what was confirmed).
   */
  evidence: string
}

/**
 * Every stance whose effect on your damage is ESTABLISHED. A stance absent from this table is not
 * "1x by default" — it is UNKNOWN, and the difference is the whole honesty of the module.
 *
 * The flat entries are not filler. "Defensive does nothing to your damage" is a finding: it is
 * the 28-pair, 0.97-median NEITHER SIDE row of the experiment, and without it the model could not
 * tell "we measured no effect" from "we never looked".
 */
const MEASURED: readonly OutgoingEffect[] = [
  {
    key: 'offensive',
    melee: 2,
    spell: 1,
    evidence:
      'Measured on your own log: per-hit melee damage doubles in Offensive against the same mob ' +
      '(2.05x on 1,446 slashes at master yael, 1.96x at lord nagafen, 2.04x on smite), and spell ' +
      'and proc damage does not move at all. The wiki says "outgoing melee damage is increased by ' +
      '100%", which is what that is.'
  },
  ...(['balanced', 'defensive', 'mage hunter', 'evasive', 'channeler'] as const).map((key) => ({
    key,
    melee: 1,
    spell: 1,
    evidence:
      'Measured as NO effect on your damage: across 28 same-mob switches between the defensive ' +
      'stances the median change in per-hit damage is 0.97 — nothing. These stances are about what ' +
      'you take, not what you deal.'
  }))
]

const BY_KEY: ReadonlyMap<string, OutgoingEffect> = new Map(MEASURED.map((e) => [e.key, e]))

/**
 * THE STANCES WITH NO ANSWER, named — so a surface can say "we do not know" about the exact three
 * the wiki makes claims about, instead of quietly listing two options and looking complete.
 *
 * Each carries the reason, because "unknown" without one reads as a bug the user should report.
 */
export const OFFENSE_UNKNOWN: Readonly<Record<string, string>> = {
  striker:
    'Striker is unproven here. The wiki claims weapon skill abilities hit for 3x and non-weapon ' +
    'ones for 5x, but no melee verb in your log shows it — switching from Offensive to Striker ' +
    'drops your per-hit damage exactly the way switching to any defensive stance does. Whatever ' +
    'the multiplier applies to, this log cannot see it, so no number is claimed.',
  berserker:
    'Berserker has never been worn in this log, so there is nothing to measure. Its effect is on ' +
    'attack SPEED rather than on the size of a hit, which is a different measurement from the one ' +
    'this model makes.',
  ranged:
    'Ranged has one commit and 13 landed hits in this log — far too little to measure, and its ' +
    'bonuses are to accuracy and to bow mechanics, neither of which the log reports.'
}

/** What a stance does to your damage, or `null` when this app has not established it. */
export function outgoingFor(stanceKey: string | null | undefined): OutgoingEffect | null {
  return stanceKey ? (BY_KEY.get(stanceKey.toLowerCase()) ?? null) : null
}

/**
 * True when a stance's effect on your damage is unknown — the three above, and any tenth stance
 * the game adds that this table has never seen. The default for an unrecognized key is UNKNOWN
 * rather than neutral: a stance nobody has measured must not be silently ranked as harmless.
 */
export function offenseUnknown(stanceKey: string): boolean {
  return outgoingFor(stanceKey) === null
}

/** Your damage against one target, split by bucket. Amounts, in points. */
export interface OutgoingProfile {
  melee: number
  spell: number
}

/**
 * Your damage against one target while wearing one stance — the offense ledger's row, and a WIRE
 * type. It lives here rather than beside the ledger for the reason `TargetProfile` does: the
 * engine fills it in, the IPC payload carries it, and the renderer reads it, so the shape has to
 * be reachable from all three without the renderer importing from `src/main`.
 */
export interface OffenseSample {
  /** lowercase stance key; '' when no stance had been committed yet */
  stanceKey: string
  /** melee damage DEALT, as the log printed it (never un-scaled in the ledger) */
  melee: number
  /** spell / proc / DoT / damage-shield damage dealt, as printed */
  spell: number
  /** landed hits behind those amounts */
  hits: number
}

/** Everything measured about YOUR damage to one (mob, zone, tier). */
export interface OffenseProfile {
  /** `idKey`'d mob name — the SAME join key `TargetProfile.mobKey` uses */
  mobKey: string
  /** display name, first spelling seen (law 2: keys canonical, display raw) */
  mobName: string
  /** zone with the tier suffix stripped */
  zoneBase: string
  /** 0..4 */
  tier: number
  samples: OffenseSample[]
  /** epoch ms of your most recent hit on it */
  lastSeenTs: number
  /** your single biggest landed hit on it, as observed (NOT un-scaled) */
  biggestHit: number
}

/**
 * UN-SCALE an observation: recover what you would have hit for WITHOUT the stance you had on.
 *
 * The exact mirror of `unmitigate`, and necessary for the same reason: the measurement is biased
 * by the thing being recommended. 2,000 points of melee measured inside Offensive is 1,000 points
 * of baseline, and a mob you have only ever fought in Offensive would otherwise look like it
 * takes twice the melee from you that it does — which would then make Offensive look like it adds
 * nothing, because the baseline it is being compared against already contains it.
 *
 * A STANCE WITH NO ESTABLISHED EFFECT IS REFUSED, exactly as Evasive is refused on the incoming
 * side. Dividing by a multiplier nobody has measured is not a correction, it is an invention; the
 * honest answer is that the sample says nothing, so it returns null and the caller drops it.
 */
export function unscaleOutgoing(
  observed: OutgoingProfile,
  stanceKey: string | null | undefined
): OutgoingProfile | null {
  // The no-stance bucket ('' — the log never printed a commit) is treated as 1/1, the same
  // reading `mitigationFor` gives an unknown key: no correction, never a guessed one.
  if (!stanceKey) return { ...observed }
  const e = outgoingFor(stanceKey)
  if (!e) return null
  return { melee: observed.melee / e.melee, spell: observed.spell / e.spell }
}

/** The share of your damage against a target that is MELEE, 0..1. `null` when nothing measured. */
export function meleeShare(profile: OutgoingProfile): number | null {
  const total = profile.melee + profile.spell
  return total > 0 ? profile.melee / total : null
}

export interface RankedOffense {
  effect: OutgoingEffect
  /** expected damage DEALT under this stance, over the baseline profile. Higher is better. */
  expected: number
  /** `expected` as a multiple of the baseline (1.85 = "you deal 85% more"). */
  ratio: number
}

/**
 * Rank the stances a character can wear by the damage they would DEAL against a measured profile,
 * best-first. The mirror of `rankStances`, with two deliberate differences.
 *
 * HIGHER IS BETTER here, so the sort is descending, and `ratio` is a multiple of your baseline
 * rather than a fraction of it — "1.85x" is the number a player means by "it nearly doubles my
 * damage", and phrasing it as a share of some maximum would need a maximum nobody has measured.
 *
 * A STANCE WITH NO MEASURED EFFECT IS LEFT OUT, not ranked at 1.0. Striker, Berserker and Ranged
 * make real claims this log cannot check (see OFFENSE_UNKNOWN), and a list ending "…and Striker,
 * 1.00x" would state that they were measured and found useless, which is precisely the opposite
 * of what is known. `unknownOffense()` returns them separately so the UI can name the gap.
 *
 * The closed form is trivial by design — `melee * m + spell * s` — and that is a feature: it needs
 * no outcome data, so it is immune to the confound that a naive "how much damage did I do in each
 * stance" comparison cannot escape (you switch to Offensive when the fight is already won, so the
 * stance correlates with the mob being nearly dead).
 */
export function rankOffense(profile: OutgoingProfile, availableKeys: readonly string[]): RankedOffense[] {
  const base = profile.melee + profile.spell
  const out: RankedOffense[] = []
  for (const k of availableKeys) {
    const e = outgoingFor(k)
    if (!e) continue
    const expected = profile.melee * e.melee + profile.spell * e.spell
    out.push({ effect: e, expected, ratio: base > 0 ? expected / base : 1 })
  }
  return out.sort((a, b) => b.expected - a.expected)
}

/** The stances in this loadout whose effect on your damage is unknown, sorted. */
export function unknownOffense(availableKeys: readonly string[]): string[] {
  return availableKeys.filter((k) => offenseUnknown(k)).sort()
}

/** The best-damage stance, or null when the loadout has nothing measurable in it. */
export function bestOffense(ranked: readonly RankedOffense[]): RankedOffense | null {
  return ranked[0] ?? null
}

/**
 * HOW MUCH MORE DAMAGE the best stance would deal than the one worn now, as a multiple.
 *
 * `null` when either side is unmeasurable — which is not the same as 1.0 and must never be shown
 * as "no difference". Wearing Striker, the app genuinely does not know whether you are giving up
 * damage or gaining it.
 */
export function offenseGain(
  profile: OutgoingProfile,
  bestKey: string,
  currentKey: string | null
): number | null {
  const best = outgoingFor(bestKey)
  const cur = outgoingFor(currentKey)
  if (!best || !cur) return null
  const now = profile.melee * cur.melee + profile.spell * cur.spell
  if (now <= 0) return null
  return (profile.melee * best.melee + profile.spell * best.spell) / now
}
