// THE STANCE LEDGER — what each mob actually hits YOU with, split by the stance you were
// wearing when it landed. The measurement half of the stance recommendation; the arithmetic
// half is shared/stances.ts (the wiki's multipliers) and shared/stanceAdvice.ts (pooling,
// ranking, the mismatch gate). This file only COUNTS, and it counts nothing it did not see.
//
// ── WHY THE STANCE HAS TO BE PART OF THE KEY ────────────────────────────────────────────────
//
// The observation is biased by the very thing being recommended: damage is measured AFTER the
// stance reduced it, so the melee/spell split a mob appears to have depends on what you were
// wearing while you measured it (`unmitigate`'s header has the Cazic-Thule numbers — 64.7%
// spell read from inside Defensive, 37.9% from inside Mage Hunter, one mob). Pooling the two
// readings into one bucket would bake that bias in permanently and there would be no way back
// out. Keeping them SEPARATE — one `StanceSample` per stance worn — is what lets the shared
// layer divide each half by the multiplier that shrank it and recover the mob's own profile.
//
// So the key is (mobKey, zoneBase, tier, stanceKey), and the first three of those are the
// TARGET identity `TargetProfile` already specifies:
//   * `mobKey` — `idKey(attacker)`, because EQ writes the same mob with different casing on
//     different line families (law 2: canonicalize at boundaries, display raw).
//   * `zoneBase` + `tier` — `zoneTier()`, because EQ Legends encodes instance difficulty in the
//     zone NAME and a d0 Cazic-Thule is not a d2 Cazic-Thule. Pooling the tiers averages two
//     real answers into a wrong one (stanceAdvice.ts's header states the same rule).
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────
//
// It does not un-mitigate, rank, advise, or alert. It does not read the wiki table at all. A
// ledger that already applied the multipliers could never be re-pooled under a corrected
// number, and every judgement in this feature is downstream of numbers that a wiki edit can
// change (tests/stances.test.mts exists precisely to catch that). What is stored here is what
// the log printed: amounts, hits, timestamps, names.
//
// It is also purely ADDITIVE over damage the meter has already counted — nothing here moves a
// damage total, so law 8's byte-identical tripwire is untouched.

import { idKey } from '../log/parseCommon'
import { zoneTier } from '../log/parser'
import type { DamageType } from '../../shared/combat'
import type { StanceSample, TargetProfile } from '../../shared/stanceAdvice'
import type { DamageClass } from '../../shared/stances'

/**
 * MEMORY BOUND, and the reason it is generous.
 *
 * A row is one (mob, zone, tier) the player has been HIT BY, holding at most nine samples (one
 * per stance) of three numbers each — a few hundred bytes, so five hundred rows is well under a
 * megabyte and the cap exists to make the growth bounded rather than to save space.
 *
 * MEASURED on this fork's live log (a 27,617-line session across twelve zone instances in the
 * Planes of Fear and Hate, Paineel and the Ro/Feerrott overland): 29 distinct incoming attackers
 * produced 59 distinct (mob, zone, tier) rows. Distinct mobs SATURATE as a session goes on — you
 * revisit the same zone and fight the same bestiary — so a full-log replay is expected in the
 * low hundreds, not the thousands. Five hundred is roughly an order of magnitude above the
 * measured session and still trivially bounded.
 *
 * DROP-OLDEST when it is reached, like every other ring in the engine (STATE_SPAN_CAP in
 * stateTimeline.ts, RECENT_CAP, TIMELINE_CAP). "Oldest" here is LEAST-RECENTLY-HIT, not
 * first-inserted, and that difference is the whole point: insertion order would evict the raid
 * boss you have been fighting all night — first seen, still being fought — in favour of a piece
 * of trash that hit you once an hour ago. The scan is O(rows) and runs only on overflow.
 */
export const STANCE_TARGET_CAP = 500

