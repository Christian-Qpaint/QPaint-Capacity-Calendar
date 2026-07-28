import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/lib/apiClient'
import { findPermission } from '@/lib/permissionCatalog'
import { useCurrentUser } from './AuthContext'

interface PermissionsContextValue {
  /** True if the current user can do `key` — an explicit override always wins over the
   * permission's role default. Unknown keys default to false (fail closed). */
  hasPermission: (key: string) => boolean
  loading: boolean
  refetch: () => Promise<void>
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null)

/** Loads the current user's own permission overrides once per session — mounted inside
 * <RequireAuth>, so useCurrentUser() is always available here. Kept separate from AuthContext so
 * a permission change (from the admin screen) can be refetched without re-running auth/profile
 * loading. */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser()
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const { overrides: rows } = await api.get<{ overrides: { permissionKey: string; granted: boolean }[] }>('/api/my-permission-overrides')
      const map: Record<string, boolean> = {}
      for (const row of rows) map[row.permissionKey] = row.granted
      setOverrides(map)
    } catch (err) {
      console.error('Failed to load permission overrides', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  function hasPermission(key: string): boolean {
    if (key in overrides) return overrides[key]
    const def = findPermission(key)
    return def ? def.defaultForRole(currentUser.role) : false
  }

  return <PermissionsContext.Provider value={{ hasPermission, loading, refetch }}>{children}</PermissionsContext.Provider>
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext)
  if (!ctx) throw new Error('usePermissions must be used within a PermissionsProvider')
  return ctx
}
