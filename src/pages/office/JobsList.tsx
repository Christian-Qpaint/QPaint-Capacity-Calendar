import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { usePersistedState } from '@/hooks/usePersistedState'
import { useInfiniteScrollSentinel } from '@/hooks/useInfiniteScrollSentinel'
import { stageColor, stageLabel } from '@/lib/pipedriveStages'
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
  Eye,
  EyeOff,
  ListFilter,
  MapPin,
  Plus,
  Rows3,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClientType, CrmStage, Job } from '@/types'

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
}: {
  row: JobFilterContext
  clientType: ClientType
  onNavigate: () => void
  onAddPhase: () => void
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

// How many cards a column reveals up front — every job is already in memory via DataContext (the
// Calendar needs the whole unfiltered set regardless), so "loading more" here is instant, purely
// about capping DOM node count rather than waiting on a network round trip. Confirmed as the real
// cause of this page feeling slow: a stage with hundreds of Won jobs used to render every single
// one of them at once with no windowing at all, unlike the Deals board's server-paginated columns.
const KANBAN_REVEAL_STEP = 30

function JobKanbanColumn({
  stageId,
  stage,
  rows,
  totalValue,
  clients,
  onNavigate,
  onAddPhase,
}: {
  stageId: string
  stage: CrmStage | undefined
  rows: JobFilterContext[]
  totalValue: number
  clients: { id: string; type: ClientType }[]
  onNavigate: (id: string) => void
  onAddPhase: (id: string) => void
}) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [visibleCount, setVisibleCount] = useState(KANBAN_REVEAL_STEP)
  // Resets whenever this column's own row set changes identity (a filter/search/sort change, or
  // the underlying jobs changing) — otherwise a narrowed filter could leave a stale higher count
  // around, or a newly-widened one would stay capped at whatever was revealed before.
  useEffect(() => setVisibleCount(KANBAN_REVEAL_STEP), [rows])
  const visibleRows = rows.slice(0, visibleCount)
  const hasMore = visibleRows.length < rows.length
  const sentinelRef = useInfiniteScrollSentinel({
    onLoadMore: () => setVisibleCount((n) => n + KANBAN_REVEAL_STEP),
    hasMore,
    loading: false,
    root: scrollEl,
  })

  return (
    <div
      key={stageId || 'none'}
      className="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-muted/30 border-t-4"
      style={{ borderTopColor: stageColor(stage) }}
    >
      <div className="space-y-0.5 border-b border-border p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <StageColorDot stage={stage} />
          <span className="truncate">{stageLabel(stage)}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {rows.length} job{rows.length === 1 ? '' : 's'} · {formatCurrency(totalValue)}
        </p>
      </div>
      <div ref={setScrollEl} className="max-h-[65vh] space-y-2 overflow-y-auto p-2">
        {visibleRows.map((row) => (
          <JobKanbanCard
            key={row.job.id}
            row={row}
            clientType={clients.find((c) => c.id === row.job.clientId)?.type ?? 'Individual'}
            onNavigate={() => onNavigate(row.job.id)}
            onAddPhase={() => onAddPhase(row.job.id)}
          />
        ))}
        {/* Always rendered so the IntersectionObserver has a stable node to attach to from the
            first render — same reasoning as CrmBoard.tsx's matching sentinel. */}
        <div ref={sentinelRef} className="py-2 text-center text-xs text-muted-foreground">
          {hasMore ? 'Loading more…' : ''}
        </div>
      </div>
    </div>
  )
}

// Same "archive after N days sitting in a stage" rule crm-data.mts applies to the Deals board,
// evaluated client-side here since every job is already loaded via DataContext. A job with no
// stage yet (never assigned one) is never hidden by this — there's no signal to hide it on.
function isHiddenByDefault(job: Job, stageById: Map<string, CrmStage>): boolean {
  if (job.archivedAt) return true
  if (!job.stageId || !job.stageEnteredAt) return false
  const stage = stageById.get(job.stageId)
  if (stage?.autoHideAfterDays == null) return false
  const cutoff = Date.now() - stage.autoHideAfterDays * 86_400_000
  return new Date(job.stageEnteredAt).getTime() < cutoff
}

