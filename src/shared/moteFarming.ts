// moteFarming.ts — WHERE MOTES COME FROM, answered from the log and from nothing else.
//
// `shared/motes.ts` is the wiki's half of this domain: it can price a mote (the ten-rung ladder,
// exp per rung, the item tier limit, the condensing arithmetic) and it explicitly CANNOT say where
// one drops — all ten item entries carry an empty `dropsfrom`, because the wiki's own answer is the
// string "Various Zones / Various Monsters". This file is the other half: the drop side, derived
// from this character's own loot history, with no catalog consulted anywhere in it.
//
// PURE. No React, no DOM, no Electron, no clock read. The value imports are RELATIVE
// (`./progressionStats`, `./motes`, `./lootRates`) so `tests/moteFarming.test.mts` can import this
// file straight under tsx — the node runner has no `@shared/*` alias (the mobSearch.ts precedent,
// repo-wide, and the exact import style lootRates.ts already uses).
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// EXP PER HOUR IS THE HEADLINE, AND THE COUNT IS THE FOOTNOTE
//
// "Six motes an hour" is not a farming rate, it is a farming rate with the units thrown away. A
// Mote of Infinitesimal Potential is worth 1 exp and a Mote of Potential is worth 4, so a spot
// yielding six Infinitesimals (6 exp/hr) is WORSE than one yielding two Potentials (8 exp/hr) even
// though it drops three times as many objects. Every row here therefore carries both rates, and
// the exp one is the one a surface is expected to rank on. The two disagreeing is not an anomaly
// to smooth over — it is the entire reason this module exists, and tests/moteFarming.test.mts pins
// a case where the count ranking and the exp ranking invert.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE REUSES RATHER THAN RE-DERIVES
//
//   • THE ZONE JOIN AND THE DENOMINATOR are `lootRates.itemZoneRows`, called verbatim. That
//     function already does per-zone, stack-aware drop counting against `rangeStats`' own
//     `zoneIdKey` fold, with `ZoneRangeRow.activeMs` as the denominator and a null rate when there
//     is none — its four rules, tested in tests/lootRates.test.mts, are exactly the four rules a
//     mote farming rate needs. Re-spelling any of it here would be a second zone attribution to
//     drift (world-model law 12, in miniature). It is documented as taking ONE item's events; the
//     only thing it reads off an event is `ts`/`zone`/`count`, so the pooled bag of "every laddered
//     mote" is a legitimate pseudo-item and the counts it returns mean the same thing.
//
//   • THE PRICE OF A BAG OF MOTES is `motes.moteExp`, called on a key→count map. Nothing here
//     multiplies an exp value by hand, so the one place a rung's worth is stated stays the ladder.
//
//   • THE INSTANCE TIER NEEDS NO CODE AT ALL, and this is worth stating because the obvious
//     "improvement" is a bug. EQ Legends encodes instance difficulty IN THE ZONE NAME — "Najena 4
//     (Refined)", "The Plane of Hate - Solo" (src/main/log/parseWorld.ts `zoneTier`) — and
//     `zoneIdKey` is a trim+lowercase of the WHOLE printed name. So a d0 farm and a d2 farm are
//     already two rows, by construction, and the `zone` field each carries still says which. The
//     renderer's `mobZone.zoneKey` STRIPS that suffix (it is joining onto a wiki catalog that never
//     carries one); folding these rows with it would silently average a d4 camp into its d0
//     namesake and report a rate that describes neither.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// WHAT THE DATA DOES NOT SUPPORT, STATED UP FRONT (world-model law 1)
//
//   • THESE ARE DROPS OBSERVED, NOT MOTES HELD. The log prints a loot line; it does not print an
//     inventory, and nothing in EverQuest announces a mote being spent, merged at a Constructed
//     Potential NPC, or handed to an alt. So `exp` is "the exp that has dropped for you", never
//     "the exp you can spend right now", and a surface must not word it as a balance. Sold/combined
//     dispositions are likewise NOT filtered out: `LootEvent.disposition` answers "is it still in
//     your bags", which is a different question from "does this zone drop motes", and the loot
//     ledger's held-count rule (renderer heldCounts.ts) is the one place that question is answered.
//
//   • THE RAID-TARGET FINDING IS A TENDENCY AND NEVER A RULE. In the owner's 20-drop log every one
//     of the six mobs that dropped a ladder-3-or-better mote is a roster raid target (Master Yael,
//     Cazic-Thule, Fright, Dread, Maestro of Rancor, Innoruuk) and five of the six Infinitesimal
//     sources are ordinary mobs — but `Bazzt Zzzt`, a raid target, dropped an Infinitesimal. So
//     `MoteTendency` below reports the counts AND the counter-examples, by name, and there is no
//     predicate anywhere in this file that treats "raid target" as implying a tier. A surface that
//     printed the tendency without the counter-example would be presenting a guess as a fact.
//
//   • THE WIKI'S PLAYER-LEVEL CEILING IS NOT CONSULTED. `motes.WIKI_LEVEL_CLAIM` exists to be
//     DISPLAYED beside the log that refutes it (ladder 5 at level ≤13); nothing here filters,
//     validates or warns against it. See motes.ts's header for the timestamps.

