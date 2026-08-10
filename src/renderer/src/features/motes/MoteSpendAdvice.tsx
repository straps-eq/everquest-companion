// SPEND ADVICE — the guide's rule of thumb, and the condensing arithmetic that contradicts the
// obvious assumption. The most actionable thing on the Motes tab, and the part a player who has
// not read the eqlwiki guide will otherwise get wrong.
//
// EVERY NUMBER HERE IS `shared/motes.ts`'s, not this file's. `condenseTable()` returns nine rungs
// with the exp each trade destroys already computed (`CONDENSE_RATIO * from.exp - to.exp`), pinned
// rung-by-rung in tests/motes.test.mts. Re-deriving a loss here — even "just" the percentage —
// would be a second opinion about a mechanic, so the percentage is a ratio of two numbers that
// table already returned and nothing else.
//
// ── WHY THIS PANEL SHOUTS ───────────────────────────────────────────────────────────────────
//
// "Two of a mote make one of the next" reads like a free upgrade and is usually a tax. Only two
// rungs break even (minor→lesser and lesser→potential, 1+1⇒2 and 2+2⇒4); every rung above burns
// between three and eight exp per trade — the guide's own example is two Superior (7 each) for one
// Grand (8). And the WORST trade proportionally is the one the guide never mentions and the one a
// player drowning in Infinitesimals is most tempted to make: two Infinitesimals (1 exp each) buy
// one Minor (1 exp). Half the exp, gone. It falls straight out of the wiki's own numbers; nobody
// had multiplied them out.
//
// So the only reason to condense above lesser is to clear an ITEM TIER LIMIT — a pile of Majors
// cannot touch a tier-5 item at any quantity, and one Greater can. For SPELLS, which accept any
// tier, condensing is pure loss.
//
// ── AND THE LIMIT IS NOW STATED BEFORE IT IS USED ───────────────────────────────────────────
//
// "Clear an item tier limit" is the condensing table's whole justification and the page never said
// what those limits WERE. `MoteTierRules` (./MoteTierRules.tsx) is that mapping — one row per rung,
// what it may be used on, how far it can carry an item, and whether you have any — and it sits
// ABOVE the condensing table here rather than in its own panel because the two are one argument
// read top to bottom: here is what each mote can touch, and here is what it costs to trade up when
// it cannot touch the thing you want to upgrade.

