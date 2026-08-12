// THE OFFENSE LEDGER — what YOU do to each mob, split by the stance you were wearing when you
// did it. The measurement half of the DPS recommendation; the arithmetic half is
// shared/stanceOffense.ts (the measured multipliers, the un-scaling, the ranking).
//
// The mirror of stanceLedger.ts, and it shares that file's whole argument: the observation is
// biased by the very thing being recommended, so the stance HAS to be part of the key. 2,000
// points of melee measured inside Offensive is 1,000 points of baseline; pooling it with damage
// measured in Defensive would bake the bias in permanently, and the ranking would then compare
// Offensive against a baseline that already contains Offensive.
//
// ── WHY THIS IS A SECOND LEDGER AND NOT A SECOND FIELD ON THE FIRST ─────────────────────────
//
// The rows look identical — same (mobKey, zoneBase, tier) identity, same cap, same eviction rule
// — and folding them into `StanceLedger` was the first design. The engine's own test forbids it,
// correctly: `tests/stanceLedger.test.mts` asserts that EVERY row in that ledger appears in the
// meter's INCOMING list ("X is in the ledger but not in the incoming meter"), which is the
// invariant proving the ledger's admission set is exactly `Agg.addInc`'s. A mob you killed
// without taking a scratch belongs in THIS ledger and in no incoming list anywhere, so sharing
// the map would have broken a golden invariant to save a Map allocation.
//
// The two are joined by the composite key instead, which they compute the same way, and the
// renderer pairs them up (a target may legitimately appear in one and not the other).
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────
//
// It does not un-scale, rank or advise, for the same reason its twin does not: a ledger that has
// already applied the multipliers can never be re-pooled under a corrected one, and the numbers
// in shared/stanceOffense.ts are MEASURED — which means they can be re-measured on a longer log.
// What is stored here is what the log printed.
//
// It counts YOUR damage only — never a pet's and never a group member's. Your stance does not
// reach your pet's claws, so a ledger that pooled them would answer a question about somebody
// else's damage. The caller gates on `at.kind === 'out-you'`.
//
// It is purely ADDITIVE over damage the meter has already counted (law 8's tripwire): a second
// index, moving no total.

import { idKey } from '../log/parseCommon'
import { zoneTier } from '../log/parser'
import { STANCE_TARGET_CAP } from './stanceLedger'
import type { DamageType } from '../../shared/combat'
import type {
  OffenseProfile,
  OffenseSample,
  OutgoingBucket,
  OutgoingProfile
} from '../../shared/stanceOffense'

export type { OffenseProfile, OffenseSample }

/**
 * WHICH BUCKET one of your hits falls into. The boundary the measurement found (see
 * shared/stanceOffense.ts's experiment) is melee-verb vs everything-else, and `dtype` is exactly
 * that distinction as the parser already draws it:
 *
 *   'melee' → MELEE. Every hit that printed a melee verb, weapon swing and named skill lane
 *             alike (`slash`, `bash`, `kick`, `smite`, `punch`, `claw`, `backstab`). Measured to
 *             move together: all of them ~2x in Offensive.
 *   'spell' → SPELL. `You hit <mob> for N points of magic damage by <Spell>.` Measured flat under
 *             every stance — `Smiting Strike` reads 256.0 either side of twelve commits.
 *   'dot'   → SPELL. A tick is a spell's damage arriving late.
 *   'ds'    → SPELL. A damage shield is an effect, not a swing of yours.
 *
 * SLAY UNDEAD RIDES THE MELEE BUCKET, and that is a call worth stating. Its `dtype` is 'melee'
 * with a `(Slay Undead)` paren modifier (taxonomy.ts: all 1,257 in the reference log are melee,
 * zero spell) — it IS a weapon swing, one that procced, and the amount on the line is that
 * swing's damage. So it buckets as melee by construction rather than by a special case. Whether
 * Offensive doubles the proc's contribution as well as the swing's is not separately observable:
 * the log prints one number for both.
 */
export function outgoingBucketOf(dtype: DamageType): OutgoingBucket {
  return dtype === 'melee' ? 'melee' : 'spell'
}

