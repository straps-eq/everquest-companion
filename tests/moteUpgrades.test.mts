// THE UPGRADE CURVE — what a mote's experience is actually spent against.
//
// The numbers here are the wiki's ("Item Upgrade System", "Spell Upgrade System") but they are
// GENERATED from `2^tier` rather than typed out, so these tests do the job the typing would have:
// they check the generated curve against the wiki's tabulated values, rung by rung. If the game
// ever changes the curve, the table below is what has to be re-read — not the exponent.
//
// The second thing pinned here is a WIKI SELF-CONTRADICTION and its reconciliation. "Mote Guide"
// says a Mote of Major Potential works on "a tier 4 item, or lower"; "Item Upgrade System" lists
// the same mote as "Mote Maximum Tier: 5". Both are kept, under two names, because they answer
// different questions — the highest tier it may be APPLIED to, and the highest it can help one
// REACH. A future reader who spots the mismatch should find it already handled here rather than
// "fix" one of them.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MOTE_LADDER } from '../src/shared/motes'
import {
  MAX_TIER_XP,
  MOTES_HAVE_NO_SPELL_TIER_LIMIT,
  MOTE_TIER_RULES,
  SPELL_REAGENT_SAVE_PER_TIER_PCT,
  SPELL_TIER_EFFECTS,
  UPGRADE_TIERS,
  gearMergeXp,
  moteTierRule,
  xpToMax,
  xpToNextTier
} from '../src/shared/moteUpgrades'

// ── 1. THE CURVE, against the wiki's own table ──────────────────────────────────────────────

/** eqlwiki "Item Upgrade System" § Tiers: [tier, Total XP Required, Exp to Next Level]. */
const WIKI_TIERS: readonly [number, number, number | null][] = [
  [0, 0, 1],
  [1, 1, 2],
  [2, 3, 4],
  [3, 7, 8],
  [4, 15, 16],
  [5, 31, 32],
  [6, 63, 64],
  [7, 127, 128],
  [8, 255, 256],
  [9, 511, 512],
  [10, 1023, null]
]

test('MU: the generated curve reproduces the wiki table exactly', () => {
  assert.equal(UPGRADE_TIERS.length, 11, 'tiers 0..10 inclusive')
  for (const [tier, totalXp, toNext] of WIKI_TIERS) {
    const row = UPGRADE_TIERS.find((t) => t.tier === tier)
    assert.ok(row, `no row for tier ${String(tier)}`)
    assert.equal(row.totalXp, totalXp, `tier ${String(tier)} total`)
    assert.equal(row.toNextXp, toNext, `tier ${String(tier)} to-next`)
  }
})

test('MU: a maxed item has absorbed 1,023 — and half of it in the last step', () => {
  assert.equal(MAX_TIER_XP, 1023)
  assert.equal(xpToMax(0), 1023)
  // The shape of the curve IS the advice: the final step costs more than tiers 0-8 together.
  assert.equal(xpToNextTier(9), 512)
  assert.equal(UPGRADE_TIERS.find((t) => t.tier === 9)?.totalXp, 511)
  assert.ok(512 > 511, 'the +9 to +10 step outweighs everything before it')
  // …and the first rungs are nearly free, which is why partial progress is worth having.
  assert.equal(xpToNextTier(0), 1)
  assert.equal(xpToNextTier(1), 2)
  assert.equal(xpToMax(9), 512)
  assert.equal(xpToNextTier(10), null, 'nothing above the cap')
})

test('MU: the item stat bonus is a flat +10% a tier', () => {
  assert.equal(UPGRADE_TIERS.find((t) => t.tier === 0)?.itemBonusPct, 0)
  assert.equal(UPGRADE_TIERS.find((t) => t.tier === 5)?.itemBonusPct, 50)
  assert.equal(UPGRADE_TIERS.find((t) => t.tier === 10)?.itemBonusPct, 100)
})

// ── 2. WHY DUPLICATES BEAT MOTES ON GEAR, IN NUMBERS ────────────────────────────────────────

