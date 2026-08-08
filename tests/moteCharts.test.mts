// THE MOTES TAB'S CHART GEOMETRY (src/renderer/src/features/motes/moteChartGeometry.ts).
//
// Geometry is the part of a chart that can be wrong in a way a screenshot hides — a bar drawn at
// the wrong fraction still looks like a bar — so it is the part that gets a node:test, exactly as
// tests/stanceCharts.test.mts does for the stance charts. No React is mounted here; the components
// draw what these functions return and decide nothing numeric.
//
// The four things worth pinning:
//
//   1. THE ZONE SCALE IS THE BEST MEASURED ZONE. There is no "100%" for a farming rate, so the top
//      bar is always full width and every other bar is a share of it. A scale taken from something
//      else — or from a row with no rate — would silently rescale the whole picture.
//   2. AN UNMEASURED ZONE GETS NO BAR AT ALL. `expPerHourActive === null` means "no active time to
//      divide by", and a zero-width bar would say the rate was measured and found to be nothing.
//   3. THE LADDER'S TWO BARS ARE ON TWO SCALES, and both maxima come back out so the component can
//      print them. A shared scale would flatten the low rungs into invisibility and hide the one
//      comparison the chart exists to make.
//   4. A REAL 1 IS NEVER INVISIBLE, and a real 0 is never a sliver. `MIN_BAR_W` floors a nonzero
//      quantity; a rung that has never dropped is `seen: false` and draws nothing.
//
// Imported RELATIVELY: node tests run through tsx with no `@shared` alias. The geometry module's
// only import is TYPE-only, so nothing follows it into the test process.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { MoteLadderRow, MoteZoneRow } from '../src/shared/moteFarming'
import { MOTE_LADDER } from '../src/shared/motes'
import {
  BAR_GAP,
  BAR_H,
  BAR_PAD_Y,
  MIN_BAR_W,
  PLOT_W,
  PLOT_X,
  ladderBars,
  zoneBars
} from '../src/renderer/src/features/motes/moteChartGeometry'

const HOUR = 3_600_000

/** A zone row with only the fields the geometry reads — the rest is the model's business. */
function zone(name: string, exp: number, expPerHour: number | null): MoteZoneRow {
  return {
    key: name.toLowerCase(),
    zone: name,
    motes: 1,
    events: 1,
    exp,
    voidTouched: 0,
    activeMs: expPerHour === null ? 0 : HOUR,
    spanMs: expPerHour === null ? 0 : HOUR,
    expPerHourActive: expPerHour,
    motesPerHourActive: expPerHour === null ? null : 1,
    tiers: [],
    firstTs: 0,
    lastTs: 0
  }
}

/** The ten rungs with the given counts, in ladder order — the shape `moteFarming.ladder` returns. */
function ladder(counts: readonly number[]): MoteLadderRow[] {
  return MOTE_LADDER.map((mote, i) => {
    const count = counts[i] ?? 0
    return { mote, count, exp: count * mote.exp, events: count }
  })
}

// ── 1 + 2. the zone chart ───────────────────────────────────────────────────────────────────

test('MC: the zone scale is the best MEASURED rate — the top bar is the full plot', () => {
  const chart = zoneBars([zone('Plane of Fear', 8, 8), zone('The Hole', 6, 6), zone('Najena', 2, 2)])
  assert.equal(chart.scaleMax, 8)
  assert.equal(chart.bars[0].w, PLOT_W, 'the best zone fills the plot')
  assert.equal(chart.bars[1].w.toFixed(4), ((6 / 8) * PLOT_W).toFixed(4))
  assert.equal(chart.bars[2].w.toFixed(4), ((2 / 8) * PLOT_W).toFixed(4))
  // Percentages are of the PLOT, not of the viewBox — that is where the HTML layer sits.
  assert.equal(chart.bars[0].wPct, 100)
  for (const b of chart.bars) assert.equal(b.x, PLOT_X)
})

test('MC: rows keep the model’s order, and the height is the row count', () => {
  const rows = [zone('Plane of Fear', 8, 8), zone('The Hole', 6, 6)]
  const chart = zoneBars(rows)
  assert.deepEqual(chart.bars.map((b) => b.zone), rows.map((r) => r.zone), 'the geometry never re-sorts')
  assert.equal(chart.bars[0].y, BAR_PAD_Y)
  assert.equal(chart.bars[1].y, BAR_PAD_Y + BAR_H + BAR_GAP)
  assert.equal(chart.height, BAR_PAD_Y * 2 + 2 * (BAR_H + BAR_GAP) - BAR_GAP)
  assert.equal(chart.bars[0].textY, BAR_PAD_Y + BAR_H / 2, 'text is centred on its bar')
})

/**
 * A ZONE WITH NO ACTIVE TIME HAS NO BAR. Its counts are real and its rate is unknown — and it must
 * not set the scale either, or one span-less row would flatten every measured bar beside it.
 */
