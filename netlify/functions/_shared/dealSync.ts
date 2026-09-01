// Core upsert logic shared by every path that writes Pipedrive deals into this app — the manual
// "Sync from Pipedrive" buttons (crm-sync-deals.mts, jobs-sync-pipedrive.mts) and the scheduled
// reconciliation backstop (pipedrive-reconcile-sync.mts). Extracted here so all three stay
// identical by construction instead of three copies of the same upsert rules quietly drifting
// apart over time.
import { eq, inArray } from 'drizzle-orm'
import { getDb } from './db.js'
import { extractFieldsFromV1Deal, extractPrimaryContact, type PipedriveDealPayload } from './pipedriveApi.js'
import { attemptPromotion, createOrAdoptJobFromDeal, CATEGORY_OPTION_MAP, FIELD_TARGET_HOURS, FIELD_ACTUAL_HOURS, FIELD_CATEGORY, FIELD_ADDRESS } from './dealToJob.js'
import { recordStageEntry } from './stageHistory.js'
import { crmStages, crmFieldDefinitions, crmDeals, jobs, clients, type crmPipelines } from '../../../db/schema.js'

type Db = ReturnType<typeof getDb>
type CrmPipelineRow = typeof crmPipelines.$inferSelect

export interface UpsertResult {
  created: number
  updated: number
  skipped: number
  deleted: number
}

/** Sales/Business Development (any non-Jobs-Pipeline pipeline) — writes to crm_deals. */
export async function upsertSalesDeals(db: Db, pipeline: CrmPipelineRow, rawDeals: PipedriveDealPayload[]): Promise<UpsertResult> {
  const [stageRows, fieldDefs, existingRows] = await Promise.all([
    db.select().from(crmStages).where(eq(crmStages.pipelineId, pipeline.id)),
    db.select().from(crmFieldDefinitions),
    rawDeals.length > 0
      ? db.select().from(crmDeals).where(inArray(crmDeals.pipedriveDealId, rawDeals.map((d) => String(d.id))))
      : Promise.resolve([]),
  ])
  const stageByPipedriveId = new Map(stageRows.filter((s) => s.pipedriveStageId != null).map((s) => [s.pipedriveStageId as number, s]))
  const existingByPipedriveId = new Map(existingRows.map((r) => [r.pipedriveDealId as string, r]))

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

    const existing = existingByPipedriveId.get(pipedriveDealId)
    if (existing?.status === 'won') {
      skipped++
      continue
    }

    const fields = extractFieldsFromV1Deal(deal, fieldDefs)
    const contact = extractPrimaryContact(deal)
    const status = deal.status === 'won' || deal.status === 'lost' ? deal.status : 'open'

    if (existing) {
      const stageChanged = stage.id !== existing.stageId
      const stageEnteredAtValue = new Date().toISOString()
      const [row] = await db
        .update(crmDeals)
        .set({
          pipelineId: pipeline.id,
          stageId: stage.id,
          ...(stageChanged ? { stageEnteredAt: stageEnteredAtValue } : {}),
          title: deal.title || existing.title,
          value: deal.value ?? existing.value,
          currency: deal.currency || existing.currency,
          status,
          orgName: deal.org_name ?? null,
          personName: deal.person_name ?? null,
          personPhone: contact.phone,
          personEmail: contact.email,
          lostReason: deal.lost_reason ?? null,
          wonAt: status === 'won' ? (deal.won_time ?? existing.wonAt ?? new Date().toISOString()) : existing.wonAt,
          lostAt: status === 'lost' ? (deal.lost_time ?? existing.lostAt ?? new Date().toISOString()) : existing.lostAt,
          pipedriveUpdateTime: deal.update_time ?? null,
          nextActivityDate: deal.next_activity_date ?? null,
          activitiesCount: deal.activities_count ?? null,
          stageChangeTime: deal.stage_change_time ?? null,
          expectedCloseDate: deal.expected_close_date ?? null,
          fields,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(crmDeals.id, existing.id))
        .returning()
      if (stageChanged) await recordStageEntry(db, { dealId: row.id }, stage.id, stageEnteredAtValue)
      if (status === 'won') await attemptPromotion(db, row)
      updated++
    } else {
      const [row] = await db
        .insert(crmDeals)
        .values({
          pipelineId: pipeline.id,
          stageId: stage.id,
          title: deal.title || `Deal ${deal.id}`,
          value: deal.value ?? 0,
          currency: deal.currency || 'AUD',
          status,
          pipedriveDealId,
          orgName: deal.org_name ?? null,
          personName: deal.person_name ?? null,
          personPhone: contact.phone,
          personEmail: contact.email,
          lostReason: deal.lost_reason ?? null,
          wonAt: status === 'won' ? (deal.won_time ?? new Date().toISOString()) : null,
          lostAt: status === 'lost' ? (deal.lost_time ?? new Date().toISOString()) : null,
          pipedriveUpdateTime: deal.update_time ?? null,
          nextActivityDate: deal.next_activity_date ?? null,
          activitiesCount: deal.activities_count ?? null,
          stageChangeTime: deal.stage_change_time ?? null,
          expectedCloseDate: deal.expected_close_date ?? null,
          fields,
          createdAt: deal.add_time ?? undefined,
          stageEnteredAt: deal.add_time ?? undefined,
        })
        .returning()
      await recordStageEntry(db, { dealId: row.id }, stage.id, row.stageEnteredAt)
      if (status === 'won') await attemptPromotion(db, row)
      created++
    }
  }

  return { created, updated, skipped, deleted: 0 }
}

