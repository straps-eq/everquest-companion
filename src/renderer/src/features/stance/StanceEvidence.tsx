// THE EVIDENCE HALF of a target card: the damage breakdown, and the observations behind it.
//
// Split out of StanceTargetCard.tsx because it is a different kind of thing to read — the card
// answers "which stance", these two answer "how do you know" — and because the pair sits at the
// file's factoring ceiling together.
//
// ── WHY THE OBSERVATIONS TABLE IS ON THE PAGE AT ALL ────────────────────────────────────────
//
// Every number in the breakdown above it is UN-MITIGATED: divided by the multipliers of whatever
// stance was worn when it was measured. That correction is the only reason the physical/magical
// split means anything — the same Cazic-Thule reads 64.7% spell from inside Defensive and 37.9%
// from inside Mage Hunter, purely because each stance shrinks a different half of the same
// attack pattern (shared/stances.ts `unmitigate`). A surface that silently applied that and
// showed one clean number would be asking to be trusted about the most load-bearing step in the
// feature. So the raw observations stay one click away, with the multiplier that was divided out
// printed beside each one, and a refused sample says REFUSED rather than quietly vanishing.

import { type JSX, useState } from 'react'
import {
  Box,
  Button,
  Collapse,
  LinearProgress,
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
import type { SampleRow, StanceTargetRow } from './stanceRows'

/** One `phys/mag` pair, rendered the way every damage total in the app is (lib/formatRate). */
function Pair({ physical, magical }: { physical: number; magical: number }): JSX.Element {
  return (
    <>
      {formatNum(physical)} <Box component="span" sx={{ opacity: 0.5 }}>/</Box> {formatNum(magical)}
    </>
  )
}

/**
 * The headline breakdown: how many hits, how big the worst one was, and the physical/magical
 * split of what the mob SWINGS FOR.
 *
 * `biggestHit` is deliberately the OBSERVED figure — the ledger stores it un-corrected, and it
 * is the one number here a player can check against his own screen. The split beside it is the
 * corrected one, and the row says so in three words rather than a footnote.
 */
export function DamageBreakdown({ row }: { row: StanceTargetRow }): JSX.Element {
  const { advice, split } = row
  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="baseline" flexWrap="wrap">
        <Typography variant="body2">
          <b>{advice.hits}</b> hits pooled
        </Typography>
        <Typography variant="body2" color="text.secondary">
          biggest landed hit <b>{formatNum(row.biggestHit)}</b>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          est. un-mitigated total <b>{formatNum(advice.profile.physical + advice.profile.magical)}</b>
        </Typography>
      </Stack>
      {split ? (
        <Box sx={{ mt: 0.75 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>
              {split.physical}% physical
            </Typography>
            <Typography variant="caption" color="text.secondary">
              ({formatNum(advice.profile.physical)})
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Typography variant="caption" color="text.secondary">
              ({formatNum(advice.profile.magical)})
            </Typography>
            <Typography variant="caption" sx={{ color: 'info.main', fontWeight: 600 }}>
              {split.magical}% magical
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={split.physical}
            color="warning"
            sx={{ height: 8, borderRadius: 1, bgcolor: 'info.main' }}
          />
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          No usable split yet.
        </Typography>
      )}
    </Box>
  )
}

/** One observation row: what landed, what was divided out, what went into the pool. */
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
            refused
          </Box>
        )}
      </TableCell>
    </TableRow>
  )
}

/**
 * The per-stance observations, behind an expander that NAMES what it holds.
 *
 * The trigger says how many stances were corrected for rather than "details", because that count
 * is itself the claim being backed up: "pooled from 3 stances you wore" is only meaningful if you
 * can see the three.
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
        {row.samples.length} raw observation{row.samples.length === 1 ? '' : 's'}, and the correction applied
      </Button>
      <Collapse in={open} unmountOnExit>
        <Paper variant="outlined" sx={{ mt: 0.5, p: 1 }}>
          <Table size="small" sx={{ '& td, & th': { py: 0.4, fontSize: 12 } }}>
            <TableHead>
              <TableRow>
                <TableCell>Stance worn</TableCell>
                <TableCell align="right">hits</TableCell>
                <TableCell align="right">landed (phys / mag)</TableCell>
                <TableCell align="right">divided out</TableCell>
                <TableCell align="right">swung for (est.)</TableCell>
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
