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
// ── AND, SINCE THE SPLIT: THE HEADLINE IS `sustained` ───────────────────────────────────────
//
// `shared/stances.ts` now separates `bestSustained` from `bestEmergency`, because Evasive's 0.05
// dominates the raw arithmetic against essentially every mob while costing two endurance per
// point evaded and failing outright when endurance runs out — "temp/survive mode", in the
// player's words, and the log never prints endurance so the app can never verify otherwise.
// A split the UI quietly un-splits is worse than no split, so this file pins the renderer's half
// of it: `calloutFor` reads `advice.sustained` and NEVER falls back to the gated pick, exactly
// one ranked row is flagged `recommended` (and it is not `ranked[0]` when Evasive is available),
// and the endurance sentence rides `display: 'survive'` so it renders on the escape hatch rather
// than over the recommendation.
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
  calloutFor,
  caveatsAt,
  caveatsFor,
  defaultTargetKey,
  mismatchCount,
  mismatchLine,
  pct,
  resolveSelection,
  sampleRows,
  splitPct,
  stanceLabel,
  surviveLine,
  visibleTargets
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

test('SR: when Evasive is on offer, the page states the evade is endurance-gated AND unverifiable', () => {
  // Evasive's 0.05 beats every ungated stance on any profile, so it heads this ranking.
  const t = target({ samples: [fatSample('defensive', 1000, 200)] })
  const advice = adviseFor(t, LOADOUT)
  assert.equal(advice.ranked[0].effect.key, 'evasive')
  const gated = caveatsFor(advice, []).find((c) => c.kind === 'gated')
  assert.ok(gated, 'an endurance-gated option must carry the caveat')
  assert.match(gated.text, /Evasive/)
  assert.match(gated.text, /endurance/i)
  // THE LOAD-BEARING CLAUSE: the log never prints endurance, so this cannot be checked.
  assert.match(gated.text, /log never prints endurance/i)
  // …and it is attached to the survive-mode block, not floating above the recommendation.
  assert.equal(gated.display, 'survive')
})

test('SR: no gated caveat when the loadout has no endurance-gated stance at all', () => {
  const t = target({ samples: [fatSample('defensive', 1000, 200)] })
  const advice = adviseFor(t, ['balanced', 'defensive', 'mage hunter'])
  assert.equal(advice.ranked[0].effect.key, 'defensive')
  assert.equal(advice.emergency, null)
  assert.ok(!caveatsFor(advice, []).some((c) => c.kind === 'gated'))
})

test('SR: a loadout whose ONLY defensive stance is gated has no standing recommendation', () => {
  // A Monk who has committed nothing but Evasive: the ranking is non-empty and every entry in it
  // can fail. The honest answer is "there is nothing to hold", never a quiet promotion.
  const t = target({ samples: [fatSample('', 1000, 200)] })
  const advice = adviseFor(t, ['evasive', 'striker'])
  assert.equal(advice.ranked.length, 1)
  assert.equal(advice.sustained, null)
  const kinds = caveatsFor(advice, []).map((c) => c.kind)
  assert.ok(kinds.includes('noSustained'))
  assert.ok(!kinds.includes('noStances'), 'there IS a ranking — it is just unholdable')
  const row = buildStanceRow(t, payload([t], 'evasive', ['evasive', 'striker']))
  assert.equal(row.sustained, null)
  assert.ok(row.emergency)
  assert.equal(row.emergency.key, 'evasive')
  const c = calloutFor(row)
  assert.equal(c.stance, null, 'the callout must NEVER fall back to the gated pick')
  assert.match(c.heading, /no standing recommendation/i)
})

