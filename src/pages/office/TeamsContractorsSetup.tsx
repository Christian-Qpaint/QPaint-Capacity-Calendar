import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermissions } from '@/context/PermissionsContext'
import { QPaintTeamsTab } from './setup/QPaintTeamsTab'
import { ContractorsTab } from './setup/ContractorsTab'
import { WorkersTab } from './setup/WorkersTab'
import { UsersPermissionsTab } from './setup/UsersPermissionsTab'
import { InvitesTab } from './setup/InvitesTab'

export function TeamsContractorsSetup() {
  const { hasPermission } = usePermissions()
  const [searchParams] = useSearchParams()
  const canManageUsers = hasPermission('settings.manage_users')
  const defaultTab = searchParams.get('tab') === 'users' && canManageUsers ? 'users' : 'qpaint'

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-medium">Teams & Contractors Setup</h1>
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="qpaint">QPaint Teams</TabsTrigger>
          <TabsTrigger value="contractors">Contractors</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
          {canManageUsers && <TabsTrigger value="users">Users & Permissions</TabsTrigger>}
          {canManageUsers && <TabsTrigger value="invites">Invites</TabsTrigger>}
        </TabsList>
        <TabsContent value="qpaint" className="pt-4">
          <QPaintTeamsTab />
        </TabsContent>
        <TabsContent value="contractors" className="pt-4">
          <ContractorsTab />
        </TabsContent>
        <TabsContent value="workers" className="pt-4">
          <WorkersTab />
        </TabsContent>
        {canManageUsers && (
          <TabsContent value="users" className="pt-4">
            <UsersPermissionsTab />
          </TabsContent>
        )}
        {canManageUsers && (
          <TabsContent value="invites" className="pt-4">
            <InvitesTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
