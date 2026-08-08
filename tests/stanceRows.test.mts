// THE STANCES TAB'S ROW BUILDER — goldens over the shaping layer, not over React.
//
// `src/renderer/src/features/stance/stanceRows.ts` is everything the view decides: it joins a
// measured target to the shared advice layer, formats the fractions, and — the part that is
// actually load-bearing — enumerates the CAVEATS. The view renders those caveats verbatim, so
// "does the endurance warning appear when Evasive wins" is a question about this module and not
// about a component tree. This repo tests pure functions (AGENTS.md), and this file is where the
// honesty requirements are pinned:
//
//   * a thin sample (< MIN_CONFIDENT_HITS pooled hits) says so, and never reads as a
//     recommendation;
//   * an Evasive win states that the 95% evade is endurance-gated and that the log never prints
//     endurance, so the app cannot verify it;
//   * dropped (evaded) hits are counted out loud, with the reason;
//   * a profile with nothing usable in it says "nothing usable", never "no damage".
//
// The arithmetic itself is NOT re-asserted here — `tests/stances.test.mts` owns the multipliers
// and the ranking. What is asserted is that this module reports what that layer decided, and
// that it never invents a number of its own (the fractions on screen come straight out of
// `adviseFor`, and `mismatchLine` prints the shared `gain` rather than re-subtracting it).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildStanceRow,
  buildStanceRows,
  caveatsFor,
  mismatchCount,
  mismatchLine,
  pct,
  sampleRows,
  splitPct,
  stanceLabel
} from '../src/renderer/src/features/stance/stanceRows'
import { adviseFor, detectMismatch, MIN_CONFIDENT_HITS } from '../src/shared/stanceAdvice'
import type { StanceAdvicePayload, StanceSample, TargetProfile } from '../src/shared/stanceAdvice'

// A Paladin-ish loadout: the three ungated defensive stances plus the gated one, plus an
// offensive stance the ranking must leave out entirely.
const LOADOUT = ['balanced', 'defensive', 'mage hunter', 'evasive', 'striker']

function target(over: Partial<TargetProfile> = {}): TargetProfile {
  return {
    mobKey: 'cazic thule',
    mobName: 'Cazic Thule',
    zoneBase: 'The Plane of Fear',
    tier: 2,
    samples: [],
    lastSeenTs: 1_700_000_000_000,
    biggestHit: 412,
    ...over
  }
}

function payload(t: TargetProfile[], current: string | null, stances = LOADOUT): StanceAdvicePayload {
  return { targets: t, currentStance: current, availableStances: stances }
}

/** A sample big enough to clear the confidence gate on its own. */
function fatSample(stanceKey: string, physical: number, magical: number, hits = 200): StanceSample {
  return { stanceKey, physical, magical, hits }
}

// ── 1. FORMATTING ───────────────────────────────────────────────────────────────────────────

test('SR: a fraction prints rounded, never truncated', () => {
  assert.equal(pct(0.617), '62%')
  assert.equal(pct(0.5), '50%')
  assert.equal(pct(0), '0%')
  assert.equal(pct(1), '100%')
  // 0.05 is Evasive's whole claim; it must not print as 0%.
  assert.equal(pct(0.05), '5%')
})

test('SR: the physical/magical split always adds to 100, and is null when unmeasured', () => {
  assert.deepEqual(splitPct(0.5), { physical: 50, magical: 50 })
  // The case that makes independent rounding look like a bug: 0.385 → 39, so physical is 61.
  assert.deepEqual(splitPct(0.385), { physical: 61, magical: 39 })
  const s = splitPct(0.6149)
  assert.ok(s)
  assert.equal(s.physical + s.magical, 100)
  assert.equal(splitPct(null), null)
})

test('SR: the empty stance key is a real bucket with a name, not a blank', () => {
  assert.equal(stanceLabel(''), 'No stance committed')
  assert.equal(stanceLabel('mage hunter'), 'Mage Hunter')
  assert.equal(stanceLabel('DEFENSIVE'), 'Defensive')
  // An unknown key is echoed, never silently mapped onto a stance we do know.
  assert.equal(stanceLabel('parry dance'), 'parry dance')
})

// ── 2. THE OBSERVATIONS TABLE ───────────────────────────────────────────────────────────────

test('SR: each observation shows the multiplier that was divided out of it', () => {
  const rows = sampleRows([
    { stanceKey: 'defensive', physical: 500, magical: 400, hits: 50 },
    { stanceKey: '', physical: 100, magical: 100, hits: 10 }
  ])
  const def = rows[0]
  assert.deepEqual(def.multiplier, { physical: 0.5, magical: 0.8 })
  // 500 landed through a ×0.5 melee reduction means the mob swung for 1000.
  assert.deepEqual(def.unmitigated, { physical: 1000, magical: 500 })
  assert.equal(def.refused, false)
  // The no-stance bucket is 1/1 — never a guessed reduction.
  assert.deepEqual(rows[1].multiplier, { physical: 1, magical: 1 })
  assert.deepEqual(rows[1].unmitigated, { physical: 100, magical: 100 })
})

