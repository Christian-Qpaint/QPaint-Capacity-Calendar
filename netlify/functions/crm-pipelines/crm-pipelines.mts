import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOwnerRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { crmPipelines } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  await requireOwnerRole(req)
  const db = getDb()
  const id = new URL(req.url).searchParams.get('id')

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const [created] = await db
      .insert(crmPipelines)
      .values({ name: body.name as string, order: (body.order as number | undefined) ?? 0 })
      .returning()
    return Response.json(stripNulls(created))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const [updated] = await db
      .update(crmPipelines)
      .set({ name: body.name as string, order: body.order as number, updatedAt: new Date().toISOString() })
      .where(eq(crmPipelines.id, id))
      .returning()
    if (!updated) throw new HttpError(404, 'Pipeline not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    try {
      await db.delete(crmPipelines).where(eq(crmPipelines.id, id))
    } catch {
      // FK restrict on crm_deals.pipeline_id — surface as a clear 409 instead of a raw DB error.
      throw new HttpError(409, 'Reassign or delete every deal in this pipeline before deleting it')
    }
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/crm-pipelines',
}
