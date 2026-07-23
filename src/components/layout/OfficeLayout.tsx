import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { AccountMenu } from '@/components/AccountMenu'
import { useCurrentUser } from '@/context/AuthContext'
import { canAccessMarketing, isOfficeRole } from '@/lib/permissions'
import type { Role } from '@/types'

const NAV_ITEMS: { to: string; label: string; visible: (role: Role) => boolean }[] = [
  { to: '/jobs', label: 'Deals', visible: isOfficeRole },
  { to: '/calendar', label: 'Scheduler', visible: isOfficeRole },
  { to: '/capacity', label: 'Production', visible: isOfficeRole },
  { to: '/marketing', label: 'Marketing', visible: canAccessMarketing },
  { to: '/setup', label: 'Settings', visible: isOfficeRole },
]

export function OfficeLayout() {
  const currentUser = useCurrentUser()
  const visibleItems = NAV_ITEMS.filter((item) => item.visible(currentUser.role))

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-3">
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
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
