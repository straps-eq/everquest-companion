// THE STANCE LEDGER — what each mob hits you with, filed under the stance you were wearing.
//
// Two halves, and the split is deliberate.
//
// ── HALF ONE: THE RULES, ON SYNTHETIC HITS ──────────────────────────────────────────────────
//
// The ledger's keying, its physical/magical split and its memory bound are RULES this repo
// invented — no log line states them, so there is no real span that could pin them. A fixture
// would only be able to demonstrate them accidentally, in whatever combination that window
// happens to contain, and could never exercise the cap at all (five hundred rows is far more
// than any window holds). These are the cases where synthetic input is the honest instrument:
// each test states one rule and constructs exactly the hits that rule is about.
//
// ── HALF TWO: THE INVARIANTS, ON REAL BYTES ─────────────────────────────────────────────────
//
// Whether the ledger is FED correctly is a different question, and that one is answered against
// the log: tests/fixtures/w44-poison-slow-per-mob.log (Tue Aug 04 22:30:47 → 22:33:39, already
// committed, cut through the shared scrub) replayed through the REAL engine. It is the densest
// incoming window in the fixture set — 278 melee hits plus 102 second-person DoT ticks from four
// hostile entities — and it changes stance three times mid-window, so it exercises the split
// against damage the engine itself independently totals.
//
// WHAT IS ASSERTED THERE IS AN IDENTITY, NOT A NUMBER. The ledger folds on the same verdict
// `route()` acts on, so "Σ every sample of every target == the incoming total the meter
// reports" must hold for any window, forever; a frozen 23,455 would rot the moment the fixture
// is re-cut (AGENTS.md: frozen numbers rot). Same for the per-mob totals, the key uniqueness and
// the zone keying — each is a statement about the SHAPE of the ledger, re-derived from the
// engine's own answer at test time.
//
// The other half of the IPC payload — which stances the character can actually WEAR — is pinned
// in section 3 against the committed classes.json table.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFixture } from './harness.mts'
import { parseEvent } from '../src/main/log/parser'
import { idKey } from '../src/main/log/parseCommon'
import { CombatEngine } from '../src/main/combat/engine'
import { StanceLedger, STANCE_TARGET_CAP, damageClassOf } from '../src/main/combat/stanceLedger'
import { loadoutClasses, stanceKeysForClasses } from '../src/main/data/stanceLoadout'
import { STANCE_EFFECTS } from '../src/shared/stances'
import type { StanceLedgerHit } from '../src/main/combat/stanceLedger'
import type { TargetProfile } from '../src/shared/stanceAdvice'
import type { ClassAbbr, ComboInterval, ComboSlot } from '../src/shared/classCombo'

const W44 = 'w44-poison-slow-per-mob.log'

/** A hit with sensible defaults, so each test states only the field it is about. */
function hit(over: Partial<StanceLedgerHit> = {}): StanceLedgerHit {
  return {
    mobName: 'a fetid fiend',
    zone: 'The Plane of Fear',
    stance: 'defensive',
    dtype: 'melee',
    amount: 10,
    ts: 1_000,
    ...over
  }
}

/** The one row a test expects the ledger to hold, or a failure naming what it holds instead. */
function only(ledger: StanceLedger): TargetProfile {
  const targets = ledger.targets()
  assert.equal(targets.length, 1, `expected one row, got ${targets.map((t) => t.mobKey).join(', ')}`)
  return targets[0]
}

/** One target's sample for a stance key, or a failure. */
function sample(target: TargetProfile, stanceKey: string): { physical: number; magical: number; hits: number } {
  const s = target.samples.find((x) => x.stanceKey === stanceKey)
  assert.ok(s, `no sample for stance '${stanceKey}' (have: ${target.samples.map((x) => x.stanceKey).join(', ')})`)
  return s
}

// ── 1. THE KEY: (mobKey, zoneBase, tier) ────────────────────────────────────────────────────

test('ledger: the same mob spelled two ways is ONE row, displayed by its first spelling', () => {
  // Law 2: EQ lowercases the article on lifecycle lines and capitalizes it on damage lines, so a
  // case-sensitive key would split every mob in the game into two.
  const led = new StanceLedger()
  led.note(hit({ mobName: 'a fetid fiend', amount: 7 }))
  led.note(hit({ mobName: 'A Fetid Fiend', amount: 3 }))
  const t = only(led)
  assert.equal(t.mobKey, idKey('a fetid fiend'))
  assert.equal(t.mobName, 'a fetid fiend', 'display name is the FIRST spelling seen, never rewritten')
  assert.equal(sample(t, 'defensive').hits, 2)
  assert.equal(sample(t, 'defensive').physical, 10)
})

