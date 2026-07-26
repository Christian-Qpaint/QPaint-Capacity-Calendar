import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { mapNotification } from '@/lib/permissionMappers'
import { useCurrentUser } from '@/context/AuthContext'
import type { AppNotification } from '@/types'

const POLL_INTERVAL_MS = 30_000

/** The current user's own notifications — polled rather than realtime (no realtime infra set up
 * yet), which is plenty responsive for something checked via a header bell icon. */
export function useNotifications() {
  const currentUser = useCurrentUser()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      console.error('Failed to load notifications', error)
      setLoading(false)
      return
    }
    setNotifications((data ?? []).map(mapNotification))
    setLoading(false)
  }, [currentUser.id])

  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch])

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
    if (error) console.error('Failed to mark notification read', error)
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length === 0) return
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    const { error } = await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
    if (error) console.error('Failed to mark notifications read', error)
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return { notifications, unreadCount, loading, refetch, markRead, markAllRead }
}