/**
 * PHYSICAL vs MAGICAL from a damage event's `dtype`, and this mapping is an INTERPRETATION —
 * flagged as such because law 1 says anything inferred is labeled.
 *
 * The wiki names the partition twice, with different words and no definition of either:
 *   Defensive    "All incoming MELEE damage is reduced by 50% and incoming MAGICAL damage …"
 *   Mage Hunter  "All incoming SPELL damage is reduced by 50% and incoming PHYSICAL damage …"
 * Two sentences, four words, two buckets — so shared/stances.ts settled on one pair of names
 * (`physical` / `magical`) and this is where the log's own five-way `DamageType` is folded onto
 * them:
 *
 *   'melee' → PHYSICAL. A swing, a kick, a bash. This is the one the wiki names outright
 *             ("melee" in Defensive) and it is not in doubt.
 *   'spell' → MAGICAL. Likewise named outright ("spell" in Mage Hunter).
 *   'dot'   → MAGICAL. A damage-over-time tick is a SPELL's damage arriving late; the log
 *             prints it with the spell's own name (`You have taken 80 damage from Bond of Death
 *             by King Tranix.`). Nothing in the wiki mentions DoTs at all, so this is a reading
 *             of "spell damage" that includes the ticks a spell produces.
 *   'ds'    → MAGICAL. A damage shield fires when YOU hit the mob, and the game models it as an
 *             effect rather than a blow. This is the weakest of the four calls: it is possible
 *             that a shield's return damage is mitigated as physical (it is provoked by a
 *             physical swing), and the log cannot say — no line, in any log seen, states which
 *             reduction applied to it.
 *
 * The two uncertain calls are cheap in practice and expensive to get silently wrong, which is
 * why they are written down here instead of being spread across the fold. Should a measurement
 * ever contradict one, this function is the single place to change.
 */
export function damageClassOf(dtype: DamageType): DamageClass {
  return dtype === 'melee' ? 'physical' : 'magical'
}

/** One incoming landed hit, as the ingest path hands it over. */
export interface StanceLedgerHit {
  /** the attacker's name EXACTLY as the line spelled it — keyed and displayed from here */
  mobName: string
  /** the zone name as the last `zone` event stated it; undefined before any zone line */
  zone: string | undefined
  /** the stance in effect AT THIS MOMENT, or undefined when none has been committed */
  stance: string | undefined
  dtype: DamageType
  /** landed amount, AS OBSERVED — post-mitigation, never corrected here */
  amount: number
  ts: number
}

/** WHO a row is about: the (mob, zone, tier) triple `TargetProfile` specifies, plus the display
 *  spelling. Its own type so opening a row takes one argument instead of four. */
interface TargetIdentity {
  mobKey: string
  mobName: string
  zoneBase: string
  tier: number
}

/** The engine-internal row. Same identity as `TargetProfile`, samples held by stance key. */
interface LedgerRow extends TargetIdentity {
  /** stanceKey → the running sample. '' is the no-stance-committed bucket. */
  samples: Map<string, StanceSample>
  lastSeenTs: number
  biggestHit: number
}

/** The composite row key. `|` cannot appear in a tier and does not appear in an EQ zone name. */
function rowKey(mobKey: string, zoneBase: string, tier: number): string {
  return `${mobKey}|${zoneBase}|${tier}`
}

/** One row, COPIED out (row and samples both) so a consumer cannot mutate engine state through
 *  the projection. One function, so `targets()` and `targetByKey()` cannot drift apart. */
function toProfile(row: LedgerRow): TargetProfile {
  return {
    mobKey: row.mobKey,
    mobName: row.mobName,
    zoneBase: row.zoneBase,
    tier: row.tier,
    samples: [...row.samples.values()].map((s) => ({ ...s })),
    lastSeenTs: row.lastSeenTs,
    biggestHit: row.biggestHit
  }
}

/**
 * The session-level incoming-damage ledger. One per engine; owned by `EngineState`, written
 * only by the incoming branch of the ingest fold, and reset wherever the engine resets.
 */
export class StanceLedger {
  private rows = new Map<string, LedgerRow>()

  /** Rows currently held. Exposed for the cap's own test, and cheaper than `targets().length`. */
  get size(): number {
    return this.rows.size
  }

  reset(): void {
    this.rows.clear()
  }

