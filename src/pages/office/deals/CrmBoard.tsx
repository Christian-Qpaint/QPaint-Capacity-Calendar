import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useCrmData, type CrmStageSummary } from '@/context/CrmDataContext'
import { usePermissions } from '@/context/PermissionsContext'
import { usePersistedState } from '@/hooks/usePersistedState'
import { useInfiniteScrollSentinel } from '@/hooks/useInfiniteScrollSentinel'
import { useImportProgress } from '@/context/ImportProgressContext'
import { fetchPipelineDealsFromPipedrive, chunkedSyncPipelineDeals } from '@/lib/crmSyncRunner'
import { DealDrawer } from '@/components/crm/DealDrawer'
import { AddDealDialog } from '@/components/crm/AddDealDialog'
import { CrmAdvancedFilterDialog } from '@/components/crm/CrmAdvancedFilterDialog'
import { SavedFilterDropdown } from '@/components/crm/SavedFilterDropdown'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/formulas'
import { colorForIndex } from '@/lib/marketingColors'
import { type FilterCondition, type FilterFieldKey, type MatchMode, type SortState } from '@/lib/crmDealFilters'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Eye, EyeOff, ListFilter, Plus, RefreshCw, Rows3, Search, Settings2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CrmDeal, CrmStage } from '@/types'

type ViewMode = 'table' | 'kanban'
const PAGE_SIZE = 50
// Matches crm-data.mts's own SALES_PIPELINE_PIPEDRIVE_ID — the "Show Won"/"Show Lost" toggles only
// apply there, since that's the only pipeline whose Won/Lost deals are hidden by default.
const SALES_PIPELINE_PIPEDRIVE_ID = 2

const STATUS_STYLES: Record<CrmDeal['status'], string> = {
  open: 'bg-info-bg text-info',
  won: 'bg-success-bg text-success',
  lost: 'bg-danger-bg text-danger',
}

/** Same border-l-2 + tint + hover convention as JobsList's JOB_ROW_STATUS_STYLES, just keyed by
 * the CRM's own open/won/lost status instead of a schedule-derived one. Overridden by rot styling
 * below whenever a deal is old enough — rotting is a stronger, more actionable signal than plain
 * status color. */
const DEAL_ROW_STATUS_STYLES: Record<CrmDeal['status'], string> = {
  open: 'border-l-2 border-l-transparent',
  won: 'border-l-2 border-l-success bg-success-bg/50 hover:brightness-[0.97]',
  lost: 'border-l-2 border-l-danger bg-danger-bg/50 hover:brightness-[0.97]',
}

type RotTier = 'none' | 'yellow' | 'orange' | 'red'

// Fallback for any stage that hasn't configured its own thresholds (Business Development, Test
// Pipeline, anything added later) — see db/schema.ts's crmStages comment for the per-stage columns
// this backs off in favor of. Jobs Pipeline and Sales Pipeline stages are seeded with their own
// specific values (migration 20260731090052) and never fall back to this.
const DEFAULT_ROT_THRESHOLDS = { yellow: 7, orange: 14, red: 21 } as const

function daysInStage(deal: CrmDeal): number {
  return Math.floor((Date.now() - new Date(deal.stageEnteredAt).getTime()) / 86_400_000)
}

/** Deliberately NOT status-gated — Jobs Pipeline deals sit at status 'won' for their entire
 * production lifecycle (Admin through All Done & Paid), so excluding non-open deals would mean
 * rot coloring never applies to the one pipeline it matters most for. Sales Pipeline's Won/Lost
 * deals are hidden from the default view anyway (see crm-data.mts), so this only shows up there
 * if someone explicitly toggles Show Won/Lost on. */
function rotTier(deal: CrmDeal, stage: CrmStage | undefined): RotTier {
  const days = daysInStage(deal)
  const hasOwnThresholds = !!stage && (stage.rotYellowDays != null || stage.rotOrangeDays != null || stage.rotRedDays != null)
  const { yellow, orange, red } = hasOwnThresholds
    ? { yellow: stage!.rotYellowDays, orange: stage!.rotOrangeDays, red: stage!.rotRedDays }
    : DEFAULT_ROT_THRESHOLDS
  if (red != null && days >= red) return 'red'
  if (orange != null && days >= orange) return 'orange'
  if (yellow != null && days >= yellow) return 'yellow'
  return 'none'
}

