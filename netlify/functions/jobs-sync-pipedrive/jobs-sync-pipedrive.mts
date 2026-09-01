// Manual, on-demand catch-up sync for the Jobs Pipeline against Pipedrive — the "Sync from
// Pipedrive" button, extended to this pipeline too. Post Jobs/Jobs-Pipeline merge, a Job IS its
// Jobs Pipeline board card (see crm-job-updated.mts), so this writes straight to `jobs` instead of
// `crm_deals`, unlike crm-sync-deals.mts which the other pipelines still use.
//
// Shares crm-sync-deals.mts's GET handler (/api/crm-sync-deals?pipelineId=...) for the fetch side —
// that endpoint only ever talks to Pipedrive by pipedrivePipelineId, so it's already generic across
// every pipeline including this one. Only the write side (upsert + reconcile) differs enough to
// warrant its own function, split the same way:
//   POST { pipelineId, deals: RawDeal[] } — upserts one chunk: creates/adopts a Job for anything not
//     seen before and still Won (via createOrAdoptJobFromDeal, same path the real-time webhook and
//     every other promotion route uses — a deal can never produce two Jobs no matter which path
//     reaches it first), or patches stage/fields/contact on an already-linked Job. A deal that
//     isn't (or no longer is) status='won' has its Job deleted outright instead — this is what
//     catches a deal reverted from Won back to Lost/Open in Pipedrive, which the reconcile action
//     below alone can't (reconcile only catches a deal vanishing from Pipedrive entirely, not one
//     still present but no longer Won). The existing-job lookup is batched per chunk (one query,
//     not one per deal) — the equivalent per-deal lookup in crm-sync-deals.mts was confirmed (via
//     netlify logs) to blow the function timeout against real production data volume.
//   POST { action: 'reconcile', pipelineId, currentPipedriveDealIds } — run once after a full
//     fetch+upsert pass, using the exact set of Pipedrive deal ids just fetched. Pipedrive is the
//     single source of truth: a Job whose Pipedrive deal is gone gets deleted outright, same as
//     crm-sync-deals.mts's reconcile for Sales/Business Development, and same as the real-time
//     delete-webhook path (crm-job-updated.mts). This cascades to that job's schedule_blocks
//     (Capacity Calendar bookings) and weekly_actuals (logged hours) — an explicit, confirmed
//     tradeoff (see the commit this comment shipped in), not an oversight; there is no Pipedrive
//     copy of that scheduling data to recover it from. Only ever touches jobs currently placed on
//     this pipeline's own stages — a job with no stageId (rare legacy backfill) or one sitting on a
//     different pipeline's stage is never touched. Also never touches a `MANUAL-`-prefixed
//     pipedriveDealId (see dealToJob.ts) — a manually-added Sales/Business Development deal, once
//     promoted to a Job, lands on this pipeline's first stage same as any other Job, but it never
//     had a real Pipedrive Jobs Pipeline deal to begin with, so it can never appear in
//     currentPipedriveDealIds and would otherwise get deleted on every single sync.
import { eq, and, inArray, isNotNull, notInArray, notLike } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireCrmAccess, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { type PipedriveDealPayload } from '../_shared/pipedriveApi.js'
import { upsertJobsPipelineDeals } from '../_shared/dealSync.js'
import { crmPipelines, crmStages, jobs } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  await requireCrmAccess(req)
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')

  const db = getDb()
  const body = await parseJsonBody(req)
  const pipelineId = body.pipelineId as string
  if (!pipelineId) throw new HttpError(400, 'Missing pipelineId')

  const [pipeline] = await db.select().from(crmPipelines).where(eq(crmPipelines.id, pipelineId)).limit(1)
  if (!pipeline) throw new HttpError(404, 'Pipeline not found')

  if (body.action === 'reconcile') {
    const currentIds = ((body.currentPipedriveDealIds as (string | number)[] | undefined) ?? []).map(String)
    // Same safety backstop as crm-sync-deals.mts's reconcile — refuse an empty id set rather than
    // risk deleting every job on the board off a partial/failed fetch.
    if (currentIds.length === 0) throw new HttpError(400, 'Refusing to reconcile against an empty deal id set')

    const pipelineStageIds = (await db.select({ id: crmStages.id }).from(crmStages).where(eq(crmStages.pipelineId, pipelineId))).map((s) => s.id)
    if (pipelineStageIds.length === 0) return Response.json({ deleted: 0 })

    const deleted = await db
      .delete(jobs)
      .where(
        and(
          inArray(jobs.stageId, pipelineStageIds),
          isNotNull(jobs.pipedriveDealId),
          notLike(jobs.pipedriveDealId, 'MANUAL-%'),
          notInArray(jobs.pipedriveDealId, currentIds),
        ),
      )
      .returning({ id: jobs.id })

    return Response.json({ deleted: deleted.length })
  }

  const rawDeals = (body.deals as PipedriveDealPayload[] | undefined) ?? []

  // Shared with crm-sync-deals.mts's own upsert and the scheduled reconciliation backstop
  // (pipedrive-reconcile-sync.mts) — see _shared/dealSync.ts's header for why this lives there
  // instead of being duplicated in each caller.
  const { created, updated, skipped, deleted } = await upsertJobsPipelineDeals(db, pipeline, rawDeals)

  return Response.json({ created, updated, skipped, deleted, total: rawDeals.length })
})

export const config = {
  path: '/api/jobs-sync-pipedrive',
}
