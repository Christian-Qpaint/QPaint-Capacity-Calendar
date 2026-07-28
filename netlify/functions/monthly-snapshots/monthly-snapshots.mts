import { and, eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireFullTierRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { monthlySnapshots, monthlyTargets } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  await requireFullTierRole(req)

  const db = getDb()
  const body = await parseJsonBody(req)
  const year = body.year as number
  const month = body.month as number
  const actualDollars = body.actualDollars as number

  const [target] = await db
    .select()
    .from(monthlyTargets)
    .where(and(eq(monthlyTargets.year, year), eq(monthlyTargets.month, month)))
    .limit(1)

  const [saved] = await db
    .insert(monthlySnapshots)
    .values({ year, month, targetDollars: target?.targetDollars ?? 0, actualDollars })
    .onConflictDoUpdate({
      target: [monthlySnapshots.year, monthlySnapshots.month],
      set: { targetDollars: target?.targetDollars ?? 0, actualDollars },
    })
    .returning()
  return Response.json(stripNulls(saved))
})

export const config = {
  path: '/api/monthly-snapshots',
}
