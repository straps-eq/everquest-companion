// POOLING, ADVICE AND THE DERIVED MISMATCH — the layer between measured hits and a claim.
//
// The interesting assertions here are all REFUSALS. Anyone can rank three numbers; the value of
// this layer is that it declines to answer when the log has not earned an answer — too few
// hits, no stance committed, a profile built entirely inside Evasive, or a gain too small to be
// worth a mid-fight switch at an endurance cost this model cannot see.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MIN_CONFIDENT_HITS,
  MIN_GAIN,
  adviseFor,
  detectMismatch,
  pooledProfile,
  type StanceSample,
  type TargetProfile
} from '../src/shared/stanceAdvice'

const PAL = ['balanced', 'defensive', 'mage hunter', 'offensive']

function target(samples: StanceSample[]): TargetProfile {
  return {
    mobKey: 'cazic-thule',
    mobName: 'Cazic-Thule',
    zoneBase: 'The Plane of Fear',
    tier: 1,
    samples,
    lastSeenTs: 1_000_000,
    biggestHit: 404
  }
}

// ── pooling ─────────────────────────────────────────────────────────────────────────────────

test('SA: samples from different stances pool onto one comparable profile', () => {
  // 100 physical seen through Defensive (halved) is 200 swung; 100 seen through Mage Hunter
  // (-20% physical) is 125. Pooling the RAW numbers would be adding two different currencies.
  const { profile, hits } = pooledProfile([
    { stanceKey: 'defensive', physical: 100, magical: 80, hits: 10 },
    { stanceKey: 'mage hunter', physical: 100, magical: 100, hits: 10 }
  ])
  assert.equal(profile.physical, 200 + 125)
  assert.equal(profile.magical, 100 + 200)
  assert.equal(hits, 20)
})

test('SA: evasive samples are dropped whole, and the drop is reported', () => {
  const { profile, hits, evadedHitsIgnored } = pooledProfile([
    { stanceKey: 'defensive', physical: 100, magical: 0, hits: 10 },
    { stanceKey: 'evasive', physical: 50, magical: 50, hits: 7 }
  ])
  assert.equal(profile.physical, 200, 'only the defensive sample survives')
  assert.equal(profile.magical, 0)
  assert.equal(hits, 10)
  assert.equal(evadedHitsIgnored, 7)
})

test('SA: a profile measured ONLY inside evasive is empty, not zero-damage', () => {
  const a = adviseFor(target([{ stanceKey: 'evasive', physical: 500, magical: 500, hits: 30 }]), PAL)
  assert.equal(a.hits, 0)
  assert.equal(a.magicalShare, null, 'null is "unmeasured"; 0 would claim it casts nothing')
  assert.deepEqual(a.ranked, [], 'no ranking off zero evidence')
  assert.equal(a.confident, false)
  assert.equal(a.evadedHitsIgnored, 30)
})

// ── advice ──────────────────────────────────────────────────────────────────────────────────

test('SA: confidence is a hit count, and it gates nothing else', () => {
  const thin = adviseFor(target([{ stanceKey: 'defensive', physical: 300, magical: 100, hits: 5 }]), PAL)
  assert.equal(thin.confident, false)
  assert.ok(thin.ranked.length > 0, 'the answer is still SHOWN — the user asked what the log says')
  assert.equal(thin.ranked[0].effect.key, 'defensive')

  const fat = adviseFor(
    target([{ stanceKey: 'defensive', physical: 300, magical: 100, hits: MIN_CONFIDENT_HITS }]),
    PAL
  )
  assert.equal(fat.confident, true)
})

// ── the derived mismatch ────────────────────────────────────────────────────────────────────

const HEAVY_MELEE: StanceSample[] = [{ stanceKey: 'defensive', physical: 800, magical: 100, hits: 60 }]
const HEAVY_SPELL: StanceSample[] = [{ stanceKey: 'defensive', physical: 100, magical: 800, hits: 60 }]

test('SA: wearing the wrong half of the pair is caught, with the gain stated', () => {
  // Un-mitigated: 1600 physical / 125 magical — overwhelmingly melee, so Defensive.
  const m = detectMismatch(target(HEAVY_MELEE), PAL, 'mage hunter')
  assert.ok(m)
  assert.equal(m.currentKey, 'mage hunter')
  assert.equal(m.bestKey, 'defensive')
  assert.ok(m.gain >= MIN_GAIN)
  assert.ok(m.currentFraction > m.bestFraction)
})

test('SA: an OFFENSIVE stance is a mismatch even though it is never ranked', () => {
  // rankStances excludes Offensive (it says nothing about incoming damage), but standing in it
  // while a raid boss beats on you is exactly what this alert is for, so the current fraction
  // is computed directly rather than looked up in the ranking.
  const m = detectMismatch(target(HEAVY_MELEE), PAL, 'offensive')
  assert.ok(m)
  assert.equal(m.currentFraction, 1, 'offensive reduces nothing')
  assert.equal(m.bestKey, 'defensive')
})

test('SA: it refuses when there is nothing to be wrong about', () => {
  // already best
  assert.equal(detectMismatch(target(HEAVY_MELEE), PAL, 'defensive'), null)
  assert.equal(detectMismatch(target(HEAVY_SPELL), PAL, 'mage hunter'), null)
  // no stance committed at all
  assert.equal(detectMismatch(target(HEAVY_MELEE), PAL, null), null)
  // not enough hits yet
  const thin = target([{ stanceKey: 'defensive', physical: 800, magical: 100, hits: 3 }])
  assert.equal(detectMismatch(thin, PAL, 'mage hunter'), null)
  // an unknown stance string is not a mismatch — it is an unknown
  assert.equal(detectMismatch(target(HEAVY_MELEE), PAL, 'no such stance'), null)
})

test('SA: a trivial gain is refused — the arithmetic can be right and the advice still bad', () => {
  // A near-even mob: defensive and mage hunter differ by a hair. Switching mid-fight for that,
  // at an endurance cost this model cannot see, is not worth an alert.
  const even = target([{ stanceKey: 'balanced', physical: 500, magical: 480, hits: 80 }])
  const m = detectMismatch(even, PAL, 'mage hunter')
  assert.equal(m, null)
  // …and the ranking still HAS an opinion, which is the point: the view may show it, the alert
  // may not fire on it.
  const a = adviseFor(even, PAL)
  assert.equal(a.ranked[0].effect.key, 'defensive')
  assert.ok(a.ranked[0].fraction < a.ranked[1].fraction)
})
