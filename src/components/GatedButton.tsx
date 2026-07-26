import { useState, type ComponentType, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/context/PermissionsContext'
import { useRequestAccess } from '@/hooks/useRequestAccess'
import { findPermission } from '@/lib/permissionCatalog'

/** Gates one feature (usually a dialog-trigger button) behind a permission — e.g. Marketing's
 * Import button, so a "view only" user sees the same button everyone else does, but clicking it
 * shows a toast + "Request Access" instead of opening the import wizard. Renders `children()`
 * unchanged when allowed, so the real component (with its own state/dialog) only ever mounts for
 * users who can actually use it. */
export function GatedButton({
  permissionKey,
  label,
  icon: Icon,
  variant = 'outline',
  children,
}: {
  permissionKey: string
  label: string
  icon?: ComponentType<{ className?: string }>
  variant?: 'outline' | 'default' | 'secondary' | 'ghost' | 'destructive'
  children: () => ReactNode
}) {
  const { hasPermission } = usePermissions()
  if (hasPermission(permissionKey)) return <>{children()}</>
  return <GatedPlaceholderButton permissionKey={permissionKey} label={label} icon={Icon} variant={variant} />
}

function GatedPlaceholderButton({
  permissionKey,
  label,
  icon: Icon,
  variant,
}: {
  permissionKey: string
  label: string
  icon?: ComponentType<{ className?: string }>
  variant: 'outline' | 'default' | 'secondary' | 'ghost' | 'destructive'
}) {
  const requestAccess = useRequestAccess()
  const [requested, setRequested] = useState(false)
  const def = findPermission(permissionKey)

  function handleClick() {
    toast(`You need access to ${def?.label ?? label}`, {
      description: def?.description,
      action: requested
        ? undefined
        : {
            label: 'Request Access',
            onClick: async () => {
              try {
                await requestAccess(permissionKey)
                setRequested(true)
                toast.success('Access request sent to the Owner')
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Failed to send request')
              }
            },
          },
    })
  }

  return (
    <Button variant={variant} onClick={handleClick} className="opacity-60">
      {Icon && <Icon className="size-4" />}
      {label}
      <Lock className="size-3.5" />
    </Button>
  )
}
