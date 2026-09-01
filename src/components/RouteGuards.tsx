import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { PermissionsProvider, usePermissions } from '@/context/PermissionsContext'
import { ImportProgressProvider } from '@/context/ImportProgressContext'
import { CrmDataProvider } from '@/context/CrmDataContext'
import { MarketingDataProvider } from '@/context/MarketingDataContext'
import { AccessDeniedPage } from '@/components/AccessDeniedPage'
import { PageLoadingSkeleton } from '@/components/PageLoadingSkeleton'

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
    return <PageLoadingSkeleton />
  }
  // CrmDataProvider/MarketingDataProvider mounted here — once per authenticated session, not
  // per-route — so navigating to /deals or /marketing and back reuses whatever's already cached
  // instead of refetching from scratch every time (each provider still fetches lazily on its own
  // first mount here, and refreshes hourly in the background; see their own files for why). Both
  // need to sit inside ImportProgressProvider, since MarketingDataProvider watches it for
  // "Sync from Pipedrive" completions.
  return (
    <PermissionsProvider>
      <ImportProgressProvider>
        <CrmDataProvider>
          <MarketingDataProvider>
            <Outlet />
          </MarketingDataProvider>
        </CrmDataProvider>
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
