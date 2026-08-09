// THE EVIDENCE HALF of a target card: the damage breakdown, and the observations behind it.
//
// Split out of StanceTargetCard.tsx because it is a different kind of thing to read — the card
// answers "which stance", these two answer "how do you know" — and because the pair sits at the
// file's factoring ceiling together.
//
// ── WHY THE OBSERVATIONS TABLE IS ON THE PAGE AT ALL ────────────────────────────────────────
//
// Every number in the breakdown above it is FULL DAMAGE: scaled back up by the multipliers of
// whatever stance was worn when it was measured. That step is the only reason the physical/
// magical mix means anything — the same Cazic-Thule reads 64.7% spell from inside Defensive and
// 37.9% from inside Mage Hunter, purely because each stance shrinks a different half of the same
// attack pattern (shared/stances.ts `unmitigate`). A surface that silently applied that and
// showed one clean number would be asking to be trusted about the most load-bearing step in the
// feature. So the raw observations stay one click away, with the multiplier each hit was scaled
// up by printed beside it, and a dropped sample says "left out" rather than quietly vanishing.

import { type JSX, useState } from 'react'
import {
  Box,
  Button,
  Collapse,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { formatNum } from '../../lib/formatRate'
import { CompositionDonut, CompositionLegend } from './StanceCharts'
import type { SampleRow, StanceTargetRow } from './stanceRows'

/** One `phys/mag` pair, rendered the way every damage total in the app is (lib/formatRate). */
function Pair({ physical, magical }: { physical: number; magical: number }): JSX.Element {
  return (
    <>
      {formatNum(physical)} <Box component="span" sx={{ opacity: 0.5 }}>/</Box> {formatNum(magical)}
    </>
  )
}

/** The three figures under the ring: what was measured, the worst single hit, the full total. */
function BreakdownFigures({ row }: { row: StanceTargetRow }): JSX.Element {
  const { advice } = row
  return (
    <Stack direction="row" spacing={1.5} alignItems="baseline" flexWrap="wrap" useFlexGap>
      <Typography variant="caption" color="text.secondary">
        <Box component="b" sx={{ color: 'text.primary' }}>
          {advice.hits}
        </Box>{' '}
        hits measured
      </Typography>
      <Typography variant="caption" color="text.secondary">
        biggest landed{' '}
        <Box component="b" sx={{ color: 'text.primary' }}>
          {formatNum(row.biggestHit)}
        </Box>
      </Typography>
      <Typography variant="caption" color="text.secondary">
        full damage (est.){' '}
        <Box component="b" sx={{ color: 'text.primary' }}>
          {formatNum(advice.profile.physical + advice.profile.magical)}
        </Box>
      </Typography>
    </Stack>
  )
}

/**
 * The headline breakdown: how many hits, how big the worst one was, and the physical/magical
 * DAMAGE MIX of the full hit.
 *
 * The mix is now a DONUT (StanceCharts.tsx) rather than the two-segment strip that used to sit
 * here — same two hues, same per-half tooltips, but the ring's hole carries the estimated total,
 * so the size and the shape of the incoming damage are one object instead of a bar and a footnote
 * six lines apart. The strip's legend survives as `CompositionLegend`, beside it.
 *
 * `biggestHit` is deliberately the figure AS IT LANDED — the ledger stores it un-scaled, and it
 * is the one number here a player can check against his own screen. The mix beside it is the
 * scaled-up one, and the correction line under it says so.
 */
export function DamageBreakdown({ row }: { row: StanceTargetRow }): JSX.Element {
  const { advice, split } = row
  return (
    <Box data-testid="stance-split">
      {split ? (
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <CompositionDonut split={split} total={advice.profile.physical + advice.profile.magical} />
          <Stack spacing={0.6} sx={{ minWidth: 0, flexGrow: 1 }}>
            <CompositionLegend split={split} profile={advice.profile} />
            <BreakdownFigures row={row} />
          </Stack>
        </Stack>
      ) : (
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary">
            No usable damage mix yet.
          </Typography>
          <BreakdownFigures row={row} />
        </Stack>
      )}
    </Box>
  )
}

/** One observation row: what landed, what it was scaled up by, what went into the pool. */
function ObservationRow({ s }: { s: SampleRow }): JSX.Element {
  return (
    <TableRow hover>
      <TableCell>{s.stanceLabel}</TableCell>
      <TableCell align="right">{s.hits}</TableCell>
      <TableCell align="right">
        <Pair physical={s.observed.physical} magical={s.observed.magical} />
      </TableCell>
      <TableCell align="right" sx={{ color: 'text.secondary' }}>
        ×{s.multiplier.physical} / ×{s.multiplier.magical}
      </TableCell>
      <TableCell align="right">
        {s.unmitigated ? (
          <Pair physical={s.unmitigated.physical} magical={s.unmitigated.magical} />
        ) : (
          <Box component="span" sx={{ color: 'warning.main' }}>
            left out
          </Box>
        )}
      </TableCell>
    </TableRow>
  )
}

/**
 * The per-stance observations, behind an expander that NAMES what it holds.
 *
 * The trigger says how many observations there are rather than "details", because that count is
 * itself the claim being backed up: "measured in 3 stances you wore" is only meaningful if you
 * can see the three. The two damage columns print physical / magical, and the line above the
 * table says so once instead of widening every header.
 */
export function Observations({ row }: { row: StanceTargetRow }): JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (row.samples.length === 0) return null
  return (
    <Box>
      <Button
        size="small"
        onClick={() => setOpen((v) => !v)}
        startIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        sx={{ textTransform: 'none' }}
        data-testid="stance-observations-toggle"
      >
        {row.samples.length} raw observation{row.samples.length === 1 ? '' : 's'}, and how each was scaled up
      </Button>
      <Collapse in={open} unmountOnExit>
        <Paper variant="outlined" sx={{ mt: 0.5, p: 1 }}>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.3 }}>
            Damage reads physical / magical.
          </Typography>
          <Table size="small" sx={{ '& td, & th': { py: 0.4, fontSize: 12 } }}>
            <TableHead>
              <TableRow>
                <TableCell>Stance worn</TableCell>
                <TableCell align="right">hits</TableCell>
                <TableCell align="right">landed</TableCell>
                <TableCell align="right">scaled up by</TableCell>
                <TableCell align="right">full damage (est.)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {row.samples.map((s) => (
                <ObservationRow key={s.stanceKey} s={s} />
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Collapse>
    </Box>
  )
}
