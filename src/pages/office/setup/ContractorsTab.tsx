import { useState } from 'react'
import { useData } from '@/context/DataContext'
import { useCurrentUser } from '@/context/AuthContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { contractorDirectoryTier } from '@/lib/permissions'
import { safetyTarget, formatCurrency } from '@/lib/formulas'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CompliancePill } from '@/components/StatusBadges'
import { ContractorDrawer } from './drawers/ContractorDrawer'
import { Plus } from 'lucide-react'
import type { Contractor } from '@/types'

export function ContractorsTab() {
  const { contractors, teams } = useData()
  const currentUser = useCurrentUser()
  const da = useDataAccess()
  const tier = contractorDirectoryTier(currentUser.role)

  const [selected, setSelected] = useState<Contractor | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Click a row for crews, workers, and credentials.</p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> Add Contractor
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Reported capacity</TableHead>
              <TableHead>Safety target</TableHead>
              <TableHead>Crews</TableHead>
              {tier !== 'none' && <TableHead>Compliance</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contractors.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No contractors yet — add one to get started.
                </TableCell>
              </TableRow>
            )}
            {contractors.map((c) => {
              const crewCount = teams.filter((t) => t.contractorId === c.id).length
              const compliance = da.getContractorCompliance(c.id)
              return (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{formatCurrency(c.reportedMonthlyCapacity)}/mo</TableCell>
                  <TableCell className="text-muted-foreground">{formatCurrency(safetyTarget(c.reportedMonthlyCapacity))}/mo</TableCell>
                  <TableCell>{crewCount}</TableCell>
                  {tier !== 'none' && (
                    <TableCell>
                      <CompliancePill flag={compliance.flag} />
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <ContractorDrawer open={!!selected} onOpenChange={(open) => !open && setSelected(null)} contractor={selected} />
      <ContractorDrawer open={creating} onOpenChange={setCreating} contractor={null} />
    </div>
  )
}
