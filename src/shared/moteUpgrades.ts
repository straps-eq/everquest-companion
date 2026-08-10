// WHAT "EXPERIENCE" ACTUALLY BUYS — the tier ladder motes are spent against.
//
// `motes.ts` prices a mote in experience. That is only half an answer, and on its own it is the
// confusing half: "this Mote of Major Potential is worth 5 exp" means nothing until you know that
// a tier-4 item needs 15 exp to exist and 16 more to reach tier 5. This file is the other half —
// the cost side — read off eqlwiki's "Item Upgrade System" and "Spell Upgrade System".
//
// ── THE CURVE IS ONE RULE, AND IT DOUBLES ───────────────────────────────────────────────────
//
// Advancing OUT of tier N costs 2^N experience: 1, 2, 4, 8 … 512. So the total to stand at tier
// N is 2^N - 1, and a maxed +10 item or spell has absorbed 1,023 experience. Items and spells use
// the same curve; the wiki states them in two separate tables and they agree exactly, which is
// worth knowing because it means one mental model covers both.
//
// The consequence is the thing a player should take away: the first few tiers are nearly free and
// the last one costs more than tiers 0-8 put together. Half of everything you will ever spend on
// an item goes into the single step from +9 to +10.
//
// ── WHY MOTES ARE FOR SPELLS AND DUPLICATES ARE FOR GEAR, IN NUMBERS ────────────────────────
//
// The Mote Guide's rule of thumb ("upgrading items is best done by farming duplicates; motes are
// best used for spells") reads like taste until the two exp sources are put side by side:
//
//   * a DUPLICATE ITEM merged in is worth 2^tier — a tier-4 duplicate hands over 16 exp, which is
//     the entire cost of the 4 → 5 step, in one merge, at every tier;
//   * a mote is worth AT MOST 10, ever. The top of the ladder is Infinite at 10 and there is
//     nothing above it.
//
// A mote's tier limit is a CEILING and not a bracket — an Infinite mote is perfectly legal on a
// tier-4 item — so the best mote available for any item is always that same 10. Which means: FROM
// TIER 4 UPWARD, ONE DUPLICATE BEATS ANY SINGLE MOTE THAT WILL EVER EXIST, and it runs away
// fast — 16 against 10 at tier 4, 512 against 10 at tier 9, fifty-two motes to one duplicate.
// Below tier 4 the mote is the better single merge, which is why the wiki calls this a rule of
// thumb about good gear rather than a law about all of it.
//
// A spell has no duplicate to merge, so motes are the only currency it accepts — and, unlike
// gear, it accepts every rung of them regardless of tier.
//
// ── THE TWO WIKI PAGES DISAGREE ABOUT MOTE LIMITS, BY EXACTLY ONE ───────────────────────────
//
// "Mote Guide" says a Mote of Major Potential "can be used to give 5 exp to a tier 4 item, or
// lower. It cannot be used on a tier 5 or higher item at all" — a limit of 4. "Item Upgrade
// System" tabulates the same mote as "Mote Maximum Tier: 5".
//
// They are RECONCILABLE and this file states both rather than picking: 4 is the highest tier the
// mote may be APPLIED to, 5 is the highest tier it can therefore help an item REACH. Under that
// reading every rung lines up across both pages, which is strong evidence the two tables are
// answering different questions rather than contradicting each other. It is still a reading, so
// `appliesUpToTier` and `canReachTier` are named for the two questions and the UI is expected to
// show the one it means. If a player ever finds a Major refused by a tier-4 item, the Mote Guide
// is the page that was wrong and `appliesUpToTier` is the field to move.
//
// ── WHAT A TIER IS WORTH ────────────────────────────────────────────────────────────────────
//
// Items: +10% cumulative to the item's stats per tier, and — because the bonus tracks EXPERIENCE
// rather than tier — partial progress pays out too. Weapon damage is +5% per tier and delay never
// improves. Spells: the effect depends on the spell, and the wiki's own page warns it "may not be
// entirely accurate and prone to change", so `SPELL_TIER_EFFECTS` is carried verbatim and labelled
// as the wiki's claim.

/** One rung of the shared item/spell experience curve. */
export interface UpgradeTier {
  tier: number
  /** experience an item must have absorbed IN TOTAL to stand at this tier (2^tier - 1) */
  totalXp: number
  /** experience to advance OUT of this tier (2^tier); null at the cap */
  toNextXp: number | null
  /** ITEM stat bonus at this tier, cumulative percent. Spells have no single equivalent. */
  itemBonusPct: number
}

/** 0..10, the whole curve. `2^tier - 1` total, `2^tier` to advance — asserted in the tests. */
export const UPGRADE_TIERS: readonly UpgradeTier[] = Array.from({ length: 11 }, (_, tier) => ({
  tier,
  totalXp: 2 ** tier - 1,
  toNextXp: tier === 10 ? null : 2 ** tier,
  itemBonusPct: tier * 10
}))

