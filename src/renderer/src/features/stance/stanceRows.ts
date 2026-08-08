// WHAT THE PANEL SAYS, decided here — the whole of the stance view's arithmetic-adjacent logic,
// in a plain module the node suite can run.
//
// ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────────────────────
//
// None of the MATHS lives here. `shared/stances.ts` owns the wiki's multipliers and the ranking,
// `shared/stanceAdvice.ts` owns the pooling, the confidence gate and the mismatch verdict, and
// this module is forbidden from re-deriving any of it — a second copy of "which stance wins"
// that disagrees with the one the alert fires on is the worst outcome this feature could have.
// What lives here is the SHAPING: joining a target to its advice, turning fractions into the
// words on screen, and — the part that actually needed a test — enumerating the CAVEATS.
//
// ── THE CAVEATS ARE THE FEATURE ─────────────────────────────────────────────────────────────
//
// The advice layer refuses in four different ways and each refusal is invisible in the ranking
// itself: a two-hit sample ranks exactly as confidently as a four-hundred-hit one, Evasive wins
// every ranking on a number the log cannot verify, and a profile built entirely inside Evasive
// reads as "no damage" rather than "nothing usable". So `caveatsFor` walks the advice and emits
// one plain sentence per real reservation, the view renders them ON the card rather than in a
// tooltip, and this file's test pins the exact conditions under which each one appears. That is
// world-model law 1 (anything inferred is LABELED inferred) applied to a surface whose entire
// content is inference.
//
// ── THE HEADLINE IS `sustained`, NOT `ranked[0]` ────────────────────────────────────────────
//
// The shared layer now splits its answer in two (`bestSustained` / `bestEmergency`) and this
// module carries that split all the way to the pixels, because a split the UI does not honour is
// no split at all. `calloutFor` reads `advice.sustained` and has NO fallback to the gated pick;
// `RankedRow.recommended` marks that stance rather than the arithmetic winner; the gated caveat
// is keyed on `advice.emergency` and rides `display: 'survive'` so it renders attached to the
// escape hatch instead of above the recommendation. `advice.ranked` is still shown in full — it
// is honest arithmetic and hiding it would be its own dishonesty — but nothing about the way it
// is drawn says the answer is Evasive.
//
// ── THE TIER LABEL, AND WHERE IT COMES FROM ─────────────────────────────────────────────────
//
// `TIER_LABELS` ('d0', 'd1 · Awakened', …) lives in `src/main/log/parseWorld.ts`, and the
// renderer bundle may not import from `src/main` (ZoneStrip.tsx's header states the same rule).
// The renderer's OWN copy of that table is `lib/tierChip.ts` — `TIER_STYLES[n].long` is
// 'D2 · Adaptive' where main's is 'd2 · Adaptive', the same five names with the app's chip
// casing — so the label is read from there rather than re-typed a third time here.

import { adviseFor, detectMismatch, MIN_CONFIDENT_HITS } from '../../../../shared/stanceAdvice'
import type { StanceAdvice, StanceAdvicePayload, StanceMismatch, StanceSample, TargetProfile } from '../../../../shared/stanceAdvice'
import { mitigationFor, STANCE_EFFECTS, unmitigate } from '../../../../shared/stances'
import type { DamageProfile } from '../../../../shared/stances'
import { tierStyle } from '../../lib/tierChip'

/** A fraction (0.617) as the panel prints it ('62%'). Rounded, never truncated. */
export function pct(fraction: number): string {
  return `${String(Math.round(fraction * 100))}%`
}

/**
 * The physical/magical split as two integers that ADD TO 100.
 *
 * Rounding each half independently prints "62% physical · 39% magical" often enough to look like
 * a bug, so the magical half is rounded and the physical half is whatever is left. `null` when
 * nothing usable was measured — a 50/50 default would be a fabricated profile (law 1).
 */
export function splitPct(magicalShare: number | null): { physical: number; magical: number } | null {
  if (magicalShare === null) return null
  const magical = Math.round(magicalShare * 100)
  return { physical: 100 - magical, magical }
}

/** How a stance key reads on screen. `''` is the ledger's real "nothing was committed" bucket. */
export function stanceLabel(stanceKey: string): string {
  if (stanceKey === '') return 'No stance committed'
  return STANCE_EFFECTS[stanceKey.toLowerCase()]?.name ?? stanceKey
}

