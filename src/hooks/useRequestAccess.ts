import { api } from '@/lib/apiClient'

/** Notifies every Owner that the current user wants a permission they don't have — the backing
 * action behind every "Request Access" button, whether it's shown on a blocked page or a disabled
 * feature button. */
export function useRequestAccess() {
  return async function requestAccess(permissionKey: string) {
    await api.post('/api/request-access', { permissionKey })
  }
}