import type { JSX } from 'react'
import {
  Alert,
  Box,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { CONDENSE_RATIO, MOTE_RULE_OF_THUMB, condenseTable, type CondenseOutcome } from '@shared/motes'
import type { MoteLadderRow } from '@shared/moteFarming'
import { MoteTierRules } from './MoteTierRules'

const CELL_SX = { py: 0.4, fontSize: 12 } as const
const HEAD_SX = { ...CELL_SX, fontWeight: 700, whiteSpace: 'nowrap' } as const

/** The two hues this panel argues in: a trade that keeps every point, and one that burns them. */
const EVEN_COLOR = '#7fbf8f'
const LOSS_COLOR = '#e0894f'
/** Past this share of the input destroyed, the row is the page's headline warning rather than one
 *  of nine table rows. Half is not a threshold anyone picked — it is where Infinitesimal→Minor
 *  lands, and it is the only rung that reaches it. */
const HALF = 0.5

/** What share of the exp you put in this trade destroys. Both numbers come out of `motes.ts`. */
function lossFraction(o: CondenseOutcome): number {
  const spent = CONDENSE_RATIO * o.from.exp
  return spent > 0 ? o.expLost / spent : 0
}

function CondenseRow({ o }: { o: CondenseOutcome }): JSX.Element {
  const spent = CONDENSE_RATIO * o.from.exp
  const frac = lossFraction(o)
  const worst = frac >= HALF
  return (
    <TableRow hover data-testid="mote-condense-row" data-lossless={o.lossless}>
      <TableCell sx={CELL_SX}>
        <Typography variant="caption" noWrap>
          {CONDENSE_RATIO} × {o.from.short} → {o.to.short}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={CELL_SX}>
        {spent}
      </TableCell>
      <TableCell align="right" sx={CELL_SX}>
        {o.to.exp}
      </TableCell>
      <TableCell
        align="right"
        sx={{
          ...CELL_SX,
          fontWeight: 700,
          color: o.lossless ? EVEN_COLOR : LOSS_COLOR
        }}
        data-testid="mote-condense-loss"
      >
        {o.lossless ? 'break even' : `−${o.expLost} exp`}
      </TableCell>
      <TableCell align="right" sx={{ ...CELL_SX, color: o.lossless ? EVEN_COLOR : LOSS_COLOR }}>
        {o.lossless ? '—' : `${Math.round(frac * 100)}%${worst ? ' — half of it' : ''}`}
      </TableCell>
      {/* The one legitimate reason to make a losing trade, per row: what the OUTPUT can touch that
          the input cannot. A Major cannot be used on a tier-5 item at any quantity; a Greater can. */}
      <TableCell align="right" sx={{ ...CELL_SX, opacity: 0.6, whiteSpace: 'nowrap' }}>
        item tier {o.from.itemTierLimit} → {o.to.itemTierLimit}
      </TableCell>
    </TableRow>
  )
}

/** The guide's rule of thumb, verbatim from `MOTE_RULE_OF_THUMB` — carried as text in motes.ts
 *  precisely so it is quoted rather than paraphrased. */
function RuleOfThumb(): JSX.Element {
  return (
    <Alert severity="success" icon={<AutoAwesomeIcon fontSize="small" />} data-testid="mote-rule-of-thumb">
      <Stack spacing={0.25}>
        {MOTE_RULE_OF_THUMB.map((line) => (
          <Typography key={line} variant="body2">
            {line}
          </Typography>
        ))}
      </Stack>
    </Alert>
  )
}

/** The single loudest fact on the tab, lifted out of the table it also appears in. */
function WorstTradeWarning({ worst }: { worst: CondenseOutcome | undefined }): JSX.Element | null {
  if (!worst) return null
  return (
    <Alert severity="warning" data-testid="mote-worst-trade">
      <Typography variant="body2">
        <strong>
          {CONDENSE_RATIO} × {worst.from.name} ({CONDENSE_RATIO * worst.from.exp} exp) buys one{' '}
          {worst.to.name} ({worst.to.exp} exp).
        </strong>{' '}
        That is {Math.round(lossFraction(worst) * 100)}% of the experience destroyed —
        proportionally the worst trade on the whole ladder, and the one you are most tempted to
        make because ordinary mobs drop nothing else. The wiki&apos;s guide does not mention this
        rung; the number falls out of its own table.
      </Typography>
    </Alert>
  )
}

/**
 * How to spend them: the rule of thumb, then every condensing trade with what it costs.
 *
 * ORDER IS THE LADDER'S. The table is not sorted by loss — a player looking up "what do my Majors
 * turn into" needs to find the Major row where the ladder puts it, and the loss column climbing
 * monotonically down the page IS the shape of the advice.
 */
export function MoteSpendAdvice({ ladder }: { ladder: readonly MoteLadderRow[] }): JSX.Element {
  const table = condenseTable()
  const worst = table.reduce<CondenseOutcome | undefined>(
    (w, o) => (!w || lossFraction(o) > lossFraction(w) ? o : w),
    undefined
  )
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="mote-spend-advice">
      <Typography variant="subtitle2" gutterBottom>
        What to spend them on
      </Typography>
      <Stack spacing={1}>
        <RuleOfThumb />
        {/* The mapping FIRST: the condensing table below argues about clearing an item tier limit,
            which is only meaningful once you can see what each rung's limit is. The ladder counts
            are the page's own (`moteFarming.ladder`), passed down rather than re-derived. */}
        <MoteTierRules ladder={ladder} />
        <WorstTradeWarning worst={worst} />
        <Box>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle2">Condensing, and what each trade costs</Typography>
            <Chip
              size="small"
              variant="outlined"
              label="a Constructed Potential NPC, any city"
              sx={{ height: 18, fontSize: 10 }}
            />
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={HEAD_SX}>Trade</TableCell>
                <TableCell align="right" sx={HEAD_SX}>
                  Exp in
                </TableCell>
                <TableCell align="right" sx={HEAD_SX}>
                  Exp out
                </TableCell>
                <TableCell align="right" sx={HEAD_SX}>
                  Destroyed
                </TableCell>
                <TableCell align="right" sx={HEAD_SX}>
                  Share
                </TableCell>
                <TableCell align="right" sx={HEAD_SX}>
                  Unlocks
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {table.map((o) => (
                <CondenseRow key={o.from.key} o={o} />
              ))}
            </TableBody>
          </Table>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Only {table.filter((o) => o.lossless).length} of the {table.length} trades break even
            ({table.filter((o) => o.lossless).map((o) => `${o.from.short}→${o.to.short}`).join(', ')}).
            Above them the ONLY reason to condense is the last column: a mote cannot be used on an
            item above its own tier limit at any quantity, so clearing that limit is worth paying
            exp for. Spells have no such limit, so condensing for a spell is pure loss.
          </Typography>
        </Box>
      </Stack>
    </Paper>
  )
}
