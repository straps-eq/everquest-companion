// WHICH MOTE UPGRADES WHAT — the owner's second question, answered as a table.
//
// One row per rung of `MOTE_LADDER`, joined to `moteUpgrades.ts moteTierRule()`, and the rungs
// this character has actually looted are highlighted so the table also answers "what can I do with
// what is in my bags".
//
// ── WHY THERE ARE TWO TIER COLUMNS AND NOT ONE ──────────────────────────────────────────────
//
// The two wiki pages state a mote's limit two different ways, one apart. "Mote Guide" says a Mote
// of Major Potential works on "a tier 4 item, or lower"; "Item Upgrade System" tabulates the same
// mote as "Mote Maximum Tier: 5". `moteUpgrades.ts` reconciles them — they answer different
// questions, the highest item you may APPLY it to and the highest tier it can therefore help one
// REACH — and deliberately exposes BOTH under two names rather than picking. So this table prints
// both, labelled, and never silently prefers one (world-model law 1: a reading is labelled, never
// promoted to a fact).
//
// ── THE HIGHLIGHT IS "LOOTED", NOT "HELD" ───────────────────────────────────────────────────
//
// The counts come straight from `moteFarming.ladder`, the page's own loot-derived rows — nothing
// is re-derived here. EverQuest never prints a mote being SPENT, so those counts are what dropped
// for you, not what is in your bags, and the wording says "looted" for exactly that reason (the
// ladder chart above carries the same caveat).

import type { JSX } from 'react'
import {
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import type { MoteLadderRow } from '@shared/moteFarming'
import { MOTE_LADDER, type Mote } from '@shared/motes'
import { moteTierRule } from '@shared/moteUpgrades'
import { EXP_COLOR } from './MoteCharts'

const CELL_SX = { py: 0.35, fontSize: 12 } as const
const HEAD_SX = { ...CELL_SX, fontWeight: 700, whiteSpace: 'nowrap' } as const

/** What the BOTTOM rung may be used on — read out of the rule table, never typed as a literal. */
const WEAKEST_ITEM_TIER = moteTierRule(MOTE_LADDER[0].ladder)?.appliesUpToTier ?? 0

/** `+4`, the way the log, the planner and the item window all write an item's tier. */
function plus(tier: number): string {
  return `+${String(tier)}`
}

/** One rung: what it is worth, what it may touch, how far it can carry, and whether you have any. */
function RuleRow({ mote, count }: { mote: Mote; count: number }): JSX.Element {
  const rule = moteTierRule(mote.ladder)
  const have = count > 0
  return (
    <TableRow
      hover
      data-testid="mote-tier-rule-row"
      data-rung={mote.ladder}
      data-have={have}
      sx={{ bgcolor: have ? 'rgba(255,255,255,0.045)' : undefined, opacity: have ? 1 : 0.55 }}
    >
      <TableCell sx={CELL_SX}>
        <Typography variant="caption" noWrap title={mote.name} sx={{ fontWeight: have ? 700 : 400 }}>
          {mote.ladder}. {mote.short}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ ...CELL_SX, color: EXP_COLOR, fontWeight: 700 }}>
        {mote.exp} exp
      </TableCell>
      {/* The Mote Guide's answer: the highest item tier the mote may be MERGED INTO at all. */}
      <TableCell align="right" sx={{ ...CELL_SX, whiteSpace: 'nowrap' }}>
        {rule ? plus(rule.appliesUpToTier) : '—'}
      </TableCell>
      {/* The Item Upgrade System's answer: the highest tier it can therefore help one REACH. */}
      <TableCell align="right" sx={{ ...CELL_SX, whiteSpace: 'nowrap' }}>
        {rule ? plus(rule.canReachTier) : '—'}
      </TableCell>
      <TableCell align="right" sx={CELL_SX}>
        {have ? (
          <Chip size="small" label={count.toLocaleString()} sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
        ) : (
          <Typography variant="caption" color="text.disabled">
            —
          </Typography>
        )}
      </TableCell>
    </TableRow>
  )
}

/**
 * The mote → tier map, with the rungs you have looted picked out.
 *
 * ORDER IS THE LADDER'S, like every other mote table on this page: a player looking up "what can I
 * do with a Major" finds the Major row where the ladder puts it, and both tier columns climbing
 * monotonically down the page IS the mapping.
 */
export function MoteTierRules({ ladder }: { ladder: readonly MoteLadderRow[] }): JSX.Element {
  const counts = new Map(ladder.map((r) => [r.mote.key, r.count]))
  const held = MOTE_LADDER.filter((m) => (counts.get(m.key) ?? 0) > 0)
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.25 }}>
        Which mote upgrades what
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
        A mote&apos;s limit is a ceiling, not a bracket — any mote is legal on an item below its
        limit too. So the middle column is the highest item it may be merged into at all, and the
        right one is the highest tier it can therefore carry that item to. (The two wiki pages state
        the same rule those two ways, one tier apart.)
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={HEAD_SX}>Mote</TableCell>
            <TableCell align="right" sx={HEAD_SX}>
              Gives
            </TableCell>
            <TableCell align="right" sx={HEAD_SX}>
              Use on items up to
            </TableCell>
            <TableCell align="right" sx={HEAD_SX}>
              Can take one to
            </TableCell>
            <TableCell align="right" sx={HEAD_SX}>
              You&apos;ve looted
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {MOTE_LADDER.map((m) => (
            <RuleRow key={m.key} mote={m} count={counts.get(m.key) ?? 0} />
          ))}
        </TableBody>
      </Table>
      <HeldSummary held={held} />
    </Box>
  )
}

/** What the highlighted rows add up to, in one sentence — and the spell escape hatch beside it. */
function HeldSummary({ held }: { held: readonly Mote[] }): JSX.Element {
  const best = held[held.length - 1]
  const bestRule = best ? moteTierRule(best.ladder) : null
  return (
    <Stack spacing={0.25} sx={{ mt: 0.5 }}>
      <Typography variant="caption" color="text.secondary" display="block" data-testid="mote-tier-rules-held">
        {best && bestRule
          ? `Highlighted rows are rungs this log has seen drop for you. The best of them is ${best.name}: it can be merged into any item up to ${plus(bestRule.appliesUpToTier)}, taking it as far as ${plus(bestRule.canReachTier)}.`
          : 'No mote has dropped for you yet, so no row is highlighted — the mapping is the same either way.'}{' '}
        These are drops, not a bag count: nothing in EverQuest prints a mote being spent.
      </Typography>
      {/* `MOTES_HAVE_NO_SPELL_TIER_LIMIT` is the fact behind this line and the reason the two
          columns above need the qualifier at all. It is a constant `true`, so it is cited rather
          than tested — a gate on it would be a condition that can never fail. */}
      <Typography variant="caption" color="text.secondary" display="block">
        <strong>Both tier columns are about items only.</strong> A spell accepts every rung at any
        tier, so even a {MOTE_LADDER[0].short} — refused by any item above{' '}
        {plus(WEAKEST_ITEM_TIER)} — can go into your best spell. That is the whole reason the low
        rungs are worth keeping.
      </Typography>
    </Stack>
  )
}