import type { LootEvent, RaidTarget } from './types'
import type { ZoneRangeRow } from './progressionStats'
import { zoneIdKey } from './progressionStats'
import { itemZoneRows, type ItemZoneRow } from './lootRates'
import { MOTE_LADDER, isVoidTouched, moteExp, moteOf, wikiClaimedCeiling, type Mote } from './motes'

const MS_PER_HOUR = 3_600_000

/** The row time before the first zone line falls in — `lootRates`/`progressionStats`' spelling. */
const UNKNOWN_ZONE = 'unknown'

/**
 * A rate per hour, or null when there is no active time to divide by.
 *
 * lootRates.ts rule 3, spelled with the same predicate (`> 0`) over the same field: every
 * `activeMs` this file divides by came off an `ItemZoneRow` that `itemZoneRows` built, so the two
 * cannot disagree about whether a denominator exists. (lootRates keeps its own copy private; a
 * public rate helper on that committed contract is a wider change than one shared divisor is
 * worth, and tests/moteFarming.test.mts asserts the two answers agree row for row.)
 */
function perHour(amount: number, activeMs: number): number | null {
  return activeMs > 0 ? amount / (activeMs / MS_PER_HOUR) : null
}

/** Stack-aware drop count for one loot line — lootRates.ts rule 4. `2 Motes of …` is two. */
function dropsOf(e: LootEvent): number {
  return e.count ?? 1
}

// ── THE RAID-TARGET JOIN ────────────────────────────────────────────────────────────────────

/**
 * Canonical match key: lowercase + strip a single leading article.
 *
 * The same fold `renderer/src/features/bosses/bossStatus.ts` runs its kill join on, and for the
 * identical reason: EQ writes "A thunder spirit princess" at sentence start and "a thunder spirit
 * princess" mid-sentence, while a roster `match` name carries no article at all. It is re-spelled
 * rather than imported because that module is renderer-side and this one is shared — src/shared
 * may not import src/renderer, and moving the boss roster into shared is a refactor with no other
 * caller asking for it. Two lines, one shape, and the raid-target test below pins the behaviour
 * (an article-bearing loot source still resolves to its target).
 */
function matchKey(name: string): string {
  return name.toLowerCase().replace(/^(?:an?|the) /, '').trim()
}

/**
 * The roster's `match[]` names, indexed to the target's DISPLAY name.
 *
 * Structural on purpose — the caller passes `getBossData().targets`, but any `{ name, match[] }`
 * satisfies it, so this file has no dependency on the bundled JSON and a test can hand it three
 * rows. Absent ⇒ an empty index, which makes every `raidTarget` null rather than throwing: "we
 * were not told the roster" and "this mob is not on it" then read the same, so a surface that
 * omitted the argument would see no markers at all rather than a wrong one.
 */
export type RaidTargetLike = Pick<RaidTarget, 'name' | 'match'>

function raidIndexOf(targets: readonly RaidTargetLike[]): ReadonlyMap<string, string> {
  const idx = new Map<string, string>()
  for (const t of targets) for (const m of t.match) idx.set(matchKey(m), t.name)
  return idx
}

// ── THE DROPS THIS FILE WORKS ON ────────────────────────────────────────────────────────────

