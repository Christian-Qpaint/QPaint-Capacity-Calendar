import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function Login() {
  const { session, loading, signInWithPassword, signUp } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
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

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    const { error } = await signUp(email, password, name)
    setSubmitting(false)
    if (error) setError(error)
    else setInfo('Account created. Check your email to confirm, then sign in.')
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm gap-4 p-6">
        <div>
          <p className="text-base font-medium">QPaint OS</p>
          <p className="text-sm text-muted-foreground">Scheduling &amp; Capacity Management</p>
        </div>

        <Tabs defaultValue="signin">
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="flex-1">Sign in</TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">Create account</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="pt-4">
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
          </TabsContent>

          <TabsContent value="signup" className="pt-4">
            <form className="space-y-3" onSubmit={handleSignUp}>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              {info && <p className="text-sm text-success">{info}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Creating account…' : 'Create account'}
              </Button>
              <p className="text-xs text-muted-foreground">
                New accounts start as Painter/Crew Member — an Owner or Ops Manager can promote your role afterwards.
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}
