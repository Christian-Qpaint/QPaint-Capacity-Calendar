// One-way, creation-only automation: fires when a NEW deal is added in ANY Pipedrive pipeline that
// isn't the Jobs Pipeline (which has its own dedicated crm-job-updated.mts, since a Jobs Pipeline
// deal is stored as a `jobs` row, not a `crm_deals` row), copies it into the local CRM as a
// crm_deals row. Once copied in, the deal is managed entirely locally from then on — Pipedrive's
// own later stage/field changes are never synced back (matches what was explicitly asked for).
// Deliberately a distinct Function from the legacy pipedrive-webhook.mts — that one fires on ANY
// deal event and only cares about status==='won'; this one only cares about brand-new deals.
//
// The pipeline is resolved dynamically against crm_pipelines (by the incoming deal's real
// pipeline_id) rather than hardcoded to one pipeline id — this one webhook subscription covers
// every pipeline mirrored locally today (Sales, Business Development) and any future one added
// later without needing another code change. A deal in a pipeline that isn't mirrored locally yet
// is ignored, same as before.
//
// The registered webhook subscription is Pipedrive's newer v2 format, whose payload only carries
// scalar org_id/person_id and nests custom fields under data.custom_fields — not the flat
// org_name/person_name/custom-field-keys shape the rest of this file (and the field-extraction
// logic shared with the backfill script) is written against. Rather than parse two payload
// shapes, the webhook body is only used to learn the deal id + pipeline_id; the full v1-shaped
// deal is then re-fetched from the REST API (same endpoint/shape the backfill script already
// uses), which is the authoritative source of truth anyway.
import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { isPipedriveWebhookAuthorized } from '../_shared/pipedriveAuth.js'
import { fetchFullDeal, extractFieldsFromV1Deal, extractPrimaryContact, type PipedriveDealPayload } from '../_shared/pipedriveApi.js'
import { recordStageEntry } from '../_shared/stageHistory.js'
import { crmPipelines, crmStages, crmFieldDefinitions, crmDeals } from '../../../db/schema.js'

const JOBS_PIPELINE_PIPEDRIVE_ID = 3

export default async (req: Request): Promise<Response> => {
  if (!isPipedriveWebhookAuthorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = (await req.json().catch(() => null)) as { data?: PipedriveDealPayload; current?: PipedriveDealPayload } | null
    const webhookDeal = body?.data ?? body?.current ?? null
    if (!webhookDeal?.id) return Response.json({ imported: false, reason: 'No deal payload in request — ignored, not an error' })

    const deal = (await fetchFullDeal(webhookDeal.id)) ?? webhookDeal
    if (deal.pipeline_id === JOBS_PIPELINE_PIPEDRIVE_ID) {
      return Response.json({ imported: false, dealId: deal.id, reason: 'Jobs Pipeline deal — handled by crm-job-updated.mts instead' })
    }

    const db = getDb()
    const pipedriveDealId = String(deal.id)
    const [existing] = await db.select({ id: crmDeals.id }).from(crmDeals).where(eq(crmDeals.pipedriveDealId, pipedriveDealId)).limit(1)
    if (existing) return Response.json({ imported: false, dealId: deal.id, reason: 'Already copied in previously — left untouched' })

    const [pipeline] = deal.pipeline_id != null
      ? await db.select().from(crmPipelines).where(eq(crmPipelines.pipedrivePipelineId, deal.pipeline_id)).limit(1)
      : []
    if (!pipeline) {
      return Response.json({ imported: false, dealId: deal.id, reason: `pipeline_id ${deal.pipeline_id} is not mirrored locally yet` })
    }

    const stageId = deal.stage_id ?? null
    const [stage] = stageId
      ? await db.select().from(crmStages).where(eq(crmStages.pipedriveStageId, stageId)).limit(1)
      : []
    if (!stage) {
      return Response.json({ imported: false, dealId: deal.id, reason: `No local stage mirrors Pipedrive stage_id ${stageId} yet — add it in Deals > Configure first` })
    }

    const fieldDefs = await db.select().from(crmFieldDefinitions)
    const fields = extractFieldsFromV1Deal(deal, fieldDefs)
    const contact = extractPrimaryContact(deal)

    const status = deal.status === 'won' || deal.status === 'lost' ? deal.status : 'open'
    const [created] = await db
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
      .returning({ id: crmDeals.id, stageEnteredAt: crmDeals.stageEnteredAt })

    await recordStageEntry(db, { dealId: created.id }, stage.id, created.stageEnteredAt)
    return Response.json({ imported: true, dealId: deal.id, crmDealId: created.id })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export const config = {
  path: '/api/crm-deal-created',
}
