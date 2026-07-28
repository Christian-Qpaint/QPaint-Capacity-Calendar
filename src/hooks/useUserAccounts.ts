import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/apiClient'
import type { Role, User, UserPermissionOverride } from '@/types'

/** Owner-only admin data: every user account plus every permission override, for the Users &
 * Permissions screen. Kept as its own hook (not the app-wide DataContext) since it's only ever
 * used by one owner-only page — same reasoning as useMarketingData. */
export function useUserAccounts() {
  const [users, setUsers] = useState<User[]>([])
  const [overrides, setOverrides] = useState<UserPermissionOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ users: User[]; overrides: UserPermissionOverride[] }>('/api/user-accounts')
      setUsers(data.users)
      setOverrides(data.overrides)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function updateRole(userId: string, role: Role) {
    await api.patch(`/api/user-accounts?userId=${userId}&action=role`, { role })
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
  }

  async function setOverride(userId: string, permissionKey: string, granted: boolean) {
    const saved = await api.post<UserPermissionOverride>('/api/user-accounts?action=override', { userId, permissionKey, granted })
    setOverrides((prev) => [...prev.filter((o) => !(o.userId === userId && o.permissionKey === permissionKey)), saved])
  }

  async function clearOverride(userId: string, permissionKey: string) {
    await api.delete(`/api/user-accounts?userId=${userId}&permissionKey=${permissionKey}`)
    setOverrides((prev) => prev.filter((o) => !(o.userId === userId && o.permissionKey === permissionKey)))
  }

  return { users, overrides, loading, error, refetch, updateRole, setOverride, clearOverride }
}
