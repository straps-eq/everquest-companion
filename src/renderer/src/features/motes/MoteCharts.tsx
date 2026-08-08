// THE MOTES TAB'S CHARTS — hand-rolled SVG over ./moteChartGeometry.ts, which owns every
// coordinate on this page. These components draw what that module returns and decide nothing
// numeric: the same split StanceCharts.tsx and levelCharts.tsx make, and what lets a node:test
// assert the shape of a bar without mounting React. The repo has no chart library and does not
// want one for pictures this small.
//
// ── WHY THE TEXT IS HTML AND THE BARS ARE SVG ───────────────────────────────────────────────
//
// Both charts are a fixed 720-unit viewBox drawn at `width="100%"` with
// `preserveAspectRatio="none"`, so X stretches to the panel and Y is 1:1. Right for a bar, ruinous
// for a glyph — so the labels ride an absolutely positioned HTML layer whose gutters are the same
// fractions of the width the geometry reserved. This is StanceCharts.tsx's `OverlayRow`, and it is
// RE-SPELLED here rather than imported for exactly one reason: that component's gutters are the
// stance geometry's constants (132/108) and these charts reserve their own (184/112, because a
// zone name carries an instance suffix). Importing it would lay the text over the wrong columns.
//
// ── COLORS ARE BORROWED, NEVER INVENTED ─────────────────────────────────────────────────────
//
// The zone bars take `zoneBands.zoneColor` — the hue the leveling chart strip, the range panel and
// the loot drill-down already give that zone, so one zone is one color everywhere in the app. The
// ladder's two bars take `combatShared.CAT_COLOR`: gold for EXP (the app's "this is what it is
// worth" hue, already the meter's melee) and the muted blue for COUNT. No third palette.

import type { JSX } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { formatMoteExpRate, formatMoteRate } from '../../lib/formatRate'
import { Tooltip } from '../../lib/Tooltip'
import { CAT_COLOR } from '../combat/combatShared'
import { fmtDuration } from '../leveling/levelChartGeometry'
import { NONE } from '../leveling/rangeStatsRows'
import { zoneColor } from '../leveling/zoneBands'
import {
  BAR_H,
  CHART_W,
  LABEL_PCT,
  PLOT_W,
  VALUE_PCT,
  ladderBars,
  zoneBars,
  type LadderBar,
  type LadderChart,
  type ZoneBar
} from './moteChartGeometry'
import type { MoteLadderRow, MoteZoneRow } from '@shared/moteFarming'

/** What a mote is WORTH — the app's existing "value" gold, not a new one. */
export const EXP_COLOR = CAT_COLOR.melee
/** How MANY you have. The muted blue, deliberately quieter than the gold: on this page the count
 *  is the secondary reading and the exp is the answer. */
export const COUNT_COLOR = CAT_COLOR.dot
/** A row that was observed but never measured — no active time to divide by. */
const UNMEASURED_COLOR = '#8891a0'

/** One row of text laid over the plot: left gutter, the plot span itself, right gutter. */
function OverlayRow({
  top,
  height,
  label,
  value,
  mid
}: {
  top: number
  height: number
  label: JSX.Element
  value: JSX.Element
  /** positioned inside the plot span, which is `position: relative` for exactly this */
  mid?: JSX.Element
}): JSX.Element {
  return (
    <Box sx={{ position: 'absolute', left: 0, right: 0, top, height, display: 'flex', alignItems: 'center' }}>
      <Box sx={{ width: `${LABEL_PCT}%`, pr: 0.6, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.4 }}>
        {label}
      </Box>
      <Box sx={{ flexGrow: 1, position: 'relative', height: '100%' }}>{mid}</Box>
      <Box
        sx={{
          width: `${VALUE_PCT}%`,
          pl: 0.6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 0.5
        }}
      >
        {value}
      </Box>
    </Box>
  )
}

