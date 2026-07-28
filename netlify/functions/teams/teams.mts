import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { teams } from '../../../db/schema.js'

function toValues(body: Record<string, unknown>) {
  return {
    name: body.name as string,
    type: body.type as 'QPaint' | 'Contractor',
    contractorId: (body.contractorId as string | undefined) ?? null,
    headcount: (body.headcount as number | undefined) ?? null,
    standardHoursPerWeek: (body.standardHoursPerWeek as number | undefined) ?? null,
    color: (body.color as string | undefined) ?? null,
  }
}

export default withErrorHandling(async (req: Request) => {
  await requireOfficeRole(req)
  const db = getDb()
  const id = new URL(req.url).searchParams.get('id')

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const [created] = await db.insert(teams).values(toValues(body)).returning()
    return Response.json(stripNulls(created))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const [updated] = await db.update(teams).set(toValues(body)).where(eq(teams.id, id)).returning()
    if (!updated) throw new HttpError(404, 'Team not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    await db.delete(teams).where(eq(teams.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/teams',
}
