import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Role, User } from '@/types'

/** Minimal, Supabase-Session-shaped stand-in — kept to `{ user: { id } }` since that's the only
 * shape any consumer (DataContext.tsx) actually reads off it. `currentUser` carries everything else. */
export interface AppSession {
  user: { id: string }
}

interface AuthUserResponse {
  id: string
  name: string
  role: Role
  teamId: string | null
  workerId: string | null
}

function toSession(user: AuthUserResponse): AppSession {
  return { user: { id: user.id } }
}

function toCurrentUser(user: AuthUserResponse): User {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    teamId: user.teamId ?? undefined,
    workerId: user.workerId ?? undefined,
  }
}

interface AuthContextValue {
  session: AppSession | null
  /** The signed-in user's profile row (role, team, etc.) — null until loaded, even if session exists. */
  currentUser: User | null
  loading: boolean
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function postJson(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data: { user?: AuthUserResponse; error?: string } = await res.json()
  return { ok: res.ok, data }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AppSession | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((res) => res.json())
      .then((data: { user: AuthUserResponse | null }) => {
        if (data.user) {
          setSession(toSession(data.user))
          setCurrentUser(toCurrentUser(data.user))
        }
      })
      .catch(() => {
        // No session cookie, or the request failed — either way, stay signed out rather than block the app.
      })
      .finally(() => setLoading(false))
  }, [])

  async function signInWithPassword(email: string, password: string) {
    const { ok, data } = await postJson('/api/auth/login', { email, password })
    if (!ok || !data.user) return { error: data.error ?? 'Failed to sign in' }
    setSession(toSession(data.user))
    setCurrentUser(toCurrentUser(data.user))
    return { error: null }
  }

  async function signUp(email: string, password: string, name: string) {
    const { ok, data } = await postJson('/api/auth/signup', { email, password, name })
    if (!ok || !data.user) return { error: data.error ?? 'Failed to sign up' }
    setSession(toSession(data.user))
    setCurrentUser(toCurrentUser(data.user))
    return { error: null }
  }

  async function signOut() {
    await postJson('/api/auth/logout')
    setSession(null)
    setCurrentUser(null)
  }

  return (
    <AuthContext.Provider value={{ session, currentUser, loading, signInWithPassword, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

/** For use only within routes already behind <RequireAuth> — asserts the profile is loaded. */
export function useCurrentUser(): User {
  const { currentUser } = useAuth()
  if (!currentUser) throw new Error('useCurrentUser called before the profile finished loading')
  return currentUser
}
