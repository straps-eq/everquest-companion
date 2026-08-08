// The fixture builders tests/moteFarming.test.mts drives `shared/moteFarming.ts` with.
//
// A helper MODULE rather than a block at the top of the spec (the tests/harness.mts precedent):
// the spec was over this repo's 400-code-line file ceiling with them inline, and the rule here is
// to factor rather than exempt. Nothing in this file asserts anything — it only builds the two
// inputs `moteFarming` takes (a `ProgressionSnap` to derive zone spans from, and loot lines) — so
// a reader of the spec sees expectations and not scaffolding.
//
// It is NOT named `*.test.mts`, which is what keeps `npm test` (`tests/*.test.mts`) from running
// it as a suite of zero tests.

import assert from 'node:assert/strict'
import type { LootEvent } from '../src/shared/types'
import { rangeStats, type ZoneRangeRow } from '../src/shared/progressionStats'
import type { ProgressionSnap } from '../src/shared/progressionTypes'
import { moteOf } from '../src/shared/motes'

export const MIN = 60_000
export const HOUR = 60 * MIN
/** An arbitrary, readable anchor — nothing in the spec depends on the wall clock. */
export const T0 = Date.parse('Fri Aug 07 12:00:00 2026')

export const INFINITESIMAL = 'Mote of Infinitesimal Potential'
export const LESSER = 'Mote of Lesser Potential'
export const POTENTIAL = 'Mote of Potential'
export const MAJOR = 'Mote of Major Potential'
export const VOID = 'Void-Touched Potential'

/** The exp the committed ladder says a rung is worth — so no expectation retypes a wiki number. */
export function expOf(name: string): number {
  const m = moteOf(name)
  assert.ok(m, `${name} is not on the ladder`)
  return m.exp
}

export function emptySnap(): ProgressionSnap {
  return {
    expTs: [], expPct: [], expFlag: [],
    killTs: [], killZone: [], killCredit: [],
    witnessTs: [], recentKills: [], lootTs: [],
    zoneStart: [], zoneEnd: [], zoneName: [],
    offlineStart: [], offlineEnd: [], offlineCamped: [],
    levelTs: [], levelValue: [], aaGainTs: [], aaGainAmount: [],
    lastTs: 0, windowStart: 0, dropped: 0
  }
}

export function addZone(snap: ProgressionSnap, ts: number, name: string): void {
  const n = snap.zoneStart.length
  if (n > 0) snap.zoneEnd[n - 1] = ts
  snap.zoneStart.push(ts)
  snap.zoneEnd.push(0)
  snap.zoneName.push(name)
  snap.lastTs = Math.max(snap.lastTs, ts)
}

/**
 * A drip of activity across `[from, to]` so `idleSpans` does not classify the stretch as silence.
 * The stream `rangeStats` walks is exp ∪ credited kill ∪ loot and the idle threshold is 5 minutes,
 * so one sample every 2 minutes keeps a span fully ACTIVE — which is what makes an expected
 * per-hour figure in the spec arithmetic rather than a guess about the idle classifier.
 */
export function keepBusy(snap: ProgressionSnap, from: number, to: number): void {
  for (let ts = from; ts <= to; ts += 2 * MIN) {
    snap.lootTs.push(ts)
    snap.lastTs = Math.max(snap.lastTs, ts)
  }
}

export function zonesOf(snap: ProgressionSnap, t0: number, t1: number): ZoneRangeRow[] {
  return rangeStats({ snap, range: { t0, t1 } }).zones
}

/** A loot line, folded exactly as the loot module folds it: item, zone, source mob. */
export function loot(ts: number, item: string, zone?: string, source?: string): LootEvent {
  return { ts, item, zone, source }
}

/** The same line, but the log named a STACK (`--You have looted 3 Motes of …--`). A wrapper
 *  rather than a fifth parameter: the repo's max-params ceiling is four, and a stack is the
 *  uncommon case that deserves to be visible at the call site anyway. */
export function stack(count: number, e: LootEvent): LootEvent {
  return { ...e, count }
}

/**
 * The two-zone, two-hour fixture the ranking tests share.
 *
 * Hour one in `The Hole`, hour two in `Plane of Fear`. Same wall clock and — because the drip
 * never stops — the same ACTIVE hour each, so a per-hour rate is a fair comparison and any
 * difference between two rankings over it is about mote VALUE and nothing else.
 */
export function twoZones(): ZoneRangeRow[] {
  const snap = emptySnap()
  addZone(snap, T0, 'The Hole')
  addZone(snap, T0 + HOUR, 'Plane of Fear')
  keepBusy(snap, T0, T0 + 2 * HOUR)
  snap.lastTs = T0 + 2 * HOUR
  return zonesOf(snap, T0, T0 + 2 * HOUR)
}
