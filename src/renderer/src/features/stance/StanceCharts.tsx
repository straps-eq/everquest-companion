// THE STANCE TAB'S CHARTS — pictures of things the ledger actually measured. Two of the three
// live here (the composition donut and the stance comparison); the third, landed-vs-full-hit,
// is StanceRecoveryChart.tsx, split off for file mass and sharing this file's palette and label
// layer.
//
// Every coordinate on this page comes out of ./stanceChartGeometry.ts; these files draw what that
// module returns and decide nothing numeric. That is the split combat/dpsChart.ts + DpsOverTime
// .tsx and leveling/levelChartGeometry.ts + levelCharts.tsx already make, and it is what lets a
// node:test assert the shape of a bar without mounting React. Hand-rolled SVG throughout — the
// repo has no chart library and does not want one for pictures this small.
//
// ── WHY THE TEXT IS HTML AND THE BARS ARE SVG ───────────────────────────────────────────────
//
// Both bar charts are a fixed 720-unit viewBox drawn at `width="100%"` with
// `preserveAspectRatio="none"`, so X stretches to the panel and Y is 1:1. That is exactly right
// for a bar — its length is the datum, and it should use the width it is given — and ruinous for
// a glyph, which would be stretched by the same factor. So the labels ride an absolutely
// positioned HTML layer whose gutters are the same fractions of the width the geometry reserved
// (`LABEL_PCT` / `VALUE_PCT`), the way levelCharts.tsx places its edge ticks. Y needs no such
// treatment: the SVG's pixel height IS its viewBox height, so an HTML `top` in user units lands
// on the bar it belongs to.
//
// ── WHAT IS NOT DRAWN ───────────────────────────────────────────────────────────────────────
//
// Nothing over time. The ledger holds totals and one `lastSeenTs` per target — there is no
// per-hit history to plot and inventing one is the one thing this feature must never do. The
// geometry module's header states the case in full.

import type { JSX } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { formatNum } from '../../lib/formatRate'
import { Tooltip } from '../../lib/Tooltip'
import { CAT_COLOR } from '../combat/combatShared'
import { HOLD_COLOR, SURVIVE_COLOR } from './StanceRecommendation'
import {
  CHART_W,
  DONUT_C,
  DONUT_R,
  DONUT_SIZE,
  DONUT_THICK,
  LABEL_PCT,
  PLOT_W,
  VALUE_PCT,
  donutSegments,
  stanceBars,
  type BarRole,
  type StanceBar
} from './stanceChartGeometry'
import type { StanceTargetRow } from './stanceRows'

/**
 * THE TWO HUES, borrowed rather than invented (this pair moved here from StanceEvidence.tsx when
 * the composition bar became a donut; the argument is unchanged).
 *
 * `combatShared.CAT_COLOR` is already the app's vocabulary for "this damage was swung" (melee
 * gold) versus "this damage was cast" (spell violet) — the meter, the timeline and the overlay all
 * speak it. The stance question is that same partition seen from the receiving end
 * (shared/stances.ts: physical/magical IS melee/spell, named twice by the wiki), so re-picking a
 * palette here would have taught the user a second color language for one page.
 */
export const PHYSICAL_COLOR = CAT_COLOR.melee
export const MAGICAL_COLOR = CAT_COLOR.spell

/** A ranked stance that is neither the pick nor the escape hatch: present, measured, not the answer. */
export const NEUTRAL_COLOR = '#8891a0'

/** Role → color. Green is the stance you WEAR, amber is the one you POP — the page's legend. */
const ROLE_COLOR: Record<BarRole, string> = {
  hold: HOLD_COLOR,
  survive: SURVIVE_COLOR,
  other: NEUTRAL_COLOR
}

/** Past this share of the plot a tag placed after the bar would run into the value gutter. */
const TAG_INSIDE_AT = 62

// ── THE COMPOSITION DONUT ───────────────────────────────────────────────────────────────────

const DONUT_TIP: Record<'physical' | 'magical', string> = {
  physical: 'physical — melee, the half Defensive halves',
  magical: 'magical — spell damage, the half Mage Hunter halves'
}

