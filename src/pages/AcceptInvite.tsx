import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/apiClient'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ROLE_LABELS, type Role } from '@/types'

interface InviteInfo {
  email: string
  role: Role
}

/** Public page (no session required) — the only place a new account can be created now that open
 * self-signup is gone. The token comes from a link an owner generated via the Invites screen;
 * this just validates it and lets the invited person pick their own name + password. */
export function AcceptInvite() {
  const { session, loading: authLoading, acceptInvite } = useAuth()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [checking, setChecking] = useState(true)
  const [invalidReason, setInvalidReason] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setInvalidReason('No invite token in this link.')
      setChecking(false)
      return
    }
    api
      .get<InviteInfo>(`/api/accept-invite?token=${encodeURIComponent(token)}`)
      .then((data) => setInvite(data))
      .catch((e) => setInvalidReason(e instanceof Error ? e.message : 'This invite link is invalid.'))
      .finally(() => setChecking(false))
  }, [token])

  if (!authLoading && session) return <Navigate to="/" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    const { error } = await acceptInvite(token, name, password)
    setSubmitting(false)
    if (error) setError(error)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm gap-4 p-6">
        <div>
          <p className="text-base font-medium">QPaint OS</p>
          <p className="text-sm text-muted-foreground">Scheduling &amp; Capacity Management</p>
        </div>

        {checking && <p className="text-sm text-muted-foreground">Checking your invite…</p>}

        {!checking && invalidReason && <p className="text-sm text-danger">{invalidReason}</p>}

        {!checking && invite && (
          <form className="space-y-3" onSubmit={handleSubmit}>
            <p className="text-sm text-muted-foreground">
              Setting up <span className="font-medium text-foreground">{invite.email}</span> as{' '}
              <span className="font-medium text-foreground">{ROLE_LABELS[invite.role]}</span>.
            </p>
            <div className="space-y-1.5">
              <Label>Your name</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm password</Label>
              <Input type="password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
