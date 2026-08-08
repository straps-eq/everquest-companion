// THE TARGET LIST — the master half of the Stances tab's master/detail.
//
// ── WHY A LIST AND NOT A DROPDOWN ───────────────────────────────────────────────────────────
//
// The obvious control for "pick one of N" is a Select, and it is the wrong one here. Choosing a
// target is not choosing a name: a d0 fetid fiend and a d2 fetid fiend are different fights that
// must never pool (shared/stanceAdvice.ts), the answer is only as good as the pooled hit count
// behind it, "20m ago" and "just now" are different questions, and a target you are actively
// MIS-STANCED against is the one thing on this page that is urgent. That is five facts per entry,
// and a dropdown can show them only after a click — which means the user has to open the menu to
// find out whether opening the menu was worth it.
//
// A standing list shows all five at rest, keeps the mismatch markers visible while the detail
// panel is being read, and — because the ledger is ordered most-recently-hit first — puts what you
// are fighting right now at the top without a sort control. It costs a column of width, which is
// exactly what the page got back by rendering one detail panel instead of twenty cards.
//
// ── WHAT AN ENTRY MAY AND MAY NOT SAY ───────────────────────────────────────────────────────
//
// Everything here is read off the built row; nothing is re-derived. `advice.hits` is the POOLED
// count (evasive samples excluded — see `unmitigate`), so an entry reading "0 usable hits" is not
// a bug and must not be hidden: that target has been hitting you and the app can say nothing about
// how hard, which is a fact worth showing rather than a row worth dropping. It is only barred from
// being the DEFAULT selection (stanceRows.ts `defaultTargetKey`).

import type { JSX } from 'react'
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { formatAge } from '../../lib/formatDate'
import { tierStyle } from '../../lib/tierChip'
import { SURVIVE_COLOR } from './StanceRecommendation'
import { visibleTargets, type StanceTargetRow } from './stanceRows'

/**
 * How many entries stand before the "show the rest" button.
 *
 * The ledger holds up to 500 (mob, zone, tier) rows (main/combat/stanceLedger.ts
 * STANCE_TARGET_CAP) and a session through a few zones really does accumulate dozens. They are
 * ordered most-recently-hit first, so the first two dozen are the ones a live player is asking
 * about; the rest are one click away rather than a 500-row scroll. `visibleTargets` guarantees the
 * SELECTED entry is in the slice whatever the cap says.
 */
export const VISIBLE_CAP = 24

/** One target, at a glance: who, where, how sure, how recent, and whether it is urgent. */
function SelectorEntry({
  row,
  selected,
  onSelect
}: {
  row: StanceTargetRow
  selected: boolean
  onSelect: (key: string) => void
}): JSX.Element {
  const t = tierStyle(row.tier)
  const usable = row.advice.hits > 0
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onSelect(row.key)}
      data-testid="stance-selector-entry"
      data-key={row.key}
      data-selected={selected ? '1' : '0'}
      aria-pressed={selected}
      sx={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
        px: 0.9,
        py: 0.6,
        borderRadius: 1,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : row.mismatch ? alpha(SURVIVE_COLOR, 0.45) : 'transparent',
        bgcolor: (th) => (selected ? alpha(th.palette.primary.main, 0.14) : 'transparent'),
        '&:hover': { bgcolor: (th) => alpha(th.palette.primary.main, selected ? 0.18 : 0.07) }
      }}
    >
      <Stack direction="row" spacing={0.5} alignItems="center">
        {/* The one urgent thing an entry can carry, and it is carried WITHOUT a hover: you are in
            the wrong stance against this one right now. */}
        {row.mismatch && (
          <WarningAmberIcon data-testid="stance-selector-mismatch" sx={{ fontSize: 14, color: SURVIVE_COLOR, flexShrink: 0 }} />
        )}
        <Typography variant="body2" noWrap sx={{ fontWeight: selected ? 700 : 500, minWidth: 0, flexGrow: 1 }}>
          {row.mobName}
        </Typography>
        <Chip
          size="small"
          label={t.label}
          sx={{ bgcolor: t.bg, color: t.fg, height: 15, fontSize: 9, fontWeight: 700, flexShrink: 0 }}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: 10 }}>
        {row.zoneBase}
      </Typography>
      <Stack direction="row" spacing={0.75} alignItems="baseline">
        <Typography
          variant="caption"
          sx={{ fontSize: 10, color: usable ? 'text.secondary' : SURVIVE_COLOR, fontWeight: usable ? 400 : 700 }}
        >
          {usable ? `${row.advice.hits} hits pooled` : 'no usable hits'}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, whiteSpace: 'nowrap' }}>
          {formatAge(row.lastSeenTs)}
        </Typography>
      </Stack>
    </Box>
  )
}

/**
 * The list. Scrolls on its own so the detail panel beside it never moves, and never grows past
 * the viewport however long a session runs.
 */
export function StanceSelector({
  rows,
  selectedKey,
  onSelect,
  showAll,
  onShowAll
}: {
  rows: readonly StanceTargetRow[]
  selectedKey: string | null
  onSelect: (key: string) => void
  showAll: boolean
  onShowAll: () => void
}): JSX.Element {
  const shown = visibleTargets(rows, selectedKey, showAll ? rows.length : VISIBLE_CAP)
  const hidden = rows.length - shown.length
  return (
    <Paper
      variant="outlined"
      data-testid="stance-selector"
      sx={{ p: 0.6, width: 232, flexShrink: 0, maxHeight: '72vh', overflowY: 'auto' }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ px: 0.6, fontWeight: 700 }}>
        Targets, most recent first
      </Typography>
      <Stack spacing={0.25} sx={{ mt: 0.4 }}>
        {shown.map((r) => (
          <SelectorEntry key={r.key} row={r} selected={r.key === selectedKey} onSelect={onSelect} />
        ))}
      </Stack>
      {hidden > 0 && (
        <Button size="small" fullWidth onClick={onShowAll} data-testid="stance-selector-more" sx={{ mt: 0.4, fontSize: 11 }}>
          Show {hidden} older target{hidden === 1 ? '' : 's'}
        </Button>
      )}
    </Paper>
  )
}