/**
 * Physical vs magical of the mob's FULL DAMAGE, as a ring with the estimated total in the hole.
 *
 * It replaces a two-segment strip, and the reason is the number in the middle: the mix and the
 * size are one fact ("this thing hits for 30k, two thirds of it spells") and the strip could only
 * carry the ratio. The two segments still answer on hover, which is what the strip was drawn by
 * hand for in the first place.
 */
export function CompositionDonut({
  split,
  total
}: {
  split: { physical: number; magical: number }
  /** the measured full-damage total, in points — the figure in the hole */
  total: number
}): JSX.Element {
  const c = DONUT_SIZE / 2
  return (
    <Box
      data-testid="stance-chart-composition"
      sx={{ position: 'relative', width: DONUT_SIZE, height: DONUT_SIZE, flexShrink: 0 }}
    >
      {/* Fixed pixels, no stretch: a ring is the one shape on this page whose aspect ratio is
          load-bearing. */}
      <svg viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} width={DONUT_SIZE} height={DONUT_SIZE}>
        {/* The track, so a 100/0 split still reads as a ring rather than as a circle. */}
        <circle cx={c} cy={c} r={DONUT_R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={DONUT_THICK} />
        {/* -90° so the ring starts at twelve o'clock, which is where a reader starts. */}
        <g transform={`rotate(-90 ${c} ${c})`}>
          {donutSegments(split).map((s) =>
            s.arc <= 0 ? null : (
              <Tooltip key={s.key} title={`${s.percent}% of this mob's full damage is ${DONUT_TIP[s.key]}`}>
                <circle
                  data-testid={`stance-donut-${s.key}`}
                  cx={c}
                  cy={c}
                  r={DONUT_R}
                  fill="none"
                  stroke={s.key === 'physical' ? PHYSICAL_COLOR : MAGICAL_COLOR}
                  strokeWidth={DONUT_THICK}
                  strokeDasharray={s.dashArray}
                  strokeDashoffset={s.dashOffset}
                  // The circumference is a constant, so a percentage is a length: no arc paths,
                  // and 0% / 100% are not special cases (stanceChartGeometry.ts's header).
                  pathLength={DONUT_C}
                />
              </Tooltip>
            )
          )}
        </g>
      </svg>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1 }}>
          {formatNum(total)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, lineHeight: 1.3 }}>
          full damage
        </Typography>
      </Box>
    </Box>
  )
}

// ── THE HTML LABEL LAYER ────────────────────────────────────────────────────────────────────

/**
 * One row of text laid over the plot: left gutter, the plot span itself, right gutter.
 *
 * Exported because the recovery chart (StanceRecoveryChart.tsx) lays its labels out through the
 * SAME gutters — two charts stacked in one panel whose label columns did not line up would read
 * as two unrelated pictures.
 */
export function OverlayRow({
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
      <Box
        sx={{ width: `${LABEL_PCT}%`, pr: 0.6, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.4 }}
      >
        {label}
      </Box>
      <Box sx={{ flexGrow: 1, position: 'relative', height: '100%' }}>{mid}</Box>
      <Box
        sx={{
          width: `${VALUE_PCT}%`,
          pl: 0.6,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'flex-end',
          gap: 0.5
        }}
      >
        {value}
      </Box>
    </Box>
  )
}

// ── THE STANCE COMPARISON — the page's central claim, as the page's real chart ──────────────

/** One stance's bar. `stance-rank-row` is the testid the DOM bar list this replaced carried. */
function ComparisonBar({ b }: { b: StanceBar }): JSX.Element {
  const color = ROLE_COLOR[b.role]
  return (
    <g data-testid="stance-rank-row" data-stance={b.key} data-role={b.role}>
      <rect x={b.x} y={b.y} width={PLOT_W} height={b.h} fill="rgba(255,255,255,0.04)" rx={1} />
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={color} opacity={0.35} />
      {/* A solid leading edge: the bar's start is a datum even when its body is a wash. */}
      <rect x={b.x} y={b.y} width={2.5} height={b.h} fill={color} />
      {b.current && (
        <rect
          x={b.x + 0.5}
          y={b.y + 0.5}
          width={PLOT_W - 1}
          height={b.h - 1}
          fill="none"
          stroke={NEUTRAL_COLOR}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          opacity={0.9}
        />
      )}
    </g>
  )
}