test('ledger: the same mob in two TIERS of one zone never pools', () => {
  // `The Plane of Fear - Solo 2 (Adaptive)` is d2 and `- Solo 1 (Awakened)` is d1. They are not
  // the same fight; stanceAdvice.ts's header is explicit that pooling them averages two real
  // answers into a wrong one.
  const led = new StanceLedger()
  led.note(hit({ zone: 'The Plane of Fear - Solo 1 (Awakened)' }))
  led.note(hit({ zone: 'The Plane of Fear - Solo 2 (Adaptive)' }))
  const rows = led.targets()
  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map((r) => [r.zoneBase, r.tier]).sort((a, b) => Number(a[1]) - Number(b[1])),
    [
      ['The Plane of Fear', 1],
      ['The Plane of Fear', 2]
    ]
  )
})

test('ledger: instance number and Solo/Group decoration collapse into ONE zone base', () => {
  // The decoded base is what identifies the place: two `- Solo N` instances of Fear at the same
  // difficulty are the same fight, and keying on the raw string would mint a row per instance.
  const led = new StanceLedger()
  led.note(hit({ zone: 'The Plane of Fear - Solo' }))
  led.note(hit({ zone: 'The Plane of Fear - Group 3' }))
  const t = only(led)
  assert.equal(t.zoneBase, 'The Plane of Fear')
  assert.equal(t.tier, 0)
})

test('ledger: a hit with no zone yet lands in the explicit UNKNOWN bucket, never a guess', () => {
  // A replay can begin mid-zone: nothing has printed `You have entered …`. The honest key is the
  // empty base, and a later real zone line must start a NEW row rather than relabel this one.
  const led = new StanceLedger()
  led.note(hit({ zone: undefined }))
  led.note(hit({ zone: 'The Plane of Hate' }))
  const rows = led.targets()
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((r) => r.zoneBase).sort(), ['', 'The Plane of Hate'])
})

// ── 2. THE SPLIT: physical vs magical ───────────────────────────────────────────────────────

test('ledger: melee is physical; spell, dot and ds are magical', () => {
  // The mapping itself (stanceLedger.damageClassOf) is an interpretation of the wiki's two-bucket
  // language and is documented as one. This pins the interpretation so a silent change to it
  // fails here rather than quietly re-ranking every stance.
  assert.equal(damageClassOf('melee'), 'physical')
  assert.equal(damageClassOf('spell'), 'magical')
  assert.equal(damageClassOf('dot'), 'magical')
  assert.equal(damageClassOf('ds'), 'magical')

  const led = new StanceLedger()
  led.note(hit({ dtype: 'melee', amount: 100 }))
  led.note(hit({ dtype: 'spell', amount: 10 }))
  led.note(hit({ dtype: 'dot', amount: 5 }))
  led.note(hit({ dtype: 'ds', amount: 1 }))
  const s = sample(only(led), 'defensive')
  assert.deepEqual(s, { stanceKey: 'defensive', physical: 100, magical: 16, hits: 4 })
})

test('ledger: a zero or negative amount is not a hit', () => {
  // route() refuses `amount <= 0` before anything is aggregated; the ledger must agree, or its
  // hit COUNT would drift from the meter's while its damage total still matched.
  const led = new StanceLedger()
  led.note(hit({ amount: 0 }))
  led.note(hit({ amount: -5 }))
  assert.deepEqual(led.targets(), [])
})

// ── 3. THE STANCE DIMENSION ─────────────────────────────────────────────────────────────────

test('ledger: one target, one sample per stance worn — the readings stay separable', () => {
  // This is the whole reason the ledger exists. The same mob measured inside Defensive and
  // inside Mage Hunter reads as two different mobs; only by keeping the two apart can
  // `pooledProfile` divide each by the multiplier that shrank it.
  const led = new StanceLedger()
  led.note(hit({ stance: 'defensive', dtype: 'melee', amount: 50 }))
  led.note(hit({ stance: 'mage hunter', dtype: 'melee', amount: 80 }))
  led.note(hit({ stance: 'mage hunter', dtype: 'spell', amount: 50 }))
  const t = only(led)
  assert.equal(t.samples.length, 2)
  assert.deepEqual(sample(t, 'defensive'), { stanceKey: 'defensive', physical: 50, magical: 0, hits: 1 })
  assert.deepEqual(sample(t, 'mage hunter'), { stanceKey: 'mage hunter', physical: 80, magical: 50, hits: 2 })
})

