// Owner-only: generate/list/revoke one-time invite links, replacing open public self-signup.
// Each invite bakes in the intended email + role; accept-invite.mts is the only thing that can
// turn a valid, unexpired, unused token into a real account. No email provider is wired up here —
// the owner copies the generated link and sends it themselves (Slack, email client, whatever).
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOwnerRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNullsAll } from '../_shared/rows.js'
import { userInvites, users } from '../../../db/schema.js'

const INVITE_LIFETIME_DAYS = 7

export default withErrorHandling(async (req: Request) => {
  const owner = await requireOwnerRole(req)
  const db = getDb()
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const rows = await db.select().from(userInvites).orderBy(desc(userInvites.createdAt))
    return Response.json(stripNullsAll(rows))
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = body.role as (typeof users.$inferSelect)['role']
    if (!email.includes('@')) throw new HttpError(400, 'Enter a valid email address.')
    if (!role) throw new HttpError(400, 'Missing role.')

    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (existingUser) throw new HttpError(409, 'An account with that email already exists.')

    const expiresAt = new Date(Date.now() + INVITE_LIFETIME_DAYS * 86_400_000).toISOString()
    const [created] = await db
      .insert(userInvites)
      .values({ email, role, token: crypto.randomUUID(), createdBy: owner.id, expiresAt })
      .returning()
    return Response.json(stripNullsAll([created])[0])
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id')
    if (!id) throw new HttpError(400, 'Missing id')
    await db.delete(userInvites).where(eq(userInvites.id, id))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/user-invites',
}
