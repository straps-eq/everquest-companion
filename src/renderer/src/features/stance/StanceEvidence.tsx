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
import { CAT_COLOR } from '../combat/combatShared'
import { Tooltip } from '../../lib/Tooltip'
import type { SampleRow, StanceTargetRow } from './stanceRows'

/**
 * THE TWO HUES, borrowed rather than invented.
 *
 * `combatShared.CAT_COLOR` is already the app's vocabulary for "this damage was swung" (melee
 * gold) versus "this damage was cast" (spell violet) — the meter, the timeline and the overlay
 * all speak it. The stance question is that same partition seen from the receiving end
 * (shared/stances.ts: physical/magical IS melee/spell, named twice by the wiki), so re-picking a
 * palette here would have taught the user a second color language for one page.
 */
export const PHYSICAL_COLOR = CAT_COLOR.melee
export const MAGICAL_COLOR = CAT_COLOR.spell

/** One legend entry: a colored swatch, the share, and the points behind it. */
function SplitLegend({
  color,
  label,
  percent,
  amount,
  align
}: {
  color: string
  label: string
  percent: number
  amount: number
  align: 'left' | 'right'
}): JSX.Element {
  return (
    // `useFlexGap` matters here: Stack's default spacing is a margin keyed on `direction`, which
    // lands on the wrong side once the row is reversed. `gap` is direction-agnostic.
    <Stack
      direction="row"
      spacing={0.6}
      useFlexGap
      alignItems="center"
      sx={{ flexDirection: align === 'right' ? 'row-reverse' : 'row' }}
    >
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

/**
 * The composition bar: ONE strip, two segments, in the two hues above.
 *
 * It replaced a `LinearProgress` whose track was tinted to fake a second segment. That trick
 * renders the same picture and cannot carry a tooltip on either half, which is the whole reason
 * to draw the bar: the split is the question the page exists to answer ("does this thing hit me
 * with its fists or its spells"), so each half says what it is when you point at it.
 */
function SplitBar({ physical, magical }: { physical: number; magical: number }): JSX.Element {
  return (
    <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.06)' }}>
      <Tooltip title={`${String(physical)}% of what this mob swings for is physical — melee, the half Defensive halves`}>
        <Box sx={{ width: `${String(physical)}%`, bgcolor: PHYSICAL_COLOR }} />
      </Tooltip>
      <Tooltip title={`${String(magical)}% is magical — spell damage, the half Mage Hunter halves`}>
        <Box sx={{ width: `${String(magical)}%`, bgcolor: MAGICAL_COLOR }} />
      </Tooltip>
    </Box>
  )
}

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
    <Box data-testid="stance-split">
      {split ? (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.4 }}>
            <SplitLegend
              color={PHYSICAL_COLOR}
              label="physical"
              percent={split.physical}
              amount={advice.profile.physical}
              align="left"
            />
            <Box sx={{ flexGrow: 1 }} />
            <SplitLegend
              color={MAGICAL_COLOR}
              label="magical"
              percent={split.magical}
              amount={advice.profile.magical}
              align="right"
            />
          </Stack>
          <SplitBar physical={split.physical} magical={split.magical} />
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No usable split yet.
        </Typography>
      )}
      <Stack direction="row" spacing={1.5} alignItems="baseline" flexWrap="wrap" sx={{ mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          <Box component="b" sx={{ color: 'text.primary' }}>
            {advice.hits}
          </Box>{' '}
          hits pooled
        </Typography>
        <Typography variant="caption" color="text.secondary">
          biggest landed{' '}
          <Box component="b" sx={{ color: 'text.primary' }}>
            {formatNum(row.biggestHit)}
          </Box>
        </Typography>
        <Typography variant="caption" color="text.secondary">
          est. swung for{' '}
          <Box component="b" sx={{ color: 'text.primary' }}>
            {formatNum(advice.profile.physical + advice.profile.magical)}
          </Box>
        </Typography>
      </Stack>
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
