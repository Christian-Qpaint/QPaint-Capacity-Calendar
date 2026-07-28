import { getDb } from '../_shared/db.js'
import { requireFullTierRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { monthlyTargets } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  await requireFullTierRole(req)

  const db = getDb()
  const body = await parseJsonBody(req)
  const [saved] = await db
    .insert(monthlyTargets)
    .values({
      year: body.year as number,
      month: body.month as number,
      targetDollars: body.targetDollars as number,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [monthlyTargets.year, monthlyTargets.month],
      set: { targetDollars: body.targetDollars as number, updatedAt: new Date().toISOString() },
    })
    .returning()
  return Response.json(stripNulls(saved))
})

export const config = {
  path: '/api/monthly-targets',
}
