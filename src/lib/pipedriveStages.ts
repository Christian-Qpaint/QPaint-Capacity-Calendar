import type { CrmStage } from '@/types'

// Fallback palette for a stage without its own configured color (e.g. one added directly in
// Pipedrive that was never colored via Deals > Configure), split by what the color should *signal*
// rather than one flat rainbow — green/teal/blue/purple reads as "progressing normally", warm
// red/orange/yellow reads as "something needs attention", regardless of where the stage happens to
// sit in the pipeline order. A stage clearly meant as a final success (Won, or a name like "Done"/
// "Completed"/"Paid") always gets the same unambiguous green rather than whatever the ramp lands
// on positionally — "7. All Done & Paid" being 7th shouldn't make it look no different from an
// ordinary mid-pipeline stage.
const POSITIVE_RAMP = ['#9BCB6B', '#5DCAA5', '#7FD1C6', '#6FB2EE', '#7C93F0', '#AFA9EC', '#C58FE0']
const NEGATIVE_RAMP = ['#ED6A6A', '#F0997B', '#EF9F27', '#F2C14E']
const STRONG_POSITIVE_COLOR = '#3FAE5C'

// Substring match against the stage's own name — the only signal available for a name Pipedrive
// itself doesn't tag as "won" (isWonStage covers the true won/final stage already).
const NEGATIVE_NAME_KEYWORDS = ['hold', 'lost', 'cancel', 'block', 'stuck', 'delay', 'overdue', 'reject', 'declin']
const STRONG_POSITIVE_NAME_KEYWORDS = ['done', 'paid', 'complete', 'won', 'finish']

function nameMatches(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase()
  return keywords.some((kw) => lower.includes(kw))
}

/** Human label for a job's current stage — resolved against the live crm_stages rows (the same
 * table backing the Deals board's Kanban columns), not a hardcoded map, so a stage renamed in
 * Deals > Configure shows up here immediately. */
export function stageLabel(stage: CrmStage | undefined): string {
  return stage?.name ?? 'No stage'
}

/** Background color for a stage, for use in pills/columns/dots — the stage's own configured color
 * if set, otherwise a stable fallback so it's still visually distinct from its neighbours *and*
 * reads as positive/negative correctly (see the ramp comment above).
 *
 * The ramp/keyword fallback is keyed by the stage's own `order` (its position within its
 * pipeline), not a hash of its id — a hash can (and did) put two real stages in the same small
 * pipeline on the same fallback color by pure coincidence, which is exactly the "which stage is
 * this row actually in" confusion this is meant to prevent. `order` is unique per pipeline and
 * small (a handful of board columns), so two stages in the same pipeline only collide if that
 * pipeline somehow has more stages than the relevant ramp has colors — effectively never in
 * practice. */
export function stageColor(stage: CrmStage | undefined): string {
  if (!stage) return '#94A3B8'
  if (stage.color) return stage.color
  if (stage.isWonStage || nameMatches(stage.name, STRONG_POSITIVE_NAME_KEYWORDS)) return STRONG_POSITIVE_COLOR
  if (nameMatches(stage.name, NEGATIVE_NAME_KEYWORDS)) return NEGATIVE_RAMP[stage.order % NEGATIVE_RAMP.length]
  return POSITIVE_RAMP[stage.order % POSITIVE_RAMP.length]
}
