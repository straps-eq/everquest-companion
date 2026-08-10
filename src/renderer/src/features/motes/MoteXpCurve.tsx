// WHAT "EXP" BUYS — the answer to the one word the owner tripped over on this page.
//
// Everything else on the Motes tab is priced in experience ("Mote of Major Potential — 5 exp",
// "412 exp looted", "this trade destroys 6 exp") and until now nothing said what a point of
// experience is FOR. It is the cost side of the upgrade ladder, and `shared/moteUpgrades.ts` is
// where it lives; this panel is that table made concrete.
//
// ── THE SHAPE IS THE ADVICE, SO IT IS DRAWN AND NOT JUST TABULATED ──────────────────────────
//
// The curve doubles: each step out of a tier costs twice the last, so the first tiers are nearly
// free and the single step from +9 to +10 costs more than every step before it put together. As
// eleven numbers in a column that is a fact you have to do arithmetic on; as eleven bars on one
// linear scale you cannot miss it. Both readings are on the same row — the bar is the STEP, the
// text inside the plot is the RUNNING TOTAL and the stat bonus, so nothing is only in the picture.
//
// ── EVERY NUMBER IS IMPORTED ────────────────────────────────────────────────────────────────
//
// Not one figure in the prose is typed out: 1, 15, 512, 1,023 and +10% are all read out of
// `UPGRADE_TIERS` / `MAX_TIER_XP` at render. The curve is the wiki's and has exactly one home in
// this repo (pinned rung-by-rung in tests/moteUpgrades.test.mts). A sentence that hardcoded "1,023"
// would be a second opinion the day the game changes it.
//
// ── TIER VOCABULARY ─────────────────────────────────────────────────────────────────────────
//
// An item's tier is written `+N` here, because that is what the GAME writes: the log prints
// `Ghoulbane +4` and `itemStats.itemTierFromName` reads that suffix, the planner says "needs +4",
// the item window says "Tier 4 / 10". So the word "tier" introduces the idea once and every
// number after it is a `+N`.

import type { JSX } from 'react'
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { MAX_TIER_XP, UPGRADE_TIERS } from '@shared/moteUpgrades'
import { ChartFrame, OverlayRow } from './moteChartFrame'
import { EXP_COLOR } from './MoteCharts'
import {
  LABEL_PCT,
  PLOT_W,
  VALUE_PCT,
  tierCostBars,
  type TierCostBar
} from './moteChartGeometry'

/** The wiki hue this page already uses for "stated elsewhere, not measured here". */
const WIKI_COLOR = '#8891a0'

/** The three rows the prose points at, read out of the table rather than typed into a sentence. */
const CAP = UPGRADE_TIERS[UPGRADE_TIERS.length - 1]
const LAST_STEP = UPGRADE_TIERS[UPGRADE_TIERS.length - 2]
const FIRST_STEP = UPGRADE_TIERS[0]
/** +10% a tier — the second row's cumulative bonus IS the per-tier one. */
const BONUS_PER_TIER_PCT = UPGRADE_TIERS[1].itemBonusPct
/** The two step costs the paragraph names. Null only at the cap, which neither of these is. */
const FIRST_STEP_XP = FIRST_STEP.toNextXp ?? 0
const LAST_STEP_XP = LAST_STEP.toNextXp ?? 0

/** `+4`, the way the log, the planner and the item window all write an item's tier. */
function plus(tier: number): string {
  return `+${String(tier)}`
}

function TierCostShape({ b }: { b: TierCostBar }): JSX.Element {
  return (
    <g data-testid="mote-curve-bar" data-tier={b.tier} data-advances={b.advances}>
      <rect x={b.x} y={b.y} width={PLOT_W} height={b.h} fill="rgba(255,255,255,0.04)" rx={1} />
      {/* The body is a wash so the running total can be read on top of it, with a solid leading
          edge — the same two-part bar the zone chart draws, for the same reason. */}
      {b.advances && <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={EXP_COLOR} opacity={0.45} />}
      {b.advances && <rect x={b.x} y={b.y} width={2.5} height={b.h} fill={EXP_COLOR} />}
    </g>
  )
}

