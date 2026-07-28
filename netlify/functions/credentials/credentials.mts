import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireFullTierRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { credentials } from '../../../db/schema.js'

function toValues(body: Record<string, unknown>) {
  return {
    contractorId: body.contractorId as string,
    credentialType: body.credentialType as string as
      | 'Licence'
      | 'Insurance'
      | 'White Card'
      | 'Blue Card'
      | 'Police Check'
      | 'WHS Induction'
      | 'Driver Licence'
      | 'Other'
      | 'WorkCover'
      | 'Public Liability',
    number: (body.number as string | undefined) ?? null,
    issuer: (body.issuer as string | undefined) ?? null,
    coverageAmount: (body.coverageAmount as number | undefined) ?? null,
    expiryDate: (body.expiryDate as string | undefined) ?? null,
    jobTypeScope: (body.jobTypeScope as string | undefined) as
      | 'All'
      | 'Residential'
      | 'Government'
      | 'Corporate'
      | 'Commercial'
      | null,
  }
}

export default withErrorHandling(async (req: Request) => {
  // Credentials are gated Full-tier (Owner/Ops Manager only) per migration 0001's
  // credentials_select_full_tier/credentials_write_full_tier — one level stricter than the rest
  // of the office-role-gated tables.
  await requireFullTierRole(req)
  const db = getDb()
  const id = new URL(req.url).searchParams.get('id')

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const [created] = await db.insert(credentials).values(toValues(body)).returning()
    return Response.json(stripNulls(created))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const [updated] = await db.update(credentials).set(toValues(body)).where(eq(credentials.id, id)).returning()
    if (!updated) throw new HttpError(404, 'Credential not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    await db.delete(credentials).where(eq(credentials.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/credentials',
}
