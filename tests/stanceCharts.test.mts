// THE STANCES TAB'S CHART GEOMETRY — goldens over the arithmetic that places every pixel.
//
// `src/renderer/src/features/stance/stanceChartGeometry.ts` is the whole numeric half of the three
// charts on that page; the components draw what it returns and decide nothing. So this file is
// where the drawing is pinned, and it pins the two classes of thing a screenshot cannot show:
//
//   * SCALE — the comparison chart is drawn against the UN-MITIGATED TOTAL (a fixed 0..100%), not
//     against its own longest bar. A self-normalising chart would draw the worst available stance
//     at full width on every target and silently rescale between them, so "how much of it gets
//     through" could not be read off the picture at all. The same fraction must produce the same
//     width on two different targets, and this file proves it does.
//   * REFUSAL — an Evasive sample has no recovered figure (`unmitigate` returns null: a hit that
//     got past a 95% evade is full-sized, not 5%-sized). It must come back as an ABSENT bar with
//     `lift: null`, never as a zero-height bar and never as a dropped row.
//
// ── AND THE THING THAT IS NOT HERE ──────────────────────────────────────────────────────────
//
// There is no time-series test because there is no time series. The ledger
// (src/main/combat/stanceLedger.ts) accumulates per-(mob, zone, tier, stance) TOTALS plus one
// `lastSeenTs`; there is no per-hit history and no timestamp per sample, so a damage-over-time
// chart cannot be drawn from it without inventing the samples. The geometry module's header states
// the same rule; if a future engine change adds real history, THAT is when a curve gets a test.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BAR_GAP,
  BAR_H,
  BAR_PAD_Y,
  DONUT_C,
  MIN_BAR_W,
  PLOT_W,
  PLOT_X,
  REC_BAR_GAP,
  REC_BAR_H,
  REC_ROW_GAP,
  donutSegments,
  recoveryRows,
  stanceBars
} from '../src/renderer/src/features/stance/stanceChartGeometry'
import { buildStanceRow, sampleRows } from '../src/renderer/src/features/stance/stanceRows'
import type { RankedRow, SampleRow } from '../src/renderer/src/features/stance/stanceRows'
import type { StanceAdvicePayload, StanceSample, TargetProfile } from '../src/shared/stanceAdvice'

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
  // Empty `offense`: these are the incoming-damage charts, and they must be computable from the
  // sustain measurements alone.
  return { targets: t, offense: [], currentStance: current, availableStances: stances }
}

function fatSample(stanceKey: string, physical: number, magical: number, hits = 200): StanceSample {
  return { stanceKey, physical, magical, hits }
}

/** A hand-made ranked row, for the widths that no real ranking produces (0%, 100%). */
function ranked(over: Partial<RankedRow> = {}): RankedRow {
  return {
    key: 'defensive',
    name: 'Defensive',
    fraction: 0.5,
    percent: '50%',
    expected: 500,
    recommended: false,
    emergency: false,
    current: false,
    enduranceGated: false,
    free: false,
    ...over
  }
}

// ── 1. THE STANCE COMPARISON ────────────────────────────────────────────────────────────────

test('SC: a bar is its fraction of the plot, and the plot is what the mob swings for', () => {
  const [half, all, none] = stanceBars([
    ranked({ key: 'a', fraction: 0.5 }),
    ranked({ key: 'b', fraction: 1 }),
    ranked({ key: 'c', fraction: 0 })
  ]).bars
  assert.equal(half.w, PLOT_W / 2)
  assert.equal(all.w, PLOT_W)
  // The floor exists so a zero never draws as a missing row — and `rawW` keeps the honest number.
  assert.equal(none.w, MIN_BAR_W)
  assert.equal(none.rawW, 0)
  // Everything starts at the same left edge: the bars are comparable lengths, not offsets.
  assert.deepEqual([half.x, all.x, none.x], [PLOT_X, PLOT_X, PLOT_X])
})

