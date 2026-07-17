import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { supabase } from '@/lib/supabaseClient'
import { PIPEDRIVE_STAGE_LABELS, PIPEDRIVE_TARGET_STAGE_IDS } from '@/lib/pipedriveStages'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { StatusPill, CategoryPill, JOB_ROW_STATUS_STYLES } from '@/components/StatusBadges'
import { ClientTypeIcon } from '@/components/ClientTypeIcon'
import { JobsAdvancedFilterDialog } from '@/components/JobsAdvancedFilterDialog'
import {
  applyConditions,
  sortRows,
  type FilterCondition,
  type FilterFieldKey,
  type JobFilterContext,
  type MatchMode,
  type SortState,
} from '@/lib/jobFilters'
import { formatCurrency } from '@/lib/formulas'
import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter, MapPin, RefreshCw, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
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

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string
  sortKey: FilterFieldKey
  sort: SortState
  onSort: (key: FilterFieldKey) => void
  className?: string
}) {
  const active = sort.key === sortKey
  const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}
      >
        {label}
        <Icon className={cn('size-3.5', !active && 'opacity-30')} />
      </button>
    </TableHead>
  )
}

export function JobsList() {
  const { jobs, clients, scheduleBlocks, refetch } = useData()
  const da = useDataAccess()
  const navigate = useNavigate()

  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState>({ key: null, direction: 'asc' })
  const [filterOpen, setFilterOpen] = useState(false)
  const [conditions, setConditions] = useState<FilterCondition[]>([])
  const [matchMode, setMatchMode] = useState<MatchMode>('AND')

  const visibleJobs = jobs.filter((j) => j.pipedriveStageId != null && PIPEDRIVE_TARGET_STAGE_IDS.includes(j.pipedriveStageId))

  const rows: JobFilterContext[] = useMemo(
    () =>
      visibleJobs.map((job) => {
        const client = clients.find((c) => c.id === job.clientId)
        const blocks = scheduleBlocks.filter((b) => b.jobId === job.id)
        return {
          job,
          clientName: client?.name ?? '',
          jobName: jobDisplayName(job),
          status: deriveJobStatus(blocks.map((b) => b.status)),
          allocatedHours: da.getJobPhaseHoursTotal(job.id),
        }
      }),
    [visibleJobs, clients, scheduleBlocks, da],
  )

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.clientName.toLowerCase().includes(q) ||
        r.jobName.toLowerCase().includes(q) ||
        r.job.category.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        (r.job.pipedriveStageId ? PIPEDRIVE_STAGE_LABELS[r.job.pipedriveStageId].toLowerCase().includes(q) : false),
    )
  }, [rows, search])

  const filtered = useMemo(() => applyConditions(searched, conditions, matchMode), [searched, conditions, matchMode])
  const displayed = useMemo(() => sortRows(filtered, sort), [filtered, sort])

  function toggleSort(key: FilterFieldKey) {
    setSort((s) => (s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }))
  }

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

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, job, category, status…"
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>
          <ListFilter /> Advanced filter
          {conditions.length > 0 && <Badge variant="secondary">{conditions.length}</Badge>}
        </Button>
        {conditions.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setConditions([])}>
            <X /> Clear filter
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {displayed.length} of {visibleJobs.length} jobs
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Client" sortKey="clientName" sort={sort} onSort={toggleSort} />
              <SortableHead label="Job" sortKey="jobName" sort={sort} onSort={toggleSort} />
              <SortableHead label="Category" sortKey="category" sort={sort} onSort={toggleSort} />
              <SortableHead label="Pipeline stage" sortKey="pipelineStage" sort={sort} onSort={toggleSort} />
              <SortableHead label="Total value" sortKey="totalValue" sort={sort} onSort={toggleSort} />
              <SortableHead label="Target hours" sortKey="targetHours" sort={sort} onSort={toggleSort} />
              <SortableHead label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayed.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  {visibleJobs.length === 0
                    ? 'No jobs in Ready to Schedule, Booked, or In Progress yet — try syncing from Pipedrive.'
                    : 'No jobs match your search / filter.'}
                </TableCell>
              </TableRow>
            )}
            {displayed.map((row) => {
              const { job, status, allocatedHours } = row
              return (
                <TableRow
                  key={job.id}
                  className={cn('cursor-pointer', JOB_ROW_STATUS_STYLES[status])}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      <ClientTypeIcon type={clients.find((c) => c.id === job.clientId)?.type ?? 'Individual'} />
                      {row.clientName || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                      {row.jobName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <CategoryPill category={job.category} />
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

      <JobsAdvancedFilterDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        conditions={conditions}
        matchMode={matchMode}
        onApply={(next, mode) => {
          setConditions(next)
          setMatchMode(mode)
        }}
      />
    </div>
  )
}
