// COMPLETION FROM A HELD REWARD — goldens over the COMMITTED scrape and a real dump.
//
// A player who did thirty Sky Tests before this app existed has no turn-in in his log and no
// checkbox ticked, so the tab calls every one of them undone. His evidence is the reward in his
// bank. This suite pins the premise that makes that evidence admissible, read off the committed
// files rather than asserted:
//
//   1. every one of the 95 quests names a reward, and all 95 resolve in items.json;
//   2. NO Sky reward has a `dropsfrom` list — none of them is obtainable as a mob drop;
//   3. 82 of the 95 are flagged NO DROP, so they cannot be traded either.
//
// (1)+(2)+(3) is what turns "holds the reward" into "did the quest" for those 82. The remaining
// 13 are surfaced as weaker `tradeable` evidence and never merged into the strong claim.
//
// The derivation is also pinned against the committed `Primitive_freeport-Inventory.txt` through
// the REAL dump parser and the REAL held-count fold, so the counting key the UI will use is the
// counting key asserted here — including the ` +N` fold, which is the case a hand-written test
// would most likely miss (an upgraded reward is the strongest evidence there is, and it lands on
// a different raw key than the scrape's name).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseInventoryDump } from '../src/main/outputs/inventoryParse'
import { heldCountsFromDump } from '../src/shared/outputs/inventory'
import {
  evidenceTally,
  foldToCountKeys,
  rewardCompletions,
  rewardIsNoDrop
} from '../src/renderer/src/features/posky/rewardCompletion'
import { questKey } from '../src/renderer/src/features/posky/keys'
import posky from '../src/renderer/src/data/eqlegends/posky.json'
import type { PoskyQuest } from '../src/shared/types'

const HERE = dirname(fileURLToPath(import.meta.url))
const QUESTS = posky.quests as PoskyQuest[]

interface ItemsDb {
  items: Record<string, { dropsfrom?: unknown[] }>
}
const itemsDb = JSON.parse(readFileSync(join(HERE, '..', 'src', 'main', 'data', 'items.json'), 'utf8')) as ItemsDb

// ── 1. THE PREMISE, read off the committed data ─────────────────────────────────────────────

test('RC: every Sky quest names a reward, and every reward is a real item', () => {
  assert.equal(QUESTS.length, 95)
  const missingReward = QUESTS.filter((q) => !q.reward)
  assert.deepEqual(missingReward, [], 'a quest with no reward would silently never be detectable')
  const notInDb = QUESTS.filter((q) => !itemsDb.items[(q.reward ?? '').toLowerCase()]).map((q) => q.reward)
  assert.deepEqual(notInDb, [], 'a reward missing from items.json cannot be checked for dropsfrom')
})

test('RC: no Sky reward drops from a mob — the quest is the only source', () => {
  // THE LOAD-BEARING FACT. If a reward also dropped, holding it would prove nothing at all and
  // this whole feature would be a guess dressed as evidence.
  const alsoDrops = QUESTS.filter((q) => {
    const drops = itemsDb.items[(q.reward ?? '').toLowerCase()]?.dropsfrom
    return Array.isArray(drops) && drops.length > 0
  }).map((q) => `${q.name} → ${q.reward}`)
  assert.deepEqual(alsoDrops, [])
})

test('RC: 82 of 95 rewards are NO DROP, so possession cannot be borrowed', () => {
  const noDrop = QUESTS.filter(rewardIsNoDrop)
  assert.equal(noDrop.length, 82)
  assert.equal(QUESTS.length - noDrop.length, 13)
  // Spot-check both verdicts against the scrape's own words.
  const byName = (n: string): PoskyQuest => {
    const q = QUESTS.find((x) => x.name === n)
    assert.ok(q, n)
    return q
  }
  assert.equal(rewardIsNoDrop(byName('Monk Test of Fists')), true)
  assert.equal(rewardIsNoDrop(byName('Berserker Test of Sharpness')), false)
})