test('SR: every caveat declares how loudly it is allowed to speak', () => {
  const t = target({
    samples: [fatSample('defensive', 1000, 200, 5), { stanceKey: 'evasive', physical: 90, magical: 0, hits: 7 }]
  })
  const caveats = caveatsFor(adviseFor(t, LOADOUT), ['Evasive'])
  // The two load-bearing statements stay visible prose; the dropped-hit count is the only one
  // allowed to shrink to a chip, and it keeps its whole sentence on the hover.
  assert.deepEqual(
    caveatsAt(caveats, 'banner').map((c) => c.kind),
    ['thin']
  )
  assert.deepEqual(
    caveatsAt(caveats, 'survive').map((c) => c.kind),
    ['gated']
  )
  const chips = caveatsAt(caveats, 'chip')
  assert.deepEqual(
    chips.map((c) => c.kind),
    ['evaded']
  )
  assert.equal(chips[0].short, '7 hits dropped')
  assert.match(chips[0].text, /full-sized/)
  // Every caveat carries both, always — a component may pick a color, never a meaning.
  assert.ok(caveats.every((c) => c.short.length > 0 && (c.tone === 'warn' || c.tone === 'info')))
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
  // Exactly one `recommended`, and `current` follows the worn stance rather than the ranking.
  assert.equal(row.ranked.filter((r) => r.recommended).length, 1)
  assert.deepEqual(
    row.ranked.filter((r) => r.current).map((r) => r.key),
    ['defensive']
  )
})

test('SR: the flagged row is the SUSTAINED pick, never the arithmetic winner', () => {
  // Evasive heads `ranked` here — 0.05 beats everything — and must head nothing on the card.
  const t = target({ samples: [fatSample('defensive', 1000, 200)] })
  const row = buildStanceRow(t, payload([t], 'balanced'))
  assert.equal(row.ranked[0].key, 'evasive', 'the raw arithmetic is unchanged and still visible')
  assert.equal(row.ranked[0].recommended, false)
  assert.equal(row.ranked[0].emergency, true)
  assert.ok(row.sustained)
  assert.equal(row.sustained.key, 'defensive')
  assert.equal(row.sustained.recommended, true)
  assert.ok(row.emergency)
  assert.equal(row.emergency.key, 'evasive')
  // The row objects are the SAME objects the list renders, so the callout cannot drift from the
  // bar it highlights.
  assert.equal(row.sustained, row.ranked.find((r) => r.key === 'defensive'))
  assert.equal(row.emergency, row.ranked[0])
})

test('SR: the callout names the stance to HOLD, and says whether you are already in it', () => {
  const t = target({ samples: [fatSample('defensive', 1000, 200)] })
  const wearing = calloutFor(buildStanceRow(t, payload([t], 'defensive')))
  assert.ok(wearing.stance)
  assert.equal(wearing.stance.key, 'defensive')
  assert.equal(wearing.heading, 'Stay in')
  const switching = calloutFor(buildStanceRow(t, payload([t], 'balanced')))
  assert.equal(switching.heading, 'Wear')
  // The figure the callout prints is the shared layer's own fraction, formatted once.
  assert.ok(switching.stance)
  assert.equal(switching.stance.percent, pct(adviseFor(t, LOADOUT).sustained?.fraction ?? -1))
  assert.match(switching.detail, /HOLD/)
})

