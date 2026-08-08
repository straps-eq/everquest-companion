// THE WIKI'S PLAYER-LEVEL CEILING, SHOWN AS A CLAIM AND SHOWN REFUTED.
//
// The eqlwiki Mote Guide asserts that "the player's level will affect the level of the motes that
// drop" and gives a table (level 1 ⇒ tier 1, 10 ⇒ 2, 15 ⇒ 3 …). `shared/motes.ts` carries that
// table as `WIKI_LEVEL_CLAIM` and deliberately applies it NOWHERE, because the log this feature
// was built from contradicts it by a wide margin and by timestamp: a `Mote of Major Potential`
// (ladder 5) was looted on Fri Aug 07 from Master Yael, and the log's four level-ups are Sat Aug 08
// 00:10 → 00:50 reaching level 17 — so that drop happened at level 13 or below, where the table
// allows ladder 2.
//
// TWO SIDES, LABELLED. The left column is THE WIKI'S, said so in the heading, and it is the only
// thing on this tab sourced from outside the log. The right column is what this character's own
// log shows, derived live (`moteFarming.levelEvidence`) rather than hardcoded from the owner's
// numbers — the refutation belongs to whoever is looking at it. Enforcing a cap the evidence
// refutes would make the app confidently hide drops the player can see in their own inventory,
// which is worse than having no cap at all.
//
// AND WHEN THE LOG HAS NOT SPOKEN, NOTHING IS CLAIMED. The only level evidence in an EverQuest log
// is a ding line. With no ding before the best drop the log BOUNDS the level (the next ding took
// you to N, so you were at most N−1) and the panel says "at most"; with no ding at all it says the
// log has not stated a level and draws no verdict in either direction.

import type { JSX } from 'react'
import { Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { WIKI_LEVEL_CLAIM } from '@shared/motes'
import type { MoteLevelEvidence } from '@shared/moteFarming'
import { formatDate } from '../../lib/formatDate'

/** The claim's own hue: this is the wiki talking, not the log. */
const WIKI_COLOR = '#8891a0'
/** Green for "your log agrees or is silent", amber for "your log says otherwise". */
const AGREE_COLOR = '#7fbf8f'
const REFUTE_COLOR = '#e0894f'

/** The wiki's table, as a compact strip of `level ⇒ rung` chips. */
function ClaimStrip(): JSX.Element {
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap data-testid="mote-wiki-claim">
      {WIKI_LEVEL_CLAIM.map((r) => (
        <Chip
          key={r.playerLevel}
          size="small"
          variant="outlined"
          label={`L${r.playerLevel} → rung ${r.moteLadder}`}
          sx={{ height: 18, fontSize: 10, borderColor: WIKI_COLOR, color: WIKI_COLOR }}
        />
      ))}
    </Stack>
  )
}

/** How the log states your level at that drop — exactly, as a bound, or not at all. */
function levelPhrase(ev: MoteLevelEvidence): string {
  if (ev.level !== null) return `level ${ev.level}`
  if (ev.levelAtMost !== null) return `level ${ev.levelAtMost} or below`
  return 'a level this log never stated'
}

/** The verdict sentence, which is the whole reason this panel exists. */
function Verdict({ ev }: { ev: MoteLevelEvidence }): JSX.Element {
  if (ev.wikiCeiling === null) {
    return (
      <Typography variant="body2" data-testid="mote-claim-verdict">
        Your log has printed no level-up line, so there is nothing here to test the claim against —
        neither for it nor against it. Nothing in this app enforces the table either way.
      </Typography>
    )
  }
  if (!ev.refuted) {
    return (
      <Typography variant="body2" data-testid="mote-claim-verdict">
        Your best mote so far is <strong>{ev.name}</strong> (rung {ev.ladder}), looted at{' '}
        {levelPhrase(ev)} — at or below the rung {ev.wikiCeiling} the table allows there, so your
        own log has not contradicted the claim yet. It is still not enforced anywhere in this app:
        the log this feature was built from refuted it outright.
      </Typography>
    )
  }
  return (
    <Typography variant="body2" data-testid="mote-claim-verdict">
      <strong>Your own log refutes it.</strong> {ev.name} — rung {ev.ladder} — dropped for you at{' '}
      {levelPhrase(ev)} on {formatDate(ev.ts)}, where the wiki&apos;s table allows rung{' '}
      {ev.wikiCeiling} at most.
    </Typography>
  )
}

/**
 * The claim, and what this character's log says about it.
 *
 * `evidence` is null when no laddered mote has ever dropped — then only the claim is shown, with
 * no verdict, because there is nothing yet to judge it by.
 */
export function MoteLevelClaim({ evidence }: { evidence: MoteLevelEvidence | null }): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="mote-level-claim">
      <Stack spacing={1}>
        <Box>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle2">The wiki claims your level caps the tier</Typography>
            <Chip
              size="small"
              variant="outlined"
              label="eqlwiki Mote Guide — not this app's finding"
              sx={{ height: 18, fontSize: 10, borderColor: WIKI_COLOR, color: WIKI_COLOR }}
            />
          </Stack>
          <ClaimStrip />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            The guide flags its own uncertainty on the bottom three rungs (&ldquo;need confirmation
            on level drop&rdquo;). Nothing in this app filters, hides or warns about a drop on the
            strength of this table.
          </Typography>
        </Box>
        <Alert
          severity={evidence?.refuted === true ? 'warning' : 'info'}
          sx={{
            '& .MuiAlert-message': { width: '100%' },
            borderColor: evidence?.refuted === true ? REFUTE_COLOR : AGREE_COLOR
          }}
        >
          {evidence ? (
            <Verdict ev={evidence} />
          ) : (
            <Typography variant="body2" data-testid="mote-claim-verdict">
              No mote has dropped for you yet, so there is nothing to hold the claim up against.
            </Typography>
          )}
        </Alert>
        <Typography variant="caption" color="text.secondary">
          What the same guide says that this log DOES support: difficulty and mob strength drive the
          tier. That half is on the &ldquo;who drops them&rdquo; panel, stated as the tendency it is.
        </Typography>
      </Stack>
    </Paper>
  )
}
