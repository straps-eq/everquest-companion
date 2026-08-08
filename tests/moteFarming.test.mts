// PURE UNIT TESTS for "where do I farm motes, and what is a spot actually worth"
// (src/shared/moteFarming.ts).
//
// No log, no fixture, no DOM — so this file never skips. It pins the things this feature can get
// quietly wrong, each of which would look exactly like a working page on screen:
//
//   1. EXP/HOUR AND COUNT/HOUR DISAGREEING. The whole reason the module exists. A spot that drops
//      six Infinitesimals an hour is worse than one that drops two Potentials, and a ranking on
//      count says the opposite. The inversion is constructed and both orderings are asserted.
//   2. UNKNOWN IS NOT ZERO. A zone with no active time hands back NULL rates and true counts, and
//      it sorts BELOW every measured zone rather than as though its rate were 0.
//   3. VOID-TOUCHED IS NEVER PRICED. It is not on the ladder, it gives no experience, and summing
//      it at 0 would understate it while guessing a number would invent a mechanic. It gets its
//      own column in every fold and enters `exp` nowhere.
//   4. THE RAID-TARGET JOIN, and the fact that it is a TENDENCY. A roster `match[]` name resolves
//      through the article-insensitive fold; and the module reports the counter-examples (a raid
//      target dropping a low rung — `Bazzt Zzzt` in the owner's real log) rather than suppressing
//      them.
//   5. A DROP IS A STACK. `2 Motes of Lesser Potential` is two motes and four exp, from one line —
//      the same quantity the loot ledger's group counts have stated since Task #47.
//   6. THE DENOMINATOR IS `lootRates`', NOT A SECOND OPINION. The mote count rate this module
//      prints must equal, row for row, what `itemZoneRows` would print for the same events.
//
// The seventh thing — the wiki's player-level ceiling, shown as a claim and shown refuted — has
// its own spec next door (tests/moteLevelClaim.test.mts), because this file is at the repo's
// 400-code-line ceiling and the rule here is to factor rather than exempt.
//
// Nothing here freezes a number the live log could move: every expectation is derived from the
// fixture built inside the test, or from the committed `MOTE_LADDER`.
//
// Imported RELATIVELY: node tests run through tsx with no `@shared` alias.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemZoneRows } from '../src/shared/lootRates'
import { MOTE_LADDER, moteOf } from '../src/shared/motes'
import { TENDENCY_LADDER, moteFarming, type RaidTargetLike } from '../src/shared/moteFarming'
// The two inputs every case below builds — a ProgressionSnap to derive zone spans from, and loot
// lines. Extracted so this spec is expectations and not scaffolding (see that file's header).
import {
  HOUR,
  INFINITESIMAL,
  LESSER,
  MAJOR,
  MIN,
  POTENTIAL,
  T0,
  VOID,
  addZone,
  emptySnap,
  expOf,
  keepBusy,
  loot,
  stack,
  twoZones,
  zonesOf
} from './moteFixture.mts'

// ── 1. THE POINT OF THE WHOLE MODULE: the two rates disagree ────────────────────────────────

/**
 * SIX INFINITESIMALS BEAT TWO POTENTIALS ON COUNT AND LOSE ON EXP, and the exp answer is the one
 * the module ranks by.
 *
 * The arithmetic is the ladder's, not this file's: 6 x 1 exp = 6 against 2 x 4 exp = 8, over one
 * active hour each. A page that ranked on count would send the player to the worse camp while
 * showing them a bigger number, which is exactly the failure mode the exp column exists to stop.
 */
