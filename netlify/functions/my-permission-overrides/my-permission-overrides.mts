// Self-scoped read — any authenticated user can see their OWN overrides (matches
// permission_overrides_select's "user_id = auth.uid() or owner" clause; the "or owner" branch for
// reading *everyone's* overrides is user-accounts.mts's job, not this one).
import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { requireUser, withErrorHandling } from '../_shared/authz.js'
import { userPermissionOverrides } from '../../../db/schema.js'

export default withErrorHandling(async (req: Request) => {
  const user = await requireUser(req)
  const db = getDb()
  const rows = await db
    .select({ permissionKey: userPermissionOverrides.permissionKey, granted: userPermissionOverrides.granted })
    .from(userPermissionOverrides)
    .where(eq(userPermissionOverrides.userId, user.id))
  return Response.json({ overrides: rows })
})

export const config = {
  path: '/api/my-permission-overrides',
}
