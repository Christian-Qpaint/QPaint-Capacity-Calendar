// Manual, on-demand catch-up sync for one local pipeline against Pipedrive — the "Sync from
// Pipedrive" button on the Deals board. Complements (doesn't replace) the two webhooks: those keep
// things current going forward automatically, but any deal untouched in Pipedrive since it was
// copied in (or since before the crm-deal-updated webhook even existed) stays frozen at whatever
// stage/status it had at that moment. This forces a full refresh of one pipeline on demand.
//
// Split into two actions, mirroring marketing-pipedrive-deals.mts + marketingImportRunner.ts's
// established two-phase shape:
//   GET  ?pipelineId=<local uuid>&start=<n>  — fetches ONE page (500) of Pipedrive deals currently
//     in that pipeline (scoped by its pipedrivePipelineId), returned as raw v1-shaped deal objects
//     plus a moreAvailable/nextStart cursor. Deliberately one Pipedrive round-trip per request (not
//     a server-side loop over every page) — Sales Pipeline alone is ~9,247+ deals, and a synchronous
//     loop fetching all of them inside one function invocation reliably exceeded Netlify's function
//     execution timeout, which serves an HTML error page instead of JSON on timeout (surfaced to
//     users as "Unexpected token '<' ... is not valid JSON"). The client (crmSyncRunner.ts) drives
//     the paging loop instead, same as it already drives the POST upsert chunking below. For Jobs
//     Pipeline specifically, fetchDealsPage below scans the whole account via the generic /v1/deals
//     endpoint instead — its own dedicated /v1/pipelines/3/deals endpoint is confirmed broken on
//     this account (returns success with zero results, not an error).
//   POST { pipelineId, deals: RawDeal[] } — upserts one chunk of those raw deals: inserts anything
//     not seen before, updates anything already present and still open/lost (same skip-once-Won
//     rule as crm-deal-updated.mts), and leaves already-Won deals alone since Pipedrive stops being
//     their source of truth once promoted to a Job. The client drives the chunking + progress bar
//     (see crmSyncRunner.ts) so a pipeline the size of Sales (11k+ deals) doesn't need one giant,
//     slow, unobservable request.
//   POST { action: 'reconcile', pipelineId, currentPipedriveDealIds } — run once after a full
//     fetch+upsert pass completes, using the complete set of Pipedrive deal ids the client just
//     paged through above. `status=all_not_deleted` on the GET means a deal deleted in Pipedrive
//     never appears there in the first place, so it would otherwise sit here forever after being
//     removed on Pipedrive's side. Deletes any local crm_deals row for this pipeline whose
//     pipedriveDealId isn't in that set, so this sync mirrors Pipedrive 1:1 in both directions
//     (add/update AND remove), not just add/update. Never touches rows with a null pipedriveDealId
//     (deals added manually here, never sourced from Pipedrive) or the Jobs Pipeline (which has no
//     crm_deals rows left post-merge — see crm-job-updated.mts instead).
import { eq, and, isNotNull, notInArray } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireCrmAccess, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { type PipedriveDealPayload } from '../_shared/pipedriveApi.js'
import { upsertSalesDeals } from '../_shared/dealSync.js'
import { crmPipelines, crmDeals } from '../../../db/schema.js'

interface PipedriveListResponse {
  success: boolean
  error?: string
  data?: PipedriveDealPayload[]
  additional_data?: { pagination?: { more_items_in_collection?: boolean; next_start?: number } }
}

// `status=all_not_deleted` is required on both endpoints below — they default to open deals only,
// same as Pipedrive's own kanban board view. Without it, every Won/Lost deal in the pipeline is
// silently missing from the sync (confirmed against production: a Sales Pipeline sync came back
// with only 1 Lost deal locally against Pipedrive's real ~9,247).

// This account's Jobs Pipeline specifically has a confirmed visibility-group restriction on
// /v1/pipelines/{id}/deals — it returns `success: true` with zero results and no error (not a
// permissions error, not empty-because-genuinely-empty; verified directly against the live API,
// still true even with an Owner-level token), while the generic /v1/deals endpoint returns real
// results fine. Every other pipeline uses the dedicated endpoint below as normal.
const JOBS_PIPELINE_PIPEDRIVE_ID = 3

