// Pipedrive Jobs Pipeline (pipeline_id 3) stage ids this app cares about. Must stay in sync with
// TARGET_STAGE_IDS in supabase/functions/pipedrive-sync/index.ts — duplicated rather than shared
// since the Edge Function (Deno) and this frontend (Vite/browser) aren't part of the same build.
export const PIPEDRIVE_STAGE_LABELS: Record<number, string> = {
  25: 'Admin',
  26: 'Ready to Schedule',
  27: 'Booked',
  28: 'In Progress',
  29: 'Completed',
  38: 'On Hold',
  45: 'All Done & Paid',
}

// Every job can be scheduled onto the Calendar regardless of its Pipedrive stage — this is just
// the default stage offered when manually adding a new job.
export const PIPEDRIVE_TARGET_STAGE_IDS = [26, 27, 28]

/** Human label for any stage id, falling back to a raw id when it's outside the ones we have real
 * names for — we don't know the exact names of every stage in the pipeline, so this stays honest
 * rather than guessing "Admin"/"Done"/etc. */
export function stageLabel(stageId: number | undefined): string {
  if (stageId == null) return '—'
  return PIPEDRIVE_STAGE_LABELS[stageId] ?? `Stage #${stageId}`
}

/** Every stage id worth showing as an option (in the Add Job form, Advanced Filter, etc): every
 * stage we have a real name for, unioned with any stage id actually seen on a loaded job — so a
 * not-yet-named stage still shows up (as "Stage #N") rather than being impossible to select. */
export function allKnownStageIds(jobs: { pipedriveStageId?: number | null }[]): number[] {
  const ids = new Set<number>(Object.keys(PIPEDRIVE_STAGE_LABELS).map(Number))
  for (const j of jobs) {
    if (j.pipedriveStageId != null) ids.add(j.pipedriveStageId)
  }
  return Array.from(ids).sort((a, b) => a - b)
}

// Hand-picked so the color roughly tracks progress through the pipeline (cool/neutral early,
// warm while active, green once producing, red when stuck) rather than being arbitrary.
const STAGE_COLORS: Record<number, string> = {
  25: '#94A3B8', // Admin — slate, pre-production admin work
  26: '#6FB2EE', // Ready to Schedule — blue, ready to go
  27: '#AFA9EC', // Booked — violet, committed to the calendar
  28: '#EF9F27', // In Progress — amber, actively being painted
  29: '#5DCAA5', // Completed — teal, production finished
  38: '#ED6A6A', // On Hold — red, stalled/blocked
  45: '#9BCB6B', // All Done & Paid — green, fully closed out
}
// Stable fallback for any stage id without a hand-picked color above (a new/unmapped stage).
const FALLBACK_PALETTE = ['#F0997B', '#E2A8E0', '#F2C14E', '#7FD1C6', '#ED93B1']

function hashStageId(id: number): number {
  return Math.abs(Math.sin(id) * 10000) % FALLBACK_PALETTE.length | 0
}

/** Background color for a stage id, for use in pills/columns/dots. Not affected by dark mode —
 * these are deliberately saturated brand-ish colors, same as the crew color palette. */
export function stageColor(stageId: number | undefined): string {
  if (stageId == null) return '#94A3B8'
  return STAGE_COLORS[stageId] ?? FALLBACK_PALETTE[hashStageId(stageId)]
}
