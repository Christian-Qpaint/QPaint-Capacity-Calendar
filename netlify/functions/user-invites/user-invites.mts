// Owner-only: generate/list/revoke one-time invite links, replacing open public self-signup.
// Each invite bakes in the intended email + role; accept-invite.mts is the only thing that can
// turn a valid, unexpired, unused token into a real account. Creating an invite never sends
// anything; the email (Resend — see _shared/invites.ts) goes out only when someone clicks Send email.
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOwnerRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNullsAll } from '../_shared/rows.js'
import { userInvites, users } from '../../../db/schema.js'
import { INVITE_LIFETIME_DAYS, createInvite, deliverInvite, siteBaseUrl } from '../_shared/invites.js'

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

    const created = await createInvite(db, { email, role, createdBy: owner.id, baseUrl: siteBaseUrl(req), inviterName: owner.name, sendEmail: false })
    return Response.json(stripNullsAll([created])[0])
  }

  // Re-send the email for a pending invite (and give it a fresh 7 days).
  if (req.method === 'PATCH' && url.searchParams.get('action') === 'resend') {
    const id = url.searchParams.get('id')
    if (!id) throw new HttpError(400, 'Missing id')
    const [invite] = await db.select().from(userInvites).where(eq(userInvites.id, id)).limit(1)
    if (!invite) throw new HttpError(404, 'Invite not found')
    if (invite.usedAt) throw new HttpError(409, 'That invite has already been used.')
    const expiresAt = new Date(Date.now() + INVITE_LIFETIME_DAYS * 86_400_000).toISOString()
    const [refreshed] = await db.update(userInvites).set({ expiresAt }).where(eq(userInvites.id, id)).returning()
    const updated = await deliverInvite(db, refreshed, { baseUrl: siteBaseUrl(req), inviterName: owner.name })
    return Response.json(stripNullsAll([updated])[0])
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