// `pipeline_id` is NOT a recognized filter on the generic /v1/deals list endpoint — passing it
// there is silently ignored and returns the WHOLE account's deals (confirmed against production:
// a Business Development sync, ~7 real deals, came back with 11,864 — essentially everything), so
// it's only used (with client-side filtering below) as a workaround for Jobs Pipeline's dedicated-
// endpoint restriction above — every other pipeline uses the dedicated, correctly-scoped
// /v1/pipelines/{id}/deals endpoint, which doesn't have this problem.
async function fetchDealsPage(pipedrivePipelineId: number, start: number, token: string): Promise<PipedriveListResponse> {
  if (pipedrivePipelineId === JOBS_PIPELINE_PIPEDRIVE_ID) {
    const res = await fetch(`https://api.pipedrive.com/v1/deals?status=all_not_deleted&start=${start}&limit=500&api_token=${token}`)
    const json = (await res.json()) as PipedriveListResponse
    if (!json.success) throw new HttpError(502, json.error ?? 'Pipedrive API error while fetching deals')
    return { ...json, data: (json.data ?? []).filter((d) => d.pipeline_id === pipedrivePipelineId) }
  }

  const res = await fetch(
    `https://api.pipedrive.com/v1/pipelines/${pipedrivePipelineId}/deals?status=all_not_deleted&start=${start}&limit=500&api_token=${token}`,
  )
  const json = (await res.json()) as PipedriveListResponse
  if (!json.success) throw new HttpError(502, json.error ?? 'Pipedrive API error while fetching deals')
  return json
}

export default withErrorHandling(async (req: Request) => {
  await requireCrmAccess(req)
  const db = getDb()

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const pipelineId = url.searchParams.get('pipelineId')
    if (!pipelineId) throw new HttpError(400, 'Missing pipelineId')
    const start = Number(url.searchParams.get('start') ?? '0')
    const [pipeline] = await db.select().from(crmPipelines).where(eq(crmPipelines.id, pipelineId)).limit(1)
    if (!pipeline) throw new HttpError(404, 'Pipeline not found')
    if (!pipeline.pipedrivePipelineId) throw new HttpError(400, 'This pipeline has no Pipedrive equivalent to sync from')

    const token = process.env.PIPEDRIVE_API_TOKEN
    if (!token) throw new HttpError(500, 'PIPEDRIVE_API_TOKEN is not set on this Function')

    const page = await fetchDealsPage(pipeline.pipedrivePipelineId, start, token)
    const moreAvailable = !!page.additional_data?.pagination?.more_items_in_collection
    const nextStart = moreAvailable ? (page.additional_data?.pagination?.next_start ?? start + 500) : null

    return Response.json({ deals: page.data ?? [], moreAvailable, nextStart })
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const pipelineId = body.pipelineId as string
    if (!pipelineId) throw new HttpError(400, 'Missing pipelineId')

    if (body.action === 'reconcile') {
      const currentIds = ((body.currentPipedriveDealIds as (string | number)[] | undefined) ?? []).map(String)
      // A pipeline the size of Sales always has thousands of deals — an empty (or clearly truncated)
      // id set here means the client's own paging loop failed or was interrupted partway, not that
      // Pipedrive genuinely has zero deals in this pipeline. Refuse rather than risk wiping every
      // local row for the pipeline off a bad reconcile call.
      if (currentIds.length === 0) throw new HttpError(400, 'Refusing to reconcile against an empty deal id set')

      const deleted = await db
        .delete(crmDeals)
        .where(and(eq(crmDeals.pipelineId, pipelineId), isNotNull(crmDeals.pipedriveDealId), notInArray(crmDeals.pipedriveDealId, currentIds)))
        .returning({ id: crmDeals.id })

      return Response.json({ deleted: deleted.length })
    }

    const rawDeals = (body.deals as PipedriveDealPayload[] | undefined) ?? []

    const [pipeline] = await db.select().from(crmPipelines).where(eq(crmPipelines.id, pipelineId)).limit(1)
    if (!pipeline) throw new HttpError(404, 'Pipeline not found')

    // Shared with jobs-sync-pipedrive.mts's own upsert and the scheduled reconciliation backstop
    // (pipedrive-reconcile-sync.mts) — see _shared/dealSync.ts's header for why this lives there
    // instead of being duplicated in each caller.
    const { created, updated, skipped } = await upsertSalesDeals(db, pipeline, rawDeals)

    return Response.json({ created, updated, skipped, total: rawDeals.length })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/crm-sync-deals',
}
