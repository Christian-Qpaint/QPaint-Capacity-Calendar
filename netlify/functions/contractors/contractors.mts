import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOfficeRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { contractors } from '../../../db/schema.js'

function toValues(body: Record<string, unknown>) {
  return {
    name: body.name as string,
    nickname: (body.nickname as string | undefined) ?? null,
    reportedMonthlyCapacity: (body.reportedMonthlyCapacity as number | undefined) ?? 0,
    tradingName: (body.tradingName as string | undefined) ?? null,
    abn: (body.abn as string | undefined) ?? null,
    acn: (body.acn as string | undefined) ?? null,
    gstRegistered: (body.gstRegistered as boolean | undefined) ?? null,
    licenceCategory: (body.licenceCategory as string | undefined) ?? null,
    address: (body.address as string | undefined) ?? null,
    suburb: (body.suburb as string | undefined) ?? null,
    state: (body.state as string | undefined) ?? null,
    postcode: (body.postcode as string | undefined) ?? null,
    primaryContactName: (body.primaryContactName as string | undefined) ?? null,
    primaryContactMobile: (body.primaryContactMobile as string | undefined) ?? null,
    primaryContactEmail: (body.primaryContactEmail as string | undefined) ?? null,
    preferredArea: (body.preferredArea as string | undefined) ?? null,
    afterHoursAvailable: (body.afterHoursAvailable as string | undefined) ?? null,
    ownEquipment: (body.ownEquipment as string | undefined) ?? null,
    ownTransport: (body.ownTransport as string | undefined) ?? null,
    yearsExperience: (body.yearsExperience as number | undefined) ?? null,
    reference1Name: (body.reference1Name as string | undefined) ?? null,
    reference1Phone: (body.reference1Phone as string | undefined) ?? null,
    reference2Name: (body.reference2Name as string | undefined) ?? null,
    reference2Phone: (body.reference2Phone as string | undefined) ?? null,
    approved: (body.approved as string | undefined) ?? null,
    active: (body.active as string | undefined) ?? null,
    lastUpdated: (body.lastUpdated as string | undefined) ?? null,
  }
}

export default withErrorHandling(async (req: Request) => {
  await requireOfficeRole(req)
  const db = getDb()
  const id = new URL(req.url).searchParams.get('id')

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const [created] = await db.insert(contractors).values(toValues(body)).returning()
    return Response.json(stripNulls(created))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const [updated] = await db.update(contractors).set(toValues(body)).where(eq(contractors.id, id)).returning()
    if (!updated) throw new HttpError(404, 'Contractor not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    await db.delete(contractors).where(eq(contractors.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/contractors',
}
