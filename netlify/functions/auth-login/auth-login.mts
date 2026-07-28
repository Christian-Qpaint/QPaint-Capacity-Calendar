import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { withSessionCookie } from '../_shared/auth.js'
import { parseJsonBody } from '../_shared/http.js'
import { toClientUser } from '../_shared/userMapper.js'
import { users } from '../../../db/schema.js'

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

export default async (req: Request) => {
  if (req.method !== 'POST') return jsonError('Method not allowed', 405)

  const body = await parseJsonBody(req)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !password) return jsonError('Invalid email or password.', 401)

  const db = getDb()
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  // Same message whether the email doesn't exist or the password is wrong — don't leak which.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return jsonError('Invalid email or password.', 401)
  }

  return withSessionCookie(Response.json({ user: toClientUser(user) }), user.id)
}

export const config = {
  path: '/api/auth/login',
}