/** Jobs Pipeline — writes straight to `jobs` (a Job IS its Jobs Pipeline board card). */
export async function upsertJobsPipelineDeals(db: Db, pipeline: CrmPipelineRow, rawDeals: PipedriveDealPayload[]): Promise<UpsertResult> {
  const [stageRows, fieldDefs, existingJobRows] = await Promise.all([
    db.select().from(crmStages).where(eq(crmStages.pipelineId, pipeline.id)),
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
  let deleted = 0

  for (const deal of rawDeals) {
    if (deal.pipeline_id !== pipeline.pipedrivePipelineId) {
      skipped++
      continue
    }
    const pipedriveDealId = String(deal.id)
    const existingJob = existingByPipedriveId.get(pipedriveDealId)
    // A deal that isn't (or is no longer) Won is still recorded — not deleted, not skipped — just
    // archived, same mechanism the board's own "Show Archived" toggle already uses. Pipedrive keeps
    // deals like this sitting in the Jobs Pipeline rather than removing them (confirmed: 30 of 625
    // real Jobs Pipeline deals were status='lost'), so this mirrors that instead of silently
    // dropping them. See dealToJob.ts's dedicated comment for the un-archive-on-return tradeoff.
    const isWon = deal.status === 'won'

    const stage = deal.stage_id != null ? stageByPipedriveId.get(deal.stage_id) : undefined
    if (!stage) {
      skipped++
      continue
    }

    const fields = extractFieldsFromV1Deal(deal, fieldDefs)
    const contact = extractPrimaryContact(deal)

    if (existingJob) {
      const stageChanged = stage.id !== existingJob.stageId
      const stageEnteredAtValue = new Date().toISOString()
      const patch: Record<string, unknown> = {
        fields,
        pipedriveDealTitle: deal.title ?? existingJob.pipedriveDealTitle,
        totalValue: typeof deal.value === 'number' ? deal.value : existingJob.totalValue,
        archivedAt: isWon ? null : (existingJob.archivedAt ?? new Date().toISOString()),
      }
      if (stageChanged) {
        patch.stageId = stage.id
        patch.stageEnteredAt = stageEnteredAtValue
      }
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

      const clientName = deal.org_name || deal.person_name
      const clientPatch: Record<string, unknown> = {}
      if (clientName) clientPatch.name = clientName
      if (contact.phone || contact.email) {
        clientPatch.phone = contact.phone
        clientPatch.email = contact.email
      }
      if (Object.keys(clientPatch).length > 0) {
        await db.update(clients).set(clientPatch).where(eq(clients.id, existingJob.clientId))
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
      initialStageId: stage.id,
      fields,
    })

    if (result.status === 'skipped') {
      skipped++
      continue
    }
    // Same as the existing-job patch above — a deal that's never actually been Won still gets
    // recorded as a Job (so it shows up under "Show Archived"), just archived immediately on
    // creation instead of shown on the live board by default.
    if (!isWon) await db.update(jobs).set({ archivedAt: new Date().toISOString() }).where(eq(jobs.id, result.jobId))
    created++
  }

  return { created, updated, skipped, deleted }
}
