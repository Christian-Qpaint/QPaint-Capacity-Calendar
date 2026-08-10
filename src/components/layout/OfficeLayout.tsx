import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { AccountMenu } from '@/components/AccountMenu'
import { NotificationBell } from '@/components/NotificationBell'
import { ImportProgressIndicator } from '@/components/ImportProgressIndicator'
import { usePermissions } from '@/context/PermissionsContext'

const NAV_ITEMS: { to: string; label: string; permissionKey: string }[] = [
  { to: '/deals', label: 'Deals', permissionKey: 'crm.view' },
  { to: '/jobs', label: 'Won', permissionKey: 'jobs.view' },
  { to: '/calendar', label: 'Scheduler', permissionKey: 'scheduler.view' },
  { to: '/sales', label: 'Sales', permissionKey: 'sales.view_availability' },
  { to: '/capacity', label: 'Production', permissionKey: 'production.view' },
  { to: '/marketing', label: 'Marketing', permissionKey: 'marketing.view' },
  { to: '/setup', label: 'Settings', permissionKey: 'settings.view' },
]

export function OfficeLayout() {
  const { hasPermission } = usePermissions()
  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(item.permissionKey))

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border bg-card print:hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-tight">QPaint OS</span>
            <nav className="flex items-center gap-1">
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ImportProgressIndicator />
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className="px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
