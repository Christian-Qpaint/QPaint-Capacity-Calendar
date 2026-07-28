// One-way, creation-only automation: fires when a NEW deal is added in Pipedrive's Sales
// Pipeline, copies it into the local CRM as a crm_deals row. Once copied in, the deal is managed
// entirely locally from then on — Pipedrive's own later stage/field changes are never synced back
// (matches what was explicitly asked for). Deliberately a distinct Function from the legacy
// pipedrive-webhook.mts — that one fires on ANY deal event and only cares about status==='won';
// this one only cares about brand-new deals, and only within the Sales Pipeline (pipeline_id 2 —
// the other 2 mirrored pipelines get their existing deals from the one-time backfill and any new
// ones added manually, not an ongoing feed, per the confirmed scope).
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
import { crmPipelines, crmStages, crmFieldDefinitions, crmDeals } from '../../../db/schema.js'

const SALES_PIPELINE_ID = 2

interface PipedriveDealPayload {
  id: number
  title?: string | null
  value?: number | null
  currency?: string | null
  status?: string | null
  stage_id?: number | null
  pipeline_id?: number | null
  org_name?: string | null
  person_name?: string | null
  lost_reason?: string | null
  won_time?: string | null
  lost_time?: string | null
  add_time?: string | null
  [key: string]: unknown
}

async function fetchFullDeal(dealId: number): Promise<PipedriveDealPayload | null> {
  const token = process.env.PIPEDRIVE_API_TOKEN
  if (!token) return null
  const res = await fetch(`https://api.pipedrive.com/v1/deals/${dealId}?api_token=${token}`)
  if (!res.ok) return null
  const json = (await res.json()) as { success?: boolean; data?: PipedriveDealPayload }
  return json.success ? (json.data ?? null) : null
}

export default async (req: Request): Promise<Response> => {
  if (!isPipedriveWebhookAuthorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = (await req.json().catch(() => null)) as { data?: PipedriveDealPayload; current?: PipedriveDealPayload } | null
    const webhookDeal = body?.data ?? body?.current ?? null
    if (!webhookDeal?.id) return Response.json({ imported: false, reason: 'No deal payload in request — ignored, not an error' })

    const deal = (await fetchFullDeal(webhookDeal.id)) ?? webhookDeal
    if (deal.pipeline_id !== SALES_PIPELINE_ID) {
      return Response.json({ imported: false, dealId: deal.id, reason: `pipeline_id ${deal.pipeline_id} is not the Sales Pipeline — ignored` })
    }

    const db = getDb()
    const pipedriveDealId = String(deal.id)
    const [existing] = await db.select({ id: crmDeals.id }).from(crmDeals).where(eq(crmDeals.pipedriveDealId, pipedriveDealId)).limit(1)
    if (existing) return Response.json({ imported: false, dealId: deal.id, reason: 'Already copied in previously — left untouched' })

    const [pipeline] = await db.select().from(crmPipelines).where(eq(crmPipelines.pipedrivePipelineId, SALES_PIPELINE_ID)).limit(1)
    if (!pipeline) return Response.json({ imported: false, dealId: deal.id, reason: 'Sales Pipeline is not mirrored locally yet' })

    const stageId = deal.stage_id ?? null
    const [stage] = stageId
      ? await db.select().from(crmStages).where(eq(crmStages.pipedriveStageId, stageId)).limit(1)
      : []
    if (!stage) {
      return Response.json({ imported: false, dealId: deal.id, reason: `No local stage mirrors Pipedrive stage_id ${stageId} yet — add it in Deals > Configure first` })
    }

    const fieldDefs = await db.select().from(crmFieldDefinitions)
    const fields: Record<string, unknown> = {}
    for (const def of fieldDefs) {
      if (def.fieldType === 'address') {
        const formatted = deal[`${def.key}_formatted_address`] as string | undefined
        const raw = deal[def.key] as string | undefined
        if (formatted || raw) fields[def.key] = formatted ?? raw
        continue
      }
      const raw = deal[def.key]
      if (raw !== null && raw !== undefined && raw !== '') fields[def.key] = raw
    }

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
        lostReason: deal.lost_reason ?? null,
        wonAt: status === 'won' ? (deal.won_time ?? new Date().toISOString()) : null,
        lostAt: status === 'lost' ? (deal.lost_time ?? new Date().toISOString()) : null,
        fields,
        createdAt: deal.add_time ?? undefined,
      })
      .returning({ id: crmDeals.id })

    return Response.json({ imported: true, dealId: deal.id, crmDealId: created.id })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export const config = {
  path: '/api/crm-deal-created',
}