test('SR: the survive line describes an action with an end to it, not a place to live', () => {
  const row = buildStanceRow(target({ samples: [fatSample('defensive', 1000, 200)] }), payload([], 'balanced'))
  assert.ok(row.emergency)
  const line = surviveLine(row.emergency)
  assert.match(line, /Evasive/)
  assert.match(line, /5%/)
  assert.match(line, /not a stance to stand in/i)
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

// ── 6. WHICH TARGET THE PAGE OPENS ON ───────────────────────────────────────────────────────
//
// The tab is master/detail now: ONE panel plus a selector, so "which one" is a decision the
// module makes rather than an accident of scroll position. The rule is "most recent WITH USABLE
// DATA", and the interesting half of it is the exclusion — a target whose every hit landed while
// Evasive was worn pools to zero usable hits (`unmitigate` refuses those samples), so its panel is
// a caveat and nothing else. It stays in the list; it must not be what the page opens on.

/** A target measured entirely inside Evasive: real hits, nothing the app may say a word about. */
function evadedOnly(over: Partial<TargetProfile> = {}): TargetProfile {
  return target({ samples: [{ stanceKey: 'evasive', physical: 900, magical: 300, hits: 30 }], ...over })
}

test('SR: the page opens on the most recent target that has usable data', () => {
  const newestButBlind = evadedOnly({ mobKey: 'a spite golem', mobName: 'a spite golem', lastSeenTs: 9000 })
  const usable = target({ mobKey: 'cazic thule', lastSeenTs: 8000, samples: [fatSample('defensive', 1000, 200)] })
  const older = target({ mobKey: 'a fetid fiend', mobName: 'a fetid fiend', lastSeenTs: 1000, samples: [fatSample('', 500, 100)] })
  const rows = buildStanceRows(payload([usable, newestButBlind, older], 'defensive'))
  // Recency order is untouched — the blind target is still first in the LIST.
  assert.equal(rows[0].mobName, 'a spite golem')
  assert.equal(rows[0].advice.hits, 0)
  // …and the page opens on the one below it, which has something to say.
  assert.equal(defaultTargetKey(rows), rows[1].key)
  assert.equal(resolveSelection(rows, null)?.mobName, 'Cazic Thule')
})

test('SR: when NOTHING is usable the newest target is still shown, caveat and all', () => {
  // The alternative is a blank right-hand column, which reads as a broken page rather than as
  // "everything this session hit you through an evade".
  const rows = buildStanceRows(payload([evadedOnly()], 'evasive'))
  const sel = resolveSelection(rows, null)
  assert.equal(sel, rows[0])
  assert.equal(sel?.advice.hits, 0)
  assert.ok(sel?.caveats.some((c) => c.kind === 'nothing'))
})

test('SR: nothing measured at all selects nothing — the view draws its empty state', () => {
  assert.equal(defaultTargetKey([]), null)
  assert.equal(resolveSelection([], null), null)
  assert.equal(resolveSelection([], 'cazic thule|The Plane of Fear|2'), null)
})

test('SR: a pick wins over the default, including a pick with no usable data', () => {
  const blind = evadedOnly({ mobKey: 'a spite golem', mobName: 'a spite golem', lastSeenTs: 9000 })
  const usable = target({ lastSeenTs: 8000, samples: [fatSample('defensive', 1000, 200)] })
  const rows = buildStanceRows(payload([blind, usable], 'defensive'))
  // The default rule decides where the page STARTS; it never overrides a user who asked.
  assert.equal(resolveSelection(rows, rows[0].key)?.mobName, 'a spite golem')
})

test('SR: a selection that vanished under a refresh falls back to the default, never to blank', () => {
  // The ledger is capped (drop-least-recently-hit) and reset outright on a character switch, so a
  // held key really can stop existing while the panel is open.
  const rows = buildStanceRows(payload([target({ samples: [fatSample('defensive', 1000, 200)] })], 'defensive'))
  const gone = resolveSelection(rows, 'a spite golem|The Plane of Hate|0')
  assert.ok(gone)
  assert.equal(gone.key, defaultTargetKey(rows))
})

test('SR: the selector never hides the row it is selecting', () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    target({ mobKey: `mob ${String(i)}`, mobName: `mob ${String(i)}`, lastSeenTs: 10_000 - i, samples: [fatSample('', 100, 100)] })
  )
  const rows = buildStanceRows(payload(many, null))
  const capped = visibleTargets(rows, rows[0].key, 5)
  assert.equal(capped.length, 5, 'the cap holds when the selection is already inside it')
  // A selection past the cap is APPENDED rather than swapped in: the recency order of the head is
  // what makes the list scannable, and a list missing its own current row has no visible state.
  const deep = visibleTargets(rows, rows[20].key, 5)
  assert.equal(deep.length, 6)
  assert.equal(deep[5], rows[20])
  assert.deepEqual(deep.slice(0, 5), rows.slice(0, 5))
  // Nothing selected, or a key that is gone, leaves the plain slice.
  assert.equal(visibleTargets(rows, null, 5).length, 5)
  assert.equal(visibleTargets(rows, 'not a key', 5).length, 5)
  assert.equal(visibleTargets(rows, rows[0].key, rows.length).length, rows.length)
})
