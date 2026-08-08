// THE DERIVED STANCE MISMATCH — the throttle, the refusals, and the alert it feeds.
//
// This is the first alert in the app that fires on a claim NO LOG LINE MAKES.
// `alertGroupsRefused.ts` wrote the rule down when it declined "Pet died": an AlertDef "matches
// text, not entities … Needs a derived event before it can ship." A suboptimal stance is that
// shape and worse — it is a JOIN over the mob's measured damage profile (main/combat/
// stanceLedger.ts), the wiki's stance multipliers (shared/stances.ts) and the stance worn right
// now. So the engine decides it (main/combat/stanceAdvisor.ts), emits `stanceMismatch`, and the
// alert binds to that event the way the wears-off defs bind to the derived `buffExpired`.
//
// ── WHAT IS ACTUALLY AT RISK HERE, AND THEREFORE WHAT THIS SUITE IS ─────────────────────────
//
// The arithmetic is already covered (tests/stances.test.mts pins the multipliers against the
// scrape; tests/stanceAdvice.test.mts pins the pooling and all four refusals). NOTHING here
// re-tests it. The two things that can only go wrong at this layer are:
//
//   1. VOLUME. Every other alert fires on a discrete line. "You are in the wrong stance" is a
//      STATE that is continuously true for a whole fight, evaluated on a hook that runs on every
//      incoming hit — so the failure mode is not "it never fires", it is "it fires four hundred
//      times and the user turns it off". §A drives the REAL engine over a REAL fixture window
//      (380 incoming hits in under three minutes) and §B drives the throttle directly.
//   2. SUPPRESSION PARITY. `detectMismatch` refuses four ways, and a throttle that evaluated
//      slightly different inputs could speak where the shared layer refused. §C asserts the
//      biconditional over a scenario table — the advisor emits IF AND ONLY IF `detectMismatch`
//      returns a mismatch for the same measurement — rather than asserting a list of zeroes.
//
// Numbers are invariants, ratios and identities wherever the fixture can move under them; the
// two counts that ARE pinned (§A) are re-derived from the committed bytes at test time.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFixture } from './harness.mts'
import { parseEvent } from '../src/main/log/parser'
import { CombatEngine } from '../src/main/combat/engine'
import { StanceLedger } from '../src/main/combat/stanceLedger'
import { ADVICE_REARM_IDLE_MS, StanceAdvisor } from '../src/main/combat/stanceAdvisor'
import { AlertsModule } from '../src/main/modules/alerts'
import { ALERT_GROUPS, VERIFIED_ALERT_GROUPS, alertGroupDefs } from '../src/shared/alertGroups'
import {
  MIN_CONFIDENT_HITS,
  detectMismatch,
  pooledProfile,
  type StanceMismatchEvent,
  type TargetProfile
} from '../src/shared/stanceAdvice'
import type { DamageType } from '../src/shared/combat'
import type { AlertDef, LogEventKind } from '../src/shared/types'

/** The window: 22:30:47 → 22:33:39 on Aug 04, the densest incoming span in the fixture set. */
const W44 = 'w44-poison-slow-per-mob.log'

/**
 * A stance loadout, STATED rather than inferred. The real app reads this from the combo module,
 * whose inference has its own suite; pinning it here keeps every assertion below about the
 * throttle and the refusals instead of about which classes we think the character is running.
 *
 * Evasive is deliberately IN the fixture list (§A) and OUT of the synthetic one (§B–C). It is
 * arithmetically dominant — 0.05 against everything — so with it available the recommendation is
 * always Evasive, which is true, load-bearing (the shipped sentence carries the endurance
 * caveat, asserted in §D) and useless for testing whether the RANKING reached the right answer.
 */
const LOADOUT_WITH_EVASIVE = [
  'balanced',
  'berserker',
  'channeler',
  'defensive',
  'evasive',
  'mage hunter',
  'offensive',
  'striker'
]
/** A paladin-ish loadout: the physical/magical pair, plus two stances that never win. */
const PAL = ['balanced', 'defensive', 'mage hunter', 'offensive']

