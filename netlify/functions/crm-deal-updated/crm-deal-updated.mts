// Keeps an already-copied-in Sales Pipeline deal's stage/status/fields in sync with Pipedrive
// going forward — closes the gap crm-deal-created.mts deliberately leaves open (it only fires on
// brand-new deals; once copied in, the local row used to stay frozen forever at whatever stage/
// status it had at that moment, even as a rep kept working the deal in Pipedrive). Still strictly
// one-way (Pipedrive -> CRM only, never pushed back) and still Sales-Pipeline-only, matching the
// original automation scope.
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
import { fetchFullDeal, extractFieldsFromV1Deal, type PipedriveDealPayload } from '../_shared/pipedriveApi.js'
import { attemptPromotion } from '../_shared/dealToJob.js'
import { recordStageEntry } from '../_shared/stageHistory.js'
import { crmStages, crmFieldDefinitions, crmDeals } from '../../../db/schema.js'

const SALES_PIPELINE_ID = 2

export default async (req: Request): Promise<Response> => {
  if (!isPipedriveWebhookAuthorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = (await req.json().catch(() => null)) as { data?: PipedriveDealPayload; current?: PipedriveDealPayload } | null
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
    if (deal.pipeline_id !== SALES_PIPELINE_ID) {
      return Response.json({ updated: false, dealId: deal.id, reason: `pipeline_id ${deal.pipeline_id} is not the Sales Pipeline — ignored` })
    }

    const stageId = deal.stage_id ?? null
    const [stage] = stageId
      ? await db.select().from(crmStages).where(eq(crmStages.pipedriveStageId, stageId)).limit(1)
      : []
    if (!stage) {
      return Response.json({ updated: false, dealId: deal.id, reason: `No local stage mirrors Pipedrive stage_id ${stageId} yet — add it in Deals > Configure first` })
    }

    const fieldDefs = await db.select().from(crmFieldDefinitions)
    const fields = extractFieldsFromV1Deal(deal, fieldDefs)
    const status = deal.status === 'won' || deal.status === 'lost' ? deal.status : 'open'
    // existing.status is already guaranteed not 'won' by the guard above, so any 'won' here is new.
    const becameWon = status === 'won'

    const stageChanged = stage.id !== existing.stageId
    const stageEnteredAtValue = new Date().toISOString()
    const [updated] = await db
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

    if (stageChanged) await recordStageEntry(db, updated.id, stage.id, stageEnteredAtValue)

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
