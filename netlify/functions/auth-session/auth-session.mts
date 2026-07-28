import { getCurrentUser } from '../_shared/auth.js'
import { toClientUser } from '../_shared/userMapper.js'

export default async (req: Request) => {
  const user = await getCurrentUser(req)
  return Response.json({ user: user ? toClientUser(user) : null })
}

export const config = {
  path: '/api/auth/session',
}
