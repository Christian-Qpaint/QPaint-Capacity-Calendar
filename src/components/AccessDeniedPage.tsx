import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { findPermission } from '@/lib/permissionCatalog'
import { useRequestAccess } from '@/hooks/useRequestAccess'

/** Full-page blocked state for a route the current user can't access — shown instead of a silent
 * redirect so "Request Access" has somewhere to live. Also fires a toast on mount so the denial is
 * noticed immediately, not just on scroll. */
export function AccessDeniedPage({ permissionKey }: { permissionKey: string }) {
  const requestAccess = useRequestAccess()
  const [requested, setRequested] = useState(false)
  const [sending, setSending] = useState(false)
  const def = findPermission(permissionKey)

  useEffect(() => {
    toast(`You need access to ${def?.label ?? 'this page'}`, { description: def?.description })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionKey])

  async function handleRequest() {
    setSending(true)
    try {
      await requestAccess(permissionKey)
      setRequested(true)
      toast.success('Access request sent to the Owner')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send request')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock className="size-6" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">You don't have access to this page</p>
        {def && <p className="max-w-sm text-sm text-muted-foreground">{def.description}</p>}
      </div>
      <Button onClick={handleRequest} disabled={sending || requested}>
        {requested ? 'Request sent' : sending ? 'Sending…' : 'Request Access'}
      </Button>
    </div>
  )
}
