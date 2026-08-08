// ONE TARGET, ONE CARD: what this mob hits you with, and which stance to be in against it.
//
// The card decides nothing — every string, fraction and caveat on it was built by stanceRows.ts
// out of the shared advice layer. What lives here is the ORDER, and the order is an argument:
//
//   1. the mismatch callout, when there is one — it is the only thing here that is urgent;
//   2. the BANNER caveats — BEFORE the answer, deliberately. A thin sample or a loadout with
//      nothing holdable in it is a reason to read what follows differently, and a reservation
//      printed underneath the answer it qualifies is a reservation nobody reads (AGENTS.md's
//      tooltip diet cuts the other way for exactly this class of statement: it is not
//      source-caveating, it is the finding);
//   3. the recommendation — `advice.sustained`, the stance you actually wear;
//   4. survive mode — `advice.emergency`, deliberately separate and deliberately quieter;
//   5. the damage composition, which is the evidence for 3 and 4;
//   6. the full ranking, as bars;
//   7. the raw observations, collapsed.
//
// ── ON VOLUME ───────────────────────────────────────────────────────────────────────────────
//
// This used to render up to FIVE stacked full-width Alerts above the answer, on every one of
// fifteen-plus cards. That is not honesty, it is noise wearing honesty's clothes — a wall of
// orange trains the eye to skip the whole region, including the two statements that are actually
// load-bearing. So `caveatsFor` now assigns each reservation a volume and this file just renders
// the groups: `banner` as visible prose, `survive` inside the survive block (StanceRecommendation
// .tsx), `chip` as a small colored chip with the full sentence on hover. Nothing was deleted and
// nothing became dismissible.

import type { JSX } from 'react'
import { Box, Chip, Divider, Paper, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { Tooltip } from '../../lib/Tooltip'
import { formatAge } from '../../lib/formatDate'
import { formatNum } from '../../lib/formatRate'
import { tierStyle } from '../../lib/tierChip'
import { DamageBreakdown, Observations } from './StanceEvidence'
import { HOLD_COLOR, Recommendation, SURVIVE_COLOR, SurviveMode } from './StanceRecommendation'
import { caveatsAt, mismatchLine, type RankedRow, type StanceCaveat, type StanceTargetRow } from './stanceRows'

/** A ranked row that is neither the pick nor the escape hatch: present, measured, not the answer. */
const NEUTRAL_COLOR = '#8891a0'

/** Theme `secondary.main` (theme.ts) — the "there is no answer, here is why" blue. */
const INFO_COLOR = '#6fb3d2'

/** Mob, zone, tier, recency. The tier chip is the app's one tier styling (lib/tierChip). */
function CardHeader({ row }: { row: StanceTargetRow }): JSX.Element {
  const t = tierStyle(row.tier)
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {row.mobName}
      </Typography>
      <Chip size="small" variant="outlined" label={row.zoneBase} sx={{ height: 20, fontSize: 11 }} />
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
 * One stance in the ranking, as a proportional bar.
 *
 * The bar's WIDTH is the damage you would take, so shorter is better and the shape of the whole
 * list is readable without reading a single number. Color carries the split rather than the
 * order: green is the stance to hold, amber is survive mode, everything else is grey. Nothing
 * about `ranked[0]` is emphasised — it is Evasive on nearly every card, and the point of the
 * whole exercise is that the list's arithmetic winner is not the page's answer.
 */
function RankRow({ r }: { r: RankedRow }): JSX.Element {
  const color = r.recommended ? HOLD_COLOR : r.emergency ? SURVIVE_COLOR : NEUTRAL_COLOR
  const tag = r.recommended ? 'hold this' : r.emergency ? 'survive only' : r.free ? 'no upkeep' : ''
  return (
    <Box
      data-testid="stance-rank-row"
      sx={{
        position: 'relative',
        height: 20,
        borderRadius: 0.5,
        overflow: 'hidden',
        bgcolor: 'rgba(255,255,255,0.04)',
        outline: r.current ? `1px solid ${alpha(NEUTRAL_COLOR, 0.9)}` : 'none'
      }}
    >
      {/* A floor of 2%, so Evasive's 5% is still a visible sliver rather than nothing at all. */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          width: `${String(Math.max(2, Math.round(r.fraction * 1000) / 10))}%`,
          bgcolor: color,
          opacity: 0.35
        }}
      />
      <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: color }} />
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ position: 'absolute', inset: 0, pl: '9px', pr: 0.75 }}>
        <Typography variant="caption" noWrap sx={{ fontWeight: r.recommended ? 700 : 500, minWidth: 88 }}>
          {r.name}
        </Typography>
        {r.current && <Chip size="small" color="primary" label="worn" sx={{ height: 15, fontSize: 9 }} />}
        {tag && (
          <Typography variant="caption" sx={{ color, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {tag}
          </Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, whiteSpace: 'nowrap' }}>
          {formatNum(r.expected)}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 30, textAlign: 'right' }}>
          {r.percent}
        </Typography>
      </Stack>
    </Box>
  )
}