test('MF: exp/hour and motes/hour rank the two zones in OPPOSITE orders — exp wins', () => {
  const events = [
    ...[5, 10, 15, 20, 25, 30].map((m) => loot(T0 + m * MIN, INFINITESIMAL, 'The Hole', 'a bleeder')),
    loot(T0 + 70 * MIN, POTENTIAL, 'Plane of Fear', 'Dread'),
    loot(T0 + 100 * MIN, POTENTIAL, 'Plane of Fear', 'Fright')
  ]
  const out = moteFarming({ events, zones: twoZones() })

  assert.deepEqual(out.zones.map((z) => z.zone), ['Plane of Fear', 'The Hole'])

  const fear = out.zones[0]
  const hole = out.zones[1]
  assert.equal(fear.motes, 2)
  assert.equal(hole.motes, 6)
  assert.equal(fear.exp, 2 * expOf(POTENTIAL))
  assert.equal(hole.exp, 6 * expOf(INFINITESIMAL))
  // One active hour each, so the per-hour figures ARE the totals.
  assert.equal(fear.activeMs, HOUR)
  assert.equal(hole.activeMs, HOUR)
  assert.equal(fear.expPerHourActive?.toFixed(2), '8.00')
  assert.equal(hole.expPerHourActive?.toFixed(2), '6.00')
  assert.equal(fear.motesPerHourActive?.toFixed(2), '2.00')
  assert.equal(hole.motesPerHourActive?.toFixed(2), '6.00')

  // …and the inversion, stated as the identity it is: whichever way you rank, the answers differ.
  const byExp = [...out.zones].sort((a, b) => (b.expPerHourActive ?? 0) - (a.expPerHourActive ?? 0))
  const byCount = [...out.zones].sort((a, b) => (b.motesPerHourActive ?? 0) - (a.motesPerHourActive ?? 0))
  assert.notEqual(byExp[0].key, byCount[0].key, 'the fixture must actually invert, or this proves nothing')
  assert.equal(out.zones[0].key, byExp[0].key, 'the module ranks on exp')
})

/**
 * IDLE TIME IS NOT IN THE DENOMINATOR — inherited from `rangeStats`, asserted here because a mote
 * rate is the number a player will act on. Two wall hours in one zone of which one is silence: the
 * rate is measured over the hour that was played.
 */
test('MF: the denominator is ACTIVE time, so an idle hour never halves the farming rate', () => {
  const snap = emptySnap()
  addZone(snap, T0, 'The Hole')
  keepBusy(snap, T0, T0 + HOUR)
  snap.lastTs = T0 + 2 * HOUR

  const zones = zonesOf(snap, T0, T0 + 2 * HOUR)
  assert.equal(zones[0].spanMs, 2 * HOUR)
  assert.equal(zones[0].activeMs, HOUR, 'rangeStats already carved the silence out')

  const out = moteFarming({
    events: [
      loot(T0 + 10 * MIN, MAJOR, 'The Hole', 'Master Yael'),
      loot(T0 + 40 * MIN, LESSER, 'The Hole', 'Master Yael')
    ],
    zones
  })
  const row = out.zones[0]
  assert.equal(row.spanMs, 2 * HOUR)
  assert.equal(row.activeMs, HOUR)
  assert.equal(row.exp, expOf(MAJOR) + expOf(LESSER))
  assert.equal(row.expPerHourActive, row.exp, 'one active hour ⇒ the rate is the total')
})

// ── 2. UNKNOWN IS NOT ZERO ──────────────────────────────────────────────────────────────────

/**
 * A ZONE WITH NO ACTIVE TIME STATES NO RATE. This is a real state, not a bug: the analytics zone
 * column is capped drop-oldest, so a drop older than the window keeps its own timestamp and loses
 * its span. The count stays true and both rates are null — never 0.00, which would be a
 * measurement nobody made.
 */
test('MF: no active time ⇒ NULL rates and true counts, never 0.00', () => {
  const out = moteFarming({
    events: [
      loot(T0, MAJOR, 'Solusek B', 'Master Yael'),
      loot(T0 + MIN, POTENTIAL, 'Solusek B', 'Master Yael')
    ],
    zones: []
  })
  assert.equal(out.zones.length, 1)
  const row = out.zones[0]
  assert.equal(row.motes, 2, 'the count is still a fact')
  assert.equal(row.exp, expOf(MAJOR) + expOf(POTENTIAL), 'and so is the exp')
  assert.equal(row.activeMs, 0)
  assert.equal(row.spanMs, 0)
  assert.equal(row.expPerHourActive, null)
  assert.equal(row.motesPerHourActive, null)
})