/** One mote loot line, resolved. `mote` is null for Void-Touched Potential — see below. */
interface MoteDrop {
  event: LootEvent
  /**
   * The ladder rung, or NULL for `Void-Touched Potential`.
   *
   * Void-Touched is not on the ladder and must never be priced (motes.ts): it gives no experience
   * at all and instead raises an item or spell a whole tier, three per week from raids. Summing it
   * at 0 exp would understate it and inventing a number would invent a mechanic, so it is carried
   * through every fold as its OWN column and pooled into nothing.
   */
  mote: Mote | null
  /** Σ of this line's stack size. */
  drops: number
}

/** Every mote loot line in the history, resolved once. Ordinary loot is dropped here and nowhere
 *  else, so no fold below has to remember to filter. */
function moteDropsOf(events: readonly LootEvent[]): MoteDrop[] {
  const out: MoteDrop[] = []
  for (const event of events) {
    const mote = moteOf(event.item)
    if (mote) out.push({ event, mote, drops: dropsOf(event) })
    else if (isVoidTouched(event.item)) out.push({ event, mote: null, drops: dropsOf(event) })
  }
  return out
}

/** The histogram cell a zone/source row carries: one rung, how many, what they are worth. */
export interface MoteTierCount {
  /** 1..10 — `Mote.ladder`. */
  ladder: number
  /** the one-word tier ('Infinitesimal', 'Major', …), for a compact axis label. */
  short: string
  /** stack-aware count of this rung. */
  count: number
  /** `count * rung exp`. */
  exp: number
}

/** A key→count bag, and the rung histogram + price derived from it. One accumulator, so a row's
 *  `exp`, its histogram and its total can never tell three different stories. */
class MoteBag {
  private readonly counts = new Map<string, number>()
  /** Void-Touched Potential, held OUT of `counts` so `moteExp` can never see it. */
  voidTouched = 0
  motes = 0
  events = 0

  add(d: MoteDrop): void {
    this.events += 1
    if (!d.mote) {
      this.voidTouched += d.drops
      return
    }
    this.motes += d.drops
    this.counts.set(d.mote.key, (this.counts.get(d.mote.key) ?? 0) + d.drops)
  }

  /** Σ exp, priced by `motes.moteExp` — the only place a rung's worth is stated. */
  exp(): number {
    return moteExp(this.counts)
  }

  /** The rungs actually seen, lowest first. A rung with no drops is not a cell. */
  tiers(): MoteTierCount[] {
    const out: MoteTierCount[] = []
    for (const m of MOTE_LADDER) {
      const count = this.counts.get(m.key) ?? 0
      if (count > 0) out.push({ ladder: m.ladder, short: m.short, count, exp: count * m.exp })
    }
    return out
  }
}

// ── PER ZONE ────────────────────────────────────────────────────────────────────────────────

/** One zone (INCLUDING its instance suffix — see the header) you have looted motes in. */
export interface MoteZoneRow {
  /** The `zoneIdKey` fold — React key, and the identity the join ran on. */
  key: string
  /** RAW display name, first-seen casing, instance suffix intact (`Najena 4 (Refined)`). */
  zone: string
  /** Σ stack sizes of LADDERED motes. Void-Touched is not in it. */
  motes: number
  /** Loot LINES. Differs from `motes` exactly when something dropped in a stack. */
  events: number
  /** Σ exp of those motes, priced by the ladder. THE number two zones are compared on. */
  exp: number
  /** Void-Touched Potentials looted here — reported, never priced (see `MoteDrop.mote`). */
  voidTouched: number
  /** ACTIVE ms spent in this zone, from `ZoneRangeRow.activeMs`. 0 when the zone has no span in
   *  the queried range — a real state (the analytics zone column is capped drop-oldest), and the
   *  reason both rates below can be null while the counts beside them are true. */
  activeMs: number
  /** Wall ms of the range spent here (`ZoneRangeRow.spanMs`) — context beside the active half. */
  spanMs: number
  /** THE HEADLINE. Mote EXP per hour of active time. Null when `activeMs` is 0, never 0.0. */
  expPerHourActive: number | null
  /** Motes per hour of active time — the same number `itemZoneRows` calls `dropsPerHourActive`,
   *  kept beside the headline precisely so a reader can watch the two disagree. */
  motesPerHourActive: number | null
  /** Which rungs this zone produced, lowest first. */
  tiers: MoteTierCount[]
  firstTs: number
  lastTs: number
}

