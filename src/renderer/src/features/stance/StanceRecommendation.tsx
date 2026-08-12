// SURVIVE MODE — the stance to panic into, kept firmly apart from the stance to wear.
//
// ── WHAT USED TO BE HERE ────────────────────────────────────────────────────────────────────
//
// This file also held `Recommendation`, the card's old headline: a success-toned callout reading
// "Wear Defensive — you take 59% of the full hit". It is gone, because it named ONE stance and no
// baseline — the owner's report was that the tab is confusing, and a percentage with nothing to
// compare it against is the reason. `StanceVerdictBlock.tsx` replaced it with the comparison
// itself ("you are in Mage Hunter and take 70%; Defensive would take 60%"), stated in every case
// including the ones where it cannot be stated, and with the DAMAGE answer beside it.
//
// What survives here is the half that block deliberately does NOT absorb: survive mode is a
// different KIND of answer and has to keep looking like one.
//
// ── WHY SURVIVE MODE IS ITS OWN BLOCK AND NOT A RANKING WITH A WINNER ───────────────────────
//
// Evasive's "95% chance to evade all incoming attacks" is 0.05 against every damage class, so it
// beats every other stance in the arithmetic against essentially every mob in the game. That is
// a true statement and a useless recommendation: the evade costs TWO endurance per point evaded,
// the wiki says it FAILS outright on empty endurance, and THE LOG NEVER PRINTS ENDURANCE — so
// the app is permanently unable to check the one thing that would make its own top answer safe.
// The player said it plainly: it "isn't always the best, it's like temp/survive mode".
//
// `shared/stances.ts` answered that by splitting the question rather than fudging the numbers
// (`bestSustained` / `bestEmergency`), and this file is where that split stays visible across a
// room. Survive mode is a smaller, dashed, WARNING-toned strip that names an action with an end to
// it — different color, different weight, different border style, different verb from the verdict
// block above it. Three redundant signals, because the whole failure mode being corrected is a
// user reading survive mode as "the answer".
//
// There is NO fallback from one to the other. When `advice.sustained` is null the verdict says
// there is no stance to wear and this strip stands alone; promoting the gated pick into the empty
// headline would silently rebuild exactly what was removed.

import type { JSX } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import BoltIcon from '@mui/icons-material/Bolt'
import { caveatsAt, surviveLine, type StanceTargetRow } from './stanceRows'

/** Theme `success.main` / `warning.main` (theme.ts), as strings the bar fills can also use. */
export const HOLD_COLOR = '#5fbf72'
export const SURVIVE_COLOR = '#e0a94a'

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