/**
 * AND IT SORTS LAST. An unmeasured zone is not a zone measured at zero, so it must not be ranked
 * against measured ones as though its rate were 0 — but it must not outrank them either. Here the
 * span-less zone has the FATTEST haul (two Majors) and still sits below the modest measured one.
 */
test('MF: an unmeasurable zone sorts BELOW every measured one, whatever its haul', () => {
  const snap = emptySnap()
  addZone(snap, T0, 'The Hole')
  keepBusy(snap, T0, T0 + HOUR)
  snap.lastTs = T0 + HOUR

  const out = moteFarming({
    events: [
      loot(T0 + 10 * MIN, INFINITESIMAL, 'The Hole', 'a bleeder'),
      // Stamped inside the range but in a zone the range has no span for.
      loot(T0 + 20 * MIN, MAJOR, 'Plane of Fear', 'Cazic-Thule'),
      loot(T0 + 30 * MIN, MAJOR, 'Plane of Fear', 'Cazic-Thule')
    ],
    zones: zonesOf(snap, T0, T0 + HOUR)
  })
  assert.deepEqual(out.zones.map((z) => z.zone), ['The Hole', 'Plane of Fear'])
  assert.ok((out.zones[0].expPerHourActive ?? 0) > 0)
  assert.equal(out.zones[1].expPerHourActive, null)
  assert.ok(out.zones[1].exp > out.zones[0].exp, 'the unmeasured zone genuinely has more exp in it')
})

// ── 3. VOID-TOUCHED IS COUNTED, NEVER PRICED ────────────────────────────────────────────────

/**
 * `Void-Touched Potential` gives NO experience and instead raises a tier outright (motes.ts). It
 * is therefore reported in its own column everywhere and pooled into `exp` nowhere — not as a
 * guessed value, and not as a zero either, because a zero inside an exp sum is indistinguishable
 * from "we know it is worth nothing".
 */
test('MF: Void-Touched is counted separately and enters no exp figure anywhere', () => {
  const out = moteFarming({
    events: [
      loot(T0 + 65 * MIN, LESSER, 'Plane of Fear', 'Dread'),
      loot(T0 + 66 * MIN, VOID, 'Plane of Fear', 'Dread'),
      loot(T0 + 67 * MIN, VOID, 'Plane of Fear', 'Dread')
    ],
    zones: twoZones()
  })
  const zone = out.zones[0]
  assert.equal(zone.motes, 1, 'Void-Touched is not a laddered mote')
  assert.equal(zone.voidTouched, 2)
  assert.equal(zone.exp, expOf(LESSER))
  assert.equal(zone.events, 3, 'but all three lines are loot lines')

  const src = out.sources[0]
  assert.equal(src.source, 'Dread')
  assert.equal(src.motes, 1)
  assert.equal(src.voidTouched, 2)
  assert.equal(src.exp, expOf(LESSER))

  assert.equal(out.totalVoidTouched, 2)
  assert.equal(out.totalMotes, 1)
  assert.equal(out.totalExp, expOf(LESSER))
  // And it never appears as an eleventh rung.
  assert.equal(out.ladder.length, MOTE_LADDER.length)
  assert.equal(out.ladder.reduce((n, r) => n + r.count, 0), out.totalMotes)
})

/** A zone whose ONLY mote drop is a Void-Touched still gets a row — its counts are real, and its
 *  exp is honestly zero because nothing priceable dropped there. */
test('MF: a zone that produced only Void-Touched still has a row, with zero exp', () => {
  const out = moteFarming({
    events: [loot(T0 + 70 * MIN, VOID, 'Plane of Fear', 'Innoruuk')],
    zones: twoZones()
  })
  assert.equal(out.zones.length, 1)
  assert.equal(out.zones[0].zone, 'Plane of Fear')
  assert.equal(out.zones[0].voidTouched, 1)
  assert.equal(out.zones[0].motes, 0)
  assert.equal(out.zones[0].exp, 0)
  assert.equal(out.zones[0].activeMs, HOUR, 'the denominator is still the zone’s own active time')
  assert.equal(out.zones[0].expPerHourActive, 0, 'a measured zero over real active time IS zero')
})

