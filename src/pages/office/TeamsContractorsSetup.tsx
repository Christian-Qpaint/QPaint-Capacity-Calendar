import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QPaintTeamsTab } from './setup/QPaintTeamsTab'
import { ContractorsTab } from './setup/ContractorsTab'
import { WorkersTab } from './setup/WorkersTab'

export function TeamsContractorsSetup() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-medium">Teams & Contractors Setup</h1>
      <Tabs defaultValue="qpaint">
        <TabsList>
          <TabsTrigger value="qpaint">QPaint Teams</TabsTrigger>
          <TabsTrigger value="contractors">Contractors</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
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
      </Tabs>
    </div>
  )
}
