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
//     seen before (via createOrAdoptJobFromDeal, same path the real-time webhook and every other
//     promotion route uses — a deal can never produce two Jobs no matter which path reaches it
//     first), or patches stage/fields/contact on an already-linked Job. The existing-job lookup is
//     batched per chunk (one query, not one per deal) — the equivalent per-deal lookup in
//     crm-sync-deals.mts was confirmed (via netlify logs) to blow the function timeout against real
//     production data volume.
//   POST { action: 'reconcile', pipelineId, currentPipedriveDealIds } — run once after a full
//     fetch+upsert pass, using the exact set of Pipedrive deal ids just fetched. A Job is a real
//     production record (schedule blocks, actual hours, capacity calendar), never hard-deleted per
//     the standing rule from the Jobs/Jobs-Pipeline merge — so a Job whose Pipedrive deal vanished
//     gets archived (archivedAt set) instead of removed, same as the real-time delete-webhook path.
//     Only ever touches jobs currently placed on this pipeline's own stages — a job with no stageId
//     (rare legacy backfill) or one sitting on a different pipeline's stage is never touched.
import { eq, and, inArray, isNotNull, notInArray } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireCrmAccess, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { extractFieldsFromV1Deal, extractPrimaryContact, type PipedriveDealPayload } from '../_shared/pipedriveApi.js'
import { createOrAdoptJobFromDeal, CATEGORY_OPTION_MAP, FIELD_TARGET_HOURS, FIELD_ACTUAL_HOURS, FIELD_CATEGORY, FIELD_ADDRESS } from '../_shared/dealToJob.js'
import { recordStageEntry } from '../_shared/stageHistory.js'
import { crmPipelines, crmStages, crmFieldDefinitions, jobs, clients } from '../../../db/schema.js'

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
    // risk archiving every job on the board off a partial/failed fetch.
    if (currentIds.length === 0) throw new HttpError(400, 'Refusing to reconcile against an empty deal id set')

    const pipelineStageIds = (await db.select({ id: crmStages.id }).from(crmStages).where(eq(crmStages.pipelineId, pipelineId))).map((s) => s.id)
    if (pipelineStageIds.length === 0) return Response.json({ archived: 0 })

    const archived = await db
      .update(jobs)
      .set({ archivedAt: new Date().toISOString() })
      .where(and(inArray(jobs.stageId, pipelineStageIds), isNotNull(jobs.pipedriveDealId), notInArray(jobs.pipedriveDealId, currentIds)))
      .returning({ id: jobs.id })

    return Response.json({ archived: archived.length })
  }

  const rawDeals = (body.deals as PipedriveDealPayload[] | undefined) ?? []

  const [stageRows, fieldDefs, existingJobRows] = await Promise.all([
    db.select().from(crmStages).where(eq(crmStages.pipelineId, pipelineId)),
    db.select().from(crmFieldDefinitions),
    rawDeals.length > 0
      ? db.select().from(jobs).where(inArray(jobs.pipedriveDealId, rawDeals.map((d) => String(d.id))))
      : Promise.resolve([]),
  ])
  const stageByPipedriveId = new Map(stageRows.filter((s) => s.pipedriveStageId != null).map((s) => [s.pipedriveStageId as number, s]))
  const existingByPipedriveId = new Map(existingJobRows.map((r) => [r.pipedriveDealId, r]))

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

    const fields = extractFieldsFromV1Deal(deal, fieldDefs)
    const contact = extractPrimaryContact(deal)
    const existingJob = existingByPipedriveId.get(pipedriveDealId)

    if (existingJob) {
      const stageChanged = stage.id !== existingJob.stageId
      const stageEnteredAtValue = new Date().toISOString()
      const patch: Record<string, unknown> = { fields }
      if (stageChanged) {
        patch.stageId = stage.id
        patch.stageEnteredAt = stageEnteredAtValue
      }
      if (deal.title) patch.pipedriveDealTitle = deal.title
      if (typeof deal.value === 'number') patch.totalValue = deal.value
      const rawTargetHours = fields[FIELD_TARGET_HOURS]
      if (typeof rawTargetHours === 'number') patch.targetHours = rawTargetHours
      const rawActualHours = fields[FIELD_ACTUAL_HOURS]
      if (typeof rawActualHours === 'number') patch.actualHours = rawActualHours
      const mappedCategory = CATEGORY_OPTION_MAP[String(fields[FIELD_CATEGORY] ?? '')]
      if (mappedCategory) patch.category = mappedCategory
      const address = fields[FIELD_ADDRESS] as string | undefined
      if (address) patch.address = address

      await db.update(jobs).set(patch).where(eq(jobs.id, existingJob.id))
      if (stageChanged) await recordStageEntry(db, { jobId: existingJob.id }, stage.id, stageEnteredAtValue)
      if (contact.phone || contact.email) {
        await db.update(clients).set({ phone: contact.phone, email: contact.email }).where(eq(clients.id, existingJob.clientId))
      }
      updated++
      continue
    }

    const rawTargetHours = fields[FIELD_TARGET_HOURS]
    const targetHours = typeof rawTargetHours === 'number' ? rawTargetHours : null
    const rawActualHours = fields[FIELD_ACTUAL_HOURS]
    const actualHours = typeof rawActualHours === 'number' ? rawActualHours : null
    const categoryOptionId = String(fields[FIELD_CATEGORY] ?? '')
    const address = (fields[FIELD_ADDRESS] as string | undefined) ?? ''

    const result = await createOrAdoptJobFromDeal(db, {
      pipedriveDealId,
      title: deal.title ?? null,
      orgName: deal.org_name ?? null,
      personName: deal.person_name ?? null,
      value: deal.value ?? 0,
      targetHours,
      actualHours,
      category: CATEGORY_OPTION_MAP[categoryOptionId] ?? 'Commercial',
      address,
      dateWon: (deal.won_time ?? deal.add_time ?? new Date().toISOString()).slice(0, 10),
      personPhone: contact.phone,
      personEmail: contact.email,
    })

    if (result.status === 'skipped') {
      skipped++
      continue
    }
    created++
  }

  return Response.json({ created, updated, skipped, total: rawDeals.length })
})

export const config = {
  path: '/api/jobs-sync-pipedrive',
}