// ── 4. THE RAID-TARGET JOIN, AND THE TENDENCY ───────────────────────────────────────────────

/** Three rows shaped like `renderer/src/data/eqlegends/bosses.json`. `Cazic Thule` carries both
 *  spellings the real roster carries, which is what makes the join worth testing. */
const ROSTER: RaidTargetLike[] = [
  { name: 'Master Yael', match: ['Master Yael'] },
  { name: 'Cazic Thule', match: ['Cazic Thule', 'Cazic-Thule'] },
  { name: 'Bazzt Zzzt', match: ['Bazzt Zzzt'] }
]

test('MF: a source resolves to its roster target through any of its match names', () => {
  const out = moteFarming({
    events: [
      loot(T0 + 5 * MIN, MAJOR, 'The Hole', 'Master Yael'),
      loot(T0 + 6 * MIN, POTENTIAL, 'The Hole', 'Cazic-Thule'),
      loot(T0 + 7 * MIN, INFINITESIMAL, 'The Hole', 'a decaying skeleton')
    ],
    zones: twoZones(),
    raidTargets: ROSTER
  })
  const by = new Map(out.sources.map((s) => [s.source, s.raidTarget]))
  assert.equal(by.get('Master Yael'), 'Master Yael')
  assert.equal(by.get('Cazic-Thule'), 'Cazic Thule', 'the alternate spelling resolves to the display name')
  assert.equal(by.get('a decaying skeleton'), null, 'an ordinary mob is not marked')
})

/**
 * THE ARTICLE FOLD. EQ writes the same mob with and without a leading article depending on where
 * in a sentence it lands, so the join has to be article-insensitive on both sides — the same rule
 * `bossStatus.ts` runs its kill join on.
 */
test('MF: the raid-target join is article-insensitive, and so is the source fold', () => {
  const out = moteFarming({
    events: [
      loot(T0 + 5 * MIN, INFINITESIMAL, 'The Hole', 'A decaying skeleton'),
      loot(T0 + 6 * MIN, INFINITESIMAL, 'The Hole', 'a decaying skeleton')
    ],
    zones: twoZones(),
    raidTargets: [{ name: 'Decaying Skeleton', match: ['Decaying Skeleton'] }]
  })
  assert.equal(out.sources.length, 1, 'two article variants are one mob')
  assert.equal(out.sources[0].motes, 2)
  assert.equal(out.sources[0].raidTarget, 'Decaying Skeleton')
})

test('MF: no roster handed in ⇒ every raidTarget is null (never a wrong marker)', () => {
  const out = moteFarming({
    events: [loot(T0 + 5 * MIN, MAJOR, 'The Hole', 'Master Yael')],
    zones: twoZones()
  })
  assert.equal(out.sources[0].raidTarget, null)
  assert.equal(out.tendency.highFromRaid, 0)
})

/**
 * THE TENDENCY IS REPORTED WITH ITS COUNTER-EXAMPLE.
 *
 * The shape of the owner's real 20-drop log, in miniature: two raid targets drop ladder-3-or-better
 * and an ordinary mob drops Infinitesimals — AND `Bazzt Zzzt`, a raid target, drops an
 * Infinitesimal too. The module must report both halves. A `counterExamples` that came back empty
 * here would mean a surface could truthfully print "raid targets drop the good ones" as a rule,
 * which the data does not support.
 */
