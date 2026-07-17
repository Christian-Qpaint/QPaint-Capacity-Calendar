import { useAuth, useCurrentUser } from '@/context/AuthContext'
import { ROLE_LABELS } from '@/types'
import { Button } from '@/components/ui/button'

export function AccountMenu() {
  const currentUser = useCurrentUser()
  const { signOut } = useAuth()

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">
        {currentUser.name} <span className="text-xs">— {ROLE_LABELS[currentUser.role]}</span>
      </span>
      <Button size="sm" variant="outline" onClick={() => signOut()}>
        Sign out
      </Button>
    </div>
  )
}
