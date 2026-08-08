// WHO DROPS THEM — the mobs that have handed you motes, most exp first, with a raid-target marker.
//
// ── THE TENDENCY IS PRINTED AS A TENDENCY, AND ITS EXCEPTION IS PRINTED BY NAME ─────────────
//
// In the owner's 20-drop log every one of the six mobs that dropped a ladder-3-or-better mote is a
// roster raid target (Master Yael, Cazic-Thule, Fright, Dread, Maestro of Rancor, Innoruuk) and
// five of the six Infinitesimal sources are ordinary mobs. That is a real and useful pattern, and
// it is NOT a rule: `Bazzt Zzzt`, a raid target, dropped an Infinitesimal.
//
// So this panel never says "raid targets drop the good ones". It says how many of YOUR high-rung
// drops came off raid targets, out of how many — the counts come from `moteFarming.tendency`, over
// this character's own log, so the sentence is checkable against the table beneath it — and it
// names every raid target that dropped below the floor. If the counter-example list is empty for a
// given character, the copy still frames the pattern as an observation over a stated sample rather
// than as a mechanic (world-model law 1: an inference is labelled, never promoted).
//
// NO RATE ON A MOB ROW, deliberately. A rate needs a denominator and a mob is not a span of time:
// the log says how long you were in a zone and never how long you spent killing one kind of thing.
// Counts and exp are facts; "motes per hour from Innoruuk" would be a fabrication. See
// `MoteSourceRow.raidTarget`'s doc for the same argument in the model.

import type { JSX } from 'react'
import {
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
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import type { MoteSourceRow, MoteTendency } from '@shared/moteFarming'
import { Tooltip } from '../../lib/Tooltip'
// The app's ONE "open a mob page" payload (JOS-43's contract), so this panel's link is the same
// link the roster cards and the considered strip use — only `mob` is required and the page fetches
// the rest. A bespoke string opener here would be a fifth opinion about what a mob link is.
import type { MobTarget } from '../mobs/mobTarget'
import { EXP_COLOR } from './MoteCharts'

const CELL_SX = { py: 0.35, fontSize: 12 } as const
const HEAD_SX = { ...CELL_SX, fontWeight: 700, whiteSpace: 'nowrap' } as const

/** How many mobs the table lists before the "and N more" line. The full set stays available in
 *  the loot ledger; this panel answers "who is worth killing", which has a top. */
const TOP_N = 12

function SourceRow({
  row,
  onOpenMob
}: {
  row: MoteSourceRow
  onOpenMob?: (t: MobTarget) => void
}): JSX.Element {
  const tiers = row.tiers.map((t) => `${t.count}× ${t.short}`).join(' · ')
  return (
    <TableRow hover data-testid="mote-source-row" data-raid={row.raidTarget !== null}>
      <TableCell sx={CELL_SX}>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
          {row.raidTarget !== null && (
            <Tooltip title={`On the raid-target roster as “${row.raidTarget}”`}>
              <EmojiEventsIcon sx={{ fontSize: 13, color: EXP_COLOR, flexShrink: 0 }} />
            </Tooltip>
          )}
          <Typography
            variant="caption"
            noWrap
            title={row.source}
            onClick={onOpenMob ? () => onOpenMob({ mob: row.source }) : undefined}
            sx={{ cursor: onOpenMob ? 'pointer' : 'default', '&:hover': { textDecoration: onOpenMob ? 'underline' : 'none' } }}
          >
            {row.source}
          </Typography>
        </Stack>
      </TableCell>
      <TableCell sx={{ ...CELL_SX, opacity: 0.7 }}>
        <Typography variant="caption" noWrap title={tiers}>
          {tiers}
          {row.voidTouched > 0 && ` · ${row.voidTouched}× Void-Touched`}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={CELL_SX}>
        {row.motes.toLocaleString()}
      </TableCell>
      <TableCell align="right" sx={{ ...CELL_SX, fontWeight: 700, color: EXP_COLOR }}>
        {row.exp.toLocaleString()}
      </TableCell>
    </TableRow>
  )
}

/**
 * The pattern, stated over this character's own sample, and the drops that argue against it.
 *
 * Every number in the sentence comes out of `moteFarming.tendency`, so a reader can check it
 * against the table below without trusting the prose.
 */
function TendencyNote({ t }: { t: MoteTendency }): JSX.Element {
  if (t.highDrops === 0) {
    return (
      <Typography variant="caption" color="text.secondary" data-testid="mote-tendency">
        Nothing at rung {t.ladderFloor} or above has dropped for you yet, so this log has nothing to
        say about which mobs pay the good tiers.
      </Typography>
    )
  }
  return (
    <Typography variant="caption" color="text.secondary" data-testid="mote-tendency">
      Of your {t.highDrops} drop{t.highDrops === 1 ? '' : 's'} at rung {t.ladderFloor} or above,{' '}
      <strong>{t.highFromRaid}</strong> came off a raid target
      {t.highNonRaidSources.length > 0 && ` (the rest off ${t.highNonRaidSources.join(', ')})`}. That
      is a TENDENCY and not a rule —{' '}
      {t.counterExamples.length > 0 ? (
        <>
          {t.counterExamples.join(', ')} {t.counterExamples.length === 1 ? 'is a raid target and' : 'are raid targets and'}{' '}
          dropped below that rung {t.lowFromRaid} time{t.lowFromRaid === 1 ? '' : 's'} for you.
        </>
      ) : (
        <>
          nothing here says a raid target CANNOT drop a junk mote, and in the log this feature was
          built from one did (Bazzt Zzzt, a raid target, dropped an Infinitesimal).
        </>
      )}
    </Typography>
  )
}

export interface MoteSourcesProps {
  rows: readonly MoteSourceRow[]
  tendency: MoteTendency
  /** The app's Mobs opener (`AppRouting.openMob`), when the host wired one. */
  onOpenMob?: (t: MobTarget) => void
}

/** Who drops them, most exp first. */
export function MoteSources({ rows, tendency, onOpenMob }: MoteSourcesProps): JSX.Element {
  const shown = rows.slice(0, TOP_N)
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="mote-sources">
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
        <Typography variant="subtitle2">Who drops them</Typography>
        <Chip size="small" variant="outlined" label="observed — your log only" sx={{ height: 18, fontSize: 10 }} />
        <Box sx={{ flexGrow: 1 }} />
        <Stack direction="row" spacing={0.4} alignItems="center">
          <EmojiEventsIcon sx={{ fontSize: 13, color: EXP_COLOR }} />
          <Typography variant="caption" color="text.secondary">
            raid target
          </Typography>
        </Stack>
      </Stack>
      {rows.length === 0 ? (
        <Typography variant="caption" color="text.secondary" data-testid="mote-sources-empty">
          No mote drop in your log names the corpse it came off yet.
        </Typography>
      ) : (
        <>
          <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={HEAD_SX}>Mob</TableCell>
                  <TableCell sx={HEAD_SX}>Tiers</TableCell>
                  <TableCell align="right" sx={HEAD_SX}>
                    Motes
                  </TableCell>
                  <TableCell align="right" sx={HEAD_SX}>
                    Exp
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((r) => (
                  <SourceRow key={r.key} row={r} onOpenMob={onOpenMob} />
                ))}
              </TableBody>
            </Table>
          </Box>
          {rows.length > shown.length && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.4 }}>
              …and {rows.length - shown.length} more mobs with fewer motes between them.
            </Typography>
          )}
          <Box sx={{ mt: 0.75 }}>
            <TendencyNote t={tendency} />
          </Box>
        </>
      )}
    </Paper>
  )
}
