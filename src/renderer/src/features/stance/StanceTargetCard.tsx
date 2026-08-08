// ONE TARGET, ONE CARD: what this mob hits you with, and which stance to be in against it.
//
// The card decides nothing — every string, fraction and caveat on it was built by stanceRows.ts
// out of the shared advice layer. What lives here is the ORDER, and the order is an argument:
//
//   1. the mismatch callout, when there is one — it is the only thing here that is urgent;
//   2. the caveats — BEFORE the ranking, deliberately. A thin sample or an unverifiable evade is
//      a reason to read the list differently, and a reservation printed underneath the answer it
//      qualifies is a reservation nobody reads (AGENTS.md's tooltip diet cuts the other way for
//      exactly this class of statement: it is not source-caveating, it is the finding);
//   3. the damage breakdown — the question the user actually came with;
//   4. the ranking;
//   5. the raw observations, collapsed.

import type { JSX } from 'react'
import { Alert, Box, Chip, Divider, Paper, Stack, Typography } from '@mui/material'
import { formatAge } from '../../lib/formatDate'
import { formatNum } from '../../lib/formatRate'
import { tierStyle } from '../../lib/tierChip'
import { DamageBreakdown, Observations } from './StanceEvidence'
import { mismatchLine, type RankedRow, type StanceCaveat, type StanceTargetRow } from './stanceRows'

/** Mob, zone, tier, recency. The tier chip is the app's one tier styling (lib/tierChip). */
function CardHeader({ row }: { row: StanceTargetRow }): JSX.Element {
  const t = tierStyle(row.tier)
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {row.mobName}
      </Typography>
      <Chip size="small" variant="outlined" label={row.zoneBase} />
      <Chip
        size="small"
        label={t.long}
        sx={{ bgcolor: t.bg, color: t.fg, height: 20, fontSize: 11, fontWeight: 700 }}
      />
      <Box sx={{ flexGrow: 1 }} />
      <Typography variant="caption" color="text.secondary">
        last hit you {formatAge(row.lastSeenTs)}
      </Typography>
    </Stack>
  )
}

/**
 * One stance in the ranking.
 *
 * The percentage is phrased as damage TAKEN ("you'd take 62% of it") rather than as a reduction,
 * because "50% reduction" and "takes 50%" are the same sentence for Defensive's melee half and
 * different sentences for everything else, and the ranking is over the former.
 */
function RankRow({ r }: { r: RankedRow }): JSX.Element {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{
        px: 1,
        py: 0.5,
        borderRadius: 1,
        border: '1px solid',
        borderColor: r.current ? 'primary.main' : 'transparent',
        bgcolor: r.best ? 'action.selected' : undefined
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: r.best ? 700 : 400, minWidth: 110 }}>
        {r.name}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        you&apos;d take <b>{r.percent}</b> of it
      </Typography>
      <Typography variant="caption" color="text.secondary">
        ({formatNum(r.expected)} of the pooled hits)
      </Typography>
      <Box sx={{ flexGrow: 1 }} />
      {r.current && <Chip size="small" color="primary" label="worn now" sx={{ height: 18, fontSize: 10 }} />}
      {r.free && <Chip size="small" variant="outlined" label="no upkeep" sx={{ height: 18, fontSize: 10 }} />}
      {r.enduranceGated && (
        <Chip
          size="small"
          variant="outlined"
          color="warning"
          label="endurance-gated"
          sx={{ height: 18, fontSize: 10 }}
        />
      )}
    </Stack>
  )
}

/** The ranking, or the honest reason there isn't one. */
function Ranking({ row }: { row: StanceTargetRow }): JSX.Element {
  if (row.ranked.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No stance ranking — see above.
      </Typography>
    )
  }
  return (
    <Stack spacing={0.25}>
      {row.ranked.map((r) => (
        <RankRow key={r.key} r={r} />
      ))}
    </Stack>
  )
}

/**
 * The reservations, as plain visible text.
 *
 * `nothing` and `noStances` are the two that mean there is no answer at all, so they read as
 * `info`; `thin`, `gated` and `evaded` qualify an answer that IS on screen and read as
 * `warning`. Nothing here is dismissible and nothing here is a tooltip: a caveat the user can
 * make go away is a caveat that is gone the second time it matters.
 */
function Caveats({ caveats }: { caveats: readonly StanceCaveat[] }): JSX.Element | null {
  if (caveats.length === 0) return null
  return (
    <Stack spacing={0.5}>
      {caveats.map((c) => (
        <Alert
          key={c.kind}
          severity={c.kind === 'nothing' || c.kind === 'noStances' ? 'info' : 'warning'}
          variant="outlined"
          sx={{ py: 0, '& .MuiAlert-message': { py: 0.5, fontSize: 12 } }}
          data-testid={`stance-caveat-${c.kind}`}
        >
          {c.text}
        </Alert>
      ))}
    </Stack>
  )
}

/** The un-mitigation, said once per card in one line, above the numbers it produced. */
function CorrectionLine({ row }: { row: StanceTargetRow }): JSX.Element {
  return (
    <Typography variant="caption" color="text.secondary">
      {row.usedSamples > 0
        ? `Corrected for the ${String(row.usedSamples)} stance${row.usedSamples === 1 ? '' : 's'} you were ` +
          'wearing when it landed, so the split below is what the mob swings for.'
        : 'Nothing here has been corrected — no usable sample reached the pool.'}
    </Typography>
  )
}

export default function StanceTargetCard({ row }: { row: StanceTargetRow }): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="stance-target-card">
      <Stack spacing={1}>
        <CardHeader row={row} />

        {row.mismatch && (
          <Alert severity="warning" variant="filled" data-testid="stance-mismatch">
            {mismatchLine(row.mismatch)}
          </Alert>
        )}

        <Caveats caveats={row.caveats} />

        <Divider flexItem />
        <CorrectionLine row={row} />
        <DamageBreakdown row={row} />

        <Divider flexItem />
        <Ranking row={row} />

        <Observations row={row} />
      </Stack>
    </Paper>
  )
}