/**
 * ONE RAW OBSERVATION, and the correction applied to it.
 *
 * This is the row behind the "show me the observations" expander, and it exists so the
 * un-mitigation is LEGIBLE rather than merely claimed: the sample says what the log printed
 * (physical/magical/hits as they landed), the multipliers say what was divided out, and
 * `unmitigated` is the result that went into the pool. A refused sample carries `null` and says
 * why — `unmitigate` returns null for an endurance-gated stance because a hit that got past a
 * 95% evade is full-sized, not 5%-sized.
 */
export interface SampleRow {
  stanceKey: string
  stanceLabel: string
  hits: number
  /** as observed, post-mitigation */
  observed: DamageProfile
  /** the multipliers divided out; 1/1 for the no-stance bucket */
  multiplier: DamageProfile
  /** what the mob swung for, or null when the sample was refused */
  unmitigated: DamageProfile | null
  /** true when this sample contributed NOTHING to the pooled profile */
  refused: boolean
}

/** Every sample the ledger holds for a target, un-mitigated the same way `pooledProfile` does. */
export function sampleRows(samples: readonly StanceSample[]): SampleRow[] {
  return samples.map((s) => {
    const observed = { physical: s.physical, magical: s.magical }
    const un = unmitigate(observed, s.stanceKey)
    return {
      stanceKey: s.stanceKey,
      stanceLabel: stanceLabel(s.stanceKey),
      hits: s.hits,
      observed,
      multiplier: mitigationFor(s.stanceKey),
      unmitigated: un,
      refused: un === null
    }
  })
}

/** Why a caveat is on screen. The kind is the stable handle; the text is what the user reads. */
export type CaveatKind =
  /** nothing usable was measured — every sample was refused, or there are none */
  | 'nothing'
  /** fewer than MIN_CONFIDENT_HITS pooled hits: reported, never recommended */
  | 'thin'
  /** the survive-mode option's reduction can fail for a reason the log cannot show */
  | 'gated'
  /** hits were dropped from the pool, and how many */
  | 'evaded'
  /** the loadout has no defensive stance to rank at all */
  | 'noStances'
  /** the loadout ranks something, but every option it ranks can fail — nothing is holdable */
  | 'noSustained'

/**
 * WHERE a caveat is allowed to be quiet, decided here rather than by the component.
 *
 * The card used to stack up to five full-width Alerts above the answer, which is the shouting
 * that makes people stop reading — and a caveat nobody reads is worse than one that was never
 * written, because the surface still gets credit for having said it. So each reservation now
 * carries its own volume, and the two that are LOAD-BEARING keep the loud one:
 *
 *   * `banner` — visible prose on the card. `thin` and `noSustained` are here because they are
 *     the difference between a measurement and a recommendation; `nothing` and `noStances` are
 *     here because without them the card is simply blank and looks broken.
 *   * `survive` — rendered INSIDE the survive-mode block, where the thing it qualifies is. The
 *     endurance-gated warning is still fully visible text; it has just stopped being an Alert
 *     floating above advice it does not apply to.
 *   * `chip` — a short colored chip with the whole sentence on hover. Only `evaded`, which
 *     explains a number (the dropped hits) that is already on screen next to it.
 */
export type CaveatDisplay = 'banner' | 'survive' | 'chip'

/**
 * `'warn'` qualifies an answer that IS on screen; `'info'` explains why there is none. The old
 * card made the same distinction with MUI's `severity`; it lives here now so the component picks
 * a color rather than deciding a meaning.
 */
export type CaveatTone = 'warn' | 'info'

export interface StanceCaveat {
  kind: CaveatKind
  display: CaveatDisplay
  tone: CaveatTone
  /** two or three words, for the chip face and for scanning a row of them */
  short: string
  text: string
}

/** The "thin sample" sentence — shared by the caveat and the card's headline chip. */
function thinText(hits: number): string {
  return (
    `Thin sample: ${String(hits)} pooled hit${hits === 1 ? '' : 's'}, under the ${String(MIN_CONFIDENT_HITS)} ` +
    'this needs to have an opinion. This is what the log has seen so far, not a recommendation.'
  )
}