test('ledger: the stance key is lowercased, and "never committed" is its own bucket', () => {
  // `StanceSample.stanceKey` documents '' as "no stance was ever committed in this span" — the
  // log may simply predate the session's first commit. It is recorded, not dropped: the damage
  // is real, and the shared layer applies no reduction to an unknown key rather than a guessed one.
  const led = new StanceLedger()
  led.note(hit({ stance: undefined }))
  led.note(hit({ stance: 'Mage Hunter' }))
  const t = only(led)
  assert.deepEqual(t.samples.map((s) => s.stanceKey).sort(), ['', 'mage hunter'])
  assert.ok(STANCE_EFFECTS['mage hunter'], 'the lowercased key must index the shared effect table')
})

// ── 4. THE OBSERVED FACTS: biggest hit, last seen ───────────────────────────────────────────

test('ledger: biggestHit is the largest LANDED hit and lastSeenTs the latest instant', () => {
  // biggestHit is observed, NOT un-mitigated (TargetProfile says so): "the worst it has actually
  // done to me" is a fact about the health bar, and recovering the swing behind it is the advice
  // layer's job. Out-of-order timestamps cannot walk `lastSeenTs` backwards.
  const led = new StanceLedger()
  led.note(hit({ amount: 40, ts: 5_000 }))
  led.note(hit({ amount: 120, ts: 9_000 }))
  led.note(hit({ amount: 30, ts: 7_000 }))
  const t = only(led)
  assert.equal(t.biggestHit, 120)
  assert.equal(t.lastSeenTs, 9_000)
})

test('ledger: targets() is most-recently-hit first, and is a COPY', () => {
  const led = new StanceLedger()
  led.note(hit({ mobName: 'an old one', ts: 1_000 }))
  led.note(hit({ mobName: 'a fresh one', ts: 9_000 }))
  const rows = led.targets()
  assert.deepEqual(rows.map((r) => r.mobName), ['a fresh one', 'an old one'])
  // Mutating the projection must not reach engine state — the panel gets data, not a handle.
  rows[0].samples[0].physical = 99_999
  rows[0].biggestHit = 99_999
  const again = led.targets()
  assert.equal(again[0].samples[0].physical, 10)
  assert.equal(again[0].biggestHit, 10)
})

// ── 5. THE BOUND ────────────────────────────────────────────────────────────────────────────

test('ledger: the cap holds, and it evicts the LEAST-RECENTLY-HIT row', () => {
  // Insertion order would evict the boss you have fought all night — first seen, still being
  // fought — in favour of trash that hit you once an hour ago. `veteran` is inserted first and
  // must survive precisely because it is still being hit.
  const led = new StanceLedger()
  led.note(hit({ mobName: 'veteran', ts: 1_000 }))
  for (let i = 0; i < STANCE_TARGET_CAP + 50; i++) {
    // Each filler is hit once, early, and never again.
    led.note(hit({ mobName: `filler ${i}`, ts: 2_000 + i }))
    // …while the veteran keeps taking hits, so it is never the oldest.
    led.note(hit({ mobName: 'veteran', ts: 100_000 + i }))
  }
  assert.equal(led.size, STANCE_TARGET_CAP, 'the ring is bounded')
  const rows = led.targets()
  assert.equal(rows.length, STANCE_TARGET_CAP)
  const veteran = rows.find((r) => r.mobKey === 'veteran')
  assert.ok(veteran, 'the still-live target survived the eviction sweep')
  assert.equal(veteran.samples[0].hits, STANCE_TARGET_CAP + 51)
  // The evicted rows are the earliest fillers; the newest fillers are still here.
  assert.ok(!rows.some((r) => r.mobKey === 'filler 0'), 'the coldest row was dropped')
  assert.ok(rows.some((r) => r.mobKey === `filler ${STANCE_TARGET_CAP + 49}`), 'the newest row was kept')
})

test('ledger: reset() empties it', () => {
  const led = new StanceLedger()
  led.note(hit())
  led.reset()
  assert.equal(led.size, 0)
  assert.deepEqual(led.targets(), [])
})

