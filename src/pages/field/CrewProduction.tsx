import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useData } from '@/context/DataContext'
import { useCurrentUser } from '@/context/AuthContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { jobDisplayName } from '@/lib/jobDisplay'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ClientTypeIcon } from '@/components/ClientTypeIcon'
import { StagePill } from '@/components/StagePill'
import { ChartColumn, CircleCheck, CircleDashed, Flag, Pencil, Percent, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { Job } from '@/types'

type PaceTone = 'success' | 'warning' | 'danger' | 'neutral'

const TONE_FILL: Record<PaceTone, string> = {
  success: 'bg-success-fill',
  warning: 'bg-warning-fill',
  danger: 'bg-danger-fill',
  neutral: 'bg-muted-foreground',
}

/** "Are we doing well?" is only about hours: using fewer than allotted just means the hours aren't
 * used up yet. The one red flag is working more hours than were allotted — the overage is a loss. */
function paceStatus(
  actualHours: number,
  allottedHours: number,
): { tone: PaceTone; label: string; hint: string; icon: LucideIcon } {
  const over = Math.round(actualHours - allottedHours)
  if (actualHours > allottedHours && over > 0) {
    return { tone: 'danger', label: `Red flag: ${over} hrs over allotted`, hint: 'these extra hours are a loss on the job', icon: TriangleAlert }
  }
  if (actualHours <= 0) return { tone: 'neutral', label: 'Not started', hint: 'no hours used yet', icon: CircleDashed }
  const left = Math.max(0, Math.round(allottedHours - actualHours))
  return { tone: 'success', label: 'Within allotted hours', hint: `${left} hrs still available`, icon: CircleCheck }
}

/** One row of the Crew Leader's jobs table. Production % is the only editable cell — Crew Leaders
 * have no other Field capability. Allotted/Actual hours are Pipedrive-sourced and read-only, and
 * "Logged" is the team's own logged-hours total, also read-only. */
function CrewJobRow({ job }: { job: Job }) {
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

  const blockIdsForJob = useMemo(
    () => new Set(scheduleBlocks.filter((b) => b.jobId === job.id && b.teamId === currentUser.teamId).map((b) => b.id)),
    [scheduleBlocks, job.id, currentUser.teamId],
  )
  const loggedHours = useMemo(
    () => dailyHoursEntries.filter((e) => blockIdsForJob.has(e.scheduleBlockId)).reduce((sum, e) => sum + e.hours, 0),
    [dailyHoursEntries, blockIdsForJob],
  )

  const over = progress.isOverBudget
  const overBy = Math.round(progress.actualHours - progress.targetHours)

  return (
    <TableRow className={cn('align-top', over && 'bg-danger-bg/30 hover:bg-danger-bg/40')}>
      <TableCell className="min-w-44 max-w-64 whitespace-normal">
        <p className="line-clamp-2 text-sm font-medium">{jobDisplayName(job)}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          {client && <ClientTypeIcon type={client.type} />}
          {client?.name ?? 'Unknown client'}
        </p>
        {stage && (
          <div className="mt-1.5">
            <StagePill stage={stage} />
          </div>
        )}
      </TableCell>
      <TableCell className="min-w-36 whitespace-normal">
        {editingProduction ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Slider
                value={[productionValue]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => setProductionValue(Array.isArray(v) ? v[0] : v)}
                className="flex-1"
              />
              <span className="w-10 shrink-0 text-right text-sm font-medium">{productionValue}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" className="h-7" onClick={handleSaveProduction} disabled={savingProduction}>Save</Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingProduction(false)} disabled={savingProduction}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-success-fill"
                  style={{ width: `${Math.min(100, Math.max(0, progress.productionPercent))}%` }}
                />
              </div>
              <span className="text-sm font-semibold">{Math.round(progress.productionPercent)}%</span>
              <button
                onClick={openEditProduction}
                aria-label="Edit production percent"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
              {job.productionPercentSource === 'manual' ? 'Manual' : 'Computed'}
            </Badge>
          </div>
        )}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">{Math.round(progress.targetHours)}</TableCell>
      <TableCell className="text-right">
        <span className={cn('text-sm tabular-nums', over ? 'font-semibold text-danger' : 'font-medium')}>
          {Math.round(progress.actualHours)}
        </span>
        {over && (
          <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-medium text-danger">
            <Flag className="size-3" /> +{overBy} over
          </span>
        )}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{loggedHours}</TableCell>
    </TableRow>
  )
}

const FINISHED_STAGE_PATTERN = /completed/i
const IN_PROGRESS_STAGE_PATTERN = /in progress/i
const FINISHED_HIDE_AFTER_MS = 28 * 86_400_000