export function JobsList() {
  const { jobs, clients, scheduleBlocks, jobStages } = useData()
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
  // Not persisted — same "temporary look-something-up need" reasoning as CrmBoard.tsx's own
  // showArchived toggle, not a lasting view preference.
  const [showArchived, setShowArchived] = useState(false)

  const stageById = useMemo(() => new Map(jobStages.map((s) => [s.id, s])), [jobStages])
  const hasArchivableStage = useMemo(() => jobStages.some((s) => s.autoHideAfterDays != null), [jobStages])

  // Every job appears here and can be scheduled onto the Calendar regardless of this filter — the
  // Capacity Calendar/booking modal read `jobs` straight from DataContext, completely unaffected.
  // Archiving (manual, or auto after a stage's configured age) only hides a job from this page's
  // default view.
  const visibleJobs = showArchived ? jobs : jobs.filter((j) => !isHiddenByDefault(j, stageById))

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
        stageLabel(stageById.get(r.job.stageId ?? '')).toLowerCase().includes(q),
    )
  }, [rows, search, stageById])

  const filtered = useMemo(() => applyConditions(searched, conditions, matchMode), [searched, conditions, matchMode])
  const displayed = useMemo(() => sortRows(filtered, sort), [filtered, sort])

  // Kanban groups the same filtered/searched/sorted set the table uses — just re-bucketed by
  // stage instead of paginated, so both views always agree on which jobs are in scope. Grouped by
  // stageId (uuid, '' for "no stage yet") rather than the old pipedriveStageId int.
  const kanbanColumns = useMemo(() => {
    const byStage = new Map<string, JobFilterContext[]>()
    for (const row of displayed) {
      const id = row.job.stageId ?? ''
      if (!byStage.has(id)) byStage.set(id, [])
      byStage.get(id)!.push(row)
    }
    return Array.from(byStage.entries())
      .sort(([a], [b]) => (stageById.get(a)?.order ?? Infinity) - (stageById.get(b)?.order ?? Infinity))
      .map(([stageId, columnRows]) => ({
        stageId,
        stage: stageById.get(stageId),
        rows: columnRows,
        totalValue: columnRows.reduce((sum, r) => sum + r.job.totalValue, 0),
      }))
  }, [displayed, stageById])

  // Every stage some currently-loaded job actually sits in — not the full jobStages list, so the
  // filter dropdown doesn't offer Sales/BizDev stages no job has ever synced against.
  const stageOptions = useMemo(() => {
    const usedIds = new Set(jobs.map((j) => j.stageId).filter((id): id is string => !!id))
    return jobStages
      .filter((s) => usedIds.has(s.id))
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ value: s.id, label: s.name, color: s.color }))
  }, [jobs, jobStages])

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
        <h1 className="text-lg font-medium">Won</h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 rounded-md border border-border bg-card p-1">
            <Button size="sm" variant={viewMode === 'table' ? 'secondary' : 'ghost'} onClick={() => setViewMode('table')}>
              <Rows3 /> Table
            </Button>
            <Button size="sm" variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} onClick={() => setViewMode('kanban')}>
              <Columns3 /> Kanban
            </Button>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Jobs land here automatically once a deal is won (in Pipedrive or the Deals CRM) — view-only;
        manage the deal itself from the Deals page.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {hasArchivableStage && (
          <Button
            variant={showArchived ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
            title="Archived jobs (manually, or auto after sitting long in a stage) are hidden by default — toggle to bring them back into view"
          >
            {showArchived ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {showArchived ? 'Showing Archived' : 'Show Archived'}
          </Button>
        )}
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
                    ? 'No jobs yet — they appear here automatically once a deal is won.'
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
                    <StagePill stage={stageById.get(job.stageId ?? '')} />
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
        // Every stage column gets flex-1 so they always divide up the full available width and
        // stay visible without horizontal scrolling, regardless of stage count — matching the
        // Deals board's own Kanban layout (was previously a fixed w-72 per column with the whole
        // row scrolling horizontally instead).
        <div className="flex gap-3 pb-2">
          {kanbanColumns.length === 0 && (
            <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground w-full">
              {visibleJobs.length === 0 ? 'No jobs yet — they appear here automatically once a deal is won.' : 'No jobs match your search / filter.'}
            </p>
          )}
          {kanbanColumns.map(({ stageId, stage, rows: columnRows, totalValue }) => (
            <JobKanbanColumn
              key={stageId || 'none'}
              stageId={stageId}
              stage={stage}
              rows={columnRows}
              totalValue={totalValue}
              clients={clients}
              onNavigate={(id) => navigate(`/jobs/${id}`)}
              onAddPhase={(id) => {
                setPhaseDialogJobId(id)
                setPhaseDialogState({ open: true, block: null })
              }}
            />
          ))}
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
    </div>
  )
}
