// THE MOTES TAB'S CHART GEOMETRY — pure arithmetic that turns already-derived `moteFarming` rows
// into coordinates. No React, no MUI, no colors: MoteCharts.tsx draws exactly what this returns and
// decides nothing. The same split stanceChartGeometry.ts + StanceCharts.tsx and
// levelChartGeometry.ts + levelCharts.tsx already make, for the same reason — geometry is the part
// that can be wrong in a way a screenshot hides.
//
// ── WHAT IS DRAWN, AND WHAT IS NOT ──────────────────────────────────────────────────────────
//
// NOTHING OVER TIME. `moteFarming` returns totals per zone, per mob and per rung, each with the
// active span it was measured over — there is no per-drop series in it and there must not be one
// here. Twenty motes across a fortnight is not twenty points on a curve; bucketing them would put
// a shape on screen that came out of the bucket width rather than out of the log. The two charts
// below are the ones the data's shape licenses:
//
//   1. WHERE TO FARM (`zoneBars`) — mote EXP PER HOUR of the active time you spent in each zone.
//      One measured quantity per zone, ranked. This is the page's actual answer.
//   2. WHAT YOU'VE GOT (`ladderBars`) — the ten rungs, each with how many you have and what they
//      are worth. TWO bars per rung, and see `ladderBars` for why they are on separate scales.
//
// ── COORDINATES ─────────────────────────────────────────────────────────────────────────────
//
// One fixed 720-unit viewBox (dpsChart.ts's number, which the stance charts already borrowed, so
// the panels across the app rhyme), drawn at `width="100%"` with `preserveAspectRatio="none"`: X
// stretches to the panel and Y is 1:1. Right for a bar — its length IS the datum — and ruinous for
// a glyph, so the labels ride an absolutely positioned HTML layer whose gutters are the same
// FRACTIONS of the width reserved here (`LABEL_PCT` / `VALUE_PCT`). Nothing reads a cursor back, so
// there is no px↔user inverse to keep honest; the one rule is that every X comes out of the
// `PLOT_X`/`PLOT_W` pair below.

import type { MoteLadderRow, MoteZoneRow } from '@shared/moteFarming'

/** The shared viewBox width of both charts. */
export const CHART_W = 720
/** Left gutter: a zone name, or a rung's tier word. Wider than the stance charts' 132 because a
 *  zone name carries an instance suffix ("The Ruins of Old Paineel - Solo 4 (Refined)"). */
export const LABEL_W = 184
/** Right gutter: the headline number and its unit. */
export const VALUE_W = 112
/** Where the plot starts, and how wide it is. Every bar X on this page is these two numbers. */
export const PLOT_X = LABEL_W
export const PLOT_W = CHART_W - LABEL_W - VALUE_W

/** The same two gutters as PERCENTAGES of the viewBox width — where the HTML label layer sits. */
export const LABEL_PCT = (LABEL_W / CHART_W) * 100
export const VALUE_PCT = (VALUE_W / CHART_W) * 100

/**
 * A bar that rounds to nothing still has to be visible.
 *
 * The rungs you have never seen are genuinely zero and are drawn as an empty track (`seen: false`
 * tells the component to skip the bar entirely) — but a rung with ONE Infinitesimal against a
 * hundred of them is a real, tiny quantity, and at 0.4 units it would render as nothing at all and
 * read as "never seen". Two units is a sliver that can never be mistaken for a quantity, and
 * `rawW` carries the un-floored width so a test can prove the floor was only applied where needed.
 */
export const MIN_BAR_W = 2

export const BAR_H = 20
export const BAR_GAP = 6
export const BAR_PAD_Y = 4

/** One zone's bar on the "where to farm" chart. */
export interface ZoneBar {
  /** the `zoneIdKey` fold — React key */
  key: string
  /** RAW display name, instance suffix intact */
  zone: string
  /** mote exp per hour of ACTIVE time — null when the zone has none (moteFarming's rule 3) */
  expPerHour: number | null
  /** motes per hour, the count reading of the same span. Carried so the label layer can show the
   *  disagreement between the two without a second geometry pass. */
  motesPerHour: number | null
  /** total motes observed here — the SAMPLE SIZE, which the surface is required to print */
  motes: number
  /** ms of active time the rate was measured over — likewise required beside the rate */
  activeMs: number
  x: number
  y: number
  w: number
  h: number
  /** width before `MIN_BAR_W` — the honest number, for tests and for nothing else */
  rawW: number
  /** `w` as a percentage of the PLOT (not of the viewBox) */
  wPct: number
  /** false when `expPerHour` is null: there is NO bar to draw, only a row saying why */
  measured: boolean
  textY: number
}

export interface ZoneBarChart {
  bars: ZoneBar[]
  /** viewBox height — the chart is as tall as the ranking is long */
  height: number
  /** the exp/hour the full plot width represents, i.e. the best measured zone. 0 when none is. */
  scaleMax: number
}

/**
 * Where to farm, as bars, longest first.
 *
 * THE SCALE IS THE BEST MEASURED ZONE, not a fixed maximum, and unlike the stance comparison chart
 * that is the only honest choice available: there is no "100%" for a farming rate — no upper bound
 * exists on how many motes an hour a zone could pay — so a fixed reference would be a number this
 * app made up. The consequence is stated on the chart: the top bar is always full width, and the
 * picture answers "how do my zones compare" and never "is this good".
 *
 * A ZONE WITH NO ACTIVE TIME GETS A ROW AND NO BAR. Its counts are real and its rate is unknown;
 * drawing it at zero width would say the rate was measured and found to be nothing. `moteFarming`
 * already sorts those rows last, and this preserves that order untouched.
 */
