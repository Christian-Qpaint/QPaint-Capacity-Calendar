import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireUser, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { notifications, users } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  const user = await requireUser(req)
  const body = await parseJsonBody(req)
  const permissionKey = body.permissionKey as string
  if (!permissionKey) throw new HttpError(400, 'Missing permissionKey')

  const db = getDb()
  const owners = await db.select({ id: users.id }).from(users).where(eq(users.role, 'owner'))
  const recipients = owners.filter((o) => o.id !== user.id)
  if (recipients.length === 0) return Response.json({ ok: true })

  await db.insert(notifications).values(
    recipients.map((o) => ({
      recipientId: o.id,
      type: 'access_request',
      title: `${user.name} requested access`,
      body: `Permission: ${permissionKey}`,
      link: '/setup?tab=users',
      createdBy: user.id,
    })),
  )
  return Response.json({ ok: true })
})

export const config = {
  path: '/api/request-access',
}
