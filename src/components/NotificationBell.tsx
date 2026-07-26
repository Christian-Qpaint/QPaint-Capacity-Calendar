import { useNavigate } from 'react-router-dom'
import { Bell, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useNotifications } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'
import type { AppNotification } from '@/types'

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()

  function handleSelect(n: AppNotification) {
    if (!n.read) markRead(n.id)
    if (n.link) navigate(n.link)
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" className="relative" aria-label="Notifications" />}>
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="h-6 px-1.5 text-xs">
              <Check className="size-3" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleSelect(n)}
              className={cn(
                'flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-muted',
                !n.read && 'bg-info-bg/40',
              )}
            >
              <span className="flex items-center gap-1.5 font-medium">
                {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-info" />}
                {n.title}
              </span>
              {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
              <span className="text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
