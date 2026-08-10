// WHY THE RULE OF THUMB IS TRUE — "duplicates for gear, motes for spells", in numbers.
//
// The guide's sentence sits at the top of the spend panel and reads like taste. It is arithmetic,
// and `shared/moteUpgrades.ts` carries both halves of it:
//
//   * a DUPLICATE ITEM merged in is worth `gearMergeXp(tier)` = 2^tier, which is exactly the cost
//     of the step out of that tier — one duplicate is always one whole tier, at every tier;
//   * a mote is worth AT MOST 10, ever. The ladder stops at Infinite and there is nothing above it.
//     And because a mote's tier limit is a CEILING and not a bracket (an Infinite mote is legal on
//     a +4 item), the best mote available for ANY item is always that same 10.
//
// So from +4 up, one duplicate beats any single mote that will ever exist — 16 against 10 at +4,
// 512 against 10 at +9 — and it runs away from there. Below +4 the mote is the better single
// merge, which is why this is a rule of thumb about GOOD gear rather than a law about all of it.
// The crossover row is computed from the two imported numbers, not asserted.
//
// A spell has no duplicate to merge and accepts every rung at any tier
// (`MOTES_HAVE_NO_SPELL_TIER_LIMIT`), so motes are the only currency it takes and the low rungs
// nobody's gear wants are worth full price to it.
//
// ── THE SPELL TABLE IS THE WIKI'S CLAIM, AND IT SAYS SO OF ITSELF ───────────────────────────
//
// "Spell Upgrade System" warns that the system is "still being tested" and that details "may not
// be entirely accurate and prone to change". Nothing in an EverQuest log states a spell's tier or
// its effect, so this app cannot check one word of it — there is no observed column to put beside
// this table and there never will be. It is therefore chipped in the same vocabulary the
// player-level claim on this page already uses ("eqlwiki … — not this app's finding") and parked
// behind an expander: it is a lookup table for a mechanic you cannot verify, not advice.

import { type JSX, useState } from 'react'
import {
  Box,
  Button,
  Chip,
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
import { MOTE_LADDER } from '@shared/motes'
import {
  SPELL_REAGENT_SAVE_PER_TIER_PCT,
  SPELL_TIER_EFFECTS,
  UPGRADE_TIERS,
  gearMergeXp
} from '@shared/moteUpgrades'

const CELL_SX = { py: 0.35, fontSize: 12 } as const
const HEAD_SX = { ...CELL_SX, fontWeight: 700, whiteSpace: 'nowrap' } as const

/** The wiki hue this page already uses for "stated elsewhere, and not checkable here". */
const WIKI_COLOR = '#8891a0'
/** The two verdict hues the condensing table beside this one already argues in. */
const DUPE_COLOR = '#7fbf8f'
const MOTE_COLOR = '#e0894f'

/** `+4`, the way the log, the planner and the item window all write an item's tier. */
function plus(tier: number): string {
  return `+${String(tier)}`
}

/**
 * The best a mote can EVER be: the top of the ladder, because the limit is a ceiling.
 *
 * Read off `MOTE_LADDER` rather than typed, and deliberately not filtered by tier — an Infinite
 * mote is legal on a +4 item, so "the best mote for this item" is the same 10 at every tier.
 */
const BEST_MOTE = MOTE_LADDER.reduce((b, m) => (m.exp > b.exp ? m : b), MOTE_LADDER[0])

/** Every tier that has a step out of it — the cap has no merge to compare. */
const MERGE_TIERS = UPGRADE_TIERS.filter((t) => t.toNextXp !== null)

/** The lowest tier at which one duplicate out-values the best mote there will ever be. */
const CROSSOVER = MERGE_TIERS.find((t) => gearMergeXp(t.tier) > BEST_MOTE.exp)

/** One tier: what a duplicate hands over, what the best mote hands over, and which wins. */
function CompareRow({ tier }: { tier: number }): JSX.Element {
  const dupe = gearMergeXp(tier)
  const dupeWins = dupe > BEST_MOTE.exp
  return (
    <TableRow hover data-testid="mote-vs-dupe-row" data-tier={tier} data-winner={dupeWins ? 'duplicate' : 'mote'}>
      <TableCell sx={CELL_SX}>{plus(tier)}</TableCell>
      <TableCell align="right" sx={{ ...CELL_SX, fontWeight: dupeWins ? 700 : 400 }}>
        {dupe.toLocaleString()} exp
      </TableCell>
      <TableCell align="right" sx={{ ...CELL_SX, fontWeight: dupeWins ? 400 : 700 }}>
        {BEST_MOTE.exp} exp
      </TableCell>
      <TableCell align="right" sx={{ ...CELL_SX, color: dupeWins ? DUPE_COLOR : MOTE_COLOR, fontWeight: 700 }}>
        {dupeWins ? 'duplicate' : 'mote'}
      </TableCell>
    </TableRow>
  )
}

/** The comparison table: one merge of each kind, at every tier that has a next step. */
function CompareTable(): JSX.Element {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell sx={HEAD_SX}>Item at</TableCell>
          <TableCell align="right" sx={HEAD_SX}>
            One duplicate gives
          </TableCell>
          <TableCell align="right" sx={HEAD_SX}>
            Best mote gives
          </TableCell>
          <TableCell align="right" sx={HEAD_SX}>
            Better merge
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {MERGE_TIERS.map((t) => (
          <CompareRow key={t.tier} tier={t.tier} />
        ))}
      </TableBody>
    </Table>
  )
}

