import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useCrmData, type CrmStageSummary } from '@/context/CrmDataContext'
import { usePermissions } from '@/context/PermissionsContext'
import { usePersistedState } from '@/hooks/usePersistedState'
import { useInfiniteScrollSentinel } from '@/hooks/useInfiniteScrollSentinel'
import { DealDrawer } from '@/components/crm/DealDrawer'
import { AddDealDialog } from '@/components/crm/AddDealDialog'
import { CrmAdvancedFilterDialog } from '@/components/crm/CrmAdvancedFilterDialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/formulas'
import { type FilterCondition, type FilterFieldKey, type MatchMode, type SortState } from '@/lib/crmDealFilters'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, ListFilter, Plus, Rows3, Search, Settings2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CrmDeal, CrmStage } from '@/types'

type ViewMode = 'table' | 'kanban'
const PAGE_SIZE = 50

const STATUS_STYLES: Record<CrmDeal['status'], string> = {
  open: 'bg-info-bg text-info',
  won: 'bg-success-bg text-success',
  lost: 'bg-danger-bg text-danger',
}

/** Same border-l-2 + tint + hover convention as JobsList's JOB_ROW_STATUS_STYLES, just keyed by
 * the CRM's own open/won/lost status instead of a schedule-derived one. */
const DEAL_ROW_STATUS_STYLES: Record<CrmDeal['status'], string> = {
  open: 'border-l-2 border-l-transparent',
  won: 'border-l-2 border-l-success bg-success-bg/50 hover:brightness-[0.97]',
  lost: 'border-l-2 border-l-danger bg-danger-bg/50 hover:brightness-[0.97]',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }: { status: CrmDeal['status'] }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', STATUS_STYLES[status])}>
      {status === 'open' ? 'Open' : status === 'won' ? 'Won' : 'Lost'}
    </span>
  )
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

function DraggableDealCard({ deal, onClick, disabled }: { deal: CrmDeal; onClick: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id, disabled })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined
  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn('cursor-pointer gap-2 p-3 transition hover:shadow-md', isDragging && 'opacity-50 shadow-lg')}
      onClick={onClick}
    >
      <p className="truncate text-sm font-medium">{deal.title}</p>
      <p className="truncate text-xs text-muted-foreground">{deal.orgName || deal.personName || '—'}</p>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{deal.value === null ? '—' : formatCurrency(deal.value)}</span>
        <StatusBadge status={deal.status} />
      </div>
    </Card>
  )
}

interface ColumnState {
  deals: CrmDeal[]
  total: number
  initialLoading: boolean
  loadingMore: boolean
}

const EMPTY_COLUMN: ColumnState = { deals: [], total: 0, initialLoading: true, loadingMore: false }

function KanbanColumn({
  stage,
  state,
  summary,
  canManage,
  onOpenDeal,
  onLoadMore,
}: {
  stage: CrmStage
  state: ColumnState
  summary?: CrmStageSummary
  canManage: boolean
  onOpenDeal: (deal: CrmDeal) => void
  onLoadMore: () => void
}) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const hasMore = state.deals.length < state.total
  const sentinelRef = useInfiniteScrollSentinel({ onLoadMore, hasMore, loading: state.loadingMore, root: scrollEl })

  const count = summary?.count ?? state.total
  const totalValue = summary?.totalValue ?? null

  return (
    <div
      className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30 border-t-4"
      style={{ borderTopColor: stage.color ?? undefined }}
    >
      <div className="space-y-0.5 border-b border-border p-3">
        <p className="truncate text-sm font-medium">{stage.name}</p>
        <p className="text-xs text-muted-foreground">
          {count} deal{count === 1 ? '' : 's'} · {totalValue === null ? '—' : formatCurrency(totalValue)}
        </p>
      </div>
      <div
        ref={(el) => {
          setNodeRef(el)
          setScrollEl(el)
        }}
        className={cn('max-h-[65vh] space-y-2 overflow-y-auto p-2 transition-colors', isOver && 'bg-accent/50')}
      >
        {state.initialLoading && <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>}
        {!state.initialLoading && state.deals.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">No deals</p>
        )}
        {state.deals.map((deal) => (
          <DraggableDealCard key={deal.id} deal={deal} onClick={() => onOpenDeal(deal)} disabled={!canManage} />
        ))}
        {/* Always rendered (not just while hasMore) — the sentinel DOM node must exist and stay
            stable from the first render so the IntersectionObserver (created once `root` is
            available) has something to attach to. It's created BEFORE the first fetch resolves
            (when hasMore is still false because total is still 0), so gating this on hasMore
            would mean the observer's effect (keyed only on `root`, which doesn't change when
            hasMore later flips true) finds no element and never re-attaches. The hook itself
            re-checks hasMore/loading on every intersection before fetching, so this is safe. */}
        <div ref={sentinelRef} className="py-2 text-center text-xs text-muted-foreground">
          {hasMore && state.loadingMore ? 'Loading more…' : ''}
        </div>
      </div>
    </div>
  )
}

