// MOTES OF POTENTIAL — the upgrade currency, and what a drop is actually WORTH.
//
// Motes upgrade gear and spells (eqlwiki "Mote Guide"). There are ten of them in a ladder, they
// are TINY / ALL classes / ALL races, and every one of them says the same thing in its item entry:
// "Motes can be used to upgrade gear and spells." What the item entries do NOT say is where they
// come from — all ten have an empty `dropsfrom`, because the wiki's own answer is the string
// "Various Zones / Various Monsters". So the wiki can price a mote and cannot tell you where to
// farm one. That is the division of labour this file is built around: the TABLE below is the wiki's
// (hand-authored, provenance-tested), and WHERE motes come from is answered from the log alone
// (shared/moteFarming.ts).
//
// ── EXP IS THE CURRENCY, NOT COUNT ──────────────────────────────────────────────────────────
//
// "I got 20 motes" is almost meaningless: a Mote of Infinitesimal Potential is worth 1 exp and a
// Mote of Infinite Potential is worth 10, so a farming spot that yields six infinitesimals is
// worse than one that yields a single Potential. Every rate this feature reports is therefore
// available in EXP as well as in count, and the exp figure is the one the UI leads with.
//
// ── THE LEVEL TABLE IS THE WIKI'S CLAIM AND THIS LOG REFUTES IT ─────────────────────────────
//
// The guide also carries a player-level → mote-level table (level 1 ⇒ tier 1, 15 ⇒ 3, 20 ⇒ 4 …)
// and asserts that "the player's level will affect the level of the motes that drop". It is
// reproduced here as `WIKI_LEVEL_CLAIM` and it is DELIBERATELY NOT ENFORCED anywhere, because the
// owner's own log contradicts it by a wide margin, and by timestamp rather than by inference:
//
//   * the log's four level-ups are Sat Aug 08 00:10 → 00:50, reaching level 17;
//   * `Mote of Major Potential` (ladder 5) was looted Fri Aug 07 12:40, from Master Yael;
//   * three `Mote of Potential` (ladder 4) and three `Mote of Lesser Potential` (3) also landed
//     on the Friday — i.e. at level 13 or below, where the table allows ladder 2 at most.
//
// The wiki flags its own uncertainty ("Tiers 1-3 need confirmation on level drop"), so this is a
// documented gap rather than a contradiction someone has to be told about. Enforcing a cap the
// evidence refutes would make the app confidently hide drops the player can plainly see, which is
// worse than having no cap at all. The claim is carried so the UI can SHOW the disagreement.
//
// What the same log does support is the guide's other clause — difficulty and mob strength drive
// the tier. Every one of the six mobs that dropped a ladder-3-or-better mote is a RAID TARGET in
// the committed bosses DB (Master Yael, Cazic-Thule, Fright, Dread, Maestro of Rancor, Innoruuk),
// and five of the six that dropped an Infinitesimal are ordinary mobs. The exception is honest and
// is why this is a tendency and not a rule: `Bazzt Zzzt`, a raid target, dropped an Infinitesimal.

/** The ten motes, lowest first. `key` is the lowercased item name — the loot-row join key. */
export interface Mote {
  /** lowercased full item name, e.g. 'mote of major potential' */
  key: string
  /** display name, wiki casing */
  name: string
  /** the one-word tier ('Infinitesimal', 'Potential', 'Major', …) for compact display */
  short: string
  /** 1..10, position on the ladder. NOT a game-stated number; it is this table's own index. */
  ladder: number
  /** experience one of these adds to an item or a spell. The wiki's number. */
  exp: number
  /**
   * The highest ITEM tier this mote may be used on. A Mote of Major Potential gives 5 exp to a
   * tier-4 item or lower and "cannot be used on a tier 5 or higher item at all".
   *
   * SPELLS HAVE NO SUCH LIMIT — "Motes of any tier can be used to upgrade a spell of any tier",
   * which is the whole reason the guide's rule of thumb is "motes are best used for spells" and
   * items are best upgraded by farming duplicates.
   */
  itemTierLimit: number
  /** the wiki's icon id — sequential 2889..2898 in ladder order, which corroborates the order. */
  iconId: number
}

