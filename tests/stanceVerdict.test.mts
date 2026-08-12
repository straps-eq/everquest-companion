// THE TWO ANSWERS, IN WORDS — and the sentences ARE the contract here.
//
// The owner's report was that the tab is confusing: "It should be clear — you are in X, if you
// switched to Y it would save you." So this file pins the SENTENCE, not just the arithmetic behind
// it, because the arithmetic was already right and still unreadable. If a future edit drops the
// worn stance from the comparison, or quietly stops saying what the DPS pick costs, these fail.
//
// Every number below is hand-derived from the stated multipliers in the comments beside it, so the
// test is checkable by reading rather than by running.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dpsVerdict,
  mobKeyOf,
  mobVerdict,
  mobVerdicts,
  pooledOutgoing,
  sustainVerdict
} from '../src/shared/stanceVerdict'
import type { OffenseProfile, OffenseSample } from '../src/shared/stanceOffense'
import type { StanceSample, TargetProfile } from '../src/shared/stanceAdvice'

/** A paladin-ish loadout: three holdable defensive stances plus the offensive one. */
const PAL = ['balanced', 'defensive', 'mage hunter', 'offensive']

function target(samples: StanceSample[], over: Partial<TargetProfile> = {}): TargetProfile {
  return {
    mobKey: 'cazic-thule',
    mobName: 'Cazic-Thule',
    zoneBase: 'The Plane of Fear',
    tier: 2,
    samples,
    lastSeenTs: 1_700_000_000_000,
    biggestHit: 412,
    ...over
  }
}

function offense(samples: OffenseSample[], over: Partial<OffenseProfile> = {}): OffenseProfile {
  return {
    mobKey: 'cazic-thule',
    mobName: 'Cazic-Thule',
    zoneBase: 'The Plane of Fear',
    tier: 2,
    samples,
    lastSeenTs: 1_700_000_000_000,
    biggestHit: 300,
    ...over
  }
}

/**
 * The reference measurement used throughout, chosen so every figure is a round number.
 *
 * 500 physical + 400 magical taken over 100 hits while in Defensive. Un-mitigated (÷0.5, ÷0.8)
 * that is 1,000 physical + 500 magical = 1,500 of full-sized damage. Against that profile:
 *     defensive   0.5·1000 + 0.8·500 =  900  →  60%
 *     mage hunter 0.8·1000 + 0.5·500 = 1050  →  70%
 *     balanced    0.9·1500            = 1350  →  90%
 */
const TAKEN: StanceSample[] = [{ stanceKey: 'defensive', physical: 500, magical: 400, hits: 100 }]

/** 800 melee + 200 spell dealt over 100 hits in Defensive, which scales neither: the baseline is
 *  itself. Offensive doubles the melee half → 1,600 + 200 = 1,800, i.e. 1.8x. */
const DEALT: OffenseSample[] = [{ stanceKey: 'defensive', melee: 800, spell: 200, hits: 100 }]

// ── 1. THE SENTENCE THE REPORT ASKED FOR ────────────────────────────────────────────────────

test('SV: "you are in X and take N%; Y would take M% — that is Z% gone"', () => {
  const v = sustainVerdict(target(TAKEN), PAL, 'mage hunter')
  assert.equal(v.block, 'ok')
  assert.equal(v.worn, 'Mage Hunter')
  assert.equal(v.wornFraction, 0.7)
  assert.equal(v.best, 'Defensive')
  assert.equal(v.bestFraction, 0.6)
  assert.equal(v.alreadyBest, false)
  // (0.70 − 0.60) / 0.70 — a seventh of the damage you are currently taking.
  assert.ok(v.saves !== null && Math.abs(v.saves - 1 / 7) < 1e-9)
  assert.equal(
    v.line,
    'You are in Mage Hunter and take 70% of what it swings for. Defensive would take 60% — that is 14% of its damage gone.'
  )
})

test('SV: when you are ALREADY right, it says so instead of saying nothing', () => {
  // The old card's failure mode: `detectMismatch` refuses on "already best", so the user in the
  // correct stance saw a recommendation with no confirmation and no baseline.
  const v = sustainVerdict(target(TAKEN), PAL, 'defensive')
  assert.equal(v.alreadyBest, true)
  assert.equal(v.block, 'ok')
  assert.equal(
    v.line,
    'You are in Defensive, and that is the best stance you can hold here: you take 60% of what it swings for.'
  )
})

test('SV: a thin sample still gets the comparison, labelled as early', () => {
  // Deliberately NOT a refusal: the user asked what the log says, and "not much yet" is an answer.
  // 4 hits, ÷0.5 and ÷0.8 → 200 physical + 100 magical = 300; defensive 0.5·200+0.8·100 = 180 → 60%.
  const v = sustainVerdict(target([{ stanceKey: 'defensive', physical: 100, magical: 80, hits: 4 }]), PAL, 'balanced')
  assert.equal(v.block, 'thin')
  assert.equal(v.best, 'Defensive')
  assert.ok(v.line.includes('Early days'))
  assert.ok(v.line.includes('only 4 hits measured'))
})

