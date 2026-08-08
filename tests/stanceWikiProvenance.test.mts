// STANCE PROVENANCE — the guard that stops the hand-authored multipliers drifting from the wiki.
//
// ── WHAT THIS PROTECTS ──────────────────────────────────────────────────────────────────────
//
// `src/shared/stances.ts` hand-authors what each of the nine stances DOES: a multiplier on
// incoming physical damage, a multiplier on incoming magical damage, and the flags a ranking
// needs (`enduranceGated`, `free`, `offensiveOnly`). Those numbers are typed by a human on
// purpose — law 12's argument, the same one the wiki↔client slot join makes: eleven sentences of
// quantified English ("All incoming melee damage is reduced by 50% and incoming magical damage
// is reduced by 20%.") are not something a regex may interpret, because getting one wrong
// produces a CONFIDENT WRONG recommendation rather than a visible parse failure.
//
// The price of hand-authoring is drift. If the wiki re-tunes Defensive from 50% to 40%, nothing
// in the app notices — the advice just quietly becomes wrong. So every entry carries the wiki's
// own sentence in `wiki`, and THIS FILE is the ratchet: each of those sentences must still appear
// VERBATIM inside the scraped Description prose for the matching stance. A re-tune fails the
// suite, loudly, beside the number it invalidates.
//
// ── WHY IT READS THE WIKITEXT CACHE AND NOT classes.json ────────────────────────────────────
//
// The intended source is `classes.json`'s new `stanceDescriptions` key, produced by
// `parseProseDescriptions` (scripts/sources/classWiki.ts) out of the Stances table's middle
// column. That key is NOT in the committed `classes.json` yet, and deliberately so — see the
// commit message: regenerating the file on a `core.autocrlf=true` checkout also rewrites 36
// unrelated `disputed[]` rows, because two of the OTHER parsers on that page anchor with `$` and
// the committed LF cache materializes as CRLF here. Shipping that noise would be a data refresh
// smuggled inside a feature, so the data half waits for a checkout that can regenerate cleanly.
//
// Until then the provenance is asserted at its true SOURCE: the committed wikitext cache, run
// through the very function the scraper uses. Nothing here is weaker for it — the cache is what
// `classes.json` is derived from — and the last test below is written so that it also checks the
// derived key the moment it appears, without needing an edit.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseProseDescriptions, sliceSection } from '../scripts/sources/classWiki'
import { STANCE_EFFECTS } from '../src/shared/stances'

const HERE = dirname(fileURLToPath(import.meta.url))

/** The raw page the class scrape reads, exactly as committed (`npm run scrape:classes` cache). */
const WIKITEXT = readFileSync(
  join(HERE, '..', 'scripts', 'sources', 'cache', 'classes', 'Stances_Invocations.wikitext'),
  'utf8'
)

/**
 * The `== Stances ==` table only. Same slice the scraper hands `parseProseTable`, so the two
 * columns of one row are read out of one block and can never come from different tables.
 */
const STANCE_BLOCK = sliceSection(WIKITEXT, /^== Stances ==$/m, /^=== Stances by Class/m)

/** stance key → Description prose. What `classes.json.stanceDescriptions` is built from. */
const DESCRIPTIONS = parseProseDescriptions(STANCE_BLOCK)

interface ClassesDb {
  stances: Record<string, string[]>
  /** Optional until the data half lands — see the header. */
  stanceDescriptions?: Record<string, string>
}

const DB = JSON.parse(
  readFileSync(join(HERE, '..', 'src', 'main', 'data', 'classes.json'), 'utf8')
) as ClassesDb

// =============================================================================
// 1. Coverage: every stance the app knows about HAS a description
// =============================================================================

test('SP: every stance in classes.json has a non-empty description in the same table', () => {
  const stances = Object.keys(DB.stances).sort()
  // The committed table states nine, and the page is where that number comes from.
  assert.equal(stances.length, 9, `classes.json states ${stances.length} stances, expected 9`)

  for (const key of stances) {
    const text = DESCRIPTIONS.get(key)
    assert.ok(
      text !== undefined,
      `stance '${key}': the Stances table has a Classes cell for it but no Description cell — ` +
        'the row shape changed, or clientKey() no longer keys the two columns alike'
    )
    assert.ok(text.length > 0, `stance '${key}': the Description cell parsed to an empty string`)
  }

  // And nothing extra: a description keyed to a stance nobody can wear would mean the two
  // columns of the SAME table disagreed about which rows exist.
  assert.deepEqual([...DESCRIPTIONS.keys()].sort(), stances)
})

test('SP: the effect table covers exactly those nine stances, keyed identically', () => {
  // src/shared/stances.ts keys on the CLIENT string (`stanceChange.stance`, lowercased), which
  // is what `clientKey()` produces — this is the assertion that the three sets are one set.
  assert.deepEqual(Object.keys(STANCE_EFFECTS).sort(), Object.keys(DB.stances).sort())
})