const ROT_ROW_STYLES: Record<Exclude<RotTier, 'none'>, string> = {
  yellow: 'border-l-2 border-l-warning bg-warning-bg/60',
  orange: 'border-l-2 border-l-rot-orange bg-rot-orange-bg/60',
  red: 'border-l-2 border-l-danger bg-danger-bg/60',
}
const ROT_CARD_STYLES: Record<Exclude<RotTier, 'none'>, string> = {
  yellow: 'bg-warning-bg/60',
  orange: 'bg-rot-orange-bg/60',
  red: 'bg-danger-bg/60',
}
const ROT_BADGE_STYLES: Record<Exclude<RotTier, 'none'>, string> = {
  yellow: 'bg-warning-bg text-warning',
  orange: 'bg-rot-orange-bg text-rot-orange',
  red: 'bg-danger-bg text-danger',
}

function dealRowClassName(deal: CrmDeal, stage: CrmStage | undefined): string {
  const tier = rotTier(deal, stage)
  if (tier === 'none') return DEAL_ROW_STATUS_STYLES[deal.status]
  return ROT_ROW_STYLES[tier]
}

function RotBadge({ deal, stage }: { deal: CrmDeal; stage: CrmStage | undefined }) {
  const tier = rotTier(deal, stage)
  if (tier === 'none') return null
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium', ROT_BADGE_STYLES[tier])}>
      {daysInStage(deal)}d in stage
    </span>
  )
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

