// Manual, on-demand catch-up sync for one local pipeline against Pipedrive — the "Sync from
// Pipedrive" button on the Deals board. Complements (doesn't replace) the two webhooks: those keep
// things current going forward automatically, but any deal untouched in Pipedrive since it was
// copied in (or since before the crm-deal-updated webhook even existed) stays frozen at whatever
// stage/status it had at that moment. This forces a full refresh of one pipeline on demand.
//
// Split into two actions, mirroring marketing-pipedrive-deals.mts + marketingImportRunner.ts's
// established two-phase shape:
//   GET  ?pipelineId=<local uuid>  — one paginated server-side fetch of every Pipedrive deal
//     currently in that pipeline (scoped by its pipedrivePipelineId), returned as raw v1-shaped
//     deal objects. Pipedrive's list endpoint already returns the same flat v1 shape as the single-
//     deal endpoint the webhooks re-fetch from — no per-deal round trip needed here.
//   POST { pipelineId, deals: RawDeal[] } — upserts one chunk of those raw deals: inserts anything
//     not seen before, updates anything already present and still open/lost (same skip-once-Won
//     rule as crm-deal-updated.mts), and leaves already-Won deals alone since Pipedrive stops being
//     their source of truth once promoted to a Job. The client drives the chunking + progress bar
//     (see crmSyncRunner.ts) so a pipeline the size of Sales (11k+ deals) doesn't need one giant,
//     slow, unobservable request.
import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { extractFieldsFromV1Deal, type PipedriveDealPayload } from '../_shared/pipedriveApi.js'
import { attemptPromotion } from '../_shared/dealToJob.js'
import { recordStageEntry } from '../_shared/stageHistory.js'
import { crmPipelines, crmStages, crmFieldDefinitions, crmDeals } from '../../../db/schema.js'

interface PipedriveListResponse {
  success: boolean
  error?: string
  data?: PipedriveDealPayload[]
  additional_data?: { pagination?: { more_items_in_collection?: boolean; next_start?: number } }
}

// `pipeline_id` is NOT a recognized filter on the generic /v1/deals list endpoint — passing it
// there is silently ignored and returns the WHOLE account's deals (confirmed against production:
// a Business Development sync, ~7 real deals, came back with 11,864 — essentially everything).
// /v1/pipelines/{id}/deals is the actual dedicated, correctly-scoped endpoint for this.
//
// `status=all_not_deleted` is required — this endpoint defaults to open deals only, same as
// Pipedrive's own kanban board view. Without it, every Won/Lost deal in the pipeline is silently
// missing from the sync (confirmed against production: a Sales Pipeline sync came back with only
// 1 Lost deal locally against Pipedrive's real ~9,247).
async function fetchDealsPage(pipedrivePipelineId: number, start: number, token: string): Promise<PipedriveListResponse> {
  const res = await fetch(
    `https://api.pipedrive.com/v1/pipelines/${pipedrivePipelineId}/deals?status=all_not_deleted&start=${start}&limit=500&api_token=${token}`,
  )
  const json = (await res.json()) as PipedriveListResponse
  if (!json.success) throw new HttpError(502, json.error ?? 'Pipedrive API error while fetching deals')
  return json
}

