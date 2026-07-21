// Pipedrive Jobs Pipeline (pipeline_id 3) stage ids this app cares about. Must stay in sync with
// TARGET_STAGE_IDS in supabase/functions/pipedrive-sync/index.ts — duplicated rather than shared
// since the Edge Function (Deno) and this frontend (Vite/browser) aren't part of the same build.
export const PIPEDRIVE_STAGE_LABELS: Record<number, string> = {
  26: 'Ready to Schedule',
  27: 'Booked',
  28: 'In Progress',
}

export const PIPEDRIVE_TARGET_STAGE_IDS = Object.keys(PIPEDRIVE_STAGE_LABELS).map(Number)

/** Whether a job's synced stage is one of the 3 schedulable ones above — everything else (earlier
 * stages like Quoting, or later ones like Admin/Done) still syncs in (see the pipeline-wide fetch
 * in supabase/functions/pipedrive-sync) but can't be added to the Calendar. */
export function isSchedulableStage(stageId: number | undefined): boolean {
  return stageId != null && PIPEDRIVE_TARGET_STAGE_IDS.includes(stageId)
}

/** Human label for any stage id, falling back to a raw id when it's outside the 3 we have real
 * names for — we don't know the exact names of every stage in the pipeline, so this stays honest
 * rather than guessing "Admin"/"Done"/etc. */
export function stageLabel(stageId: number | undefined): string {
  if (stageId == null) return '—'
  return PIPEDRIVE_STAGE_LABELS[stageId] ?? `Stage #${stageId}`
}
