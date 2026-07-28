// Session/JWT/cookie mechanics shared by the auth Functions (and, later, every other Function
// that needs to know who's calling). The JWT payload is deliberately just { userId } — role and
// other authorization data are always re-read fresh from the users table on each request, never
// trusted from the token itself, so a role change (or an owner revoking access) takes effect on
// the very next request rather than requiring the affected user to log out and back in.
import jwt from 'jsonwebtoken'
import { eq } from 'drizzle-orm'
import { getDb } from './db.js'
import { users } from '../../../db/schema.js'

const COOKIE_NAME = 'qpaint_session'
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30 // 30 days

function getSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET
  if (!secret) throw new Error('AUTH_JWT_SECRET is not set')
  return secret
}

interface SessionPayload {
  userId: string
}

export function signSessionToken(userId: string): string {
  return jwt.sign({ userId } satisfies SessionPayload, getSecret(), { expiresIn: SESSION_DURATION_SECONDS })
}

function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as SessionPayload
  } catch {
    return null
  }
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.get('cookie') ?? ''
  const cookies: Record<string, string> = {}
  for (const part of header.split(';')) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex === -1) continue
    const key = part.slice(0, separatorIndex).trim()
    const value = part.slice(separatorIndex + 1).trim()
    if (key) cookies[key] = decodeURIComponent(value)
  }
  return cookies
}

/** Verifies the session cookie and re-fetches the user row fresh — never trusts stale claims. */
export async function getCurrentUser(req: Request) {
  const token = parseCookies(req)[COOKIE_NAME]
  if (!token) return null
  const payload = verifySessionToken(token)
  if (!payload) return null
  const db = getDb()
  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1)
  return user ?? null
}

function cookieAttributes(maxAgeSeconds: number): string {
  return `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`
}

export function withSessionCookie(response: Response, userId: string): Response {
  response.headers.append('Set-Cookie', `${COOKIE_NAME}=${signSessionToken(userId)}; ${cookieAttributes(SESSION_DURATION_SECONDS)}`)
  return response
}

export function withClearedSessionCookie(response: Response): Response {
  response.headers.append('Set-Cookie', `${COOKIE_NAME}=; ${cookieAttributes(0)}`)
  return response
}
