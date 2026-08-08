// WHICH STANCES CAN THIS CHARACTER ACTUALLY WEAR — the loadout half of the stance advice.
//
// Ranking every stance in the game would be useless advice: a Monk/Paladin/Enchanter cannot
// press Defensive if no slot holds a class that has it, and `rankStances()` takes an explicit
// `availableKeys` list precisely so this decision is made once, here, by the side of the app
// that knows the loadout.
//
// TWO COMMITTED TABLES, NOTHING SCRAPED, NOTHING FETCHED (the levelUnlocks.ts precedent):
//   * `classes.json`'s `stances` map — `stance name → [class codes]`, straight off the wiki's
//     three-column Stance table. Note its DIRECTION: it says who may wear a stance, so answering
//     "what may this class wear" is an inversion of it, done here.
//   * the combo module's current `ComboInterval` — the inferred class loadout, with its own
//     honesty built in (a slot is RESOLVED, AMBIGUOUS or UNKNOWN; see shared/classCombo.ts).
//
// ── THE UNRESOLVED CASE, AND WHY IT WIDENS RATHER THAN NARROWS ──────────────────────────────
//
// The combo is INFERRED (law 1) and it is routinely only partly known — a loadout swap prints
// nothing, so "two of three slots resolved" is the normal state, not a failure. A resolved slot
// contributes exactly its class; an ambiguous slot contributes EVERY class it might still be,
// and an unknown slot therefore contributes all sixteen.
//
// That over-offers, and over-offering is the safe direction for a READ-ONLY advisory. Erring the
// other way — listing only what we are certain of — would silently withhold the right answer
// exactly when the model is least sure, which is when the user most needs to see the options.
// A stance the character cannot really press costs a wasted row in a list; a stance we hid
// costs the recommendation. The UI wave is expected to label the list with the combo's own
// confidence (the interval carries it) rather than presenting it as fact.
//
// Pure and Electron-free so `npm test` can pin it; the IPC handler is wiring only.

import classesJson from './classes.json'
import { isClassAbbr, resolvedClasses, type ClassAbbr, type ComboInterval } from '../../shared/classCombo'

/** `classes.json` shape for the one table this module reads: stance name → class codes. */
const STANCE_TABLE = classesJson.stances as Record<string, string[]>

/**
 * The classes this interval could be running: resolved slots contribute their one class,
 * unresolved ones contribute all of their candidates. See the header for why it widens.
 */
export function loadoutClasses(interval: ComboInterval | null | undefined): ClassAbbr[] {
  if (!interval) return []
  const out = new Set<ClassAbbr>(resolvedClasses(interval))
  for (const slot of interval.slots) {
    if (slot.candidates.length === 1) continue
    for (const c of slot.candidates) out.add(c)
  }
  return [...out]
}

/**
 * The stance KEYS those classes may wear — lowercase, so they index `STANCE_EFFECTS` and match a
 * `stanceChange` event's `stance` directly (shared/stances.ts states that contract).
 *
 * Sorted for a stable payload: the list crosses an IPC into a UI that will render it in order,
 * and a Map-iteration order that shifts between calls would reshuffle the list under the user.
 * An UNKNOWN class code in the table is skipped rather than passed through — the scrape owns
 * that file and a code outside the closed set is a data defect, not a stance.
 */
export function stanceKeysForClasses(classes: readonly ClassAbbr[]): string[] {
  const want = new Set<string>(classes)
  const out: string[] = []
  for (const [stance, allowed] of Object.entries(STANCE_TABLE)) {
    if (allowed.some((c) => isClassAbbr(c) && want.has(c))) out.push(stance.toLowerCase())
  }
  return out.sort()
}

/** The whole join: the combo's current interval → the stance keys it can wear. */
export function availableStanceKeys(interval: ComboInterval | null | undefined): string[] {
  return stanceKeysForClasses(loadoutClasses(interval))
}