export const MOTE_LADDER: readonly Mote[] = [
  { key: 'mote of infinitesimal potential', name: 'Mote of Infinitesimal Potential', short: 'Infinitesimal', ladder: 1, exp: 1, itemTierLimit: 0, iconId: 2889 },
  { key: 'mote of minor potential', name: 'Mote of Minor Potential', short: 'Minor', ladder: 2, exp: 1, itemTierLimit: 1, iconId: 2890 },
  { key: 'mote of lesser potential', name: 'Mote of Lesser Potential', short: 'Lesser', ladder: 3, exp: 2, itemTierLimit: 2, iconId: 2891 },
  { key: 'mote of potential', name: 'Mote of Potential', short: 'Potential', ladder: 4, exp: 4, itemTierLimit: 3, iconId: 2892 },
  { key: 'mote of major potential', name: 'Mote of Major Potential', short: 'Major', ladder: 5, exp: 5, itemTierLimit: 4, iconId: 2893 },
  { key: 'mote of greater potential', name: 'Mote of Greater Potential', short: 'Greater', ladder: 6, exp: 6, itemTierLimit: 5, iconId: 2894 },
  { key: 'mote of superior potential', name: 'Mote of Superior Potential', short: 'Superior', ladder: 7, exp: 7, itemTierLimit: 6, iconId: 2895 },
  { key: 'mote of grand potential', name: 'Mote of Grand Potential', short: 'Grand', ladder: 8, exp: 8, itemTierLimit: 7, iconId: 2896 },
  { key: 'mote of ascendant potential', name: 'Mote of Ascendant Potential', short: 'Ascendant', ladder: 9, exp: 9, itemTierLimit: 8, iconId: 2897 },
  { key: 'mote of infinite potential', name: 'Mote of Infinite Potential', short: 'Infinite', ladder: 10, exp: 10, itemTierLimit: 9, iconId: 2898 }
]

const BY_KEY: ReadonlyMap<string, Mote> = new Map(MOTE_LADDER.map((m) => [m.key, m]))

/**
 * The mote a loot row names, or null.
 *
 * Matched on the WHOLE lowercased name, never by sniffing for the word "mote": the items DB holds
 * `Void-Touched Potential` (a different mechanic entirely, below) and the mob catalog holds a
 * `Band of Discipline`-style noise field where a substring test would eventually find something.
 * A ` +N` tail is stripped for the same reason `itemCountKey` strips one — a mote is not an
 * upgradeable item, but the loot ledger's keys pass through the same normalization.
 */
export function moteOf(itemName: string): Mote | null {
  return BY_KEY.get(itemName.trim().replace(/ \+\d+$/, '').toLowerCase()) ?? null
}

/** True when this loot row is any mote at all. */
export function isMote(itemName: string): boolean {
  return moteOf(itemName) !== null
}

/**
 * VOID-TOUCHED POTENTIAL — the mote that is not on the ladder and must never be valued in exp.
 *
 * It "does not give experience. Instead they always raise the tier of the item or spell to the
 * next tier" — +9 goes straight to +10 — and only THREE can be earned each week, from raids. So
 * it has no `exp` and cannot be summed with the ten; an exp/hour rate that silently counted one
 * as 0 would understate it and one that guessed a number would invent a mechanic. It is
 * recognised, reported separately, and never pooled.
 */
export const VOID_TOUCHED = 'void-touched potential'

export function isVoidTouched(itemName: string): boolean {
  return itemName.trim().toLowerCase() === VOID_TOUCHED
}

/** Σ exp over a bag of (mote, count) — the only honest way to compare two farming spots. */
export function moteExp(counts: ReadonlyMap<string, number>): number {
  let exp = 0
  for (const [key, n] of counts) {
    const m = BY_KEY.get(key)
    if (m) exp += m.exp * n
  }
  return exp
}

// ── CONDENSING, AND WHY IT IS USUALLY A TRAP ────────────────────────────────────────────────

/** Two motes of one tier become one of the next, at a `Constructed Potential` NPC in any city. */
export const CONDENSE_RATIO = 2