test('MC: an unmeasured zone draws nothing and never touches the scale', () => {
  const chart = zoneBars([zone('The Hole', 6, 6), zone('Solusek B', 40, null)])
  assert.equal(chart.scaleMax, 6, 'the null row cannot set the scale')
  assert.equal(chart.bars[0].measured, true)
  assert.equal(chart.bars[0].w, PLOT_W)
  assert.equal(chart.bars[1].measured, false)
  assert.equal(chart.bars[1].w, 0, 'no bar at all — a zero-width bar would claim a measurement')
  assert.equal(chart.bars[1].expPerHour, null)
  // …and the row still carries what the surface is REQUIRED to print beside a rate.
  assert.equal(chart.bars[1].activeMs, 0)
  assert.equal(chart.bars[1].motes, 1)
})

test('MC: every zone unmeasured ⇒ a scale of 0 and no bars, never a divide by zero', () => {
  const chart = zoneBars([zone('Solusek B', 40, null)])
  assert.equal(chart.scaleMax, 0)
  assert.equal(chart.bars[0].w, 0)
  assert.ok(Number.isFinite(chart.bars[0].wPct))
})

test('MC: no rows at all ⇒ no chart (the view draws its empty state instead)', () => {
  const chart = zoneBars([])
  assert.deepEqual(chart.bars, [])
  assert.equal(chart.height, 0)
})

/** A tiny but real rate must not round away to an invisible line. */
test('MC: a real but tiny rate is floored to a visible sliver, and rawW keeps the truth', () => {
  const chart = zoneBars([zone('Plane of Fear', 1000, 1000), zone('The Hole', 1, 0.001)])
  const tiny = chart.bars[1]
  assert.ok(tiny.rawW < MIN_BAR_W, 'the honest width really is sub-pixel')
  assert.equal(tiny.w, MIN_BAR_W)
})

// ── 3 + 4. the ladder ───────────────────────────────────────────────────────────────────────

/**
 * THE TWO BARS ARE ON THEIR OWN SCALES, and this is the case that shows why. Ten Infinitesimals
 * (10 count, 10 exp) against one Major (1 count, 5 exp): on count the Infinitesimal bar is ten
 * times the Major's, on exp only twice. A single shared scale would have made those two readings
 * one bar and destroyed the comparison.
 */
test('MC: count and exp are scaled independently, and both maxima come back out', () => {
  const rows = ladder([10, 0, 0, 0, 1])
  const chart = ladderBars(rows)
  assert.equal(chart.maxCount, 10)
  assert.equal(chart.maxExp, 10, 'ten Infinitesimals are 10 exp; one Major is 5')

  const inf = chart.bars[0]
  const major = chart.bars[4]
  assert.equal(inf.countW, PLOT_W)
  assert.equal(inf.expW, PLOT_W)
  assert.equal(major.countW.toFixed(4), ((1 / 10) * PLOT_W).toFixed(4))
  assert.equal(major.expW.toFixed(4), ((5 / 10) * PLOT_W).toFixed(4))
  // The whole point: the same rung reads very differently in the two units.
  assert.ok(major.expW > major.countW * 4)
})

test('MC: all ten rungs are drawn, in ladder order, and an unseen one draws nothing', () => {
  const chart = ladderBars(ladder([3]))
  assert.equal(chart.bars.length, MOTE_LADDER.length)
  assert.deepEqual(chart.bars.map((b) => b.ladder), MOTE_LADDER.map((m) => m.ladder))
  assert.equal(chart.bars[0].seen, true)
  for (const b of chart.bars.slice(1)) {
    assert.equal(b.seen, false, b.short)
    assert.equal(b.countW, 0, b.short)
    assert.equal(b.expW, 0, b.short)
  }
})

/** The two sub-bars stack inside one row's height, so the HTML label layer lines up with them. */
test('MC: the two sub-bars fit inside the row the label layer is positioned over', () => {
  const chart = ladderBars(ladder([1]))
  const b = chart.bars[0]
  assert.equal(b.countY, b.y)
  assert.ok(b.expY > b.countY + b.h, 'the exp bar sits below the count bar with a gap')
  assert.ok(b.expY + b.h <= b.y + BAR_H, 'and both fit inside one row')
  assert.equal(b.x, PLOT_X)
  assert.equal(chart.height, BAR_PAD_Y * 2 + MOTE_LADDER.length * (BAR_H + BAR_GAP) - BAR_GAP)
})

/** An empty ladder (nothing ever looted) still draws all ten tracks and divides by nothing. */
test('MC: nothing looted ⇒ ten empty rungs, no NaN', () => {
  const chart = ladderBars(ladder([]))
  assert.equal(chart.maxCount, 0)
  assert.equal(chart.maxExp, 0)
  for (const b of chart.bars) {
    assert.equal(b.seen, false)
    assert.ok(Number.isFinite(b.countWPct) && Number.isFinite(b.expWPct))
  }
})

/** The rung's own facts ride along, so the component never re-looks-up the ladder. */
test('MC: each bar carries its rung’s price and item tier limit', () => {
  const chart = ladderBars(ladder([1, 1, 1]))
  for (const [i, b] of chart.bars.entries()) {
    assert.equal(b.unitExp, MOTE_LADDER[i].exp, b.short)
    assert.equal(b.itemTierLimit, MOTE_LADDER[i].itemTierLimit, b.short)
    assert.equal(b.name, MOTE_LADDER[i].name)
  }
})