test('SC: the scale is FIXED — the same fraction is the same width on two different targets', () => {
  // A self-normalising chart would make these two 62% bars different lengths, because the worst
  // stance in each ranking differs. That is the bug this assertion exists to prevent.
  const a = stanceBars([ranked({ fraction: 0.62 }), ranked({ key: 'x', fraction: 0.9 })]).bars[0]
  const b = stanceBars([ranked({ fraction: 0.62 }), ranked({ key: 'x', fraction: 0.05 })]).bars[0]
  assert.equal(a.w, b.w)
  assert.equal(a.w, 0.62 * PLOT_W)
})

test('SC: rows stack on a fixed pitch and the chart is exactly as tall as its bars', () => {
  const chart = stanceBars([ranked({ key: 'a' }), ranked({ key: 'b' }), ranked({ key: 'c' })])
  assert.equal(chart.bars[0].y, BAR_PAD_Y)
  assert.equal(chart.bars[1].y - chart.bars[0].y, BAR_H + BAR_GAP)
  assert.equal(chart.height, BAR_PAD_Y * 2 + 3 * (BAR_H + BAR_GAP) - BAR_GAP)
  // The last bar's bottom sits inside the height, with the bottom pad to spare.
  const last = chart.bars[2]
  assert.equal(last.y + last.h + BAR_PAD_Y, chart.height)
  assert.equal(chart.fullX, PLOT_X + PLOT_W)
})

test('SC: an empty ranking is an empty chart, not a zero-height frame with a rule in it', () => {
  const chart = stanceBars([])
  assert.deepEqual(chart.bars, [])
  assert.equal(chart.height, 0)
})

test('SC: role comes from sustained/emergency — NEVER from position in the ranking', () => {
  // Evasive's 0.05 heads the raw arithmetic against essentially every mob. It must be drawn as
  // survive mode; the green "wear this" bar is Defensive, further down the list.
  const t = target({ samples: [fatSample('defensive', 1000, 200)] })
  const row = buildStanceRow(t, payload([t], 'balanced'))
  const chart = stanceBars(row.ranked)
  assert.equal(chart.bars[0].key, 'evasive', 'the ranking order is drawn unchanged')
  assert.equal(chart.bars[0].role, 'survive')
  const hold = chart.bars.filter((b) => b.role === 'hold')
  assert.equal(hold.length, 1)
  assert.equal(hold[0].key, 'defensive')
  // …and the shortest bar on the chart is NOT the recommended one, which is the whole point.
  assert.ok(chart.bars[0].w < hold[0].w)
})

test('SC: a loadout with nothing holdable draws no green bar at all', () => {
  const t = target({ samples: [fatSample('', 1000, 200)] })
  const row = buildStanceRow(t, payload([t], 'evasive', ['evasive', 'striker']))
  const chart = stanceBars(row.ranked)
  assert.equal(chart.bars.length, 1)
  assert.equal(chart.bars[0].role, 'survive')
  assert.ok(!chart.bars.some((b) => b.role === 'hold'), 'no fallback promotion, on the chart either')
})

test('SC: the worn stance is marked and the tag layer knows where the bar ended', () => {
  const t = target({ samples: [fatSample('defensive', 1000, 200)] })
  const row = buildStanceRow(t, payload([t], 'defensive'))
  const bars = stanceBars(row.ranked).bars
  assert.deepEqual(
    bars.filter((b) => b.current).map((b) => b.key),
    ['defensive']
  )
  // wPct is a percentage of the PLOT (not of the viewBox): the HTML tag layer is positioned
  // inside the plot span, so a bar at half width puts its tag at 50%.
  const half = stanceBars([ranked({ fraction: 0.5 })]).bars[0]
  assert.equal(half.wPct, 50)
})

// ── 2. THE COMPOSITION DONUT ────────────────────────────────────────────────────────────────