/** The full ranking — honest arithmetic, kept visible, drawn so it does not read as the answer. */
function Ranking({ row }: { row: StanceTargetRow }): JSX.Element | null {
  if (row.ranked.length === 0) return null
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.35 }}>
        Every stance you can wear, by damage taken — raw arithmetic, endurance not included
      </Typography>
      <Stack spacing={0.35}>
        {row.ranked.map((r) => (
          <RankRow key={r.key} r={r} />
        ))}
      </Stack>
    </Box>
  )
}

/**
 * The reservations that stay as prose. Compact — a tinted strip with a colored left edge rather
 * than a full MUI Alert — but never a tooltip and never dismissible: a caveat the user can make
 * go away is a caveat that is gone the second time it matters.
 */
function CaveatBanners({ caveats }: { caveats: readonly StanceCaveat[] }): JSX.Element | null {
  const shown = caveatsAt(caveats, 'banner')
  if (shown.length === 0) return null
  return (
    <Stack spacing={0.4}>
      {shown.map((c) => (
        <CaveatBanner key={c.kind} c={c} />
      ))}
    </Stack>
  )
}

function CaveatBanner({ c }: { c: StanceCaveat }): JSX.Element {
  const tone = c.tone === 'info' ? INFO_COLOR : SURVIVE_COLOR
  const Icon = c.tone === 'info' ? InfoOutlinedIcon : WarningAmberIcon
  return (
    <Stack
      direction="row"
      spacing={0.75}
      sx={{ px: 1, py: 0.5, borderRadius: 1, borderLeft: `3px solid ${tone}`, bgcolor: alpha(tone, 0.07) }}
      data-testid={`stance-caveat-${c.kind}`}
    >
      <Icon sx={{ fontSize: 14, color: tone, mt: '2px', flexShrink: 0 }} />
      <Typography variant="caption" color="text.secondary">
        {c.text}
      </Typography>
    </Stack>
  )
}

/** The quiet reservations: two or three words, the whole sentence on hover. */
function CaveatChips({ caveats }: { caveats: readonly StanceCaveat[] }): JSX.Element | null {
  const chips = caveatsAt(caveats, 'chip')
  if (chips.length === 0) return null
  return (
    <>
      {chips.map((c) => (
        <Tooltip key={c.kind} title={c.text}>
          <Chip
            size="small"
            variant="outlined"
            color="warning"
            label={c.short}
            sx={{ height: 18, fontSize: 10 }}
            data-testid={`stance-caveat-${c.kind}`}
          />
        </Tooltip>
      ))}
    </>
  )
}

/** The un-mitigation, said once per card in one line, above the numbers it produced. */
function CorrectionLine({ row }: { row: StanceTargetRow }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
      <Typography variant="caption" color="text.secondary">
        {row.usedSamples > 0
          ? `Corrected for the ${String(row.usedSamples)} stance${row.usedSamples === 1 ? '' : 's'} you were ` +
            'wearing when it landed, so this split is what the mob swings for.'
          : 'Nothing here has been corrected — no usable sample reached the pool.'}
      </Typography>
      <CaveatChips caveats={row.caveats} />
    </Stack>
  )
}

/** "You are in the wrong stance", the one urgent thing a card can say. */
function MismatchCallout({ row }: { row: StanceTargetRow }): JSX.Element | null {
  if (!row.mismatch) return null
  return (
    <Stack
      direction="row"
      spacing={0.75}
      alignItems="center"
      data-testid="stance-mismatch"
      sx={{ px: 1.25, py: 0.6, borderRadius: 1.5, bgcolor: alpha(SURVIVE_COLOR, 0.22), border: `1px solid ${SURVIVE_COLOR}` }}
    >
      <WarningAmberIcon sx={{ fontSize: 17, color: SURVIVE_COLOR, flexShrink: 0 }} />
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {mismatchLine(row.mismatch)}
      </Typography>
    </Stack>
  )
}

export default function StanceTargetCard({ row }: { row: StanceTargetRow }): JSX.Element {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        borderColor: row.mismatch ? alpha(SURVIVE_COLOR, 0.5) : 'divider',
        transition: 'border-color 120ms'
      }}
      data-testid="stance-target-card"
    >
      <Stack spacing={0.85}>
        <CardHeader row={row} />
        <MismatchCallout row={row} />
        <CaveatBanners caveats={row.caveats} />
        <Recommendation row={row} />
        <SurviveMode row={row} />
        <Divider flexItem sx={{ opacity: 0.5 }} />
        <DamageBreakdown row={row} />
        <CorrectionLine row={row} />
        <Ranking row={row} />
        <Observations row={row} />
      </Stack>
    </Paper>
  )
}
