// THE OFFENSE LEDGER — your damage to each mob, filed under the stance you were wearing.
//
// Same two-half shape as tests/stanceLedger.test.mts, and for the same reasons.
//
//   HALF ONE, SYNTHETIC: the keying, the bucket split and the bound are RULES this repo invented.
//   No log line states them, so a fixture could only demonstrate them by accident.
//
//   HALF TWO, REAL BYTES: whether the ledger is FED correctly is answered against the log, by
//   replaying a committed fixture through the REAL engine. What is asserted there is an IDENTITY,
//   never a frozen number (frozen numbers rot when a fixture is re-cut): the ledger folds on the
//   same `out-you` verdict `route()` acts on, so
//
//       Σ every sample of every offense target  ==  the meter's own 'You' row total
//
//   must hold for any window, forever. That is the whole claim that the DPS half of the stance
//   advisor is measuring the same damage the meter shows, and it is what would catch the ledger
//   quietly counting a pet's swings as yours.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFixture } from './harness.mts'
import { parseEvent } from '../src/main/log/parser'
import { idKey } from '../src/main/log/parseCommon'
import { CombatEngine } from '../src/main/combat/engine'
import { STANCE_TARGET_CAP } from '../src/main/combat/stanceLedger'
import { StanceOffenseLedger, observedProfile, outgoingBucketOf } from '../src/main/combat/stanceOffenseLedger'
import type { StanceOffenseHit } from '../src/main/combat/stanceOffenseLedger'
import type { OffenseProfile } from '../src/shared/stanceOffense'

const W44 = 'w44-poison-slow-per-mob.log'

/** A hit of yours with sensible defaults, so each test states only the field it is about. */
function hit(over: Partial<StanceOffenseHit> = {}): StanceOffenseHit {
  return {
    mobName: 'a fetid fiend',
    zone: 'The Plane of Fear',
    stance: 'offensive',
    dtype: 'melee',
    amount: 10,
    ts: 1_000,
    ...over
  }
}

function only(led: StanceOffenseLedger): OffenseProfile {
  const t = led.targets()
  assert.equal(t.length, 1, `expected one row, got ${t.map((x) => x.mobKey).join(', ')}`)
  return t[0]
}

function sample(t: OffenseProfile, stanceKey: string): { melee: number; spell: number; hits: number } {
  const s = t.samples.find((x) => x.stanceKey === stanceKey)
  assert.ok(s, `no sample for '${stanceKey}' (have: ${t.samples.map((x) => x.stanceKey).join(', ')})`)
  return s
}

// ── 1. THE BUCKET SPLIT ─────────────────────────────────────────────────────────────────────

test('offense: melee is its own bucket; spell, dot and ds are the other', () => {
  // The boundary the live-log experiment found (shared/stanceOffense.ts): melee verbs double in
  // Offensive, everything named-by-a-spell is flat. This pins the mapping, so a silent change to
  // it fails here instead of quietly re-ranking every stance.
  assert.equal(outgoingBucketOf('melee'), 'melee')
  assert.equal(outgoingBucketOf('spell'), 'spell')
  assert.equal(outgoingBucketOf('dot'), 'spell')
  assert.equal(outgoingBucketOf('ds'), 'spell')

  const led = new StanceOffenseLedger()
  led.note(hit({ dtype: 'melee', amount: 100 }))
  led.note(hit({ dtype: 'spell', amount: 10 }))
  led.note(hit({ dtype: 'dot', amount: 5 }))
  led.note(hit({ dtype: 'ds', amount: 1 }))
  assert.deepEqual(sample(only(led), 'offensive'), { stanceKey: 'offensive', melee: 100, spell: 16, hits: 4 })
})

test('offense: a zero or negative amount is not a hit', () => {
  // route() refuses `amount <= 0` before anything aggregates; the ledger must agree or its hit
  // COUNT drifts from the meter's while its damage total still matches.
  const led = new StanceOffenseLedger()
  led.note(hit({ amount: 0 }))
  led.note(hit({ amount: -5 }))
  assert.deepEqual(led.targets(), [])
})

// ── 2. THE KEY, AND THE JOIN WITH THE INCOMING LEDGER ───────────────────────────────────────

