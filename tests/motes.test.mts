// THE MOTE LADDER — the wiki's table, pinned to the committed items DB, and the condensing
// arithmetic that contradicts the obvious assumption.
//
// Two things this file exists to stop:
//
//   1. THE LADDER SILENTLY DRIFTING. Ten hand-authored rows (exp, item tier limit) taken from the
//      eqlwiki "Mote Guide". The items DB is committed and carries all ten motes with their icon
//      ids, so the NAMES and the ORDER are checked against it rather than trusted — an icon
//      sequence of 2889..2898 in ladder order is independent corroboration that Major (5 exp) sits
//      below Greater (6 exp), which is the one rung a reader is most likely to swap.
//   2. THE CONDENSING TRAP BEING "FIXED". Two Superior motes (7 exp each) condense into one Grand
//      (8 exp) — fourteen in, eight out. That looks like a bug in the table and is not; it is the
//      mechanic, the guide shouts about it, and someone will eventually be tempted to "correct"
//      these numbers. The exp-loss column is asserted rung by rung so that edit fails here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  CONDENSE_RATIO,
  MOTE_LADDER,
  MOTE_RULE_OF_THUMB,
  VOID_TOUCHED,
  condenseOutcome,
  condenseTable,
  isMote,
  isVoidTouched,
  moteExp,
  moteOf,
  wikiClaimedCeiling
} from '../src/shared/motes'

const HERE = dirname(fileURLToPath(import.meta.url))
interface ItemsDb {
  items: Record<string, { iconId?: number; summary?: string }>
}
const db = JSON.parse(readFileSync(join(HERE, '..', 'src', 'main', 'data', 'items.json'), 'utf8')) as ItemsDb

// ── 1. PROVENANCE against the committed items DB ────────────────────────────────────────────

test('MT: the ladder is exactly the ten motes the items DB carries', () => {
  const inDb = Object.keys(db.items)
    .filter((k) => k.startsWith('mote of ') && k.endsWith(' potential'))
    .sort()
  assert.equal(inDb.length, 10)
  assert.deepEqual(MOTE_LADDER.map((m) => m.key).sort(), inDb)
})

test('MT: every rung names a real item, and its icon id matches the DB', () => {
  for (const m of MOTE_LADDER) {
    const entry = db.items[m.key]
    assert.ok(entry, `${m.name} is not in the items DB`)
    assert.equal(entry.iconId, m.iconId, m.name)
  }
})

test('MT: the icon ids run 2889..2898 IN LADDER ORDER — independent corroboration', () => {
  // This is what pins Major (5 exp) BELOW Greater (6 exp). If someone reorders the table on the
  // usual English intuition that "greater" is weaker than "major", this breaks.
  assert.deepEqual(
    MOTE_LADDER.map((m) => m.iconId),
    [2889, 2890, 2891, 2892, 2893, 2894, 2895, 2896, 2897, 2898]
  )
  assert.deepEqual(
    MOTE_LADDER.map((m) => m.ladder),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  )
  assert.equal(MOTE_LADDER.find((m) => m.short === 'Major')?.exp, 5)
  assert.equal(MOTE_LADDER.find((m) => m.short === 'Greater')?.exp, 6)
})

test('MT: exp rises monotonically and the item tier limit is always one below the rung', () => {
  let prev = 0
  for (const m of MOTE_LADDER) {
    assert.ok(m.exp >= prev, `${m.name} exp went backwards`)
    prev = m.exp
    // The guide's table: Infinitesimal limit 0, Minor 1, … Infinite 9 — i.e. ladder - 1.
    assert.equal(m.itemTierLimit, m.ladder - 1, m.name)
  }
  // The one place two rungs share an exp value, kept because the wiki says so.
  assert.equal(MOTE_LADDER[0].exp, 1)
  assert.equal(MOTE_LADDER[1].exp, 1)
})

// ── 2. RESOLUTION ───────────────────────────────────────────────────────────────────────────

test('MT: a loot row resolves to its rung, whatever its casing', () => {
  assert.equal(moteOf('Mote of Major Potential')?.ladder, 5)
  assert.equal(moteOf('  mote of major POTENTIAL  ')?.ladder, 5)
  assert.equal(moteOf('Mote of Potential')?.short, 'Potential', 'the un-adjectived rung exists')
  assert.equal(isMote('Mote of Infinite Potential'), true)
})

test('MT: nothing else is a mote — matched whole, never sniffed for the word', () => {
  for (const n of ['Mote of Nonsense Potential', 'Motes', 'a Nisch Mas Mender', 'Band of Discipline', '']) {
    assert.equal(moteOf(n), null, n)
    assert.equal(isMote(n), false, n)
  }
})

test('MT: Void-Touched Potential is recognised and is NOT on the ladder', () => {
  // It raises a tier outright and gives no exp, so valuing it at 0 would understate it and
  // guessing a number would invent a mechanic. It must never resolve as a laddered mote.
  assert.equal(moteOf('Void-Touched Potential'), null)
  assert.equal(isMote('Void-Touched Potential'), false)
  assert.equal(isVoidTouched('Void-Touched Potential'), true)
  assert.equal(isVoidTouched('void-touched potential'), true)
  assert.equal(isVoidTouched('Mote of Potential'), false)
  assert.equal(MOTE_LADDER.some((m) => m.key === VOID_TOUCHED), false)
})

