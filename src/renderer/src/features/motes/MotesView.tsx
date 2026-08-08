// THE MOTES TAB — "where is the best place to farm them, and what do I do with them once I have
// them", answered from this character's own loot history plus the wiki's price table.
//
// THE PAGE IS ORDERED BY THE QUESTION, not by how the data is shaped:
//
//   a. WHERE TO FARM — zones ranked by mote EXP per hour of the active time you spent there, with
//      the sample size and the span beside every row. This is what the user actually came here to
//      ask, so it is the top of the page.
//   b. WHAT YOU'VE GOT — the ten rungs, count and exp, with the total banked.
//   c. WHO DROPS THEM — top source mobs with a raid-target marker, and the raid-target pattern
//      stated as the tendency it is (with its counter-examples named).
//   d. SPEND ADVICE — the guide's rule of thumb and the condensing table, whose exp-loss column is
//      the single most actionable thing on the tab.
//   e. THE LEVEL CLAIM — the wiki's player-level ceiling, shown as a claim and shown refuted.
//
// TWO SOURCES OF TRUTH, AND THE PAGE SAYS WHICH IS WHICH. The PRICES (rung, exp, item tier limit,
// condensing arithmetic) are the eqlwiki Mote Guide's, hand-authored in `shared/motes.ts` and
// provenance-tested against the committed items DB. The DROPS (where, from what, how often) are
// this log's and nothing else — the wiki cannot answer them at all, because all ten mote item
// entries carry an empty `dropsfrom`. Panels sourced from the wiki are chipped as such.
//
// EXP IS THE HEADLINE EVERYWHERE. "Twenty motes" is nearly meaningless when an Infinitesimal is
// 1 exp and an Infinite is 10, so every rate on this page leads with exp and carries the count
// beside it. `shared/moteFarming.ts`'s header argues the case; nothing on this page re-decides it.

import { type JSX } from 'react'
import { Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material'
import GrainIcon from '@mui/icons-material/Grain'
import type { MobTarget } from '../mobs/mobTarget'
import { useMoteFarming, type MoteFarmingView } from './useMoteFarming'
import { MoteLadderChart, MoteZoneChart } from './MoteCharts'
import { MoteSources } from './MoteSources'
import { MoteSpendAdvice } from './MoteSpendAdvice'
import { MoteLevelClaim } from './MoteLevelClaim'

/** The header's at-a-glance counters. Exp first, because exp is the currency. */
function Totals({ view }: { view: MoteFarmingView }): JSX.Element {
  const { data } = view
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
      <Chip size="small" color="primary" label={`${data.totalExp} exp looted`} sx={{ fontWeight: 700 }} />
      <Chip size="small" variant="outlined" label={`${data.totalMotes} motes`} data-testid="mote-total-count" />
      <Chip size="small" variant="outlined" label={`${data.zones.length} zones`} />
      {/* Void-Touched is NEVER folded into the exp figure — it gives no experience and raises a
          tier outright — so it gets its own chip or none at all, never a share of the total. */}
      {data.totalVoidTouched > 0 && (
        <Chip
          size="small"
          variant="outlined"
          color="secondary"
          label={`${data.totalVoidTouched} Void-Touched (no exp — raises a tier outright)`}
          data-testid="mote-void-touched"
        />
      )}
    </Stack>
  )
}

/** Nothing looted yet — say which of the two reasons it is, and draw no empty chart. */
function EmptyState({ hydrated }: { hydrated: boolean }): JSX.Element {
  return (
    <Alert severity="info" data-testid="mote-empty">
      {hydrated
        ? 'No mote has dropped in this character’s log yet. The moment one does it lands here with the zone it dropped in and the mob it came off — the wiki cannot answer either question (all ten mote entries have an empty “drops from”), so this page is built entirely out of your own log.'
        : 'Reading the log…'}
      {' '}The price table and the spend advice below need no drops at all.
    </Alert>
  )
}

/** (a) Where to farm — the page's actual answer, so it leads. */
function WhereToFarm({ view }: { view: MoteFarmingView }): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="mote-where-to-farm">
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
        <Typography variant="subtitle2">Where to farm</Typography>
        <Chip size="small" variant="outlined" label="observed — your log only" sx={{ height: 18, fontSize: 10 }} />
        <Box sx={{ flexGrow: 1 }} />
        {view.clipped && (
          // State, not process: the analytics zone column is capped drop-oldest, so an old drop
          // can have a true count and no span to divide by. Say so rather than let an em-dash
          // read as a bug.
          <Chip
            size="small"
            variant="outlined"
            color="warning"
            label="older drops reach past the analytics window"
            sx={{ height: 20 }}
          />
        )}
      </Stack>
      <MoteZoneChart rows={view.data.zones} />
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
        An instance is its own row: the game puts the difficulty in the zone name, so a d0 camp and
        its (Adaptive) twin are two farms and are never averaged together.
      </Typography>
    </Paper>
  )
}

/** (b) What you've got. */
function WhatYouHave({ view }: { view: MoteFarmingView }): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="mote-what-you-have">
      <Typography variant="subtitle2" gutterBottom>
        What you&apos;ve got
      </Typography>
      <MoteLadderChart rows={view.data.ladder} totalExp={view.data.totalExp} />
    </Paper>
  )
}

export interface MotesViewProps {
  /** The app's Mobs opener (`AppRouting.openMob`), so a source mob's name links to its page.
   *  Optional: the tab is perfectly readable without it, and every cross-view link in this app is
   *  the host's decision — which is also what parks this tab so the drill's Back reads
   *  "Back to Motes" (appRouting.ts / navOrigin.ts). */
  onOpenMob?: (t: MobTarget) => void
}

export default function MotesView({ onOpenMob }: MotesViewProps = {}): JSX.Element {
  const view = useMoteFarming()
  const nothing = view.data.totalEvents === 0

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        <GrainIcon color="primary" />
        <Typography variant="h6">Motes</Typography>
        <Totals view={view} />
      </Stack>

      {nothing ? (
        <EmptyState hydrated={view.hydrated} />
      ) : (
        <>
          <WhereToFarm view={view} />
          <WhatYouHave view={view} />
          <MoteSources rows={view.data.sources} tendency={view.data.tendency} onOpenMob={onOpenMob} />
        </>
      )}

      {/* The two wiki-sourced panels render whether or not anything has dropped — they are the
          advice half, and a player with no motes yet is exactly the one who benefits from reading
          the condensing table BEFORE they have a pile of Infinitesimals to ruin. */}
      <MoteSpendAdvice />
      <MoteLevelClaim evidence={view.data.levelEvidence} />
    </Stack>
  )
}
