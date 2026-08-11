import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useData } from '@/context/DataContext'
import { useCurrentUser } from '@/context/AuthContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { usePersistedState } from '@/hooks/usePersistedState'
import { useInfiniteScrollSentinel } from '@/hooks/useInfiniteScrollSentinel'
import { canManageTargets, isOfficeRole } from '@/lib/permissions'
import { jobDisplayName } from '@/lib/jobDisplay'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CategoryPill } from '@/components/StatusBadges'
import { ClientTypeIcon } from '@/components/ClientTypeIcon'
import { TeamColorDot } from '@/components/TeamColorDot'
import { StagePill } from '@/components/StagePill'
import { TargetConfigDialog } from '@/components/TargetConfigDialog'
import { MultiSelectFilter } from '@/components/MultiSelectFilter'
import { formatCurrency, weeklyFromMonthly } from '@/lib/formulas'
import {
  addDays,
  addMonths,
  formatDateRange,
  formatMonthLabel,
  monthEnd,
  monthStart,
  weekEnd,
  weekStart,
} from '@/lib/schedule'
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  LayoutGrid,
  MapPin,
  Pencil,
  Percent,
  Rows3,
  Search,
  Settings,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  X,
} from 'lucide-react'
import type { JobProgress } from '@/lib/dataAccess'
import type { CrmStage, Job, Team } from '@/types'

/** Shared Production % inline-edit behavior — used by both the card and table row views so they
 * stay in perfect sync rather than duplicating the save/resync logic twice. Actual/Target Hours
 * have no editing here at all — both are sourced directly from Pipedrive. */