/** One tier's three readings: which step it is, what standing there has cost, what the step costs. */
function TierCostLabels({ b }: { b: TierCostBar }): JSX.Element {
  return (
    <OverlayRow
      labelPct={LABEL_PCT}
      valuePct={VALUE_PCT}
      top={b.y}
      height={b.h}
      label={
        <Typography variant="caption" noWrap sx={{ fontWeight: 600, fontSize: 11 }}>
          {b.advances ? `${plus(b.tier)} → ${plus(b.tier + 1)}` : `${plus(b.tier)} — the cap`}
        </Typography>
      }
      mid={
        <Typography
          variant="caption"
          sx={{
            position: 'absolute',
            top: '50%',
            left: 6,
            transform: 'translateY(-50%)',
            fontSize: 10,
            whiteSpace: 'nowrap',
            color: 'text.secondary'
          }}
        >
          {/* Tier 0 has absorbed nothing by definition — "0 exp to stand at +0" is arithmetic
              talking to itself, so that one row says what a +0 actually is. */}
          {b.totalXp === 0
            ? 'a fresh drop, nothing merged in'
            : `${b.totalXp.toLocaleString()} exp to stand at ${plus(b.tier)}`}{' '}
          · +{b.itemBonusPct}% stats
        </Typography>
      }
      value={
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, fontSize: 11, color: b.advances ? 'text.primary' : 'text.disabled' }}
          data-testid="mote-curve-step"
        >
          {b.toNextXp === null ? 'nothing above' : `${b.toNextXp.toLocaleString()} exp`}
        </Typography>
      }
    />
  )
}

/**
 * THE CURVE — one bar per tier, the bar being what the step OUT of that tier costs.
 *
 * Linear, deliberately: at 1, 2, 4 and 8 against 512 the bottom rungs are slivers, and that is the
 * honest picture of a doubling curve rather than a defect to fix with a log scale.
 */
export function MoteTierCurveChart(): JSX.Element {
  const chart = tierCostBars(UPGRADE_TIERS)
  return (
    <Box>
      {/* The chart has no column headers — its rows are three readings of one step, and a header
          row over a 14-unit bar would be taller than the thing it labels. One line says it. */}
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.35 }}>
        One row per step. The bar and the figure on the right are what that step costs; the text
        inside the bar is what the item has already absorbed to be standing there, and the stat
        bonus it is getting for it.
      </Typography>
      <ChartFrame
        testid="mote-tier-curve"
        height={chart.height}
        bars={
          <>
            {chart.bars.map((b) => (
              <TierCostShape key={b.tier} b={b} />
            ))}
          </>
        }
        labels={
          <>
            {chart.bars.map((b) => (
              <TierCostLabels key={b.tier} b={b} />
            ))}
          </>
        }
      />
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.35 }}>
        Full width is the {chart.scaleMax.toLocaleString()} exp the last step costs. Every step
        before it — {plus(FIRST_STEP.tier)} all the way to {plus(LAST_STEP.tier - 1)} — adds up to{' '}
        {LAST_STEP.totalXp.toLocaleString()} between them, which is less than that one step.
      </Typography>
    </Box>
  )
}

/**
 * What experience is, in one paragraph, above the curve that proves it.
 *
 * It renders whether or not anything has dropped: a player with no motes yet is exactly the one
 * who needs to know what the currency is before reading a price list in it.
 */
export function MoteXpCurve(): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="mote-xp-curve">
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
        <Typography variant="subtitle2">What experience buys</Typography>
        <Chip
          size="small"
          variant="outlined"
          label="eqlwiki Item and Spell Upgrade System"
          sx={{ height: 18, fontSize: 10, borderColor: WIKI_COLOR, color: WIKI_COLOR }}
        />
      </Stack>
      <Typography variant="body2" sx={{ mb: 0.75 }}>
        Motes are priced in <strong>experience</strong> — the &ldquo;exp&rdquo; beside every mote on
        this page. Experience is what an item or a spell has to swallow to climb a{' '}
        <strong>tier</strong>, which is the +N the game writes on the end of an item&apos;s name.
        The first step costs {FIRST_STEP_XP.toLocaleString()}, and every step after it costs double:
        a maxed {plus(CAP.tier)} has absorbed {MAX_TIER_XP.toLocaleString()} exp in total, and{' '}
        {LAST_STEP_XP.toLocaleString()} of that — half of everything — goes into the last step
        alone. Each tier is +{BONUS_PER_TIER_PCT}% to the item&apos;s stats, and the bonus tracks
        the experience rather than the tier, so a part-finished tier is already paying you.
      </Typography>
      <MoteTierCurveChart />
    </Paper>
  )
}
