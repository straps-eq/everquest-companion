// THE STANCE TAB'S CHART GEOMETRY — pure arithmetic that turns an already-built `StanceTargetRow`
// into coordinates. No React, no MUI, no colors: the components in StanceCharts.tsx draw exactly
// what this returns and decide nothing. Same split combat/dpsChart.ts made, for the same reason —
// geometry is the part that can be wrong in a way a screenshot hides, so it is the part that gets
// a node:test (tests/stanceCharts.test.mts).
//
// ── WHAT THE DATA DOES NOT SUPPORT, STATED UP FRONT ─────────────────────────────────────────
//
// THERE IS NO TIME SERIES HERE AND THERE MUST NOT BE ONE. `main/combat/stanceLedger.ts`
// accumulates TOTALS per (mob, zone, tier, stance) — physical, magical, hits — plus `lastSeenTs`
// and `biggestHit`. There is no per-hit history, no timestamp per sample, no bucketing of any
// kind. So "damage taken over time", "when did this mob start hitting harder", and every other
// curve are not thin data or noisy data, they are ABSENT data: drawing one would mean
// interpolating between two numbers that were never two points, or plotting `lastSeenTs` as if a
// single instant were a series. Law 1 (anything inferred is labeled inferred) has no way to label
// a fabricated curve, so none is drawn. The three charts below are the ones the ledger's shape
// actually licenses:
//
//   1. COMPOSITION (`donutSegments`) — physical vs magical of the un-mitigated profile. A ratio
//      of two measured totals; no time in it at all.
//   2. STANCE COMPARISON (`stanceBars`) — expected damage taken per stance. The page's central
//      claim, and a closed form over the pooled profile (shared/stances.ts `rankStances`), so it
//      is exactly as valid as the profile is.
//   3. OBSERVED vs RECOVERED (`recoveryRows`) — per stance sample, what LANDED beside what the
//      mob SWUNG FOR. This one is the evidence for the other two: the recovered heights should
//      AGREE across stances (that convergence is `unmitigate`'s whole argument — the same
//      Cazic-Thule reads 64.7% spell from inside Defensive and 37.9% from inside Mage Hunter, and
//      the correction pulls the two readings together), and a stance where they do not agree is
//      visible instead of buried in a pooled average.
//
// ── COORDINATES ─────────────────────────────────────────────────────────────────────────────
//
// One fixed 720-unit viewBox for both bar charts (dpsChart.ts's number, so the panels rhyme),
// drawn at `width="100%"` with `preserveAspectRatio="none"`: X stretches to the panel, Y is 1:1.
// The stretch is why the text gutters are generous and the labels are short — the detail panel is
// roughly 500–800 px wide, so a glyph is drawn between 0.7× and 1.1× of its user width. Nothing
// here reads a cursor back, so there is no px↔user inverse to keep honest; the one rule is that
// every X on a chart comes out of the same `PLOT_X`/`PLOT_W` pair below.

import type { RankedRow, SampleRow } from './stanceRows'

/** The shared viewBox width of both bar charts. */
export const CHART_W = 720
/** Left gutter: the stance name. */
export const LABEL_W = 132
/** Right gutter: the percentage and the points behind it. */
export const VALUE_W = 108
/** Where the plot starts, and how wide it is. Every bar X on this page is these two numbers. */
export const PLOT_X = LABEL_W
export const PLOT_W = CHART_W - LABEL_W - VALUE_W

/**
 * The same three gutters as PERCENTAGES of the viewBox width.
 *
 * The bars are SVG and the LABELS ARE HTML, laid over the plot — the same division levelCharts.tsx
 * makes for its edge ticks, and for the same reason: `preserveAspectRatio="none"` stretches X to
 * the panel, which is exactly right for a bar (its length IS the datum) and ruinous for a glyph.
 * A percentage of the container is the identical position the user-unit gutter would have landed
 * at, whatever the panel's width, so the two layers cannot drift.
 */
