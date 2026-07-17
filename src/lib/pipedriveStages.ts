// Pipedrive Jobs Pipeline (pipeline_id 3) stage ids this app cares about. Must stay in sync with
// TARGET_STAGE_IDS in supabase/functions/pipedrive-sync/index.ts — duplicated rather than shared
// since the Edge Function (Deno) and this frontend (Vite/browser) aren't part of the same build.
export const PIPEDRIVE_STAGE_LABELS: Record<number, string> = {
  26: 'Ready to Schedule',
  27: 'Booked',
  28: 'In Progress',
}

export const PIPEDRIVE_TARGET_STAGE_IDS = Object.keys(PIPEDRIVE_STAGE_LABELS).map(Number)