// Won but never promoted to a Job — usually Target Hours wasn't set at the moment promotion would
// normally fire, and nothing ever retries it automatically once status is already 'won'. Flagged
// here so it's visible on the board itself, not just discoverable by opening every deal.
function NoJobBadge({ deal }: { deal: CrmDeal }) {
  if (deal.status !== 'won' || deal.jobId) return null
  return (
    <span className="inline-flex items-center rounded-md bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning" title="Won, but no Job created yet">
      No Job
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

function DraggableDealCard({ deal, stage, onClick, disabled }: { deal: CrmDeal; stage: CrmStage | undefined; onClick: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id, disabled })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined
  const tier = rotTier(deal, stage)
  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'cursor-pointer gap-2 p-3 transition hover:shadow-md',
        tier !== 'none' && ROT_CARD_STYLES[tier],
        isDragging && 'opacity-50 shadow-lg',
      )}
      onClick={onClick}
    >
      <p className="truncate text-sm font-medium">{deal.title}</p>
      <p className="truncate text-xs text-muted-foreground">{deal.orgName || deal.personName || '—'}</p>
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
        <span className="font-medium text-foreground">{deal.value === null ? '—' : formatCurrency(deal.value)}</span>
        <div className="flex items-center gap-1">
          <RotBadge deal={deal} stage={stage} />
          <StatusBadge status={deal.status} />
          <NoJobBadge deal={deal} />
        </div>
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
  color,
  avgDwellDays,
  state,
  summary,
  canManage,
  onOpenDeal,
  onLoadMore,
}: {
  stage: CrmStage
  color: string
  avgDwellDays?: number
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
      style={{ borderTopColor: color }}
    >
      <div className="space-y-0.5 border-b border-border p-3">
        <p className="truncate text-sm font-medium">{stage.name}</p>
        <p className="text-xs text-muted-foreground">
          {count} deal{count === 1 ? '' : 's'} · {totalValue === null ? '—' : formatCurrency(totalValue)}
        </p>
        {/* Historical throughput — how long a deal typically sits here before moving on, so it's
            obvious at a glance which stages tend to hold deals longest. */}
        <p className="text-xs text-muted-foreground">
          Avg time here: {avgDwellDays == null ? 'no data yet' : `${avgDwellDays.toFixed(1)}d`}
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
          <DraggableDealCard key={deal.id} deal={deal} stage={stage} onClick={() => onOpenDeal(deal)} disabled={!canManage} />
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
  const { pipelines, stages, savedFilters, fieldDefinitions, loading, error, queryDeals, loadDealDetail, moveDealStage } = useCrmData()
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
  // Combines with the ad-hoc conditions above (AND'ed together server-side) rather than being
  // mutually exclusive — picking a saved filter narrows the board, and the Advanced Filter can
  // still layer extra conditions on top of it for a customized view.
  const [savedFilterId, setSavedFilterId] = usePersistedState<string | null>('qpaint:crmBoard:savedFilterId', null)
  const [selectedDeal, setSelectedDeal] = useState<CrmDeal | null>(null)
  const [addDialogState, setAddDialogState] = useState<{ open: boolean; stageId?: string }>({ open: false })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Seed the board to Pipedrive's own "All open deals" filter (its pipedriveFilterId is always 86
  // in this account) the very first time anyone ever opens this page — matches what Pipedrive
  // itself shows by default (closed deals hidden) instead of every historical deal ever backfilled.
  // `isFirstEverVisit` is captured once, during the initial render's state initializer — BEFORE any
  // effect runs. Checking localStorage from inside a useEffect instead raced against
  // usePersistedState's own persistence effect for this same key, which writes the default `null`
  // back to localStorage on mount before a later-registered effect ever got a chance to see it as
  // untouched — so it appeared "already set" even on a genuine first visit.
  const [isFirstEverVisit] = useState(() => window.localStorage.getItem('qpaint:crmBoard:savedFilterId') == null)
  useEffect(() => {
    if (!isFirstEverVisit || !savedFilters.length) return
    const defaultFilter = savedFilters.find((f) => f.pipedriveFilterId === 86 && f.supported)
    if (defaultFilter) setSavedFilterId(defaultFilter.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFirstEverVisit, savedFilters])

  const sortedPipelines = useMemo(() => [...pipelines].sort((a, b) => a.order - b.order), [pipelines])
  const activePipelineId = pipelineId && sortedPipelines.some((p) => p.id === pipelineId) ? pipelineId : (sortedPipelines[0]?.id ?? '')
  const activePipeline = sortedPipelines.find((p) => p.id === activePipelineId)
  const isSalesPipeline = activePipeline?.pipedrivePipelineId === SALES_PIPELINE_PIPEDRIVE_ID

  const pipelineStages = useMemo(
    () => stages.filter((s) => s.pipelineId === activePipelineId).sort((a, b) => a.order - b.order),
    [stages, activePipelineId],
  )
  const stageIdsKey = pipelineStages.map((s) => s.id).join(',')

  // Won/Lost Sales Pipeline deals are hidden by default (see crm-data.mts) — these toggles bring
  // them back into view without deleting/losing anything; not persisted, since "show closed
  // deals" is a temporary look-something-up need, not a lasting view preference like the other
  // board state. (Picking a filter that already targets status — e.g. a "Lost deals" saved
  // filter — works on its own without needing these; see crm-data.mts's statusAlreadyGoverned.)
  const [showWon, setShowWon] = useState(false)
  const [showLost, setShowLost] = useState(false)
  // Same idea for any stage configured with an auto-hide age (currently just Jobs Pipeline's
  // "All Done & Paid", 180 days) — only shown when the active pipeline actually has one.
  const [showArchived, setShowArchived] = useState(false)
  const hasArchivableStage = useMemo(() => pipelineStages.some((s) => s.autoHideAfterDays != null), [pipelineStages])

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
      savedFilterId: savedFilterId ?? undefined,
      includeWon: isSalesPipeline && showWon,
      includeLost: isSalesPipeline && showLost,
      includeAged: hasArchivableStage && showArchived,
    }),
    [debouncedSearch, sort, conditions, matchMode, savedFilterId, isSalesPipeline, showWon, showLost, hasArchivableStage, showArchived],
  )

  // A pipeline-wide count/$ summary, grouped by stage — crm-data.mts computes it under the current
  // pipeline/search/filter scope regardless of whether the request was stage-scoped (Kanban) or
  // not (Table), so both view modes feed the same map. Summing every entry gives the "N deals ·
  // $X total" card at the top of the board, always accurate regardless of how many rows either
  // view has actually loaded into the DOM.
  const [stageSummary, setStageSummary] = useState<Record<string, CrmStageSummary>>({})
  const [stageAvgDwellDays, setStageAvgDwellDays] = useState<Record<string, number>>({})

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
      setStageSummary((prev) => {
        const next = { ...prev }
        for (const s of result.stageSummary) next[s.stageId] = s
        return next
      })
      setStageAvgDwellDays((prev) => ({ ...prev, ...result.stageAvgDwellDays }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load deals')
    } finally {
      setTableInitialLoading(false)
      setTableLoadingMore(false)
    }
  }

  // ---- Kanban mode: one lazily-extended page PER stage ----
  const [columnState, setColumnState] = useState<Record<string, ColumnState>>({})

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
      setStageAvgDwellDays((prev) => ({ ...prev, ...result.stageAvgDwellDays }))
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
    setStageSummary({}) // stage ids are pipeline-specific uuids — stale entries from a previous
    // pipeline/filter scope would otherwise never get overwritten, just silently accumulate.
    setStageAvgDwellDays({})
    if (viewMode === 'table') {
      setTableDeals([])
      setTableTotal(0)
      fetchTablePage(0, false)
    } else {
      setColumnState({})
      for (const stage of pipelineStages) fetchStagePage(stage.id, 0, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePipelineId, viewMode, queryScope, stageIdsKey])

  // ---- "Sync from Pipedrive" — an on-demand catch-up for the pipeline currently in view, on top
  // of the two webhooks that keep things current automatically going forward. Phase 1 (fetching
  // every deal from Pipedrive) runs once up front so the tracked job has a known total; phase 2
  // (upserting each in chunks) runs via ImportProgressContext so it survives navigating away. ----
  const { job, runImport } = useImportProgress()
  const [syncFetching, setSyncFetching] = useState(false)
  const lastSyncResultRef = useRef<{ created: number; updated: number; skipped: number } | null>(null)
  const handledSyncJobRef = useRef<string | null>(null)

  async function handleSyncPipeline() {
    if (!activePipeline) return
    setSyncFetching(true)
    try {
      const { deals, total } = await fetchPipelineDealsFromPipedrive(activePipeline.id)
      const label = `Sync ${activePipeline.name} from Pipedrive`
      const started = runImport(label, total, async (onProgress) => {
        const result = await chunkedSyncPipelineDeals(activePipeline.id, deals, onProgress)
        lastSyncResultRef.current = result
        return { imported: result.created + result.updated }
      })
      if (!started) toast.error('A sync or import is already running — wait for it to finish first.')
      else toast.success(`Syncing ${total.toLocaleString()} deals from ${activePipeline.name} in the background…`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to fetch deals from Pipedrive')
    } finally {
      setSyncFetching(false)
    }
  }

  // Once a sync job finishes, refresh whichever view is currently on screen so the newly-synced
  // rows actually show up without a manual reload.
  useEffect(() => {
    if (!job || job.status !== 'done' || !job.label.startsWith('Sync ') || handledSyncJobRef.current === job.id) return
    handledSyncJobRef.current = job.id
    const result = lastSyncResultRef.current
    toast.success(result ? `Sync complete — ${result.created} new, ${result.updated} updated, ${result.skipped} skipped` : 'Sync complete')
    if (viewMode === 'table') fetchTablePage(0, false)
    else for (const stage of pipelineStages) fetchStagePage(stage.id, 0, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job])

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
      else toast.success('Saved')
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
  // Full stage objects, for the Table view's per-deal rot-tier lookup (needs each stage's own
  // thresholds, not just its name/color).
  const stageById = useMemo(() => new Map(pipelineStages.map((s) => [s.id, s])), [pipelineStages])
  // A stage keeps its own saved color if set (via Deals > Configure); otherwise falls back to a
  // stable palette color by position, so every stage is visually distinct even before anyone's
  // gone in and picked colors deliberately.
  const stageColorById = useMemo(
    () => new Map(pipelineStages.map((s, i) => [s.id, s.color || colorForIndex(i)])),
    [pipelineStages],
  )

  // Live option lists for the Advanced Filter's two custom-field conditions — resolved by label
  // since crm_field_definitions.key is an opaque, account-specific Pipedrive hash.
  const categoryOptions = useMemo(() => {
    const def = fieldDefinitions.find((f) => f.label === 'Category Type')
    return (def?.options ?? []).map((o) => ({ value: o.id, label: o.label }))
  }, [fieldDefinitions])
  const referralSourceOptions = useMemo(() => {
    const def = fieldDefinitions.find((f) => f.label === 'Referral Source')
    return (def?.options ?? []).map((o) => ({ value: o.id, label: o.label }))
  }, [fieldDefinitions])

  // Sum of every loaded stage's summary — accurate for the whole current pipeline/search/filter
  // scope regardless of which view is active or how much of it has actually loaded into the DOM,
  // since crm-data.mts computes stageSummary un-paginated either way.
  const pipelineSummary = useMemo(() => {
    const rows = Object.values(stageSummary)
    const count = rows.reduce((sum, s) => sum + s.count, 0)
    const masked = rows.some((s) => s.totalValue === null)
    const totalValue = masked ? null : rows.reduce((sum, s) => sum + (s.totalValue ?? 0), 0)
    return { count, totalValue }
  }, [stageSummary])

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

        {/* Same "count + total value" concept Pipedrive shows in its per-pipeline popup — compact,
            beside the pipeline picker, not a full-width strip with dead space in the middle. */}
        <Card className="ml-auto flex flex-row shrink-0 items-center gap-4 border-none bg-info-bg px-4 py-2 text-info">
          <div className="text-center">
            <p className="text-[10px] font-medium tracking-wide uppercase opacity-80">Deals</p>
            <p className="text-base leading-tight font-semibold">{pipelineSummary.count.toLocaleString()}</p>
          </div>
          <div className="h-px w-6 bg-info/25" />
          <div className="text-center">
            <p className="text-[10px] font-medium tracking-wide uppercase opacity-80">Total Value</p>
            <p className="text-base leading-tight font-semibold">
              {pipelineSummary.totalValue === null ? '—' : formatCurrency(pipelineSummary.totalValue)}
            </p>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isSalesPipeline && (
          <Button
            variant={showWon ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowWon((v) => !v)}
            title="Won deals are hidden by default once promoted to a Job — toggle to bring them back into view"
          >
            {showWon ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {showWon ? 'Showing Won' : 'Show Won'}
          </Button>
        )}
        {isSalesPipeline && (
          <Button
            variant={showLost ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowLost((v) => !v)}
            title="Lost deals are hidden by default — toggle to bring them back into view"
          >
            {showLost ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {showLost ? 'Showing Lost' : 'Show Lost'}
          </Button>
        )}
        {hasArchivableStage && (
          <Button
            variant={showArchived ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
            title="Deals sitting a long time in an auto-archive stage (e.g. All Done & Paid) are hidden by default — toggle to bring them back into view"
          >
            {showArchived ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {showArchived ? 'Showing Archived' : 'Show Archived'}
          </Button>
        )}
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, client…" className="pl-8" />
        </div>
        <SavedFilterDropdown filters={savedFilters} activeId={savedFilterId} onSelect={setSavedFilterId} />
        <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>
          <ListFilter /> Advanced filter
          {conditions.length > 0 && <Badge variant="secondary">{conditions.length}</Badge>}
        </Button>
        {conditions.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setConditions([])}>
            <X /> Clear filter
          </Button>
        )}
        {/* Last button in the toolbar, deliberately — everything above narrows/reads the current
            view; this is the one action that reaches out to Pipedrive. */}
        {canManage && activePipeline?.pipedrivePipelineId && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncPipeline}
            disabled={syncFetching || job?.status === 'running'}
            title={`Pull every deal in ${activePipeline.name} from Pipedrive and catch up its stage/status here`}
          >
            <RefreshCw className={cn('size-3.5', (syncFetching || (job?.status === 'running' && job.label.startsWith('Sync'))) && 'animate-spin')} />
            {syncFetching ? 'Fetching…' : `Sync ${activePipeline.name}`}
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
                      className={cn('cursor-pointer', dealRowClassName(deal, stageById.get(deal.stageId)))}
                      onClick={() => openDeal(deal)}
                    >
                      <TableCell className="font-medium">{deal.title}</TableCell>
                      <TableCell className="text-muted-foreground">{deal.orgName || deal.personName || '—'}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stageColorById.get(deal.stageId) }} />
                          {stageNameById.get(deal.stageId) ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell>{deal.value === null ? '—' : formatCurrency(deal.value)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge status={deal.status} />
                          <RotBadge deal={deal} stage={stageById.get(deal.stageId)} />
                          <NoJobBadge deal={deal} />
                        </div>
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
                color={stageColorById.get(stage.id) ?? '#94A3B8'}
                avgDwellDays={stageAvgDwellDays[stage.id]}
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
        categoryOptions={categoryOptions}
        referralSourceOptions={referralSourceOptions}
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
