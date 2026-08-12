// THE OUTGOING STANCE MODEL — the measurement, and the four refusals that keep it honest.
//
// stances.test.mts pins the INCOMING table against the wiki, because the wiki is where those
// numbers come from and the log can never check them. This side is the other way round: the
// numbers are MEASURED (shared/stanceOffense.ts's header carries the experiment), so what has to
// be pinned is the measurement's own verdicts —
//
//   1. Offensive doubles melee and leaves spells alone;
//   2. the defensive stances do nothing to your damage, and that is a FINDING, not a default;
//   3. Striker / Berserker / Ranged have NO number, are left out of the ranking rather than
//      ranked at 1.00x, and say why;
//   4. every stance the game has is either measured or explicitly unknown — a tenth one forces
//      somebody to decide which.
//
// The ratios asserted below are the ones the live-log experiment produced, so a future edit that
// "rounds Offensive up a bit" or quietly gives Striker a number fails here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  OFFENSE_UNKNOWN,
  bestOffense,
  meleeShare,
  offenseGain,
  offenseUnknown,
  outgoingFor,
  rankOffense,
  unknownOffense,
  unscaleOutgoing
} from '../src/shared/stanceOffense'
import { STANCE_EFFECTS } from '../src/shared/stances'

const HERE = dirname(fileURLToPath(import.meta.url))

/** The paladin loadout the live log was measured on, plus a monk's for the refusal cases. */
const PAL_STANCES = ['balanced', 'defensive', 'mage hunter', 'offensive']
const MNK_STANCES = ['balanced', 'evasive', 'offensive', 'ranged', 'striker']

// ── 1. WHAT WAS MEASURED ────────────────────────────────────────────────────────────────────

test('SO: Offensive doubles melee and does nothing to spells', () => {
  const e = outgoingFor('offensive')
  assert.ok(e)
  assert.equal(e.melee, 2, 'measured 1.96-2.06 per-hit against five different mobs')
  assert.equal(e.spell, 1, 'Smiting Strike read 256.0 either side of twelve stance commits')
  assert.equal(outgoingFor('OFFENSIVE')?.melee, 2, 'case-insensitive, like mitigationFor')
})

test('SO: the defensive stances measurably do NOTHING to your damage', () => {
  // The 28-pair, 0.97-median row of the experiment. This is an observation, and it is why these
  // stances are in the table at all: without them the model could not tell "measured no effect"
  // from "never looked", which is exactly the distinction the three refusals below rest on.
  for (const key of ['balanced', 'defensive', 'mage hunter', 'evasive', 'channeler']) {
    const e = outgoingFor(key)
    assert.ok(e, `${key} should be measured, not unknown`)
    assert.deepEqual({ melee: e.melee, spell: e.spell }, { melee: 1, spell: 1 })
  }
})

test('SO: every measured effect states its evidence in plain words', () => {
  for (const key of ['offensive', 'defensive', 'balanced']) {
    const e = outgoingFor(key)
    assert.ok(e && e.evidence.length > 40, `${key} must carry the measurement it rests on`)
    assert.ok(/measured/i.test(e.evidence))
  }
})

// ── 2. THE REFUSALS ─────────────────────────────────────────────────────────────────────────

test('SO: Striker, Berserker and Ranged get NO number', () => {
  // The wiki makes three specific claims and this log supports none of them. A fabricated
  // multiplier would be ranked against Offensive's measured 2.0 and would win or lose on fiction.
  for (const key of ['striker', 'berserker', 'ranged']) {
    assert.equal(outgoingFor(key), null, `${key} must not carry an invented multiplier`)
    assert.equal(offenseUnknown(key), true)
    assert.ok(OFFENSE_UNKNOWN[key].length > 60, `${key} must say WHY it is unknown`)
  }
})

test('SO: an unrecognized stance defaults to UNKNOWN, never to neutral', () => {
  // A tenth stance the game adds must not be silently ranked as harmless.
  assert.equal(outgoingFor('no such stance'), null)
  assert.equal(offenseUnknown('no such stance'), true)
  assert.equal(outgoingFor(null), null)
})

test('SO: unknown stances are LEFT OUT of the ranking, not ranked at 1.00x', () => {
  const ranked = rankOffense({ melee: 800, spell: 200 }, MNK_STANCES)
  const keys = ranked.map((r) => r.effect.key)
  assert.ok(!keys.includes('striker'), 'a 1.00x Striker row would claim it was measured')
  assert.ok(!keys.includes('ranged'))
  // Exactly the three measured members of a monk's loadout, best-damage first. Balanced and
  // Evasive tie at 1.00x and hold their input order (the sort is stable), which is what keeps a
  // tie from looking like a ranking.
  assert.deepEqual(keys, ['offensive', 'balanced', 'evasive'])
  // …and they are reported separately, so the gap is visible rather than an absence.
  assert.deepEqual(unknownOffense(MNK_STANCES), ['ranged', 'striker'])
  assert.deepEqual(unknownOffense(PAL_STANCES), [], 'a paladin has nothing unmeasurable to declare')
})

test('SO: the ranking is empty when nothing in the loadout was ever measured', () => {
  assert.deepEqual(rankOffense({ melee: 1, spell: 1 }, ['striker', 'berserker', 'ranged']), [])
  assert.equal(bestOffense([]), null)
})

// ── 3. THE ARITHMETIC ───────────────────────────────────────────────────────────────────────

