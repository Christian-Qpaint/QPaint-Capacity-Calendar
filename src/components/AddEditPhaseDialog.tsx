import { useEffect, useState } from 'react'
import { useData } from '@/context/DataContext'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, phaseValue } from '@/lib/formulas'
import { TeamColorDot } from '@/components/TeamColorDot'
import type { ScheduleBlock, WorkArea } from '@/types'

const WORK_AREAS: WorkArea[] = ['External', 'Internal', 'Roof', 'Epoxy Floors', 'Decks']

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
  const { jobs, teams, addScheduleBlock, updateScheduleBlock } = useData()
  const isEdit = !!state.block

  const [jobId, setJobId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [workArea, setWorkArea] = useState<WorkArea>('Internal')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [phaseHours, setPhaseHours] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!state.open) return
    setError(null)
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

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit phase' : 'Add a phase'}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>Job</Label>
            <Select value={jobId} onValueChange={(v) => setJobId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string | null) => (v ? jobs.find((j) => j.id === v)?.address : 'Select a job')}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>{j.address}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add phase'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
