// THE STANCES TAB — "what is this mob actually hitting me with, and which stance should I be in
// against it?", answered per (mob, zone, tier) from the session's own measurements.
//
// Everything on this page is DERIVED — nothing in the EverQuest log ever says "you are in the
// wrong stance" — so the page is built to be checkable rather than merely confident. The header
// states what the two inputs are and how sure the app is of them; every card carries its own
// reservations above its own ranking; and the raw observations are one click away on each.
//
// THE LOADOUT IS INFERRED, and the header says so. `availableStances` comes from the class-combo
// module's current interval, which deliberately OVER-OFFERS while the combo is unresolved (every
// candidate class contributes its stances — main/data/stanceLoadout.ts). Presenting that list as
// "your stances" would be presenting a guess as a fact, which is world-model law 1's exact
// prohibition. The confidence itself is not on this wire (the payload carries three fields and no
// combo interval), so the label is qualitative and points at the Overview's loadout card rather
// than inventing a number.

import { type JSX, useMemo, useState } from 'react'
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material'
// The same icon the nav row wears (a fighting pose, not a shield — the Plane of Sky row already
// has a shield), so the page and the row that opens it read as one thing.
import SportsMartialArtsIcon from '@mui/icons-material/SportsMartialArts'
import { useStanceAdvice } from './useStanceAdvice'
import { buildStanceRows, mismatchCount, stanceLabel } from './stanceRows'
import StanceTargetCard from './StanceTargetCard'

/**
 * How many cards render before the "show the rest" button.
 *
 * The ledger holds up to 500 (mob, zone, tier) rows (main/combat/stanceLedger.ts
 * STANCE_TARGET_CAP), and a session that has been through a few zones really does accumulate
 * dozens. They are sorted most-recently-hit first, so the first twenty are the ones a live player
 * is asking about; the rest are one click away rather than a scroll of a hundred cards.
 */
const VISIBLE_CAP = 20

/** The two inputs, stated: the stance worn right now, and the stances this loadout can wear. */
function LoadoutHeader({
  currentStance,
  availableStances,
  mismatches
}: {
  currentStance: string | null
  availableStances: readonly string[]
  mismatches: number
}): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Typography variant="body2" color="text.secondary">
          Worn now:
        </Typography>
        {currentStance ? (
          <Chip size="small" color="primary" label={stanceLabel(currentStance)} data-testid="stance-current" />
        ) : (
          <Chip size="small" variant="outlined" label="not stated by the log this session" />
        )}
        <Box sx={{ flexGrow: 1 }} />
        {mismatches > 0 && (
          <Chip
            size="small"
            color="warning"
            label={`${String(mismatches)} target${mismatches === 1 ? '' : 's'} you are mis-stanced against`}
          />
        )}
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Ranking over your inferred loadout:
        </Typography>
        {availableStances.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            nothing observed yet
          </Typography>
        ) : (
          availableStances.map((k) => (
            <Chip key={k} size="small" variant="outlined" label={stanceLabel(k)} sx={{ height: 20 }} />
          ))
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Those are the stances your INFERRED class combo can wear — while the combo is unresolved
        the list is deliberately too wide, so a stance you cannot actually use may be ranked.
      </Typography>
    </Paper>
  )
}

/** Nothing measured: say which of the two reasons it is, and never draw an empty ranking. */
function EmptyState({ currentStance }: { currentStance: string | null }): JSX.Element {
  return (
    <Alert severity="info" data-testid="stance-empty">
      Nothing has hit you yet this session. The moment a mob lands damage on you it gets a card
      here, keyed by mob, zone and instance tier — a d0 fight and a d2 fight are not the same fight
      and are never pooled.
      {currentStance === null && ' No stance change has been printed this session either.'}
    </Alert>
  )
}

export default function StanceView(): JSX.Element {
  const payload = useStanceAdvice()
  const [showAll, setShowAll] = useState(false)
  const rows = useMemo(() => (payload ? buildStanceRows(payload) : []), [payload])
  const mismatches = useMemo(() => mismatchCount(rows), [rows])

  if (!payload) {
    return (
      <Typography variant="body2" color="text.secondary">
        Reading log…
      </Typography>
    )
  }

  const shown = showAll ? rows : rows.slice(0, VISIBLE_CAP)
  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <SportsMartialArtsIcon color="primary" />
        <Typography variant="h6">Stances</Typography>
        <Chip
          size="small"
          variant="outlined"
          label={`${String(rows.length)} target${rows.length === 1 ? '' : 's'} measured`}
          data-testid="stance-target-count"
        />
      </Stack>

      <LoadoutHeader
        currentStance={payload.currentStance}
        availableStances={payload.availableStances}
        mismatches={mismatches}
      />

      {rows.length === 0 ? (
        <EmptyState currentStance={payload.currentStance} />
      ) : (
        <Stack spacing={1.5}>
          {shown.map((r) => (
            <StanceTargetCard key={r.key} row={r} />
          ))}
          {rows.length > shown.length && (
            <Button size="small" onClick={() => setShowAll(true)} sx={{ alignSelf: 'flex-start' }}>
              Show {rows.length - shown.length} older target
              {rows.length - shown.length === 1 ? '' : 's'}
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  )
}
