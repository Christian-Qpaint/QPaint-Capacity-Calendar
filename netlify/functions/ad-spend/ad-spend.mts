import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireMarketingImport, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNulls } from '../_shared/rows.js'
import { adSpend } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  await requireMarketingImport(req)
  const db = getDb()
  const id = new URL(req.url).searchParams.get('id')

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const month = body.month as string
    const referralSource = body.referralSource as string
    const amount = body.amount as number
    const [saved] = await db
      .insert(adSpend)
      .values({ month, referralSource, amount, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: [adSpend.month, adSpend.referralSource],
        set: { amount, updatedAt: new Date().toISOString() },
      })
      .returning()
    return Response.json(stripNulls(saved))
  }

  if (!id) throw new HttpError(400, 'Missing id')

  if (req.method === 'PATCH') {
    const body = await parseJsonBody(req)
    const [updated] = await db
      .update(adSpend)
      .set({ amount: body.amount as number, updatedAt: new Date().toISOString() })
      .where(eq(adSpend.id, id))
      .returning()
    if (!updated) throw new HttpError(404, 'Ad spend entry not found')
    return Response.json(stripNulls(updated))
  }

  if (req.method === 'DELETE') {
    await db.delete(adSpend).where(eq(adSpend.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/ad-spend',
}
