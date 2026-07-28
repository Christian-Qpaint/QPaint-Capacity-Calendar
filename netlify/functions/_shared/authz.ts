// Role-based authorization — the direct port of the role-check functions and RLS predicates from
// supabase/migrations/0001_init.sql (current_role_name/is_office_role/is_full_tier_role/
// can_access_update_progress). Postgres RLS enforced these at the query layer automatically;
// without RLS, every Function that touches a gated table calls one of the requireX helpers below
// before running its query.
import { and, eq } from 'drizzle-orm'
import { getCurrentUser } from './auth.js'
import { getDb } from './db.js'
import { userPermissionOverrides, type users } from '../../../db/schema.js'

type UserRow = typeof users.$inferSelect

export function isOfficeRole(user: UserRow): boolean {
  return user.role === 'owner' || user.role === 'ops_manager' || user.role === 'scheduler_pm'
}

export function isFullTierRole(user: UserRow): boolean {
  return user.role === 'owner' || user.role === 'ops_manager'
}

export function canUpdateProgress(user: UserRow): boolean {
  return user.role !== 'painter_crew_member'
}

export function canAccessMarketingDefault(user: UserRow): boolean {
  return user.role === 'owner' || user.role === 'marketing'
}

/** Port of permission_override() + can_access_marketing()/can_import_marketing_data() from
 * migration 0018 — the one place in the app where per-user permission overrides are enforced at
 * the data layer, not just hidden in the UI. An explicit override always wins over the role
 * default, matching PermissionsContext.tsx's client-side hasPermission() exactly. */
async function hasOverrideOrDefault(userId: string, permissionKey: string, roleDefault: boolean): Promise<boolean> {
  const db = getDb()
  const [override] = await db
    .select({ granted: userPermissionOverrides.granted })
    .from(userPermissionOverrides)
    .where(and(eq(userPermissionOverrides.userId, userId), eq(userPermissionOverrides.permissionKey, permissionKey)))
    .limit(1)
  return override ? override.granted : roleDefault
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function requireUser(req: Request): Promise<UserRow> {
  const user = await getCurrentUser(req)
  if (!user) throw new HttpError(401, 'Not signed in')
  return user
}

export async function requireOfficeRole(req: Request): Promise<UserRow> {
  const user = await requireUser(req)
  if (!isOfficeRole(user)) throw new HttpError(403, 'Requires office access')
  return user
}

export async function requireOwnerRole(req: Request): Promise<UserRow> {
  const user = await requireUser(req)
  if (user.role !== 'owner') throw new HttpError(403, 'Requires owner access')
  return user
}

/** Port of can_access_marketing() — marketing.view override, falling back to owner/marketing role. */
export async function requireMarketingView(req: Request): Promise<UserRow> {
  const user = await requireUser(req)
  const allowed = await hasOverrideOrDefault(user.id, 'marketing.view', canAccessMarketingDefault(user))
  if (!allowed) throw new HttpError(403, 'Requires Marketing access')
  return user
}

/** Port of can_import_marketing_data() — marketing.import override, falling back to owner/marketing role. */
export async function requireMarketingImport(req: Request): Promise<UserRow> {
  const user = await requireUser(req)
  const allowed = await hasOverrideOrDefault(user.id, 'marketing.import', canAccessMarketingDefault(user))
  if (!allowed) throw new HttpError(403, 'Requires Marketing import access')
  return user
}

export async function requireFullTierRole(req: Request): Promise<UserRow> {
  const user = await requireUser(req)
  if (!isFullTierRole(user)) throw new HttpError(403, 'Requires full-tier access')
  return user
}

/** Wraps a Function handler so a thrown HttpError becomes the matching JSON error response,
 * instead of every handler needing its own try/catch for this. */
export function withErrorHandling(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req)
    } catch (err) {
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status })
      const message = err instanceof Error ? err.message : String(err)
      return Response.json({ error: message }, { status: 500 })
    }
  }
}
