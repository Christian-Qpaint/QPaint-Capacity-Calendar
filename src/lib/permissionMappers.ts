// snake_case DB rows <-> camelCase app entities for the permissions/notifications system — kept
// separate from supabaseMappers.ts for the same reason marketingMappers.ts is: these are fetched
// by their own dedicated hooks, not the app-wide DataContext.

import type { AppNotification, UserPermissionOverride } from '@/types'

export function mapUserPermissionOverride(r: any): UserPermissionOverride {
  return {
    id: r.id,
    userId: r.user_id,
    permissionKey: r.permission_key,
    granted: r.granted,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  }
}

export function mapNotification(r: any): AppNotification {
  return {
    id: r.id,
    recipientId: r.recipient_id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    read: r.read,
    createdAt: r.created_at,
    createdBy: r.created_by,
  }
}