// ─────────────────────────────────────────────────────────────────────────────
// §A THE GOLDEN WINDOW — the real engine, the real parser, a real fight.

/** Replay a fixture through the engine with the advisor installed; collect what it emitted. */
function replayWindow(opts: { live: boolean; loadout?: readonly string[]; install?: boolean }): {
  events: StanceMismatchEvent[]
  inTotal: number
} {
  const eng = new CombatEngine()
  eng.setPlayerName('Primitive')
  const events: StanceMismatchEvent[] = []
  if (opts.install !== false) {
    eng.setStanceAdvisor({
      availableStances: () => opts.loadout ?? LOADOUT_WITH_EVASIVE,
      emit: (ev) => events.push(ev)
    })
  }
  let seq = 0
  let lastTs = 0
  for (const raw of readFixture(W44)) {
    const ev = parseEvent(raw, seq++)
    if (!ev) continue
    eng.ingestEvent(ev, opts.live)
    lastTs = ev.ts
  }
  const zone = eng.snapshot(lastTs + 120_000, { selectedId: 'zone' }).selected
  assert.ok(zone, 'the window must produce a zone aggregate')
  return { events, inTotal: zone.inTotal }
}

/** The window's own arithmetic, recomputed from the committed bytes: every landed incoming hit
 *  (both conjugations — the melee/spell lines and the second-person DoT ticks) and its ts. */
function incomingHits(): number[] {
  const out: number[] = []
  for (const raw of readFixture(W44)) {
    if (!/ YOU for \d+ point/.test(raw) && !/You have taken \d+ damage from /.test(raw)) continue
    const ev = parseEvent(raw, 0)
    if (ev) out.push(ev.ts)
  }
  return out
}

/** Timestamps of the window's own `You assume a <stance> stance.` lines, in order. */
function stanceCommits(): number[] {
  const out: number[] = []
  for (const raw of readFixture(W44)) {
    const ev = parseEvent(raw, 0)
    if (ev?.kind === 'stanceChange') out.push(ev.ts)
  }
  return out
}

test('SM-A1 hundreds of incoming hits produce a handful of events, not one per hit', () => {
  const hits = incomingHits()
  const commits = stanceCommits()
  // The window is the window: a re-cut fixture that loses the density (or the stance commits it
  // re-arms on) fails HERE rather than quietly weakening the ratio below.
  assert.ok(hits.length > 300, `the window must stay dense — ${hits.length} incoming hits`)
  assert.equal(commits.length, 3, 'three stance commits: evasive → defensive → berserker')

  const { events } = replayWindow({ live: true })
  assert.ok(events.length > 0, 'a fight this one-sided must produce advice at all')
  // THE POINT OF THE WHOLE FILE, as a ratio rather than a frozen count: the condition is true on
  // essentially every one of those hits, and the advisor speaks about one in fifty of them.
  assert.ok(
    events.length * 20 <= hits.length,
    `${events.length} events for ${hits.length} incoming hits is not a throttle`
  )
  // …and the ceiling the design promises, computed from this window rather than remembered:
  // one event per (target, recommended stance) per stance epoch, and there are 4 targets.
  const targets = new Set(events.map((e) => e.target))
  assert.ok(events.length <= targets.size * (commits.length + 1), 'more events than the design allows')
})

test('SM-A2 no (mob, recommendation) is ever repeated inside one stance epoch', () => {
  const commits = stanceCommits()
  const { events } = replayWindow({ live: true })
  // The epoch is "how many stance commits had happened when this fired" — the exact span the
  // advisor re-arms on, read off the fixture rather than off the advisor's own bookkeeping.
  const seen = new Set<string>()
  for (const ev of events) {
    const epoch = commits.filter((t) => t <= ev.ts).length
    const key = `${epoch}|${ev.target}|${ev.best}`
    assert.ok(!seen.has(key), `repeated advice inside one engagement: ${key}`)
    seen.add(key)
  }
  assert.equal(seen.size, events.length)
})

