// Owner-only admin data backing the Users & Permissions screen. Gated at owner level throughout —
// slightly stricter than the original RLS for the role-update path (profiles_update_office allowed
// any office role), but this endpoint's sole real-world caller is the owner-only admin screen, and
// user_permission_overrides' own RLS (permission_overrides_write) was already owner-only.
import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireOwnerRole, withErrorHandling, HttpError } from '../_shared/authz.js'
import { parseJsonBody } from '../_shared/http.js'
import { stripNullsAll } from '../_shared/rows.js'
import { userPermissionOverrides, users } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  const owner = await requireOwnerRole(req)
  const db = getDb()
  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  if (req.method === 'GET') {
    const [userRows, overrideRows] = await Promise.all([
      db.select().from(users).orderBy(asc(users.name)),
      db.select().from(userPermissionOverrides),
    ])
    return Response.json({
      users: stripNullsAll(userRows).map(({ passwordHash: _passwordHash, ...rest }) => rest),
      overrides: stripNullsAll(overrideRows),
    })
  }

  if (req.method === 'PATCH' && action === 'role') {
    const userId = url.searchParams.get('userId')
    if (!userId) throw new HttpError(400, 'Missing userId')
    const body = await parseJsonBody(req)
    const [updated] = await db
      .update(users)
      .set({ role: body.role as (typeof users.$inferSelect)['role'] })
      .where(eq(users.id, userId))
      .returning()
    if (!updated) throw new HttpError(404, 'User not found')
    const { passwordHash: _passwordHash, ...rest } = updated
    return Response.json(rest)
  }

  if (req.method === 'POST' && action === 'override') {
    const body = await parseJsonBody(req)
    const userId = body.userId as string
    const permissionKey = body.permissionKey as string
    const granted = body.granted as boolean
    const [saved] = await db
      .insert(userPermissionOverrides)
      .values({ userId, permissionKey, granted, updatedBy: owner.id, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: [userPermissionOverrides.userId, userPermissionOverrides.permissionKey],
        set: { granted, updatedBy: owner.id, updatedAt: new Date().toISOString() },
      })
      .returning()
    return Response.json(stripNullsAll([saved])[0])
  }

  if (req.method === 'DELETE') {
    const userId = url.searchParams.get('userId')
    const permissionKey = url.searchParams.get('permissionKey')
    if (!userId || !permissionKey) throw new HttpError(400, 'Missing userId or permissionKey')
    await db
      .delete(userPermissionOverrides)
      .where(and(eq(userPermissionOverrides.userId, userId), eq(userPermissionOverrides.permissionKey, permissionKey)))
    return Response.json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
})

export const config = {
  path: '/api/user-accounts',
}
