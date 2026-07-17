import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { AccountMenu } from '@/components/AccountMenu'

const NAV_ITEMS = [
  { to: '/capacity', label: 'Capacity Board' },
  { to: '/jobs', label: 'Jobs List' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/setup', label: 'Setup' },
]

export function OfficeLayout() {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-tight">QPaint OS</span>
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
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
