import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { supabase } from '@/lib/supabaseClient'
import { PIPEDRIVE_STAGE_LABELS, PIPEDRIVE_TARGET_STAGE_IDS } from '@/lib/pipedriveStages'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/StatusBadges'
import { ClientTypeIcon } from '@/components/ClientTypeIcon'
import { JOB_CATEGORY_ICONS } from '@/lib/jobCategoryIcons'
import { formatCurrency } from '@/lib/formulas'
import { MapPin, RefreshCw } from 'lucide-react'
import type { Job } from '@/types'

function jobDisplayName(job: Job) {
  return job.pipedriveDealTitle || `${job.pipedriveDealId} - ${job.address}`
}

function deriveJobStatus(phaseStatuses: string[]): string {
  if (phaseStatuses.length === 0) return 'Unscheduled'
  if (phaseStatuses.every((s) => s === 'Completed')) return 'Completed'
  if (phaseStatuses.some((s) => s === 'Overdue')) return 'Overdue'
  if (phaseStatuses.some((s) => s === 'In Production')) return 'In Production'
  return 'Scheduled'
}

export function JobsList() {
  const { jobs, clients, scheduleBlocks, refetch } = useData()
  const da = useDataAccess()
  const navigate = useNavigate()

  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const visibleJobs = jobs.filter((j) => j.pipedriveStageId != null && PIPEDRIVE_TARGET_STAGE_IDS.includes(j.pipedriveStageId))

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    setSyncMessage(null)
    try {
      const { data, error } = await supabase.functions.invoke('pipedrive-sync', { method: 'POST' })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setSyncMessage(
        `Synced ${data.synced} job${data.synced === 1 ? '' : 's'}` +
          (data.skipped ? ` · skipped ${data.skipped} (no Target Hours set)` : '') +
          (data.errors?.length ? ` · ${data.errors.length} error(s)` : ''),
      )
      await refetch()
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Jobs List</h1>
        <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync from Pipedrive'}
        </Button>
      </div>

      {syncMessage && <p className="text-sm text-success">{syncMessage}</p>}
      {syncError && <p className="text-sm text-danger">{syncError}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Job</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Pipeline stage</TableHead>
              <TableHead>Total value</TableHead>
              <TableHead>Target hours</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleJobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No jobs in Ready to Schedule, Booked, or In Progress yet — try syncing from Pipedrive.
                </TableCell>
              </TableRow>
            )}
            {visibleJobs.map((job) => {
              const client = clients.find((c) => c.id === job.clientId)
              const blocks = scheduleBlocks.filter((b) => b.jobId === job.id)
              const allocatedHours = da.getJobPhaseHoursTotal(job.id)
              const status = deriveJobStatus(blocks.map((b) => b.status))
              const CategoryIcon = JOB_CATEGORY_ICONS[job.category]
              return (
                <TableRow
                  key={job.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      {client && <ClientTypeIcon type={client.type} />}
                      {client?.name ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                      {jobDisplayName(job)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      <CategoryIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {job.category}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.pipedriveStageId ? PIPEDRIVE_STAGE_LABELS[job.pipedriveStageId] : '—'}
                  </TableCell>
                  <TableCell>{formatCurrency(job.totalValue)}</TableCell>
                  <TableCell>
                    {allocatedHours} / {job.targetHours}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={status} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