/** One landed hit of YOURS, as the ingest path hands it over. */
export interface StanceOffenseHit {
  /** the DEFENDER's name exactly as the line spelled it */
  mobName: string
  /** the zone as the last `zone` event stated it; undefined before any zone line */
  zone: string | undefined
  /** the stance in effect AT THIS MOMENT, or undefined when none has been committed */
  stance: string | undefined
  dtype: DamageType
  /** landed amount, AS OBSERVED — never corrected here */
  amount: number
  ts: number
}

interface Row {
  mobKey: string
  mobName: string
  zoneBase: string
  tier: number
  /** stanceKey → the running sample. '' is the no-stance-committed bucket. */
  samples: Map<string, OffenseSample>
  lastSeenTs: number
  biggestHit: number
}

/** The composite row key — byte-identical to StanceLedger's, so the two join. */
function rowKey(mobKey: string, zoneBase: string, tier: number): string {
  return `${mobKey}|${zoneBase}|${tier}`
}

/** One row, COPIED out (row and samples both) so a consumer cannot mutate engine state. */
function toProfile(row: Row): OffenseProfile {
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

/** The observed (still-biased) profile of one target's samples — the raw sum, for a UI that
 *  wants to show what was measured before the correction. Un-scaling is the shared layer's job. */
export function observedProfile(samples: readonly OffenseSample[]): OutgoingProfile {
  let melee = 0
  let spell = 0
  for (const s of samples) {
    melee += s.melee
    spell += s.spell
  }
  return { melee, spell }
}

/**
 * The session-level outgoing-damage ledger. One per engine; owned by `EngineState`, written only
 * by the `out-you` branch of the ingest fold, and reset wherever the engine resets.
 */
export class StanceOffenseLedger {
  private rows = new Map<string, Row>()

  get size(): number {
    return this.rows.size
  }

  reset(): void {
    this.rows.clear()
  }

  /**
   * Fold one landed hit of yours. Returns the row key it folded into, or null when refused —
   * the same contract `StanceLedger.note` has, so a future advisor on this side can be handed
   * the row rather than re-deriving the key.
   *
   * The refusal is `amount <= 0`, matching `route()`, which drops those before anything
   * aggregates: a hit count that counted them would drift from the meter's while the damage
   * total still matched.
   */
  note(hit: StanceOffenseHit): string | null {
    if (hit.amount <= 0) return null
    const mobKey = idKey(hit.mobName)
    const { base, tier } = zoneTier(hit.zone ?? '')
    const key = rowKey(mobKey, base, tier)
    const row = this.rows.get(key) ?? this.open(key, { mobKey, mobName: hit.mobName, zoneBase: base, tier })
    const stanceKey = (hit.stance ?? '').toLowerCase()
    const sample = row.samples.get(stanceKey) ?? { stanceKey, melee: 0, spell: 0, hits: 0 }
    sample[outgoingBucketOf(hit.dtype)] += hit.amount
    sample.hits += 1
    row.samples.set(stanceKey, sample)
    if (hit.amount > row.biggestHit) row.biggestHit = hit.amount
    if (hit.ts > row.lastSeenTs) row.lastSeenTs = hit.ts
    return key
  }

  /** ONE target, by the composite key — the read a per-mob surface makes. */
  targetByKey(key: string): OffenseProfile | undefined {
    const row = this.rows.get(key)
    return row ? toProfile(row) : undefined
  }

  /** Every measured target, most-recently-hit first, fully copied out. */
  targets(): OffenseProfile[] {
    const out: OffenseProfile[] = []
    for (const row of this.rows.values()) out.push(toProfile(row))
    return out.sort((a, b) => b.lastSeenTs - a.lastSeenTs)
  }

  /** Mint a row, evicting the least-recently-hit one first if the cap is reached. Eviction
   *  BEFORE insertion, or the newcomer (lastSeenTs still 0) would be found to be the oldest
   *  thing in the map and deleted immediately — StanceLedger.open's own note. */
  private open(key: string, id: Pick<Row, 'mobKey' | 'mobName' | 'zoneBase' | 'tier'>): Row {
    if (this.rows.size >= STANCE_TARGET_CAP) this.dropOldest()
    const row: Row = { ...id, samples: new Map<string, OffenseSample>(), lastSeenTs: 0, biggestHit: 0 }
    this.rows.set(key, row)
    return row
  }

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