export const LABEL_PCT = (LABEL_W / CHART_W) * 100
export const VALUE_PCT = (VALUE_W / CHART_W) * 100

/**
 * A bar that rounds to nothing still has to be visible.
 *
 * Evasive's 5% is 24 units wide and needs no help; a stance whose expected damage is genuinely
 * zero (a profile with no measured damage at all) would otherwise draw as an invisible line and
 * read as a missing row rather than as a zero. Two units is a sliver — it can never be mistaken
 * for a quantity — and `rawW` carries the un-floored width so a test can prove the floor was only
 * applied where it was needed.
 */
export const MIN_BAR_W = 2

export const BAR_H = 20
export const BAR_GAP = 6
export const BAR_PAD_Y = 4

/** Which of the three things a stance is on this page: the pick, the escape hatch, or neither. */
export type BarRole = 'hold' | 'survive' | 'other'

/** One stance's bar, fully positioned. `role` is a MEANING; the component picks the color. */
export interface StanceBar {
  key: string
  name: string
  role: BarRole
  /** the stance worn right now — marked, never re-ordered */
  current: boolean
  x: number
  y: number
  w: number
  h: number
  /** width before `MIN_BAR_W` was applied — the honest number, for tests and for nothing else */
  rawW: number
  /** `w` as a percentage of the PLOT (not of the viewBox) — where the HTML tag layer sits */
  wPct: number
  /** expected damage taken as a share of the un-mitigated total */
  fraction: number
  /** that share, already printed by stanceRows.ts ('62%') */
  percent: string
  /** expected damage taken, in points */
  expected: number
  /** no upkeep at all (Balanced) — the tag the old bar list printed, carried rather than re-looked-up */
  free: boolean
  /** text baseline for the label/value rows, vertically centred on the bar */
  textY: number
}

export interface StanceBarChart {
  bars: StanceBar[]
  /** viewBox height — the chart is as tall as the ranking is long */
  height: number
  /** x of the "100% — un-mitigated" reference rule: what the mob swings for, unreduced */
  fullX: number
}

/**
 * The stance comparison, as bars.
 *
 * THE SCALE IS THE UN-MITIGATED TOTAL, not the longest bar. A chart normalised to its own maximum
 * would draw the worst available stance at full width on every card and quietly rescale between
 * targets, so "how much of it gets through" — the only question this chart is asked — could not
 * be read off the picture. At a fixed 0..100% the reference rule at `fullX` means "everything the
 * mob swings for", every bar is a fraction of it, and two cards are comparable.
 *
 * The ORDER is `advice.ranked` untouched (best-first by expected damage — Evasive heads it almost
 * everywhere). Role, not order, carries the recommendation, exactly as the bar list it replaces
 * did: re-sorting to put the sustained pick on top would be the UI quietly disagreeing with the
 * arithmetic it is drawing.
 */
export function stanceBars(ranked: readonly RankedRow[]): StanceBarChart {
  const bars = ranked.map((r, i) => {
    const y = BAR_PAD_Y + i * (BAR_H + BAR_GAP)
    const rawW = r.fraction * PLOT_W
    const w = Math.max(MIN_BAR_W, rawW)
    return {
      key: r.key,
      name: r.name,
      role: roleOf(r),
      current: r.current,
      x: PLOT_X,
      y,
      w,
      h: BAR_H,
      rawW,
      wPct: (w / PLOT_W) * 100,
      fraction: r.fraction,
      percent: r.percent,
      expected: r.expected,
      free: r.free,
      textY: y + BAR_H / 2
    }
  })
  return {
    bars,
    height: bars.length === 0 ? 0 : BAR_PAD_Y * 2 + bars.length * (BAR_H + BAR_GAP) - BAR_GAP,
    fullX: PLOT_X + PLOT_W
  }
}

/** `recommended` is `advice.sustained` and `emergency` is `advice.emergency` — never `ranked[0]`. */
function roleOf(r: RankedRow): BarRole {
  if (r.recommended) return 'hold'
  if (r.emergency) return 'survive'
  return 'other'
}