/**
 * Fold `itemZoneRows`' output for the laddered motes and for Void-Touched into one row set.
 *
 * TWO CALLS, not one, and not a hand-rolled pass. Both bags need the identical zone join and the
 * identical denominator, and Void-Touched must not be inside the `drops` the laddered call
 * returns — so the machinery runs twice over two disjoint event lists and the results are merged
 * on the key it already folded by. The merge is also what gives a zone that produced ONLY a
 * Void-Touched a row at all.
 */
function zoneSkeletons(
  drops: readonly MoteDrop[],
  zones: readonly ZoneRangeRow[]
): Map<string, ItemZoneRow> {
  const laddered = itemZoneRows({ events: drops.filter((d) => d.mote).map((d) => d.event), zones })
  const voids = itemZoneRows({ events: drops.filter((d) => !d.mote).map((d) => d.event), zones })
  const out = new Map<string, ItemZoneRow>()
  for (const r of [...laddered, ...voids]) {
    const prev = out.get(r.key)
    if (!prev) {
      out.set(r.key, r)
      continue
    }
    // Same zone, both bags: the spans are identical by construction (one `zones` argument), so
    // only the observation window widens.
    prev.firstTs = Math.min(prev.firstTs, r.firstTs)
    prev.lastTs = Math.max(prev.lastTs, r.lastTs)
  }
  return out
}

/**
 * Where motes drop for you, by exp per hour of the time you actually played there.
 *
 * ORDER: exp/hour descending with UNMEASURABLE ROWS LAST — a zone whose rate is null has not been
 * measured, so it cannot outrank a zone that has, and it must not be sorted as though its rate
 * were 0 either. Then total exp, then active time, then the name: a total order, so the table
 * never reshuffles between renders on a tie.
 */
function moteZoneRows(drops: readonly MoteDrop[], zones: readonly ZoneRangeRow[]): MoteZoneRow[] {
  const skeletons = zoneSkeletons(drops, zones)
  const bags = new Map<string, MoteBag>()
  for (const d of drops) {
    const key = zoneIdKey(d.event.zone ?? UNKNOWN_ZONE)
    let bag = bags.get(key)
    if (!bag) {
      bag = new MoteBag()
      bags.set(key, bag)
    }
    bag.add(d)
  }

  const out: MoteZoneRow[] = []
  for (const [key, bag] of bags) {
    const skel = skeletons.get(key)
    // Unreachable in practice — every drop that made a bag also went into one of the two
    // `itemZoneRows` calls — but the fold below reads six fields off it, so it is not asserted.
    if (!skel) continue
    const exp = bag.exp()
    out.push({
      key,
      zone: skel.zone,
      motes: bag.motes,
      events: bag.events,
      exp,
      voidTouched: bag.voidTouched,
      activeMs: skel.activeMs,
      spanMs: skel.spanMs,
      expPerHourActive: perHour(exp, skel.activeMs),
      motesPerHourActive: perHour(bag.motes, skel.activeMs),
      tiers: bag.tiers(),
      firstTs: skel.firstTs,
      lastTs: skel.lastTs
    })
  }
  return out.sort(byExpRate)
}

/** exp/hr desc, nulls last, then exp, then active time, then name. See `moteZoneRows`. */
function byExpRate(a: MoteZoneRow, b: MoteZoneRow): number {
  if (a.expPerHourActive === null !== (b.expPerHourActive === null)) {
    return a.expPerHourActive === null ? 1 : -1
  }
  return (
    (b.expPerHourActive ?? 0) - (a.expPerHourActive ?? 0) ||
    b.exp - a.exp ||
    b.activeMs - a.activeMs ||
    a.zone.localeCompare(b.zone)
  )
}

// ── PER SOURCE MOB ──────────────────────────────────────────────────────────────────────────

/** One mob that has dropped motes for you. */
export interface MoteSourceRow {
  /** article-insensitive lowercase key — the fold the raid-target join ran on. */
  key: string
  /** RAW display name, first-seen casing. */
  source: string
  /** Σ stack sizes of laddered motes. */
  motes: number
  events: number
  exp: number
  voidTouched: number
  /**
   * The roster raid target this mob IS, by display name — or null.
   *
   * NO RATE ON THIS ROW, deliberately. A rate needs a denominator and a mob is not a span of
   * time: the log says how long you were in a zone and never how long you spent killing one kind
   * of thing, so "motes per hour from Innoruuk" has nothing honest to divide by. Counts and exp
   * are facts; the rate would be a fabrication.
   */
  raidTarget: string | null
  tiers: MoteTierCount[]
  firstTs: number
  lastTs: number
}

