import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { mapUserPermissionOverride } from '@/lib/permissionMappers'
import { useCurrentUser } from '@/context/AuthContext'
import type { Role, User, UserPermissionOverride } from '@/types'

interface ProfileRow {
  id: string
  name: string
  role: Role
  team_id: string | null
  worker_id: string | null
}

function mapProfile(row: ProfileRow): User {
  return { id: row.id, name: row.name, role: row.role, teamId: row.team_id ?? undefined, workerId: row.worker_id ?? undefined }
}

/** Owner-only admin data: every user account plus every permission override, for the Users &
 * Permissions screen. Kept as its own hook (not the app-wide DataContext) since it's only ever
 * used by one owner-only page — same reasoning as useMarketingData. */
export function useUserAccounts() {
  const currentUser = useCurrentUser()
  const [users, setUsers] = useState<User[]>([])
  const [overrides, setOverrides] = useState<UserPermissionOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [profilesRes, overridesRes] = await Promise.all([
      supabase.from('profiles').select('*').order('name', { ascending: true }),
      supabase.from('user_permission_overrides').select('*'),
    ])
    const firstError = [profilesRes, overridesRes].find((r) => r.error)?.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }
    setUsers((profilesRes.data ?? []).map((r) => mapProfile(r as ProfileRow)))
    setOverrides((overridesRes.data ?? []).map(mapUserPermissionOverride))
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function updateRole(userId: string, role: Role) {
    const { error: err } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (err) throw new Error(err.message)
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
  }

  async function setOverride(userId: string, permissionKey: string, granted: boolean) {
    const { data, error: err } = await supabase
      .from('user_permission_overrides')
      .upsert(
        { user_id: userId, permission_key: permissionKey, granted, updated_by: currentUser.id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,permission_key' },
      )
      .select()
      .single()
    if (err) throw new Error(err.message)
    const saved = mapUserPermissionOverride(data)
    setOverrides((prev) => [...prev.filter((o) => !(o.userId === userId && o.permissionKey === permissionKey)), saved])
  }

  async function clearOverride(userId: string, permissionKey: string) {
    const { error: err } = await supabase
      .from('user_permission_overrides')
      .delete()
      .eq('user_id', userId)
      .eq('permission_key', permissionKey)
    if (err) throw new Error(err.message)
    setOverrides((prev) => prev.filter((o) => !(o.userId === userId && o.permissionKey === permissionKey)))
  }

  return { users, overrides, loading, error, refetch, updateRole, setOverride, clearOverride }
}
