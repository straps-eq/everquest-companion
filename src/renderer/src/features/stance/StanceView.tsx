// THE STANCES TAB — "what is this mob actually hitting me with, and which stance should I be in
// against it?", answered per (mob, zone, tier) from the session's own measurements.
//
// Everything on this page is DERIVED — nothing in the EverQuest log ever says "you are in the
// wrong stance" — so the page is built to be checkable rather than merely confident. The header
// states what the two inputs are and how sure the app is of them; every card carries its own
// reservations above its own answer; and the raw observations are one click away on each.
//
// TWO ANSWERS PER CARD, NOT ONE, and the header's legend says which is which before you read a
// single card. Evasive's 95% evade dominates the raw arithmetic against essentially every mob
// while costing two endurance per evaded point and failing outright on empty endurance — and the
// log never prints endurance, so the app can never verify it. `shared/stances.ts` therefore
// splits the answer (`bestSustained` / `bestEmergency`) and this tab draws the two in different
// colors: green is the stance you WEAR, amber is the one you POP. Stating that once up here is
// what lets fifteen cards below stay compact enough to scan.
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
import { alpha } from '@mui/material/styles'
// The same icon the nav row wears (a fighting pose, not a shield — the Plane of Sky row already
// has a shield), so the page and the row that opens it read as one thing.
import SportsMartialArtsIcon from '@mui/icons-material/SportsMartialArts'
import BoltIcon from '@mui/icons-material/Bolt'
import ShieldMoonIcon from '@mui/icons-material/ShieldMoon'
import { useStanceAdvice } from './useStanceAdvice'
import { buildStanceRows, mismatchCount, stanceLabel } from './stanceRows'
import { HOLD_COLOR, SURVIVE_COLOR } from './StanceRecommendation'
import StanceTargetCard from './StanceTargetCard'

/**
 * THE LEGEND, said once at the top instead of on fifteen cards.
 *
 * Two colors carry the whole correction this tab exists to make — green is the stance you WEAR,
 * amber is the one you POP — and a color the user has to infer from context fifteen times is a
 * color that gets inferred wrong once. Stating it here costs one line and lets every card below
 * stay compact.
 */
function SplitLegend(): JSX.Element {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <ShieldMoonIcon sx={{ fontSize: 15, color: HOLD_COLOR }} />
        <Typography variant="caption" sx={{ color: HOLD_COLOR, fontWeight: 700 }}>
          the stance to hold
        </Typography>
      </Stack>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <BoltIcon sx={{ fontSize: 15, color: SURVIVE_COLOR }} />
        <Typography variant="caption" sx={{ color: SURVIVE_COLOR, fontWeight: 700 }}>
          survive mode
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Evasive&apos;s 95% evade wins the raw arithmetic against almost everything, and it is
        endurance-gated — so it is offered as an escape hatch, never as the standing answer.
      </Typography>
    </Stack>
  )
}

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
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        background: (t) =>
          `linear-gradient(135deg, ${alpha(t.palette.primary.main, 0.08)}, ${alpha(t.palette.background.paper, 0)} 55%)`
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="body2" color="text.secondary">
          Worn now:
        </Typography>
        {currentStance ? (
          <Chip
            size="small"
            color="primary"
            label={stanceLabel(currentStance)}
            sx={{ fontWeight: 700 }}
            data-testid="stance-current"
          />
        ) : (
          <Chip size="small" variant="outlined" label="not stated by the log this session" />
        )}
        <Box sx={{ flexGrow: 1 }} />
        {mismatches > 0 && (
          <Chip
            size="small"
            color="warning"
            label={`${String(mismatches)} target${mismatches === 1 ? '' : 's'} you are mis-stanced against`}
            sx={{ fontWeight: 700 }}
          />
        )}
      </Stack>
      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Ranking over your inferred loadout:
        </Typography>
        {availableStances.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            nothing observed yet
          </Typography>
        ) : (
          availableStances.map((k) => (
            <Chip
              key={k}
              size="small"
              variant="outlined"
              label={stanceLabel(k)}
              sx={{ height: 20, fontSize: 11, borderColor: (t) => alpha(t.palette.primary.main, 0.4) }}
            />
          ))
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Those are the stances your INFERRED class combo can wear — while the combo is unresolved
        the list is deliberately too wide, so a stance you cannot actually use may be ranked.
      </Typography>
      <SplitLegend />
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
        <Stack spacing={1}>
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