/**
 * Who drops them, by exp then by count then by name.
 *
 * A loot line with NO source (the parser did not name a corpse) is skipped entirely rather than
 * pooled into an "unknown mob" row: unlike the zone case there is no matching stretch of the
 * record that the progression model already files under `unknown`, so such a row would be a
 * bucket this app invented rather than one it joined onto.
 */
function moteSourceRows(
  drops: readonly MoteDrop[],
  raidIdx: ReadonlyMap<string, string>
): MoteSourceRow[] {
  const bags = new Map<string, { bag: MoteBag; source: string; firstTs: number; lastTs: number }>()
  for (const d of drops) {
    const raw = d.event.source?.trim()
    if (!raw) continue
    const key = matchKey(raw)
    let e = bags.get(key)
    if (!e) {
      e = { bag: new MoteBag(), source: raw, firstTs: d.event.ts, lastTs: d.event.ts }
      bags.set(key, e)
    }
    e.bag.add(d)
    e.firstTs = Math.min(e.firstTs, d.event.ts)
    e.lastTs = Math.max(e.lastTs, d.event.ts)
  }

  const out: MoteSourceRow[] = []
  for (const [key, e] of bags) {
    out.push({
      key,
      source: e.source,
      motes: e.bag.motes,
      events: e.bag.events,
      exp: e.bag.exp(),
      voidTouched: e.bag.voidTouched,
      raidTarget: raidIdx.get(key) ?? null,
      tiers: e.bag.tiers(),
      firstTs: e.firstTs,
      lastTs: e.lastTs
    })
  }
  return out.sort((a, b) => b.exp - a.exp || b.motes - a.motes || a.source.localeCompare(b.source))
}

// ── THE LADDER ROLL-UP ──────────────────────────────────────────────────────────────────────

/** One rung of the ladder, and what you have seen of it. */
export interface MoteLadderRow {
  /** The rung itself — name, short, exp, item tier limit. Carried, never re-looked-up. */
  mote: Mote
  /** Σ stack sizes seen. 0 is a real and common answer. */
  count: number
  /** `count * mote.exp`. */
  exp: number
  /** Loot LINES. */
  events: number
}

/**
 * All TEN rungs, always, in ladder order — including the ones you have never seen.
 *
 * A rung with no drops is the most informative cell on the chart: it is how a player reads "I have
 * never had anything above Major", and dropping the empty rows would leave a five-bar chart that
 * silently rescaled every time a new tier landed.
 */
function moteLadderRows(drops: readonly MoteDrop[]): MoteLadderRow[] {
  const count = new Map<string, number>()
  const events = new Map<string, number>()
  for (const d of drops) {
    if (!d.mote) continue
    count.set(d.mote.key, (count.get(d.mote.key) ?? 0) + d.drops)
    events.set(d.mote.key, (events.get(d.mote.key) ?? 0) + 1)
  }
  return MOTE_LADDER.map((mote) => {
    const n = count.get(mote.key) ?? 0
    return { mote, count: n, exp: n * mote.exp, events: events.get(mote.key) ?? 0 }
  })
}

// ── THE TENDENCY (AND ITS COUNTER-EXAMPLES) ─────────────────────────────────────────────────

/**
 * The rung at which the owner's log's raid-target pattern was observed: ladder 3 (Lesser) and up.
 *
 * Stated as a constant so the copy on a surface and the arithmetic behind it cannot drift — the
 * sentence "every mob that dropped ladder-3-or-better was a raid target" is only checkable if the
 * number in the sentence is the number in the filter.
 */
export const TENDENCY_LADDER = 3

/** The raid-target pattern, with the evidence for AND against it. Never a predicate. */
export interface MoteTendency {
  /** `TENDENCY_LADDER`, carried so a caption can quote it. */
  ladderFloor: number
  /** Stack-aware drops at or above the floor, from a NAMED source. */
  highDrops: number
  /** …of which came from a roster raid target. */
  highFromRaid: number
  /** Distinct mobs (raw names) that dropped at or above the floor, sorted. */
  highSources: string[]
  /** Distinct mobs at-or-above the floor that are NOT raid targets — the tendency's other half. */
  highNonRaidSources: string[]
  /** Drops BELOW the floor whose source IS a raid target. */
  lowFromRaid: number
  /**
   * The raid targets that dropped below the floor, by name, sorted — `Bazzt Zzzt` in the owner's
   * log. THE FIELD EXISTS TO BE PRINTED: a surface stating the tendency without naming these is
   * stating a rule the data does not support.
   */
  counterExamples: string[]
}

