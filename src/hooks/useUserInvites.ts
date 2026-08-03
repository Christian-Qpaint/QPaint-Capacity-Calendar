import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/apiClient'
import type { Role, UserInvite } from '@/types'

/** Owner-only: generate/list/revoke invite links — the Invites tab's data source. Own hook, same
 * reasoning as useUserAccounts (one owner-only screen, not worth the app-wide DataContext). */
export function useUserInvites() {
  const [invites, setInvites] = useState<UserInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setInvites(await api.get<UserInvite[]>('/api/user-invites'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invites')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function createInvite(email: string, role: Role) {
    const saved = await api.post<UserInvite>('/api/user-invites', { email, role })
    setInvites((prev) => [saved, ...prev])
    return saved
  }

  async function revokeInvite(id: string) {
    await api.delete(`/api/user-invites?id=${id}`)
    setInvites((prev) => prev.filter((i) => i.id !== id))
  }

  return { invites, loading, error, refetch, createInvite, revokeInvite }
}