export default withErrorHandling(async (req: Request) => {
  await requireOfficeRole(req)
  const db = getDb()

  if (req.method === 'GET') {
    const pipelineId = new URL(req.url).searchParams.get('pipelineId')
    if (!pipelineId) throw new HttpError(400, 'Missing pipelineId')
    const [pipeline] = await db.select().from(crmPipelines).where(eq(crmPipelines.id, pipelineId)).limit(1)
    if (!pipeline) throw new HttpError(404, 'Pipeline not found')
    if (!pipeline.pipedrivePipelineId) throw new HttpError(400, 'This pipeline has no Pipedrive equivalent to sync from')

    const token = process.env.PIPEDRIVE_API_TOKEN
    if (!token) throw new HttpError(500, 'PIPEDRIVE_API_TOKEN is not set on this Function')

    const deals: PipedriveDealPayload[] = []
    let start = 0
    for (;;) {
      const page = await fetchDealsPage(pipeline.pipedrivePipelineId, start, token)
      deals.push(...(page.data ?? []))
      if (!page.additional_data?.pagination?.more_items_in_collection) break
      start = page.additional_data.pagination.next_start ?? start + 500
      if (start > 50000) break // sanity backstop against a runaway loop
    }

    return Response.json({ deals, total: deals.length })
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const pipelineId = body.pipelineId as string
    const rawDeals = (body.deals as PipedriveDealPayload[] | undefined) ?? []
    if (!pipelineId) throw new HttpError(400, 'Missing pipelineId')

    const [pipeline] = await db.select().from(crmPipelines).where(eq(crmPipelines.id, pipelineId)).limit(1)
    if (!pipeline) throw new HttpError(404, 'Pipeline not found')

    const [stageRows, fieldDefs] = await Promise.all([
      db.select().from(crmStages).where(eq(crmStages.pipelineId, pipelineId)),
      db.select().from(crmFieldDefinitions),
    ])
    const stageByPipedriveId = new Map(stageRows.filter((s) => s.pipedriveStageId != null).map((s) => [s.pipedriveStageId as number, s]))

    let created = 0
    let updated = 0
    let skipped = 0

    for (const deal of rawDeals) {
      if (deal.pipeline_id !== pipeline.pipedrivePipelineId) {
        skipped++
        continue
      }
      const pipedriveDealId = String(deal.id)
      const stage = deal.stage_id != null ? stageByPipedriveId.get(deal.stage_id) : undefined
      if (!stage) {
        skipped++
        continue
      }

      const [existing] = await db.select().from(crmDeals).where(eq(crmDeals.pipedriveDealId, pipedriveDealId)).limit(1)
      if (existing?.status === 'won') {
        skipped++
        continue
      }

      const fields = extractFieldsFromV1Deal(deal, fieldDefs)
      const status = deal.status === 'won' || deal.status === 'lost' ? deal.status : 'open'

      if (existing) {
        const stageChanged = stage.id !== existing.stageId
        const stageEnteredAtValue = new Date().toISOString()
        const [row] = await db
          .update(crmDeals)
          .set({
            stageId: stage.id,
            ...(stageChanged ? { stageEnteredAt: stageEnteredAtValue } : {}),
            title: deal.title || existing.title,
            value: deal.value ?? existing.value,
            currency: deal.currency || existing.currency,
            status,
            orgName: deal.org_name ?? null,
            personName: deal.person_name ?? null,
            lostReason: deal.lost_reason ?? null,
            wonAt: status === 'won' ? (deal.won_time ?? existing.wonAt ?? new Date().toISOString()) : existing.wonAt,
            lostAt: status === 'lost' ? (deal.lost_time ?? existing.lostAt ?? new Date().toISOString()) : existing.lostAt,
            fields,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(crmDeals.id, existing.id))
          .returning()
        if (stageChanged) await recordStageEntry(db, row.id, stage.id, stageEnteredAtValue)
        // existing.status is already guaranteed not 'won' by the guard above, so any 'won' here is new.
        if (status === 'won') await attemptPromotion(db, row)
        updated++
      } else {
        const [row] = await db
          .insert(crmDeals)
          .values({
            pipelineId,
            stageId: stage.id,
            title: deal.title || `Deal ${deal.id}`,
            value: deal.value ?? 0,
            currency: deal.currency || 'AUD',
            status,
            pipedriveDealId,
            orgName: deal.org_name ?? null,
            personName: deal.person_name ?? null,
            lostReason: deal.lost_reason ?? null,
            wonAt: status === 'won' ? (deal.won_time ?? new Date().toISOString()) : null,
            lostAt: status === 'lost' ? (deal.lost_time ?? new Date().toISOString()) : null,
            fields,
            createdAt: deal.add_time ?? undefined,
            stageEnteredAt: deal.add_time ?? undefined,
          })
          .returning({ id: crmDeals.id, stageEnteredAt: crmDeals.stageEnteredAt })
        await recordStageEntry(db, row.id, stage.id, row.stageEnteredAt)
        created++
      }
    }

    return Response.json({ created, updated, skipped, total: rawDeals.length })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/crm-sync-deals',
}