/**
 * The endurance sentence, and the reason it is a whole sentence rather than a chip.
 *
 * Evasive's 0.05 is arithmetically dominant, so it wins essentially every ranking it appears in
 * — on a 95% evade that "will fail if you have insufficient endurance", and THE LOG NEVER PRINTS
 * ENDURANCE: not a pool, not a tick, not a failure. So the app cannot verify the number the raw
 * arithmetic just put at the top of the list is sustainable for one more second, and it has to
 * say so where that number is, not behind a hover.
 *
 * It is `display: 'survive'` rather than `'banner'` for exactly that reason: it now renders
 * inside the survive-mode block, attached to the stance it is about, instead of floating above a
 * recommendation it does NOT apply to. `bestSustained` took Evasive out of the headline; this
 * sentence is what stops it being read as one anyway.
 */
function gatedText(name: string): string {
  return (
    `${name}'s 95% evade is ENDURANCE-GATED — the wiki says evasion fails when endurance runs out, ` +
    'and it charges two endurance for every point it evades. The log never prints endurance, so ' +
    'this app cannot tell you whether you can hold it for one more second. That is why it is ' +
    'offered as survive mode and never as the standing recommendation.'
  )
}

/**
 * The loadout whose ONLY defensive option can fail.
 *
 * `bestSustained` returns null here, and the honest answer is "there is no stance to stand in",
 * not "here is the gated one anyway". Falling back to the gated pick would rebuild exactly the
 * behaviour the split was made to remove — with the added insult of doing it silently.
 */
function noSustainedText(): string {
  return (
    'No standing recommendation: every defensive stance this loadout can wear against it is ' +
    'endurance-gated, so there is nothing here you can simply hold. Survive mode is the only ' +
    'option the ranking has, and it is not a substitute for one.'
  )
}

/** The dropped-hits sentence. `stances` names the refused buckets so it is checkable. */
function evadedText(hits: number, stances: readonly string[]): string {
  const worn = stances.length > 0 ? ` (worn: ${stances.join(', ')})` : ''
  return (
    `${String(hits)} hit${hits === 1 ? '' : 's'} left out of this profile${worn}: a hit that gets past a 95% ` +
    'evade is full-sized, not 5%-sized, so dividing it back out would invent a monster twenty ' +
    'times too big. Evasive samples measure nothing about how hard this mob hits.'
  )
}

/**
 * Every reservation this advice carries, in the order the card shows them.
 *
 * `refusedStances` comes from the sample rows rather than being re-derived, so the names in the
 * dropped-hits sentence are the same buckets the observations table shows as refused.
 */
export function caveatsFor(advice: StanceAdvice, refusedStances: readonly string[]): StanceCaveat[] {
  const out: StanceCaveat[] = []
  if (advice.hits === 0) {
    out.push({
      kind: 'nothing',
      display: 'banner',
      tone: 'info',
      short: 'nothing usable',
      text:
        'Nothing usable measured yet. Every hit this mob has landed on you arrived while an ' +
        'endurance-gated stance was worn, so none of them says how hard it hits.'
    })
  } else if (!advice.confident) {
    out.push({ kind: 'thin', display: 'banner', tone: 'warn', short: 'thin sample', text: thinText(advice.hits) })
  }
  // AGAINST `advice.sustained`, never `ranked[0]`: the ranking is honest arithmetic and Evasive
  // heads it almost everywhere, so a caveat keyed on the ranking's winner was really a caveat
  // about a headline the card no longer prints.
  if (advice.ranked.length > 0 && advice.sustained === null) {
    out.push({
      kind: 'noSustained',
      display: 'banner',
      tone: 'warn',
      short: 'no holdable stance',
      text: noSustainedText()
    })
  }
  const gated = advice.emergency
  if (gated) {
    out.push({
      kind: 'gated',
      display: 'survive',
      tone: 'warn',
      short: 'endurance-gated',
      text: gatedText(gated.effect.name)
    })
  }
  if (advice.evadedHitsIgnored > 0) {
    out.push({
      kind: 'evaded',
      display: 'chip',
      tone: 'warn',
      short: `${String(advice.evadedHitsIgnored)} hit${advice.evadedHitsIgnored === 1 ? '' : 's'} dropped`,
      text: evadedText(advice.evadedHitsIgnored, refusedStances)
    })
  }
  if (advice.hits > 0 && advice.ranked.length === 0) {
    out.push({
      kind: 'noStances',
      display: 'banner',
      tone: 'info',
      short: 'no defensive stance',
      text:
        'This class loadout has no defensive stance to rank — the offensive stances say nothing ' +
        'about incoming damage, so they are left out rather than ranked last.'
    })
  }
  return out
}

