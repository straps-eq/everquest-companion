// StanceOverlay — the 'stance' overlay kind: for each mob you are actually fighting, the stance
// that takes the least damage and the stance that deals the most, with what the second one costs.
//
// ── WHY THIS WINDOW EXISTS ──────────────────────────────────────────────────────────────────
//
// The owner asked for it in the same breath as the tab's clarity fix: "can we make the stances
// part of the overlay also that just shows what stance will help for sustain and what will help
// for dps for each mob". The tab is where the charts, the un-scaling and the raw observations
// live, and none of that is reachable mid-pull — an answer you have to alt-tab for is an answer
// you do not use. This is the same two verdicts, at a glance, over the game.
//
// ── IT IS NOT A METER, AND THE DIFFERENCES ARE DELIBERATE ───────────────────────────────────
//
//   * ROWS ARE MOBS, not damage sources. There is no ranking, no bar fill and no drill: the
//     question is "against THIS thing, what should I be in", and every row is one answer.
//   * IT READS `combat:stanceAdvice`, not the combat snapshot. That snapshot is polled once a
//     second by every open meter and this list grows with the session's bestiary rather than with
//     the snapshot's payload caps (main/ipc/stanceAdvice.ts makes the same argument for the tab).
//   * NO SELECTOR and no fight scope. A stance is a standing choice that outlives a pull, so
//     "which fight" is not a question this surface has; the list is simply what has been involved
//     with you most recently.
//
// ── THE SENTENCES ARE NOT WRITTEN HERE ──────────────────────────────────────────────────────
//
// Every verdict comes from `shared/stanceVerdict.ts`, the same module the Stances tab renders. A
// floating window that phrased the answer itself would eventually name a different stance than the
// tab behind it, which is the one failure mode a second surface must not have. What this file
// owns is how much of that text fits: the overlay shows the TRANSITION (worn → better) plus the
// figure, and keeps the full sentence for the tab.
//
// MUI-FREE, like every surface in this bundle: plain divs and inline styles, so the window stays
// cheap to paint on top of the game.

import { type JSX, useEffect, useState } from 'react'
import type { StanceAdvicePayload } from '@shared/stanceAdvice'
import { mobVerdicts, type DpsVerdict, type MobVerdict, type SustainVerdict } from '@shared/stanceVerdict'
import { OverlayContent } from './overlayScale'
import { TextScaleStepper } from './TextScaleStepper'
import { useOverlayChrome, type OverlayChrome } from './useOverlayChrome'
import { OverlayHeader } from './OverlayHeader'

/** The tab's own two hues (features/stance/StanceRecommendation.tsx, StanceVerdictBlock.tsx), so
 *  the overlay and the tab agree on what green and red MEAN as well as on what they say. */
const HOLD = '#5fbf72'
const SURVIVE = '#e0a94a'
const DPS = '#e0705f'
const DIM = 'rgba(255,255,255,0.5)'

/**
 * How many mobs the list shows.
 *
 * Not a memory bound (the ledgers are capped in main) — a READABILITY one. The overlay answers
 * "what am I fighting right now", and past about half a dozen rows a floating window is a wall
 * you scroll instead of a thing you glance at. Rows are most-recently-involved first, so the cap
 * drops the mobs you have stopped caring about.
 */
const ROW_CAP = 6

/** Slow safety tick; anything urgent arrives on the combat-activity nudge. */
const FALLBACK_POLL_MS = 4000

/**
 * The advisor payload, polled the way the tab's `useStanceAdvice` polls it: refresh on the
 * throttled `combat:activity` nudge, plus a slow fallback so a session that goes quiet still
 * settles. Null until the first answer lands.
 */
function useStanceAdvice(): StanceAdvicePayload | null {
  const [payload, setPayload] = useState<StanceAdvicePayload | null>(null)
  useEffect(() => {
    let alive = true
    const tick = async (): Promise<void> => {
      const p = await window.eqOverlay.getStanceAdvice()
      if (alive) setPayload(p)
    }
    void tick()
    const off = window.eqOverlay.onCombatActivity(() => void tick())
    const iv = setInterval(() => void tick(), FALLBACK_POLL_MS)
    return () => {
      alive = false
      off()
      clearInterval(iv)
    }
  }, [])
  return payload
}

