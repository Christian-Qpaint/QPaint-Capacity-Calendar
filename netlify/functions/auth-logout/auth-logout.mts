import { withClearedSessionCookie } from '../_shared/auth.js'

export default async (req: Request) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })
  return withClearedSessionCookie(Response.json({ ok: true }))
}

export const config = {
  path: '/api/auth/logout',
}
