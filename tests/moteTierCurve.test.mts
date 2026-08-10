// THE UPGRADE-CURVE CHART'S GEOMETRY (moteChartGeometry.ts `tierCostBars`).
//
// The Motes tab's other two charts are made of the log and are pinned in tests/moteCharts.test.mts.
// This one is made of the WIKI's fixed eleven-row table (`shared/moteUpgrades.ts UPGRADE_TIERS`),
// and it exists to make one fact unmissable: the curve doubles, so the step from +9 to +10 costs
// more than every step before it put together. That claim is a PICTURE, and a picture can be wrong
// in a way a screenshot hides — hence these tests.
//
// The three things worth pinning:
//
//   1. THE SCALE IS THE LARGEST STEP (512) and the bars are LINEAR against it. A log scale, or a
//      scale taken from the running total instead of the step, would flatten exactly the shape the
//      chart is drawn for.
//   2. THE CAP GETS A ROW AND NO BAR. +10 is not a step of size zero — there is no step. Same rule
//      the zone chart applies to a zone with no measured rate.
//   3. THE SLIVERS ARE REAL. 1 exp against 512 is sub-pixel and is floored to `MIN_BAR_W`, with
//      `rawW` keeping the honest width, exactly as the farming charts do.
//
// Imported RELATIVELY: node tests run through tsx with no `@shared` alias, and the geometry
// module's only imports are TYPE-only, so nothing follows it into the test process.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_TIER_XP, UPGRADE_TIERS, gearMergeXp } from '../src/shared/moteUpgrades'
import {
  BAR_PAD_Y,
  CURVE_BAR_H,
  MIN_BAR_W,
  PLOT_W,
  PLOT_X,
  tierCostBars
} from '../src/renderer/src/features/motes/moteChartGeometry'

test('MTC: one row per tier, in the table’s order, and the geometry never re-sorts', () => {
  const chart = tierCostBars(UPGRADE_TIERS)
  assert.equal(chart.bars.length, UPGRADE_TIERS.length)
  assert.deepEqual(chart.bars.map((b) => b.tier), UPGRADE_TIERS.map((t) => t.tier))
  for (const b of chart.bars) assert.equal(b.x, PLOT_X)
  assert.equal(chart.bars[0].y, BAR_PAD_Y)
  assert.equal(chart.bars[0].textY, BAR_PAD_Y + CURVE_BAR_H / 2, 'text is centred on its bar')
})

test('MTC: the scale is the biggest STEP, and the bars are linear against it', () => {
  const chart = tierCostBars(UPGRADE_TIERS)
  assert.equal(chart.scaleMax, 512, 'the +9 → +10 step')
  const step9 = chart.bars.find((b) => b.tier === 9)!
  assert.equal(step9.w, PLOT_W, 'the dearest step fills the plot')
  assert.equal(step9.wPct, 100)
  // Linear: a step half the size is half the bar. Tier 8 costs 256 against 512.
  const step8 = chart.bars.find((b) => b.tier === 8)!
  assert.equal(step8.rawW.toFixed(4), (PLOT_W / 2).toFixed(4))
})

/**
 * THE SHAPE IS THE ADVICE, so it gets asserted rather than left to the eye: every step from +0 to
 * +8 put together is 511 units of cost, and the single last step is 512.
 */
test('MTC: the last step outweighs every step before it, in the drawn widths too', () => {
  const chart = tierCostBars(UPGRADE_TIERS)
  const before = chart.bars.filter((b) => b.tier < 9).reduce((s, b) => s + (b.toNextXp ?? 0), 0)
  const last = chart.bars.find((b) => b.tier === 9)!.toNextXp
  assert.equal(before, 511)
  assert.equal(last, 512)
  assert.ok(last > before)
  // And the picture says the same thing: every earlier bar together is under one plot width.
  const drawn = chart.bars.filter((b) => b.tier < 9).reduce((s, b) => s + b.rawW, 0)
  assert.ok(drawn < PLOT_W)
})

test('MTC: the cap is a row with NO bar — there is no step out of +10', () => {
  const chart = tierCostBars(UPGRADE_TIERS)
  const cap = chart.bars[chart.bars.length - 1]
  assert.equal(cap.tier, 10)
  assert.equal(cap.advances, false)
  assert.equal(cap.toNextXp, null)
  assert.equal(cap.w, 0, 'a zero-width bar would claim a cost of nothing')
  assert.equal(cap.wPct, 0)
  // …and it still carries the two numbers its row prints.
  assert.equal(cap.totalXp, MAX_TIER_XP)
  assert.equal(cap.itemBonusPct, 100)
  assert.equal(chart.totalToMax, MAX_TIER_XP)
})

test('MTC: a real but tiny step is floored to a visible sliver, and rawW keeps the truth', () => {
  const chart = tierCostBars(UPGRADE_TIERS)
  const first = chart.bars[0]
  assert.equal(first.toNextXp, 1)
  assert.ok(first.rawW < MIN_BAR_W, 'one exp against 512 really is sub-pixel')
  assert.equal(first.w, MIN_BAR_W, 'and it is drawn anyway — “nearly free” is not “free”')
})

/** Every number the chart draws is the model's; nothing is re-derived in renderer geometry. */
test('MTC: the drawn numbers are UPGRADE_TIERS’, row for row', () => {
  const chart = tierCostBars(UPGRADE_TIERS)
  for (const t of UPGRADE_TIERS) {
    const b = chart.bars.find((x) => x.tier === t.tier)!
    assert.equal(b.toNextXp, t.toNextXp, `tier ${String(t.tier)} step`)
    assert.equal(b.totalXp, t.totalXp, `tier ${String(t.tier)} total`)
    assert.equal(b.itemBonusPct, t.itemBonusPct, `tier ${String(t.tier)} bonus`)
    // The step out of a tier is exactly what a duplicate of that tier hands over — the fact the
    // "items or spells" panel beside this chart is built on.
    if (t.toNextXp !== null) assert.equal(b.toNextXp, gearMergeXp(t.tier))
  }
})

test('MTC: an empty table draws nothing and divides by nothing', () => {
  const chart = tierCostBars([])
  assert.deepEqual(chart.bars, [])
  assert.equal(chart.height, 0)
  assert.equal(chart.scaleMax, 0)
  assert.equal(chart.totalToMax, 0)
})
