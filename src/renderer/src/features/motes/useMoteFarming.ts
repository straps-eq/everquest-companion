// useMoteFarming — the Motes tab's one query, over two modules that already exist.
//
// NO NEW IPC CHANNEL, and none is needed. The `loot` module already carries every drop with the
// zone it happened in and the corpse it came off (`LootEvent.zone` / `.source`), and the
// `progression` snapshot already carries the zone timeline every rate on this app divides by. This
// hook is `useItemZoneRates` (features/loot) with a wider question: it decides WHICH RANGE and
// hands both to `shared/moteFarming.ts`, which does all the arithmetic. Nothing here divides,
// counts or ranks anything.
//
// THE RANGE IS THE WHOLE RECORD, for the same reason the item drill-down's is: the question is
// "where do motes drop for me", full stop. This tab has no timescale control and inventing one
// would be a second opinion about a scope the Leveling tab already owns. So the range is
// `dataBounds` end to end with the `+1 ms` tail `windowScope.statsRangeFor` documents, and every
// number on the page describes the character's entire history.
//
// THE BOSS ROSTER comes from the bundled profile data (`getBossData()`), the same 31 targets the
// Raid Targets tab tracks — so "was this a raid target" has one answer in the app, not two.

import { useMemo } from 'react'
import type { ProgressionDelta, ProgressionSnap } from '@shared/types'
import { rangeStats } from '@shared/progressionStats'
import { moteFarming, type MoteFarming, type MoteLevelPoint } from '@shared/moteFarming'
import { useModule } from '../../lib/useModule'
import { useLootHistory } from '../loot/useLootHistory'
import { EMPTY_PROGRESSION, applyProgressionDelta } from '../leveling/progressionDelta'
import { dataBounds } from '../leveling/zoneBands'
import { getBossData } from '../../data'

/** The same one-millisecond tail `windowScope.ts` documents: `rangeStats` ranges are half-open and
 *  the newest loot line in the log is stamped at `bounds.hi` exactly. */
const TAIL_MS = 1

export interface MoteFarmingView {
  data: MoteFarming
  /**
   * True when the range reached below the analytics module's capped zone window — the same
   * `clipped` flag the Leveling range panel surfaces. Drops older than that window keep their own
   * timestamps and lose their span, so their rows are honest counts with an em-dash rate.
   */
  clipped: boolean
  /**
   * False until the module snapshots have landed — what separates "still reading the log" from
   * "you have never looted a mote", two states that would otherwise render as the same blank page.
   *
   * It reads the PROGRESSION snapshot because that is the one of the pair whose un-hydrated state
   * is observable: `useLootHistory` folds `null` to a stable empty array (it has to — a fresh `[]`
   * each render would re-run every memo keyed on the history), so an empty loot list means both
   * "not yet" and "nothing" and cannot be asked. The two modules are requested in the same mount
   * and hydrate together, so this is the same instant either would report.
   */
  hydrated: boolean
}

/** The level-ups the log printed, zipped out of the progression snapshot's parallel columns. */
function levelPoints(snap: ProgressionSnap): MoteLevelPoint[] {
  return snap.levelTs.map((ts, i) => ({ ts, level: snap.levelValue[i] }))
}

/**
 * Every mote this character has looted, where, from what, and what each spot is worth per hour.
 *
 * Memoised on the two snapshots: `rangeStats` walks the whole progression record and the tab
 * re-renders on every loot delta, so recomputing per render would re-walk it for a row that has
 * not moved.
 */
export function useMoteFarming(): MoteFarmingView {
  const loot = useLootHistory()
  const prog = useModule<ProgressionSnap, ProgressionDelta>('progression', applyProgressionDelta)
  return useMemo(() => {
    const snap = prog ?? EMPTY_PROGRESSION
    const bounds = dataBounds(snap, [])
    // No record at all ⇒ no zone rows, so every rate is null and every count is still true.
    const stats = bounds ? rangeStats({ snap, range: { t0: bounds.lo, t1: bounds.hi + TAIL_MS } }) : null
    return {
      data: moteFarming({
        events: loot,
        zones: stats?.zones ?? [],
        raidTargets: getBossData().targets,
        levels: levelPoints(snap)
      }),
      clipped: stats?.clipped ?? false,
      hydrated: prog !== null
    }
  }, [loot, prog])
}
