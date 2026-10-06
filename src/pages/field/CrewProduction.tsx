import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { useData } from '@/context/DataContext'
import { useCurrentUser } from '@/context/AuthContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { jobDisplayName } from '@/lib/jobDisplay'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { CategoryPill } from '@/components/StatusBadges'
import { ClientTypeIcon } from '@/components/ClientTypeIcon'
import { StagePill } from '@/components/StagePill'
import { TeamColorDot } from '@/components/TeamColorDot'
import { CircleCheck, CircleDashed, Clock, Flag, Lock, MapPin, Pencil, Percent, TrendingDown, TrendingUp, TriangleAlert, Users, type LucideIcon } from 'lucide-react'
import type { Job, Team } from '@/types'

type PaceTone = 'success' | 'warning' | 'danger' | 'neutral'


/** A quiet "are we doing well?" read — compares how much of the allotted hours are used against
 * how much of the job is done. Hours running ahead of progress is the early warning; actual over
 * allotted is the hard red flag. */
function paceStatus(
  production: number,
  hoursPercent: number,
  actualHours: number,
  overBudget: boolean,
): { tone: PaceTone; label: string; hint: string; icon: LucideIcon } {
  if (overBudget) return { tone: 'danger', label: 'Over allotted hours', hint: 'more hours used than were allotted', icon: TriangleAlert }
  if (production >= 100) return { tone: 'success', label: 'Complete', hint: 'finished within allotted hours', icon: CircleCheck }
  if (actualHours <= 0 && production <= 0) return { tone: 'neutral', label: 'Not started', hint: 'no hours used yet', icon: CircleDashed }
  const gap = hoursPercent - production
  if (gap <= 10) return { tone: 'success', label: 'On track', hint: 'progress is keeping pace with hours used', icon: TrendingUp }
  if (gap <= 25) return { tone: 'warning', label: 'Slightly behind', hint: 'hours are running ahead of progress', icon: TrendingDown }
  return { tone: 'danger', label: 'Behind', hint: 'hours used well ahead of progress', icon: TrendingDown }
}

/** One job card for the restricted Crew Leader Production view — deliberately a standalone
 * component rather than reusing CapacityBoard's JobProgressCard (same "separate, minimal page"
 * pattern as SalesAvailability.tsx): no dollar figures anywhere, and Production % is the only
 * editable control — Crew Leaders have no other Field capability (no Log Hours, no Update
 * Progress). "Hours from your team" is shown as a read-only total only. */
