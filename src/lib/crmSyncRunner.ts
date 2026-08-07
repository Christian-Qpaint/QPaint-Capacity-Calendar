import { api } from '@/lib/apiClient'

// Smaller than marketingImportRunner's 300 — each row here does more server-side work (stage
// lookup, custom-field extraction, a write per deal, an occasional stage-history insert, an
// occasional Won->Job promotion), so a smaller chunk keeps each request comfortably inside a
// normal Function timeout. The existing-row lookup itself is now batched server-side (one query
// per chunk, not one per deal), but a chunk's remaining per-deal writes are still sequential —
// confirmed via production `netlify logs` that 100 was too large against real Supabase latency
// (several live invocations clocked at 44-50s, right at the platform's timeout ceiling).
const SYNC_CHUNK_SIZE = 40

export interface RawPipedriveDeal {
  id: number
  [key: string]: unknown
}

// Safety backstop against a runaway paging loop (e.g. Pipedrive's pagination cursor never settling)
// — 500/page, so this allows up to 100k deals, comfortably above any real pipeline here.
const MAX_FETCH_PAGES = 200

/** Phase 1 — done up front, one Pipedrive page (500 deals) per request: fetches every deal
 * currently in this pipeline. Needed before the tracked job can even start, since
 * ImportProgressContext.runImport wants a known total for its progress bar. Paged from here
 * (rather than looped server-side in one function invocation) because a single request looping
 * every page itself reliably exceeded Netlify's function timeout for a pipeline the size of Sales
 * (9k+ deals) — see crm-sync-deals.mts's GET handler. */
export async function fetchPipelineDealsFromPipedrive(pipelineId: string): Promise<{ deals: RawPipedriveDeal[]; total: number }> {
  const deals: RawPipedriveDeal[] = []
  let start = 0
  for (let page = 0; page < MAX_FETCH_PAGES; page++) {
    const result = await api.get<{ deals: RawPipedriveDeal[]; moreAvailable: boolean; nextStart: number | null }>(
      `/api/crm-sync-deals?pipelineId=${pipelineId}&start=${start}`,
    )
    deals.push(...result.deals)
    if (!result.moreAvailable || result.nextStart == null) break
    start = result.nextStart
  }
  return { deals, total: deals.length }
}

/** Phase 3 — run once after the fetch+upsert pass above completes, using the exact set of deal ids
 * just fetched from Pipedrive. Deletes any local deal in this pipeline whose id isn't in that set,
 * so a sync mirrors Pipedrive in both directions (add/update AND remove) — the GET fetch above only
 * ever returns currently-existing (`status=all_not_deleted`) deals, so anything deleted on
 * Pipedrive's side would otherwise never be reflected here. */
export async function reconcileDeletedPipelineDeals(pipelineId: string, currentDeals: RawPipedriveDeal[]): Promise<{ deleted: number }> {
  return api.post<{ deleted: number }>('/api/crm-sync-deals', {
    action: 'reconcile',
    pipelineId,
    currentPipedriveDealIds: currentDeals.map((d) => String(d.id)),
  })
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

// ---- Jobs Pipeline variants — same two-phase shape as above, but writing to `jobs` instead of
// `crm_deals` (see jobs-sync-pipedrive.mts's own header comment for why this pipeline needs its
// own write-side endpoint while still sharing the generic GET fetch above). ----

/** Phase 2 (Jobs Pipeline) — upserts the already-fetched deals into `jobs` in fixed-size chunks. */
export async function chunkedSyncJobsFromPipedrive(
  pipelineId: string,
  deals: RawPipedriveDeal[],
  onProgress: (completed: number) => void,
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0
  let updated = 0
  let skipped = 0
  for (let i = 0; i < deals.length; i += SYNC_CHUNK_SIZE) {
    const chunk = deals.slice(i, i + SYNC_CHUNK_SIZE)
    const result = await api.post<{ created: number; updated: number; skipped: number }>('/api/jobs-sync-pipedrive', {
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

/** Phase 3 (Jobs Pipeline) — archives (never deletes — a Job is a real production record) any Job
 * on this pipeline's board whose Pipedrive deal isn't in the just-fetched set. */
export async function reconcileArchivedJobsPipelineDeals(pipelineId: string, currentDeals: RawPipedriveDeal[]): Promise<{ archived: number }> {
  return api.post<{ archived: number }>('/api/jobs-sync-pipedrive', {
    action: 'reconcile',
    pipelineId,
    currentPipedriveDealIds: currentDeals.map((d) => String(d.id)),
  })
}