/** A fraction as a whole percent. */
function pct(f: number): string {
  return `${String(Math.round(f * 100))}%`
}

/**
 * ONE LINE OF ADVICE: a colored tag, the transition, and the figure.
 *
 * `from → to` is the whole point of the row and the reason the overlay is worth having: it names
 * what you are WEARING before what you should wear, so the line is readable without knowing what
 * the app thinks your current stance is. When there is nothing to change the arrow is dropped and
 * the stance stands alone under a check — "you are already right" has to be as legible as "switch",
 * or the user learns to ignore the row that says nothing.
 */
function AdviceLine({
  tag,
  tone,
  from,
  to,
  figure,
  note
}: {
  tag: string
  tone: string
  from: string | null
  to: string | null
  figure: string | null
  /** the refusal, when there is no transition to draw */
  note: string | null
}): JSX.Element {
  const same = to !== null && from === to
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
      <span
        style={{
          color: tone,
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: 0.6,
          width: 26,
          flexShrink: 0
        }}
      >
        {tag}
      </span>
      {note !== null ? (
        <span style={{ fontSize: 10, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {note}
        </span>
      ) : (
        <>
          <span style={{ fontSize: 11, color: same ? tone : 'rgba(255,255,255,0.75)', fontWeight: same ? 700 : 500 }}>
            {same ? `✓ ${to}` : (from ?? 'not stated')}
          </span>
          {!same && to !== null && (
            <>
              <span style={{ fontSize: 11, color: DIM }}>→</span>
              <span style={{ fontSize: 11, color: tone, fontWeight: 700 }}>{to}</span>
            </>
          )}
          <span style={{ flexGrow: 1 }} />
          {figure !== null && (
            <span style={{ fontSize: 11, color: tone, fontWeight: 800, flexShrink: 0 }}>{figure}</span>
          )}
        </>
      )}
    </div>
  )
}

/** The sustain half of a row: least damage taken. */
function SustainLine({ v }: { v: SustainVerdict }): JSX.Element {
  const actionable = v.block === 'ok' || v.block === 'thin'
  const tone = !actionable ? DIM : v.alreadyBest ? HOLD : SURVIVE
  return (
    <AdviceLine
      tag="SUS"
      tone={tone}
      from={v.worn}
      to={v.best}
      figure={
        !actionable
          ? null
          : v.alreadyBest
            ? v.wornFraction === null
              ? null
              : pct(v.wornFraction)
            : v.saves === null
              ? null
              : `${pct(v.saves)} less`
      }
      // The refusals are SHORT here and long on the tab. The overlay's job is to say "there is no
      // answer yet" without spending three lines on why; the tab carries the whole sentence.
      note={actionable ? null : v.block === 'noneHoldable' ? 'nothing you can hold' : 'not measured yet'}
    />
  )
}

/** Is there a real damage gain to show, or only a refusal? */
function dpsWorthShowing(v: DpsVerdict): boolean {
  return (v.block === 'ok' || v.block === 'thin') && v.best !== null && v.gain !== null
}

/** The gain as a figure, or null when there is nothing worth printing. */
function dpsFigure(v: DpsVerdict): string | null {
  if (v.gain === null || v.gain <= 1.005) return null
  return `+${String(Math.round((v.gain - 1) * 100))}%`
}

/**
 * THE PRICE, trimmed to fit and never dropped when it is known: "switch to Offensive" without "and
 * take every point it swings" is the half-truth the sustain/DPS pairing exists to prevent. The
 * shared sentence opens with a clause that is redundant next to a red DPS row, so the overlay
 * strips exactly that prefix and keeps the numbers.
 */
const COST_PREFIX = 'It costs you sustain: '

function CostNote({ v }: { v: DpsVerdict }): JSX.Element | null {
  if (v.costLine === null || dpsFigure(v) === null) return null
  const text = v.costLine.startsWith(COST_PREFIX) ? v.costLine.slice(COST_PREFIX.length) : v.costLine
  return (
    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', paddingLeft: 32, marginTop: -1 }}>{text}</div>
  )
}

/** The damage half: most damage dealt, and what it costs. */
function DpsLine({ v }: { v: DpsVerdict }): JSX.Element {
  const actionable = dpsWorthShowing(v)
  return (
    <>
      <AdviceLine
        tag="DPS"
        tone={actionable ? DPS : DIM}
        from={v.worn}
        to={v.best}
        figure={dpsFigure(v)}
        note={actionable ? null : v.best === null ? 'not measured yet' : 'unknown in this stance'}
      />
      <CostNote v={v} />
    </>
  )
}

/** One mob: its name and tier, then the two answers. */
function MobRow({ v }: { v: MobVerdict }): JSX.Element {
  return (
    <div
      data-testid="stance-overlay-row"
      style={{
        padding: '4px 2px 5px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0
          }}
        >
          {v.mobName}
        </span>
        <span style={{ flexGrow: 1 }} />
        {/* The tier is part of the measurement's IDENTITY, not decoration: a d0 Cazic-Thule and a
            d2 one never pooled, so a row that hid the tier would look like a duplicate. */}
        {v.tier > 0 && <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>d{v.tier}</span>}
      </div>
      <SustainLine v={v.sustain} />
      <DpsLine v={v.dps} />
    </div>
  )
}

/** Footer — interactive mode only, matching the other kinds: bg alpha + text size. */
function StanceFooter({
  bgAlpha,
  textScale,
  patch,
  noDrag
}: {
  bgAlpha: number
  textScale: number
  patch: OverlayChrome['patch']
  noDrag: React.CSSProperties
}): JSX.Element {
  return (
    <div
      style={{
        ...noDrag,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '3px 8px 5px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: 10,
        color: 'rgba(255,255,255,0.6)',
        flexShrink: 0
      }}
    >
      <span title="Background opacity" style={{ flexShrink: 0 }}>
        bg
      </span>
      <input
        type="range"
        min={0.1}
        max={1}
        step={0.02}
        value={bgAlpha}
        onChange={(e) => patch({ bgAlpha: Number(e.target.value) })}
        style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 24, accentColor: HOLD, height: 4 }}
      />
      <TextScaleStepper textScale={textScale} patch={patch} noDrag={noDrag} />
    </div>
  )
}