// ── 2. THE SUSTAIN REFUSALS ─────────────────────────────────────────────────────────────────

test('SV: with no stance ever committed there is no baseline, and none is assumed', () => {
  // The log may simply predate this session's first commit. Assuming Balanced would invent the
  // very number the sentence is about.
  const v = sustainVerdict(target(TAKEN), PAL, null)
  assert.equal(v.block, 'unknownWorn')
  assert.equal(v.worn, null)
  assert.equal(v.wornFraction, null)
  assert.equal(v.saves, null)
  assert.ok(v.line.startsWith('The log has not said which stance you are in'))
  assert.ok(v.line.includes('Defensive'), 'it still names the best holdable stance')
})

test('SV: a profile measured entirely inside Evasive is "nothing usable", not "no damage"', () => {
  const v = sustainVerdict(target([{ stanceKey: 'evasive', physical: 900, magical: 100, hits: 60 }]), PAL, 'defensive')
  assert.equal(v.block, 'noMeasurement')
  assert.ok(v.line.includes('every hit it landed came while you were in Evasive'))
})

test('SV: a mob that has never hit you says exactly that', () => {
  // The one-sided case: this mob is in the OFFENSE ledger only.
  const v = sustainVerdict(undefined, PAL, 'defensive')
  assert.equal(v.block, 'noMeasurement')
  assert.equal(v.line, 'This one has never hit you, so there is nothing to compare.')
})

test('SV: a loadout whose only defensive option can fail has nothing to hold', () => {
  const v = sustainVerdict(target(TAKEN), ['evasive', 'offensive'], 'evasive')
  assert.equal(v.block, 'noneHoldable')
  assert.equal(v.best, null)
  assert.ok(v.line.includes('can fail when endurance runs out'))
  // …and a loadout with no defensive stance at all is a different sentence.
  const none = sustainVerdict(target(TAKEN), ['offensive', 'striker'], 'offensive')
  assert.equal(none.block, 'noneHoldable')
  assert.ok(none.line.includes('no defensive stance to rank'))
})

// ── 3. THE DPS ANSWER, AND ITS PRICE ────────────────────────────────────────────────────────

test('SV: the DPS verdict names the gain, the mix, and what it COSTS', () => {
  const sustain = sustainVerdict(target(TAKEN), PAL, 'defensive')
  const v = dpsVerdict(offense(DEALT), PAL, 'defensive', sustain)
  assert.equal(v.block, 'ok')
  assert.equal(v.best, 'Offensive')
  assert.equal(v.gain, 1.8)
  assert.equal(v.meleeShare, 0.8)
  assert.equal(
    v.line,
    'Offensive would deal +80% damage against this one compared with Defensive. 80% of your damage to it is melee.'
  )
  // THE PAIRING. "Switch to Offensive" without "and take every point it swings" is the half-truth
  // the whole sustain/DPS split exists to prevent. Offensive is 1.0/1.0 on incoming, so 100%.
  assert.equal(
    v.costLine,
    'It costs you sustain: in Offensive you take 100% of what it swings for, against 60% in Defensive.'
  )
})

test('SV: the answer is PER MOB — a mob you only cast at gets no damage recommendation', () => {
  // This is the payoff of measuring per (mob, zone, tier): the same character, the same loadout,
  // a different mob. All spell damage ⇒ Offensive's melee multiplier reaches none of it.
  const caster = dpsVerdict(offense([{ stanceKey: 'defensive', melee: 0, spell: 1000, hits: 100 }]), PAL, 'defensive')
  assert.equal(caster.gain, 1)
  assert.equal(caster.meleeShare, 0)
  assert.ok(caster.line.startsWith('No measured damage gain here'))
})

test('SV: when the damage pick is also the stance you would hold, there is no trade-off', () => {
  const sustain = sustainVerdict(target(TAKEN), ['balanced'], 'balanced')
  const v = dpsVerdict(offense(DEALT), ['balanced'], 'balanced', sustain)
  assert.equal(v.best, 'Balanced')
  assert.equal(v.alreadyBest, true)
  assert.equal(v.costLine, null, 'already wearing it — there is nothing to price')
})

test('SV: an unpriceable trade says so rather than implying it is free', () => {
  // The mob has never hit you, so the incoming side cannot price the switch.
  const sustain = sustainVerdict(undefined, PAL, 'defensive')
  const v = dpsVerdict(offense(DEALT), PAL, 'defensive', sustain)
  assert.equal(v.best, 'Offensive')
  assert.ok(v.costLine !== null && v.costLine.includes('not measured yet'))
})

// ── 4. THE DPS REFUSALS ─────────────────────────────────────────────────────────────────────

