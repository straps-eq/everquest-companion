// THE SHAPE EVERY CHART ON THE MOTES TAB TAKES: a stretched SVG plot with an upright HTML label
// layer over it. Extracted from MoteCharts.tsx when the tab gained its third chart.
//
// ── WHY THE TEXT IS HTML AND THE BARS ARE SVG ───────────────────────────────────────────────
//
// Every chart here is a fixed 720-unit viewBox drawn at `width="100%"` with
// `preserveAspectRatio="none"`, so X stretches to the panel and Y is 1:1. That is right for a bar
// — its length IS the datum — and ruinous for a glyph, so the labels ride an absolutely positioned
// HTML layer whose gutters are the same FRACTIONS of the width the geometry reserved.
//
// ── WHY THE GUTTERS ARE PARAMETERS ──────────────────────────────────────────────────────────
//
// StanceCharts.tsx has the same component and this folder deliberately did NOT import it: that
// one's gutters are the stance geometry's constants (132/108) and these charts reserve their own
// (184/112, because a zone name carries an instance suffix). Re-spelling it once was cheap.
// Re-spelling it a THIRD time — for the upgrade-curve chart, whose left gutter holds "+4 → +5" and
// whose right holds "512 exp" — would be a copy too far, so the two numbers that actually differ
// are props and the component is shared inside the folder. Nothing here is exported past the
// motes feature; the stance copy stays where it is.

import type { JSX } from 'react'
import { Box } from '@mui/material'
import { CHART_W } from './moteChartGeometry'

/** One row of text laid over the plot: left gutter, the plot span itself, right gutter. */
export function OverlayRow({
  top,
  height,
  labelPct,
  valuePct,
  label,
  value,
  mid
}: {
  top: number
  height: number
  /** width of the left gutter as a percentage of the viewBox — the geometry's `LABEL_PCT` */
  labelPct: number
  /** width of the right gutter, likewise — the geometry's `VALUE_PCT` */
  valuePct: number
  label: JSX.Element
  value: JSX.Element
  /** positioned inside the plot span, which is `position: relative` for exactly this */
  mid?: JSX.Element
}): JSX.Element {
  return (
    <Box sx={{ position: 'absolute', left: 0, right: 0, top, height, display: 'flex', alignItems: 'center' }}>
      <Box sx={{ width: `${labelPct}%`, pr: 0.6, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.4 }}>
        {label}
      </Box>
      <Box sx={{ flexGrow: 1, position: 'relative', height: '100%' }}>{mid}</Box>
      <Box
        sx={{
          width: `${valuePct}%`,
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

/** The stretched SVG plus its upright HTML label layer — the frame all three charts sit in. */
export function ChartFrame({
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
