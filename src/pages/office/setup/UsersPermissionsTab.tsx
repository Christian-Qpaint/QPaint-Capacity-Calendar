import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { RotateCcw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUserAccounts } from '@/hooks/useUserAccounts'
import { PERMISSION_CATALOG, PERMISSION_PAGES } from '@/lib/permissionCatalog'
import { ROLE_LABELS, type Role } from '@/types'
import { cn } from '@/lib/utils'

/** Owner-only: a full checklist of every permission in PERMISSION_CATALOG, per user — this is
 * what lets two users with the same role diverge (e.g. one salesperson gets full Marketing
 * access, another view-only with imports revoked). A checked box with no "Reset" button next to
 * it means the user is at that permission's role default, not an explicit grant. */
export function UsersPermissionsTab() {
  const { users, overrides, loading, error, updateRole, setOverride, clearOverride } = useUserAccounts()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(searchParams.get('user'))

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => u.name.toLowerCase().includes(q))
  }, [users, search])

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? filteredUsers[0] ?? null

  const userOverrides = useMemo(
    () => (selectedUser ? overrides.filter((o) => o.userId === selectedUser.id) : []),
    [overrides, selectedUser],
  )

  function overrideFor(key: string) {
    return userOverrides.find((o) => o.permissionKey === key)
  }

  async function handleToggle(key: string, next: boolean) {
    if (!selectedUser) return
    try {
      await setOverride(selectedUser.id, key, next)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update permission')
    }
  }

  async function handleReset(key: string) {
    if (!selectedUser) return
    try {
      await clearOverride(selectedUser.id, key)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset permission')
    }
  }

  async function handleRoleChange(role: Role) {
    if (!selectedUser) return
    try {
      await updateRole(selectedUser.id, role)
      toast.success(`Role updated to ${ROLE_LABELS[role]}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update role')
    }
  }

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading users…</p>
  if (error) return <p className="p-4 text-sm text-danger">Couldn't load users: {error}</p>

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="gap-2 p-3">
        <Input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-1" />
        <div className="max-h-[70vh] space-y-1 overflow-y-auto">
          {filteredUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelectedUserId(u.id)}
              className={cn(
                'flex w-full flex-col rounded-md px-2.5 py-1.5 text-left text-sm transition',
                selectedUser?.id === u.id ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted',
              )}
            >
              <span className="font-medium">{u.name}</span>
              <span className="text-xs text-muted-foreground">{ROLE_LABELS[u.role]}</span>
            </button>
          ))}
          {filteredUsers.length === 0 && <p className="p-2 text-center text-sm text-muted-foreground">No users found.</p>}
        </div>
      </Card>

      {selectedUser ? (
        <div className="space-y-4">
          <Card className="gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{selectedUser.name}</p>
                <p className="text-xs text-muted-foreground">Role sets every permission's default below — overrides take priority over it.</p>
              </div>
              <Select value={selectedUser.role} onValueChange={(v) => v && handleRoleChange(v as Role)}>
                <SelectTrigger size="sm" className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                    <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>

          {PERMISSION_PAGES.map((page) => (
            <Card key={page} className="gap-2 p-4">
              <h3 className="text-sm font-medium">{page}</h3>
              <div className="divide-y divide-border">
                {PERMISSION_CATALOG.filter((p) => p.page === page).map((perm) => {
                  const override = overrideFor(perm.key)
                  const effective = override ? override.granted : perm.defaultForRole(selectedUser.role)
                  return (
                    <div key={perm.key} className="flex items-center justify-between gap-3 py-2">
                      <div className="flex items-start gap-2.5">
                        <Checkbox checked={effective} onCheckedChange={(v) => handleToggle(perm.key, !!v)} className="mt-0.5" />
                        <div>
                          <p className="text-sm">{perm.label}</p>
                          <p className="text-xs text-muted-foreground">{perm.description}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {override ? (
                          <>
                            <span className={cn('text-xs font-medium', override.granted ? 'text-success' : 'text-danger')}>
                              {override.granted ? 'Granted' : 'Denied'}
                            </span>
                            <Button variant="ghost" size="icon-sm" onClick={() => handleReset(perm.key)} aria-label="Reset to default">
                              <RotateCcw className="size-3.5" />
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Default</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Select a user to manage their permissions.</p>
      )}
    </div>
  )
}
