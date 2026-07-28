import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/apiClient'
import type { AppNotification } from '@/types'

const POLL_INTERVAL_MS = 30_000

/** The current user's own notifications — polled rather than realtime (no realtime infra set up
 * yet), which is plenty responsive for something checked via a header bell icon. */
export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const { notifications: rows } = await api.get<{ notifications: AppNotification[] }>('/api/notifications')
      setNotifications(rows)
    } catch (err) {
      console.error('Failed to load notifications', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch])

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    try {
      await api.patch('/api/notifications', { ids: [id] })
    } catch (err) {
      console.error('Failed to mark notification read', err)
    }
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length === 0) return
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    try {
      await api.patch('/api/notifications?all=true')
    } catch (err) {
      console.error('Failed to mark notifications read', err)
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return { notifications, unreadCount, loading, refetch, markRead, markAllRead }
}