// ── 6. THE REAL WINDOW: invariants against the engine's own totals ──────────────────────────

interface Replayed {
  targets: TargetProfile[]
  /** the engine's own incoming total for the whole window (the zone aggregate) */
  inTotal: number
  /** the engine's own incoming hit count, summed over every category of every incoming row */
  inHits: number
  /** the engine's incoming rows, keyed the way the ledger keys them */
  byMob: Map<string, number>
  /** the zone the engine believes it is in at the end of the window */
  zone: string | undefined
  /** every stance the window's own lines committed, lowercase */
  stancesPrinted: Set<string>
}

/** Replay a committed fixture through the REAL engine and read both models out of it. */
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
  // The ZONE aggregate, so nothing depends on which pull a hit landed in — and, because this
  // window contains no zone line, it is the whole window (a zone change would freeze the
  // aggregate into history and the comparison would have to sum the sessions).
  const snap = eng.snapshot(lastTs + 120_000, { selectedId: 'zone' })
  const seg = snap.selected
  assert.ok(seg, `${fixture}: no zone aggregate`)
  const byMob = new Map<string, number>()
  let inHits = 0
  for (const row of seg.incoming) {
    // The meter's row label carries the spawn-generation ` (N)` suffix — display flavor, never
    // identity (law 2) — and it keys by INSTANCE, so two spawns of one name are two rows there
    // and one row here. Stripping and merging is what makes the two comparable.
    const key = idKey(row.name.replace(/\s*\(\d+\)$/, ''))
    byMob.set(key, (byMob.get(key) ?? 0) + row.total)
    for (const c of row.categories) inHits += c.hits
  }
  return { targets: eng.stanceTargets(), inTotal: seg.inTotal, inHits, byMob, zone: snap.zone, stancesPrinted }
}

/** Every point of damage a target's samples hold, physical and magical alike. */
function targetTotal(t: TargetProfile): number {
  return t.samples.reduce((s, x) => s + x.physical + x.magical, 0)
}

test('stance ledger vs engine: the sums are the SAME damage, to the point', () => {
  const r = replay(W44)
  assert.ok(r.targets.length > 0, 'the window must produce targets at all')
  const total = r.targets.reduce((s, t) => s + targetTotal(t), 0)
  const hits = r.targets.reduce((s, t) => s + t.samples.reduce((h, x) => h + x.hits, 0), 0)
  // THE IDENTITY: the ledger folds on the verdict route() acts on, so its admission set is
  // exactly `Agg.addInc`'s. Not a frozen number — whatever this window is worth, both models
  // must say the same thing about it.
  assert.equal(total, r.inTotal)
  assert.equal(hits, r.inHits)
})

test('stance ledger vs engine: every mob agrees, and no target appears twice', () => {
  const r = replay(W44)
  const seen = new Set<string>()
  for (const t of r.targets) {
    const key = `${t.mobKey}|${t.zoneBase}|${t.tier}`
    assert.ok(!seen.has(key), `duplicate target row ${key}`)
    seen.add(key)
    // The display name and the key are the same name, canonicalized (law 2).
    assert.equal(t.mobKey, idKey(t.mobName))
    const fromMeter = r.byMob.get(t.mobKey)
    assert.ok(fromMeter !== undefined, `${t.mobKey} is in the ledger but not in the incoming meter`)
    assert.equal(targetTotal(t), fromMeter, `${t.mobKey}: ledger and meter disagree`)
  }
  // …and nothing the meter counted as incoming is missing from the ledger. `byMob` also holds
  // rows that only ever MISSED or resisted (0 damage, no ledger row), so those are excused.
  for (const [key, total] of r.byMob) {
    if (total > 0) assert.ok(seen.has(`${key}||0`) || [...seen].some((s) => s.startsWith(`${key}|`)), `${key} missing`)
  }
})

test('stance ledger vs engine: the zone key is the engine\'s own zone, decoded', () => {
  const r = replay(W44)
  // Every row must key off the SAME zone the engine believes it is in — this window prints no
  // zone line at all, so that is the explicit unknown bucket, and asserting it against
  // `snapshot().zone` rather than against the literal '' keeps the test true for a re-cut that
  // includes one.
  const expectedBase = r.zone ?? ''
  for (const t of r.targets) {
    assert.ok(expectedBase.startsWith(t.zoneBase), `${t.mobKey}: zoneBase '${t.zoneBase}' is not from '${expectedBase}'`)
    assert.ok(t.tier >= 0 && t.tier <= 4, 'tier is a decoded difficulty, 0..4')
  }
})