export function CrmBoard() {
  const { pipelines, stages, loading, error, queryDeals, loadDealDetail, moveDealStage } = useCrmData()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('crm.manage')
  const canManageConfig = hasPermission('crm.manage_config')

  const [pipelineId, setPipelineId] = usePersistedState<string>('qpaint:crmBoard:pipelineId', '')
  const [viewMode, setViewMode] = usePersistedState<ViewMode>('qpaint:crmBoard:viewMode', 'kanban')
  const [search, setSearch] = usePersistedState('qpaint:crmBoard:search', '')
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [sort, setSort] = usePersistedState<SortState>('qpaint:crmBoard:sort', { key: null, direction: 'asc' })
  const [filterOpen, setFilterOpen] = useState(false)
  const [conditions, setConditions] = usePersistedState<FilterCondition[]>('qpaint:crmBoard:conditions', [])
  const [matchMode, setMatchMode] = usePersistedState<MatchMode>('qpaint:crmBoard:matchMode', 'AND')
  const [selectedDeal, setSelectedDeal] = useState<CrmDeal | null>(null)
  const [addDialogState, setAddDialogState] = useState<{ open: boolean; stageId?: string }>({ open: false })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const sortedPipelines = useMemo(() => [...pipelines].sort((a, b) => a.order - b.order), [pipelines])
  const activePipelineId = pipelineId && sortedPipelines.some((p) => p.id === pipelineId) ? pipelineId : (sortedPipelines[0]?.id ?? '')

  const pipelineStages = useMemo(
    () => stages.filter((s) => s.pipelineId === activePipelineId).sort((a, b) => a.order - b.order),
    [stages, activePipelineId],
  )
  const stageIdsKey = pipelineStages.map((s) => s.id).join(',')

  // Debounced so typing doesn't fire a server round-trip on every keystroke — the search now
  // drives a real SQL query, not an in-memory filter.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const queryScope = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      sortKey: sort.key ?? undefined,
      sortDir: sort.direction,
      conditions: conditions.length ? conditions : undefined,
      matchMode,
    }),
    [debouncedSearch, sort, conditions, matchMode],
  )

  // ---- Table mode: one flat, lazily-extended page ----
  const [tableDeals, setTableDeals] = useState<CrmDeal[]>([])
  const [tableTotal, setTableTotal] = useState(0)
  const [tableInitialLoading, setTableInitialLoading] = useState(false)
  const [tableLoadingMore, setTableLoadingMore] = useState(false)

  async function fetchTablePage(offset: number, append: boolean) {
    if (!activePipelineId) return
    if (append) setTableLoadingMore(true)
    else setTableInitialLoading(true)
    try {
      const result = await queryDeals({ pipelineId: activePipelineId, offset, limit: PAGE_SIZE, ...queryScope })
      setTableDeals((prev) => (append ? [...prev, ...result.deals] : result.deals))
      setTableTotal(result.total)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load deals')
    } finally {
      setTableInitialLoading(false)
      setTableLoadingMore(false)
    }
  }

  // ---- Kanban mode: one lazily-extended page PER stage, plus a pipeline-wide count/$ summary
  // that always reflects the true totals regardless of how much of each column is loaded ----
  const [columnState, setColumnState] = useState<Record<string, ColumnState>>({})
  const [stageSummary, setStageSummary] = useState<Record<string, CrmStageSummary>>({})

  async function fetchStagePage(stageId: string, offset: number, append: boolean) {
    if (!activePipelineId) return
    setColumnState((prev) => ({
      ...prev,
      [stageId]: { ...(prev[stageId] ?? EMPTY_COLUMN), loadingMore: append, initialLoading: !append },
    }))
    try {
      const result = await queryDeals({ pipelineId: activePipelineId, stageId, offset, limit: PAGE_SIZE, ...queryScope })
      setColumnState((prev) => {
        const existing = prev[stageId]?.deals ?? []
        return {
          ...prev,
          [stageId]: {
            deals: append ? [...existing, ...result.deals] : result.deals,
            total: result.total,
            initialLoading: false,
            loadingMore: false,
          },
        }
      })
      setStageSummary((prev) => {
        const next = { ...prev }
        for (const s of result.stageSummary) next[s.stageId] = s
        return next
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load deals')
      setColumnState((prev) => ({ ...prev, [stageId]: { ...(prev[stageId] ?? EMPTY_COLUMN), loadingMore: false, initialLoading: false } }))
    }
  }

  // Reset + (re)fetch the first page whenever the pipeline, view, search, sort, or advanced
  // filter changes — same trigger set JobsList recomputes its client-side filtered/sorted rows
  // on, just server-driven here since the full result set is never held in memory.
  useEffect(() => {
    if (!activePipelineId) return
    if (viewMode === 'table') {
      setTableDeals([])
      setTableTotal(0)
      fetchTablePage(0, false)
    } else {
      setColumnState({})
      setStageSummary({})
      for (const stage of pipelineStages) fetchStagePage(stage.id, 0, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePipelineId, viewMode, queryScope, stageIdsKey])

  async function openDeal(deal: CrmDeal) {
    try {
      const full = await loadDealDetail(deal.id)
      setSelectedDeal(full)
    } catch {
      setSelectedDeal(deal) // fall back to the light row rather than nothing
    }
  }

  function patchDealEverywhere(updated: CrmDeal) {
    setSelectedDeal(updated)
    setTableDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    setColumnState((prev) => {
      const next = { ...prev }
      for (const sid of Object.keys(next)) {
        const col = next[sid]
        if (!col.deals.some((d) => d.id === updated.id)) continue
        if (sid === updated.stageId) {
          next[sid] = { ...col, deals: col.deals.map((d) => (d.id === updated.id ? updated : d)) }
        } else {
          // Stage changed from within the drawer itself — move it out of this loaded column and
          // into the destination one, if that column happens to be loaded too.
          next[sid] = { ...col, deals: col.deals.filter((d) => d.id !== updated.id), total: Math.max(0, col.total - 1) }
          const dst = next[updated.stageId]
          if (dst) next[updated.stageId] = { ...dst, deals: [updated, ...dst.deals], total: dst.total + 1 }
        }
      }
      return next
    })
  }

  function removeDealEverywhere(id: string) {
    setTableDeals((prev) => prev.filter((d) => d.id !== id))
    setColumnState((prev) => {
      const next = { ...prev }
      for (const sid of Object.keys(next)) {
        if (next[sid].deals.some((d) => d.id === id)) {
          next[sid] = { ...next[sid], deals: next[sid].deals.filter((d) => d.id !== id), total: Math.max(0, next[sid].total - 1) }
        }
      }
      return next
    })
  }

  function handleDealCreated(deal: CrmDeal) {
    setSelectedDeal(deal)
    if (deal.pipelineId !== activePipelineId) return
    setTableDeals((prev) => [deal, ...prev])
    setTableTotal((prev) => prev + 1)
    setColumnState((prev) => {
      const col = prev[deal.stageId]
      if (!col) return prev
      return { ...prev, [deal.stageId]: { ...col, deals: [deal, ...col.deals], total: col.total + 1 } }
    })
    setStageSummary((prev) => {
      const s = prev[deal.stageId]
      if (!s) return prev
      return { ...prev, [deal.stageId]: { ...s, count: s.count + 1, totalValue: s.totalValue === null ? null : s.totalValue + (deal.value ?? 0) } }
    })
  }

  async function handleDragEnd(event: DragEndEvent) {
    const dealId = String(event.active.id)
    const targetStageId = event.over ? String(event.over.id) : null
    if (!targetStageId) return
    let sourceStageId: string | null = null
    let deal: CrmDeal | null = null
    for (const [sid, state] of Object.entries(columnState)) {
      const found = state.deals.find((d) => d.id === dealId)
      if (found) {
        sourceStageId = sid
        deal = found
        break
      }
    }
    if (!deal || !sourceStageId || sourceStageId === targetStageId) return
    try {
      const { promoted, promotionSkippedReason, deal: updated } = await moveDealStage(dealId, targetStageId)
      const value = updated.value ?? 0
      setColumnState((prev) => {
        const next = { ...prev }
        const src = next[sourceStageId!]
        if (src) next[sourceStageId!] = { ...src, deals: src.deals.filter((d) => d.id !== dealId), total: Math.max(0, src.total - 1) }
        const dst = next[targetStageId]
        if (dst) next[targetStageId] = { ...dst, deals: [updated, ...dst.deals], total: dst.total + 1 }
        return next
      })
      setStageSummary((prev) => {
        const next = { ...prev }
        const src = next[sourceStageId!]
        if (src) next[sourceStageId!] = { ...src, count: Math.max(0, src.count - 1), totalValue: src.totalValue === null ? null : src.totalValue - value }
        const dst = next[targetStageId]
        if (dst) next[targetStageId] = { ...dst, count: dst.count + 1, totalValue: dst.totalValue === null ? null : dst.totalValue + value }
        return next
      })
      setTableDeals((prev) => prev.map((d) => (d.id === dealId ? updated : d)))
      if (promoted) toast.success('Moved to a Won stage — a Job was created')
      else if (promotionSkippedReason) toast.warning(`Moved, but couldn't create a Job yet: ${promotionSkippedReason}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to move deal')
    }
  }

  function toggleSort(key: FilterFieldKey) {
    setSort((s) => (s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }))
  }

  const stageOptions = useMemo(
    () => pipelineStages.map((s) => ({ value: s.id, label: s.name, color: s.color })),
    [pipelineStages],
  )
  const stageNameById = useMemo(() => new Map(pipelineStages.map((s) => [s.id, s.name])), [pipelineStages])

  const tableHasMore = tableDeals.length < tableTotal

  if (loading) return <p className="text-sm text-muted-foreground">Loading deals…</p>
  if (error) return <p className="text-sm text-danger">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-medium">Deals</h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 rounded-md border border-border bg-card p-1">
            <Button size="sm" variant={viewMode === 'table' ? 'secondary' : 'ghost'} onClick={() => setViewMode('table')}>
              <Rows3 /> Table
            </Button>
            <Button size="sm" variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} onClick={() => setViewMode('kanban')}>
              <Columns3 /> Kanban
            </Button>
          </div>
          {canManageConfig && (
            <Button size="sm" variant="outline" render={<Link to="/deals/config" />}>
              <Settings2 /> Configure
            </Button>
          )}
          {canManage && (
            <Button size="sm" onClick={() => setAddDialogState({ open: true, stageId: pipelineStages[0]?.id })}>
              <Plus /> Add deal
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 rounded-md border border-border bg-card p-1">
          {sortedPipelines.map((p) => (
            <Button key={p.id} size="sm" variant={p.id === activePipelineId ? 'secondary' : 'ghost'} onClick={() => setPipelineId(p.id)}>
              {p.name}
            </Button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, client…" className="pl-8" />
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
      </div>

      {viewMode === 'table' && (
        <>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Deal" sortKey="title" sort={sort} onSort={toggleSort} />
                  <SortableHead label="Client" sortKey="orgName" sort={sort} onSort={toggleSort} />
                  <TableHead>Stage</TableHead>
                  <SortableHead label="Value" sortKey="value" sort={sort} onSort={toggleSort} />
                  <SortableHead label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                  <SortableHead label="Created" sortKey="createdAt" sort={sort} onSort={toggleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableInitialLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Loading deals…
                    </TableCell>
                  </TableRow>
                )}
                {!tableInitialLoading && tableDeals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No deals match your search / filter.
                    </TableCell>
                  </TableRow>
                )}
                {!tableInitialLoading &&
                  tableDeals.map((deal) => (
                    <TableRow
                      key={deal.id}
                      className={cn('cursor-pointer', DEAL_ROW_STATUS_STYLES[deal.status])}
                      onClick={() => openDeal(deal)}
                    >
                      <TableCell className="font-medium">{deal.title}</TableCell>
                      <TableCell className="text-muted-foreground">{deal.orgName || deal.personName || '—'}</TableCell>
                      <TableCell>{stageNameById.get(deal.stageId) ?? '—'}</TableCell>
                      <TableCell>{deal.value === null ? '—' : formatCurrency(deal.value)}</TableCell>
                      <TableCell>
                        <StatusBadge status={deal.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(deal.createdAt)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
          <TableInfiniteScrollFooter
            loaded={tableDeals.length}
            total={tableTotal}
            hasMore={tableHasMore}
            loadingMore={tableLoadingMore}
            onLoadMore={() => fetchTablePage(tableDeals.length, true)}
          />
        </>
      )}

      {viewMode === 'kanban' && (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {pipelineStages.length === 0 && (
              <p className="w-full rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                No stages configured for this pipeline yet.
              </p>
            )}
            {pipelineStages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                state={columnState[stage.id] ?? EMPTY_COLUMN}
                summary={stageSummary[stage.id]}
                canManage={canManage}
                onOpenDeal={openDeal}
                onLoadMore={() => {
                  const current = columnState[stage.id] ?? EMPTY_COLUMN
                  fetchStagePage(stage.id, current.deals.length, true)
                }}
              />
            ))}
          </div>
        </DndContext>
      )}

      <DealDrawer
        open={!!selectedDeal}
        onOpenChange={(open) => !open && setSelectedDeal(null)}
        deal={selectedDeal}
        onDealUpdated={patchDealEverywhere}
        onDealDeleted={removeDealEverywhere}
      />
      <AddDealDialog
        open={addDialogState.open}
        onOpenChange={(open) => setAddDialogState((s) => ({ ...s, open }))}
        defaultPipelineId={activePipelineId}
        defaultStageId={addDialogState.stageId}
        onCreated={handleDealCreated}
      />
      <CrmAdvancedFilterDialog
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
    </div>
  )
}

function TableInfiniteScrollFooter({
  loaded,
  total,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  loaded: number
  total: number
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}) {
  const sentinelRef = useInfiniteScrollSentinel({ onLoadMore, hasMore, loading: loadingMore, root: null })
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>
        Loaded {loaded} of {total} deal{total === 1 ? '' : 's'}
      </span>
      {/* Always rendered — see the matching comment in KanbanColumn for why this can't be
          conditional on hasMore. */}
      <div ref={sentinelRef} className="text-muted-foreground">
        {hasMore && loadingMore ? 'Loading more…' : ''}
      </div>
    </div>
  )
}
