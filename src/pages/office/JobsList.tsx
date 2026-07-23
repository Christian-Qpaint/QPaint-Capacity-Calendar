import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { usePersistedState } from '@/hooks/usePersistedState'
import { allKnownStageIds, stageColor, stageLabel } from '@/lib/pipedriveStages'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { StatusPill, CategoryPill, JOB_ROW_STATUS_STYLES } from '@/components/StatusBadges'
import { StagePill, StageColorDot } from '@/components/StagePill'
import { ClientTypeIcon } from '@/components/ClientTypeIcon'
import { JobsAdvancedFilterDialog } from '@/components/JobsAdvancedFilterDialog'
import { AddEditPhaseDialog, type PhaseDialogState } from '@/components/AddEditPhaseDialog'
import { JobFormDialog, type JobFormState } from '@/components/JobFormDialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { jobDisplayName } from '@/lib/jobDisplay'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  ListFilter,
  MapPin,
  Pencil,
  Plus,
  Rows3,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClientType } from '@/types'

const PAGE_SIZE_OPTIONS = [10, 50, 100] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number] | 'all'
type ViewMode = 'table' | 'kanban'

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

function JobKanbanCard({
  row,
  clientType,
  onNavigate,
  onAddPhase,
  onEdit,
}: {
  row: JobFilterContext
  clientType: ClientType
  onNavigate: () => void
  onAddPhase: () => void
  onEdit: () => void
}) {
  const { job, status, allocatedHours, actualDollars, productionPercent } = row
  return (
    <Card className="cursor-pointer gap-2 p-3 transition hover:shadow-md" onClick={onNavigate}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{row.jobName}</span>
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6"
            aria-label={`Edit ${row.jobName}`}
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6"
            aria-label={`Add phase for ${row.jobName}`}
            onClick={(e) => {
              e.stopPropagation()
              onAddPhase()
            }}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>
      <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
        <ClientTypeIcon type={clientType} />
        {row.clientName || '—'}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryPill category={job.category} />
        <StatusPill status={status} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{formatCurrency(job.totalValue)}</span>
        <span>{allocatedHours} / {job.targetHours} hrs</span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatCurrency(actualDollars)} production</span>
        <span>{Math.round(productionPercent)}%</span>
      </div>
    </Card>
  )
}

