// Scheduled (hourly) backstop sync — independent of webhooks entirely. Pulls whatever's been
// modified in Pipedrive in roughly the last 2 hours (1-hour overlap buffer over the 1-hour
// schedule, so a slightly-delayed run or a missed tick never leaves a gap) and pushes it through
// the exact same upsert logic the manual "Sync from Pipedrive" buttons use.
//
// The point isn't to replace webhooks — real-time sync is still faster and cheaper when it's
// working. The point is that webhooks CAN and DO fail (see pipedrive-webhook-healthcheck.mts's
// header for the confirmed history), and until this existed, a silent failure meant data just
// drifted further and further out of sync until a human happened to notice something looked wrong.
// This bounds that drift to at most ~2 hours, self-correcting, with no action needed from anyone.
import { inArray } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { notifyOwners } from '../_shared/notifyOwners.js'
import { upsertSalesDeals, upsertJobsPipelineDeals } from '../_shared/dealSync.js'
import type { PipedriveDealPayload } from '../_shared/pipedriveApi.js'
import { crmPipelines } from '../../../db/schema.js'

const JOBS_PIPELINE_PIPEDRIVE_ID = 3
const LOOKBACK_HOURS = 2
// Safety backstop against a runaway paging loop — 500/page, so this allows up to 10k deals in the
// lookback window, comfortably above anything a 2-hour window should ever actually contain.
const MAX_PAGES = 20

interface PipedriveListResponse {
  success: boolean
  error?: string
  data?: PipedriveDealPayload[]
  additional_data?: { pagination?: { more_items_in_collection?: boolean; next_start?: number } }
}

function cutoffTimestamp(): string {
  // Matches Pipedrive's own "YYYY-MM-DD HH:MM:SS" update_time format (no 'T'/'Z') so plain string
  // comparison against it sorts correctly — same format already trusted elsewhere in this codebase
  // (crm_deals.pipedrive_update_time is stored straight from this same field, unmodified).
  const d = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000)
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

/** Every deal modified since `cutoff`, across the whole account — /v1/deals doesn't support
 * per-pipeline filtering (confirmed in crm-sync-deals.mts), so this fetches once and lets each
 * pipeline's own upsert function skip deals that don't belong to it. Sorted newest-first, so
 * paging stops as soon as a page's oldest deal falls outside the window — no need to walk the
 * account's full multi-thousand-deal history every run. */
async function fetchRecentlyModifiedDeals(token: string, cutoff: string): Promise<PipedriveDealPayload[]> {
  const results: PipedriveDealPayload[] = []
  let start = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(
      `https://api.pipedrive.com/v1/deals?status=all_not_deleted&sort=update_time%20DESC&start=${start}&limit=500&api_token=${token}`,
    )
    const json = (await res.json()) as PipedriveListResponse
    if (!json.success) throw new Error(json.error ?? 'Pipedrive deals list failed')
    const deals = json.data ?? []
    let hitCutoff = false
    for (const d of deals) {
      if (!d.update_time || d.update_time < cutoff) {
        hitCutoff = true
        break
      }
      results.push(d)
    }
    if (hitCutoff) break
    const more = json.additional_data?.pagination?.more_items_in_collection
    if (!more) break
    start = json.additional_data?.pagination?.next_start ?? start + 500
  }
  return results
}

export default async (): Promise<Response> => {
  const db = getDb()
  const token = process.env.PIPEDRIVE_API_TOKEN
  if (!token) {
    console.error('pipedrive-reconcile-sync: missing PIPEDRIVE_API_TOKEN')
    return Response.json({ ok: false, reason: 'missing PIPEDRIVE_API_TOKEN' })
  }

  try {
    const cutoff = cutoffTimestamp()
    const [recentDeals, reportedPipelines] = await Promise.all([
      fetchRecentlyModifiedDeals(token, cutoff),
      db.select().from(crmPipelines).where(inArray(crmPipelines.pipedrivePipelineId, [2, 3, 4])),
    ])

    if (recentDeals.length === 0) return Response.json({ ok: true, recentDeals: 0 })

    let created = 0
    let updated = 0
    let deleted = 0
    for (const pipeline of reportedPipelines) {
      const result =
        pipeline.pipedrivePipelineId === JOBS_PIPELINE_PIPEDRIVE_ID
          ? await upsertJobsPipelineDeals(db, pipeline, recentDeals)
          : await upsertSalesDeals(db, pipeline, recentDeals)
      created += result.created
      updated += result.updated
      deleted += result.deleted
    }

    return Response.json({ ok: true, recentDeals: recentDeals.length, created, updated, deleted })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('pipedrive-reconcile-sync failed:', message)
    await notifyOwners(db, {
      type: 'pipedrive_reconcile_failed',
      title: 'Pipedrive reconciliation sync failed to run',
      body: message,
    })
    return Response.json({ ok: false, error: message })
  }
}

export const config = {
  schedule: '0 * * * *',
}
