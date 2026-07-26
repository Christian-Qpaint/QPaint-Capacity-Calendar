import { supabase } from '@/lib/supabaseClient'
import { findPermission } from '@/lib/permissionCatalog'
import { useCurrentUser } from '@/context/AuthContext'

/** Notifies every Owner that the current user wants a permission they don't have — the backing
 * action behind every "Request Access" button, whether it's shown on a blocked page or a disabled
 * feature button. */
export function useRequestAccess() {
  const currentUser = useCurrentUser()

  return async function requestAccess(permissionKey: string) {
    const def = findPermission(permissionKey)
    const { data: owners, error } = await supabase.from('profiles').select('id').eq('role', 'owner')
    if (error) throw new Error(error.message)

    const rows = (owners ?? [])
      .filter((o) => o.id !== currentUser.id)
      .map((o) => ({
        recipient_id: o.id,
        type: 'access_request',
        title: `${currentUser.name} requested access`,
        body: def ? `${def.label} (${def.page}) — ${def.description}` : `Permission: ${permissionKey}`,
        link: '/setup?tab=users',
        created_by: currentUser.id,
      }))

    if (rows.length === 0) return
    const { error: insertError } = await supabase.from('notifications').insert(rows)
    if (insertError) throw new Error(insertError.message)
  }
}
