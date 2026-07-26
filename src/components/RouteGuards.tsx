import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { PermissionsProvider, usePermissions } from '@/context/PermissionsContext'
import { ImportProgressProvider } from '@/context/ImportProgressContext'
import { AccessDeniedPage } from '@/components/AccessDeniedPage'

/** Gates every authenticated route: redirects to /login with no session, shows a loading state
 * while the session/profile/data resolve, and only renders children once everything is ready.
 * Also mounts PermissionsProvider here — every route below this point can call usePermissions(). */
export function RequireAuth() {
  const { session, currentUser, loading: authLoading } = useAuth()
  const { loading: dataLoading, error: dataError } = useData()

  if (authLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  if (!currentUser) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Setting up your account…
      </div>
    )
  }
  if (dataError) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-danger">
        Couldn't load data: {dataError}
      </div>
    )
  }
  if (dataLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading data…
      </div>
    )
  }
  return (
    <PermissionsProvider>
      <ImportProgressProvider>
        <Outlet />
      </ImportProgressProvider>
    </PermissionsProvider>
  )
}

/** Generic permission-gated route — replaces the old per-role guards (RequireOfficeRole etc.) so
 * every page's access is driven by the PERMISSION_CATALOG (role default + per-user override)
 * instead of a hardcoded role check. Shows a proper blocked-page state with "Request Access"
 * rather than a silent redirect, since a redirect leaves nowhere for that button to live. */
export function RequirePermission({ permissionKey }: { permissionKey: string }) {
  const { hasPermission, loading } = usePermissions()
  if (loading) return null
  if (!hasPermission(permissionKey)) return <AccessDeniedPage permissionKey={permissionKey} />
  return <Outlet />
}