test('offense: the key is (mob, zone, tier) and it JOINS the incoming ledger byte for byte', () => {
  // The two ledgers are paired by this string by every surface that shows both answers for one
  // mob, so the composite must be built identically. Law 2: canonical key, raw display.
  const led = new StanceOffenseLedger()
  const key = led.note(hit({ mobName: 'A Fetid Fiend' }))
  assert.equal(key, `${idKey('a fetid fiend')}|The Plane of Fear|0`)
  led.note(hit({ mobName: 'a fetid fiend' }))
  const t = only(led)
  assert.equal(t.mobName, 'A Fetid Fiend', 'display name is the FIRST spelling seen')
  assert.equal(sample(t, 'offensive').hits, 2)
  assert.ok(led.targetByKey(key), 'the returned key reads the row back')
})

test('offense: two tiers of one zone never pool, and a zone-less hit is its own bucket', () => {
  const led = new StanceOffenseLedger()
  led.note(hit({ zone: 'The Plane of Fear - Solo 1 (Awakened)' }))
  led.note(hit({ zone: 'The Plane of Fear - Solo 2 (Adaptive)' }))
  led.note(hit({ zone: undefined }))
  const rows = led.targets()
  assert.equal(rows.length, 3)
  assert.deepEqual(
    rows.map((r) => `${r.zoneBase}|${String(r.tier)}`).sort(),
    ['The Plane of Fear|1', 'The Plane of Fear|2', '|0']
  )
})

// ── 3. THE STANCE DIMENSION — the reason this ledger exists at all ──────────────────────────

test('offense: one sample per stance worn, so the readings stay un-scalable apart', () => {
  // The whole point. 2,000 melee measured in Offensive is 1,000 of baseline; pooling it with
  // Defensive's would bake the bias in permanently and Offensive would then be compared against a
  // baseline that already contains it.
  const led = new StanceOffenseLedger()
  led.note(hit({ stance: 'offensive', amount: 200 }))
  led.note(hit({ stance: 'defensive', amount: 100 }))
  led.note(hit({ stance: undefined, amount: 50 }))
  led.note(hit({ stance: 'OFFENSIVE', amount: 200 }))
  const t = only(led)
  assert.equal(t.samples.length, 3)
  assert.equal(sample(t, 'offensive').melee, 400, 'the key is lowercased, so casing cannot split a bucket')
  assert.equal(sample(t, 'defensive').melee, 100)
  assert.equal(sample(t, '').melee, 50, '"never committed" is a real bucket, not a dropped hit')
})

test('offense: biggestHit and lastSeenTs are observed facts, and targets() is a COPY', () => {
  const led = new StanceOffenseLedger()
  led.note(hit({ mobName: 'an old one', amount: 40, ts: 1_000 }))
  led.note(hit({ mobName: 'a fresh one', amount: 120, ts: 9_000 }))
  led.note(hit({ mobName: 'a fresh one', amount: 30, ts: 7_000 }))
  const rows = led.targets()
  assert.deepEqual(rows.map((r) => r.mobName), ['a fresh one', 'an old one'], 'most-recent first')
  assert.equal(rows[0].biggestHit, 120)
  assert.equal(rows[0].lastSeenTs, 9_000, 'an out-of-order ts cannot walk it backwards')
  rows[0].samples[0].melee = 99_999
  assert.equal(led.targets()[0].samples[0].melee, 150, 'the projection is not a handle on engine state')
})

test('offense: observedProfile sums the raw buckets, un-corrected', () => {
  // Deliberately the BIASED sum: un-scaling is the shared layer's job, and a ledger that had
  // already applied the multipliers could never be re-pooled under a re-measured one.
  const led = new StanceOffenseLedger()
  led.note(hit({ stance: 'offensive', dtype: 'melee', amount: 200 }))
  led.note(hit({ stance: 'defensive', dtype: 'spell', amount: 60 }))
  assert.deepEqual(observedProfile(only(led).samples), { melee: 200, spell: 60 })
  assert.deepEqual(observedProfile([]), { melee: 0, spell: 0 })
})

// ── 4. THE BOUND ────────────────────────────────────────────────────────────────────────────

