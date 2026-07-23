import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, useCurrentUser } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { canAccessMarketing, canAccessUpdateProgress, isOfficeRole } from '@/lib/permissions'

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
 * financial data — blocked for Field/Marketing-only roles even via direct URL, not just hidden
 * from nav. Redirects through "/" (RoleHome) rather than assuming Field is the only alternative,
 * now that a third category (Marketing-only) exists. */
export function RequireOfficeRole() {
  const currentUser = useCurrentUser()
  if (!isOfficeRole(currentUser.role)) return <Navigate to="/" replace />
  return <Outlet />
}

/** Marketing dashboard — Owner or a dedicated Marketing role only. Kept separate from
 * RequireOfficeRole since a pure Marketing-role user has no access to the other office screens,
 * and vice versa (Ops Manager/Scheduler-PM aren't automatically Marketing-role). */
export function RequireMarketingAccess() {
  const currentUser = useCurrentUser()
  if (!canAccessMarketing(currentUser.role)) return <Navigate to="/" replace />
  return <Outlet />
}

/** Update Progress: Foreperson-only for site entry, plus the office-fallback pattern — never
 * Painter/Crew Member, "not shown at all, not just disabled." */
export function RequireUpdateProgressAccess() {
  const currentUser = useCurrentUser()
  if (!canAccessUpdateProgress(currentUser.role)) return <Navigate to="/log-hours" replace />
  return <Outlet />
}