/** Experience to take an item or spell from `tier` to the next one. Null at the cap. */
export function xpToNextTier(tier: number): number | null {
  return UPGRADE_TIERS.find((t) => t.tier === tier)?.toNextXp ?? null
}

/** Experience still owed to get from `tier` all the way to +10. */
export function xpToMax(tier: number): number {
  const here = UPGRADE_TIERS.find((t) => t.tier === tier)
  return here ? MAX_TIER_XP - here.totalXp : MAX_TIER_XP
}

/** 1,023 — everything a +10 has absorbed, and the number that makes the curve concrete. */
export const MAX_TIER_XP = 2 ** 10 - 1

/**
 * Experience a DUPLICATE ITEM of the given tier hands over when merged (2^tier).
 *
 * This is the number that turns the guide's rule of thumb into arithmetic: it doubles with the
 * curve, so a duplicate always covers exactly one full tier step, while a mote's value creeps up
 * by one per rung. Gear has no maximum merge tier — unlike motes, a duplicate may be merged into
 * an item of any tier at all.
 */
export function gearMergeXp(tier: number): number {
  return 2 ** tier
}

/** What one mote rung may be used on, and how far it can carry an item — see the header. */
export interface MoteTierRule {
  /** the mote's ladder position, 1..10 (motes.ts `Mote.ladder`) */
  ladder: number
  /** highest ITEM tier the mote may be applied to ("Mote Guide") */
  appliesUpToTier: number
  /** highest ITEM tier it can therefore help one reach ("Item Upgrade System") */
  canReachTier: number
}

/**
 * The mapping the two wiki pages state between them, rung by rung.
 *
 * Derived rather than typed out, because the relationship is exactly `applies = ladder - 1` and
 * `reach = ladder`, and a hand-typed table of twenty numbers is twenty chances to fat-finger one.
 * The tests pin the endpoints against the wiki's own words.
 */
export const MOTE_TIER_RULES: readonly MoteTierRule[] = Array.from({ length: 10 }, (_, i) => ({
  ladder: i + 1,
  appliesUpToTier: i,
  canReachTier: i + 1
}))

export function moteTierRule(ladder: number): MoteTierRule | null {
  return MOTE_TIER_RULES.find((r) => r.ladder === ladder) ?? null
}

/**
 * SPELLS TAKE ANY MOTE, AND THAT IS THE WHOLE REASON MOTES ARE FOR SPELLS.
 *
 * "Motes of any tier can be used to upgrade a spell of any tier" — a Mote of Infinitesimal
 * Potential can put its 1 exp into a tier-9 spell, which no item would accept from it. Gear
 * refuses anything above the mote's own rung, so a pile of low motes is worthless to a good item
 * and still useful to a good spell.
 */
export const MOTES_HAVE_NO_SPELL_TIER_LIMIT = true

/** What one spell tier gives, by spell kind. The wiki's words, and the wiki's uncertainty. */
export interface SpellTierEffect {
  kind: string
  /** short, player-facing; '?' where the wiki itself writes '-?' */
  effect: string
}

/**
 * Per-tier spell benefits, verbatim from "Spell Upgrade System".
 *
 * CARRIED WITH ITS WARNING: that page says of itself that the system is "still being tested",
 * that "details on this page may not be entirely accurate and prone to change", and of its
 * experience table that it "should be correct but needs double checked in game". Any surface
 * showing this must attribute it to the wiki rather than presenting it as measured — nothing in
 * the log can confirm a spell's tier or its effect, so this app has no way to check a word of it.
 */
export const SPELL_TIER_EFFECTS: readonly SpellTierEffect[] = [
  { kind: 'Buffs', effect: '+10% duration, −4% cast time, −2% mana' },
  { kind: 'Debuffs', effect: '+10% duration, −4% cast time, −4% mana' },
  { kind: 'Direct damage', effect: '+6% damage, −2% cast time, −2% mana' },
  { kind: 'Heals', effect: '+3% healing, −4% cast time, −2% mana' },
  { kind: 'Damage / healing over time', effect: '+3% per tick and +5% duration, −4% cast time' },
  { kind: 'Procs', effect: '+6% damage' },
  { kind: 'Summoned items', effect: '+1 tier on the item it summons' },
  { kind: 'Crowd control', effect: '+level cap (charm, fear, lull, mez, root, stun)' },
  { kind: 'Pets', effect: '+1 pet level (capped at your level −1): +6% HP, +5 skills, +1 damage' }
]

/** Reagent saving is per tier and applies to every spell that uses one. */
export const SPELL_REAGENT_SAVE_PER_TIER_PCT = 10