test('MF: the raid-target pattern is reported WITH the raid target that refutes it', () => {
  const out = moteFarming({
    events: [
      loot(T0 + 5 * MIN, MAJOR, 'The Hole', 'Master Yael'),
      loot(T0 + 6 * MIN, POTENTIAL, 'The Hole', 'Cazic-Thule'),
      loot(T0 + 7 * MIN, INFINITESIMAL, 'The Hole', 'a decaying skeleton'),
      loot(T0 + 8 * MIN, INFINITESIMAL, 'The Hole', 'Bazzt Zzzt')
    ],
    zones: twoZones(),
    raidTargets: ROSTER
  })
  const t = out.tendency
  assert.equal(t.ladderFloor, TENDENCY_LADDER)
  assert.equal(t.highDrops, 2)
  assert.equal(t.highFromRaid, 2, 'every ladder-3-or-better drop here came from a raid target')
  assert.deepEqual(t.highSources, ['Cazic-Thule', 'Master Yael'])
  assert.deepEqual(t.highNonRaidSources, [])
  assert.equal(t.lowFromRaid, 1)
  assert.deepEqual(t.counterExamples, ['Bazzt Zzzt'], 'the exception is named, not swallowed')

  // The floor is the ladder's own, so the sentence and the filter cannot drift.
  assert.equal(moteOf(LESSER)?.ladder, TENDENCY_LADDER)
})

/** A drop whose line named no corpse cannot support or refute a claim about mobs, so it is in no
 *  source row and in no tendency count — while still being a perfectly good zone drop. */
test('MF: a source-less drop is a zone row and nothing else', () => {
  const out = moteFarming({
    events: [loot(T0 + 5 * MIN, MAJOR, 'The Hole')],
    zones: twoZones(),
    raidTargets: ROSTER
  })
  assert.equal(out.zones[0].motes, 1)
  assert.deepEqual(out.sources, [])
  assert.equal(out.tendency.highDrops, 0)
  assert.equal(out.totalMotes, 1, 'it still counts toward what you have seen')
})

// ── 5. A DROP IS A STACK ────────────────────────────────────────────────────────────────────

/**
 * `--You have looted 3 Motes of Lesser Potential…--` is THREE motes and six exp, from ONE line.
 * The same quantity the loot ledger's group counts state, so "6 exp of Lesser" means one thing
 * across the app.
 */
test('MF: a stacked loot line counts its size, in motes and in exp', () => {
  const out = moteFarming({
    events: [stack(3, loot(T0 + 5 * MIN, LESSER, 'The Hole', 'Master Yael'))],
    zones: twoZones()
  })
  assert.equal(out.zones[0].motes, 3)
  assert.equal(out.zones[0].events, 1, 'one LINE')
  assert.equal(out.zones[0].exp, 3 * expOf(LESSER))
  assert.equal(out.sources[0].motes, 3)
  assert.equal(out.sources[0].events, 1)
  assert.equal(out.totalMotes, 3)
  assert.equal(out.totalEvents, 1)

  const rung = out.ladder.find((r) => r.mote.key === moteOf(LESSER)?.key)
  assert.ok(rung)
  assert.equal(rung.count, 3)
  assert.equal(rung.events, 1)
  assert.equal(rung.exp, 3 * expOf(LESSER))
})

// ── 6. ONE DENOMINATOR, NOT TWO ─────────────────────────────────────────────────────────────

/**
 * THE COUNT RATE MUST BE `lootRates`' OWN ANSWER. This module divides mote exp by the SAME
 * `activeMs` `itemZoneRows` handed it, so its motes/hour has to equal, row for row, what
 * `itemZoneRows` prints for the same events. If it ever does not, there are two zone joins in the
 * app and one of them is wrong.
 */
test('MF: motes/hour equals what lootRates itself would print for the same drops', () => {
  const events = [
    loot(T0 + 5 * MIN, INFINITESIMAL, 'The Hole', 'a bleeder'),
    stack(2, loot(T0 + 15 * MIN, LESSER, 'The Hole', 'Master Yael')),
    loot(T0 + 70 * MIN, POTENTIAL, 'Plane of Fear', 'Dread'),
    loot(T0 + 80 * MIN, VOID, 'Plane of Fear', 'Innoruuk')
  ]
  const zones = twoZones()
  const out = moteFarming({ events, zones })
  // lootRates' own answer over the LADDERED motes only — Void-Touched is not one.
  const reference = itemZoneRows({ events: events.filter((e) => moteOf(e.item)), zones })
  const byKey = new Map(reference.map((r) => [r.key, r]))
  for (const z of out.zones) {
    const ref = byKey.get(z.key)
    assert.ok(ref, `${z.zone} has no lootRates row`)
    assert.equal(z.motes, ref.drops)
    assert.equal(z.activeMs, ref.activeMs)
    assert.equal(z.spanMs, ref.spanMs)
    assert.equal(z.motesPerHourActive, ref.dropsPerHourActive)
  }
})