export interface CondenseOutcome {
  from: Mote
  to: Mote
  /** exp destroyed by the trade: `CONDENSE_RATIO * from.exp - to.exp`. Zero is break-even. */
  expLost: number
  /** the trade preserves every point of exp — true ONLY for minor→lesser and lesser→potential */
  lossless: boolean
}

/**
 * What condensing two of `from` actually costs.
 *
 * THE ARITHMETIC IS THE ADVICE, and it is counter-intuitive enough that the guide shouts about it:
 * "Most motes don't double in value. Increasing two Motes of Superior Potential (7 exp) only gives
 * one Mote of Grand Potential (8 exp)." Two sevens are fourteen; you receive eight. Run it over the
 * whole ladder and only two rungs break even — minor→lesser (1+1 ⇒ 2) and lesser→potential
 * (2+2 ⇒ 4). Every rung above destroys between three and eight exp per trade.
 *
 * AND THE RUNG THE GUIDE DOES NOT MENTION IS THE BOTTOM ONE. Two Infinitesimals (1 exp each) buy
 * one Minor (1 exp): half the exp, gone. Proportionally the worst trade on the whole ladder, and
 * the one a player drowning in Infinitesimals — which is what ordinary mobs actually drop — is
 * most tempted to make. It falls straight out of the wiki's own numbers; nobody had multiplied
 * them out.
 *
 * So the ONLY reason to condense above lesser is to clear an ITEM TIER LIMIT: a pile of Major
 * motes cannot touch a tier-5 item at any quantity, and one Greater can. For spells — which accept
 * any tier — condensing is pure loss and the guide says not to do it at all, beyond folding minor
 * and lesser down to cut the number of merge clicks.
 *
 * Returns null at the top of the ladder: there is nothing above Infinite to trade up into. (The
 * guide also says the NPC accepts "up to Mote of Grand Potential … Needs Confirmed", which is the
 * wiki's uncertainty and not a mechanic this file will assert — the arithmetic is stated for every
 * rung and whether the NPC takes the top two is left to the player's own eyes.)
 */
export function condenseOutcome(from: Mote): CondenseOutcome | null {
  const to = MOTE_LADDER.find((m) => m.ladder === from.ladder + 1)
  if (!to) return null
  const expLost = CONDENSE_RATIO * from.exp - to.exp
  return { from, to, expLost, lossless: expLost <= 0 }
}

/** Every rung, for the UI's condensing table. Ordered like the ladder. */
export function condenseTable(): CondenseOutcome[] {
  return MOTE_LADDER.map(condenseOutcome).filter((o): o is CondenseOutcome => o !== null)
}

/**
 * The wiki's player-level → mote-level claim, VERBATIM AND UNENFORCED (see the header).
 *
 * Kept so a surface can show the claim beside the log's own drops and let the player judge. The
 * owner's log refutes it outright — ladder 5 at level ≤13 — and the wiki itself asks for
 * confirmation on the bottom three rungs. Nothing in this module consults it.
 */
export const WIKI_LEVEL_CLAIM: readonly { playerLevel: number; moteLadder: number }[] = [
  { playerLevel: 1, moteLadder: 1 },
  { playerLevel: 10, moteLadder: 2 },
  { playerLevel: 15, moteLadder: 3 },
  { playerLevel: 20, moteLadder: 4 },
  { playerLevel: 25, moteLadder: 5 },
  { playerLevel: 30, moteLadder: 6 },
  { playerLevel: 35, moteLadder: 7 },
  { playerLevel: 40, moteLadder: 8 },
  { playerLevel: 45, moteLadder: 9 },
  { playerLevel: 50, moteLadder: 10 }
]

/** The ladder rung the wiki's table would allow at `level` — for DISPLAY beside the refutation. */
export function wikiClaimedCeiling(level: number): number {
  let out = 0
  for (const r of WIKI_LEVEL_CLAIM) if (level >= r.playerLevel) out = r.moteLadder
  return out
}

/**
 * THE GUIDE'S RULE OF THUMB, carried as text because it is the single most useful sentence about
 * motes and a player who has not read the wiki will not otherwise meet it.
 */
export const MOTE_RULE_OF_THUMB = [
  'Upgrading items is best done by farming duplicates.',
  'Motes are best used for spells — any mote works on a spell of any tier, while a mote cannot touch an item above its own tier limit.'
] as const