function tendencyOf(
  drops: readonly MoteDrop[],
  raidIdx: ReadonlyMap<string, string>
): MoteTendency {
  const high = new Set<string>()
  const highNonRaid = new Set<string>()
  const counter = new Set<string>()
  let highDrops = 0
  let highFromRaid = 0
  let lowFromRaid = 0
  for (const d of drops) {
    // Void-Touched has no rung, so it can neither support nor refute a claim about rungs.
    const raw = d.mote ? d.event.source?.trim() : undefined
    if (!raw || !d.mote) continue
    const target = raidIdx.get(matchKey(raw)) ?? null
    if (d.mote.ladder >= TENDENCY_LADDER) {
      highDrops += d.drops
      high.add(raw)
      if (target) highFromRaid += d.drops
      else highNonRaid.add(raw)
    } else if (target) {
      lowFromRaid += d.drops
      counter.add(target)
    }
  }
  return {
    ladderFloor: TENDENCY_LADDER,
    highDrops,
    highFromRaid,
    highSources: [...high].sort((a, b) => a.localeCompare(b)),
    highNonRaidSources: [...highNonRaid].sort((a, b) => a.localeCompare(b)),
    lowFromRaid,
    counterExamples: [...counter].sort((a, b) => a.localeCompare(b))
  }
}

// ── THE WIKI'S LEVEL CEILING, CHECKED AGAINST THIS LOG ──────────────────────────────────────

/** A level-up the log printed. `ProgressionSnap` carries these as parallel `levelTs`/`levelValue`
 *  columns; the caller zips them, so this file needs nothing from the progression transport. */
export interface MoteLevelPoint {
  ts: number
  level: number
}

/**
 * The best mote this log has produced, the level you were when it dropped, and whether that pair
 * contradicts `motes.WIKI_LEVEL_CLAIM`.
 *
 * THIS IS EVIDENCE, NOT ENFORCEMENT. The wiki asserts that "the player's level will affect the
 * level of the motes that drop" and gives a table; motes.ts carries the table and deliberately
 * applies it nowhere, because the owner's log refutes it outright (ladder 5 on Fri Aug 07, four
 * levels before the log's first ding). A surface shows both sides and lets the player judge —
 * the alternative, hiding a drop the player can see in their own inventory, is strictly worse
 * than having no ceiling at all.
 *
 * `level` vs `levelAtMost` is the honest half. A ding at or before the drop states your level
 * exactly. With NO ding before it, the log has not said what level you were — but it HAS bounded
 * it: the next ding took you TO some level, so before that you were at most one below. That upper
 * bound is what makes the owner's case checkable ("ladder 5 at level ≤13") and it is the only
 * reading available for a drop that predates every level line in the window.
 */
export interface MoteLevelEvidence {
  /** the highest rung observed, 1..10 */
  ladder: number
  /** its display name */
  name: string
  /** when it dropped */
  ts: number
  /** the level the log STATES you were at that instant, or null when no ding precedes it */
  level: number | null
  /** when `level` is null: the highest level you can have been. Null when the log has no ding. */
  levelAtMost: number | null
  /** the rung the wiki's table would allow at that level. Null when neither level is known. */
  wikiCeiling: number | null
  /** the observed rung is ABOVE that ceiling — this character's own log refutes the claim */
  refuted: boolean
}

/** The highest rung this history holds, with the line it came off. Ties keep the FIRST — the
 *  claim is about ceilings, so the earliest instant a ceiling was broken is the interesting one. */
function bestRung(drops: readonly MoteDrop[]): { mote: Mote; ts: number } | null {
  let best: { mote: Mote; ts: number } | null = null
  for (const d of drops) {
    if (d.mote && (!best || d.mote.ladder > best.mote.ladder)) best = { mote: d.mote, ts: d.event.ts }
  }
  return best
}

