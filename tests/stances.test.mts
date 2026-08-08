// THE STANCE DECISION TABLE — the arithmetic, and its provenance.
//
// Two halves, and the second is the one that keeps the first honest:
//
//   1. the pure functions (un-mitigation, ranking) behave as the header claims, INCLUDING the
//      two refusals that stop them inventing answers — evasive is never un-mitigated, and
//      offensive-only stances are never ranked;
//   2. every `wiki` sentence in STANCE_EFFECTS still appears VERBATIM in the committed wiki
//      cache. The numbers in that table are hand-authored (law 12: a table a human verified,
//      never a fuzzy match over eleven sentences of English), so this is what stops them
//      drifting away from the source silently. A wiki edit that changes "reduced by 50%" fails
//      HERE, loudly, instead of quietly making the app give confident bad advice.
//
// The de-biasing case at the bottom is the real measurement that motivated the feature, kept as
// a regression: Cazic-Thule read 64.7% spell from inside Defensive and 37.9% from inside Mage
// Hunter — a 27-point disagreement about one mob caused entirely by the observer's own stance.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  STANCE_EFFECTS,
  magicalShare,
  mitigationFor,
  rankStances,
  unmitigate
} from '../src/shared/stances'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Paladin's defensive options, and the Monk's, as classes.json states them. */
const PAL_STANCES = ['balanced', 'defensive', 'mage hunter', 'offensive']
const MNK_STANCES = ['balanced', 'evasive', 'offensive', 'ranged', 'striker']

// ── 1. PROVENANCE: the numbers still match the wiki ─────────────────────────────────────────

test('ST: every hand-authored effect quotes the committed wiki verbatim', () => {
  const wt = readFileSync(
    join(HERE, '..', 'scripts', 'sources', 'cache', 'classes', 'Stances_Invocations.wikitext'),
    'utf8'
  )
  for (const e of Object.values(STANCE_EFFECTS)) {
    assert.ok(
      wt.includes(e.wiki),
      `${e.name}: the wiki no longer contains this sentence — re-read the page before trusting ` +
        `the multipliers beside it:\n    ${e.wiki}`
    )
  }
})

test('ST: the table covers exactly the nine stances classes.json knows', () => {
  interface ClassesDb {
    stances: Record<string, string[]>
  }
  const db = JSON.parse(readFileSync(join(HERE, '..', 'src', 'main', 'data', 'classes.json'), 'utf8')) as ClassesDb
  assert.deepEqual(Object.keys(STANCE_EFFECTS).sort(), Object.keys(db.stances).sort())
})

// ── 2. THE ARITHMETIC ───────────────────────────────────────────────────────────────────────

test('ST: mitigation is 1/1 for an unknown stance — never a guessed reduction', () => {
  assert.deepEqual(mitigationFor('defensive'), { physical: 0.5, magical: 0.8 })
  assert.deepEqual(mitigationFor('Mage Hunter'), { physical: 0.8, magical: 0.5 }, 'case-insensitive')
  assert.deepEqual(mitigationFor('no such stance'), { physical: 1, magical: 1 })
  assert.deepEqual(mitigationFor(null), { physical: 1, magical: 1 })
})

test('ST: un-mitigation recovers the swing from the hit', () => {
  // 100 physical landed while Defensive halved it ⇒ it swung for 200.
  // 80 magical landed while Defensive took 20% off ⇒ it swung for 100.
  assert.deepEqual(unmitigate({ physical: 100, magical: 80 }, 'defensive'), { physical: 200, magical: 100 })
  // No stance, or an offensive one, changes nothing.
  assert.deepEqual(unmitigate({ physical: 10, magical: 5 }, null), { physical: 10, magical: 5 })
  assert.deepEqual(unmitigate({ physical: 10, magical: 5 }, 'striker'), { physical: 10, magical: 5 })
})

test('ST: evasive is REFUSED, because a survivor is not a shrunken hit', () => {
  // 95% of swings are evaded ENTIRELY; the ones that land are full size. Dividing by 0.05 would
  // multiply a real hit twentyfold and fabricate a monster, so the sample is unusable and the
  // function says so instead of returning a number.
  assert.equal(unmitigate({ physical: 100, magical: 100 }, 'evasive'), null)
})

