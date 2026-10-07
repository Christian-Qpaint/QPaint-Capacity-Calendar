import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UsersPermissionsTab } from './setup/UsersPermissionsTab'
import { InvitesTab } from './setup/InvitesTab'

/** Account administration only — who can log in and what they can see. Crews, contractors and
 * people live on the Workforce page. Reached only with settings.manage_users (owner by default). */
export function Settings() {
  const [searchParams] = useSearchParams()
  const defaultTab = searchParams.get('tab') === 'invites' ? 'invites' : 'users'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium">Settings</h1>
        <p className="text-sm text-muted-foreground">Who can log in to QPaint OS, and what each person can see and do.</p>
      </div>
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="users">Users & Permissions</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="pt-4">
          <UsersPermissionsTab />
        </TabsContent>
        <TabsContent value="invites" className="pt-4">
          <InvitesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