// =============================================================================
// 2. Provenance: each hand-authored effect still quotes ITS OWN row, verbatim
// =============================================================================

test('SP: every STANCE_EFFECTS.wiki sentence appears verbatim in that stance description', () => {
  for (const effect of Object.values(STANCE_EFFECTS)) {
    const text = DESCRIPTIONS.get(effect.key)
    assert.ok(text !== undefined, `${effect.name}: no Description cell for key '${effect.key}'`)
    assert.ok(
      text.includes(effect.wiki),
      `${effect.name}: the wiki's Description no longer contains the sentence the multipliers ` +
        `(physical ${effect.physical}, magical ${effect.magical}) were read off. RE-READ the ` +
        `page before trusting them.\n  expected: ${effect.wiki}\n  actual:   ${text}`
    )
  }
})

// The four rows the recommendation actually leans on, pinned individually so a failure names the
// number that broke rather than "one of nine sentences moved". Each is the measured evidence for
// the multiplier beside it in src/shared/stances.ts.
test('SP: the four defensive rows state the exact percentages the multipliers encode', () => {
  const desc = (k: string): string => DESCRIPTIONS.get(k) ?? ''

  // 0.5 physical / 0.8 magical — the only stance that splits melee from magical by name.
  assert.match(
    desc('defensive'),
    /All incoming melee damage is reduced by 50% and incoming magical damage is reduced by 20%\./
  )
  // 0.8 physical / 0.5 magical — the same partition seen from the other side ("spell"/"physical").
  assert.match(
    desc('mage hunter'),
    /All incoming spell damage is reduced by 50% and incoming physical damage is reduced by 20%\./
  )
  // 0.9/0.9, and the ONLY row that states there is no upkeep — that sentence is what `free` means.
  assert.match(desc('balanced'), /All incoming damage is reduced by 10%/)
  assert.match(desc('balanced'), /There is no endurance cost to upkeep this stance\./)
  // 0.05/0.05 AND `enduranceGated`. The gate is not an inference: the page says evasion FAILS.
  assert.match(desc('evasive'), /You have a 95% chance to evade all incoming attacks\./)
  assert.match(
    desc('evasive'),
    /Evasion will fail if you have insufficient endurance, or while playing dead\./
  )
})

// =============================================================================
// 3. Parser shape: the two things that silently corrupted this column before
// =============================================================================

test('SP: section markers and [[link]] brackets are stripped, link TEXT survives', () => {
  for (const [key, text] of DESCRIPTIONS) {
    // `<section begin="Defensive" />…<section end="Defensive" />` wraps every cell (the wiki
    // transcludes these onto the class pages). A leaked marker would be quoted at the user.
    assert.ok(!text.includes('<section'), `stance '${key}': a <section> marker survived`)
    assert.ok(!text.includes('[['), `stance '${key}': an unstripped [[wiki link]] survived`)
    assert.ok(!text.includes(']]'), `stance '${key}': an unstripped ]] survived`)
    // Whitespace is collapsed: one row is one line, never a wikitext newline.
    assert.ok(!/\s{2,}|\n|\r/.test(text), `stance '${key}': whitespace was not collapsed`)
  }
  // The link TEXT is kept — `[[strategy]]` is the skill that reduces the endurance cost, and
  // dropping the word would make the sentence lie about what reduces it.
  assert.match(
    DESCRIPTIONS.get('defensive') ?? '',
    /with a reduction based on your strategy skill\./
  )
})

test('SP: the two MULTI-LINE cells are captured whole, not truncated at the first newline', () => {
  // Offensive and Striker continue on bare lines carrying no leading `|`. `rowCells` filters to
  // `|`-prefixed lines, so reusing it would have cut both cells mid-cell and silently lost the
  // endurance clause — the sentence a UI must show beside an offensive recommendation.
  for (const key of ['offensive', 'striker']) {
    const text = DESCRIPTIONS.get(key) ?? ''
    assert.match(
      text,
      /When below 25% endurance, the chance to hit bonus is reduced based on the remaining percent of endurance\./,
      `stance '${key}': the continuation line after the first sentence was dropped`
    )
    assert.match(
      text,
      /Bonus damage from critical hits and similar effects do not cost endurance\./,
      `stance '${key}': the last continuation line was dropped`
    )
  }
})

// =============================================================================
// 4. Forward guard: when `stanceDescriptions` lands in classes.json, it must MATCH
// =============================================================================

test('SP: if classes.json carries stanceDescriptions, it equals what the cache parses to', () => {
  const shipped = DB.stanceDescriptions
  if (shipped === undefined) {
    // Not a silent skip: state WHY, so this branch is a note and not a hole. The scraper writes
    // the key; this checkout could not regenerate the file without unrelated CRLF churn.
    console.log('    (classes.json has no stanceDescriptions yet — asserted against the cache)')
    return
  }
  assert.deepEqual(shipped, Object.fromEntries([...DESCRIPTIONS].sort(([a], [b]) => (a < b ? -1 : 1))))
})