/** The caveats that render at one volume. The card asks for a group; it never filters by kind. */
export function caveatsAt(caveats: readonly StanceCaveat[], display: CaveatDisplay): StanceCaveat[] {
  return caveats.filter((c) => c.display === display)
}

/** One stance in the ranking, with everything the row needs already decided. */
export interface RankedRow {
  key: string
  name: string
  /** expected damage taken as a share of the un-mitigated total (0.62) */
  fraction: number
  /** that share, printed ('62%') */
  percent: string
  /** expected damage taken, in points, over the pooled profile */
  expected: number
  /**
   * This row IS `advice.sustained` — the stance to actually wear.
   *
   * Deliberately not "first in the ranking", which is what this flag used to mean. Evasive's
   * 0.05 heads the raw arithmetic against essentially every mob, so emphasising `ranked[0]` made
   * every card in the tab say "the answer is Evasive" — the exact reading `bestSustained` exists
   * to refuse. At most one row carries it, and a loadout whose only defensive option is gated
   * carries it on none.
   */
  recommended: boolean
  /** This row IS `advice.emergency` — survive mode, never presented as the standing answer. */
  emergency: boolean
  /** the stance currently worn */
  current: boolean
  enduranceGated: boolean
  free: boolean
}

function rankedRows(advice: StanceAdvice, currentKey: string | null): RankedRow[] {
  const cur = currentKey?.toLowerCase() ?? null
  const sustainedKey = advice.sustained?.effect.key ?? null
  const emergencyKey = advice.emergency?.effect.key ?? null
  return advice.ranked.map((r) => ({
    key: r.effect.key,
    name: r.effect.name,
    fraction: r.fraction,
    percent: pct(r.fraction),
    expected: r.expected,
    recommended: r.effect.key === sustainedKey,
    emergency: r.effect.key === emergencyKey,
    current: r.effect.key === cur,
    enduranceGated: r.effect.enduranceGated,
    free: r.effect.free
  }))
}

/** Everything one card renders. Built once per payload; the card component decides nothing. */
export interface StanceTargetRow {
  /** (mob, zone, tier) — the same composite the ledger keys its rows on */
  key: string
  mobName: string
  zoneBase: string
  tier: number
  /** 'D2 · Adaptive' (lib/tierChip — main's TIER_LABELS is not importable here) */
  tierLabel: string
  lastSeenTs: number
  /** the single biggest landed hit, AS OBSERVED — never un-mitigated */
  biggestHit: number
  advice: StanceAdvice
  ranked: RankedRow[]
  /** `advice.sustained` as a row — THE recommendation. Null when nothing here can be held. */
  sustained: RankedRow | null
  /** `advice.emergency` as a row — the escape hatch, drawn apart from the recommendation. */
  emergency: RankedRow | null
  samples: SampleRow[]
  /** the split of the un-mitigated profile, as two integers summing to 100; null if unmeasured */
  split: { physical: number; magical: number } | null
  /** how many samples actually reached the pool — "corrected across N stances you wore" */
  usedSamples: number
  mismatch: StanceMismatch | null
  caveats: StanceCaveat[]
  /** the stance worn right now IS one this mob was measured in */
  currentStanceKey: string | null
}

/**
 * Join one target to its advice and its verdict.
 *
 * Both come from the shared layer and neither is recomputed: `adviseFor` pools + ranks, and
 * `detectMismatch` decides whether the "you are in the wrong stance" callout appears at all (it
 * refuses on a thin sample, on no committed stance, on already-best, and on a trivial gain).
 * A card that decided that for itself would disagree with the alert sooner or later.
 */