// ── THE COMPOSITION DONUT ───────────────────────────────────────────────────────────────────
//
// Drawn as ONE circle per segment with a dashed stroke rather than as arc paths, because the
// degenerate cases are what break arc geometry: a 100/0 split is a full circle, which a single
// SVG `A` command cannot express (start and end points coincide and the renderer draws nothing),
// and a 0% segment is a zero-length arc whose path is still a visible dot under a round linecap.
// A dash length is just a number: 100% is the whole circumference, 0% is zero, and neither is a
// special case in the arithmetic OR in the drawing.

export const DONUT_SIZE = 116
export const DONUT_R = 42
export const DONUT_THICK = 18
/** The ring's circumference — the length every dash is measured against. */
export const DONUT_C = 2 * Math.PI * DONUT_R

export interface DonutSegment {
  key: 'physical' | 'magical'
  /** the integer percent stanceRows.ts already decided (they sum to exactly 100) */
  percent: number
  /** arc length in user units */
  arc: number
  /** `stroke-dasharray`: this segment's arc, then a gap covering the rest of the ring */
  dashArray: string
  /** `stroke-dashoffset`: negative, so segment n starts where segment n-1 ended */
  dashOffset: number
}

/**
 * The two segments of the composition ring, in physical-then-magical order.
 *
 * `split` is `row.split` — the integers that ADD TO 100 (`splitPct` rounds the magical half and
 * gives the physical half the remainder), so the drawn arcs close the ring exactly rather than
 * leaving a sub-pixel seam that looks like a third category.
 */
export function donutSegments(split: { physical: number; magical: number }): DonutSegment[] {
  const parts: { key: 'physical' | 'magical'; percent: number }[] = [
    { key: 'physical', percent: split.physical },
    { key: 'magical', percent: split.magical }
  ]
  let start = 0
  return parts.map((p) => {
    const arc = (p.percent / 100) * DONUT_C
    const seg = {
      key: p.key,
      percent: p.percent,
      arc,
      dashArray: `${arc.toFixed(2)} ${(DONUT_C - arc).toFixed(2)}`,
      // `start === 0 ? 0` rather than a bare negation: `-0` is a real JS value, it would land in
      // the DOM as "-0", and it makes an equality assertion read like a bug.
      dashOffset: start === 0 ? 0 : -start
    }
    start += arc
    return seg
  })
}

// ── OBSERVED vs RECOVERED ───────────────────────────────────────────────────────────────────

export const REC_BAR_H = 9
export const REC_BAR_GAP = 3
export const REC_ROW_GAP = 11
/** One sample occupies two bars and the gap between them. */
export const REC_ROW_H = REC_BAR_H * 2 + REC_BAR_GAP

/**
 * One bar, SPLIT BY DAMAGE CLASS.
 *
 * Both halves of the pair are drawn in the page's two existing hues (physical / magical, the
 * partition the donut already uses) rather than in a new "landed" and "recovered" pair of colors.
 * That is not decoration: the un-mitigation divides the two halves by DIFFERENT multipliers, so a
 * single-color bar would hide the very thing the chart is here to show — Defensive halves the
 * melee half and barely touches the spell half, and the recovered bar is the two corrections put
 * back together.
 */
export interface RecoverySpan {
  /** per-hit average, physical + magical */
  total: number
  physicalW: number
  magicalW: number
  /** the two halves' widths, summed — the bar's full length */
  w: number
}

/** One stance sample, as the pair of bars that makes the un-mitigation visible. */
export interface RecoveryRow {
  stanceKey: string
  label: string
  hits: number
  /** what LANDED, per hit, in this stance — post-mitigation, exactly as the log printed it */
  landed: RecoverySpan
  /** what the mob SWUNG FOR, per hit — null when the sample was refused */
  recovered: RecoverySpan | null
  refused: boolean
  /** `recovered / landed` — the multiplier that was divided out, seen from the other side */
  lift: number | null
  y: number
  landedY: number
  recoveredY: number
}

