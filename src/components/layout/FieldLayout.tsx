import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { AccountMenu } from '@/components/AccountMenu'
import { useCurrentUser } from '@/context/AuthContext'
import { canAccessUpdateProgress } from '@/lib/permissions'

export function FieldLayout() {
  const currentUser = useCurrentUser()

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-lg flex-col gap-3 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold tracking-tight">QPaint OS</span>
            <AccountMenu />
          </div>
          <nav className="flex items-center gap-1">
            <NavLink
              to="/log-hours"
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              Log Hours
            </NavLink>
            {canAccessUpdateProgress(currentUser.role) && (
              <NavLink
                to="/update-progress"
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                Update Progress
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
