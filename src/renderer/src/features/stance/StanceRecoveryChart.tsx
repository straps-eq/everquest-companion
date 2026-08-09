// WHAT LANDED vs THE FULL HIT — the scaling back up, made visible.
//
// Split out of StanceCharts.tsx for file mass alone; it draws the third of the three pictures the
// ledger's shape licenses and shares that file's palette, its HTML label layer and its geometry
// module. Nothing numeric is decided here (stanceChartGeometry.ts `recoveryRows`).
//
// ── WHY THIS CHART IS THE INTERESTING ONE ───────────────────────────────────────────────────
//
// Every other number on this page rests on a correction the user cannot see: damage is measured
// AFTER the stance reduced it, so each sample is scaled back up by the multipliers of the stance
// it was taken in before it joins the pool (shared/stances.ts `unmitigate`). That step is the
// reason the physical/magical mix means anything at all — the same Cazic-Thule reads 64.7% spell
// from inside Defensive and 37.9% from inside Mage Hunter — and it is exactly the kind of step a
// surface can get silently wrong.
//
// So it is drawn. Each stance sample gets two bars: what LANDED (pale) over the FULL HIT (solid),
// per hit, in the page's two damage-class hues. The pale bars differ because the stances differ;
// the solid bars are supposed to CONVERGE, and the dashed rule is the average they are converging
// on. A solid bar far off that rule is a sample dragging the damage mix — visible here, and
// nameable in the observations table directly underneath.

import type { JSX } from 'react'
import { Box, Typography } from '@mui/material'
import { formatNum } from '../../lib/formatRate'
import { Tooltip } from '../../lib/Tooltip'
import { SURVIVE_COLOR } from './StanceRecommendation'
import { MAGICAL_COLOR, NEUTRAL_COLOR, OverlayRow, PHYSICAL_COLOR } from './StanceCharts'
import {
  CHART_W,
  PLOT_X,
  REC_BAR_GAP,
  REC_BAR_H,
  recoveryRows,
  type RecoveryRow,
  type RecoverySpan
} from './stanceChartGeometry'
import type { StanceTargetRow } from './stanceRows'

/** How long the dashed stub that stands in for a left-out sample is, in user units. */
const REFUSED_STUB_W = 46

/** One bar, split into its physical and magical halves. */
function SplitSpan({ y, span, opacity }: { y: number; span: RecoverySpan; opacity: number }): JSX.Element {
  return (
    <>
      <rect x={PLOT_X} y={y} width={span.physicalW} height={REC_BAR_H} fill={PHYSICAL_COLOR} opacity={opacity} />
      <rect
        x={PLOT_X + span.physicalW}
        y={y}
        width={span.magicalW}
        height={REC_BAR_H}
        fill={MAGICAL_COLOR}
        opacity={opacity}
      />
    </>
  )
}

/** One sample: what landed (pale, on top) over the full hit (solid, beneath). */
function RecoveryBars({ r }: { r: RecoveryRow }): JSX.Element {
  return (
    <g data-testid="stance-recovery-row" data-stance={r.stanceKey} data-refused={r.refused ? '1' : '0'}>
      <SplitSpan y={r.landedY} span={r.landed} opacity={0.4} />
      {r.recovered ? (
        <SplitSpan y={r.recoveredY} span={r.recovered} opacity={0.95} />
      ) : (
        // A left-out sample draws a dashed stub where its full-hit bar would be. The HOLE is the
        // statement: a hit that got through a 95% evade is full-sized, not 5%-sized, so there is
        // nothing here to scale up and an absent bar says so louder than an absent row would.
        <line
          x1={PLOT_X}
          x2={PLOT_X + REFUSED_STUB_W}
          y1={r.recoveredY + REC_BAR_H / 2}
          y2={r.recoveredY + REC_BAR_H / 2}
          stroke={SURVIVE_COLOR}
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  )
}

/** The stance a sample was taken in, and how far it was scaled up. */
function RecoveryLabels({ r }: { r: RecoveryRow }): JSX.Element {
  const tip =
    `${r.hits} hit${r.hits === 1 ? '' : 's'} in ${r.label}: ${formatNum(r.landed.total)} landed per hit, ` +
    `${formatNum(r.recovered?.total ?? 0)} full damage`
  return (
    <OverlayRow
      top={r.y}
      height={REC_BAR_H * 2 + REC_BAR_GAP}
      label={
        <Typography variant="caption" noWrap sx={{ fontSize: 10 }}>
          {r.label}
        </Typography>
      }
      value={
        r.lift === null ? (
          <Typography variant="caption" sx={{ fontSize: 10, color: SURVIVE_COLOR, fontWeight: 700 }}>
            left out
          </Typography>
        ) : (
          // The lift IS the reciprocal of the multiplier that was divided out, so it is the one
          // number on the chart a reader can check against the observations table by hand.
          <Tooltip title={tip}>
            <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
              ×{r.lift.toFixed(2)}
            </Typography>
          </Tooltip>
        )
      }
    />
  )
}

/** The pooled per-hit average the recovered bars should sit around. */
function PooledRule({ x, height }: { x: number; height: number }): JSX.Element {
  return (
    <line
      x1={x}
      x2={x}
      y1={0}
      y2={height}
      stroke={NEUTRAL_COLOR}
      strokeWidth={1}
      strokeDasharray="2 3"
      opacity={0.8}
      vectorEffect="non-scaling-stroke"
    />
  )
}

/** The chart. Nothing to say when no sample carries a hit — an empty bucket is not an observation. */
export function RecoverySamplesChart({ row }: { row: StanceTargetRow }): JSX.Element | null {
  const chart = recoveryRows(row.samples, {
    total: row.advice.profile.physical + row.advice.profile.magical,
    hits: row.advice.hits
  })
  if (chart.rows.length === 0) return null
  return (
    <Box data-testid="stance-chart-recovery">
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.35 }}>
        Per hit, in each stance you wore: pale is what landed, solid is the full hit
        {chart.pooledPerHit === null
          ? '.'
          : `. The dashed line is ${formatNum(chart.pooledPerHit)} per hit — the figure the stances agree on once each is scaled up. Solid bars should land near it.`}
      </Typography>
      <Box sx={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${CHART_W} ${chart.height}`}
          width="100%"
          height={chart.height}
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          {chart.rows.map((r) => (
            <RecoveryBars key={r.stanceKey} r={r} />
          ))}
          {chart.pooledX !== null && <PooledRule x={chart.pooledX} height={chart.height} />}
        </svg>
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {chart.rows.map((r) => (
            <RecoveryLabels key={r.stanceKey} r={r} />
          ))}
        </Box>
      </Box>
    </Box>
  )
}
