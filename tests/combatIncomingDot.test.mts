// GOLDEN WINDOW — THE DoT THAT TICKED ON YOU AND COUNTED FOR NOTHING.
//
// A damage-over-time tick conjugates in the THIRD person when it lands on anyone else and in
// the SECOND person when it lands on the player:
//
//     King Tranix has taken 84 damage from your Blood Draw Strike.      ← parsed since day one
//     You have taken 80 damage from Bond of Death by King Tranix.       ← dropped on the floor
//
// The DoT battery anchored on `has taken` (DOT_RE / DOT_NOCASTER_RE in log/parseCombat.ts) and
// classifyDamage gated the whole family behind `text.includes('has taken')`, so every
// second-person tick failed the substring probe before a regex ever ran. Consequence: damage
// TAKEN by the player was understated by however much of it arrived as a DoT — a mob's ticks on
// a third party counted, the player's own did not. Nothing was mis-attributed; the lines simply
// did not exist as far as the model was concerned.
//
// This is the same class of defect as the incoming DAMAGE-SHIELD variant beside it (DS_INC_RE,
// "reversed grammar + trailing '!'"): EQ writes the player's side of a mechanic in a different
// grammatical person, and a parser written from third-person samples silently omits it. Here the
// capture ORDER is identical between the two conjugations, so the fix is one `ha(?:s|ve)`
// alternation in each regex rather than a second near-duplicate pattern.
//
// ── THE WINDOW ──────────────────────────────────────────────────────────────────────────────
//
// tests/fixtures/w44-poison-slow-per-mob.log — Tue Aug 04 22:30:47 → 22:33:39, already committed
// (cut by tests/extract-combat-fixtures.mjs through the shared scrub). It is the densest
// incoming-DoT span in the fixture set: 102 second-person ticks worth 6,947 damage, from TEN
// distinct (spell, caster) pairs across four hostile entities. Re-derivable by hand:
//
//   grep -c 'have taken' w44-poison-slow-per-mob.log                        → 102
//   grep -o 'You have taken [0-9]* damage' … | awk '{s+=$4} END {print s}'  → 6947
//
// Everything asserted below is that grep, or the engine's own restatement of it.
//
// WHY A PET'S TICKS MATTER HERE: two of the ten pairs are cast by `King Tranix pet` while three
// more are cast by `King Tranix`. One name is a strict PREFIX of the other, so this window also
// pins that the `by <caster>` capture routes each tick to the right incoming row instead of
// folding the pet's damage into its owner's.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFixture } from './harness.mts'
import { parseEvent } from '../src/main/log/parser'
import { looksDamage } from '../src/main/log/parseCommon'
import { CombatEngine } from '../src/main/combat/engine'
import type { SegmentView } from '../src/shared/combat'

const W44 = 'w44-poison-slow-per-mob.log'

/** The two conjugations, verbatim from the window (22:30:50 and 22:30:47 respectively). */
const SECOND_PERSON = '[Tue Aug 04 22:30:50 2026] You have taken 80 damage from Bond of Death by King Tranix.'
const THIRD_PERSON = '[Tue Aug 04 22:30:47 2026] King Tranix has taken 84 damage from your Blood Draw Strike.'

// ── 1. THE PARSER: both conjugations, one shape ─────────────────────────────────────────────

test('IDoT: a second-person DoT tick is a dot damage event aimed at You', () => {
  const ev = parseEvent(SECOND_PERSON, 0)
  assert.ok(ev, 'the line must parse at all — it did not, before the fix')
  assert.equal(ev.kind, 'damage')
  if (ev.kind !== 'damage') return
  assert.equal(ev.dtype, 'dot')
  assert.equal(ev.category, 'dot')
  // `norm()` folds "You" to the canonical self token, so the tick lands on the SAME entity the
  // incoming-melee path already builds — never a second, phantom "You".
  assert.equal(ev.target, 'You')
  assert.equal(ev.attacker, 'King Tranix')
  assert.equal(ev.skill, 'Bond of Death')
  assert.equal(ev.amount, 80)
  assert.equal(ev.crit, false)
})

test('IDoT: the third-person form is untouched — same kind, same fields, attacker You', () => {
  const ev = parseEvent(THIRD_PERSON, 0)
  assert.ok(ev)
  assert.equal(ev.kind, 'damage')
  if (ev.kind !== 'damage') return
  assert.equal(ev.dtype, 'dot')
  assert.equal(ev.target, 'King Tranix')
  assert.equal(ev.attacker, 'You')
  assert.equal(ev.skill, 'Blood Draw Strike')
  assert.equal(ev.amount, 84)
})

test('IDoT: the widened auxiliary verb still requires the damage shape', () => {
  // `ha(?:s|ve)` is an alternation inside a fully-anchored pattern, not a new entry point: a
  // sentence merely containing "have taken" carries no amount and no spell and must stay
  // unclassified rather than become a 0-damage event.
  for (const text of [
    '[Tue Aug 04 22:30:50 2026] You have taken control of the ship.',
    '[Tue Aug 04 22:30:50 2026] You have taken your last breath.'
  ]) {
    const ev = parseEvent(text, 0)
    assert.equal(ev?.kind, 'unknown', text)
  }
  // …while the diagnostic probe that decides "this LOOKED like damage" now recognizes the
  // second-person tick, so a future regression shows up as a damage-shaped miss, not silence.
  assert.equal(looksDamage('You have taken 80 damage from Bond of Death by King Tranix.'), true)
  assert.equal(looksDamage('King Tranix has taken 84 damage from your Blood Draw Strike.'), true)
})

