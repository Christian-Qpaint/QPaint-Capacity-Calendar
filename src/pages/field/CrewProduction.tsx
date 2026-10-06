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
import { ClientTypeIcon } from '@/components/ClientTypeIcon'
import { CircleCheck, CircleDashed, MapPin, Pencil, Percent, TriangleAlert, Users, type LucideIcon } from 'lucide-react'
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
  if (actualHours <= 0) return { tone: 'success', label: 'In progress', hint: 'no hours used yet', icon: CircleDashed }
  const left = Math.max(0, Math.round(allottedHours - actualHours))
  return { tone: 'success', label: 'Within allotted hours', hint: `${left} hrs still available`, icon: CircleCheck }
}

/** One current job, for the restricted Crew Leader view — deliberately a standalone component
 * rather than reusing CapacityBoard's card (same "separate, minimal page" pattern as
 * SalesAvailability.tsx): no dollar figures anywhere, and Production % is the only editable
 * control. Allotted/Actual hours are Pipedrive-sourced and read-only. */
function CrewJobCard({ job }: { job: Job }) {
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

  const status = paceStatus(progress.actualHours, progress.targetHours)
  const StatusIcon = status.icon
  const over = status.tone === 'danger'
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
        status.tone === 'danger' && 'border-danger-fill',
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
                over ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success',
              )}
            >
              <span className={cn('size-1.5 rounded-full', over ? 'bg-danger-fill' : 'bg-success-fill')} />
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
          <p className={cn('text-2xl font-bold tracking-tight', over && 'text-danger')}>{Math.round(progress.actualHours)}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="relative h-5 overflow-hidden rounded-full bg-card">
          <div className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/30" style={{ width: `${allottedPct}%` }} />
          <div
            className={cn('absolute inset-y-0 left-0 rounded-full', TONE_FILL[status.tone])}
            style={{ width: `${actualPct}%`, minWidth: progress.actualHours > 0 ? undefined : 4 }}
          />
          {over && <div className="absolute inset-y-0 w-0.5 bg-background" style={{ left: `${allottedPct}%` }} aria-hidden="true" />}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-muted-foreground/30" />Allotted {Math.round(progress.targetHours)}</span>
          <span className="flex items-center gap-1.5"><span className={cn('size-2 rounded-sm', TONE_FILL[status.tone])} />Actual {Math.round(progress.actualHours)}</span>
        </div>
      </div>

      <div
        className={cn(
          'flex items-start gap-2 rounded-md px-2.5 py-2 text-xs',
          status.tone === 'success' && 'bg-success-bg text-success',
          status.tone === 'danger' && 'bg-danger-bg text-danger',
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
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                {job.productionPercentSource === 'manual' ? 'Manual' : 'Computed'}
              </Badge>
              <span className="text-lg font-bold tracking-tight">{Math.round(progress.productionPercent)}%</span>
              <button
                onClick={openEditProduction}
                aria-label="Edit production percent"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="size-4" />
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
              <span className="w-12 shrink-0 text-right text-lg font-bold">{productionValue}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" className="h-8" onClick={handleSaveProduction} disabled={savingProduction}>Save</Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingProduction(false)} disabled={savingProduction}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="h-5 overflow-hidden rounded-full bg-card">
            <div
              className="h-full rounded-full bg-success-fill transition-[width]"
              style={{ width: `${productionPct}%`, minWidth: productionPct > 0 ? undefined : 4 }}
            />
          </div>
        )}
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
        <p className="text-sm text-muted-foreground">Adjust Production % on each job.</p>
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
