import { useEffect, useState } from 'react'
import { useData } from '@/context/DataContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, phaseValue } from '@/lib/formulas'
import { jobDisplayName } from '@/lib/jobDisplay'
import { isSchedulableStage } from '@/lib/pipedriveStages'
import { TeamColorDot } from '@/components/TeamColorDot'
import { cn } from '@/lib/utils'
import { MapPin, Search, Trash2 } from 'lucide-react'
import type { Job, ScheduleBlock, WorkArea } from '@/types'

const WORK_AREAS: WorkArea[] = ['External', 'Internal', 'Roof', 'Epoxy Floors', 'Decks']

/** Searchable job picker — a plain <Select> becomes unusable to scroll through once there are
 * dozens of synced Pipedrive jobs, so this filters by quote ID/address/client as you type. */
function JobPicker({
  jobs,
  clients,
  value,
  onChange,
}: {
  jobs: Job[]
  clients: { id: string; name: string }[]
  value: string
  onChange: (jobId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedJob = jobs.find((j) => j.id === value)
  const filtered = jobs.filter((j) => {
    if (!query) return true
    const q = query.toLowerCase()
    const clientName = clients.find((c) => c.id === j.clientId)?.name ?? ''
    return jobDisplayName(j).toLowerCase().includes(q) || clientName.toLowerCase().includes(q)
  })

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={open ? query : selectedJob ? jobDisplayName(selectedJob) : ''}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setQuery('')
            setOpen(true)
          }}
          onBlur={() => setOpen(false)}
          placeholder="Search job by address, quote ID, or client…"
          className="pl-8"
        />
      </div>
      {open && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-md">
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No jobs match "{query}"</p>}
          {filtered.map((j) => (
            <button
              key={j.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(j.id)
                setOpen(false)
              }}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-sm hover:bg-accent',
                j.id === value && 'bg-accent',
              )}
            >
              <span className="truncate">{jobDisplayName(j)}</span>
              <span className="truncate text-xs text-muted-foreground">{clients.find((c) => c.id === j.clientId)?.name ?? 'Unknown client'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export interface PhaseDialogState {
  open: boolean
  /** existing block being edited, or null when creating a new one */
  block: ScheduleBlock | null
  /** pre-filled defaults when creating from an empty calendar slot */
  defaultTeamId?: string
  defaultDate?: string
}

export function AddEditPhaseDialog({
  state,
  onOpenChange,
  lockedJobId,
}: {
  state: PhaseDialogState
  onOpenChange: (open: boolean) => void
  /** When set (e.g. opened from within a single Job's page) the Job select is hidden and fixed. */
  lockedJobId?: string
}) {
  const { jobs, clients, teams, addScheduleBlock, updateScheduleBlock, deleteScheduleBlock } = useData()
  const da = useDataAccess()
  const isEdit = !!state.block

  const [jobId, setJobId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [workArea, setWorkArea] = useState<WorkArea>('Internal')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [phaseHours, setPhaseHours] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!state.open) return
    setError(null)
    setConfirmingDelete(false)
    if (state.block) {
      setJobId(state.block.jobId)
      setTeamId(state.block.teamId)
      setWorkArea(state.block.workArea)
      setStartDate(state.block.startDate)
      setEndDate(state.block.endDate)
      setPhaseHours(String(state.block.phaseHours))
    } else {
      setJobId(lockedJobId ?? '')
      setTeamId(state.defaultTeamId ?? '')
      setWorkArea('Internal')
      setStartDate(state.defaultDate ?? '')
      setEndDate(state.defaultDate ?? '')
      setPhaseHours('')
    }
  }, [state])

  // New phases only — prefill from the job's Pipedrive-synced Target Hours (minus whatever's
  // already allocated to its other phases) so the common single-phase job needs no re-typing.
  // Only kicks in while the field is untouched, so it never clobbers a manual edit.
  useEffect(() => {
    if (!state.open || isEdit || phaseHours !== '') return
    const job = jobs.find((j) => j.id === jobId)
    if (!job) return
    const remaining = job.targetHours - da.getJobPhaseHoursTotal(job.id)
    if (remaining > 0) setPhaseHours(String(remaining))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, state.open, isEdit])

  const job = jobs.find((j) => j.id === jobId)
  const previewValue = job ? phaseValue(job.totalValue, Number(phaseHours) || 0, job.targetHours) : 0
  const canSave = jobId && teamId && startDate && endDate && phaseHours

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      if (isEdit && state.block) {
        await updateScheduleBlock(state.block.id, { jobId, teamId, workArea, startDate, endDate, phaseHours: Number(phaseHours) })
      } else {
        await addScheduleBlock({ jobId, teamId, workArea, startDate, endDate, phaseHours: Number(phaseHours), status: 'Scheduled', percentComplete: 0 })
      }
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save phase')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!state.block) return
    setDeleting(true)
    setError(null)
    try {
      await deleteScheduleBlock(state.block.id)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete phase')
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit phase' : 'Add a phase'}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>Job</Label>
            {lockedJobId ? (
              <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                {job ? jobDisplayName(job) : 'Unknown job'}
              </p>
            ) : (
              // Only schedulable-stage jobs are pickable for a NEW selection — always keeps the
              // currently-selected job visible too, so editing a phase whose job has since moved to
              // a non-schedulable stage doesn't leave the picker looking blank/broken.
              <JobPicker
                jobs={jobs.filter((j) => isSchedulableStage(j.pipedriveStageId) || j.id === jobId)}
                clients={clients}
                value={jobId}
                onChange={setJobId}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Work area</Label>
              <Select value={workArea} onValueChange={(v) => v && setWorkArea(v as WorkArea)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORK_AREAS.map((wa) => (
                    <SelectItem key={wa} value={wa}>{wa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Team</Label>
              <Select value={teamId} onValueChange={(v) => setTeamId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) => {
                      const t = v ? teams.find((tm) => tm.id === v) : undefined
                      return t ? (
                        <span className="flex items-center gap-2">
                          <TeamColorDot team={t} />
                          {t.name}
                        </span>
                      ) : (
                        'Select a team'
                      )
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <TeamColorDot team={t} />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phase target hours</Label>
              <Input type="number" placeholder="0" value={phaseHours} onChange={(e) => setPhaseHours(e.target.value)} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Calculated phase value: <span className="font-medium text-foreground">{formatCurrency(previewValue)}</span>
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        {confirmingDelete ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5">
            <span className="text-xs text-danger">Delete this phase? This can't be undone.</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        ) : (
          <DialogFooter>
            {isEdit && (
              <Button
                variant="ghost"
                className="mr-auto text-danger hover:bg-danger-bg hover:text-danger"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 /> Delete phase
              </Button>
            )}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add phase'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