/**
 * THE ZONE FOLD IS `rangeStats`' OWN (`zoneIdKey`), so a differently-cased loot line lands on the
 * zone row that carries its span rather than opening a second, span-less one.
 */
test('MF: a differently-cased zone name joins the SAME row, with its span', () => {
  const out = moteFarming({
    events: [
      loot(T0 + 5 * MIN, LESSER, 'THE HOLE', 'Master Yael'),
      loot(T0 + 15 * MIN, LESSER, 'the hole', 'Master Yael')
    ],
    zones: twoZones()
  })
  assert.equal(out.zones.length, 1)
  assert.equal(out.zones[0].zone, 'The Hole', 'the zone row’s first-seen spelling wins')
  assert.equal(out.zones[0].motes, 2)
  assert.equal(out.zones[0].activeMs, HOUR)
})

/**
 * A d0 CAMP AND ITS d2 INSTANCE ARE NOT THE SAME FARM. EQ Legends puts the instance difficulty in
 * the zone NAME, and `zoneIdKey` folds the whole name — so the two are separate rows by
 * construction, each with its own active time. A fold that stripped the suffix (the renderer's
 * catalog-facing `zoneKey` does) would average a hard camp into its easy namesake.
 */
test('MF: an instance tier is its own farm — the d0 and the (Adaptive) zone do not pool', () => {
  const snap = emptySnap()
  addZone(snap, T0, 'Najena')
  addZone(snap, T0 + HOUR, 'Najena 2 (Adaptive)')
  keepBusy(snap, T0, T0 + 2 * HOUR)
  snap.lastTs = T0 + 2 * HOUR

  const out = moteFarming({
    events: [
      loot(T0 + 10 * MIN, INFINITESIMAL, 'Najena', 'a bleeder'),
      loot(T0 + 70 * MIN, MAJOR, 'Najena 2 (Adaptive)', 'a bleeder')
    ],
    zones: zonesOf(snap, T0, T0 + 2 * HOUR)
  })
  assert.equal(out.zones.length, 2)
  assert.deepEqual(out.zones.map((z) => z.zone), ['Najena 2 (Adaptive)', 'Najena'])
  assert.equal(out.zones[0].exp, expOf(MAJOR))
  assert.equal(out.zones[1].exp, expOf(INFINITESIMAL))
})

/** A drop before any zone line joins the `unknown` row — the same stretch `zoneSegments` already
 *  files under that name, so count and denominator agree by construction. */
test('MF: a zone-less drop lands on the same `unknown` row the range already files', () => {
  const snap = emptySnap()
  keepBusy(snap, T0, T0 + HOUR)
  addZone(snap, T0 + 30 * MIN, 'The Hole')
  snap.lastTs = T0 + HOUR

  const out = moteFarming({
    events: [loot(T0 + 10 * MIN, POTENTIAL, undefined, 'a bleeder')],
    zones: zonesOf(snap, T0, T0 + HOUR)
  })
  assert.equal(out.zones[0].zone, 'unknown')
  assert.equal(out.zones[0].activeMs, 30 * MIN)
  assert.equal(out.zones[0].expPerHourActive?.toFixed(2), (expOf(POTENTIAL) * 2).toFixed(2))
})

// ── INVARIANTS OVER THE WHOLE ANSWER ────────────────────────────────────────────────────────

/** The ladder roll-up is ALL TEN rungs, always, in order — an unseen rung is the most informative
 *  cell on the chart ("nothing above Major has ever dropped for me"). */
test('MF: the ladder roll-up is all ten rungs in order, seen or not', () => {
  const out = moteFarming({ events: [loot(T0, MAJOR, 'The Hole', 'Master Yael')], zones: twoZones() })
  assert.deepEqual(out.ladder.map((r) => r.mote.ladder), MOTE_LADDER.map((m) => m.ladder))
  assert.equal(out.ladder.filter((r) => r.count > 0).length, 1)
  for (const r of out.ladder) assert.equal(r.exp, r.count * r.mote.exp, r.mote.name)
})