test('SC: the two arcs close the ring exactly, and the second starts where the first ended', () => {
  const [phys, mag] = donutSegments({ physical: 62, magical: 38 })
  assert.equal(phys.key, 'physical')
  assert.equal(mag.key, 'magical')
  assert.ok(Math.abs(phys.arc + mag.arc - DONUT_C) < 1e-9, 'no seam, no overlap')
  assert.equal(phys.dashOffset, 0)
  // Negative offset = "start this dash `arc` further round", which is where physical stopped.
  assert.ok(Math.abs(mag.dashOffset + phys.arc) < 1e-9)
})

test('SC: 100/0 is a full ring and a nothing, with no special case in between', () => {
  const [phys, mag] = donutSegments({ physical: 100, magical: 0 })
  assert.ok(Math.abs(phys.arc - DONUT_C) < 1e-9)
  assert.equal(mag.arc, 0)
  // A dash array is two lengths that always add to the circumference, whatever the split.
  for (const s of [phys, mag]) {
    const [on, off] = s.dashArray.split(' ').map(Number)
    assert.ok(Math.abs(on + off - DONUT_C) < 0.01)
  }
})

test('SC: the ring is drawn from the integers the panel prints, so picture and text agree', () => {
  // `splitPct` rounds the magical half and gives physical the remainder; the ring must consume
  // those two numbers rather than re-round the raw share into a third answer.
  const segs = donutSegments({ physical: 61, magical: 39 })
  assert.deepEqual(
    segs.map((s) => s.percent),
    [61, 39]
  )
  assert.ok(Math.abs(segs[0].arc / DONUT_C - 0.61) < 1e-12)
})

// ── 3. OBSERVED vs RECOVERED ────────────────────────────────────────────────────────────────

/** The pooled figure the chart's reference rule is drawn at. */
function pooledOf(rows: readonly SampleRow[]): { total: number; hits: number } {
  let total = 0
  let hits = 0
  for (const s of rows) {
    if (!s.unmitigated) continue
    total += s.unmitigated.physical + s.unmitigated.magical
    hits += s.hits
  }
  return { total, hits }
}

test('SC: bars are PER HIT, so a long sample does not out-draw a short one', () => {
  // Same mob, same swing size, wildly different exposure: 100 hits in Defensive, 10 with nothing
  // committed. Plotted raw the first would be ten times the second and the chart would be a
  // record of where the fight happened. Per hit they agree — which is the correction working.
  const rows = sampleRows([
    { stanceKey: 'defensive', physical: 1000, magical: 800, hits: 100 },
    { stanceKey: '', physical: 200, magical: 200, hits: 10 }
  ])
  const chart = recoveryRows(rows, pooledOf(rows))
  const [def, none] = chart.rows
  // Defensive: 10 physical landed per hit through a x0.5 → 20 swung for; 8 magical through x0.8 → 10.
  assert.equal(def.landed.total, 18)
  assert.ok(def.recovered)
  assert.equal(def.recovered.total, 30)
  // No stance: 20 + 20 landed per hit, and 1/1 means nothing was divided out.
  assert.equal(none.landed.total, 40)
  assert.ok(none.recovered)
  assert.equal(none.recovered.total, 40)
  // The recovered bars are within a third of each other, where the raw totals were 10:1 apart.
  assert.ok(def.recovered.w / none.recovered.w > 0.7)
})

test('SC: the lift is the multiplier that was divided out, seen from the other side', () => {
  const rows = sampleRows([{ stanceKey: 'defensive', physical: 500, magical: 0, hits: 50 }])
  const [r] = recoveryRows(rows, pooledOf(rows)).rows
  // All physical through Defensive's x0.5: the mob swung for exactly twice what landed.
  assert.ok(r.lift)
  assert.ok(Math.abs(r.lift - 2) < 1e-12)
  assert.equal(r.recovered?.magicalW, 0)
})

