// THE OFFER: the banner that says "you already did these" and the confirm behind it.
//
// Split out of PoskyView deliberately rather than to satisfy the line limit. The whole feature is
// self-contained — it derives its own candidates from the dump, owns its own dialog state, and
// writes through the caller's bulk setter — so PoskyView needs to know nothing about it beyond
// where to put it. It renders NOTHING when there is nothing to propose, which is the common case
// for a player whose Sky work this app has watched from the start.

import { type JSX, useMemo, useState } from 'react'
import { Alert, Button } from '@mui/material'
import type { ProgressState } from '@shared/types'
import { getPoskyData } from '../../data'
import { rewardCompletions } from './rewardCompletion'
import RewardCompletionDialog from './RewardCompletionDialog'

const posky = getPoskyData()

export interface RewardCompletionOfferProps {
  /** persisted per-character progress; `inventory` is the dump's counts, keyed by raw name */
  progress: ProgressState | null
  /** quest keys currently VISIBLE — an ignored quest is never proposed */
  visibleKeys: ReadonlySet<string>
  setQuestsComplete: (keys: readonly string[], complete: boolean) => Promise<void>
  onToast: (message: string) => void
}

export default function RewardCompletionOffer({
  progress,
  visibleKeys,
  setQuestsComplete,
  onToast
}: RewardCompletionOfferProps): JSX.Element | null {
  const [open, setOpen] = useState(false)

  /**
   * Quests the dump says are done but the store does not. Read from `progress.inventory` rather
   * than the reconciled counts, and independently of `countSource` — see rewardCompletion.ts:
   * a reward is not an input to any quest (so netting it away would be wrong) and it is invisible
   * to the loot log by construction (it was received before this log existed).
   */
  const candidates = useMemo(() => {
    if (!progress) return []
    return rewardCompletions(posky.quests, progress.inventory ?? {}, progress.completedQuests ?? []).filter((c) =>
      visibleKeys.has(c.key)
    )
  }, [progress, visibleKeys])

  if (candidates.length === 0) return null

  const confirm = async (keys: string[]): Promise<void> => {
    setOpen(false)
    await setQuestsComplete(keys, true)
    onToast(`Marked ${keys.length} quest${keys.length === 1 ? '' : 's'} complete`)
  }

  const n = candidates.length
  return (
    <>
      <Alert
        severity="success"
        variant="outlined"
        data-testid="posky-reward-banner"
        action={
          <Button color="inherit" size="small" onClick={() => setOpen(true)}>
            Review
          </Button>
        }
      >
        You are holding the reward for {n} quest{n === 1 ? '' : 's'} that {n === 1 ? 'is' : 'are'} not marked complete.
      </Alert>
      <RewardCompletionDialog
        open={open}
        candidates={candidates}
        onClose={() => setOpen(false)}
        onConfirm={(keys) => void confirm(keys)}
      />
    </>
  )
}
