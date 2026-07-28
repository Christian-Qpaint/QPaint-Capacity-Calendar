import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { workers } from '../../../db/schema.js'

function toValues(body: Record<string, unknown>) {
  return {
    firstName: body.firstName as string,
    lastName: body.lastName as string,
    phone: (body.phone as string | undefined) ?? '',
    email: (body.email as string | undefined) ?? '',
    address: (body.address as string | undefined) ?? '',
    position: (body.position as string | undefined) ?? '',
    workerType: body.workerType as 'Internal' | 'Contractor',
    contractorId: (body.contractorId as string | undefined) ?? null,
    whiteCardNumber: (body.whiteCardNumber as string | undefined) ?? '',
    qbuildInductionDone: (body.qbuildInductionDone as boolean | undefined) ?? false,
    qbuildInductionVerified: (body.qbuildInductionVerified as boolean | undefined) ?? false,
  }
}

export default withErrorHandling(async (req: Request) => {
  await requireOfficeRole(req)
  const db = getDb()
  const id = new URL(req.url).searchParams.get('id')

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const [created] = await db.insert(workers).values(toValues(body)).returning()
    return Response.json(stripNulls(created))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const [updated] = await db.update(workers).set(toValues(body)).where(eq(workers.id, id)).returning()
    if (!updated) throw new HttpError(404, 'Worker not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    await db.delete(workers).where(eq(workers.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/workers',
}
