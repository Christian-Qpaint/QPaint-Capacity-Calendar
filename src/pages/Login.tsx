import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function Login() {
  const { session, loading, signInWithPassword } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) return <Navigate to="/" replace />

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signInWithPassword(email, password)
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

        <form className="space-y-3" onSubmit={handleSignIn}>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          New accounts are by invite only — ask an owner for an invite link.
        </p>
      </Card>
    </div>
  )
}