/**
 * THE Σ IDENTITIES, which are what survive the live log growing: every total is the sum of the
 * rows it summarises, whichever way you slice the same drops.
 */
test('MF: totals are the sum of the rows — zones, sources and rungs all agree', () => {
  const events = [
    stack(4, loot(T0 + 5 * MIN, INFINITESIMAL, 'The Hole', 'a bleeder')),
    loot(T0 + 15 * MIN, LESSER, 'The Hole', 'Master Yael'),
    stack(2, loot(T0 + 70 * MIN, POTENTIAL, 'Plane of Fear', 'Dread')),
    loot(T0 + 80 * MIN, MAJOR, 'Plane of Fear', 'Innoruuk'),
    loot(T0 + 90 * MIN, VOID, 'Plane of Fear', 'Innoruuk'),
    // Ordinary loot, which must be invisible to every fold here.
    stack(5, loot(T0 + 95 * MIN, 'Bone Chips', 'Plane of Fear', 'a bleeder'))
  ]
  const out = moteFarming({ events, zones: twoZones(), raidTargets: ROSTER })

  const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0)
  assert.equal(sum(out.zones.map((z) => z.motes)), out.totalMotes)
  assert.equal(sum(out.zones.map((z) => z.exp)), out.totalExp)
  assert.equal(sum(out.zones.map((z) => z.voidTouched)), out.totalVoidTouched)
  assert.equal(sum(out.zones.map((z) => z.events)), out.totalEvents)
  assert.equal(sum(out.sources.map((s) => s.motes)), out.totalMotes)
  assert.equal(sum(out.sources.map((s) => s.exp)), out.totalExp)
  assert.equal(sum(out.ladder.map((r) => r.count)), out.totalMotes)
  assert.equal(sum(out.ladder.map((r) => r.exp)), out.totalExp)
  assert.equal(out.totalMotes, 4 + 1 + 2 + 1)
  assert.equal(out.totalVoidTouched, 1)

  // Each row's own histogram is that row's own count and exp, too.
  for (const z of out.zones) {
    assert.equal(sum(z.tiers.map((t) => t.count)), z.motes, z.zone)
    assert.equal(sum(z.tiers.map((t) => t.exp)), z.exp, z.zone)
  }
  for (const s of out.sources) {
    assert.equal(sum(s.tiers.map((t) => t.count)), s.motes, s.source)
    assert.equal(sum(s.tiers.map((t) => t.exp)), s.exp, s.source)
  }
})

/** No motes at all is a first-class state: no rows, no NaN, and a tendency with nothing in it. */
test('MF: a history with no motes yields empty rows and zero totals, never NaN', () => {
  const out = moteFarming({
    events: [stack(5, loot(T0, 'Bone Chips', 'The Hole', 'a bleeder'))],
    zones: twoZones(),
    raidTargets: ROSTER
  })
  assert.deepEqual(out.zones, [])
  assert.deepEqual(out.sources, [])
  assert.equal(out.totalMotes, 0)
  assert.equal(out.totalExp, 0)
  assert.equal(out.totalEvents, 0)
  assert.equal(out.ladder.length, MOTE_LADDER.length)
  assert.deepEqual(out.tendency.counterExamples, [])
})

/** A total order: identical hauls must not swap places between renders. */
test('MF: ties break deterministically — the ordering is stable across calls', () => {
  const events = [
    loot(T0 + 5 * MIN, LESSER, 'The Hole', 'Master Yael'),
    loot(T0 + 70 * MIN, LESSER, 'Plane of Fear', 'Dread')
  ]
  const zones = twoZones()
  const order = (): string[] => moteFarming({ events, zones }).zones.map((z) => z.zone)
  assert.deepEqual(order(), order())
  assert.deepEqual(order(), ['Plane of Fear', 'The Hole'], 'equal rates ⇒ alphabetical')
})
