// THE HELD-REWARD CONFIRM. Proposes the quests whose reward is in the player's possession and
// lets him strike any of them before anything is written (rewardCompletion.ts for why possession
// is evidence at all).
//
// IT ASKS RATHER THAN ACTS, and that is the design, not timidity. Everything on this list is an
// INFERENCE — a strong one for the 82 NO DROP rewards, a weaker one for the 13 that carry no such
// flag — and law 1 says an inference is labeled and never presented as a message the game sent.
// So the two strengths are separate chips, the weaker ones start UNTICKED, and the count on the
// button is the count of what will actually be written.

import { type JSX, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography
} from '@mui/material'
import { Tooltip } from '../../lib/Tooltip'
import { evidenceTally, type RewardCompletion } from './rewardCompletion'

export interface RewardCompletionDialogProps {
  open: boolean
  candidates: readonly RewardCompletion[]
  onClose: () => void
  onConfirm: (keys: string[]) => void
}

const NO_DROP_HELP =
  'This reward is flagged NO DROP and no Sky reward drops from a mob, so the turn-in is the only way to be holding it.'
const TRADEABLE_HELP =
  'This reward carries no NO DROP flag. It still does not drop from any mob, but another player who did the quest could have handed it to you — so it is likely, not certain.'

export default function RewardCompletionDialog({
  open,
  candidates,
  onClose,
  onConfirm
}: RewardCompletionDialogProps): JSX.Element {
  // Strong evidence is pre-selected; the weaker 13 are opt-IN. Re-seeded whenever the proposal
  // changes (a fresh dump can add rows) so the ticks always describe the list on screen.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  useEffect(() => {
    setPicked(new Set(candidates.filter((c) => c.evidence === 'noDrop').map((c) => c.key)))
  }, [candidates])

  const tally = useMemo(() => evidenceTally(candidates), [candidates])
  const toggle = (key: string): void =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth data-testid="posky-reward-dialog">
      <DialogTitle>Mark quests complete from rewards you hold</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          Your log only knows about turn-ins it watched happen, so Sky Tests you finished before
          this app ran read as undone. These {candidates.length} quests award an item you are
          holding right now.
        </Alert>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {tally.noDrop > 0 && (
            <>
              <strong>{tally.noDrop}</strong> award a <strong>NO DROP</strong> item. No Sky reward
              drops from a mob, so the turn-in is the only way to have one — these are ticked.
            </>
          )}
          {tally.tradeable > 0 && (
            <>
              {' '}
              <strong>{tally.tradeable}</strong> award an item without that flag, which another
              player could have given you — left unticked for you to decide.
            </>
          )}
        </Typography>
        <Stack spacing={0.25}>
          {candidates.map((c) => (
            <Stack
              key={c.key}
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ px: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
            >
              <Checkbox
                size="small"
                checked={picked.has(c.key)}
                onChange={() => toggle(c.key)}
                slotProps={{ input: { 'aria-label': `Mark ${c.name} complete` } }}
              />
              <Chip label={c.className} size="small" color="secondary" variant="outlined" sx={{ minWidth: 92 }} />
              <Typography variant="body2" sx={{ minWidth: 210 }}>
                {c.name}
              </Typography>
              <Typography variant="caption" color="primary.main" sx={{ flexGrow: 1 }}>
                → {c.reward}
              </Typography>
              <Tooltip title={c.evidence === 'noDrop' ? NO_DROP_HELP : TRADEABLE_HELP}>
                <Chip
                  size="small"
                  variant="outlined"
                  color={c.evidence === 'noDrop' ? 'success' : 'warning'}
                  label={c.evidence === 'noDrop' ? 'NO DROP' : 'tradeable'}
                />
              </Tooltip>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setPicked(new Set(candidates.map((c) => c.key)))}>Select all</Button>
        <Button onClick={() => setPicked(new Set())}>Select none</Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={picked.size === 0}
          onClick={() => onConfirm([...picked])}
          data-testid="posky-reward-confirm"
        >
          Mark {picked.size} complete
        </Button>
      </DialogActions>
    </Dialog>
  )
}