// ── 3. EXP IS THE CURRENCY ──────────────────────────────────────────────────────────────────

test('MT: exp values a bag of drops, and ignores what it cannot price', () => {
  // Six infinitesimals (1 exp each) are worth less than two Potentials (4 each) — the whole
  // reason a count-based "motes/hour" is a misleading number.
  assert.equal(moteExp(new Map([['mote of infinitesimal potential', 6]])), 6)
  assert.equal(moteExp(new Map([['mote of potential', 2]])), 8)
  // The owner's real Friday haul: 10 infinitesimal, 2 minor, 3 lesser, 3 potential, 1 major.
  const haul = new Map([
    ['mote of infinitesimal potential', 10],
    ['mote of minor potential', 2],
    ['mote of lesser potential', 3],
    ['mote of potential', 3],
    ['mote of major potential', 1]
  ])
  assert.equal(moteExp(haul), 10 * 1 + 2 * 1 + 3 * 2 + 3 * 4 + 1 * 5)
  assert.equal(moteExp(haul), 35)
  // An unknown key contributes nothing rather than throwing or guessing.
  assert.equal(moteExp(new Map([['void-touched potential', 3]])), 0)
  assert.equal(moteExp(new Map()), 0)
})

// ── 4. THE CONDENSING TRAP ──────────────────────────────────────────────────────────────────

test('MT: only minor→lesser and lesser→potential break even; every rung above burns exp', () => {
  const table = condenseTable()
  assert.equal(table.length, 9, 'nine rungs to trade up from; Infinite has nowhere to go')
  const lossless = table.filter((o) => o.lossless).map((o) => `${o.from.short}->${o.to.short}`)
  assert.deepEqual(lossless, ['Minor->Lesser', 'Lesser->Potential'])

  // The guide's own example, to the point: two Superior (7) for one Grand (8).
  const sup = condenseOutcome(MOTE_LADDER.find((m) => m.short === 'Superior')!)
  assert.ok(sup)
  assert.equal(sup.to.short, 'Grand')
  assert.equal(sup.expLost, CONDENSE_RATIO * 7 - 8)
  assert.equal(sup.expLost, 6)

  // …and the loss grows as you climb, which is the shape of the advice. The FIRST rung is the
  // sting the guide does not mention: two Infinitesimals (1 exp each) buy one Minor (1 exp), so
  // condensing the junk tier throws away HALF of it — proportionally the worst trade on the
  // ladder, and the one a player drowning in Infinitesimals is most tempted to make.
  assert.deepEqual(
    table.map((o) => o.expLost),
    [1, 0, 0, 3, 4, 5, 6, 7, 8]
  )
  const inf = condenseOutcome(MOTE_LADDER[0])
  assert.ok(inf)
  assert.equal(inf.to.short, 'Minor')
  assert.equal(inf.expLost, 1)
  assert.equal(inf.lossless, false)
})

test('MT: the top of the ladder has nothing to condense into', () => {
  assert.equal(condenseOutcome(MOTE_LADDER[MOTE_LADDER.length - 1]), null)
  assert.equal(MOTE_LADDER[MOTE_LADDER.length - 1].short, 'Infinite')
})

// ── 5. THE LEVEL CLAIM IS CARRIED, NOT ENFORCED ─────────────────────────────────────────────

test('MT: the wiki level ceiling is reportable — and the owner\u2019s log refutes it', () => {
  assert.equal(wikiClaimedCeiling(1), 1)
  assert.equal(wikiClaimedCeiling(15), 3)
  assert.equal(wikiClaimedCeiling(17), 3, 'level 17 sits on the 15 rung')
  assert.equal(wikiClaimedCeiling(50), 10)
  assert.equal(wikiClaimedCeiling(0), 0, 'below the table is 0, not a guessed 1')

  // THE REFUTATION, as arithmetic rather than as prose. The log's four dings are Sat Aug 08
  // 00:10-00:50 (reaching 17); `Mote of Major Potential` — ladder 5 — was looted Fri Aug 07
  // 12:40, so at level 13 or lower, where this table allows ladder 2.
  const major = moteOf('Mote of Major Potential')
  assert.ok(major)
  assert.equal(major.ladder, 5)
  assert.ok(major.ladder > wikiClaimedCeiling(13), 'the observed drop exceeds the claimed ceiling')
  assert.ok(major.ladder > wikiClaimedCeiling(17), 'and still exceeds it at the level he reached')
})

test('MT: the rule of thumb is carried verbatim, both halves', () => {
  assert.equal(MOTE_RULE_OF_THUMB.length, 2)
  assert.match(MOTE_RULE_OF_THUMB[0], /farming duplicates/)
  assert.match(MOTE_RULE_OF_THUMB[1], /spells/)
})