export interface RecoveryChart {
  rows: RecoveryRow[]
  height: number
  /** the largest per-hit figure on the chart — what the plot width stands for */
  max: number
  /** x of the pooled per-hit average, or null when nothing usable pooled */
  pooledX: number | null
  pooledPerHit: number | null
}

/**
 * PER HIT, not per session — and that choice is the whole point of the chart.
 *
 * The ledger's samples are running TOTALS, so a stance you happened to wear for two hundred hits
 * has a hundred times the bar of one you wore for two. Plotted raw, the picture answers "where
 * did you spend the fight", which nobody asked. Divided by the sample's own hit count it answers
 * "how hard does this thing swing", the recovered bars become COMPARABLE ACROSS STANCES, and the
 * un-mitigation becomes checkable by eye: if the correction is right, every recovered bar is
 * roughly the same length whatever stance it was measured through, and the pooled rule below sits
 * among them. If one stance's recovered bar is wildly out, the pooled profile is being pulled by
 * something and the observations table underneath says which sample.
 *
 * Samples with no hits are dropped (an empty bucket is not an observation), and a REFUSED sample
 * keeps its landed bar and draws no recovered one — the refusal is a visible hole, which is the
 * honest rendering of "this measures nothing about size" rather than a quietly missing row.
 *
 * NO MINIMUM WIDTH on these bars, unlike the comparison chart's. There, a floor keeps a stance
 * that is genuinely on the list from vanishing; here a length IS the measurement being compared
 * against its neighbour, and inflating a small one to two units would put a fake floor under
 * exactly the comparison the chart exists to make.
 */
export function recoveryRows(samples: readonly SampleRow[], pooled: { total: number; hits: number }): RecoveryChart {
  const measured = samples
    .filter((s) => s.hits > 0)
    .map((s) => ({
      s,
      landed: { physical: s.observed.physical / s.hits, magical: s.observed.magical / s.hits },
      recovered:
        s.unmitigated === null
          ? null
          : { physical: s.unmitigated.physical / s.hits, magical: s.unmitigated.magical / s.hits }
    }))
  const pooledPerHit = pooled.hits > 0 ? pooled.total / pooled.hits : null
  const peak = measured.map((m) => Math.max(total(m.landed), m.recovered === null ? 0 : total(m.recovered)))
  // `Math.max(1, …)` is the empty-chart guard, not a fudge: with no rows there is nothing to
  // scale and a zero divisor would produce NaN widths.
  const max = Math.max(1, ...peak, pooledPerHit ?? 0)
  const rows = measured.map((m, i) => {
    const y = i * (REC_ROW_H + REC_ROW_GAP)
    const landed = span(m.landed, max)
    const recovered = m.recovered === null ? null : span(m.recovered, max)
    return {
      stanceKey: m.s.stanceKey,
      label: m.s.stanceLabel,
      hits: m.s.hits,
      landed,
      recovered,
      refused: m.s.refused,
      lift: recovered === null || landed.total === 0 ? null : recovered.total / landed.total,
      y,
      landedY: y,
      recoveredY: y + REC_BAR_H + REC_BAR_GAP
    }
  })
  return {
    rows,
    height: rows.length === 0 ? 0 : rows.length * (REC_ROW_H + REC_ROW_GAP) - REC_ROW_GAP,
    max,
    pooledX: pooledPerHit === null ? null : PLOT_X + (pooledPerHit / max) * PLOT_W,
    pooledPerHit
  }
}

/** physical + magical of a per-hit average. */
function total(p: { physical: number; magical: number }): number {
  return p.physical + p.magical
}

/** A per-hit average as a two-segment bar, scaled so `max` fills the plot. */
function span(p: { physical: number; magical: number }, max: number): RecoverySpan {
  const scale = PLOT_W / max
  return {
    total: total(p),
    physicalW: p.physical * scale,
    magicalW: p.magical * scale,
    w: total(p) * scale
  }
}
