// Public (no session required) — the only way an invite token turns into a real account. GET
// validates the token so the frontend can show who/what it's for before asking for a password;
// POST actually creates the account and consumes the invite. Replaces the old open
// auth-signup.mts entirely: there's no other path to a new account anymore.
import bcrypt from 'bcryptjs'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { withSessionCookie } from '../_shared/auth.js'
import { parseJsonBody } from '../_shared/http.js'
import { toClientUser } from '../_shared/userMapper.js'
import { userInvites, users } from '../../../db/schema.js'

const BCRYPT_ROUNDS = 12

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

async function findValidInvite(db: ReturnType<typeof getDb>, token: string) {
  const [invite] = await db
    .select()
    .from(userInvites)
    .where(and(eq(userInvites.token, token), isNull(userInvites.usedAt)))
    .limit(1)
  if (!invite) return { invite: null, reason: 'This invite link is invalid or has already been used.' }
  if (new Date(invite.expiresAt).getTime() < Date.now()) return { invite: null, reason: 'This invite link has expired — ask for a new one.' }
  return { invite, reason: null }
}

export default async (req: Request): Promise<Response> => {
  const db = getDb()
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const token = url.searchParams.get('token') ?? ''
    const { invite, reason } = await findValidInvite(db, token)
    if (!invite) return jsonError(reason!, 410)
    return Response.json({ email: invite.email, role: invite.role })
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req)
    const token = typeof body.token === 'string' ? body.token : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    const { invite, reason } = await findValidInvite(db, token)
    if (!invite) return jsonError(reason!, 410)
    if (!name) return jsonError('Enter your name.', 400)
    if (password.length < 8) return jsonError('Password must be at least 8 characters.', 400)

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, invite.email)).limit(1)
    if (existing) return jsonError('An account with that email already exists.', 409)

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const [created] = await db
      .insert(users)
      .values({ email: invite.email, passwordHash, name, role: invite.role })
      .returning()
    await db.update(userInvites).set({ usedAt: new Date().toISOString() }).where(eq(userInvites.id, invite.id))

    return withSessionCookie(Response.json({ user: toClientUser(created) }), created.id)
  }

  return jsonError('Method not allowed', 405)
}

export const config = {
  path: '/api/accept-invite',
}