export function zoneBars(rows: readonly MoteZoneRow[]): ZoneBarChart {
  const scaleMax = rows.reduce((m, r) => Math.max(m, r.expPerHourActive ?? 0), 0)
  const bars = rows.map((r, i) => {
    const y = BAR_PAD_Y + i * (BAR_H + BAR_GAP)
    const measured = r.expPerHourActive !== null
    const rawW = scaleMax > 0 && measured ? ((r.expPerHourActive ?? 0) / scaleMax) * PLOT_W : 0
    const w = measured ? Math.max(MIN_BAR_W, rawW) : 0
    return {
      key: r.key,
      zone: r.zone,
      expPerHour: r.expPerHourActive,
      motesPerHour: r.motesPerHourActive,
      motes: r.motes,
      activeMs: r.activeMs,
      x: PLOT_X,
      y,
      w,
      h: BAR_H,
      rawW,
      wPct: (w / PLOT_W) * 100,
      measured,
      textY: y + BAR_H / 2
    }
  })
  return { bars, height: chartHeight(bars.length), scaleMax }
}

/** As tall as the rows are, with the top and bottom padding and no trailing gap. 0 for none. */
function chartHeight(n: number): number {
  return n === 0 ? 0 : BAR_PAD_Y * 2 + n * (BAR_H + BAR_GAP) - BAR_GAP
}

// ── THE LADDER ──────────────────────────────────────────────────────────────────────────────

/** Height of each of the two sub-bars in a ladder row, and the space between them. */
export const SUB_BAR_H = 8
const SUB_BAR_GAP = 4

/** One rung: what you have, and what it is worth. */
export interface LadderBar {
  /** the mote's lowercased item name — React key */
  key: string
  ladder: number
  /** the one-word tier ('Infinitesimal', 'Major', …) */
  short: string
  /** full display name, for a tooltip */
  name: string
  count: number
  exp: number
  /** the highest ITEM tier this rung may be used on — the spend advice, per row */
  itemTierLimit: number
  /** exp of ONE of these, the ladder's own price */
  unitExp: number
  /** where the plot starts — the same `PLOT_X` every bar on this page uses */
  x: number
  y: number
  /** y of the COUNT sub-bar and of the EXP sub-bar */
  countY: number
  expY: number
  h: number
  countW: number
  expW: number
  countWPct: number
  expWPct: number
  /** false when this rung has never dropped: draw the empty track and no bar at all */
  seen: boolean
  textY: number
}

export interface LadderChart {
  bars: LadderBar[]
  height: number
  /** the count and the exp the full plot width represent — the two scales, for the caption */
  maxCount: number
  maxExp: number
}

/**
 * The ten rungs, with COUNT and EXP drawn as two bars on TWO SCALES — and the caption has to say
 * so, because a shared scale here would be the lie the whole feature exists to correct.
 *
 * The two quantities are in different units (objects and experience) and their ratio is exactly
 * the thing worth seeing: a player's Infinitesimal bar is enormous on count and stubby on exp,
 * while one Major is the reverse. Normalising both to the same maximum would flatten the low rungs
 * into invisibility and hide precisely that comparison; scaling each to its OWN maximum makes the
 * divergence the picture's subject. It is a real readability hazard, which is why `maxCount` and
 * `maxExp` come back out — the component prints both, so nobody reads the two bars as one unit.
 *
 * ALL TEN RUNGS, ALWAYS, in ladder order. A rung with no drops is the most informative row on the
 * chart ("nothing above Major has ever dropped for me") and dropping it would leave a chart that
 * silently rescaled and re-laid-out every time a new tier landed.
 */
export function ladderBars(rows: readonly MoteLadderRow[]): LadderChart {
  const maxCount = rows.reduce((m, r) => Math.max(m, r.count), 0)
  const maxExp = rows.reduce((m, r) => Math.max(m, r.exp), 0)
  const bars = rows.map((r, i) => {
    const y = BAR_PAD_Y + i * (BAR_H + BAR_GAP)
    const seen = r.count > 0
    return {
      key: r.mote.key,
      ladder: r.mote.ladder,
      short: r.mote.short,
      name: r.mote.name,
      count: r.count,
      exp: r.exp,
      itemTierLimit: r.mote.itemTierLimit,
      unitExp: r.mote.exp,
      x: PLOT_X,
      y,
      countY: y,
      expY: y + SUB_BAR_H + SUB_BAR_GAP,
      h: SUB_BAR_H,
      countW: subBarW(r.count, maxCount, seen),
      expW: subBarW(r.exp, maxExp, seen),
      countWPct: (subBarW(r.count, maxCount, seen) / PLOT_W) * 100,
      expWPct: (subBarW(r.exp, maxExp, seen) / PLOT_W) * 100,
      seen,
      textY: y + BAR_H / 2
    }
  })
  return { bars, height: chartHeight(bars.length), maxCount, maxExp }
}

/** One sub-bar's width: a share of its own scale, floored so a real 1 is never invisible, and
 *  exactly 0 for a rung that has genuinely never dropped. */
function subBarW(value: number, max: number, seen: boolean): number {
  if (!seen || max <= 0) return 0
  return Math.max(MIN_BAR_W, (value / max) * PLOT_W)
}
