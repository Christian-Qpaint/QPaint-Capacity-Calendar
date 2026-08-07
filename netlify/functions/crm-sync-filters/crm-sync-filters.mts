// On-demand, one-way sync (Pipedrive -> QPaintOS only) for saved deal filters — there is no
// Pipedrive webhook event for filter changes (confirmed: registering a webhook with
// event_object "filter" is rejected outright as "Event object unsupported"), so unlike deals this
// can only ever be triggered manually. Exists because Pipedrive users (Tas especially) edit these
// filters directly in Pipedrive from time to time, and those edits would otherwise never reach the
// copy the Deals board actually runs against.
import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOwnerRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { crmSavedFilters } from '../../../db/schema.js'
import { translatePipedriveFilter, buildTranslateContext, type RawPipedriveFilterNode } from '../_shared/pipedriveFilterTranslate.js'

interface PipedriveFilterListItem {
  id: number
  name: string
  type: string
}

interface PipedriveApiResponse<T> {
  success: boolean
  error?: string
  data?: T
}

export default withErrorHandling(async (req: Request) => {
  await requireOwnerRole(req)
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')

  const token = process.env.PIPEDRIVE_API_TOKEN
  if (!token) throw new HttpError(500, 'PIPEDRIVE_API_TOKEN is not set on this Function')

  const db = getDb()

  const [listRes, fieldsRes] = await Promise.all([
    fetch(`https://api.pipedrive.com/v1/filters?type=deals&api_token=${token}`),
    fetch(`https://api.pipedrive.com/v1/dealFields?api_token=${token}`),
  ])
  const listJson = (await listRes.json()) as PipedriveApiResponse<PipedriveFilterListItem[]>
  const fieldsJson = (await fieldsRes.json()) as PipedriveApiResponse<{ id: number; key: string; name: string }[]>
  if (!listJson.success) throw new HttpError(502, listJson.error ?? 'Pipedrive API error while listing filters')
  if (!fieldsJson.success) throw new HttpError(502, fieldsJson.error ?? 'Pipedrive API error while listing deal fields')

  const fieldIdToKey = new Map<string, { key: string; name: string }>(
    (fieldsJson.data ?? []).map((f) => [String(f.id), { key: f.key, name: f.name }]),
  )
  const ctx = await buildTranslateContext(db, fieldIdToKey)

  const filters = listJson.data ?? []
  let created = 0
  let updated = 0
  let unsupported = 0

  for (const [index, filterSummary] of filters.entries()) {
    const detailRes = await fetch(`https://api.pipedrive.com/v1/filters/${filterSummary.id}?api_token=${token}`)
    const detailJson = (await detailRes.json()) as PipedriveApiResponse<{ conditions: RawPipedriveFilterNode }>
    if (!detailJson.success || !detailJson.data?.conditions) continue

    const translated = translatePipedriveFilter(detailJson.data.conditions, ctx)
    if (!translated.supported) unsupported++

    const values = {
      pipedriveFilterId: filterSummary.id,
      name: filterSummary.name,
      order: index,
      conditions: translated.conditions,
      supported: translated.supported,
      unsupportedReason: translated.reason,
      updatedAt: new Date().toISOString(),
    }

    const [existing] = await db
      .select({ id: crmSavedFilters.id })
      .from(crmSavedFilters)
      .where(eq(crmSavedFilters.pipedriveFilterId, filterSummary.id))
      .limit(1)

    if (existing) {
      await db.update(crmSavedFilters).set(values).where(eq(crmSavedFilters.id, existing.id))
      updated++
    } else {
      await db.insert(crmSavedFilters).values(values)
      created++
    }
  }

  return Response.json({ total: filters.length, created, updated, unsupported })
})

export const config = {
  path: '/api/crm-sync-filters',
}
