// Write-only CRUD for crm_saved_filters — reads are served from crm-data.mts's bootstrap
// (savedFilters array), same split as crm-pipelines.mts/crm-stages.mts. Owner-only, matching
// crm.manage_config: these are the copied-in Pipedrive filter definitions, editable/deletable
// locally afterward like every other piece of CRM configuration.
import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOwnerRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { crmSavedFilters } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  await requireOwnerRole(req)
  const db = getDb()
  const id = new URL(req.url).searchParams.get('id')

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const [created] = await db
      .insert(crmSavedFilters)
      .values({
        name: body.name as string,
        order: (body.order as number | undefined) ?? 0,
        conditions: body.conditions ?? { glue: 'and', conditions: [] },
        supported: (body.supported as boolean | undefined) ?? true,
        unsupportedReason: (body.unsupportedReason as string | undefined) ?? null,
        pipedriveFilterId: (body.pipedriveFilterId as number | undefined) ?? null,
      })
      .returning()
    return Response.json(stripNulls(created))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    for (const key of ['name', 'order', 'conditions', 'supported', 'unsupportedReason'] as const) {
      if (key in body) patch[key] = body[key]
    }
    const [updated] = await db.update(crmSavedFilters).set(patch).where(eq(crmSavedFilters.id, id)).returning()
    if (!updated) throw new HttpError(404, 'Saved filter not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    await db.delete(crmSavedFilters).where(eq(crmSavedFilters.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/crm-saved-filters',
}
