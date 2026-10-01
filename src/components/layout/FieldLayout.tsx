import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { AccountMenu } from '@/components/AccountMenu'
import { usePermissions } from '@/context/PermissionsContext'

export function FieldLayout() {
  const { hasPermission } = usePermissions()

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-lg flex-col gap-3 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold tracking-tight">QPaint OS</span>
            <AccountMenu />
          </div>
          <nav className="flex items-center gap-1">
            {hasPermission('field.log_hours') && (
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
            )}
            {hasPermission('field.update_progress') && (
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
            {hasPermission('field.view_production') && (
              <NavLink
                to="/my-production"
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                Production
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
