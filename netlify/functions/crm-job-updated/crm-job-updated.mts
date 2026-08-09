// One-way (Pipedrive -> QPaintOS only, never the reverse) webhook for the Jobs Pipeline,
// replacing the old "Sync from Pipedrive" bulk-sync button for this pipeline specifically. That
// button was broken for Jobs Pipeline anyway — Pipedrive's bulk deal-list endpoint is blocked by a
// visibility-group restriction on this account, but fetching one deal *by id* (what this webhook
// does via fetchFullDeal) is unaffected by that restriction.
//
// Post Jobs/Jobs-Pipeline merge, a Job IS its Jobs Pipeline board card — there's no longer a
// separate crm_deals row to keep in sync for an already-promoted job, so this writes directly to
// `jobs` (stageId/stageEnteredAt/fields/title/value/category/address/targetHours/actualHours) and
// to the job's client record (phone/email, off the deal's linked Person), unlike
// crm-deal-updated.mts which still updates crm_deals for Sales/Business Development.
//
// If no Job exists yet for this deal (a "stuck" Jobs Pipeline deal — Won but never promoted,
// usually because Target Hours wasn't set), this also retries promotion directly — covering both
// a brand-new Jobs Pipeline deal reaching this app for the first time, and one of the pre-merge
// stuck deals finally getting its Target Hours filled in. On success, any leftover crm_deals row
// for that same deal is cleaned up the same way the one-time migration did (history re-pointed to
// the job, then the stale deal row deleted) — never left as a duplicate.
//
// Also re-checks status on every update, not just on creation: a deal reverted from Won back to
// Lost/Open in Pipedrive has its Job deleted outright (Pipedrive is the single source of truth for
// whether this deal should be a Job at all, not just for its fields) — confirmed root cause of a
// Job showing stale "Won" data days after its deal was manually marked Lost in Pipedrive.
import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { isPipedriveWebhookAuthorized } from '../_shared/pipedriveAuth.js'
import { fetchFullDeal, extractFieldsFromV1Deal, extractPrimaryContact, type PipedriveDealPayload } from '../_shared/pipedriveApi.js'
import { createOrAdoptJobFromDeal, CATEGORY_OPTION_MAP, FIELD_TARGET_HOURS, FIELD_ACTUAL_HOURS, FIELD_CATEGORY, FIELD_ADDRESS } from '../_shared/dealToJob.js'
import { recordStageEntry } from '../_shared/stageHistory.js'
import { crmStages, crmFieldDefinitions, crmDeals, crmDealStageHistory, jobs, clients } from '../../../db/schema.js'

const JOBS_PIPELINE_ID = 3

export default async (req: Request): Promise<Response> => {
  if (!isPipedriveWebhookAuthorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = (await req.json().catch(() => null)) as {
      data?: PipedriveDealPayload | null
      current?: PipedriveDealPayload
      previous?: PipedriveDealPayload
      meta?: { action?: string }
    } | null

    // A deal deleted in Pipedrive fires this same webhook with `data` null and its last known state
    // under `previous` (v2 payload shape) — see crm-deal-updated.mts's identical check for why this
    // detection doesn't rely on one exact meta.action string. Pipedrive is the single source of
    // truth (explicit decision, matching Sales/Business Development's crm-deal-updated.mts) — this
    // deletes the job outright, which cascades to its schedule_blocks (Capacity Calendar bookings)
    // and weekly_actuals (logged hours). There is no Pipedrive copy of that scheduling data, so this
    // is a real, permanent loss if the deal's deletion was accidental on Pipedrive's side — not an
    // oversight, a confirmed tradeoff.
    if (!body?.data && body?.previous?.id) {
      const deleted = body.previous
      if (deleted.pipeline_id !== JOBS_PIPELINE_ID) {
        return Response.json({ deleted: false, dealId: deleted.id, reason: `pipeline_id ${deleted.pipeline_id} is not the Jobs Pipeline — ignored` })
      }
      const db = getDb()
      const pipedriveDealId = String(deleted.id)
      const [row] = await db.delete(jobs).where(eq(jobs.pipedriveDealId, pipedriveDealId)).returning({ id: jobs.id })
      return Response.json({ deleted: !!row, dealId: deleted.id, jobId: row?.id ?? null })
    }

    const webhookDeal = body?.data ?? body?.current ?? null
    if (!webhookDeal?.id) return Response.json({ updated: false, reason: 'No deal payload in request — ignored, not an error' })

    const deal = (await fetchFullDeal(webhookDeal.id)) ?? webhookDeal
    if (deal.pipeline_id !== JOBS_PIPELINE_ID) {
      return Response.json({ updated: false, dealId: deal.id, reason: `pipeline_id ${deal.pipeline_id} is not the Jobs Pipeline — ignored` })
    }

    const db = getDb()
    const pipedriveDealId = String(deal.id)

    // Pipedrive is the single source of truth for whether this deal should be a Job at all, not
    // just for its fields — a deal reverted from Won back to Lost/Open has its Job deleted outright
    // rather than left behind showing stale "Won" data forever (this is what jobs-sync-pipedrive.mts's
    // bulk sync also checks on every run; this covers it in real time).
    if (deal.status !== 'won') {
      const [row] = await db.delete(jobs).where(eq(jobs.pipedriveDealId, pipedriveDealId)).returning({ id: jobs.id })
      return Response.json({ updated: false, deleted: !!row, dealId: deal.id, reason: `status is "${deal.status}", not won — ignored or deleted if it had a Job` })
    }

    const stageIdRaw = deal.stage_id ?? null
    const [stage] = stageIdRaw
      ? await db.select().from(crmStages).where(eq(crmStages.pipedriveStageId, stageIdRaw)).limit(1)
      : []
    if (!stage) {
      return Response.json({ updated: false, dealId: deal.id, reason: `No local stage mirrors Pipedrive stage_id ${stageIdRaw} yet — add it in Deals > Configure first` })
    }

    const fieldDefs = await db.select().from(crmFieldDefinitions)
    const fields = extractFieldsFromV1Deal(deal, fieldDefs)
    const contact = extractPrimaryContact(deal)

    const [existingJob] = await db.select().from(jobs).where(eq(jobs.pipedriveDealId, pipedriveDealId)).limit(1)

    if (existingJob) {
      const stageChanged = stage.id !== existingJob.stageId
      const stageEnteredAtValue = new Date().toISOString()
      // fields/pipedriveDealTitle/totalValue always take Pipedrive's current value outright — a
      // trivially changed title (a fixed typo, a stray space) must win here, not get skipped by a
      // "looks nonempty" check.
      const patch: Record<string, unknown> = {
        fields,
        pipedriveDealTitle: deal.title ?? existingJob.pipedriveDealTitle,
        totalValue: typeof deal.value === 'number' ? deal.value : existingJob.totalValue,
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

      // Client name kept current too, not just phone/email.
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
      return Response.json({ updated: true, dealId: deal.id, jobId: existingJob.id })
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
      return Response.json({ updated: false, dealId: deal.id, reason: result.reason })
    }

    const [staleDeal] = await db.select().from(crmDeals).where(eq(crmDeals.pipedriveDealId, pipedriveDealId)).limit(1)
    if (staleDeal) {
      await db
        .update(crmDealStageHistory)
        .set({ jobId: result.jobId, dealId: null })
        .where(eq(crmDealStageHistory.dealId, staleDeal.id))
      await db.delete(crmDeals).where(eq(crmDeals.id, staleDeal.id))
    }

    return Response.json({ updated: true, dealId: deal.id, jobId: result.jobId, created: result.status === 'created' })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export const config = {
  path: '/api/crm-job-updated',
}