export function JobsList() {
  const { jobs, clients, scheduleBlocks } = useData()
  const da = useDataAccess()
  const navigate = useNavigate()

  const [search, setSearch] = usePersistedState('qpaint:jobsList:search', '')
  const [sort, setSort] = usePersistedState<SortState>('qpaint:jobsList:sort', { key: null, direction: 'asc' })
  const [filterOpen, setFilterOpen] = useState(false)
  const [conditions, setConditions] = usePersistedState<FilterCondition[]>('qpaint:jobsList:conditions', [])
  const [matchMode, setMatchMode] = usePersistedState<MatchMode>('qpaint:jobsList:matchMode', 'AND')
  const [phaseDialogState, setPhaseDialogState] = useState<PhaseDialogState>({ open: false, block: null })
  const [phaseDialogJobId, setPhaseDialogJobId] = useState<string | null>(null)
  const [pageSize, setPageSize] = usePersistedState<PageSize>('qpaint:jobsList:pageSize', 10)
  const [page, setPage] = usePersistedState('qpaint:jobsList:page', 1)
  const [viewMode, setViewMode] = usePersistedState<ViewMode>('qpaint:jobsList:viewMode', 'table')
  const [jobFormState, setJobFormState] = useState<JobFormState>({ open: false, job: null })

  // Every synced job shows up here, and can be scheduled onto the Calendar, regardless of its
  // Pipedrive stage — so nothing is ever invisible or un-addable purely because of its stage.
  const visibleJobs = jobs.filter((j) => j.pipedriveStageId != null)

  const rows: JobFilterContext[] = useMemo(
    () =>
      visibleJobs.map((job) => {
        const client = clients.find((c) => c.id === job.clientId)
        const blocks = scheduleBlocks.filter((b) => b.jobId === job.id)
        const progress = da.getJobProgress(job)
        return {
          job,
          clientName: client?.name ?? '',
          jobName: jobDisplayName(job),
          status: deriveJobStatus(blocks.map((b) => b.status)),
          allocatedHours: da.getJobPhaseHoursTotal(job.id),
          actualDollars: progress.actualDollars,
          productionPercent: progress.productionPercent,
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
        stageLabel(r.job.pipedriveStageId).toLowerCase().includes(q),
    )
  }, [rows, search])

  const filtered = useMemo(() => applyConditions(searched, conditions, matchMode), [searched, conditions, matchMode])
  const displayed = useMemo(() => sortRows(filtered, sort), [filtered, sort])

  // Kanban groups the same filtered/searched/sorted set the table uses — just re-bucketed by
  // stage instead of paginated, so both views always agree on which jobs are in scope.
  const kanbanColumns = useMemo(() => {
    const byStage = new Map<number, JobFilterContext[]>()
    for (const row of displayed) {
      const id = row.job.pipedriveStageId ?? -1
      if (!byStage.has(id)) byStage.set(id, [])
      byStage.get(id)!.push(row)
    }
    return Array.from(byStage.entries())
      .sort(([a], [b]) => a - b)
      .map(([stageId, columnRows]) => ({
        stageId,
        rows: columnRows,
        totalValue: columnRows.reduce((sum, r) => sum + r.job.totalValue, 0),
      }))
  }, [displayed])

  const stageOptions = useMemo(
    () => allKnownStageIds(jobs).map((id) => ({ value: String(id), label: stageLabel(id) })),
    [jobs],
  )

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(displayed.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => (pageSize === 'all' ? displayed : displayed.slice((safePage - 1) * pageSize, safePage * pageSize)),
    [displayed, pageSize, safePage],
  )
  const rangeStart = displayed.length === 0 ? 0 : pageSize === 'all' ? 1 : (safePage - 1) * pageSize + 1
  const rangeEnd = pageSize === 'all' ? displayed.length : Math.min(safePage * pageSize, displayed.length)

  function toggleSort(key: FilterFieldKey) {
    setSort((s) => (s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }))
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-medium">Jobs List</h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 rounded-md border border-border bg-card p-1">
            <Button size="sm" variant={viewMode === 'table' ? 'secondary' : 'ghost'} onClick={() => setViewMode('table')}>
              <Rows3 /> Table
            </Button>
            <Button size="sm" variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} onClick={() => setViewMode('kanban')}>
              <Columns3 /> Kanban
            </Button>
          </div>
          <Button size="sm" onClick={() => setJobFormState({ open: true, job: null })}>
            <Plus /> New job
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        New jobs are copied in automatically from Pipedrive once won — this list is now this app's own
        copy, independent of anything that happens in Pipedrive afterward.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search client, job, category, status…"
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>
          <ListFilter /> Advanced filter
          {conditions.length > 0 && <Badge variant="secondary">{conditions.length}</Badge>}
        </Button>
        {conditions.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setConditions([])
              setPage(1)
            }}
          >
            <X /> Clear filter
          </Button>
        )}
      </div>

      {viewMode === 'table' && (
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Job" sortKey="jobName" sort={sort} onSort={toggleSort} />
              <SortableHead label="Client" sortKey="clientName" sort={sort} onSort={toggleSort} />
              <SortableHead label="Category" sortKey="category" sort={sort} onSort={toggleSort} />
              <SortableHead label="Pipeline stage" sortKey="pipelineStage" sort={sort} onSort={toggleSort} />
              <SortableHead label="Total value" sortKey="totalValue" sort={sort} onSort={toggleSort} />
              <SortableHead label="Target hours" sortKey="targetHours" sort={sort} onSort={toggleSort} />
              <SortableHead label="Production $" sortKey="actualDollars" sort={sort} onSort={toggleSort} />
              <SortableHead label="Production %" sortKey="productionPercent" sort={sort} onSort={toggleSort} />
              <SortableHead label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayed.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  {visibleJobs.length === 0
                    ? 'No jobs yet — they appear here automatically once won in Pipedrive, or add one manually.'
                    : 'No jobs match your search / filter.'}
                </TableCell>
              </TableRow>
            )}
            {paginated.map((row) => {
              const { job, status, allocatedHours, actualDollars, productionPercent } = row
              return (
                <TableRow
                  key={job.id}
                  className={cn('cursor-pointer', JOB_ROW_STATUS_STYLES[status])}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                      {row.jobName}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <ClientTypeIcon type={clients.find((c) => c.id === job.clientId)?.type ?? 'Individual'} />
                      {row.clientName || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <CategoryPill category={job.category} />
                  </TableCell>
                  <TableCell>
                    <StagePill stageId={job.pipedriveStageId} />
                  </TableCell>
                  <TableCell>{formatCurrency(job.totalValue)}</TableCell>
                  <TableCell>
                    {allocatedHours} / {job.targetHours}
                  </TableCell>
                  <TableCell>{formatCurrency(actualDollars)}</TableCell>
                  <TableCell>{Math.round(productionPercent)}%</TableCell>
                  <TableCell>
                    <StatusPill status={status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${row.jobName}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setJobFormState({ open: true, job })
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Add phase for ${row.jobName}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setPhaseDialogJobId(job.id)
                          setPhaseDialogState({ open: true, block: null })
                        }}
                      >
                        <Plus />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      )}

      {viewMode === 'table' && (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(v === 'all' ? 'all' : (Number(v) as (typeof PAGE_SIZE_OPTIONS)[number]))
              setPage(1)
            }}
          >
            <SelectTrigger size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <span>
            {rangeStart}–{rangeEnd} of {displayed.length} jobs
          </span>
        </div>
        {pageSize !== 'all' && totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft />
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {safePage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
      )}

      {viewMode === 'kanban' && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {kanbanColumns.length === 0 && (
            <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground w-full">
              {visibleJobs.length === 0 ? 'No jobs yet — they appear here automatically once won in Pipedrive, or add one manually.' : 'No jobs match your search / filter.'}
            </p>
          )}
          {kanbanColumns.map(({ stageId, rows: columnRows, totalValue }) => {
            return (
              <div
                key={stageId}
                className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30 border-t-4"
                style={{ borderTopColor: stageColor(stageId) }}
              >
                <div className="space-y-0.5 border-b border-border p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <StageColorDot stageId={stageId} />
                    <span className="truncate">{stageLabel(stageId)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {columnRows.length} job{columnRows.length === 1 ? '' : 's'} · {formatCurrency(totalValue)}
                  </p>
                </div>
                <div className="max-h-[65vh] space-y-2 overflow-y-auto p-2">
                  {columnRows.map((row) => (
                    <JobKanbanCard
                      key={row.job.id}
                      row={row}
                      clientType={clients.find((c) => c.id === row.job.clientId)?.type ?? 'Individual'}
                      onNavigate={() => navigate(`/jobs/${row.job.id}`)}
                      onAddPhase={() => {
                        setPhaseDialogJobId(row.job.id)
                        setPhaseDialogState({ open: true, block: null })
                      }}
                      onEdit={() => setJobFormState({ open: true, job: row.job })}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <JobsAdvancedFilterDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        conditions={conditions}
        matchMode={matchMode}
        stageOptions={stageOptions}
        onApply={(next, mode) => {
          setConditions(next)
          setMatchMode(mode)
        }}
      />

      <AddEditPhaseDialog
        state={phaseDialogState}
        onOpenChange={(open) => setPhaseDialogState((s) => ({ ...s, open }))}
        lockedJobId={phaseDialogJobId ?? undefined}
      />

      <JobFormDialog state={jobFormState} onOpenChange={(open) => setJobFormState((s) => ({ ...s, open }))} />
    </div>
  )
}