function CrewJobCard({ job, team }: { job: Job; team: Team }) {
  const { clients, jobStages, scheduleBlocks, dailyHoursEntries, updateJobProduction } = useData()
  const currentUser = useCurrentUser()
  const da = useDataAccess()
  const progress = da.getJobProgress(job)
  const client = clients.find((c) => c.id === job.clientId)
  const stage = job.stageId ? jobStages.find((s) => s.id === job.stageId) : undefined

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

  const hoursPercent = progress.targetHours > 0 ? (progress.actualHours / progress.targetHours) * 100 : progress.actualHours > 0 ? 100 : 0

  // "Hours from your team" — read-only total scoped to only this team's own blocks on this job,
  // distinct from the Pipedrive-sourced Actual Hours above. Crew Leaders can see it but no longer
  // log hours themselves from here (or anywhere else).
  const blockIdsForJob = useMemo(
    () => new Set(scheduleBlocks.filter((b) => b.jobId === job.id && b.teamId === currentUser.teamId).map((b) => b.id)),
    [scheduleBlocks, job.id, currentUser.teamId],
  )
  const loggedHours = useMemo(
    () => dailyHoursEntries.filter((e) => blockIdsForJob.has(e.scheduleBlockId)).reduce((sum, e) => sum + e.hours, 0),
    [dailyHoursEntries, blockIdsForJob],
  )

  const hoursChartData = [
    { name: 'Target', hours: Math.round(progress.targetHours), fill: 'var(--muted-foreground)' },
    { name: 'Actual', hours: Math.round(progress.actualHours), fill: progress.isOverBudget ? 'var(--danger-fill)' : 'var(--info-fill)' },
  ]
  const status = paceStatus(progress.productionPercent, hoursPercent, progress.actualHours, progress.isOverBudget)
  const StatusIcon = status.icon

  return (
    <Card
      className={cn(
        'gap-3 border-l-4 p-4 transition hover:shadow-md',
        status.tone === 'success' && 'border-l-success-fill',
        status.tone === 'warning' && 'border-l-warning',
        status.tone === 'danger' && 'border-l-danger',
        status.tone === 'neutral' && 'border-l-transparent',
      )}
    >
      <div className="space-y-2">
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{jobDisplayName(job)}</span>
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {client && <ClientTypeIcon type={client.type} />}
            {client?.name ?? 'Unknown client'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryPill category={job.category} />
          {stage && <StagePill stage={stage} />}
          {team && (
            <span className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              <TeamColorDot team={team} />
              {team.name}
            </span>
          )}
        </div>
      </div>

      <div
        className={cn(
          'flex items-start gap-2 rounded-md px-2.5 py-2 text-xs',
          status.tone === 'success' && 'bg-success-bg text-success',
          status.tone === 'warning' && 'bg-warning-bg text-warning',
          status.tone === 'danger' && 'bg-danger-bg text-danger',
          status.tone === 'neutral' && 'bg-muted text-muted-foreground',
        )}
      >
        <StatusIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <p>
          <span className="font-medium">{status.label}</span> <span className="opacity-80">— {status.hint}</span>
        </p>
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
              <button
                onClick={openEditProduction}
                aria-label="Edit production percent"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
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
            <div className="flex items-center gap-1.5">
              <Button size="sm" className="h-7" onClick={handleSaveProduction} disabled={savingProduction}>Save</Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingProduction(false)} disabled={savingProduction}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success-fill transition-[width]"
                style={{ width: `${Math.min(100, Math.max(0, progress.productionPercent))}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-sm font-semibold">{Math.round(progress.productionPercent)}%</span>
          </div>
        )}
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="size-3.5" /> Hours
          </p>
          {progress.isOverBudget ? (
            <span className="flex items-center gap-1 rounded-md bg-danger-bg px-1.5 py-0.5 text-xs font-medium text-danger animate-pulse">
              <Flag className="size-3" /> Over allotted
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Lock className="size-3" aria-hidden="true" /> Pipedrive
            </span>
          )}
        </div>
        <ChartContainer config={{}} className="h-24 w-full">
          <BarChart data={hoursChartData} layout="vertical" barCategoryGap={10} margin={{ left: 0, right: 36, top: 0, bottom: 0 }}>
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis type="category" dataKey="name" width={52} tickLine={false} axisLine={false} fontSize={11} />
            <Bar dataKey="hours" radius={4} maxBarSize={22} isAnimationActive={false}>
              {hoursChartData.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
              <LabelList dataKey="hours" position="right" fontSize={12} fontWeight={600} fill="currentColor" />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Users className="size-3.5" /> Hours from your team
        </p>
        <Badge variant="secondary" className="text-xs font-medium">{loggedHours} hrs logged</Badge>
      </div>
    </Card>
  )
}

const FINISHED_STAGE_PATTERN = /completed/i
const IN_PROGRESS_STAGE_PATTERN = /in progress/i
const FINISHED_HIDE_AFTER_MS = 28 * 86_400_000

/** Crew Leader's own restricted Production view — cards only, for their own QPaint team's jobs
 * only, no dollar figures anywhere. Same "deliberately minimal, standalone page" pattern as
 * SalesAvailability.tsx rather than branching the full office CapacityBoard. */
export function CrewProduction() {
  const { jobs, teams, scheduleBlocks, jobStages } = useData()
  const currentUser = useCurrentUser()
  const da = useDataAccess()

  const myTeam = teams.find((t) => t.id === currentUser.teamId)

  // Only jobs in the In Progress or Completed stage appear here. A Completed job drops off after
  // 4 weeks in that stage; one with no recorded stage-entry time can't be aged, so it stays visible.
  const myJobs = useMemo(() => {
    if (!myTeam || myTeam.type !== 'QPaint') return []
    const jobIds = new Set(scheduleBlocks.filter((b) => b.teamId === myTeam.id).map((b) => b.jobId))
    const stageById = new Map(jobStages.map((s) => [s.id, s]))
    const cutoff = Date.now() - FINISHED_HIDE_AFTER_MS
    return jobs
      .filter((j) => {
        if (!jobIds.has(j.id)) return false
        const stageName = j.stageId ? stageById.get(j.stageId)?.name : undefined
        if (!stageName) return false
        if (IN_PROGRESS_STAGE_PATTERN.test(stageName)) return true
        if (!FINISHED_STAGE_PATTERN.test(stageName)) return false
        return !j.stageEnteredAt || new Date(j.stageEnteredAt).getTime() >= cutoff
      })
      .sort((a, b) => a.address.localeCompare(b.address))
  }, [jobs, scheduleBlocks, jobStages, myTeam])

  const summary = useMemo(() => {
    let totalHours = 0
    let usedHours = 0
    for (const job of myJobs) {
      const progress = da.getJobProgress(job)
      totalHours += progress.targetHours
      usedHours += progress.actualHours
    }
    return { totalHours, usedHours }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myJobs, da.db])

  const totalOver = summary.usedHours > summary.totalHours

  if (!myTeam || myTeam.type !== 'QPaint') {
    return (
      <div className="space-y-1">
        <h1 className="text-lg font-medium">Production</h1>
        <p className="text-sm text-muted-foreground">You're not assigned to a QPaint team, so there's nothing to show here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium">Production — {myTeam.name}</h1>
        <p className="text-sm text-muted-foreground">Your team's jobs — adjust Production % on each job.</p>
      </div>

      <Card className="gap-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Total allotted hours</p>
            <p className="text-2xl font-semibold tracking-tight">{Math.round(summary.totalHours)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total actual hours</p>
            <p className={cn('text-2xl font-semibold tracking-tight', totalOver && 'text-danger')}>{Math.round(summary.usedHours)}</p>
          </div>
        </div>
        {totalOver && (
          <p className="flex items-center gap-1.5 rounded-md bg-danger-bg px-2 py-1.5 text-xs font-medium text-danger">
            <Flag className="size-3.5" /> Red flag: actual hours are {Math.round(summary.usedHours - summary.totalHours)} over allotted
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-3">
        {myJobs.length === 0 && (
          <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No in-progress or recently completed jobs for your team.
          </p>
        )}
        {myJobs.map((job) => (
          <CrewJobCard key={job.id} job={job} team={myTeam} />
        ))}
      </div>
    </div>
  )
}