export function buildStanceRow(target: TargetProfile, payload: StanceAdvicePayload): StanceTargetRow {
  const advice = adviseFor(target, payload.availableStances)
  const samples = sampleRows(target.samples)
  const ranked = rankedRows(advice, payload.currentStance)
  return {
    key: `${target.mobKey}|${target.zoneBase}|${String(target.tier)}`,
    mobName: target.mobName,
    zoneBase: target.zoneBase,
    tier: target.tier,
    tierLabel: tierStyle(target.tier).long,
    lastSeenTs: target.lastSeenTs,
    biggestHit: target.biggestHit,
    advice,
    ranked,
    // Found in `ranked` rather than re-shaped from `advice`, so the callout and the list row it
    // highlights are literally the same object and cannot drift apart.
    sustained: ranked.find((r) => r.recommended) ?? null,
    emergency: ranked.find((r) => r.emergency) ?? null,
    samples,
    split: splitPct(advice.magicalShare),
    usedSamples: samples.filter((s) => !s.refused && s.hits > 0).length,
    mismatch: detectMismatch(target, payload.availableStances, payload.currentStance),
    caveats: caveatsFor(
      advice,
      samples.filter((s) => s.refused).map((s) => s.stanceLabel)
    ),
    currentStanceKey: payload.currentStance
  }
}

/** Every target, most-recently-hit first. The engine already sorts; this makes it independent. */
export function buildStanceRows(payload: StanceAdvicePayload): StanceTargetRow[] {
  return payload.targets
    .map((t) => buildStanceRow(t, payload))
    .sort((a, b) => b.lastSeenTs - a.lastSeenTs)
}

/**
 * THE HEADLINE, as words — and the one place the split is turned into a sentence.
 *
 * `stance` is `advice.sustained` and nothing else. There is deliberately no fallback: a loadout
 * whose only defensive option is endurance-gated gets `null` and a heading that says there is no
 * standing recommendation, because quietly promoting the gated option would rebuild the very
 * behaviour the player corrected ("it isn't always the best, it's like temp/survive mode").
 */
export interface StanceCallout {
  /** the stance to wear, or null when nothing in this loadout can be held against this mob */
  stance: RankedRow | null
  /** the two or three words above the name — 'Wear', 'Stay in', or the refusal */
  heading: string
  /** the sentence under it */
  detail: string
}

export function calloutFor(row: StanceTargetRow): StanceCallout {
  const s = row.sustained
  if (!s) {
    return {
      stance: null,
      heading: 'No standing recommendation',
      detail:
        row.advice.ranked.length === 0
          ? 'There is no defensive stance here to rank — see the note above.'
          : 'Every option this loadout ranks can fail when endurance runs out, so none of them is a stance you can simply stand in.'
    }
  }
  return {
    stance: s,
    heading: s.current ? 'Stay in' : 'Wear',
    detail:
      `${s.name} is the best stance you can HOLD against this: it takes ${s.percent} of what the mob ` +
      'swings for, and its reduction does not fail when endurance runs out.'
  }
}

/**
 * The survive-mode sentence. Phrased as an ACTION with an end to it ("pop … then drop back"),
 * because the mistake this whole split corrects is reading Evasive as somewhere you live.
 */
export function surviveLine(e: RankedRow): string {
  return (
    `${e.name} would take ${e.percent} of it — pop it to live through a spike and then drop back. ` +
    'It is an escape hatch, not a stance to stand in.'
  )
}

/**
 * The wrong-stance callout, in one sentence.
 *
 * It names both fractions rather than only the gain, because "switch, you would take 12% less"
 * is unactionable without knowing whether that is 95%→83% or 20%→8%. `gain` is the shared
 * layer's own number (already past MIN_GAIN) and is not recomputed.
 */
export function mismatchLine(m: StanceMismatch): string {
  const current = STANCE_EFFECTS[m.currentKey]?.name ?? m.currentKey
  const best = STANCE_EFFECTS[m.bestKey]?.name ?? m.bestKey
  return (
    `You are in ${current}: against ${m.target.mobName} that takes ${pct(m.currentFraction)} of what it ` +
    `swings for. ${best} would take ${pct(m.bestFraction)} — ${pct(m.gain)} of its damage, gone.`
  )
}

/** How many of the visible targets are in the wrong stance right now — the view's headline. */
export function mismatchCount(rows: readonly StanceTargetRow[]): number {
  return rows.filter((r) => r.mismatch !== null).length
}