/** Crew Leader's own restricted Production view — for their own QPaint team's jobs only, no dollar
 * figures anywhere. Same "deliberately minimal, standalone page" pattern as SalesAvailability.tsx
 * rather than branching the full office CapacityBoard. */
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
    let jobsOver = 0
    let weightedProduction = 0
    for (const job of myJobs) {
      const progress = da.getJobProgress(job)
      totalHours += progress.targetHours
      usedHours += progress.actualHours
      weightedProduction += Math.min(100, Math.max(0, progress.productionPercent)) * progress.targetHours
      if (progress.actualHours > progress.targetHours) jobsOver += 1
    }
    let status = paceStatus(usedHours, totalHours)
    // Under the allotted total overall, but an individual job can still be over — worth a heads-up.
    if (status.tone === 'success' && jobsOver > 0) {
      status = {
        tone: 'warning',
        label: `${jobsOver} ${jobsOver === 1 ? 'job is' : 'jobs are'} over allotted hours`,
        hint: 'overall hours are still within the allotment — check the flagged jobs below',
        icon: TriangleAlert,
      }
    }
    // Overall progress across the team's jobs, weighted by each job's allotted hours.
    const production = totalHours > 0 ? weightedProduction / totalHours : 0
    return { totalHours, usedHours, status, production }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myJobs, da.db])

  const SummaryIcon = summary.status.icon
  const totalOver = summary.usedHours > summary.totalHours
  // One shared scale so the actual bar can overlap the allotted bar and still spill past it when over.
  const scaleMax = Math.max(summary.totalHours, summary.usedHours, 1)
  const allottedPct = (summary.totalHours / scaleMax) * 100
  const actualPct = (summary.usedHours / scaleMax) * 100

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

      <Card
        className={cn(
          'gap-4 border-2 bg-muted/50 p-4 shadow-sm',
          summary.status.tone === 'success' && 'border-success-fill/60',
          summary.status.tone === 'warning' && 'border-warning-fill/70',
          summary.status.tone === 'danger' && 'border-danger-fill/70',
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <ChartColumn className="size-4.5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Team hours summary</p>
            <p className="text-xs text-muted-foreground">Allotted vs actual — all {myJobs.length} jobs combined</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-card px-3 py-2 shadow-xs">
            <p className="text-[11px] text-muted-foreground">Allotted hours</p>
            <p className="text-2xl font-bold tracking-tight">{Math.round(summary.totalHours)}</p>
          </div>
          <div className="rounded-lg bg-card px-3 py-2 shadow-xs">
            <p className="text-[11px] text-muted-foreground">Actual hours</p>
            <p className={cn('text-2xl font-bold tracking-tight', totalOver && 'text-danger')}>{Math.round(summary.usedHours)}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="relative h-5 overflow-hidden rounded-full bg-card">
            <div className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/30" style={{ width: `${allottedPct}%` }} />
            <div
              className={cn('absolute inset-y-0 left-0 rounded-full', TONE_FILL[summary.status.tone])}
              style={{ width: `${actualPct}%`, minWidth: summary.usedHours > 0 ? undefined : 4 }}
            />
            {totalOver && (
              <div className="absolute inset-y-0 w-0.5 bg-background" style={{ left: `${allottedPct}%` }} aria-hidden="true" />
            )}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-muted-foreground/30" />Allotted {Math.round(summary.totalHours)}</span>
            <span className="flex items-center gap-1.5"><span className={cn('size-2 rounded-sm', TONE_FILL[summary.status.tone])} />Actual {Math.round(summary.usedHours)}</span>
          </div>
        </div>

        <div
          className={cn(
            'flex items-start gap-2 rounded-md px-2.5 py-2 text-xs',
            summary.status.tone === 'success' && 'bg-success-bg text-success',
            summary.status.tone === 'warning' && 'bg-warning-bg text-warning',
            summary.status.tone === 'danger' && 'bg-danger-bg text-danger',
            summary.status.tone === 'neutral' && 'bg-muted text-muted-foreground',
          )}
        >
          <SummaryIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-medium">{summary.status.label}</span>{' '}
            <span className="opacity-80">— {summary.status.hint}</span>
          </p>
        </div>

        <div className="space-y-1.5 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Percent className="size-3.5" /> Production
            </p>
            <span className="text-lg font-bold tracking-tight">{Math.round(summary.production)}%</span>
          </div>
          <div className="h-5 overflow-hidden rounded-full bg-card">
            <div
              className="h-full rounded-full bg-success-fill transition-[width]"
              style={{ width: `${summary.production}%`, minWidth: summary.production > 0 ? undefined : 4 }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">Overall progress across your jobs, weighted by allotted hours</p>
        </div>
      </Card>

      <div className="flex items-center gap-2 pt-2">
        <h2 className="text-sm font-semibold">Your jobs</h2>
        <Badge variant="secondary">{myJobs.length}</Badge>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Production</TableHead>
              <TableHead className="text-right">Allotted hrs</TableHead>
              <TableHead className="text-right">Actual hrs</TableHead>
              <TableHead className="text-right">Logged hrs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {myJobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No in-progress or recently completed jobs for your team.
                </TableCell>
              </TableRow>
            )}
            {myJobs.map((job) => (
              <CrewJobRow key={job.id} job={job} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
