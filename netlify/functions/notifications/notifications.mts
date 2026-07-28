import { and, desc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireUser, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNullsAll } from '../_shared/rows.js'
import { notifications } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  const user = await requireUser(req)
  const db = getDb()

  if (req.method === 'GET') {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50)
    return Response.json({ notifications: stripNullsAll(rows) })
  }

  if (req.method === 'PATCH') {
    const url = new URL(req.url)
    if (url.searchParams.get('all') === 'true') {
      await db
        .update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.recipientId, user.id), eq(notifications.read, false)))
      return Response.json({ ok: true })
    }
    const body = await parseJsonBody(req)
    const ids = body.ids as string[]
    if (!ids || ids.length === 0) throw new HttpError(400, 'Missing ids')
    await db.update(notifications).set({ read: true }).where(and(eq(notifications.recipientId, user.id), inArray(notifications.id, ids)))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/notifications',
}
