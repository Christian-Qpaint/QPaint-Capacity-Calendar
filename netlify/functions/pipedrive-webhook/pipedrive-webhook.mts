// Port of supabase/functions/pipedrive-webhook. Pipedrive calls this the moment a deal is added or
// changes — for any deal event, if we don't already have a job for that pipedrive_deal_id, we copy
// it in ONCE. If we already have one, we leave it completely alone: no field on an existing job is
// ever touched by this function again — once a deal is copied in, our copy is independent of
// Pipedrive from then on, so manual edits/production tracking here can never be silently
// overwritten by a later sync.
//
// No calling-user session exists here (Pipedrive is the caller, not a logged-in user) — auth comes
// entirely from HTTP Basic Auth (PIPEDRIVE_WEBHOOK_USER/PIPEDRIVE_WEBHOOK_PASS secrets), matching
// Pipedrive's classic webhook subscription setup. There's no RLS/service-role distinction to
// replicate here either — getDb() always has full table access; the Basic Auth check is the entire
// security boundary, same as it was in the old Supabase version.
import { getDb } from '../_shared/db.js'
import { isPipedriveWebhookAuthorized } from '../_shared/pipedriveAuth.js'
import { createOrAdoptJobFromDeal, CATEGORY_OPTION_MAP, FIELD_TARGET_HOURS, FIELD_ACTUAL_HOURS, FIELD_CATEGORY, FIELD_ADDRESS } from '../_shared/dealToJob.js'

export default async (req: Request): Promise<Response> => {
  if (!isPipedriveWebhookAuthorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = (await req.json().catch(() => null)) as
      | { data?: Record<string, unknown>; current?: Record<string, unknown> }
      | null
    const deal = body?.data ?? body?.current ?? null
    if (!deal?.id) return Response.json({ imported: false, reason: 'No deal payload in request — ignored, not an error' })
    if (deal.status !== 'won') return Response.json({ imported: false, dealId: deal.id, reason: `status is "${deal.status}", not "won"` })

    const db = getDb()
    const categoryOptionId = String(deal[FIELD_CATEGORY] ?? '')
    const address = (deal[`${FIELD_ADDRESS}_formatted_address`] as string | undefined) || (deal[FIELD_ADDRESS] as string | undefined) || ''
    const dateWon = ((deal.won_time as string | undefined) || (deal.add_time as string | undefined) || new Date().toISOString()).slice(0, 10)

    const result = await createOrAdoptJobFromDeal(db, {
      pipedriveDealId: String(deal.id),
      title: (deal.title as string | undefined) ?? null,
      orgName: (deal.org_name as string | undefined) ?? null,
      personName: (deal.person_name as string | undefined) ?? null,
      value: (deal.value as number | undefined) ?? 0,
      targetHours: deal[FIELD_TARGET_HOURS] as number | null | undefined,
      actualHours: deal[FIELD_ACTUAL_HOURS] as number | null | undefined,
      category: CATEGORY_OPTION_MAP[categoryOptionId] ?? 'Commercial',
      address,
      dateWon,
      // This legacy path isn't registered in Pipedrive (see crm-job-updated.mts's header comment)
      // and only sees the raw, untyped webhook body — not worth wiring full contact extraction
      // (extractPrimaryContact expects fetchFullDeal's typed v1 shape) for a dead code path.
      personPhone: null,
      personEmail: null,
      // Same rationale as personPhone/personEmail above — this dead path never registered in
      // Pipedrive isn't worth wiring real extractFieldsFromV1Deal-style parsing for.
      fields: {},
    })

    if (result.status === 'skipped') return Response.json({ imported: false, dealId: deal.id, reason: result.reason })
    if (result.status === 'adopted') return Response.json({ imported: false, dealId: deal.id, reason: 'Already copied in previously — left untouched' })
    return Response.json({ imported: true, dealId: deal.id, jobId: result.jobId })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export const config = {
  path: '/api/pipedrive-webhook',
}