/** The stretched SVG plus its upright HTML label layer — the shape both charts on this page take. */
function ChartFrame({
  testid,
  height,
  bars,
  labels
}: {
  testid: string
  height: number
  bars: JSX.Element
  labels: JSX.Element
}): JSX.Element {
  return (
    <Box sx={{ position: 'relative' }} data-testid={testid}>
      <svg
        viewBox={`0 0 ${CHART_W} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        {bars}
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{labels}</Box>
    </Box>
  )
}

// ── WHERE TO FARM ───────────────────────────────────────────────────────────────────────────

function ZoneBarShape({ b }: { b: ZoneBar }): JSX.Element {
  const color = b.measured ? zoneColor(b.zone) : UNMEASURED_COLOR
  return (
    <g data-testid="mote-zone-bar" data-zone={b.key} data-measured={b.measured}>
      <rect x={b.x} y={b.y} width={PLOT_W} height={b.h} fill="rgba(255,255,255,0.04)" rx={1} />
      {b.measured && <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={color} opacity={0.4} />}
      {/* A solid leading edge: the bar's start is a datum even when its body is a wash. */}
      {b.measured && <rect x={b.x} y={b.y} width={2.5} height={b.h} fill={color} />}
    </g>
  )
}

/**
 * The zone's name, the sample it rests on, and the rate.
 *
 * THE SAMPLE AND THE SPAN ARE NOT OPTIONAL AND NOT A TOOLTIP. One mote in five minutes is a true
 * 12 exp/hr and a worthless sample, and the only thing separating that from a real camp is the
 * text beside it — so "N motes over Xh Ym active" sits inside the plot on every row.
 */
function ZoneBarLabels({ b }: { b: ZoneBar }): JSX.Element {
  const sample = `${b.motes.toLocaleString()} mote${b.motes === 1 ? '' : 's'}`
  const span = b.activeMs > 0 ? `over ${fmtDuration(b.activeMs)} active` : 'no active time recorded'
  return (
    <OverlayRow
      top={b.y}
      height={b.h}
      label={
        <Typography variant="caption" noWrap title={b.zone} sx={{ fontWeight: 600 }}>
          {b.zone}
        </Typography>
      }
      mid={
        <Typography
          variant="caption"
          sx={{
            position: 'absolute',
            top: '50%',
            left: 6,
            transform: 'translateY(-50%)',
            fontSize: 10,
            whiteSpace: 'nowrap',
            color: 'text.secondary'
          }}
        >
          {sample} · {span}
          {b.motesPerHour !== null && ` · ${formatMoteRate(b.motesPerHour)}`}
        </Typography>
      }
      value={
        b.expPerHour === null ? (
          <Tooltip title="No active time recorded in this zone — the count is real, the rate is not measurable.">
            <Typography variant="caption" sx={{ color: UNMEASURED_COLOR, fontWeight: 700 }}>
              {NONE}
            </Typography>
          </Tooltip>
        ) : (
          <Typography variant="caption" sx={{ fontWeight: 700 }} data-testid="mote-zone-rate">
            {formatMoteExpRate(b.expPerHour)}
          </Typography>
        )
      }
    />
  )
}

/**
 * WHERE TO FARM — every zone a mote has dropped in, by mote exp per hour of the time you actually
 * played there.
 *
 * The full plot width is the BEST measured zone, so the top bar is always full and the chart
 * answers "how do my zones compare" rather than "is this good" — there is no upper bound on a
 * farming rate and a fixed reference would be invented. The caption says so.
 */
export function MoteZoneChart({ rows }: { rows: readonly MoteZoneRow[] }): JSX.Element | null {
  const chart = zoneBars(rows)
  if (chart.bars.length === 0) return null
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.35 }}>
        Mote EXPERIENCE per hour of active time — full width is your best zone, not a target. The
        motes/hour beside it is the same span counted in objects, and the two disagree whenever a
        zone drops fewer, better motes.
      </Typography>
      <ChartFrame
        testid="mote-zone-chart"
        height={chart.height}
        bars={
          <>
            {chart.bars.map((b) => (
              <ZoneBarShape key={b.key} b={b} />
            ))}
          </>
        }
        labels={
          <>
            {chart.bars.map((b) => (
              <ZoneBarLabels key={b.key} b={b} />
            ))}
          </>
        }
      />
    </Box>
  )
}

// ── THE LADDER ──────────────────────────────────────────────────────────────────────────────

function LadderBarShape({ b }: { b: LadderBar }): JSX.Element {
  return (
    <g data-testid="mote-ladder-bar" data-rung={b.ladder} data-seen={b.seen}>
      <rect x={b.x} y={b.countY} width={PLOT_W} height={b.h} fill="rgba(255,255,255,0.04)" rx={1} />
      <rect x={b.x} y={b.expY} width={PLOT_W} height={b.h} fill="rgba(255,255,255,0.04)" rx={1} />
      {b.seen && <rect x={b.x} y={b.countY} width={b.countW} height={b.h} fill={COUNT_COLOR} opacity={0.6} />}
      {b.seen && <rect x={b.x} y={b.expY} width={b.expW} height={b.h} fill={EXP_COLOR} opacity={0.85} />}
    </g>
  )
}

function LadderBarLabels({ b }: { b: LadderBar }): JSX.Element {
  return (
    <OverlayRow
      top={b.y}
      height={BAR_H}
      label={
        <Tooltip
          title={`${b.name} — ${String(b.unitExp)} exp each, usable on an item of tier ${String(b.itemTierLimit)} or lower (any spell, any tier)`}
        >
          <Typography variant="caption" noWrap sx={{ fontWeight: b.seen ? 700 : 400, opacity: b.seen ? 1 : 0.5 }}>
            {b.ladder}. {b.short}
          </Typography>
        </Tooltip>
      }
      value={
        <>
          <Typography variant="caption" sx={{ color: COUNT_COLOR, fontSize: 10, opacity: b.seen ? 1 : 0.4 }}>
            {b.count}
          </Typography>
          <Typography variant="caption" sx={{ color: EXP_COLOR, fontWeight: 700, opacity: b.seen ? 1 : 0.4 }}>
            {b.exp} exp
          </Typography>
        </>
      }
    />
  )
}

/** The two scales, named — without this the chart is two bars a reader will compare directly. */
function LadderLegend({ chart, totalExp }: { chart: LadderChart; totalExp: number }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.35 }}>
      <Swatch color={COUNT_COLOR} label={`count — full width is ${chart.maxCount}`} />
      <Swatch color={EXP_COLOR} label={`exp — full width is ${chart.maxExp}`} />
      <Chip
        size="small"
        variant="outlined"
        label={`${totalExp} exp looted in total`}
        sx={{ height: 18, fontSize: 10 }}
        data-testid="mote-total-exp"
      />
    </Stack>
  )
}

function Swatch({ color, label }: { color: string; label: string }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Box sx={{ width: 9, height: 9, borderRadius: '2px', bgcolor: color, flexShrink: 0 }} />
      <Typography variant="caption" sx={{ color, fontWeight: 700, fontSize: 10 }}>
        {label}
      </Typography>
    </Stack>
  )
}

/**
 * WHAT YOU'VE GOT — the ten rungs, each drawn twice: how many, and what they are worth.
 *
 * THE TWO BARS ARE ON SEPARATE SCALES and the legend says both maxima out loud, because the ratio
 * between them is the picture's subject (see `ladderBars`). Every rung is drawn, including the
 * ones you have never seen — an empty track at Infinite is the clearest possible statement that
 * nothing that good has ever dropped for you.
 */
export function MoteLadderChart({
  rows,
  totalExp
}: {
  rows: readonly MoteLadderRow[]
  totalExp: number
}): JSX.Element {
  const chart = ladderBars(rows)
  return (
    <Box>
      <LadderLegend chart={chart} totalExp={totalExp} />
      <ChartFrame
        testid="mote-ladder-chart"
        height={chart.height}
        bars={
          <>
            {chart.bars.map((b) => (
              <LadderBarShape key={b.key} b={b} />
            ))}
          </>
        }
        labels={
          <>
            {chart.bars.map((b) => (
              <LadderBarLabels key={b.key} b={b} />
            ))}
          </>
        }
      />
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.35 }}>
        These are motes this log saw DROP. Nothing in EverQuest prints a mote being spent or
        merged, so this is not a balance.
      </Typography>
    </Box>
  )
}