/** The sentence the table proves, with both crossover numbers read out of the table itself. */
function CrossoverLine(): JSX.Element {
  const top = MERGE_TIERS[MERGE_TIERS.length - 1]
  if (!CROSSOVER) {
    return (
      <Typography variant="body2" data-testid="mote-vs-dupe-verdict">
        A duplicate never out-values the best mote, at any tier on the curve.
      </Typography>
    )
  }
  return (
    <Typography variant="body2" data-testid="mote-vs-dupe-verdict">
      A <strong>duplicate</strong> — a second copy of the same item, merged into the one you are
      wearing — is worth a whole tier step, every time. So from{' '}
      <strong>{plus(CROSSOVER.tier)}</strong> upward one duplicate beats any single mote that will
      ever exist ({gearMergeXp(CROSSOVER.tier)} against {BEST_MOTE.exp}), and it runs away fast:{' '}
      {gearMergeXp(top.tier).toLocaleString()} against {BEST_MOTE.exp} at {plus(top.tier)}, about{' '}
      {Math.ceil(gearMergeXp(top.tier) / BEST_MOTE.exp)} motes to one duplicate. Below{' '}
      {plus(CROSSOVER.tier)} the mote is the better single merge, which is why this is a rule of
      thumb about good gear rather than a law about all of it.
    </Typography>
  )
}

/** What a spell tier gives, per spell kind — the wiki's words and the wiki's uncertainty. */
function SpellEffects(): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Box>
      <Button
        size="small"
        onClick={() => setOpen((v) => !v)}
        startIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        sx={{ textTransform: 'none' }}
        data-testid="mote-spell-effects-toggle"
      >
        What one spell tier gives, for each of the {SPELL_TIER_EFFECTS.length} kinds of spell
      </Button>
      <Collapse in={open} unmountOnExit>
        <Paper variant="outlined" sx={{ mt: 0.5, p: 1 }} data-testid="mote-spell-effects">
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              Per tier, by spell kind
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              label="eqlwiki Spell Upgrade System — the wiki's claim, not this app's finding"
              sx={{ height: 18, fontSize: 10, borderColor: WIKI_COLOR, color: WIKI_COLOR }}
            />
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={HEAD_SX}>Spell</TableCell>
                <TableCell sx={HEAD_SX}>Each tier gives</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {SPELL_TIER_EFFECTS.map((e) => (
                <TableRow key={e.kind} hover data-testid="mote-spell-effect-row">
                  <TableCell sx={{ ...CELL_SX, whiteSpace: 'nowrap' }}>{e.kind}</TableCell>
                  <TableCell sx={CELL_SX}>{e.effect}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Every spell that uses a reagent also saves {SPELL_REAGENT_SAVE_PER_TIER_PCT}% of them per
            tier. That page says of itself that the system is still being tested and may not be
            entirely accurate — and nothing an EverQuest log prints states a spell&apos;s tier or its
            effect, so this app has no way to check a word of it.
          </Typography>
        </Paper>
      </Collapse>
    </Box>
  )
}

/**
 * Items or spells: the rule of thumb turned into two numbers a player can check.
 *
 * The ACTIONABLE half (the comparison and the crossover sentence) is always on screen; the
 * unverifiable reference half (the per-kind spell effects) is one click away. See the header.
 */
export function MoteItemsVsSpells(): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="mote-items-vs-spells">
      <Typography variant="subtitle2" gutterBottom>
        Items or spells — why duplicates win on gear
      </Typography>
      <Stack spacing={1}>
        <CrossoverLine />
        <CompareTable />
        <Typography variant="caption" color="text.secondary" display="block">
          The mote column is <strong>{BEST_MOTE.name}</strong>, {BEST_MOTE.exp} exp — the best there
          is, and legal on an item of any tier below its own limit, so no better mote exists for any
          row here. A spell has no duplicate to merge and takes every rung at any tier, which is
          where the rungs your gear refuses should go.
        </Typography>
        <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 0.5 }}>
          <SpellEffects />
        </Box>
      </Stack>
    </Paper>
  )
}