test('SV: damage dealt only in an UNMEASURED stance is unusable, and says which', () => {
  // Striker/Berserker/Ranged carry no multiplier (the log does not support one), so their samples
  // cannot be un-scaled and are dropped whole rather than divided by an invented number.
  const v = dpsVerdict(offense([{ stanceKey: 'striker', melee: 900, spell: 100, hits: 50 }]), ['striker', 'offensive'], 'striker')
  assert.equal(v.block, 'noMeasurement')
  assert.equal(v.hits, 0)
  assert.equal(v.refusedHits, 50)
  assert.ok(v.line.includes('all 50 of your hits'))
  assert.ok(v.line.includes('never been measured'))
})

test('SV: wearing an unmeasured stance, the app refuses to claim a direction', () => {
  // Not "no difference" — the honest answer is that it cannot tell, because a Striker's damage
  // multiplier is unknown in both directions.
  const v = dpsVerdict(offense(DEALT), [...PAL, 'striker'], 'striker')
  assert.equal(v.gain, null)
  assert.equal(v.best, 'Offensive')
  assert.ok(v.line.includes('has never been measured'))
  assert.ok(v.line.includes('gains or loses'))
})

test('SV: the unmeasurable stances in a loadout are NAMED, with the reason', () => {
  const v = dpsVerdict(offense(DEALT), [...PAL, 'striker', 'berserker'], 'defensive')
  assert.deepEqual(v.unknown.map((u) => u.key), ['berserker', 'striker'])
  for (const u of v.unknown) assert.ok(u.why.length > 60, `${u.key} must carry its reason`)
  // A loadout with nothing unmeasurable declares nothing.
  assert.deepEqual(dpsVerdict(offense(DEALT), PAL, 'defensive').unknown, [])
})

test('SV: pooling drops the unmeasured samples and reports how many', () => {
  const p = pooledOutgoing([
    { stanceKey: 'offensive', melee: 2000, spell: 300, hits: 40 },
    { stanceKey: 'striker', melee: 500, spell: 0, hits: 7 }
  ])
  // Offensive's melee halves back to baseline; its spell half is untouched; striker is refused.
  assert.deepEqual(p.profile, { melee: 1000, spell: 300 })
  assert.equal(p.hits, 40)
  assert.equal(p.refusedHits, 7)
})

// ── 5. PAIRING THE TWO LEDGERS ──────────────────────────────────────────────────────────────

test('SV: the two ledgers join on one key, and either side may be missing', () => {
  assert.equal(mobKeyOf({ mobKey: 'cazic-thule', zoneBase: 'The Plane of Fear', tier: 2 }), 'cazic-thule|The Plane of Fear|2')

  const both = mobVerdict({ target: target(TAKEN), offense: offense(DEALT) }, PAL, 'mage hunter')
  assert.equal(both.key, 'cazic-thule|The Plane of Fear|2')
  assert.equal(both.mobName, 'Cazic-Thule')
  assert.equal(both.sustain.best, 'Defensive')
  assert.equal(both.dps.best, 'Offensive')

  // Hit you but never hit BY you: a sustain answer and an honest DPS blank.
  const hitOnly = mobVerdict({ target: target(TAKEN) }, PAL, 'mage hunter')
  assert.equal(hitOnly.sustain.block, 'ok')
  assert.equal(hitOnly.dps.block, 'noMeasurement')

  // Killed untouched: a DPS answer and an honest sustain blank.
  const dealtOnly = mobVerdict({ offense: offense(DEALT) }, PAL, 'defensive')
  assert.equal(dealtOnly.mobName, 'Cazic-Thule', 'the identity comes from whichever side exists')
  assert.equal(dealtOnly.sustain.block, 'noMeasurement')
  assert.equal(dealtOnly.dps.block, 'ok')
})

test('SV: the mob list is the UNION of both ledgers, most-recently-involved first', () => {
  const rows = mobVerdicts(
    {
      targets: [target(TAKEN, { mobKey: 'hit-me', mobName: 'a thing that hit me', lastSeenTs: 5_000 })],
      offense: [
        offense(DEALT, { mobKey: 'hit-me', mobName: 'a thing that hit me', lastSeenTs: 9_000 }),
        offense(DEALT, { mobKey: 'untouched', mobName: 'a thing I killed clean', lastSeenTs: 7_000 })
      ]
    },
    PAL,
    'defensive'
  )
  assert.equal(rows.length, 2, 'the paired mob is ONE row, not two')
  assert.deepEqual(rows.map((r) => r.mobName), ['a thing that hit me', 'a thing I killed clean'])
  // The paired row's timestamp is the later of the two ledgers'.
  assert.equal(rows[0].lastSeenTs, 9_000)
  assert.equal(rows[0].sustain.block, 'ok')
  assert.equal(rows[0].dps.block, 'ok')
})
