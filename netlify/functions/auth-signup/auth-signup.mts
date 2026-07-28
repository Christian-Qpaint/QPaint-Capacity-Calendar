import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { withSessionCookie } from '../_shared/auth.js'
import { parseJsonBody } from '../_shared/http.js'
import { toClientUser } from '../_shared/userMapper.js'
import { users } from '../../../db/schema.js'

const BCRYPT_ROUNDS = 12

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

export default async (req: Request) => {
  if (req.method !== 'POST') return jsonError('Method not allowed', 405)

  const body = await parseJsonBody(req)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''

  if (!email.includes('@')) return jsonError('Enter a valid email address.', 400)
  if (password.length < 8) return jsonError('Password must be at least 8 characters.', 400)
  if (!name) return jsonError('Enter your name.', 400)

  const db = getDb()
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing) return jsonError('An account with that email already exists.', 409)

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  // Least-privilege default, matching the old handle_new_user trigger — an office admin promotes
  // the role afterwards via the Users & Permissions screen.
  const [created] = await db
    .insert(users)
    .values({ email, passwordHash, name, role: 'painter_crew_member' })
    .returning()

  return withSessionCookie(Response.json({ user: toClientUser(created) }), created.id)
}

export const config = {
  path: '/api/auth/signup',
}
