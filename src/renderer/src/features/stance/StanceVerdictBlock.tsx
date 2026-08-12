// THE ANSWER, AT THE TOP, IN ONE SENTENCE EACH — "you are in X; Y would save you Z", and the same
// for damage.
//
// ── THE REPORT THIS FIXES ───────────────────────────────────────────────────────────────────
//
// "Stances is still kinda confusing. It should be clear — you are in X, if you switched to Y it
// would save you." Every ingredient of that sentence was already on the card and the sentence was
// nowhere: the recommendation block said "Wear Defensive — you take 59% of the full hit", which
// names ONE stance and no baseline, and the worn-vs-best comparison only appeared inside the
// mismatch callout, which `detectMismatch` suppresses in four separate situations — including the
// commonest one of all, being already in the right stance. So a user doing the right thing was
// told nothing, and a user doing the wrong thing was shown a percentage with nothing to compare it
// against.
//
// ── WHAT THIS BLOCK IS ──────────────────────────────────────────────────────────────────────
//
// Two callouts, always present, each carrying the same three things: the stance you are WEARING,
// the stance that would be BETTER, and the difference between them as one figure. The sentence
// under each is `shared/stanceVerdict.ts`'s, not this file's — the stance overlay renders the same
// strings, and two surfaces phrasing one verdict differently is how a floating meter ends up
// contradicting the tab behind it.
//
// SUSTAIN IS GREEN, DAMAGE IS RED, and they are deliberately the SAME SHAPE. The owner's second
// ask was "what stance will help for sustain and what will help for dps for each mob", and the
// honest answer is usually two different stances — so the two answers are drawn as siblings, at
// equal weight, rather than as a recommendation with a footnote. Neither is "the" answer.
//
// AND THE DAMAGE PICK ALWAYS CARRIES ITS PRICE. Offensive doubles your melee and drops every
// mitigation you had; `costLine` states what it costs in the same block, measured off the incoming
// profile. A DPS recommendation without that line would be the same half-truth in a new place.

import type { JSX, ReactNode } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import ShieldMoonIcon from '@mui/icons-material/ShieldMoon'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { Tooltip } from '../../lib/Tooltip'
import type { DpsVerdict, SustainVerdict } from '../../../../shared/stanceVerdict'
import type { StanceTargetRow } from './stanceRows'
import { HOLD_COLOR, SURVIVE_COLOR } from './StanceRecommendation'

/** The damage answer's own hue — deliberately not the survive amber, which means something else
 *  on this page (an endurance-gated escape hatch), and not the sustain green. */
export const DPS_COLOR = '#e0705f'

/** A fraction as a whole percent. */
function pct(f: number): string {
  return `${String(Math.round(f * 100))}%`
}

/**
 * WORN → BETTER, as the one line the eye lands on.
 *
 * `from` is always the stance actually worn, so the arrow is never a recommendation floating free
 * of a baseline. When there is nothing to switch to — you are already in it — the arrow is dropped
 * entirely rather than pointing a stance at itself.
 */
function Transition({
  from,
  to,
  figure,
  tone
}: {
  from: string | null
  to: string | null
  /** the difference, already formatted ('14% less', '+80%') */
  figure: string | null
  tone: string
}): JSX.Element {
  const same = to === null || from === to
  return (
    <Stack direction="row" spacing={0.75} alignItems="baseline" flexWrap="wrap" useFlexGap>
      <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1, color: same ? tone : 'text.primary' }}>
        {from ?? 'not stated'}
      </Typography>
      {!same && (
        <>
          <Typography variant="h6" sx={{ fontWeight: 400, lineHeight: 1.1, color: 'text.secondary' }}>
            →
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1, color: tone }}>
            {to}
          </Typography>
        </>
      )}
      {same && <Chip size="small" label="stay put" sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: alpha(tone, 0.25) }} />}
      <Box sx={{ flexGrow: 1 }} />
      {figure !== null && (
        <Typography variant="h5" sx={{ fontWeight: 800, color: tone, lineHeight: 1 }}>
          {figure}
        </Typography>
      )}
    </Stack>
  )
}

