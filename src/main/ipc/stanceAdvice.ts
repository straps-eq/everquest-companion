// IPC: the stance advisor's one read — measurements, the stance worn now, and the stances this
// character can wear, in a single answer.
//
// WHY ONE CHANNEL FOR THREE FACTS. Every consumer of this payload calls `adviseFor(target,
// available)` or `detectMismatch(target, available, current)` — functions that take two or three
// of the fields together. Fetched separately they would be read at different instants, and a
// ranking of a loadout that was current one tick after the measurements is a ranking of nobody.
// The group roster rides the combat snapshot for exactly this reason (ipc/roster.ts says so).
//
// WHY NOT ON `combat:snapshot`. That snapshot is polled once a second by the Combat tab AND by
// every open meter overlay; this list grows with the session's bestiary rather than with the
// snapshot's payload caps, and it is read by one panel on demand. Advice is not a meter reading.
//
// NO ARGUMENTS, so there is nothing to validate at the handler — the read is over main-owned
// state only and the renderer supplies no string that reaches a path, a key or a query.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { availableStanceKeys } from '../data/stanceLoadout'
import { combat, comboModule } from '../pipeline'
import type { StanceAdvicePayload } from '../../shared/stanceAdvice'

/**
 * The loadout as of NOW: the combo module's open (current) interval.
 *
 * Read through `snapshot()` rather than off a stored copy — the same PULL the corrections
 * provider uses (ipc/combo.ts) and for the same reason: the module recomputes its intervals
 * from scratch whenever anything moves (a `/who` row re-labels the past hour), so a cached
 * interval detaches from the model on the very next fold. `current` is null before any evidence
 * exists, which is the honest "we do not know the loadout yet".
 */
function stancesForCurrentLoadout(): string[] {
  return availableStanceKeys(comboModule.snapshot().state.current)
}

export function registerStanceAdviceIpc(): void {
  ipcMain.handle(
    IPC.getStanceAdvice,
    (): StanceAdvicePayload => ({
      targets: combat.stanceTargets(),
      // Read in the same tick as the line above, which is the whole reason these four facts share
      // one channel: the sustain answer and the DPS answer are two readings of ONE instant.
      offense: combat.stanceOffenseTargets(),
      currentStance: combat.currentStanceKey(),
      availableStances: stancesForCurrentLoadout()
    })
  )
}