test('SO: the best-damage stance depends on YOUR mix against this mob', () => {
  // A mob you melee: Offensive nearly doubles the total.
  const melee = rankOffense({ melee: 900, spell: 100 }, PAL_STANCES)
  assert.equal(melee[0].effect.key, 'offensive')
  assert.equal(melee[0].expected, 1900)
  assert.equal(melee[0].ratio, 1.9)

  // A mob you nuke from range: Offensive does almost nothing, and the model says so rather than
  // recommending it anyway. THIS is the per-mob half of the feature.
  const caster = rankOffense({ melee: 50, spell: 950 }, PAL_STANCES)
  assert.equal(caster[0].effect.key, 'offensive')
  assert.equal(caster[0].ratio, 1.05, 'a 5% gain is the honest answer, not a headline')

  // A mob you have only ever cast at: every measurable stance ties at 1.00x, so there is no
  // damage reason to switch at all.
  const pure = rankOffense({ melee: 0, spell: 500 }, PAL_STANCES)
  assert.ok(pure.every((r) => r.ratio === 1))
})

test('SO: un-scaling recovers your baseline from damage dealt inside Offensive', () => {
  // 2,000 melee measured while Offensive doubled it ⇒ your baseline is 1,000. Spells untouched.
  assert.deepEqual(unscaleOutgoing({ melee: 2000, spell: 300 }, 'offensive'), { melee: 1000, spell: 300 })
  // A stance with no measured effect changes nothing.
  assert.deepEqual(unscaleOutgoing({ melee: 100, spell: 50 }, 'defensive'), { melee: 100, spell: 50 })
  // The no-stance bucket ('' / null — the log printed no commit) is 1/1, never a guess.
  assert.deepEqual(unscaleOutgoing({ melee: 100, spell: 50 }, ''), { melee: 100, spell: 50 })
  assert.deepEqual(unscaleOutgoing({ melee: 100, spell: 50 }, null), { melee: 100, spell: 50 })
})

test('SO: damage dealt in an UNMEASURED stance is refused, not corrected', () => {
  // The mirror of `unmitigate` refusing Evasive. Dividing by a multiplier nobody has measured is
  // an invention, so the sample says nothing and the caller must drop it.
  assert.equal(unscaleOutgoing({ melee: 900, spell: 100 }, 'striker'), null)
  assert.equal(unscaleOutgoing({ melee: 900, spell: 100 }, 'berserker'), null)
})

test('SO: WITHOUT un-scaling, Offensive would hide its own effect', () => {
  // The bias this correction exists to remove, stated as a number. Suppose a mob you have only
  // fought in Offensive, where you measured 2,000 melee. Taken raw, "what would Offensive do to
  // 2,000?" answers 4,000 — comparing Offensive against a baseline that already contains it.
  const raw = rankOffense({ melee: 2000, spell: 0 }, PAL_STANCES)
  assert.equal(raw[0].expected, 4000, 'the wrong answer, and the reason unscaleOutgoing exists')

  const corrected = unscaleOutgoing({ melee: 2000, spell: 0 }, 'offensive')
  assert.ok(corrected)
  const good = rankOffense(corrected, PAL_STANCES)
  assert.equal(good[0].expected, 2000, 'Offensive returns you to what you were already doing')
  assert.equal(good[0].ratio, 2)
})

test('SO: the gain against the stance you are WEARING is what the user asked for', () => {
  const profile = { melee: 800, spell: 200 }
  // In Defensive, switching to Offensive is +80% damage (1,800 vs 1,000).
  assert.equal(offenseGain(profile, 'offensive', 'defensive'), 1.8)
  // Already in it: no gain, stated as exactly 1.
  assert.equal(offenseGain(profile, 'offensive', 'offensive'), 1)
  // Wearing something unmeasured, the app does not know — and null is NOT 1.0. Telling a Striker
  // "no difference" would be a claim about a stance this log cannot see.
  assert.equal(offenseGain(profile, 'offensive', 'striker'), null)
  // No stance ever committed: likewise unknown rather than assumed Balanced.
  assert.equal(offenseGain(profile, 'offensive', null), null)
  // Nothing measured yet ⇒ no gain to state.
  assert.equal(offenseGain({ melee: 0, spell: 0 }, 'offensive', 'defensive'), null)
})

test('SO: meleeShare is null on an empty profile, never 0', () => {
  // 0 would read as "you only cast at this mob", which is a claim. Nothing measured is not one.
  assert.equal(meleeShare({ melee: 0, spell: 0 }), null)
  assert.equal(meleeShare({ melee: 750, spell: 250 }), 0.75)
})

// ── 4. THE TRIPWIRE ─────────────────────────────────────────────────────────────────────────

test('SO: every stance the game has is either measured or explicitly unknown', () => {
  // The point of this test is the FAILURE it forces: a tenth stance (or a rename) cannot be added
  // to the game's table and silently inherit "no effect on your damage". Somebody has to either
  // measure it or write down why it cannot be measured.
  interface ClassesDb {
    stances: Record<string, string[]>
  }
  const db = JSON.parse(readFileSync(join(HERE, '..', 'src', 'main', 'data', 'classes.json'), 'utf8')) as ClassesDb
  const all = Object.keys(db.stances).sort()
  assert.deepEqual(all, Object.keys(STANCE_EFFECTS).sort(), 'the two tables describe the same game')
  for (const key of all) {
    const measured = outgoingFor(key) !== null
    const declared = key in OFFENSE_UNKNOWN
    assert.ok(
      measured !== declared,
      `${key}: must be either measured or declared unknown, exactly one — measured=${String(measured)} declared=${String(declared)}`
    )
  }
})
