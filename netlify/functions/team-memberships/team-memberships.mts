import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { teamMemberships, users } from '../../../db/schema.js'

/** A worker's login (users.team_id) follows their Core crew, so assigning/moving/removing a crew
 * updates what that person sees without anyone touching the account. No-op if they have no login. */
async function syncLoginCrew(db: ReturnType<typeof getDb>, workerId: string) {
  const [core] = await db
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(and(eq(teamMemberships.workerId, workerId), eq(teamMemberships.membershipType, 'Core')))
    .orderBy(desc(teamMemberships.startDate))
    .limit(1)
  await db.update(users).set({ teamId: core?.teamId ?? null }).where(eq(users.workerId, workerId))
}

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
    await syncLoginCrew(db, created.workerId)
    return Response.json(stripNulls(created))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const [updated] = await db.update(teamMemberships).set(toValues(body)).where(eq(teamMemberships.id, id)).returning()
    if (!updated) throw new HttpError(404, 'Team membership not found')
    await syncLoginCrew(db, updated.workerId)
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    const [existing] = await db.select({ workerId: teamMemberships.workerId }).from(teamMemberships).where(eq(teamMemberships.id, id)).limit(1)
    await db.delete(teamMemberships).where(eq(teamMemberships.id, id))
    if (existing) await syncLoginCrew(db, existing.workerId)
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/team-memberships',
}