test('SR: an evasive observation is REFUSED, not un-mitigated into a monster', () => {
  const [row] = sampleRows([{ stanceKey: 'evasive', physical: 300, magical: 0, hits: 12 }])
  assert.equal(row.refused, true)
  assert.equal(row.unmitigated, null)
  // The raw observation survives — the table shows what landed even though it proves nothing.
  assert.deepEqual(row.observed, { physical: 300, magical: 0 })
  assert.equal(row.hits, 12)
})

// ── 3. THE CAVEATS — the reason this module is tested at all ────────────────────────────────

test('SR: a thin sample says so, in hits, and names the threshold', () => {
  const t = target({ samples: [fatSample('defensive', 100, 50, 5)] })
  const advice = adviseFor(t, LOADOUT)
  assert.equal(advice.confident, false)
  const kinds = caveatsFor(advice, []).map((c) => c.kind)
  assert.ok(kinds.includes('thin'))
  const thin = caveatsFor(advice, []).find((c) => c.kind === 'thin')
  assert.ok(thin)
  assert.match(thin.text, /5 pooled hits/)
  assert.match(thin.text, new RegExp(String(MIN_CONFIDENT_HITS)))
  assert.match(thin.text, /not a recommendation/i)
})

test('SR: a confident sample carries no thin caveat', () => {
  const t = target({ samples: [fatSample('defensive', 1000, 100, MIN_CONFIDENT_HITS)] })
  const kinds = caveatsFor(adviseFor(t, LOADOUT), []).map((c) => c.kind)
  assert.ok(!kinds.includes('thin'))
})

test('SR: when Evasive wins, the page states the evade is endurance-gated AND unverifiable', () => {
  // Evasive's 0.05 beats every ungated stance on any profile, so it heads this ranking.
  const t = target({ samples: [fatSample('defensive', 1000, 200)] })
  const advice = adviseFor(t, LOADOUT)
  assert.equal(advice.ranked[0].effect.key, 'evasive')
  const gated = caveatsFor(advice, []).find((c) => c.kind === 'gated')
  assert.ok(gated, 'an endurance-gated winner must carry the caveat')
  assert.match(gated.text, /Evasive/)
  assert.match(gated.text, /endurance/i)
  // THE LOAD-BEARING CLAUSE: the log never prints endurance, so this cannot be checked.
  assert.match(gated.text, /log never prints endurance/i)
})

test('SR: no gated caveat when the winner is an ordinary stance', () => {
  const t = target({ samples: [fatSample('defensive', 1000, 200)] })
  const advice = adviseFor(t, ['balanced', 'defensive', 'mage hunter'])
  assert.equal(advice.ranked[0].effect.key, 'defensive')
  assert.ok(!caveatsFor(advice, []).some((c) => c.kind === 'gated'))
})

test('SR: dropped hits are counted out loud, with the stance they were dropped from', () => {
  const t = target({
    samples: [fatSample('defensive', 1000, 200), { stanceKey: 'evasive', physical: 90, magical: 0, hits: 7 }]
  })
  const advice = adviseFor(t, LOADOUT)
  assert.equal(advice.evadedHitsIgnored, 7)
  const evaded = caveatsFor(advice, ['Evasive']).find((c) => c.kind === 'evaded')
  assert.ok(evaded)
  assert.match(evaded.text, /^7 hits/)
  assert.match(evaded.text, /Evasive/)
  // …and WHY: a hit that gets past a 95% evade is full-sized.
  assert.match(evaded.text, /full-sized/)
})

test('SR: a profile measured entirely inside Evasive reads as "nothing usable", not "no damage"', () => {
  const t = target({ samples: [{ stanceKey: 'evasive', physical: 900, magical: 300, hits: 30 }] })
  const advice = adviseFor(t, LOADOUT)
  assert.equal(advice.hits, 0)
  assert.deepEqual(advice.ranked, [])
  const kinds = caveatsFor(advice, ['Evasive']).map((c) => c.kind)
  assert.deepEqual(kinds, ['nothing', 'evaded'])
  // Not "thin" — thin implies a small real measurement. There is none.
  assert.ok(!kinds.includes('thin'))
})

test('SR: a loadout with no defensive stance says so rather than showing an empty list', () => {
  const t = target({ samples: [fatSample('', 1000, 200)] })
  const advice = adviseFor(t, ['striker', 'berserker', 'offensive'])
  assert.deepEqual(advice.ranked, [])
  assert.ok(caveatsFor(advice, []).some((c) => c.kind === 'noStances'))
})

// ── 4. THE ROW ──────────────────────────────────────────────────────────────────────────────

