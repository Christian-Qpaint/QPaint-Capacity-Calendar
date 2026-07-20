import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useData } from '@/context/DataContext'
import { useCurrentUser } from '@/context/AuthContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { canManageTargets, isOfficeRole } from '@/lib/permissions'
import { PIPEDRIVE_TARGET_STAGE_IDS } from '@/lib/pipedriveStages'
import { jobDisplayName } from '@/lib/jobDisplay'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { CategoryPill } from '@/components/StatusBadges'
import { ClientTypeIcon } from '@/components/ClientTypeIcon'
import { TeamColorDot } from '@/components/TeamColorDot'
import { TargetConfigDialog } from '@/components/TargetConfigDialog'
import { formatCurrency, weeklyFromMonthly } from '@/lib/formulas'
import {
  formatDateRange,
  formatMonthLabel,
  monthEnd,
  monthStart,
  weekEnd,
  weekStart,
} from '@/lib/schedule'
import { History, MapPin, Pencil, Settings, TriangleAlert } from 'lucide-react'
import type { JobProgress } from '@/lib/dataAccess'
import type { Job, Team } from '@/types'

function JobProgressCard({
  job,
  progress,
  teams,
  canEditProgress,
}: {
  job: Job
  progress: JobProgress
  teams: Team[]
  /** Any office/admin role can log what's actually done — this isn't gated to Owner/Ops Manager
   * like Configure Targets, since it's someone checking the job and typing what they found. */
  canEditProgress: boolean
}) {
  const { clients, updateJobActualHours, updateJobProduction } = useData()
  const client = clients.find((c) => c.id === job.clientId)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingProduction, setEditingProduction] = useState(false)
  const [productionValue, setProductionValue] = useState(0)
  const [savingProduction, setSavingProduction] = useState(false)
  const hoursPercent = progress.targetHours > 0 ? (progress.actualHours / progress.targetHours) * 100 : progress.actualHours > 0 ? 100 : 0

  function openEdit() {
    setValue(String(Math.round(progress.actualHours)))
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateJobActualHours(job.id, Number(value) || 0)
      toast.success('Actual hours updated')
      setEditing(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update actual hours')
    } finally {
      setSaving(false)
    }
  }

  async function handleResync() {
    setSaving(true)
    try {
      await updateJobActualHours(job.id, null)
      toast.success(`Resynced to logged hours (${Math.round(progress.loggedHours)} hrs)`)
      setEditing(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to resync')
    } finally {
      setSaving(false)
    }
  }

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

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <Link to={`/jobs/${job.id}`} className="flex items-center gap-1.5 text-sm font-medium hover:underline">
            <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{jobDisplayName(job)}</span>
          </Link>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {client && <ClientTypeIcon type={client.type} />}
            {client?.name ?? 'Unknown client'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <CategoryPill category={job.category} />
          {teams.map((t) => (
            <span key={t.id} className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              <TeamColorDot team={t} />
              {t.name}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Production</p>

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
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingProduction(false)} disabled={savingProduction}>Cancel</Button>
              {job.productionPercentSource === 'manual' && (
                <Button size="sm" variant="outline" className="h-7" onClick={handleResyncProduction} disabled={savingProduction}>Resync</Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-success-fill" style={{ width: `${Math.min(100, Math.max(0, progress.productionPercent))}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right text-sm font-medium">{Math.round(progress.productionPercent)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {formatCurrency(progress.actualDollars)} / {formatCurrency(progress.dealValue)}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {job.productionPercentSource === 'manual' ? 'Manual' : 'Computed'}
                </span>
                {canEditProgress && (
                  <button onClick={openEditProduction} aria-label="Edit production percent">
                    <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Hours</p>
          {progress.isOverBudget && (
            <span className="flex items-center gap-1 rounded-md bg-danger-bg px-1.5 py-0.5 text-xs font-medium text-danger animate-pulse">
              <TriangleAlert className="size-3" /> Over budget
            </span>
          )}
        </div>

        {editing ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-7 w-24"
              autoFocus
            />
            <span className="text-xs text-muted-foreground">/ {progress.targetHours} hrs</span>
            <Button size="sm" className="h-7" onClick={handleSave} disabled={saving}>Save</Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            {job.actualHoursSource === 'manual' && (
              <Button size="sm" variant="outline" className="h-7" onClick={handleResync} disabled={saving}>Resync</Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full ${progress.isOverBudget ? 'bg-danger-fill' : 'bg-info-fill'}`}
                  style={{ width: `${Math.min(100, Math.max(0, hoursPercent))}%` }}
                />
              </div>
              <span className={`w-12 shrink-0 text-right text-sm font-medium ${progress.isOverBudget ? 'text-danger' : ''}`}>
                {Math.round(hoursPercent)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${progress.isOverBudget ? 'text-danger' : 'text-foreground'}`}>
                {Math.round(progress.actualHours)} / {progress.targetHours} hrs
              </span>
              <div className="flex items-center gap-1.5">
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {job.actualHoursSource === 'manual' ? 'Manual' : 'Logged'}
                </span>
                {canEditProgress && (
                  <button onClick={openEdit} aria-label="Edit actual hours">
                    <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

export function CapacityBoard() {
  const { jobs, teams, scheduleBlocks, monthlyTargets } = useData()
  const currentUser = useCurrentUser()
  const da = useDataAccess()
  const [isMonthly, setIsMonthly] = useState(false)
  const [anchor] = useState(() => new Date())
  const [targetDialogOpen, setTargetDialogOpen] = useState(false)

  const windowStart = isMonthly ? monthStart(anchor) : weekStart(anchor)
  const windowEnd = isMonthly ? monthEnd(anchor) : weekEnd(weekStart(anchor))

  const scheduledTotal = da.getScheduledDollarsInWindow(windowStart, windowEnd)

  const activeJobs = useMemo(
    () =>
      jobs.filter(
        (j) => j.pipedriveStageId != null && PIPEDRIVE_TARGET_STAGE_IDS.includes(j.pipedriveStageId) && scheduleBlocks.some((b) => b.jobId === j.id),
      ),
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

  const monthlyTargetRow = monthlyTargets.find((t) => t.year === anchor.getFullYear() && t.month === anchor.getMonth() + 1)
  const monthlyTargetDollars = monthlyTargetRow?.targetDollars ?? 0
  const targetTotal = isMonthly ? monthlyTargetDollars : weeklyFromMonthly(monthlyTargetDollars)
  const gap = scheduledTotal - targetTotal

  // Formula: Actual $ = Production% x Deal Value per job (see getJobProgress), summed across every
  // active job — not scoped to the Weekly/Monthly toggle, since Production % tracks a job's overall
  // completion to date rather than work done in a particular window.
  const actualTotal = jobRows.reduce((sum, { progress }) => sum + progress.actualDollars, 0)

  const canManage = canManageTargets(currentUser.role)
  const canEditProgress = isOfficeRole(currentUser.role)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-medium">
          {isMonthly ? formatMonthLabel(windowStart) : `Week of ${formatDateRange(windowStart, windowEnd)}`}
        </h1>
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
        <Card className="gap-1 p-4">
          <p className="text-xs text-muted-foreground">{isMonthly ? 'Monthly target' : 'Weekly target'}</p>
          <p className="text-2xl font-medium">{formatCurrency(targetTotal)}</p>
          {!monthlyTargetRow && (
            <p className="text-xs text-muted-foreground">No target set for this month</p>
          )}
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-xs text-muted-foreground">Scheduled this {isMonthly ? 'month' : 'week'}</p>
          <p className="text-2xl font-medium">{formatCurrency(scheduledTotal)}</p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-xs text-muted-foreground">Actual</p>
          <p className="text-2xl font-medium">{formatCurrency(actualTotal)}</p>
          <p className="text-xs text-muted-foreground">Production % × deal value, across active jobs</p>
        </Card>
        <Card className={`gap-1 p-4 ${gap < 0 ? 'bg-warning-bg' : 'bg-success-bg'}`}>
          <p className={`text-xs ${gap < 0 ? 'text-warning' : 'text-success'}`}>Gap to target</p>
          <p className={`text-2xl font-medium ${gap < 0 ? 'text-warning' : 'text-success'}`}>{formatCurrency(gap)}</p>
        </Card>
      </div>

      <TargetConfigDialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen} />

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-medium">Jobs</h2>
          <p className="text-xs text-muted-foreground">Active jobs already on the Calendar — Production % and Hours tracked per job.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {jobRows.length === 0 && (
            <p className="col-span-full rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              No active jobs scheduled yet — jobs appear here once they're on the Calendar.
            </p>
          )}
          {jobRows.map(({ job, progress, teams: jobTeams }) => (
            <JobProgressCard key={job.id} job={job} progress={progress} teams={jobTeams} canEditProgress={canEditProgress} />
          ))}
        </div>
      </section>
    </div>
  )
}