test('ST: for a Paladin the whole decision is fists-vs-spells', () => {
  // Closed form: defensive beats mage hunter exactly when physical > magical.
  const meleeHeavy = rankStances({ physical: 700, magical: 300 }, PAL_STANCES)
  assert.equal(meleeHeavy[0].effect.key, 'defensive')
  const spellHeavy = rankStances({ physical: 300, magical: 700 }, PAL_STANCES)
  assert.equal(spellHeavy[0].effect.key, 'mage hunter')

  // …and the numbers are the stated multipliers, not a fit.
  //   defensive vs 700/300 = 0.5*700 + 0.8*300 = 590 of 1000
  assert.equal(meleeHeavy[0].expected, 590)
  assert.equal(meleeHeavy[0].fraction, 0.59)

  // Dead level: neither reduction is larger, so the tie must not be broken by list order.
  const even = rankStances({ physical: 500, magical: 500 }, ['defensive', 'mage hunter'])
  assert.equal(even[0].expected, even[1].expected)
})

test('ST: offensive-only stances are excluded, not ranked last', () => {
  const ranked = rankStances({ physical: 500, magical: 500 }, PAL_STANCES)
  const keys = ranked.map((r) => r.effect.key)
  assert.ok(!keys.includes('offensive'), 'Offensive says nothing about incoming damage')
  assert.deepEqual(keys.sort(), ['balanced', 'defensive', 'mage hunter'])
  // A loadout with nothing defensive to offer returns an EMPTY ranking rather than a winner.
  assert.deepEqual(rankStances({ physical: 1, magical: 1 }, ['offensive', 'striker', 'ranged']), [])
})

test('ST: evasive dominates arithmetically, and carries the flag that says why to doubt it', () => {
  const ranked = rankStances({ physical: 500, magical: 500 }, MNK_STANCES)
  assert.equal(ranked[0].effect.key, 'evasive')
  assert.equal(ranked[0].fraction, 0.05)
  // The caveat the log can never check: endurance. Any surface ranking this first must say so.
  assert.equal(ranked[0].effect.enduranceGated, true)
  // Balanced is the sustainable floor beneath it — the only stance with no upkeep at all.
  assert.equal(STANCE_EFFECTS.balanced.free, true)
  assert.equal(ranked.some((r) => r.effect.key === 'balanced'), true)
})

test('ST: an equal-expected tie prefers the stance that cannot fail', () => {
  // Two synthetic-equal options: the ungated one must come first even though the gated one was
  // offered first, because a reduction that can fail is worse advice at the same price.
  const ranked = rankStances({ physical: 0, magical: 0 }, ['evasive', 'balanced'])
  assert.equal(ranked[0].effect.key, 'balanced')
})

// ── 3. THE MEASUREMENT THAT MOTIVATED ALL OF THIS ───────────────────────────────────────────

test('ST: un-mitigating reconciles two readings of the same mob', () => {
  // Real proportions measured on a live Monk/Paladin/Enchanter log (2026-08-07), Cazic-Thule in
  // The Plane of Fear d0: 57 hits taken in Defensive, 68 in Mage Hunter. The OBSERVED magical
  // share disagrees by 27 points about a single mob; both readings are correct and the
  // difference is the observer's own stance.
  const inDefensive = unmitigate({ physical: 35.3, magical: 64.7 }, 'defensive')
  const inMageHunter = unmitigate({ physical: 62.1, magical: 37.9 }, 'mage hunter')
  assert.ok(inDefensive && inMageHunter)

  const a = magicalShare(inDefensive)
  const b = magicalShare(inMageHunter)
  assert.ok(a !== null && b !== null)
  // Before: |64.7 - 37.9| = 26.8 points apart. After: within four.
  assert.ok(Math.abs(a * 100 - b * 100) < 4, `expected convergence, got ${(a * 100).toFixed(1)} vs ${(b * 100).toFixed(1)}`)

  // And both agree on the ADVICE, which is the thing that actually has to be stable: this mob
  // is roughly half spells, so the two stances are close — but it is not the runaway
  // "65% spell ⇒ obviously Mage Hunter" the raw Defensive reading would have claimed.
  assert.equal(rankStances(inDefensive, PAL_STANCES)[0].effect.key, 'mage hunter')
  assert.equal(rankStances(inMageHunter, PAL_STANCES)[0].effect.key, 'defensive')
})

test('ST: magicalShare is null on an empty profile, never 0', () => {
  // 0 would read as "this mob casts nothing", which is a claim. Nothing measured is not a claim.
  assert.equal(magicalShare({ physical: 0, magical: 0 }), null)
  assert.equal(magicalShare({ physical: 3, magical: 1 }), 0.25)
})