test('SR: a row reports the shared layer verbatim — no second opinion in the renderer', () => {
  const t = target({ samples: [fatSample('defensive', 1000, 200)] })
  const p = payload([t], 'defensive')
  const row = buildStanceRow(t, p)
  const advice = adviseFor(t, LOADOUT)
  assert.deepEqual(row.advice, advice)
  assert.deepEqual(
    row.ranked.map((r) => r.key),
    advice.ranked.map((r) => r.effect.key)
  )
  assert.deepEqual(
    row.ranked.map((r) => r.fraction),
    advice.ranked.map((r) => r.fraction)
  )
  assert.deepEqual(row.mismatch, detectMismatch(t, LOADOUT, 'defensive'))
  // Exactly one `best`, and `current` follows the worn stance rather than the ranking.
  assert.equal(row.ranked.filter((r) => r.best).length, 1)
  assert.deepEqual(
    row.ranked.filter((r) => r.current).map((r) => r.key),
    ['defensive']
  )
})

test('SR: the row states its identity — mob, zone, tier label, and a key that separates tiers', () => {
  const d0 = buildStanceRow(target({ tier: 0 }), payload([], null))
  const d2 = buildStanceRow(target({ tier: 2 }), payload([], null))
  assert.equal(d0.tierLabel, 'D0 · base')
  assert.equal(d2.tierLabel, 'D2 · Adaptive')
  // A d0 Cazic-Thule and a d2 Cazic-Thule are different fights and must never share a card.
  assert.notEqual(d0.key, d2.key)
  assert.equal(d2.key, 'cazic thule|The Plane of Fear|2')
  assert.equal(d2.mobName, 'Cazic Thule')
  assert.equal(d2.zoneBase, 'The Plane of Fear')
})

test('SR: usedSamples counts what reached the pool, so the correction line cannot overclaim', () => {
  const t = target({
    samples: [
      fatSample('defensive', 1000, 200),
      fatSample('mage hunter', 400, 900),
      { stanceKey: 'evasive', physical: 50, magical: 0, hits: 3 },
      { stanceKey: 'balanced', physical: 0, magical: 0, hits: 0 }
    ]
  })
  const row = buildStanceRow(t, payload([t], 'defensive'))
  // Two real contributions; the evasive sample was refused and the empty one contributed nothing.
  assert.equal(row.usedSamples, 2)
  assert.equal(row.samples.length, 4)
  assert.equal(row.samples.filter((s) => s.refused).length, 1)
})

test('SR: targets sort most-recently-hit first, whatever order the payload arrived in', () => {
  const old = target({ mobKey: 'a fetid fiend', mobName: 'a fetid fiend', lastSeenTs: 1000 })
  const recent = target({ mobKey: 'cazic thule', lastSeenTs: 9000 })
  const rows = buildStanceRows(payload([old, recent], null))
  assert.deepEqual(
    rows.map((r) => r.mobName),
    ['Cazic Thule', 'a fetid fiend']
  )
})

// ── 5. THE MISMATCH CALLOUT ─────────────────────────────────────────────────────────────────

test('SR: the wrong-stance sentence names both fractions and the gain the shared layer computed', () => {
  // Wearing Striker (offensive, 1/1) against a mob that is beating on you is the case the
  // mismatch detector exists to catch: it takes 100% of everything.
  const t = target({ samples: [fatSample('', 1000, 200)] })
  const m = detectMismatch(t, LOADOUT, 'striker')
  assert.ok(m, 'Striker against a hitting mob must be a mismatch')
  const line = mismatchLine(m)
  assert.match(line, /You are in Striker/)
  assert.match(line, /Cazic Thule/)
  assert.match(line, new RegExp(pct(m.currentFraction)))
  assert.match(line, new RegExp(pct(m.bestFraction)))
  assert.match(line, new RegExp(pct(m.gain)))
})

test('SR: no callout when the log never said which stance you are in', () => {
  const t = target({ samples: [fatSample('', 1000, 200)] })
  const row = buildStanceRow(t, payload([t], null))
  assert.equal(row.mismatch, null)
  assert.equal(row.currentStanceKey, null)
  assert.equal(mismatchCount([row]), 0)
})

test('SR: no callout on a thin sample, however wrong the stance looks', () => {
  const t = target({ samples: [fatSample('', 1000, 200, 3)] })
  const row = buildStanceRow(t, payload([t], 'striker'))
  assert.equal(row.advice.confident, false)
  assert.equal(row.mismatch, null, 'the alert must never fire off three hits')
  assert.ok(row.caveats.some((c) => c.kind === 'thin'))
})

test('SR: mismatchCount counts the cards that carry a callout', () => {
  const bad = target({ mobKey: 'cazic thule', samples: [fatSample('', 1000, 200)] })
  const quiet = target({ mobKey: 'a fetid fiend', mobName: 'a fetid fiend', samples: [] })
  const rows = buildStanceRows(payload([bad, quiet], 'striker'))
  assert.equal(mismatchCount(rows), 1)
})
