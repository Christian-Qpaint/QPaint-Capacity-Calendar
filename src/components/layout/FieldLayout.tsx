import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Menu, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AccountMenu } from '@/components/AccountMenu'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useAuth, useCurrentUser } from '@/context/AuthContext'
import { usePermissions } from '@/context/PermissionsContext'
import { ROLE_LABELS } from '@/types'

export function FieldLayout() {
  const { hasPermission } = usePermissions()
  const currentUser = useCurrentUser()
  const { signOut } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const links = [
    { to: '/log-hours', label: 'Log Hours', allowed: hasPermission('field.log_hours') },
    { to: '/update-progress', label: 'Update Progress', allowed: hasPermission('field.update_progress') },
    { to: '/my-production', label: 'Production', allowed: hasPermission('field.view_production') },
  ].filter((l) => l.allowed)

  // Crew Leaders get a compact burger + left drawer instead of the crowded name/role/sign-out row.
  // Other Field roles keep the original header untouched.
  if (currentUser.role === 'team_leader_foreperson') {
    return (
      <div className="min-h-svh bg-background">
        <header className="sticky top-0 z-40 border-b border-border bg-card">
          <div className="mx-auto flex max-w-lg items-center gap-2 px-3 py-2">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
                <Menu />
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetHeader className="border-b border-border pb-4">
                  <SheetTitle className="text-base font-semibold tracking-tight">QPaint OS</SheetTitle>
                  <p className="text-sm font-medium">{currentUser.name}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[currentUser.role]}</p>
                </SheetHeader>
                <nav className="flex flex-col gap-1 px-3">
                  {links.map((l) => (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      onClick={() => setDrawerOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                          isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )
                      }
                    >
                      {l.label}
                    </NavLink>
                  ))}
                </nav>
                <SheetFooter className="border-t border-border">
                  <Button variant="outline" onClick={() => signOut()}>
                    <LogOut /> Sign out
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
            <span className="text-sm font-semibold tracking-tight">QPaint OS</span>
          </div>
        </header>
        <main className="mx-auto max-w-lg px-4 py-6">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-lg flex-col gap-3 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold tracking-tight">QPaint OS</span>
            <AccountMenu />
          </div>
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
