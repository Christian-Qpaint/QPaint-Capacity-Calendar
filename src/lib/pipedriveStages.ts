import type { CrmStage } from '@/types'

// Stable fallback for a stage without its own configured color (e.g. a stage added directly in
// Pipedrive that was never colored via Deals > Configure) — same palette CrmBoard.tsx falls back
// to for uncolored deal stages, so a stage looks the same wherever it shows up.
const FALLBACK_PALETTE = ['#94A3B8', '#6FB2EE', '#AFA9EC', '#EF9F27', '#5DCAA5', '#ED6A6A', '#9BCB6B', '#F0997B', '#E2A8E0', '#F2C14E', '#7FD1C6', '#ED93B1']

function hashStageId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return Math.abs(hash) % FALLBACK_PALETTE.length
}

/** Human label for a job's current stage — resolved against the live crm_stages rows (the same
 * table backing the Deals board's Kanban columns), not a hardcoded map, so a stage renamed in
 * Deals > Configure shows up here immediately. */
export function stageLabel(stage: CrmStage | undefined): string {
  return stage?.name ?? 'No stage'
}

/** Background color for a stage, for use in pills/columns/dots — the stage's own configured color
 * if set, otherwise a stable fallback keyed by id so it's still visually distinct. */
export function stageColor(stage: CrmStage | undefined): string {
  if (!stage) return '#94A3B8'
  return stage.color || FALLBACK_PALETTE[hashStageId(stage.id)]
}