test('SM-A3 every event is a real measurement at a real instant', () => {
  const hitTimes = new Set(incomingHits())
  const { events } = replayWindow({ live: true })
  for (const ev of events) {
    // It fired ON an incoming hit — the only hook that can produce one — not on a timer.
    assert.ok(hitTimes.has(ev.ts), `${ev.target}: event at an instant nothing hit the player`)
    // Confidence is detectMismatch's gate and it is carried on the wire, so a consumer can see
    // how much evidence is behind the claim.
    assert.ok(ev.hits >= MIN_CONFIDENT_HITS, `${ev.target}: ${ev.hits} hits is below the gate`)
    assert.ok(ev.lessPct > 0, 'a recommendation that saves nothing is not a recommendation')
    assert.notEqual(ev.best, ev.stance, 'the recommendation is never the stance already worn')
    // This window carries no `You have entered` line (the extractor's span opens mid-zone), so
    // the honest zone is the empty one — and the sentence omits the clause rather than printing
    // an empty parenthetical.
    assert.equal(ev.zone, '')
    assert.ok(!ev.raw.includes(' in :'), 'no empty zone clause')
  }
})

test('SM-A4 the advisor is purely additive: not one point of damage moves', () => {
  // Law 8's tripwire, run as an identity rather than a remembered number: the same window folded
  // with and without the advisor installed must agree exactly about what hit the player.
  const withAdvisor = replayWindow({ live: true })
  const without = replayWindow({ live: true, install: false })
  assert.equal(withAdvisor.inTotal, without.inTotal)
  assert.equal(without.events.length, 0, 'an engine nobody wired stays silent')
})

