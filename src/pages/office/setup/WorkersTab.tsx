import { useState } from 'react'
import { useData } from '@/context/DataContext'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { WorkerDrawer } from './drawers/WorkerDrawer'
import { Plus } from 'lucide-react'
import type { Worker } from '@/types'

export function WorkersTab() {
  const { workers, contractors, teams, teamMemberships } = useData()
  const [selected, setSelected] = useState<Worker | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Every internal or contractor individual who could work on a QPaint site.</p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> Add Worker
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Employer</TableHead>
              <TableHead>Crew / Team</TableHead>
              <TableHead>White Card</TableHead>
              <TableHead>QBuild Induction</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No workers yet — add one to get started.
                </TableCell>
              </TableRow>
            )}
            {workers.map((w) => {
              const employer = w.workerType === 'Internal' ? 'QPaint' : contractors.find((c) => c.id === w.contractorId)?.name ?? '—'
              const coreMembership = teamMemberships.find((tm) => tm.workerId === w.id && tm.membershipType === 'Core')
              const crew = coreMembership ? teams.find((t) => t.id === coreMembership.teamId)?.name : undefined
              return (
                <TableRow key={w.id} className="cursor-pointer" onClick={() => setSelected(w)}>
                  <TableCell className="font-medium">{w.firstName} {w.lastName}</TableCell>
                  <TableCell>{w.position}</TableCell>
                  <TableCell className="text-muted-foreground">{employer}</TableCell>
                  <TableCell className="text-muted-foreground">{crew ?? '—'}</TableCell>
                  <TableCell>{w.whiteCardNumber || '—'}</TableCell>
                  <TableCell>
                    {w.qbuildInductionDone ? (w.qbuildInductionVerified ? 'Verified' : 'Done, unverified') : 'Not done'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <WorkerDrawer open={!!selected} onOpenChange={(open) => !open && setSelected(null)} worker={selected} />
      <WorkerDrawer open={creating} onOpenChange={setCreating} worker={null} />
    </div>
  )
}