test('stance ledger vs engine: the damage really is split by the stance in effect', () => {
  const r = replay(W44)
  // The window commits three stances mid-flight (evasive 22:31:40, defensive 22:32:09, berserker
  // 22:32:41) and takes incoming damage before the first of them, so the ledger must show more
  // than one bucket — that is the feature working end to end, not a keying accident.
  const keys = new Set<string>()
  for (const t of r.targets) for (const s of t.samples) keys.add(s.stanceKey)
  assert.ok(keys.size > 1, `expected several stance buckets, got ${[...keys].join(', ') || '(none)'}`)
  // Every bucket is either a stance this window's own lines committed, or the pre-commit ''.
  for (const k of keys) {
    assert.ok(k === '' || r.stancesPrinted.has(k), `stance bucket '${k}' was never committed in the window`)
  }
  assert.ok(keys.has(''), 'damage landed before the first stance commit and must be filed as such')
})

test('stance ledger vs engine: biggestHit is a real hit inside its own target', () => {
  const r = replay(W44)
  for (const t of r.targets) {
    assert.ok(t.biggestHit > 0, `${t.mobKey}: a target with hits must have a biggest one`)
    assert.ok(t.biggestHit <= targetTotal(t), `${t.mobKey}: one hit cannot exceed the total`)
    assert.ok(t.lastSeenTs > 0, `${t.mobKey}: every row is stamped`)
  }
})

// ── 7. WHICH STANCES THE CHARACTER CAN WEAR ─────────────────────────────────────────────────

/** A combo slot holding exactly these candidates. Confidence/provenance are irrelevant here. */
function slot(...candidates: ClassAbbr[]): ComboSlot {
  return { candidates, confidence: 1, provenance: 'who', because: [] }
}

/** A minimal interval carrying just the slots — the only field this join reads. */
function interval(slots: ComboSlot[]): ComboInterval {
  return {
    id: 'ci0',
    startTs: 0,
    endTs: null,
    startLo: 0,
    startHi: 0,
    endLo: null,
    endHi: null,
    startReason: 'logStart',
    expectedSlots: 3,
    slots,
    levelLo: null,
    levelHi: null,
    evidenceCount: 0,
    userLocked: false
  }
}

test('loadout: a resolved combo offers exactly its classes\' stances', () => {
  // This fork's own character: Monk / Paladin / Enchanter. Read off the committed classes.json
  // stance table — MNK has balanced/evasive/offensive/ranged/striker, PAL adds defensive and
  // mage hunter, ENC adds channeler. Berserker (BER only) must NOT appear.
  const keys = stanceKeysForClasses(['MNK', 'PAL', 'ENC'])
  assert.deepEqual(keys, [
    'balanced',
    'channeler',
    'defensive',
    'evasive',
    'mage hunter',
    'offensive',
    'ranged',
    'striker'
  ])
  assert.ok(!keys.includes('berserker'), 'a stance no slot can wear is never offered')
  // Every key must index the shared effect table, or the advice layer silently drops it.
  for (const k of keys) assert.ok(STANCE_EFFECTS[k], `'${k}' has no StanceEffect`)
})

test('loadout: an AMBIGUOUS slot widens the offer rather than narrowing it', () => {
  // A slot that might be CLR or PAL contributes both. Over-offering costs a wasted row; hiding
  // the right answer exactly when the model is least sure costs the recommendation.
  const resolved = interval([slot('MNK'), slot('PAL')])
  const ambiguous = interval([slot('MNK'), slot('CLR', 'PAL')])
  assert.deepEqual(loadoutClasses(resolved).sort(), ['MNK', 'PAL'])
  assert.deepEqual(loadoutClasses(ambiguous).sort(), ['CLR', 'MNK', 'PAL'])
  // CLR brings channeler, which the resolved reading does not have.
  assert.ok(!stanceKeysForClasses(loadoutClasses(resolved)).includes('channeler'))
  assert.ok(stanceKeysForClasses(loadoutClasses(ambiguous)).includes('channeler'))
})

test('loadout: no interval means no offer — never a default loadout', () => {
  assert.deepEqual(loadoutClasses(null), [])
  assert.deepEqual(stanceKeysForClasses([]), [])
})