// ── 2. THE FOLD ─────────────────────────────────────────────────────────────────────────────

test('RC: raw dump keys fold onto the counting key, +N included', () => {
  const folded = foldToCountKeys({
    "wu's fist of mastery +5": 1,
    'mask of song': 1,
    'espri +2': 1,
    'espri': 1
  })
  // The upgraded reward is the same reward.
  assert.equal(folded["wu's fist of mastery"], 1)
  assert.equal(folded['mask of song'], 1)
  // Two copies on two raw keys are two copies on one counting key.
  assert.equal(folded['espri'], 2)
  assert.equal(folded["wu's fist of mastery +5"], undefined, 'the +N key must not survive the fold')
})

// ── 3. THE DERIVATION ───────────────────────────────────────────────────────────────────────

test('RC: holding a reward proposes that quest, with its evidence strength', () => {
  const fists = QUESTS.find((q) => q.name === 'Monk Test of Fists')
  const sharp = QUESTS.find((q) => q.name === 'Berserker Test of Sharpness')
  assert.ok(fists?.reward && sharp?.reward)
  const out = rewardCompletions(
    [fists, sharp],
    { [fists.reward.toLowerCase() + ' +5']: 1, [sharp.reward.toLowerCase()]: 1 },
    []
  )
  assert.equal(out.length, 2)
  // Sorted by class then name: Berserker before Monk.
  assert.deepEqual(out.map((c) => c.className), ['Berserker', 'Monk'])
  assert.equal(out.find((c) => c.className === 'Monk')?.evidence, 'noDrop')
  assert.equal(out.find((c) => c.className === 'Berserker')?.evidence, 'tradeable')
  assert.deepEqual(evidenceTally(out), { noDrop: 1, tradeable: 1 })
})

test('RC: a quest already marked complete is never proposed again', () => {
  const fists = QUESTS.find((q) => q.name === 'Monk Test of Fists')
  assert.ok(fists?.reward)
  const held = { [fists.reward.toLowerCase()]: 1 }
  assert.equal(rewardCompletions([fists], held, []).length, 1)
  assert.equal(rewardCompletions([fists], held, [questKey(fists)]).length, 0)
})

test('RC: holding nothing proposes nothing — and a reward you lack is not a maybe', () => {
  assert.deepEqual(rewardCompletions(QUESTS, {}, []), [])
  const fists = QUESTS.find((q) => q.name === 'Monk Test of Fists')
  assert.ok(fists)
  // A DIFFERENT item, and a zero count, are both "not held".
  assert.deepEqual(rewardCompletions([fists], { 'rusty dagger': 3 }, []), [])
  assert.deepEqual(rewardCompletions([fists], { [(fists.reward ?? '').toLowerCase()]: 0 }, []), [])
})

// ── 4. THROUGH THE REAL DUMP PARSER ─────────────────────────────────────────────────────────

test('RC: the owner’s committed dump, end to end through the real parser', () => {
  const text = readFileSync(join(HERE, 'fixtures', 'Primitive_freeport-Inventory.txt'), 'utf8')
  const counts = heldCountsFromDump(parseInventoryDump(text))
  const out = rewardCompletions(QUESTS, counts, [])
  // Whatever this dump holds, the invariants hold: every proposal names a quest that exists,
  // carries the reward the scrape states, and is not proposed twice.
  const keys = out.map((c) => c.key)
  assert.equal(new Set(keys).size, keys.length, 'no quest proposed twice')
  for (const c of out) {
    const q = QUESTS.find((x) => questKey(x) === c.key)
    assert.ok(q, c.key)
    assert.equal(c.reward, q.reward)
    assert.equal(c.evidence, rewardIsNoDrop(q) ? 'noDrop' : 'tradeable')
    // …and the item really is in the dump, on the folded key.
    assert.ok((foldToCountKeys(counts)[c.reward.toLowerCase().replace(/ \+\d+$/, '')] ?? 0) > 0)
  }
})