test('offense: the cap holds and evicts the least-recently-hit row', () => {
  // Shares STANCE_TARGET_CAP with the incoming ledger, so the two bounds cannot drift apart.
  const led = new StanceOffenseLedger()
  led.note(hit({ mobName: 'veteran', ts: 1_000 }))
  for (let i = 0; i < STANCE_TARGET_CAP + 50; i++) {
    led.note(hit({ mobName: `filler ${i}`, ts: 2_000 + i }))
    led.note(hit({ mobName: 'veteran', ts: 100_000 + i }))
  }
  assert.equal(led.size, STANCE_TARGET_CAP)
  const rows = led.targets()
  assert.ok(rows.some((r) => r.mobKey === 'veteran'), 'the row still being hit survived')
  assert.ok(!rows.some((r) => r.mobKey === 'filler 0'), 'the coldest row was dropped')
  led.reset()
  assert.equal(led.size, 0)
})

// ── 5. THE REAL WINDOW: the identity against the engine's own 'You' row ─────────────────────

interface Replayed {
  offense: OffenseProfile[]
  /** the meter's own total for the 'You' row in the zone aggregate */
  youTotal: number
  /** the meter's own hit count for the 'You' row */
  youHits: number
  stancesPrinted: Set<string>
}

function replay(fixture: string): Replayed {
  const eng = new CombatEngine()
  eng.setPlayerName('Primitive')
  let seq = 0
  let lastTs = 0
  const stancesPrinted = new Set<string>()
  for (const raw of readFixture(fixture)) {
    const ev = parseEvent(raw, seq++)
    if (!ev) continue
    if (ev.kind === 'stanceChange') stancesPrinted.add(ev.stance.toLowerCase())
    eng.ingestEvent(ev, false)
    lastTs = ev.ts
  }
  const snap = eng.snapshot(lastTs + 120_000, { selectedId: 'zone' })
  const seg = snap.selected
  assert.ok(seg, `${fixture}: no zone aggregate`)
  const you = seg.entities.find((e) => e.id === 'you')
  assert.ok(you, `${fixture}: the meter has no 'You' row`)
  let youHits = 0
  for (const c of you.categories) youHits += c.hits
  return { offense: eng.stanceOffenseTargets(), youTotal: you.total, youHits, stancesPrinted }
}

/** Every point of damage a target's samples hold. */
function profileTotal(t: OffenseProfile): number {
  return t.samples.reduce((s, x) => s + x.melee + x.spell, 0)
}

test('offense ledger vs engine: the sums are the SAME damage, to the point', () => {
  const r = replay(W44)
  assert.ok(r.offense.length > 0, 'the window must produce outgoing targets at all')
  const total = r.offense.reduce((s, t) => s + profileTotal(t), 0)
  const hits = r.offense.reduce((s, t) => s + t.samples.reduce((h, x) => h + x.hits, 0), 0)
  // THE IDENTITY. Not a frozen figure: whatever this window is worth, the ledger and the meter's
  // own 'You' row must agree about it — which is exactly what would fail if the ledger ever
  // admitted a pet's swing (a `pet:` row on the meter) or a group member's.
  assert.equal(total, r.youTotal)
  assert.equal(hits, r.youHits)
})

test('offense ledger vs engine: no row appears twice, and every key is canonical', () => {
  const r = replay(W44)
  const seen = new Set<string>()
  for (const t of r.offense) {
    const key = `${t.mobKey}|${t.zoneBase}|${String(t.tier)}`
    assert.ok(!seen.has(key), `duplicate offense row ${key}`)
    seen.add(key)
    assert.equal(t.mobKey, idKey(t.mobName), 'the key is the display name, canonicalized (law 2)')
    assert.ok(t.biggestHit > 0, `${t.mobKey}: a row with hits has a biggest one`)
    assert.ok(t.lastSeenTs > 0, `${t.mobKey}: every row is stamped`)
    assert.ok(profileTotal(t) >= t.biggestHit, `${t.mobKey}: one hit cannot exceed the total`)
  }
})

test('offense ledger vs engine: your damage really is split by the stance in effect', () => {
  const r = replay(W44)
  // This window commits three stances mid-flight and deals damage before the first of them, so
  // more than one bucket must exist — the feature working end to end, not a keying accident.
  const keys = new Set<string>()
  for (const t of r.offense) for (const s of t.samples) keys.add(s.stanceKey)
  assert.ok(keys.size > 1, `expected several stance buckets, got ${[...keys].join(', ') || '(none)'}`)
  for (const k of keys) {
    assert.ok(k === '' || r.stancesPrinted.has(k), `stance bucket '${k}' was never committed in the window`)
  }
})