function useJobProgressEditing(job: Job, progress: JobProgress) {
  const { updateJobProduction } = useData()
  const [editingProduction, setEditingProduction] = useState(false)
  const [productionValue, setProductionValue] = useState(0)
  const [savingProduction, setSavingProduction] = useState(false)

  function openEditProduction() {
    setProductionValue(Math.round(Math.min(100, Math.max(0, progress.productionPercent))))
    setEditingProduction(true)
  }

  async function handleSaveProduction() {
    setSavingProduction(true)
    try {
      await updateJobProduction(job.id, productionValue)
      toast.success('Production % updated')
      setEditingProduction(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update production %')
    } finally {
      setSavingProduction(false)
    }
  }

  async function handleResyncProduction() {
    setSavingProduction(true)
    try {
      await updateJobProduction(job.id, null)
      toast.success('Resynced to computed production %')
      setEditingProduction(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to resync')
    } finally {
      setSavingProduction(false)
    }
  }

  return {
    editingProduction,
    productionValue,
    setProductionValue,
    savingProduction,
    openEditProduction,
    handleSaveProduction,
    handleResyncProduction,
    cancelEditProduction: () => setEditingProduction(false),
  }
}

function JobProgressCard({
  job,
  progress,
  teams,
  stage,
  canEditProgress,
}: {
  job: Job
  progress: JobProgress
  teams: Team[]
  stage: CrmStage | undefined
  /** Any office/admin role can log what's actually done — this isn't gated to Owner/Ops Manager
   * like Configure Targets, since it's someone checking the job and typing what they found. */
  canEditProgress: boolean
}) {
  const { clients } = useData()
  const client = clients.find((c) => c.id === job.clientId)
  const {
    editingProduction,
    productionValue,
    setProductionValue,
    savingProduction,
    openEditProduction,
    handleSaveProduction,
    handleResyncProduction,
    cancelEditProduction,
  } = useJobProgressEditing(job, progress)
  const hoursPercent = progress.targetHours > 0 ? (progress.actualHours / progress.targetHours) * 100 : progress.actualHours > 0 ? 100 : 0

  return (
    <Card
      className={cn(
        'gap-3 border-l-4 p-4 transition hover:shadow-md',
        progress.isOverBudget ? 'border-l-danger' : 'border-l-transparent',
      )}
    >
      <div className="space-y-2">
        <div className="min-w-0 space-y-0.5">
          <Link to={`/jobs/${job.id}`} className="flex items-center gap-1.5 text-sm font-semibold hover:underline">
            <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{jobDisplayName(job)}</span>
          </Link>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {client && <ClientTypeIcon type={client.type} />}
            {client?.name ?? 'Unknown client'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryPill category={job.category} />
          {stage && <StagePill stage={stage} />}
          {teams.map((t) => (
            <span key={t.id} className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              <TeamColorDot team={t} />
              {t.name}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Percent className="size-3.5" /> Production
          </p>
          {!editingProduction && (
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                {job.productionPercentSource === 'manual' ? 'Manual' : 'Computed'}
              </Badge>
              {canEditProgress && (
                <button
                  onClick={openEditProduction}
                  aria-label="Edit production percent"
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {editingProduction ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Slider
                value={[productionValue]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => setProductionValue(Array.isArray(v) ? v[0] : v)}
                className="flex-1"
              />
              <span className="w-12 shrink-0 text-right text-sm font-medium">{productionValue}%</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" className="h-7" onClick={handleSaveProduction} disabled={savingProduction}>Save</Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={cancelEditProduction} disabled={savingProduction}>Cancel</Button>
              {job.productionPercentSource === 'manual' && (
                <Button size="sm" variant="outline" className="h-7" onClick={handleResyncProduction} disabled={savingProduction}>Resync</Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-success-fill transition-[width]"
                  style={{ width: `${Math.min(100, Math.max(0, progress.productionPercent))}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-sm font-semibold">{Math.round(progress.productionPercent)}%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(progress.actualDollars)} <span className="text-muted-foreground/60">of</span> {formatCurrency(progress.dealValue)}
            </p>
          </>
        )}
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="size-3.5" /> Hours
          </p>
          {progress.isOverBudget && (
            <span className="flex items-center gap-1 rounded-md bg-danger-bg px-1.5 py-0.5 text-xs font-medium text-danger animate-pulse">
              <TriangleAlert className="size-3" /> Over budget
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-[width]', progress.isOverBudget ? 'bg-danger-fill' : 'bg-info-fill')}
              style={{ width: `${Math.min(100, Math.max(0, hoursPercent))}%` }}
            />
          </div>
          <span className={cn('w-12 shrink-0 text-right text-sm font-semibold', progress.isOverBudget && 'text-danger')}>
            {Math.round(hoursPercent)}%
          </span>
        </div>
        <p className={cn('text-xs', progress.isOverBudget ? 'font-medium text-danger' : 'text-muted-foreground')}>
          {Math.round(progress.actualHours)} <span className={progress.isOverBudget ? '' : 'text-muted-foreground/60'}>of</span> {progress.targetHours} hrs
        </p>
      </div>
    </Card>
  )
}

/** Same data + editing behavior as JobProgressCard, laid out as a table row for the dense Table
 * view — shares useJobProgressEditing so both views always agree and stay perfectly in sync. */
function JobProgressTableRow({
  job,
  progress,
  teams,
  stage,
  canEditProgress,
}: {
  job: Job
  progress: JobProgress
  teams: Team[]
  stage: CrmStage | undefined
  canEditProgress: boolean
}) {
  const { clients } = useData()
  const client = clients.find((c) => c.id === job.clientId)
  const {
    editingProduction,
    productionValue,
    setProductionValue,
    savingProduction,
    openEditProduction,
    handleSaveProduction,
    handleResyncProduction,
    cancelEditProduction,
  } = useJobProgressEditing(job, progress)
  const hoursPercent = progress.targetHours > 0 ? (progress.actualHours / progress.targetHours) * 100 : progress.actualHours > 0 ? 100 : 0

  return (
    <TableRow className={cn(progress.isOverBudget && 'bg-danger-bg/30 hover:bg-danger-bg/40')}>
      <TableCell className="max-w-56">
        <Link to={`/jobs/${job.id}`} className="flex items-center gap-1.5 text-sm font-medium hover:underline">
          <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{jobDisplayName(job)}</span>
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {client && <ClientTypeIcon type={client.type} />}
          <span className="truncate">{client?.name ?? 'Unknown client'}</span>
        </span>
      </TableCell>
      <TableCell>
        <CategoryPill category={job.category} />
      </TableCell>
      <TableCell>{stage ? <StagePill stage={stage} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          {teams.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
          {teams.map((t) => (
            <span key={t.id} className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              <TeamColorDot team={t} />
              {t.name}
            </span>
          ))}
        </div>
      </TableCell>
      <TableCell>
        {editingProduction ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              type="number"
              min={0}
              max={100}
              value={productionValue}
              onChange={(e) => setProductionValue(Number(e.target.value))}
              className="h-7 w-16"
              autoFocus
            />
            <Button size="sm" className="h-7" onClick={handleSaveProduction} disabled={savingProduction}>Save</Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={cancelEditProduction} disabled={savingProduction}>Cancel</Button>
            {job.productionPercentSource === 'manual' && (
              <Button size="sm" variant="outline" className="h-7" onClick={handleResyncProduction} disabled={savingProduction}>Resync</Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success-fill"
                style={{ width: `${Math.min(100, Math.max(0, progress.productionPercent))}%` }}
              />
            </div>
            <span className="text-sm font-medium">{Math.round(progress.productionPercent)}%</span>
            {canEditProgress && (
              <button
                onClick={openEditProduction}
                aria-label="Edit production percent"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-medium', progress.isOverBudget && 'text-danger')}>
            {Math.round(progress.actualHours)} / {progress.targetHours}
          </span>
          <span className="text-xs text-muted-foreground">({Math.round(hoursPercent)}%)</span>
        </div>
      </TableCell>
      <TableCell>
        {progress.isOverBudget ? (
          <span className="flex items-center gap-1 rounded-md bg-danger-bg px-1.5 py-0.5 text-xs font-medium text-danger">
            <TriangleAlert className="size-3" /> Over budget
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">On track</span>
        )}
      </TableCell>
    </TableRow>
  )
}

export function CapacityBoard() {
  const { jobs, clients, teams, scheduleBlocks, monthlyTargets, jobStages } = useData()
  const currentUser = useCurrentUser()
  const da = useDataAccess()
  const [isMonthly, setIsMonthly] = usePersistedState('qpaint:capacity:isMonthly', false)
  // Persisted (not just useState(() => new Date())) so History-browsing survives a refresh, same
  // as ResourceCalendar's own anchor — previously this was frozen at "today" with no way to look
  // at a past week/month at all.
  const [anchor, setAnchor] = usePersistedState<Date>('qpaint:capacity:anchor', new Date(), {
    serialize: (d) => d.toISOString(),
    deserialize: (s) => new Date(s),
  })
  const [targetDialogOpen, setTargetDialogOpen] = useState(false)
  const [jobSearch, setJobSearch] = usePersistedState('qpaint:capacity:jobSearch', '')
  const [teamFilter, setTeamFilter] = usePersistedState<string[]>('qpaint:capacity:teamFilter', [])
  const [stageFilter, setStageFilter] = usePersistedState<string[]>('qpaint:capacity:stageFilter', [])
  const [overBudgetOnly, setOverBudgetOnly] = usePersistedState('qpaint:capacity:overBudgetOnly', false)
  const [jobsView, setJobsView] = usePersistedState<'cards' | 'table'>('qpaint:capacity:jobsView', 'cards')

  const windowStart = isMonthly ? monthStart(anchor) : weekStart(anchor)
  const windowEnd = isMonthly ? monthEnd(anchor) : weekEnd(weekStart(anchor))

  // Never allow browsing into a period that hasn't happened yet — there's no actual production
  // data for the future, so "next" stops dead at the current week/month.
  const currentPeriodStart = isMonthly ? monthStart(new Date()) : weekStart(new Date())
  const atCurrentOrFuturePeriod = windowStart.getTime() >= currentPeriodStart.getTime()

  function goPrev() {
    setAnchor((a) => (isMonthly ? addMonths(a, -1) : addDays(a, -7)))
  }
  function goNext() {
    if (atCurrentOrFuturePeriod) return
    setAnchor((a) => (isMonthly ? addMonths(a, 1) : addDays(a, 7)))
  }
  function goToday() {
    setAnchor(new Date())
  }

  const scheduledTotal = da.getScheduledDollarsInWindow(windowStart, windowEnd)

  const stageById = useMemo(() => new Map(jobStages.map((s) => [s.id, s])), [jobStages])

  // Only jobs already booked onto the Calendar ever appear here — scoping to scheduleBlocks, not
  // just "every job", is what keeps quoted-but-unscheduled work off the Production page.
  const activeJobs = useMemo(
    () => jobs.filter((j) => scheduleBlocks.some((b) => b.jobId === j.id)),
    [jobs, scheduleBlocks],
  )
  const jobRows = useMemo(
    () =>
      activeJobs.map((job) => ({
        job,
        progress: da.getJobProgress(job),
        teams: Array.from(new Set(scheduleBlocks.filter((b) => b.jobId === job.id).map((b) => b.teamId)))
          .map((teamId) => teams.find((t) => t.id === teamId))
          .filter((t): t is (typeof teams)[number] => !!t),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeJobs, scheduleBlocks, teams],
  )

  // Options are scoped to teams/stages actually present among booked jobs — same "only offer what's
  // actually in use" convention as JobsList.tsx's own stage filter — not the full teams/jobStages
  // lists, which would offer choices that can never match anything here.
  const teamOptions = useMemo(() => Array.from(new Set(jobRows.flatMap((r) => r.teams.map((t) => t.name)))).sort(), [jobRows])
  const stageOptions = useMemo(
    () =>
      Array.from(new Set(jobRows.map((r) => (r.job.stageId ? stageById.get(r.job.stageId)?.name : undefined)).filter((n): n is string => !!n))).sort(),
    [jobRows, stageById],
  )

  const filteredJobRows = useMemo(() => {
    const q = jobSearch.trim().toLowerCase()
    return jobRows.filter(({ job, progress, teams: jobTeams }) => {
      if (teamFilter.length > 0 && !jobTeams.some((t) => teamFilter.includes(t.name))) return false
      if (stageFilter.length > 0) {
        const stageName = job.stageId ? stageById.get(job.stageId)?.name : undefined
        if (!stageName || !stageFilter.includes(stageName)) return false
      }
      if (overBudgetOnly && !progress.isOverBudget) return false
      if (!q) return true
      const client = clients.find((c) => c.id === job.clientId)
      return jobDisplayName(job).toLowerCase().includes(q) || (client?.name ?? '').toLowerCase().includes(q)
    })
  }, [jobRows, jobSearch, teamFilter, stageFilter, overBudgetOnly, clients, stageById])

  const jobsFiltered = jobSearch.trim() !== '' || teamFilter.length > 0 || stageFilter.length > 0 || overBudgetOnly

  // This list scopes to every job ever booked onto the Calendar (activeJobs above), not the
  // current week/month window, so for a busy multi-year account it trends toward the size of the
  // whole jobs table — confirmed as the cause of this page rendering hundreds of cards/rows at
  // once with no windowing at all. Reveals in batches instead, same reveal-on-scroll pattern as
  // JobsList.tsx's Kanban columns — no network wait needed since the data's already in memory via
  // DataContext, this purely caps DOM node count.
  const JOB_REVEAL_STEP = 30
  const [visibleJobCount, setVisibleJobCount] = useState(JOB_REVEAL_STEP)
  useEffect(() => setVisibleJobCount(JOB_REVEAL_STEP), [filteredJobRows])
  const visibleJobRows = filteredJobRows.slice(0, visibleJobCount)
  const hasMoreJobRows = visibleJobRows.length < filteredJobRows.length
  const jobRowsSentinelRef = useInfiniteScrollSentinel({
    onLoadMore: () => setVisibleJobCount((n) => n + JOB_REVEAL_STEP),
    hasMore: hasMoreJobRows,
    loading: false,
    root: null,
  })

  const monthlyTargetRow = monthlyTargets.find((t) => t.year === anchor.getFullYear() && t.month === anchor.getMonth() + 1)
  const monthlyTargetDollars = monthlyTargetRow?.targetDollars ?? 0
  const targetTotal = isMonthly ? monthlyTargetDollars : weeklyFromMonthly(monthlyTargetDollars)
  const gap = scheduledTotal - targetTotal

  // Same window-scoped formula ResourceCalendar's own Actual card uses (getActualDollarsInWindow) —
  // previously this summed each job's whole cumulative Actual $ regardless of window, which is why
  // toggling Weekly/Monthly never changed the number here even though it does on the Scheduler.
  const actualTotal = da.getActualDollarsInWindow(windowStart, windowEnd)

  const canManage = canManageTargets(currentUser.role)
  const canEditProgress = isOfficeRole(currentUser.role)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={goPrev} aria-label={isMonthly ? 'Previous month' : 'Previous week'}>
            <ChevronLeft />
          </Button>
          <h1 className="text-lg font-medium">
            {isMonthly ? formatMonthLabel(windowStart) : `Week of ${formatDateRange(windowStart, windowEnd)}`}
          </h1>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={goNext}
            disabled={atCurrentOrFuturePeriod}
            aria-label={isMonthly ? 'Next month' : 'Next week'}
          >
            <ChevronRight />
          </Button>
          {!atCurrentOrFuturePeriod && (
            <Button size="sm" variant="ghost" onClick={goToday}>
              Today
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5 rounded-md border border-border bg-card p-1">
            <Button size="sm" variant={!isMonthly ? 'secondary' : 'ghost'} onClick={() => setIsMonthly(false)}>
              Weekly
            </Button>
            <Button size="sm" variant={isMonthly ? 'secondary' : 'ghost'} onClick={() => setIsMonthly(true)}>
              Monthly
            </Button>
          </div>
          <Button size="sm" variant="outline" render={<Link to="/capacity/history" />}>
            <History /> History
          </Button>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setTargetDialogOpen(true)}>
              <Settings /> Configure targets
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-2 p-4 transition hover:shadow-md">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Target className="size-4" />
            </span>
            <p className="text-xs text-muted-foreground">{isMonthly ? 'Monthly target' : 'Weekly target'}</p>
          </div>
          <p className="text-2xl font-semibold tracking-tight">{formatCurrency(targetTotal)}</p>
          {!monthlyTargetRow && (
            <p className="text-xs text-muted-foreground">No target set for this month</p>
          )}
        </Card>
        <Card className="gap-2 p-4 transition hover:shadow-md">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info-bg text-info">
              <CalendarCheck className="size-4" />
            </span>
            <p className="text-xs text-muted-foreground">Scheduled this {isMonthly ? 'month' : 'week'}</p>
          </div>
          <p className="text-2xl font-semibold tracking-tight">{formatCurrency(scheduledTotal)}</p>
        </Card>
        <Card className="gap-2 p-4 transition hover:shadow-md">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-bg text-success">
              <TrendingUp className="size-4" />
            </span>
            <p className="text-xs text-muted-foreground">Actual</p>
          </div>
          <p className="text-2xl font-semibold tracking-tight">{formatCurrency(actualTotal)}</p>
          <p className="text-xs text-muted-foreground">Production % × deal value, jobs scheduled this {isMonthly ? 'month' : 'week'}</p>
        </Card>
        <Card className={cn('gap-2 p-4 transition hover:shadow-md', gap < 0 ? 'bg-warning-bg' : 'bg-success-bg')}>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full',
                gap < 0 ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success',
              )}
            >
              {gap < 0 ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />}
            </span>
            <p className={cn('text-xs', gap < 0 ? 'text-warning' : 'text-success')}>Gap to target</p>
          </div>
          <p className={cn('text-2xl font-semibold tracking-tight', gap < 0 ? 'text-warning' : 'text-success')}>{formatCurrency(gap)}</p>
        </Card>
      </div>

      <TargetConfigDialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-medium">
              Jobs
              {jobRows.length > 0 && (
                <Badge variant="secondary">
                  {jobsFiltered ? `${filteredJobRows.length} / ${jobRows.length}` : jobRows.length}
                </Badge>
              )}
            </h2>
            <p className="text-xs text-muted-foreground">Active jobs already on the Calendar — Production % and Hours tracked per job.</p>
          </div>
          <div className="flex gap-1.5 rounded-md border border-border bg-card p-1">
            <Button size="sm" variant={jobsView === 'cards' ? 'secondary' : 'ghost'} onClick={() => setJobsView('cards')}>
              <LayoutGrid /> Cards
            </Button>
            <Button size="sm" variant={jobsView === 'table' ? 'secondary' : 'ghost'} onClick={() => setJobsView('table')}>
              <Rows3 /> Table
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              placeholder="Search job, address, client…"
              className="pl-8"
            />
          </div>
          <MultiSelectFilter label="Teams" options={teamOptions} selected={teamFilter} onChange={setTeamFilter} />
          <MultiSelectFilter label="Stage" options={stageOptions} selected={stageFilter} onChange={setStageFilter} />
          <button
            type="button"
            onClick={() => setOverBudgetOnly((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition',
              overBudgetOnly ? 'border-danger/40 bg-danger-bg text-danger' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            <TriangleAlert className="size-3.5" /> Over budget only
          </button>
          {jobsFiltered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setJobSearch('')
                setTeamFilter([])
                setStageFilter([])
                setOverBudgetOnly(false)
              }}
            >
              <X /> Clear
            </Button>
          )}
        </div>

        {jobsView === 'cards' ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredJobRows.length === 0 && (
              <p className="col-span-full rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                {jobRows.length === 0
                  ? "No active jobs scheduled yet — jobs appear here once they're on the Calendar."
                  : 'No jobs match your search / filter.'}
              </p>
            )}
            {visibleJobRows.map(({ job, progress, teams: jobTeams }) => (
              <JobProgressCard
                key={job.id}
                job={job}
                progress={progress}
                teams={jobTeams}
                stage={job.stageId ? stageById.get(job.stageId) : undefined}
                canEditProgress={canEditProgress}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Crews</TableHead>
                  <TableHead>Production</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      {jobRows.length === 0
                        ? "No active jobs scheduled yet — jobs appear here once they're on the Calendar."
                        : 'No jobs match your search / filter.'}
                    </TableCell>
                  </TableRow>
                )}
                {visibleJobRows.map(({ job, progress, teams: jobTeams }) => (
                  <JobProgressTableRow
                    key={job.id}
                    job={job}
                    progress={progress}
                    teams={jobTeams}
                    stage={job.stageId ? stageById.get(job.stageId) : undefined}
                    canEditProgress={canEditProgress}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {/* Always rendered so the IntersectionObserver has a stable node to attach to from the
            first render — same reasoning as CrmBoard.tsx's matching sentinel. Shared by both views
            since only one is ever mounted at a time. */}
        <div ref={jobRowsSentinelRef} className="py-2 text-center text-xs text-muted-foreground">
          {hasMoreJobRows ? 'Loading more…' : ''}
        </div>
      </section>
    </div>
  )
}