/** The stance's name, the tag it wears, and what it costs you — the text half of one bar. */
function ComparisonLabels({ b }: { b: StanceBar }): JSX.Element {
  const color = ROLE_COLOR[b.role]
  const tag = b.role === 'hold' ? 'wear this' : b.role === 'survive' ? 'survive only' : b.free ? 'no upkeep' : ''
  // A long bar has no room after it, so its tag moves inside the bar's own right end rather than
  // overrunning the value gutter.
  const place = b.wPct > TAG_INSIDE_AT ? { right: 4 } : { left: `${b.wPct}%`, ml: '4px' }
  return (
    <OverlayRow
      top={b.y}
      height={b.h}
      label={
        <>
          <Typography variant="caption" noWrap sx={{ fontWeight: b.role === 'hold' ? 700 : 500 }}>
            {b.name}
          </Typography>
          {b.current && <Chip size="small" color="primary" label="worn" sx={{ height: 14, fontSize: 9 }} />}
        </>
      }
      mid={
        tag ? (
          <Typography
            variant="caption"
            sx={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              color,
              fontSize: 10,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              ...place
            }}
          >
            {tag}
          </Typography>
        ) : undefined
      }
      value={
        <>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
            {formatNum(b.expected)}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {b.percent}
          </Typography>
        </>
      }
    />
  )
}

/**
 * Every stance you can wear, by the damage it would let through.
 *
 * THE ORDER IS `advice.ranked` UNTOUCHED and the emphasis is not on `ranked[0]` — Evasive heads
 * the raw arithmetic against essentially every mob, and the whole correction this tab exists to
 * make is that the arithmetic's winner is not the page's answer. Green marks `advice.sustained`,
 * amber marks `advice.emergency`, everything else is grey, and the dashed rule on the right is
 * 100%: the full hit, with nothing taken off it. The caption says endurance is not in the numbers
 * because the log never shows it — the same claim the survive block makes, said once here too.
 */
export function StanceComparisonChart({ row }: { row: StanceTargetRow }): JSX.Element | null {
  const chart = stanceBars(row.ranked)
  if (chart.bars.length === 0) return null
  return (
    <Box data-testid="stance-chart-comparison">
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.35 }}>
        Every stance you can wear, and how much of the mob&apos;s damage each one lets through.
        Lower is better. Endurance cost is not included — the log never shows it.
      </Typography>
      <Box sx={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${CHART_W} ${chart.height}`}
          width="100%"
          height={chart.height}
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          {chart.bars.map((b) => (
            <ComparisonBar key={b.key} b={b} />
          ))}
          <line
            x1={chart.fullX}
            x2={chart.fullX}
            y1={0}
            y2={chart.height}
            stroke={NEUTRAL_COLOR}
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.7}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {chart.bars.map((b) => (
            <ComparisonLabels key={b.key} b={b} />
          ))}
        </Box>
      </Box>
    </Box>
  )
}

/** The two hues, named — the donut's legend and the recovery chart's, said once. */
export function CompositionLegend({
  split,
  profile
}: {
  split: { physical: number; magical: number }
  profile: { physical: number; magical: number }
}): JSX.Element {
  return (
    <Stack spacing={0.4}>
      <LegendEntry color={PHYSICAL_COLOR} label="physical" percent={split.physical} amount={profile.physical} />
      <LegendEntry color={MAGICAL_COLOR} label="magical" percent={split.magical} amount={profile.magical} />
    </Stack>
  )
}

function LegendEntry({
  color,
  label,
  percent,
  amount
}: {
  color: string
  label: string
  percent: number
  amount: number
}): JSX.Element {
  return (
    <Stack direction="row" spacing={0.6} alignItems="center" useFlexGap>
      <Box sx={{ width: 9, height: 9, borderRadius: '2px', bgcolor: color, flexShrink: 0 }} />
      <Typography variant="caption" sx={{ fontWeight: 700, color }}>
        {percent}% {label}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {formatNum(amount)}
      </Typography>
    </Stack>
  )
}