test('MU: a duplicate covers a whole tier step; the best legal mote covers a fraction', () => {
  // eqlwiki "Gear Experience Rules": gear merged in is worth 2^tier.
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(gearMergeXp), [1, 2, 4, 8, 16, 32, 64, 128, 256, 512])

  // A duplicate covers exactly one tier step, at every tier. That is the curve, not a coincidence:
  // gear is worth 2^tier and the step out of a tier costs 2^tier.
  for (const tier of [0, 3, 4, 7, 9]) assert.equal(gearMergeXp(tier), xpToNextTier(tier))

  // THE RULE OF THUMB, as arithmetic — and the honest version is stronger than "motes are worse".
  // A mote's tier limit is a CEILING, not a bracket: a Mote of Infinite Potential is legal on a
  // tier-4 item too. So the best mote available for ANY item is the top of the ladder, worth 10 —
  // and 10 is all a mote will ever be worth, while a duplicate doubles with the curve.
  const bestMoteEver = Math.max(...MOTE_LADDER.map((m) => m.exp))
  assert.equal(bestMoteEver, 10)
  const legalAt = (tier: number): number =>
    Math.max(...MOTE_LADDER.filter((m) => moteTierRule(m.ladder)!.appliesUpToTier >= tier).map((m) => m.exp))
  assert.equal(legalAt(4), 10, 'Infinite is legal on a tier-4 item — the limit is one-sided')
  assert.equal(legalAt(9), 10)

  // FROM TIER 4 UP, ONE DUPLICATE BEATS ANY SINGLE MOTE THAT HAS EVER EXISTED, and it runs away:
  // 16 against 10 at tier 4, 512 against 10 at tier 9 — fifty-one motes to one duplicate.
  assert.ok(gearMergeXp(4) > bestMoteEver, '16 > 10')
  assert.equal(gearMergeXp(9), 512)
  assert.equal(Math.ceil(gearMergeXp(9) / bestMoteEver), 52)
  // Below tier 4 the mote is the better single merge, which is why this is a rule of thumb about
  // GOOD gear rather than a law about all of it.
  assert.ok(gearMergeXp(2) < bestMoteEver, 'a tier-2 duplicate is only 4')
})

// ── 3. THE CONTRADICTION, RECONCILED ────────────────────────────────────────────────────────

test('MU: every mote rung carries BOTH wiki answers, one tier apart', () => {
  assert.equal(MOTE_TIER_RULES.length, MOTE_LADDER.length)
  for (const m of MOTE_LADDER) {
    const r = moteTierRule(m.ladder)
    assert.ok(r, m.name)
    // "Mote Guide": applies to `ladder - 1` and no higher. This is `motes.ts`'s itemTierLimit.
    assert.equal(r.appliesUpToTier, m.itemTierLimit, `${m.name} applies-to must match motes.ts`)
    // "Item Upgrade System": Mote Maximum Tier = ladder. Exactly one above, every rung.
    assert.equal(r.canReachTier, r.appliesUpToTier + 1)
    assert.equal(r.canReachTier, m.ladder)
  }
})

test('MU: the two sentences the wiki actually wrote, spot-checked', () => {
  // "a Mote of Major Potential can be used to give 5 exp to a tier 4 item, or lower. It cannot be
  // used on a tier 5 or higher item at all."  (Mote Guide)
  const major = MOTE_LADDER.find((m) => m.short === 'Major')!
  assert.equal(moteTierRule(major.ladder)?.appliesUpToTier, 4)
  assert.equal(major.exp, 5)
  // "Mote of Major Potential | Mote Maximum Tier | 5"  (Item Upgrade System)
  assert.equal(moteTierRule(major.ladder)?.canReachTier, 5)

  // The ends of the ladder, where an off-by-one would be least visible.
  assert.equal(moteTierRule(1)?.appliesUpToTier, 0, 'Infinitesimal touches only an un-upgraded item')
  assert.equal(moteTierRule(10)?.canReachTier, 10, 'Infinite can carry one to the cap')
  assert.equal(moteTierRule(11), null)
})

// ── 4. SPELLS ───────────────────────────────────────────────────────────────────────────────

test('MU: spells accept every rung — which is the point of the whole rule of thumb', () => {
  assert.equal(MOTES_HAVE_NO_SPELL_TIER_LIMIT, true)
  // An Infinitesimal is refused by any item above tier 0 and accepted by a tier-9 spell.
  assert.equal(moteTierRule(1)?.appliesUpToTier, 0)
})

test('MU: the spell effect table is carried whole, and says which spells it means', () => {
  assert.equal(SPELL_TIER_EFFECTS.length, 9)
  const kinds = SPELL_TIER_EFFECTS.map((e) => e.kind)
  for (const k of ['Buffs', 'Debuffs', 'Direct damage', 'Heals', 'Procs', 'Pets', 'Crowd control']) {
    assert.ok(kinds.includes(k), `missing ${k}`)
  }
  // The two an Enchanter/Monk/Paladin cares about most, checked for their distinguishing clause.
  assert.match(SPELL_TIER_EFFECTS.find((e) => e.kind === 'Crowd control')!.effect, /level cap/i)
  assert.match(SPELL_TIER_EFFECTS.find((e) => e.kind === 'Pets')!.effect, /pet level/i)
  assert.equal(SPELL_REAGENT_SAVE_PER_TIER_PCT, 10)
  for (const e of SPELL_TIER_EFFECTS) assert.ok(e.effect.trim().length > 0, e.kind)
})
