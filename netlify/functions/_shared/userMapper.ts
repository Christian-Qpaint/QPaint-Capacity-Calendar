import type { users } from '../../../db/schema.js'

type UserRow = typeof users.$inferSelect

/** Client-facing user shape — deliberately never includes email or passwordHash, mirroring the
 * old Supabase `profiles` row the frontend used to receive (auth-specific fields stayed server-side). */
export function toClientUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    teamId: row.teamId,
    workerId: row.workerId,
  }
}
