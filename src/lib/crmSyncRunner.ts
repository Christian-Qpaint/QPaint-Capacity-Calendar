import { api } from '@/lib/apiClient'

// Smaller than marketingImportRunner's 300 — each row here does more server-side work (existing-row
// lookup, stage lookup, custom-field extraction, an occasional Won->Job promotion), so a smaller
// chunk keeps each request comfortably inside a normal Function timeout.
const SYNC_CHUNK_SIZE = 100

export interface RawPipedriveDeal {
  id: number
  [key: string]: unknown
}

/** Phase 1 — one request, done up front (not chunked): fetches every Pipedrive deal currently in
 * this pipeline. Needed before the tracked job can even start, since ImportProgressContext.runImport
 * wants a known total for its progress bar. */
export async function fetchPipelineDealsFromPipedrive(pipelineId: string): Promise<{ deals: RawPipedriveDeal[]; total: number }> {
  return api.get<{ deals: RawPipedriveDeal[]; total: number }>(`/api/crm-sync-deals?pipelineId=${pipelineId}`)
}

/** Phase 2 — upserts the already-fetched deals in fixed-size chunks, reporting progress after each
 * one. Runs via ImportProgressContext so it keeps going (and stays visible) even if the user
 * navigates away from the Deals page mid-sync. */
export async function chunkedSyncPipelineDeals(
  pipelineId: string,
  deals: RawPipedriveDeal[],
  onProgress: (completed: number) => void,
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0
  let updated = 0
  let skipped = 0
  for (let i = 0; i < deals.length; i += SYNC_CHUNK_SIZE) {
    const chunk = deals.slice(i, i + SYNC_CHUNK_SIZE)
    const result = await api.post<{ created: number; updated: number; skipped: number }>('/api/crm-sync-deals', {
      pipelineId,
      deals: chunk,
    })
    created += result.created
    updated += result.updated
    skipped += result.skipped
    onProgress(Math.min(i + SYNC_CHUNK_SIZE, deals.length))
  }
  return { created, updated, skipped }
}
