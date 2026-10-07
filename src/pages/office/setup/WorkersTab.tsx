import { useState } from 'react'
import { useData } from '@/context/DataContext'
import { todayIso } from '@/lib/schedule'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { WorkerDrawer } from './drawers/WorkerDrawer'
import { Plus } from 'lucide-react'
import type { Worker } from '@/types'

/** Every dated licence/ticket on a worker's record, for the "Licences" column. */
function licenceSummary(w: Worker, today: string) {
  const dated: (string | undefined | null)[] = [w.driversLicenceExpiry, ...(w.otherTickets ?? []).map((t) => t.expiryDate)]
  const total = (w.driversLicenceNumber ? 1 : 0) + (w.otherTickets?.length ?? 0)
  const expired = dated.filter((d) => d && d < today).length
  return { total, expired }
}

export function WorkersTab() {
  const { workers, contractors, teams, teamMemberships } = useData()
  const [selected, setSelected] = useState<Worker | null>(null)
  const [creating, setCreating] = useState(false)
  const today = todayIso()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Every person who could work on a QPaint site — employees and contractor staff. Anyone not yet put on a crew shows as <strong>Floating</strong>.
        </p>
        <Button size="sm" className="shrink-0" onClick={() => setCreating(true)}>
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
              <TableHead>Phone</TableHead>
              <TableHead>White Card</TableHead>
              <TableHead>Licences &amp; tickets</TableHead>
              <TableHead>QBuild Induction</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  No workers yet — add one to get started.
                </TableCell>
              </TableRow>
            )}
            {workers.map((w) => {
              const employer = w.workerType === 'Internal' ? 'QPaint' : contractors.find((c) => c.id === w.contractorId)?.name ?? '—'
              const coreMembership = teamMemberships.find((tm) => tm.workerId === w.id && tm.membershipType === 'Core')
              const crew = coreMembership ? teams.find((t) => t.id === coreMembership.teamId)?.name : undefined
              const licences = licenceSummary(w, today)
              return (
                <TableRow key={w.id} className="cursor-pointer" onClick={() => setSelected(w)}>
                  <TableCell className="font-medium">{w.firstName} {w.lastName}</TableCell>
                  <TableCell>{w.position}</TableCell>
                  <TableCell className="text-muted-foreground">{employer}</TableCell>
                  <TableCell>
                    {crew ? <span className="text-muted-foreground">{crew}</span> : <Badge variant="secondary">Floating</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{w.phone || '—'}</TableCell>
                  <TableCell>{w.whiteCardNumber || '—'}</TableCell>
                  <TableCell>
                    {licences.total === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {licences.total}
                        {licences.expired > 0 && (
                          <Badge className="bg-warning-bg text-warning hover:bg-warning-bg">{licences.expired} expired</Badge>
                        )}
                      </span>
                    )}
                  </TableCell>
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
