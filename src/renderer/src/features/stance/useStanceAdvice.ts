// useStanceAdvice — the Stances tab's one read.
//
// `combat:stanceAdvice` answers with all three inputs at once (the measured targets, the stance
// worn right now, the stances this loadout can wear) because they must describe ONE instant —
// shared/stanceAdvice.ts's header makes that argument, and this hook is why it matters: a
// ranking assembled from targets pulled at t against a loadout pulled at t+1 would describe a
// character who existed at neither.
//
// TRANSPORT, and why it is a pull rather than a module delta. There is no `stance` module: the
// ledger lives inside the combat engine, which is polled rather than pushed (features/combat/
// useCombat.ts, features/overview/useOverviewCombat.ts). So this follows the same shape they do
// — the throttled `combat:activity` nudge for responsiveness, plus a slow fallback tick — with
// one deliberate difference: the fallback here is FOUR seconds rather than one. The combat tab's
// 1 s tick exists to decay a live "active" indicator; nothing on this surface is a clock, and a
// damage profile that has absorbed hundreds of hits does not visibly move between two ticks. The
// nudge covers the case that actually matters (a hit just landed, or you just changed stance).
//
// Re-hydrating on `log:character` is the same rule useModule.ts follows: main rebuilt everything
// under a new character, so the held payload describes someone else.

import { useEffect, useState } from 'react'
import type { StanceAdvicePayload } from '@shared/stanceAdvice'

/** Slow safety tick. Anything urgent arrives on the activity nudge. */
const FALLBACK_POLL_MS = 4000

/** The payload, or null while the very first pull is in flight (reads as "not ready"). */
export function useStanceAdvice(): StanceAdvicePayload | null {
  const [payload, setPayload] = useState<StanceAdvicePayload | null>(null)

  useEffect(() => {
    let alive = true
    const tick = async (): Promise<void> => {
      const p = await window.eq.getStanceAdvice()
      if (alive) setPayload(p)
    }
    void tick()
    const offActivity = window.eq.onCombatActivity(() => void tick())
    const offChar = window.eq.onCharacter(() => void tick())
    const iv = setInterval(() => void tick(), FALLBACK_POLL_MS)
    return () => {
      alive = false
      offActivity()
      offChar()
      clearInterval(iv)
    }
  }, [])

  return payload
}