test('SM-A5 the historical replay is silent — the whole scan emits nothing', () => {
  // 1.4M lines arrive with live:false at startup. Every one of them would be advice about a
  // fight that ended hours ago, and the alerts module drops non-live events anyway.
  const replayed = replayWindow({ live: false })
  assert.equal(replayed.events.length, 0)
  // Same bytes, same engine, live: the difference is the flag and nothing else.
  assert.ok(replayWindow({ live: true }).events.length > 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// §B THE THROTTLE, DRIVEN DIRECTLY — one real ledger, one real advisor.
//
// The engine test above proves the wiring on real bytes; these prove the WINDOWS, which a
// three-minute fixture cannot reach (the re-arm idle window alone is a minute long).

const T0 = Date.parse('2026-08-04T22:30:00Z')
const MOB = 'a fetid fiend'

/** A rig: a real StanceLedger, a real StanceAdvisor, and everything it said. */
function rig(loadout: readonly string[] = PAL) {
  const ledger = new StanceLedger()
  const advisor = new StanceAdvisor()
  const events: StanceMismatchEvent[] = []
  advisor.install({ availableStances: () => loadout, emit: (ev) => events.push(ev) })
  let ts = T0
  let seq = 0
  /** Land `n` hits, one per second, and let the advisor look at each one. */
  const swing = (n: number, o: { stance: string; amount?: number; dtype?: DamageType; live?: boolean }): void => {
    for (let i = 0; i < n; i++) {
      ts += 1_000
      const rowKey = ledger.note({
        mobName: MOB,
        zone: 'The Plane of Fear',
        stance: o.stance || undefined,
        dtype: o.dtype ?? 'melee',
        amount: o.amount ?? 100,
        ts
      })
      if (rowKey === null) continue
      advisor.consider(ledger, { rowKey, stanceKey: o.stance, ts, seq: seq++, live: o.live ?? true })
    }
  }
  /** Let LOG time pass with nothing landing — the only way an engagement lapses on its own. */
  const idle = (ms: number): void => {
    ts += ms
  }
  /** What `detectMismatch` says about the ledger as it now stands — the parity oracle for §C. */
  const oracle = (stanceKey: string): ReturnType<typeof detectMismatch> => {
    const target = ledger.targets()[0] as TargetProfile | undefined
    return target ? detectMismatch(target, loadout, stanceKey || null) : null
  }
  return { advisor, events, swing, idle, oracle, ledger }
}

test('SM-B1 a long fight speaks ONCE, and speaks promptly', () => {
  const r = rig()
  // Melee-only damage seen through Mage Hunter: 100 landed is 125 swung, all physical, so
  // Defensive is the answer and the gain is the 0.8 → 0.5 the wiki states.
  r.swing(300, { stance: 'mage hunter' })
  assert.equal(r.events.length, 1, '300 hits, one piece of advice')
  const ev = r.events[0]
  assert.equal(ev.target, MOB)
  assert.equal(ev.stance, 'mage hunter')
  assert.equal(ev.best, 'defensive')
  assert.equal(ev.zone, 'The Plane of Fear')
  // PROMPT, not merely rare: the advice must land while the fight it is about is still on. The
  // evidence gate is MIN_CONFIDENT_HITS hits (one per second here) and the re-evaluation floor
  // is five seconds, so the honest bound is "within a handful of hits of becoming true".
  assert.ok(
    ev.ts - T0 <= (MIN_CONFIDENT_HITS + 10) * 1_000,
    'advice arrived long after it became true — the evaluation floor is too coarse'
  )
})

test('SM-B2 changing stance re-arms it — and only the change does', () => {
  const r = rig()
  r.swing(120, { stance: 'mage hunter' })
  assert.equal(r.events.length, 1)
  // The player acted. Whatever we said (and whatever we refused to say) was about a stance that
  // is no longer worn, so the next fight-second is judged fresh.
  r.advisor.onStanceChange()
  r.swing(120, { stance: 'offensive' })
  assert.equal(r.events.length, 2, 'a new stance is a new question')
  assert.equal(r.events[1].stance, 'offensive')
  assert.ok(
    r.events[1].lessPct > r.events[0].lessPct,
    'Offensive mitigates nothing, so the gain over it must exceed the gain over Mage Hunter'
  )
  // …and 200 more hits inside that same stance say nothing further.
  r.swing(200, { stance: 'offensive' })
  assert.equal(r.events.length, 2)
})

test('SM-B3 an engagement that ends re-arms it, on either axis', () => {
  // AXIS 1 — the engine finalized the fight (lifecycle.ts calls this).
  const closed = rig()
  closed.swing(120, { stance: 'mage hunter' })
  assert.equal(closed.events.length, 1)
  closed.advisor.onEngagementEnd()
  closed.swing(60, { stance: 'mage hunter' })
  assert.equal(closed.events.length, 2, 'the next pull is a new pull')

  // AXIS 2 — the encounter never closed, but THIS mob stopped hitting us for the idle window.
  // The engine's own marathon charm-grind fight is the case: one encounter, hours long.
  const lapsed = rig()
  lapsed.swing(120, { stance: 'mage hunter' })
  assert.equal(lapsed.events.length, 1)
  lapsed.idle(ADVICE_REARM_IDLE_MS - 5_000)
  lapsed.swing(30, { stance: 'mage hunter' })
  assert.equal(lapsed.events.length, 1, 'a gap SHORTER than the window is the same engagement')
  lapsed.idle(ADVICE_REARM_IDLE_MS + 1_000)
  lapsed.swing(30, { stance: 'mage hunter' })
  assert.equal(lapsed.events.length, 2, 'a gap longer than the window is a new one')
})

test('SM-B4 replay is inert at the source — no arms, no events, no bus traffic', () => {
  const r = rig()
  r.swing(300, { stance: 'mage hunter', live: false })
  assert.equal(r.events.length, 0)
  // The LEDGER still measured all of it, which is the point: the first live hit is judged
  // against a fully warm session rather than starting from zero evidence.
  assert.ok((r.ledger.targets()[0]?.samples[0].hits ?? 0) >= 300)
  r.swing(1, { stance: 'mage hunter' })
  assert.equal(r.events.length, 1, 'and it speaks on the very first live hit, already confident')
})

// ─────────────────────────────────────────────────────────────────────────────
// §C SUPPRESSION PARITY — the advisor speaks IF AND ONLY IF detectMismatch does.

/**
 * One scenario: what lands, in what stance, against which loadout.
 *
 * `round` is INTERLEAVED and repeated rather than played in blocks, and that is a correction the
 * first draft of this table earned: a mob that swings for 60 hits and only then starts casting
 * has a physical-only profile for the first half of the fight, so the advisor speaks (correctly —
 * it was true when it was said) about a measurement that no longer exists by the end. The oracle
 * below reads the ledger AFTER the fight, so a biconditional is only meaningful over a profile
 * that holds still. Interleaving is also what a real mob does.
 */
interface Scenario {
  what: string
  loadout: readonly string[]
  stance: string
  /** one round of hits, landed `repeat` times in order */
  round: { amount: number; dtype?: DamageType }[]
  repeat: number
}

/** A mob that only swings: seen through Mage Hunter (×0.8), 100 landed is 125 swung, all
 *  physical, so Defensive wins by the 0.8 → 0.5 the wiki states. */
const MELEE_ONLY = [{ amount: 100 }]

const SCENARIOS: Scenario[] = [
  {
    // THE POSITIVE CONTROL. Without one, a biconditional over six refusals proves only that
    // the advisor is silent, which a `return` on line one would also achieve.
    what: 'a confident, meaningful mismatch',
    loadout: PAL,
    stance: 'mage hunter',
    round: MELEE_ONLY,
    repeat: 80
  },
  {
    what: "NO STANCE COMMITTED — the log may simply predate this session's first commit",
    loadout: PAL,
    stance: '',
    round: MELEE_ONLY,
    repeat: 80
  },
  {
    what: 'TOO FEW HITS — two hits are not a damage profile',
    loadout: PAL,
    stance: 'mage hunter',
    round: MELEE_ONLY,
    repeat: MIN_CONFIDENT_HITS - 1
  },
  {
    what: 'ALREADY IN THE BEST STANCE — there is nothing to be wrong about',
    loadout: PAL,
    stance: 'defensive',
    round: MELEE_ONLY,
    repeat: 80
  },
  {
    // Seen through Mage Hunter, 80 physical (÷0.8) and 50 magical (÷0.5) are both 100 swung — a
    // mob that splits its damage evenly, where Defensive beats Mage Hunter by a hair and
    // switching mid-fight (at an endurance cost this model cannot see) is not worth an alert.
    what: 'A TRIVIAL GAIN — the arithmetic can be right and the advice still bad',
    loadout: PAL,
    stance: 'mage hunter',
    round: [{ amount: 80 }, { amount: 50, dtype: 'spell' }],
    repeat: 60
  },
  {
    what: 'AN UNKNOWN STANCE — that is an unknown, not a mismatch',
    loadout: PAL,
    stance: 'no such stance',
    round: MELEE_ONLY,
    repeat: 80
  },
  {
    what: 'AN EMPTY LOADOUT — nothing to recommend, so nothing is recommended',
    loadout: [],
    stance: 'mage hunter',
    round: MELEE_ONLY,
    repeat: 80
  }
]

test('SM-C1 the advisor emits exactly when detectMismatch returns a mismatch', () => {
  for (const s of SCENARIOS) {
    const r = rig(s.loadout)
    for (let i = 0; i < s.repeat; i++) {
      for (const sw of s.round) r.swing(1, { stance: s.stance, amount: sw.amount, dtype: sw.dtype })
    }
    const shared = r.oracle(s.stance)
    assert.equal(
      r.events.length > 0,
      shared !== null,
      `${s.what}: advisor said ${r.events.length} thing(s), detectMismatch said ${shared === null ? 'no' : 'yes'}`
    )
    // When both agree there IS advice, they must be the SAME advice — the throttle decides
    // WHEN, never WHAT. (Re-tuning the maths here is exactly what this file must not do.)
    if (shared) {
      assert.equal(r.events[0].best, shared.bestKey, s.what)
      assert.equal(r.events[0].stance, shared.currentKey, s.what)
      // `hits` is the evidence AS IT STOOD when the advisor spoke, which is the honest number to
      // state — the oracle above re-reads the ledger after the whole fight, so it can only be
      // larger. What must hold is that the claim was over the gate and never over-claimed.
      assert.ok(r.events[0].hits >= MIN_CONFIDENT_HITS, s.what)
      assert.ok(r.events[0].hits <= shared.advice.hits, s.what)
    }
  }
})

test('SM-C2 a refusal is re-decided as evidence arrives — it is not remembered', () => {
  // The confidence refusal is the one that STOPS being true mid-fight, so a throttle that cached
  // "we refused this target" would silently never speak about the mob you fight the longest.
  const r = rig()
  r.swing(MIN_CONFIDENT_HITS - 5, { stance: 'mage hunter' })
  assert.equal(r.events.length, 0, 'not yet — the sample is thin')
  assert.equal(r.oracle('mage hunter'), null)
  r.swing(20, { stance: 'mage hunter' })
  assert.equal(r.events.length, 1, 'the same target, the same stance, now with evidence')
  // It spoke the moment it had enough and not before: at least the gate, no more than the whole
  // fight — the same pooling the shared layer does, over the same samples.
  const pooled = pooledProfile(r.ledger.targets()[0].samples)
  assert.ok(r.events[0].hits >= MIN_CONFIDENT_HITS)
  assert.ok(r.events[0].hits <= pooled.hits)
})

// ─────────────────────────────────────────────────────────────────────────────
// §D THE ALERT — the shipped group def, the real AlertsModule, and honest copy.

/** The one def the "Wrong stance for this mob" group authors. */
function stanceDef(over?: Partial<AlertDef>): AlertDef {
  const group = ALERT_GROUPS.find((g) => g.id === 'stance')
  assert.ok(group, 'the stance group must exist in the catalog')
  const def = alertGroupDefs(group)[0]
  return { ...def, ...over }
}

/** Feed derived events straight into a real AlertsModule (no parser — no line exists). */
function fire(defs: AlertDef[], events: StanceMismatchEvent[], live = true): string[] {
  const mod = new AlertsModule()
  mod.setDefs(defs)
  mod.reset()
  for (const ev of events) mod.onEvent(ev, live)
  return (mod.flushDelta()?.delta.fired ?? []).map((f) => f.matchedText)
}

test('SM-D1 the shipped def fires on the derived event, and its cooldown is the last bound', () => {
  const { events } = replayWindow({ live: true })
  assert.ok(events.length >= 4, 'the window must exercise the cooldown to be worth asserting on')

  // Uncapped, every event speaks — the trigger matches the kind, with no `where` to narrow it.
  assert.equal(fire([stanceDef({ cooldownMs: 0 })], events).length, events.length)

  // With the shipped 60-second clock, a three-minute window of advice collapses into a couple of
  // nudges. Asserted as a bound rather than a count: the fixture may be re-cut, the design
  // promise ("you are not told twice in a minute") may not.
  const shipped = fire([stanceDef()], events)
  assert.ok(shipped.length >= 1, 'the first piece of advice always speaks')
  const spanMs = events[events.length - 1].ts - events[0].ts
  assert.ok(
    shipped.length <= Math.ceil(spanMs / 60_000) + 1,
    `${shipped.length} fires across ${Math.round(spanMs / 1000)}s breaks the one-per-minute bound`
  )
  // Replay never makes a sound, whatever the events say (the alerts module's own gate).
  assert.equal(fire([stanceDef({ cooldownMs: 0 })], events, false).length, 0)
})

test('SM-D2 the message names the mob, the stance and the measured gain — and disowns the game', () => {
  const { events } = replayWindow({ live: true })
  const spoken = fire([stanceDef({ cooldownMs: 0 })], events)
  assert.equal(spoken.length, events.length)
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const text = spoken[i]
    // The alert's user-facing text IS the event's own sentence — one writer, no re-derivation.
    assert.equal(text, ev.raw)
    assert.ok(text.includes(ev.target), 'names the mob')
    assert.ok(/\b(Defensive|Mage Hunter|Evasive|Balanced|Channeler)\b/.test(text), 'names a stance to switch to')
    assert.ok(text.includes(`${ev.lessPct}% less`), 'states the measured gain')
    assert.ok(text.includes(`${ev.hits} landed hits`), 'states the sample it is built on')
    // WORLD-MODEL LAW 1. Nothing in the game printed this, and the sentence says so.
    assert.match(text, /Derived by this app/)
    assert.ok(!text.startsWith('You '), 'must not read like a line EQ wrote')
    // Evasive wins on raw arithmetic and stances.ts requires any surface that ranks it first to
    // say why that is not the whole story — the log never prints endurance.
    if (ev.best === 'evasive') assert.match(text, /endurance/)
  }
})

test('SM-D3 the derived event is an ordinary event to everything downstream', () => {
  const { events } = replayWindow({ live: true })
  const ev = events[0]
  // FIELD MATCHERS work on it, which is the whole reason it is an event and not a bespoke IPC:
  // a user can narrow the alert to one recommendation without any new machinery.
  const narrowed: AlertDef = stanceDef({
    id: 'narrow',
    cooldownMs: 0,
    trigger: { type: 'event', kind: 'stanceMismatch', where: { best: ev.best } }
  })
  assert.equal(fire([narrowed], events).length, events.filter((e) => e.best === ev.best).length)
  const impossible: AlertDef = stanceDef({
    id: 'nope',
    cooldownMs: 0,
    trigger: { type: 'event', kind: 'stanceMismatch', where: { best: 'balanced' } }
  })
  assert.equal(fire([impossible], events).length, 0, 'a recommendation nobody made fires nothing')
  // And the cooldown SCOPE the alerts module already has works because the event names a mob.
  const perMob = fire([stanceDef({ id: 'per-mob', cooldownMs: 60_000, cooldownScope: 'target' })], events)
  assert.ok(perMob.length >= new Set(events.map((e) => e.target)).size - 1)
})

test('SM-D4 the catalog entry is honest about being derived', () => {
  const group = ALERT_GROUPS.find((g) => g.id === 'stance')
  assert.ok(group)
  assert.equal(group.verified, true, 'it ships: the event it fires on is code we wrote, not a guess')
  assert.ok(VERIFIED_ALERT_GROUPS.includes(group), 'and it reaches the UI')
  const spec = group.defs[0]
  assert.equal(spec.derived, true)
  // ZERO BY CONSTRUCTION — this sentence appears in no log, ever, because the app writes it.
  assert.equal(spec.observed, 0)
  const kind: LogEventKind = 'stanceMismatch'
  assert.deepEqual(spec.trigger, { type: 'event', kind })
  // The note tells the user what the alert IS before they enable it: derived, gated on a real
  // sample, quiet about small gains, and once per mob per fight.
  assert.match(spec.note ?? '', /DERIVED/)
  assert.match(spec.note ?? '', /40\+/)
  assert.match(spec.note ?? '', /once per mob per fight/)
  // (That the `derived` exemption stays exactly one flag wide across the WHOLE catalog is
  // tests/alertGroups.test.mts G8's job — that file is the catalog's own suite.)
})
