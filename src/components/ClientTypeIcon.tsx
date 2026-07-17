import { User, Building2, Landmark, Building } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClientType } from '@/types'

const CLIENT_TYPE_ICONS: Record<ClientType, typeof User> = {
  Individual: User,
  Company: Building2,
  Government: Landmark,
  'Body Corporate': Building,
}

export function ClientTypeIcon({ type, className }: { type: ClientType; className?: string }) {
  const Icon = CLIENT_TYPE_ICONS[type] ?? User
  return <Icon aria-hidden="true" className={cn('size-3.5 shrink-0 text-muted-foreground', className)} />
}