// ── 2. THE ENGINE: the ticks reach the incoming meter, on the right rows ────────────────────

function replay(fixture: string): SegmentView {
  const eng = new CombatEngine()
  eng.setPlayerName('Primitive')
  let seq = 0
  let lastTs = 0
  for (const raw of readFixture(fixture)) {
    const ev = parseEvent(raw, seq++)
    if (!ev) continue
    eng.ingestEvent(ev, false)
    lastTs = ev.ts
  }
  // The ZONE aggregate, so nothing depends on which pull a tick landed in.
  const seg = eng.snapshot(lastTs + 120_000, { selectedId: 'zone' }).selected
  assert.ok(seg, `${fixture}: no zone aggregate`)
  return seg
}

/** The window's own arithmetic, recomputed from the committed bytes at test time: how many
 *  second-person ticks it holds and what they are worth. Derived, never hard-coded, so the
 *  engine's numbers below are checked against the FIXTURE rather than against a memory of it. */
function greppedTicks(fixture: string): { count: number; damage: number } {
  let count = 0
  let damage = 0
  for (const raw of readFixture(fixture)) {
    const m = /You have taken (\d+) damage from /.exec(raw)
    if (m) {
      count++
      damage += Number(m[1])
    }
  }
  return { count, damage }
}

test('IDoT: the window is the window — 102 ticks, 6,947 damage', () => {
  // Pinned so a re-cut fixture that loses the shape fails HERE, loudly, instead of quietly
  // weakening every assertion below it.
  assert.deepEqual(greppedTicks(W44), { count: 102, damage: 6947 })
})

test('IDoT: every grepped tick is in the incoming meter, to the point', () => {
  const seg = replay(W44)
  const grep = greppedTicks(W44)

  // The DoT category over the incoming rows accounts for the grep EXACTLY — no tick dropped,
  // none double-counted, and nothing else folded into the category.
  const dotTotal = seg.incoming.reduce((s, e) => s + (e.categories.find((c) => c.category === 'dot')?.total ?? 0), 0)
  const dotHits = seg.incoming.reduce((s, e) => s + (e.categories.find((c) => c.category === 'dot')?.hits ?? 0), 0)
  assert.equal(dotTotal, grep.damage)
  assert.equal(dotHits, grep.count)

  // …and it is a real slice of what hit the player, not a rounding error: before the fix
  // `inTotal` read 16,508 for this window instead of 23,455 — 30% of the damage the player
  // took in three minutes was missing.
  assert.equal(seg.inTotal, 23455)
  assert.equal(seg.inTotal - grep.damage, 16508)
})

/** One incoming row's DoT category, reduced to the two numbers these tests care about. */
interface DotRow {
  total: number
  hits: number
}

test('IDoT: a mob and its PET keep separate rows, though one name prefixes the other', () => {
  const seg = replay(W44)
  const row = (name: string): DotRow => {
    const e = seg.incoming.find((s) => s.name.toLowerCase() === name)
    assert.ok(e, `no incoming row for ${name}`)
    const dot = e.categories.find((c) => c.category === 'dot')
    return { total: dot?.total ?? 0, hits: dot?.hits ?? 0 }
  }
  // Per-caster DoT, each equal to that caster's own grep:
  //   King Tranix           17 Cascading Darkness + 14 Ignite Blood + 10 Bond of Death   = 41
  //   a fire giant warrior  12 Malaria + 11 Envenomed Breath                             = 23
  //   King Tranix pet        7 Heat Blood + 7 Engulfing Darkness + 5 Negation of Life    = 19
  //   a fire giant warrior pet 11 Sicken + 8 Envenomed Breath                            = 19
  assert.deepEqual(row('king tranix'), { total: 3774, hits: 41 })
  assert.deepEqual(row('a fire giant warrior'), { total: 1854, hits: 23 })
  assert.deepEqual(row('king tranix pet'), { total: 478, hits: 19 })
  assert.deepEqual(row('a fire giant warrior pet'), { total: 841, hits: 19 })
  // The four rows are the whole story — 41 + 23 + 19 + 19 = 102.
  assert.equal(41 + 23 + 19 + 19, greppedTicks(W44).count)
})

test('IDoT: a DoT spell that also hits directly keeps the two apart', () => {
  // `Envenomed Breath` arrives BOTH ways in this window — 11 ticks ("You have taken N damage
  // from Envenomed Breath by a fire giant warrior.") and 2 direct hits ("a fire giant warrior
  // hit you for 14 points of poison damage by Envenomed Breath."). The skill row therefore
  // carries 13 hits while only 11 of them are DoT, which is why the category — not the skill
  // row — is what the totals above are asserted over.
  const seg = replay(W44)
  const warrior = seg.incoming.find((s) => s.name.toLowerCase() === 'a fire giant warrior')
  assert.ok(warrior)
  const eb = warrior.skills.find((s) => s.name === 'Envenomed Breath')
  assert.ok(eb, 'the spell should appear as a skill row')
  assert.equal(eb.hits, 13)
  const ticks = readFixture(W44).filter((l) => /You have taken \d+ damage from Envenomed Breath by a fire giant warrior\.$/.test(l))
  assert.equal(ticks.length, 11)
})
