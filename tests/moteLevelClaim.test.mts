// THE WIKI'S PLAYER-LEVEL CEILING, CHECKED RATHER THAN ENFORCED
// (`moteFarming.levelEvidence`, over `motes.WIKI_LEVEL_CLAIM`).
//
// Its own spec rather than a seventh section of tests/moteFarming.test.mts, which is at this
// repo's 400-code-line file ceiling — factor, never exempt. It shares that spec's builders
// (./moteFixture.mts) so the two describe the same world.
//
// WHAT IS BEING PROTECTED. The eqlwiki Mote Guide asserts that "the player's level will affect the
// level of the motes that drop" and gives a table (level 1 ⇒ tier 1, 15 ⇒ 3, 20 ⇒ 4 …). The
// owner's own log contradicts it by a wide margin and BY TIMESTAMP: a `Mote of Major Potential`
// (ladder 5) landed on Fri Aug 07, and the log's four level-ups are Sat Aug 08 00:10 → 00:50
// reaching 17 — so that drop happened at level 13 or below, where the table allows ladder 2.
//
// `motes.ts` therefore carries the table and applies it NOWHERE. This is the surface that shows
// the disagreement, and the two ways it could go wrong are:
//   * pretending to know a level the log never stated (the app cannot see your XP bar; the only
//     level evidence in a log is a ding line), and
//   * declaring a refutation from nothing — with no level line at all there is no verdict, and
//     "we do not know" must never render as "the wiki is right".
//
// Imported RELATIVELY: node tests run through tsx with no `@shared` alias.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moteOf, wikiClaimedCeiling } from '../src/shared/motes'
import { moteFarming } from '../src/shared/moteFarming'
import { HOUR, INFINITESIMAL, LESSER, MAJOR, MIN, T0, VOID, loot, twoZones } from './moteFixture.mts'

/**
 * THE OWNER'S CASE, REPRODUCED FROM ITS SHAPE. A Major (ladder 5) drops; the log's first level line
 * lands later and takes the character to 14. So the log has not STATED the level at the drop — it
 * has BOUNDED it at 13 — and the wiki's table allows ladder 2 at 13. The evidence reads `refuted`.
 *
 * The number 13 is derived from the ding, never typed in: change the ding and the bound moves.
 */
test('ML: a rung above the wiki ceiling is REFUTED, with the level bound that shows it', () => {
  const dingTs = T0 + 12 * HOUR
  const out = moteFarming({
    events: [loot(T0 + 40 * MIN, MAJOR, 'The Hole', 'Master Yael')],
    zones: twoZones(),
    levels: [
      { ts: dingTs, level: 14 },
      { ts: dingTs + HOUR, level: 15 }
    ]
  })
  const ev = out.levelEvidence
  assert.ok(ev)
  assert.equal(ev.ladder, moteOf(MAJOR)?.ladder)
  assert.equal(ev.name, MAJOR)
  assert.equal(ev.level, null, 'no ding precedes the drop, so the log states no level')
  assert.equal(ev.levelAtMost, 13, 'but it bounds it: the next ding took you to 14')
  assert.equal(ev.wikiCeiling, wikiClaimedCeiling(13))
  assert.ok(ev.ladder > (ev.wikiCeiling ?? 0))
  assert.equal(ev.refuted, true)
})

/** With a ding BEFORE the drop the log states the level exactly, and the check runs on that. */
test('ML: a ding before the drop states the level exactly, and the ceiling is read at it', () => {
  const out = moteFarming({
    events: [loot(T0 + 40 * MIN, LESSER, 'The Hole', 'Master Yael')],
    zones: twoZones(),
    levels: [
      { ts: T0 - HOUR, level: 30 },
      { ts: T0 + 5 * HOUR, level: 31 }
    ]
  })
  const ev = out.levelEvidence
  assert.ok(ev)
  assert.equal(ev.level, 30)
  assert.equal(ev.levelAtMost, null)
  assert.equal(ev.wikiCeiling, wikiClaimedCeiling(30))
  assert.equal(ev.refuted, false, 'level 30 allows ladder 6; a Lesser is 3')
})

/** No level line at all ⇒ no level, no ceiling, and NO claim of a refutation. Absence of evidence
 *  is not evidence, and the panel says "the log has not stated a level" instead. */
test('ML: with no level lines the claim is neither confirmed nor refuted', () => {
  const out = moteFarming({
    events: [loot(T0 + 40 * MIN, MAJOR, 'The Hole', 'Master Yael')],
    zones: twoZones()
  })
  assert.ok(out.levelEvidence)
  assert.equal(out.levelEvidence.level, null)
  assert.equal(out.levelEvidence.levelAtMost, null)
  assert.equal(out.levelEvidence.wikiCeiling, null)
  assert.equal(out.levelEvidence.refuted, false)
})

/** It reports the BEST rung, not the newest — the claim is about ceilings. */
test('ML: the level evidence is the highest rung ever seen, whenever it dropped', () => {
  const out = moteFarming({
    events: [
      loot(T0 + 10 * MIN, MAJOR, 'The Hole', 'Master Yael'),
      loot(T0 + 90 * MIN, INFINITESIMAL, 'Plane of Fear', 'Bazzt Zzzt')
    ],
    zones: twoZones()
  })
  assert.equal(out.levelEvidence?.name, MAJOR)
  assert.equal(out.levelEvidence?.ts, T0 + 10 * MIN)
})

/** No laddered mote ⇒ nothing to check. Void-Touched has no rung, so it is not the "best" one. */
test('ML: no laddered mote ⇒ no level evidence at all', () => {
  const out = moteFarming({ events: [loot(T0, VOID, 'The Hole', 'Innoruuk')], zones: twoZones() })
  assert.equal(out.levelEvidence, null)
})

/**
 * THE TABLE ITSELF IS A STEP FUNCTION and the panel reads it at one level, so the reading must be
 * the LAST rung the level qualifies for and not the next one. Level 17 sits on the 15 rung.
 */
test('ML: the claimed ceiling is the last rung the level reaches, never the next', () => {
  assert.equal(wikiClaimedCeiling(9), 1)
  assert.equal(wikiClaimedCeiling(10), 2)
  assert.equal(wikiClaimedCeiling(17), 3, 'level 17 sits on the 15 rung')
  assert.equal(wikiClaimedCeiling(50), 10)
  // Below the table's first row the claim allows nothing at all, which is itself a refutable claim.
  assert.equal(wikiClaimedCeiling(0), 0)
})
