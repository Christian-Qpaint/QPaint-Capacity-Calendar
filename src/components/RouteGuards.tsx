import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, useCurrentUser } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { canAccessUpdateProgress, isOfficeRole } from '@/lib/permissions'

/** Gates every authenticated route: redirects to /login with no session, shows a loading state
 * while the session/profile/data resolve, and only renders children once everything is ready. */
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
  return <Outlet />
}

/** Office screens (Capacity Board, Jobs List, Job/Phase Scheduling, Calendar, Setup) carry
 * financial data — blocked for Field roles even via direct URL, not just hidden from nav. */
export function RequireOfficeRole() {
  const currentUser = useCurrentUser()
  if (!isOfficeRole(currentUser.role)) return <Navigate to="/log-hours" replace />
  return <Outlet />
}

/** Update Progress: Foreperson-only for site entry, plus the office-fallback pattern — never
 * Painter/Crew Member, "not shown at all, not just disabled." */
export function RequireUpdateProgressAccess() {
  const currentUser = useCurrentUser()
  if (!canAccessUpdateProgress(currentUser.role)) return <Navigate to="/log-hours" replace />
  return <Outlet />
}