/** One of the two callouts. Same frame for both, so neither reads as the primary answer. */
function Callout({
  tone,
  icon,
  heading,
  testid,
  children
}: {
  tone: string
  icon: JSX.Element
  heading: string
  testid: string
  children: ReactNode
}): JSX.Element {
  return (
    <Box
      data-testid={testid}
      sx={{
        px: 1.25,
        py: 0.9,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: alpha(tone, 0.5),
        bgcolor: alpha(tone, 0.1),
        borderLeft: `4px solid ${tone}`,
        flex: '1 1 320px',
        minWidth: 0
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center">
        {icon}
        <Typography variant="overline" sx={{ color: tone, fontWeight: 800, letterSpacing: 0.9, lineHeight: 1.4 }}>
          {heading}
        </Typography>
      </Stack>
      {children}
    </Box>
  )
}

/** The measured-sample footnote both halves share: how many hits are behind the claim. */
function Basis({ hits, what }: { hits: number; what: string }): JSX.Element | null {
  if (hits <= 0) return null
  return (
    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.4 }}>
      Measured over {hits} {what}
      {hits === 1 ? '' : 's'} this session.
    </Typography>
  )
}

/** SUSTAIN — least damage taken. Green when you are already right, amber when you are not. */
function SustainCallout({ v }: { v: SustainVerdict }): JSX.Element {
  const actionable = v.block === 'ok' || v.block === 'thin'
  const tone = !actionable ? SURVIVE_COLOR : v.alreadyBest ? HOLD_COLOR : SURVIVE_COLOR
  return (
    <Callout
      tone={tone}
      testid="stance-verdict-sustain"
      icon={<ShieldMoonIcon sx={{ fontSize: 18, color: tone }} />}
      heading="Sustain — least damage taken"
    >
      {actionable ? (
        <Transition
          from={v.worn}
          to={v.best}
          // The saving as a share of what you take NOW ("14% less"), which is the number that
          // decides whether a switch is worth a global cooldown — not the absolute gap between
          // two fractions, which is always smaller and reads as a smaller win than it is.
          figure={v.alreadyBest ? (v.wornFraction === null ? null : pct(v.wornFraction)) : v.saves === null ? null : `${pct(v.saves)} less`}
          tone={tone}
        />
      ) : null}
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: actionable ? 0.4 : 0.2 }}>
        {v.line}
      </Typography>
      <Basis hits={v.advice.hits} what="hit it landed on you" />
    </Callout>
  )
}

/** DAMAGE — most damage dealt, and what it costs. */
function DpsCallout({ v }: { v: DpsVerdict }): JSX.Element {
  const tone = DPS_COLOR
  const actionable = (v.block === 'ok' || v.block === 'thin') && v.best !== null
  const figure = v.gain !== null && v.gain > 1.005 ? `+${String(Math.round((v.gain - 1) * 100))}%` : null
  return (
    <Callout
      tone={tone}
      testid="stance-verdict-dps"
      icon={<LocalFireDepartmentIcon sx={{ fontSize: 18, color: tone }} />}
      heading="Damage — most damage dealt"
    >
      {actionable ? <Transition from={v.worn} to={v.best} figure={figure} tone={tone} /> : null}
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: actionable ? 0.4 : 0.2 }}>
        {v.line}
      </Typography>
      {v.costLine !== null && (
        <Typography
          variant="caption"
          display="block"
          sx={{ mt: 0.4, fontWeight: 600, color: alpha('#fff', 0.85) }}
          data-testid="stance-dps-cost"
        >
          {v.costLine}
        </Typography>
      )}
      <Basis hits={v.hits} what="hit you landed on it" />
      <UnknownStances v={v} />
    </Callout>
  )
}

/**
 * The stances this app has NOT measured, named on the surface that would otherwise imply it had
 * considered them. Chips with the whole reason on hover — the same treatment the card gives its
 * quiet caveats, because "Striker is missing from this list" is a question the user will otherwise
 * ask exactly once and then stop trusting the list.
 */
function UnknownStances({ v }: { v: DpsVerdict }): JSX.Element | null {
  if (v.unknown.length === 0) return null
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
      <HelpOutlineIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
      <Typography variant="caption" color="text.secondary">
        not measured:
      </Typography>
      {v.unknown.map((u) => (
        <Tooltip key={u.key} title={u.why}>
          <Chip
            size="small"
            variant="outlined"
            label={u.name}
            sx={{ height: 17, fontSize: 10 }}
            data-testid={`stance-unmeasured-${u.key}`}
          />
        </Tooltip>
      ))}
    </Stack>
  )
}

/**
 * Both answers, side by side — and side by side is the argument: against most mobs the stance that
 * keeps you alive and the stance that kills it faster are DIFFERENT stances, and which one you want
 * is a decision only the player can make. The app's job is to price both, not to pick.
 */
export default function StanceVerdictBlock({ row }: { row: StanceTargetRow }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap data-testid="stance-verdict">
      <SustainCallout v={row.verdict.sustain} />
      <DpsCallout v={row.verdict.dps} />
    </Stack>
  )
}
