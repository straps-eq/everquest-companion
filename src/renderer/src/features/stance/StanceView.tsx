// THE STANCES TAB — "what is this mob actually hitting me with, and which stance should I be in
// against it?", answered per (mob, zone, tier) from the session's own measurements.
//
// Everything on this page is DERIVED — nothing in the EverQuest log ever says "you are in the
// wrong stance" — so the page is built to be checkable rather than merely confident. The header
// states what the two inputs are and how sure the app is of them; the open panel carries its own
// reservations above its own answer; the correction behind every number on it is DRAWN
// (StanceRecoveryChart.tsx) rather than merely applied; and the raw observations are one click
// away underneath.
//
// ── MASTER / DETAIL, AND WHY THE STACK OF CARDS HAD TO GO ───────────────────────────────────
//
// This tab used to render up to twenty full target cards down the page. Every one of them was
// honest and the whole was unreadable: a wall of identical panels is a surface a user scrolls
// past, and the page's actual answer — the stance to wear against the thing currently chewing on
// him — was somewhere in the middle of it. It is now ONE detailed panel plus a standing list of
// the rest (StanceSelector.tsx), which is the same total information in an order that has a top.
//
// The default is the most recent target WITH USABLE DATA, not simply the most recent
// (stanceRows.ts `defaultTargetKey`): a mob whose every hit landed while Evasive was worn pools to
// zero usable hits and its panel is a caveat, which is a terrible thing to open on.
//
// SELECTION IS COMPONENT STATE and nothing else. It is a view of a session-scoped ledger that is
// capped and reset on character switch, so persisting a key across runs would restore a selection
// pointing at nothing; `resolveSelection` falls back to the default whenever the held key is gone,
// which is also what makes a refresh mid-read safe.
//
// TWO ANSWERS PER TARGET, NOT ONE, and the header's legend says which is which before you read
// the panel. Evasive's 95% evade dominates the raw arithmetic against essentially every mob while
// costing two endurance per evaded point and failing outright on empty endurance — and the log
// never prints endurance, so the app can never verify it. `shared/stances.ts` therefore splits the
// answer (`bestSustained` / `bestEmergency`) and this tab draws the two in different colors: green
// is the stance you WEAR, amber is the one you POP. Those two colors are also the comparison
// chart's, so the legend up here is what makes that chart readable without a key of its own.
//
// THE LOADOUT IS INFERRED, and the header says so. `availableStances` comes from the class-combo
// module's current interval, which deliberately OVER-OFFERS while the combo is unresolved (every
// candidate class contributes its stances — main/data/stanceLoadout.ts). Presenting that list as
// "your stances" would be presenting a guess as a fact, which is world-model law 1's exact
// prohibition. The confidence itself is not on this wire (the payload carries three fields and no
// combo interval), so the label is qualitative and points at the Overview's loadout card rather
// than inventing a number.

import { type JSX, useMemo, useState } from 'react'
import { Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
// The same icon the nav row wears (a fighting pose, not a shield — the Plane of Sky row already
// has a shield), so the page and the row that opens it read as one thing.
import SportsMartialArtsIcon from '@mui/icons-material/SportsMartialArts'
import BoltIcon from '@mui/icons-material/Bolt'
import ShieldMoonIcon from '@mui/icons-material/ShieldMoon'
import { useStanceAdvice } from './useStanceAdvice'
import { buildStanceRows, mismatchCount, resolveSelection, stanceLabel, type StanceTargetRow } from './stanceRows'
import { HOLD_COLOR, SURVIVE_COLOR } from './StanceRecommendation'
import { StanceSelector } from './StanceSelector'
import StanceTargetCard from './StanceTargetCard'

/**
 * THE LEGEND, said once at the top rather than on every chart that uses it.
 *
 * Two colors carry the whole correction this tab exists to make — green is the stance you WEAR,
 * amber is the one you POP — and a color the user has to infer from context is a color that gets
 * inferred wrong once. The comparison chart in the panel below is drawn in exactly these two hues
 * plus grey, so this one line is that chart's key as well as the page's.
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
      Nothing has hit you yet this session. The moment a mob lands damage on you it gets an entry
      in the list here, keyed by mob, zone and instance tier — a d0 fight and a d2 fight are not
      the same fight and are never pooled.
      {currentStance === null && ' No stance change has been printed this session either.'}
    </Alert>
  )
}

/**
 * The list and the open target, side by side.
 *
 * `flexWrap` rather than a breakpoint: the tab shares its width with the nav rail and with a
 * user-resizable window, and the only thing that matters is that the detail panel keeps enough
 * room for a 720-unit chart. Below that the list drops above it instead of squeezing it.
 */
function MasterDetail({
  rows,
  selected,
  picked,
  onSelect
}: {
  rows: readonly StanceTargetRow[]
  selected: StanceTargetRow
  picked: string | null
  onSelect: (key: string) => void
}): JSX.Element {
  const [showAll, setShowAll] = useState(false)
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <StanceSelector
        rows={rows}
        // The SELECTED key, not the PICKED one: with nothing picked the list must highlight the
        // default the panel is actually showing, or the page contradicts itself on arrival.
        selectedKey={selected.key}
        onSelect={onSelect}
        showAll={showAll}
        onShowAll={() => setShowAll(true)}
      />
      <Box sx={{ flexGrow: 1, flexBasis: 420, minWidth: 0 }}>
        {/* Keyed by target: switching targets rebuilds the panel rather than re-using it, so the
            observations expander cannot carry its open state onto a different mob's table. */}
        <StanceTargetCard key={selected.key} row={selected} />
        {picked !== null && !rows.some((r) => r.key === picked) && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            The target you had open is no longer in the ledger — it aged out, or the character
            changed. Showing the most recent measured target instead.
          </Typography>
        )}
      </Box>
    </Box>
  )
}

export default function StanceView(): JSX.Element {
  const payload = useStanceAdvice()
  // The user's pick, or null for "whatever the default rule says". Deliberately not seeded from
  // the first payload: seeding would freeze the choice at whatever had most recently hit you when
  // the tab happened to mount, and then never follow the fight.
  const [picked, setPicked] = useState<string | null>(null)
  const rows = useMemo(() => (payload ? buildStanceRows(payload) : []), [payload])
  const mismatches = useMemo(() => mismatchCount(rows), [rows])
  const selected = useMemo(() => resolveSelection(rows, picked), [rows, picked])

  if (!payload) {
    return (
      <Typography variant="body2" color="text.secondary">
        Reading log…
      </Typography>
    )
  }

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

      {selected === null ? (
        <EmptyState currentStance={payload.currentStance} />
      ) : (
        <MasterDetail rows={rows} selected={selected} picked={picked} onSelect={setPicked} />
      )}
    </Stack>
  )
}
