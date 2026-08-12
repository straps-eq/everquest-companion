// ONE TARGET, ONE PANEL: what this mob hits you with, and which stance to be in against it.
//
// This is now the DETAIL half of a master/detail page — StanceView.tsx shows exactly one of these
// at a time, for the target the selector has open — where it used to be one of up to twenty cards
// stacked down the page. Nothing about what it says changed; what changed is that it is the only
// thing saying it, which is what buys the room for the charts.
//
// The panel decides nothing — every string, fraction and caveat on it was built by stanceRows.ts
// out of the shared advice layer. What lives here is the ORDER, and the order is an argument:
//
//   1. THE TWO VERDICTS (StanceVerdictBlock.tsx) — sustain and damage, side by side, each naming
//      the stance you are WEARING, the one that would be better, and the difference. This is the
//      whole answer and it is first;
//   2. the BANNER caveats — immediately under the answer they qualify. Too few hits measured, or
//      classes with no wearable stance in them, is a reason to read the verdict differently
//      (AGENTS.md's tooltip diet cuts the other way for exactly this class of statement: it is
//      not source-caveating, it is the finding);
//   3. survive mode — `advice.emergency`, deliberately separate and deliberately quieter;
//   4. the stance comparison chart — the sustain verdict's own picture (StanceCharts.tsx). It kept
//      the `stance-rank-row` testid the DOM bar list it replaced had;
//   5. the damage mix, which is the evidence for 1 and 3, as a donut;
//   6. what landed vs the full hit, which is the evidence for 5 (StanceRecoveryChart.tsx);
//   7. the raw observations, collapsed.
//
// ── WHAT 1 REPLACED, AND WHY ────────────────────────────────────────────────────────────────
//
// It used to open with a mismatch callout (when `detectMismatch` allowed one) followed by a
// `Recommendation` block reading "Wear Defensive — you take 59% of the full hit". The owner's
// report was that this is confusing, and it is: that block names ONE stance and no baseline, so
// the comparison the player actually wants — against what he is wearing right now — existed only
// inside a callout suppressed in four situations, including the commonest of all (being already in
// the right stance, where the card said nothing at all). The verdict block states the comparison
// unconditionally, including every case where the honest answer is that it cannot be made, and it
// states the DAMAGE answer beside it because "which stance for sustain, which for DPS" is one
// question with two halves.
//
// THE OLD TESTIDS ARE GONE, and that is safe rather than sloppy: `stance-recommendation` and
// `stance-mismatch` were asserted by nothing — the e2e suite's only stance selectors are the
// Overview's `stance-slot-N` class chips, and the unit suites test the row builders, not the DOM.
// The new handles are `stance-verdict`, `stance-verdict-sustain`, `stance-verdict-dps` and
// `stance-dps-cost`, plus `data-stance-mismatch` on the card for "is this the wrong stance".
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
import { tierStyle } from '../../lib/tierChip'
import { StanceComparisonChart } from './StanceCharts'
import { RecoverySamplesChart } from './StanceRecoveryChart'
import { DamageBreakdown, Observations } from './StanceEvidence'
import { SURVIVE_COLOR, SurviveMode } from './StanceRecommendation'
import StanceVerdictBlock from './StanceVerdictBlock'
import { caveatsAt, type StanceCaveat, type StanceTargetRow } from './stanceRows'

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

/** The scaling back up, said once per card in one line, above the numbers it produced. */
function CorrectionLine({ row }: { row: StanceTargetRow }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
      <Typography variant="caption" color="text.secondary">
        {row.usedSamples > 0
          ? 'These are full-damage numbers: each hit was scaled back up to undo the stance you had ' +
            'on at the time, so a mob measured in two stances reads the same either way.'
          : 'Nothing has been scaled back up here — no usable hits measured.'}
      </Typography>
      <CaveatChips caveats={row.caveats} />
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
      // The card still ANNOUNCES a measurable wrong stance — the verdict block says it in words and
      // the border says it at a glance — so a selector looking for the old callout still lands on
      // the card that has one.
      data-stance-mismatch={row.mismatch ? 'true' : 'false'}
    >
      <Stack spacing={0.85}>
        <CardHeader row={row} />
        <StanceVerdictBlock row={row} />
        <CaveatBanners caveats={row.caveats} />
        <SurviveMode row={row} />
        <StanceComparisonChart row={row} />
        <Divider flexItem sx={{ opacity: 0.5 }} />
        <DamageBreakdown row={row} />
        <CorrectionLine row={row} />
        <RecoverySamplesChart row={row} />
        <Observations row={row} />
      </Stack>
    </Paper>
  )
}