export default function StanceOverlay(): JSX.Element {
  const payload = useStanceAdvice()
  const { locked, bgAlpha, textScale, hovering, patch, toggleLock, onEnter, onLeave, dragRegion, noDrag } =
    useOverlayChrome()

  const rows = payload ? mobVerdicts(payload, payload.availableStances, payload.currentStance).slice(0, ROW_CAP) : []
  // The stance WORN, in the header — the baseline every row's transition is stated against, said
  // once instead of assumed. `null` is "the log has not told us this session", never Balanced.
  const worn = payload?.currentStance
  const wornLabel = worn ? (rows[0]?.sustain.worn ?? worn) : 'no stance seen'

  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, "Segoe UI", Roboto, system-ui, sans-serif',
        color: '#f2f2f2',
        background: `rgba(14,17,21,${bgAlpha})`,
        border: locked ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(95,191,114,0.4)',
        borderRadius: 8,
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <OverlayHeader
        tag="STANCE"
        title={wornLabel}
        titleColor={worn ? HOLD : DIM}
        tail={rows.length > 0 ? String(rows.length) : ''}
        tailColor="rgba(255,255,255,0.5)"
        chrome={{ locked, hovering, dragRegion, noDrag, toggleLock }}
      />

      <OverlayContent textScale={textScale}>
        {payload === null ? (
          <div style={{ fontSize: 11, color: DIM, padding: '8px 2px' }}>Reading log…</div>
        ) : rows.length === 0 ? (
          <div style={{ fontSize: 11, color: DIM, padding: '8px 2px' }}>
            Nothing measured yet. The moment something hits you — or you hit it — it gets a row here,
            one per mob, zone and instance tier.
          </div>
        ) : (
          rows.map((v) => <MobRow key={v.key} v={v} />)
        )}
      </OverlayContent>

      {!locked && <StanceFooter bgAlpha={bgAlpha} textScale={textScale} patch={patch} noDrag={noDrag} />}
    </div>
  )
}
