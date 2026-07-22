import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AddEditPhaseDialog, type PhaseDialogState } from '@/components/AddEditPhaseDialog'
import { StatusPill } from '@/components/StatusBadges'
import { TeamColorDot } from '@/components/TeamColorDot'
import { formatCurrency, phaseValue } from '@/lib/formulas'
import { jobDisplayName } from '@/lib/jobDisplay'
import { WORK_AREA_STYLES } from '@/lib/workAreaStyles'
import {
  ArrowLeft,
  Banknote,
  CalendarRange,
  CheckCircle2,
  Clock,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-react'
import type { ScheduleBlock } from '@/types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export function JobPhaseScheduling() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const { jobs, clients, scheduleBlocks, teams, deleteScheduleBlock } = useData()
  const da = useDataAccess()

  const job = jobs.find((j) => j.id === jobId)
  const client = clients.find((c) => c.id === job?.clientId)
  const phases = scheduleBlocks.filter((b) => b.jobId === jobId)

  const [dialogState, setDialogState] = useState<PhaseDialogState>({ open: false, block: null })
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (!job) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Job not found.</p>
        <Button variant="secondary" onClick={() => navigate('/jobs')}>Back to Jobs List</Button>
      </div>
    )
  }

  const allocatedHours = phases.reduce((sum, p) => sum + p.phaseHours, 0)
  const reconciled = allocatedHours === job.targetHours
  const overAllocated = allocatedHours > job.targetHours
  function openCreate() {
    setDialogState({ open: true, block: null })
  }
  function openEdit(block: ScheduleBlock) {
    setDialogState({ open: true, block })
  }
  async function handleDelete(id: string) {
    try {
      await deleteScheduleBlock(id)
      setConfirmDeleteId(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete phase')
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/jobs')} className="-ml-2">
        <ArrowLeft /> Back to Jobs List
      </Button>

      <Card className="gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-base font-medium">
              <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {jobDisplayName(job)}
            </p>
            <p className="text-sm text-muted-foreground">{client?.name ?? 'Unknown client'}</p>
          </div>
          <span className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">{job.category}</span>
        </div>
        <div className="flex flex-wrap items-center gap-6 border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Total value</p>
            <p className="text-base font-medium">{formatCurrency(job.totalValue)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Target hours</p>
            <p className="text-base font-medium">{job.targetHours}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Date won</p>
            <p className="text-base font-medium">{new Date(job.dateWon).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="size-3.5" /> Synced from Pipedrive
          </span>
        </div>
      </Card>

      <div className={`flex items-center gap-2 rounded-md px-4 py-3 text-sm ${reconciled ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'}`}>
        {reconciled ? <CheckCircle2 className="size-4" /> : <TriangleAlert className="size-4" />}
        <span>
          {allocatedHours} of {job.targetHours} target hours allocated across phases
          {reconciled ? ' — fully reconciled' : overAllocated ? ' — over-allocated' : ' — under-allocated'}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Phases</h2>
          <Button size="sm" onClick={openCreate}>
            <Plus /> Add phase
          </Button>
        </div>

        {phases.length === 0 && (
          <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            No phases scheduled yet.
          </p>
        )}

        {phases.map((phase) => {
          const team = teams.find((t) => t.id === phase.teamId)
          const value = phaseValue(job.totalValue, phase.phaseHours, job.targetHours)
          const shares = da.getMultiTeamShares(phase, job)
          const style = WORK_AREA_STYLES[phase.workArea]
          const isConfirming = confirmDeleteId === phase.id

          return (
            <Card key={phase.id} className="gap-0 overflow-hidden p-0" style={{ borderLeft: `3px solid ${style.dot}` }}>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
                      style={{ background: style.bg, color: style.text }}
                    >
                      <span className="size-1.5 rounded-full" style={{ background: style.text }} />
                      {phase.workArea}
                    </span>
                    <StatusPill status={phase.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CalendarRange className="size-3.5" />
                      {formatDate(phase.startDate)} – {formatDate(phase.endDate)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="size-3.5" />
                      {team ? <TeamColorDot team={team} /> : null}
                      {team?.name ?? phase.teamId}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3.5" />
                      {phase.phaseHours} hrs
                    </span>
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <Banknote className="size-3.5" />
                      {formatCurrency(value)}
                    </span>
                  </div>
                </div>

                {!isConfirming && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon" className="size-8 shrink-0">
                          <MoreHorizontal />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(phase)}>
                        <Pencil /> Edit phase
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setConfirmDeleteId(phase.id)}>
                        <Trash2 /> Delete phase
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {isConfirming && (
                <div className="flex items-center justify-between gap-3 border-t border-danger/30 bg-danger-bg px-4 py-2.5">
                  <span className="text-xs text-danger">{deleteError ?? "Delete this phase? This can't be undone."}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { setConfirmDeleteId(null); setDeleteError(null) }}>Cancel</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(phase.id)}>Delete</Button>
                  </div>
                </div>
              )}

              {shares.length > 0 && (
                <div className="border-t border-border bg-muted/40 p-3 text-xs">
                  <p className="mb-1.5 font-medium text-muted-foreground">Shared phase — dollar split by hours logged</p>
                  <div className="space-y-1">
                    {shares.map((s) => {
                      const shareTeam = teams.find((t) => t.id === s.teamId)
                      return (
                        <div key={s.teamId} className="flex justify-between">
                          <span className="flex items-center gap-1.5">
                            {shareTeam ? <TeamColorDot team={shareTeam} /> : null}
                            {s.teamName}
                          </span>
                          <span>
                            {s.hoursOnPhase} hrs · {formatCurrency(s.dollarShare)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <AddEditPhaseDialog
        state={dialogState}
        onOpenChange={(open) => setDialogState((s) => ({ ...s, open }))}
        lockedJobId={job.id}
      />
    </div>
  )
}
