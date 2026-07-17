import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { Role, User } from '@/types'

interface ProfileRow {
  id: string
  name: string
  role: Role
  team_id: string | null
  worker_id: string | null
}

function mapProfile(row: ProfileRow): User {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    teamId: row.team_id ?? undefined,
    workerId: row.worker_id ?? undefined,
  }
}

interface AuthContextValue {
  session: Session | null
  /** The signed-in user's profile row (role, team, etc.) — null until loaded, even if session exists. */
  currentUser: User | null
  loading: boolean
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) {
      console.error('Failed to load profile', error)
      setCurrentUser(null)
      return
    }
    setCurrentUser(mapProfile(data as ProfileRow))
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadProfile(data.session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) loadProfile(newSession.user.id)
      else setCurrentUser(null)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signUp(email: string, password: string, name: string) {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
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
