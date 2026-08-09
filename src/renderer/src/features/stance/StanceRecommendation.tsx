// THE ANSWER HALF of a target card: the stance to wear, and — kept firmly apart from it — the
// stance to panic into.
//
// ── WHY THIS IS TWO BLOCKS AND NOT A RANKING WITH A WINNER ──────────────────────────────────
//
// Evasive's "95% chance to evade all incoming attacks" is 0.05 against every damage class, so it
// beats every other stance in the arithmetic against essentially every mob in the game. That is
// a true statement and a useless recommendation: the evade costs TWO endurance per point evaded,
// the wiki says it FAILS outright on empty endurance, and THE LOG NEVER PRINTS ENDURANCE — so
// the app is permanently unable to check the one thing that would make its own top answer safe.
// The player said it plainly: it "isn't always the best, it's like temp/survive mode".
//
// `shared/stances.ts` answered that by splitting the question rather than fudging the numbers
// (`bestSustained` / `bestEmergency`), and this file is where that split becomes something you
// can see across a room. The recommendation is a SUCCESS-toned callout carrying `advice.sustained`
// and a large figure. Survive mode is a smaller, dashed, WARNING-toned strip that names an action
// with an end to it. Different color, different weight, different border style, different verb —
// three redundant signals, because the whole failure mode being corrected is a user reading the
// wrong one of the two as "the answer".
//
// There is NO fallback from one to the other. When `advice.sustained` is null the callout says
// there is no stance to wear and the survive strip stands alone; promoting the gated pick into
// the empty headline would silently rebuild exactly what was just removed.

import type { JSX } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import BoltIcon from '@mui/icons-material/Bolt'
import ShieldMoonIcon from '@mui/icons-material/ShieldMoon'
import { calloutFor, caveatsAt, surviveLine, type RankedRow, type StanceTargetRow } from './stanceRows'

/** Theme `success.main` / `warning.main` (theme.ts), as strings the bar fills can also use. */
export const HOLD_COLOR = '#5fbf72'
export const SURVIVE_COLOR = '#e0a94a'

/** The small chips that ride the recommendation line: what you are wearing, what it costs. */
function StanceTags({ s }: { s: RankedRow }): JSX.Element {
  return (
    <>
      {s.current && (
        <Chip
          size="small"
          color="primary"
          label="worn now"
          sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
          data-testid="stance-worn-now"
        />
      )}
      {!s.current && <Chip size="small" variant="outlined" label="switch to it" sx={{ height: 18, fontSize: 10 }} />}
      {s.free && <Chip size="small" variant="outlined" label="no upkeep" sx={{ height: 18, fontSize: 10 }} />}
    </>
  )
}

/**
 * THE RECOMMENDATION — `advice.sustained`, and the biggest thing on the card.
 *
 * The percentage is the large figure because it is the number that decides whether switching is
 * worth a global cooldown mid-fight, and it is phrased as damage TAKEN ("62% of the full hit")
 * rather than as a reduction: "50% reduction" and "takes 50%" are the same sentence for
 * Defensive's melee half and different sentences for everything else. The sentence under it is
 * where "full hit" is spelled out in full — "what it hits for before your stance".
 */
export function Recommendation({ row }: { row: StanceTargetRow }): JSX.Element {
  const c = calloutFor(row)
  const tone = c.stance ? HOLD_COLOR : SURVIVE_COLOR
  return (
    <Box
      data-testid="stance-recommendation"
      data-stance={c.stance?.key ?? ''}
      sx={{
        px: 1.25,
        py: 0.9,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: alpha(tone, 0.5),
        bgcolor: alpha(tone, 0.1),
        borderLeft: `4px solid ${tone}`
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <ShieldMoonIcon sx={{ fontSize: 18, color: tone }} />
        <Typography variant="overline" sx={{ color: tone, fontWeight: 800, letterSpacing: 0.9, lineHeight: 1.4 }}>
          {c.heading}
        </Typography>
        {c.stance && (
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
            {c.stance.name}
          </Typography>
        )}
        {c.stance && <StanceTags s={c.stance} />}
        <Box sx={{ flexGrow: 1 }} />
        {c.stance && (
          <Stack direction="row" spacing={0.6} alignItems="baseline">
            <Typography variant="h5" sx={{ fontWeight: 800, color: tone, lineHeight: 1 }}>
              {c.stance.percent}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              of the full hit
            </Typography>
          </Stack>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
        {c.detail}
      </Typography>
    </Box>
  )
}

/**
 * SURVIVE MODE — `advice.emergency`, drawn so it can never be mistaken for the block above it.
 *
 * The endurance caveat is rendered HERE, inline, rather than as one of the card's banners: it is
 * a statement about this stance and nowhere else, and `caveatsFor` marks it `display: 'survive'`
 * for exactly that reason. It stays full visible prose — it is one of the two load-bearing
 * honesty statements on the page, not decoration to be hidden behind a hover.
 */
export function SurviveMode({ row }: { row: StanceTargetRow }): JSX.Element | null {
  const e = row.emergency
  if (!e) return null
  const note = caveatsAt(row.caveats, 'survive')[0]
  return (
    <Box
      data-testid="stance-emergency"
      data-stance={e.key}
      sx={{
        px: 1.25,
        py: 0.75,
        borderRadius: 1.5,
        border: '1px dashed',
        borderColor: alpha(SURVIVE_COLOR, 0.55),
        bgcolor: alpha(SURVIVE_COLOR, 0.05)
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <BoltIcon sx={{ fontSize: 17, color: SURVIVE_COLOR }} />
        <Typography variant="overline" sx={{ color: SURVIVE_COLOR, fontWeight: 800, letterSpacing: 0.9, lineHeight: 1.4 }}>
          Survive mode
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {e.name}
        </Typography>
        {e.current && <Chip size="small" color="warning" label="worn now" sx={{ height: 18, fontSize: 10 }} />}
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
          {surviveLine(e)}
        </Typography>
      </Stack>
      {note && (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ mt: 0.25 }}
          data-testid={`stance-caveat-${note.kind}`}
        >
          {note.text}
        </Typography>
      )}
    </Box>
  )
}
