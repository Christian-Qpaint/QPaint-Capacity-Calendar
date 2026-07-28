import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { teamMemberships } from '../../../db/schema.js'

function toValues(body: Record<string, unknown>) {
  return {
    workerId: body.workerId as string,
    teamId: body.teamId as string,
    startDate: body.startDate as string,
    endDate: (body.endDate as string | undefined) ?? null,
    membershipType: body.membershipType as 'Core' | 'Floating',
  }
}

export default withErrorHandling(async (req: Request) => {
  await requireOfficeRole(req)
  const db = getDb()
  const id = new URL(req.url).searchParams.get('id')

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const [created] = await db.insert(teamMemberships).values(toValues(body)).returning()
    return Response.json(stripNulls(created))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const [updated] = await db.update(teamMemberships).set(toValues(body)).where(eq(teamMemberships.id, id)).returning()
    if (!updated) throw new HttpError(404, 'Team membership not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    await db.delete(teamMemberships).where(eq(teamMemberships.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/team-memberships',
}
