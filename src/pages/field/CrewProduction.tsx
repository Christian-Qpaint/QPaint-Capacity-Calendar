import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useCurrentUser } from '@/context/AuthContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { jobDisplayName } from '@/lib/jobDisplay'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { ClientTypeIcon } from '@/components/ClientTypeIcon'
import { CircleCheck, CircleDashed, MapPin, Percent, TriangleAlert, Users, type LucideIcon } from 'lucide-react'
import type { Job } from '@/types'

type PaceTone = 'success' | 'warning'

const TONE_FILL: Record<PaceTone, string> = {
  success: 'bg-success-fill',
  warning: 'bg-warning-fill',
}

/** Hours only: the number of hours over or under the allotment. Going over is the red flag — the
 * overage is a loss; being under just means the hours aren't used up yet. */
function paceStatus(
  actualHours: number,
  allottedHours: number,
): { tone: PaceTone; label: string; icon: LucideIcon } {
  const diff = Math.round(actualHours - allottedHours)
  if (diff > 0) return { tone: 'warning', label: `${diff} hrs over`, icon: TriangleAlert }
  const icon = actualHours <= 0 ? CircleDashed : CircleCheck
  if (diff === 0) return { tone: 'success', label: 'On the allotted hours', icon }
  return { tone: 'success', label: `${-diff} hrs under`, icon }
}

/** One current job, for the restricted Crew Leader view — deliberately a standalone component
 * rather than reusing CapacityBoard's card (same "separate, minimal page" pattern as
 * SalesAvailability.tsx): no dollar figures anywhere, and everything is read-only for now — Crew Leaders
 * can view Production % and hours but not change anything. */
function CrewJobCard({ job }: { job: Job }) {
  const { clients, jobStages, scheduleBlocks, dailyHoursEntries } = useData()
  const currentUser = useCurrentUser()
  const da = useDataAccess()
  const progress = da.getJobProgress(job)
  const client = clients.find((c) => c.id === job.clientId)
  const stage = job.stageId ? jobStages.find((s) => s.id === job.stageId) : undefined

  const blockIdsForJob = useMemo(
    () => new Set(scheduleBlocks.filter((b) => b.jobId === job.id && b.teamId === currentUser.teamId).map((b) => b.id)),
    [scheduleBlocks, job.id, currentUser.teamId],
  )
  const loggedHours = useMemo(
    () => dailyHoursEntries.filter((e) => blockIdsForJob.has(e.scheduleBlockId)).reduce((sum, e) => sum + e.hours, 0),
    [dailyHoursEntries, blockIdsForJob],
  )

  const status = paceStatus(progress.actualHours, progress.targetHours)
  const StatusIcon = status.icon
  const over = status.tone === 'warning'
  // One shared scale so the actual bar overlaps the allotted bar and still spills past it when over.
  const scaleMax = Math.max(progress.targetHours, progress.actualHours, 1)
  const allottedPct = (progress.targetHours / scaleMax) * 100
  const actualPct = (progress.actualHours / scaleMax) * 100
  const productionPct = Math.min(100, Math.max(0, progress.productionPercent))

  return (
    <Card
      className={cn(
        'gap-4 border-2 bg-muted/50 p-4 shadow-sm',
        status.tone === 'success' && 'border-success-fill',
        status.tone === 'warning' && 'border-warning-fill',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
          <MapPin className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="line-clamp-2 text-sm font-semibold leading-tight">{jobDisplayName(job)}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {client && <ClientTypeIcon type={client.type} />}
            {client?.name ?? 'Unknown client'}
          </p>
          {stage && (
            <span
              className={cn(
                'inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
                over ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success',
              )}
            >
              <span className={cn('size-1.5 rounded-full', over ? 'bg-warning-fill' : 'bg-success-fill')} />
              {stage.name}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-card px-3 py-2 shadow-xs">
          <p className="text-[11px] text-muted-foreground">Allotted hours</p>
          <p className="text-2xl font-bold tracking-tight">{Math.round(progress.targetHours)}</p>
        </div>
        <div className="rounded-lg bg-card px-3 py-2 shadow-xs">
          <p className="text-[11px] text-muted-foreground">Actual hours</p>
          <p className={cn('text-2xl font-bold tracking-tight', over && 'text-warning')}>{Math.round(progress.actualHours)}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className={cn('relative', over && 'pt-5')}>
          {over && (
            <MapPin
              className="absolute top-0 size-5 -translate-x-1/2 fill-warning-bg text-warning"
              style={{ left: `${allottedPct}%` }}
              aria-label="Allotted hours end here"
            />
          )}
          <div className="relative h-5 overflow-hidden rounded-full bg-card">
            <div className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/30" style={{ width: `${allottedPct}%` }} />
            <div
              className={cn('absolute inset-y-0 left-0 rounded-full', TONE_FILL[status.tone])}
              style={{ width: `${actualPct}%`, minWidth: progress.actualHours > 0 ? undefined : 4 }}
            />
            {over && (
              <div
                className="absolute inset-y-0 w-1.5 -translate-x-1/2 bg-background shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                style={{ left: `${allottedPct}%` }}
                aria-hidden="true"
              />
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-muted-foreground/30" />Allotted {Math.round(progress.targetHours)}</span>
          <span className="flex items-center gap-1.5"><span className={cn('size-2 rounded-sm', TONE_FILL[status.tone])} />Actual {Math.round(progress.actualHours)}</span>
        </div>
      </div>

      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2.5 py-2',
          status.tone === 'success' && 'bg-success-bg text-success',
          status.tone === 'warning' && 'bg-warning-bg text-warning',
        )}
      >
        <StatusIcon className="size-4 shrink-0" aria-hidden="true" />
        <p className="text-sm font-semibold">{status.label}</p>
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Percent className="size-3.5" /> Production
          </p>
          <span className="text-lg font-bold tracking-tight">{Math.round(progress.productionPercent)}%</span>
        </div>
        <div className="h-5 overflow-hidden rounded-full bg-card">
          <div
            className="h-full rounded-full bg-success-fill transition-[width]"
            style={{ width: `${productionPct}%`, minWidth: productionPct > 0 ? undefined : 4 }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Users className="size-3.5" /> Hours logged by your team</span>
        <span className="font-medium text-foreground">{loggedHours} hrs</span>
      </div>
    </Card>
  )
}

const FINISHED_STAGE_PATTERN = /completed/i
const IN_PROGRESS_STAGE_PATTERN = /in progress/i
const FINISHED_HIDE_AFTER_MS = 28 * 86_400_000

/** Crew Leader's own restricted view — one card per current job for their own QPaint team, no
 * dollar figures anywhere. Same "deliberately minimal, standalone page" pattern as
 * SalesAvailability.tsx rather than branching the full office CapacityBoard. */
export function CrewProduction() {
  const { jobs, teams, scheduleBlocks, jobStages } = useData()
  const currentUser = useCurrentUser()

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

  if (!myTeam || myTeam.type !== 'QPaint') {
    return (
      <div className="space-y-1">
        <h1 className="text-lg font-medium">Current jobs working</h1>
        <p className="text-sm text-muted-foreground">You're not assigned to a QPaint team, so there's nothing to show here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium">Current jobs working — {myTeam.name}</h1>
        <p className="text-sm text-muted-foreground">Production % and hours for each job.</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {myJobs.length === 0 && (
          <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No in-progress or recently completed jobs for your team.
          </p>
        )}
        {myJobs.map((job) => (
          <CrewJobCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  )
}
