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
import { CategoryPill } from '@/components/StatusBadges'
import { ClientTypeIcon } from '@/components/ClientTypeIcon'
import { StagePill } from '@/components/StagePill'
import { Clock, Pencil, Percent } from 'lucide-react'
import type { Job } from '@/types'

/** One job card for the restricted Crew Leader Production view — deliberately a standalone
 * component rather than reusing CapacityBoard's JobProgressCard (same "separate, minimal page"
 * pattern as SalesAvailability.tsx): no dollar figures anywhere, and Production % is the only
 * editable control — Crew Leaders have no other Field capability (no Log Hours, no Update
 * Progress). "Hours from your team" is shown as a read-only total only. */
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

  return (
    <Card className="gap-3 p-4">
      <div className="space-y-0.5">
        <p className="truncate text-sm font-semibold">{jobDisplayName(job)}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          {client && <ClientTypeIcon type={client.type} />}
          {client?.name ?? 'Unknown client'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryPill category={job.category} />
        {stage && <StagePill stage={stage} />}
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Percent className="size-3.5" /> Production
          </p>
          {!editingProduction && (
            <button
              onClick={openEditProduction}
              aria-label="Edit production percent"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
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
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Clock className="size-3.5" /> Hours
        </p>
        <div className="flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-[width]', progress.isOverBudget ? 'bg-danger-fill' : 'bg-info-fill')}
              style={{ width: `${Math.min(100, Math.max(0, hoursPercent))}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
            {Math.round(progress.actualHours)} / {progress.targetHours} hrs
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">Pipedrive — locked</p>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <p className="text-xs font-medium text-muted-foreground">Hours from your team</p>
        <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">{loggedHours} hrs logged</Badge>
      </div>
    </Card>
  )
}

/** Crew Leader's own restricted Production view — cards only, for their own QPaint team's jobs
 * only, no dollar figures anywhere. Same "deliberately minimal, standalone page" pattern as
 * SalesAvailability.tsx rather than branching the full office CapacityBoard. */
export function CrewProduction() {
  const { jobs, teams, scheduleBlocks } = useData()
  const currentUser = useCurrentUser()

  const myTeam = teams.find((t) => t.id === currentUser.teamId)

  const myJobs = useMemo(() => {
    if (!myTeam || myTeam.type !== 'QPaint') return []
    const jobIds = new Set(scheduleBlocks.filter((b) => b.teamId === myTeam.id).map((b) => b.jobId))
    return jobs.filter((j) => jobIds.has(j.id)).sort((a, b) => a.address.localeCompare(b.address))
  }, [jobs, scheduleBlocks, myTeam])

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
        <p className="text-sm text-muted-foreground">Your team's jobs — adjust Production %, no dollar values.</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {myJobs.length === 0 && (
          <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No jobs currently scheduled for your team.
          </p>
        )}
        {myJobs.map((job) => (
          <CrewJobCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  )
}