/** What the log says about your level at `ts`: stated, else bounded, else nothing. */
function levelNear(levels: readonly MoteLevelPoint[], ts: number): { level: number | null; atMost: number | null } {
  const sorted = [...levels].sort((a, b) => a.ts - b.ts)
  let level: number | null = null
  for (const p of sorted) if (p.ts <= ts) level = p.level
  if (level !== null) return { level, atMost: null }
  // No ding before the drop ⇒ the log BOUNDS the level instead of stating it (see the doc above).
  return { level: null, atMost: sorted.length > 0 ? sorted[0].level - 1 : null }
}

function levelEvidenceOf(
  drops: readonly MoteDrop[],
  levels: readonly MoteLevelPoint[]
): MoteLevelEvidence | null {
  const best = bestRung(drops)
  if (!best) return null
  const { level, atMost } = levelNear(levels, best.ts)
  const known = level ?? atMost
  const wikiCeiling = known === null ? null : wikiClaimedCeiling(known)
  return {
    ladder: best.mote.ladder,
    name: best.mote.name,
    ts: best.ts,
    level,
    levelAtMost: atMost,
    wikiCeiling,
    refuted: wikiCeiling !== null && best.mote.ladder > wikiCeiling
  }
}

// ── THE ONE ENTRY POINT ─────────────────────────────────────────────────────────────────────

export interface MoteFarmingArgs {
  /** The WHOLE loot history. Filtered to motes here, so no caller states the filter twice. */
  events: readonly LootEvent[]
  /** The zone rows of the range the rates are measured over (`RangeStats.zones`). */
  zones: readonly ZoneRangeRow[]
  /** The boss roster (`getBossData().targets`). Absent ⇒ every `raidTarget` is null. */
  raidTargets?: readonly RaidTargetLike[]
  /** The level-ups the log printed. Absent ⇒ `levelEvidence` states no level, and no refutation. */
  levels?: readonly MoteLevelPoint[]
}

export interface MoteFarming {
  /** Where they drop, best exp/hour first. */
  zones: MoteZoneRow[]
  /** Who drops them, most exp first. */
  sources: MoteSourceRow[]
  /** All ten rungs, in ladder order, seen or not. */
  ladder: MoteLadderRow[]
  /** Σ laddered motes observed. */
  totalMotes: number
  /** Σ exp of those motes. `ladder`'s own sum, by construction. */
  totalExp: number
  /** Σ Void-Touched Potentials observed — never inside `totalExp`. */
  totalVoidTouched: number
  /** Loot LINES that named any mote, laddered or Void-Touched. */
  totalEvents: number
  /** The raid-target pattern and the drops that refute it. */
  tendency: MoteTendency
  /** The best rung seen, the level it dropped at, and whether that refutes the wiki's ceiling.
   *  Null when no laddered mote has ever dropped for this character. */
  levelEvidence: MoteLevelEvidence | null
}

/**
 * Everything the Motes tab knows, from the loot history and the zone spans it was handed.
 *
 * NOTHING IS SCORED, THRESHOLDED OR RECOMMENDED. The rows are observations in a stated order; the
 * only judgement in the whole module is which column the zone list sorts by, and that choice
 * (exp/hour) is argued in this file's header and visible in every row's other columns. A zone you
 * looted one mote in is a row exactly like a zone you looted fifty in — the `activeMs` beside it is
 * what tells the reader which, and the surface is required to print it.
 *
 * NO GLOBAL RATE is offered. Σ exp over Σ zone active time would divide by only the zones motes
 * happened to drop in, quietly excluding every hour you farmed and got none — a headline number
 * biased upward by exactly the thing a farmer wants to know about.
 */
export function moteFarming(args: MoteFarmingArgs): MoteFarming {
  const drops = moteDropsOf(args.events)
  const raidIdx = raidIndexOf(args.raidTargets ?? [])
  const ladder = moteLadderRows(drops)
  return {
    zones: moteZoneRows(drops, args.zones),
    sources: moteSourceRows(drops, raidIdx),
    ladder,
    totalMotes: ladder.reduce((n, r) => n + r.count, 0),
    totalExp: ladder.reduce((n, r) => n + r.exp, 0),
    totalVoidTouched: drops.reduce((n, d) => (d.mote ? n : n + d.drops), 0),
    totalEvents: drops.length,
    tendency: tendencyOf(drops, raidIdx),
    levelEvidence: levelEvidenceOf(drops, args.levels ?? [])
  }
}
