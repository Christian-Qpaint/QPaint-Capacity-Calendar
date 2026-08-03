import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, Send, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useUserInvites } from '@/hooks/useUserInvites'
import { ROLE_LABELS, type Role } from '@/types'

function inviteLink(token: string): string {
  return `${window.location.origin}/accept-invite?token=${token}`
}

function inviteStatus(usedAt: string | null, expiresAt: string): { label: string; className: string } {
  if (usedAt) return { label: 'Used', className: 'text-muted-foreground' }
  if (new Date(expiresAt).getTime() < Date.now()) return { label: 'Expired', className: 'text-danger' }
  return { label: 'Pending', className: 'text-success' }
}

/** Owner-only: the only way a new account gets created now that open self-signup is gone. No
 * email provider is wired up — generating an invite here just produces a link the owner copies
 * and sends themselves (Slack, email client, whatever). */
export function InvitesTab() {
  const { invites, loading, error, createInvite, revokeInvite } = useUserInvites()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('painter_crew_member')
  const [creating, setCreating] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; email: string } | null>(null)

  async function handleCreate() {
    if (!email.trim()) return
    setCreating(true)
    try {
      const saved = await createInvite(email.trim().toLowerCase(), role)
      await navigator.clipboard.writeText(inviteLink(saved.token))
      toast.success('Invite created — link copied to clipboard')
      setEmail('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create invite')
    } finally {
      setCreating(false)
    }
  }

  async function handleCopy(token: string) {
    await navigator.clipboard.writeText(inviteLink(token))
    toast.success('Link copied to clipboard')
  }

  async function handleRevoke() {
    if (!revokeTarget) return
    try {
      await revokeInvite(revokeTarget.id)
      toast.success('Invite revoked')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to revoke invite')
    } finally {
      setRevokeTarget(null)
    }
  }

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading invites…</p>
  if (error) return <p className="p-4 text-sm text-danger">Couldn't load invites: {error}</p>

  return (
    <div className="space-y-4">
      <Card className="gap-3 p-4">
        <h3 className="text-sm font-medium">Invite someone new</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label>Email</Label>
            <Input type="email" placeholder="name@qpaint.com.au" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => v && setRole(v as Role)}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleCreate} disabled={creating || !email.trim()}>
            <Send /> {creating ? 'Creating…' : 'Generate invite link'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Copies the link to your clipboard automatically — send it to them yourself (no email is sent). Links expire after 7 days.
        </p>
      </Card>

      <Card className="gap-2 p-4">
        <h3 className="text-sm font-medium">Invites</h3>
        {invites.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No invites yet.</p>}
        <div className="divide-y divide-border">
          {invites.map((invite) => {
            const status = inviteStatus(invite.usedAt, invite.expiresAt)
            return (
              <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="text-sm font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABELS[invite.role]} · <span className={status.className}>{status.label}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {status.label === 'Pending' && (
                    <Button variant="outline" size="sm" onClick={() => handleCopy(invite.token)}>
                      <Copy className="size-3.5" /> Copy link
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-danger hover:bg-danger-bg hover:text-danger"
                    onClick={() => setRevokeTarget({ id: invite.id, email: invite.email })}
                    aria-label="Revoke invite"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title={`Revoke invite for "${revokeTarget?.email}"?`}
        description="They won't be able to use this link to create an account anymore. This can't be undone."
        confirmLabel="Revoke"
        onConfirm={handleRevoke}
      />
    </div>
  )
}
