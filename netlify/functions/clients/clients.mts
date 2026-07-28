import { getDb } from '../_shared/db.js'
import { requireOfficeRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { clients } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  await requireOfficeRole(req)
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')

  const db = getDb()
  const body = await parseJsonBody(req)
  const [created] = await db
    .insert(clients)
    .values({
      name: body.name as string,
      type: body.type as 'Individual' | 'Company' | 'Government' | 'Body Corporate',
      contactInfo: (body.contactInfo as string | undefined) ?? '',
    })
    .returning()
  return Response.json(stripNulls(created))
})

export const config = {
  path: '/api/clients',
}