test('SC: a refused sample keeps its landed bar and draws NO recovered one', () => {
  const rows = sampleRows([
    { stanceKey: 'defensive', physical: 500, magical: 400, hits: 50 },
    { stanceKey: 'evasive', physical: 300, magical: 0, hits: 12 }
  ])
  const chart = recoveryRows(rows, pooledOf(rows))
  const ev = chart.rows.find((r) => r.stanceKey === 'evasive')
  assert.ok(ev, 'the row stays — the refusal is the finding, not a reason to hide it')
  assert.equal(ev.refused, true)
  assert.equal(ev.recovered, null)
  assert.equal(ev.lift, null)
  assert.ok(ev.landed.total > 0, 'what landed is still what landed')
})

test('SC: an empty bucket is not an observation and gets no row', () => {
  const rows = sampleRows([
    { stanceKey: 'defensive', physical: 500, magical: 400, hits: 50 },
    { stanceKey: 'balanced', physical: 0, magical: 0, hits: 0 }
  ])
  const chart = recoveryRows(rows, pooledOf(rows))
  assert.deepEqual(
    chart.rows.map((r) => r.stanceKey),
    ['defensive']
  )
  // Nothing at all draws nothing at all — never a frame with a rule floating in it.
  const empty = recoveryRows([], { total: 0, hits: 0 })
  assert.deepEqual(empty.rows, [])
  assert.equal(empty.height, 0)
  assert.equal(empty.pooledX, null)
})

test('SC: each bar is its two damage classes, and they add up to the bar', () => {
  const rows = sampleRows([{ stanceKey: 'defensive', physical: 500, magical: 400, hits: 50 }])
  const [r] = recoveryRows(rows, pooledOf(rows)).rows
  assert.ok(Math.abs(r.landed.physicalW + r.landed.magicalW - r.landed.w) < 1e-9)
  assert.ok(r.recovered)
  assert.ok(Math.abs(r.recovered.physicalW + r.recovered.magicalW - r.recovered.w) < 1e-9)
  // The longest thing on the chart fills the plot — that is what the width stands for.
  assert.ok(Math.abs(r.recovered.w - PLOT_W) < 1e-9)
})

test('SC: the pooled rule is on the chart, inside the plot, at the pooled average', () => {
  const rows = sampleRows([
    { stanceKey: 'defensive', physical: 1000, magical: 800, hits: 100 },
    { stanceKey: '', physical: 200, magical: 200, hits: 10 }
  ])
  const pooled = pooledOf(rows)
  const chart = recoveryRows(rows, pooled)
  assert.ok(chart.pooledPerHit)
  assert.ok(Math.abs(chart.pooledPerHit - pooled.total / pooled.hits) < 1e-12)
  assert.ok(chart.pooledX !== null)
  assert.ok(chart.pooledX >= PLOT_X && chart.pooledX <= PLOT_X + PLOT_W, 'the rule is never off the plot')
  // The scale accounts for the rule as well as the bars, so it can never be clipped off the end.
  assert.ok(chart.pooledPerHit <= chart.max)
})

test('SC: rows stack on a fixed pitch, two bars to a row', () => {
  const rows = sampleRows([
    { stanceKey: 'defensive', physical: 500, magical: 400, hits: 50 },
    { stanceKey: 'mage hunter', physical: 400, magical: 500, hits: 50 }
  ])
  const chart = recoveryRows(rows, pooledOf(rows))
  const [a, b] = chart.rows
  assert.equal(a.landedY, a.y)
  assert.equal(a.recoveredY, a.y + REC_BAR_H + REC_BAR_GAP)
  assert.equal(b.y - a.y, REC_BAR_H * 2 + REC_BAR_GAP + REC_ROW_GAP)
  assert.equal(chart.height, 2 * (REC_BAR_H * 2 + REC_BAR_GAP + REC_ROW_GAP) - REC_ROW_GAP)
})