  /**
   * Fold one landed incoming hit.
   *
   * `stance` is the engine's CURRENT stance, passed in rather than re-derived: `EngineState`
   * owns it (applyStance is the one writer) and re-parsing it here would fork state that has
   * exactly one owner today. An empty stance key is a real, meaningful bucket — the log may
   * simply predate this session's first commit, and `StanceSample` documents `''` as that case —
   * so it is recorded rather than dropped, and the shared layer treats it as 1/1 multipliers
   * (`mitigationFor` returns no reduction for an unknown key, never a guessed one).
   *
   * A ZONE-LESS hit (nothing has printed `You have entered …` yet — a replay can start mid-zone)
   * lands under `zoneBase: ''`, which is the honest "we do not know where this was" bucket. It is
   * not guessed and it never merges with a named zone, so a later real zone line simply starts a
   * new row rather than retroactively relabelling this one.
   *
   * RETURNS THE ROW KEY it folded into (null when the hit was refused). The advisor beside this
   * ledger (stanceAdvisor.ts) needs to know WHICH target just hit the player, and re-deriving
   * `idKey(name)` + `zoneTier(zone)` + the join on every incoming tick would be a second copy of
   * a key this function has already computed — and a second place for it to be computed
   * differently. The key is opaque to the caller; `targetByKey` is the only thing that reads it.
   */
  note(hit: StanceLedgerHit): string | null {
    if (hit.amount <= 0) return null
    const mobKey = idKey(hit.mobName)
    const { base, tier } = zoneTier(hit.zone ?? '')
    const key = rowKey(mobKey, base, tier)
    // `??` short-circuits, so the identity object is built only when a row is actually minted —
    // the steady-state hot path is one Map lookup and no allocation.
    const row = this.rows.get(key) ?? this.open(key, { mobKey, mobName: hit.mobName, zoneBase: base, tier })
    // Law 2: keys are canonical, display is raw and FIRST-SPELLING-WINS. The row's `mobName` is
    // never overwritten — one row must read one way for the whole session, and both spellings
    // are equally correct (`a fetid fiend` on a lifecycle line, `A fetid fiend` on a damage one).
    const stanceKey = (hit.stance ?? '').toLowerCase()
    const sample = row.samples.get(stanceKey) ?? { stanceKey, physical: 0, magical: 0, hits: 0 }
    sample[damageClassOf(hit.dtype)] += hit.amount
    sample.hits += 1
    row.samples.set(stanceKey, sample)
    // OBSERVED, not un-mitigated (TargetProfile says so explicitly): "the biggest hit you have
    // actually taken from this thing" is a fact about your health bar. Recovering what the swing
    // would have been without your stance is a different number and belongs to the advice layer.
    if (hit.amount > row.biggestHit) row.biggestHit = hit.amount
    if (hit.ts > row.lastSeenTs) row.lastSeenTs = hit.ts
    return key
  }

  /**
   * ONE target, by the key `note()` just returned — the advisor's read.
   *
   * Separate from `targets()` because that one copies EVERY row (the whole session's bestiary)
   * to answer a question about one mob, and this read happens inside the fold. It is still a
   * full copy of the row it names: the advisor hands the profile to shared code that must not
   * be able to reach back into engine state.
   */
  targetByKey(key: string): TargetProfile | undefined {
    const row = this.rows.get(key)
    return row ? toProfile(row) : undefined
  }

  /**
   * The read model: every measured target, most-recently-hit first.
   *
   * Newest-first because the only question a consumer asks of the whole list is "which of these
   * am I fighting now" — the UI wave picks the current target off the front, and a mob last seen
   * three zones ago sorts to the back where it belongs. Fully COPIED out (rows and samples both)
   * so a consumer cannot mutate engine state through the projection.
   */
  targets(): TargetProfile[] {
    const out: TargetProfile[] = []
    for (const row of this.rows.values()) out.push(toProfile(row))
    return out.sort((a, b) => b.lastSeenTs - a.lastSeenTs)
  }

  /**
   * Mint a row, evicting the least-recently-hit one FIRST if the cap is already reached.
   *
   * Eviction before insertion, deliberately: the new row's `lastSeenTs` is still 0 at this point
   * (the caller folds the hit into it next), so an evict-after-insert would find the newcomer to
   * be the oldest thing in the map and delete the row it had just created.
   */
  private open(key: string, id: TargetIdentity): LedgerRow {
    if (this.rows.size >= STANCE_TARGET_CAP) this.dropOldest()
    const row: LedgerRow = { ...id, samples: new Map<string, StanceSample>(), lastSeenTs: 0, biggestHit: 0 }
    this.rows.set(key, row)
    return row
  }

  /** Evict the row whose most recent hit is furthest in the past. See STANCE_TARGET_CAP. */
  private dropOldest(): void {
    let oldestKey: string | undefined
    let oldestTs = Number.POSITIVE_INFINITY
    for (const [k, row] of this.rows) {
      if (row.lastSeenTs < oldestTs) {
        oldestTs = row.lastSeenTs
        oldestKey = k
      }
    }
    if (oldestKey !== undefined) this.rows.delete(oldestKey)
  }
}
