// Keeps an already-copied-in crm_deals row's pipeline/stage/status/fields in sync with Pipedrive
// going forward — closes the gap crm-deal-created.mts deliberately leaves open (it only fires on
// brand-new deals; once copied in, the local row used to stay frozen forever at whatever stage/
// status it had at that moment, even as a rep kept working the deal in Pipedrive). Still strictly
// one-way (Pipedrive -> CRM only, never pushed back).
//
// Pipeline-agnostic by design: covers every pipeline mirrored locally as a crm_deals row (Sales,
// Business Development, any future one) except the Jobs Pipeline, which has its own dedicated
// crm-job-updated.mts (a Jobs Pipeline deal is a `jobs` row, not a `crm_deals` row). Also re-resolves
// `pipelineId`/`stageId` fresh from the deal's current pipeline_id/stage_id on every event, so a
// deal actually moved between pipelines in Pipedrive (e.g. Sales -> Business Development) follows
// it here too, not just an in-pipeline stage move.
//
// Deliberately stops applying once a deal is already 'won' locally: at that point it's been
// promoted into a real Job and Pipedrive is no longer the thing driving what happens to it —
// re-syncing a won deal's stage/fields after the fact would just be noise. If the *first* time we
// see it moved to Won is via this webhook (a rep marked it Won directly in Pipedrive, not by
// dragging it on our board), that still runs it through the same attemptPromotion every other
// promotion path uses, so a Job gets created/adopted exactly once no matter which path got there
// first.
import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { isPipedriveWebhookAuthorized } from '../_shared/pipedriveAuth.js'
import { fetchFullDeal, extractFieldsFromV1Deal, extractPrimaryContact, type PipedriveDealPayload } from '../_shared/pipedriveApi.js'
import { attemptPromotion } from '../_shared/dealToJob.js'
import { recordStageEntry } from '../_shared/stageHistory.js'
import { crmPipelines, crmStages, crmFieldDefinitions, crmDeals } from '../../../db/schema.js'

const JOBS_PIPELINE_PIPEDRIVE_ID = 3

export default async (req: Request): Promise<Response> => {
  if (!isPipedriveWebhookAuthorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = (await req.json().catch(() => null)) as {
      data?: PipedriveDealPayload | null
      current?: PipedriveDealPayload
      previous?: PipedriveDealPayload
      meta?: { action?: string }
    } | null

    // A deal deleted in Pipedrive fires this same webhook with `data` null and the deal's last
    // known state under `previous` (v2 payload shape) — fetchFullDeal below would just 404 for it,
    // since it's genuinely gone. Detected by the absence of `data` alongside a populated `previous`
    // rather than trusting one exact meta.action string, since that value isn't confirmed against
    // this account's actual webhook payloads. Deletes the local mirror row outright (not an
    // archive) — unlike jobs, a Sales/Business Development crm_deals row is disposable pipeline-
    // tracking data, not a production record; any Job it already produced stays untouched
    // (crm_deals.jobId -> jobs.id is ON DELETE SET NULL, never cascades).
    if (!body?.data && body?.previous?.id) {
      const deleted = body.previous
      if (deleted.pipeline_id === JOBS_PIPELINE_PIPEDRIVE_ID) {
        return Response.json({ deleted: false, dealId: deleted.id, reason: 'Jobs Pipeline deal — handled by crm-job-updated.mts instead' })
      }
      const db = getDb()
      const pipedriveDealId = String(deleted.id)
      const [row] = await db.delete(crmDeals).where(eq(crmDeals.pipedriveDealId, pipedriveDealId)).returning({ id: crmDeals.id })
      return Response.json({ deleted: !!row, dealId: deleted.id })
    }

    const webhookDeal = body?.data ?? body?.current ?? null
    if (!webhookDeal?.id) return Response.json({ updated: false, reason: 'No deal payload in request — ignored, not an error' })

    const db = getDb()
    const pipedriveDealId = String(webhookDeal.id)
    const [existing] = await db.select().from(crmDeals).where(eq(crmDeals.pipedriveDealId, pipedriveDealId)).limit(1)
    if (!existing) return Response.json({ updated: false, dealId: webhookDeal.id, reason: 'Not copied into the CRM yet — nothing to sync' })
    if (existing.status === 'won') {
      return Response.json({ updated: false, dealId: webhookDeal.id, reason: 'Already Won and promoted to a Job locally — Pipedrive no longer drives this deal' })
    }

    const deal = (await fetchFullDeal(webhookDeal.id)) ?? webhookDeal
    if (deal.pipeline_id === JOBS_PIPELINE_PIPEDRIVE_ID) {
      return Response.json({ updated: false, dealId: deal.id, reason: 'Jobs Pipeline deal — handled by crm-job-updated.mts instead' })
    }

    const [pipeline] = deal.pipeline_id != null
      ? await db.select().from(crmPipelines).where(eq(crmPipelines.pipedrivePipelineId, deal.pipeline_id)).limit(1)
      : []

    const stageId = deal.stage_id ?? null
    const [stage] = stageId
      ? await db.select().from(crmStages).where(eq(crmStages.pipedriveStageId, stageId)).limit(1)
      : []
    if (!stage) {
      return Response.json({ updated: false, dealId: deal.id, reason: `No local stage mirrors Pipedrive stage_id ${stageId} yet — add it in Deals > Configure first` })
    }

    const fieldDefs = await db.select().from(crmFieldDefinitions)
    const fields = extractFieldsFromV1Deal(deal, fieldDefs)
    const contact = extractPrimaryContact(deal)
    const status = deal.status === 'won' || deal.status === 'lost' ? deal.status : 'open'
    // existing.status is already guaranteed not 'won' by the guard above, so any 'won' here is new.
    const becameWon = status === 'won'

    const stageChanged = stage.id !== existing.stageId
    const stageEnteredAtValue = new Date().toISOString()
    const [updated] = await db
      .update(crmDeals)
      .set({
        pipelineId: pipeline?.id ?? existing.pipelineId,
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

    if (stageChanged) await recordStageEntry(db, { dealId: updated.id }, stage.id, stageEnteredAtValue)

    if (!becameWon) return Response.json({ updated: true, dealId: deal.id, crmDealId: updated.id })

    const { promoted, skippedReason } = await attemptPromotion(db, updated)
    return Response.json({ updated: true, dealId: deal.id, crmDealId: updated.id, promoted, promotionSkippedReason: skippedReason })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export const config = {
  path: '/api/crm-deal-updated',
}
