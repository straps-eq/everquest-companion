// COMPLETION FROM THE REWARD IN YOUR BANK.
//
// The Sky tab knows a quest is done in exactly two ways: it watched the turn-in happen (a live
// `turnIn` event, or one found in the initial log scan), or the user ticked the checkbox. Neither
// can help a player who did thirty Tests before this app ever ran — the log does not reach back
// past its own first line, and a wiped/relaunched character's log reaches back even less. That
// player's evidence is sitting in his bank: he is WEARING the reward.
//
// ── WHY HOLDING THE REWARD IS EVIDENCE AND NOT A GUESS ─────────────────────────────────────
//
// Measured over the committed scrape (all 95 quests, 2026-08-07):
//   * every quest names a reward, and all 95 rewards resolve in the committed items DB;
//   * ZERO of the 95 have a `dropsfrom` list — no Sky reward is obtainable as a mob drop;
//   * 82 of 95 are flagged NO DROP in their own stat block.
//
// So for the 82: the item does not drop, and it cannot be traded to you. The only door it comes
// through is the quest turn-in, which makes possession PROOF rather than correlation. The other
// 13 carry no NO DROP flag, so a player could in principle have been handed one by someone who
// did the quest; they are reported as separate, weaker evidence and never silently merged with
// the 82 (law 1 — anything inferred is labeled, and two different strengths of evidence are two
// different claims).
//
// WHAT THIS MODULE DOES NOT DO: write anything. It returns candidates; the caller shows them and
// the user confirms. Completion then lands through the SAME `setQuestComplete` path the checkbox
// uses, so there is no second source of truth for "done" and no new persistence — and because
// manual completion deliberately never celebrates, confirming seventy of them cannot fire
// seventy toasts.

import type { PoskyQuest } from '@shared/types'
import { itemCountKey } from '../../lib/itemName'
import { questKey } from './keys'

/** How strongly holding this reward implies the turn-in happened. */
export type RewardEvidence =
  /** the reward is NO DROP and does not drop from any mob — the quest is the only source */
  | 'noDrop'
  /** no NO DROP flag: it still does not drop, but another player could have handed it over */
  | 'tradeable'

export interface RewardCompletion {
  key: string
  className: string
  name: string
  reward: string
  evidence: RewardEvidence
}

/**
 * Fold raw dump counts onto the COUNTING key (law 2). `progress.inventory` is keyed by the raw
 * lowercased name straight out of the dump, so an upgraded reward — the real
 * `Wu's Fist of Mastery +5`, equipped — lands on a different key than the scrape's
 * `Wu's Fist of Mastery` until the ` +N` is stripped. Without this fold the strongest evidence
 * a player can have (he upgraded the reward and wears it) reads as "not held".
 */
export function foldToCountKeys(counts: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [raw, n] of Object.entries(counts)) {
    const k = itemCountKey(raw)
    out[k] = (out[k] ?? 0) + n
  }
  return out
}

/** True when the reward's own stat block flags it NO DROP. */
export function rewardIsNoDrop(quest: PoskyQuest): boolean {
  return /NO DROP/i.test(quest.rewardStats ?? '')
}

/**
 * Quests whose REWARD the character is holding but which are not marked complete.
 *
 * `inventoryCounts` is the INVENTORY dump's counts (`progress.inventory`) and deliberately not
 * the reconciled `net`: net subtracts items consumed by completed quests, which is the right
 * model for TURN-IN items and the wrong one for a reward — a reward is not an input to anything
 * and must never be netted away. It is also independent of `countSource`: a reward in the bank
 * is invisible to the loot log by construction (it was received before logging, or off-screen),
 * so asking the log about it could only ever answer "no".
 *
 * Ordered by class then quest name, so the confirm list reads like the tab does.
 */
export function rewardCompletions(
  quests: readonly PoskyQuest[],
  inventoryCounts: Readonly<Record<string, number>>,
  completedKeys: readonly string[]
): RewardCompletion[] {
  const held = foldToCountKeys(inventoryCounts)
  const done = new Set(completedKeys)
  const out: RewardCompletion[] = []
  for (const q of quests) {
    if (!q.reward) continue
    const key = questKey(q)
    if (done.has(key)) continue
    if ((held[itemCountKey(q.reward)] ?? 0) <= 0) continue
    out.push({
      key,
      className: q.className,
      name: q.name,
      reward: q.reward,
      evidence: rewardIsNoDrop(q) ? 'noDrop' : 'tradeable'
    })
  }
  return out.sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name))
}

/** Counts for the summary line: how many of these candidates are proof vs merely likely. */
export function evidenceTally(list: readonly RewardCompletion[]): { noDrop: number; tradeable: number } {
  return {
    noDrop: list.filter((c) => c.evidence === 'noDrop').length,
    tradeable: list.filter((c) => c.evidence === 'tradeable').length
  }
}
