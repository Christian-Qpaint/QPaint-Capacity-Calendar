import type { ComponentType } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChevronDown, Gauge, Handshake, CalendarRange, Landmark, Megaphone, Settings as SettingsIcon, TrendingUp, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AccountMenu } from '@/components/AccountMenu'
import { NotificationBell } from '@/components/NotificationBell'
import { ImportProgressIndicator } from '@/components/ImportProgressIndicator'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { usePermissions } from '@/context/PermissionsContext'

const NAV_LINK_CLASSES = 'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors'
const NAV_LINK_ACTIVE = 'bg-secondary text-secondary-foreground'
const NAV_LINK_INACTIVE = 'text-muted-foreground hover:text-foreground'

// iconColor is a full static class string (not built from a variable) — Tailwind's build-time
// scanner can't see dynamically-interpolated class names, so each one has to appear literally
// somewhere for it to end up in the generated CSS.
const NAV_ITEMS: { to: string; label: string; permissionKey: string; icon: ComponentType<{ className?: string }>; iconColor: string }[] = [
  { to: '/sales', label: 'Sales', permissionKey: 'sales.view_availability', icon: TrendingUp, iconColor: 'text-blue-600 dark:text-blue-400' },
  { to: '/deals', label: 'Deals', permissionKey: 'crm.view', icon: Handshake, iconColor: 'text-amber-600 dark:text-amber-400' },
  { to: '/jobs', label: 'Won', permissionKey: 'jobs.view', icon: Trophy, iconColor: 'text-yellow-500 dark:text-yellow-400' },
  { to: '/calendar', label: 'Scheduler', permissionKey: 'scheduler.view', icon: CalendarRange, iconColor: 'text-cyan-600 dark:text-cyan-400' },
  { to: '/capacity', label: 'Production', permissionKey: 'production.view', icon: Gauge, iconColor: 'text-indigo-600 dark:text-indigo-400' },
  { to: '/finance', label: 'Finance', permissionKey: 'finance.view', icon: Landmark, iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { to: '/setup', label: 'Settings', permissionKey: 'settings.view', icon: SettingsIcon, iconColor: 'text-slate-500 dark:text-slate-400' },
]

// Marketing is a dropdown (Marketing dashboard vs Ads Management) rather than a flat NAV_ITEMS
// entry, since the two pages have different default-role visibility (marketing.view also defaults
// to the 'marketing' role, marketing.ads_management is owner-only) — the dropdown collapses to a
// single plain link automatically below when only one sub-item is visible to the current user.
const MARKETING_ITEMS = [
  { to: '/marketing', label: 'Marketing', permissionKey: 'marketing.view' },
  { to: '/marketing/ads-management', label: 'Ads Management', permissionKey: 'marketing.ads_management' },
]
const MARKETING_ICON_COLOR = 'text-fuchsia-600 dark:text-fuchsia-400'

export function OfficeLayout() {
  const { hasPermission } = usePermissions()
  const location = useLocation()
  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(item.permissionKey))
  const visibleMarketingItems = MARKETING_ITEMS.filter((item) => hasPermission(item.permissionKey))
  const marketingActive = location.pathname.startsWith('/marketing')

  return (
    // A fixed-to-viewport flex column with `main` as the one scrollable region (instead of the
    // whole document scrolling) — behaviorally identical for every page that just needs to scroll
    // normally, but lets a page like the Scheduler size its own content to exactly fill the
    // remaining height (via h-full + flex-1, see ResourceCalendar.tsx) so its internal calendar
    // grid is the only thing that ever scrolls, instead of both it and the page scrolling at once.
    <div className="flex h-svh flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card print:hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-tight">QPaint OS</span>
            <nav className="flex items-center gap-1">
              {visibleMarketingItems.length === 1 && (
                <NavLink
                  to={visibleMarketingItems[0].to}
                  className={({ isActive }) => cn(NAV_LINK_CLASSES, isActive ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE)}
                >
                  <Megaphone className={cn('size-4', MARKETING_ICON_COLOR)} />
                  {visibleMarketingItems[0].label}
                </NavLink>
              )}
              {visibleMarketingItems.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button type="button" className={cn(NAV_LINK_CLASSES, marketingActive ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE)}>
                        <Megaphone className={cn('size-4', MARKETING_ICON_COLOR)} />
                        Marketing
                        <ChevronDown className="size-3.5 opacity-60" />
                      </button>
                    }
                  />
                  <DropdownMenuContent align="start">
                    {visibleMarketingItems.map((item) => (
                      <DropdownMenuItem
                        key={item.to}
                        render={
                          <NavLink
                            to={item.to}
                            className={({ isActive }) => cn('cursor-pointer', isActive && 'bg-accent text-accent-foreground')}
                          >
                            {item.label}
                          </NavLink>
                        }
                      />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => cn(NAV_LINK_CLASSES, isActive ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE)}
                >
                  <item.icon className={cn('size-4', item.iconColor)} />
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
      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
