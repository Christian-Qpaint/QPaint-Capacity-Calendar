import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useData } from '@/context/DataContext'
import { todayIso } from '@/lib/schedule'
import { getTeamColors } from '@/lib/teamColors'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ColorSwatchInput } from '@/components/ColorSwatchInput'
import { TeamColorDot } from '@/components/TeamColorDot'
import { Trash2, X } from 'lucide-react'
import type { Team } from '@/types'

export function TeamDrawer({
  open,
  onOpenChange,
  team,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create mode */
  team: Team | null
}) {
  const { workers, teamMemberships, addTeam, updateTeam, deleteTeam, addTeamMembership, deleteTeamMembership } = useData()
  const isEdit = !!team

  const [name, setName] = useState('')
  const [headcount, setHeadcount] = useState('')
  const [stdHours, setStdHours] = useState('38')
  const [color, setColor] = useState('#5DCAA5')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [addMemberWorkerId, setAddMemberWorkerId] = useState('')
  const [floatWorkerId, setFloatWorkerId] = useState('')
  const [floatStart, setFloatStart] = useState(todayIso())
  const [floatEnd, setFloatEnd] = useState('')

  useEffect(() => {
    if (!open) return
    setError(null)
    setAddMemberWorkerId('')
    setFloatWorkerId('')
    setFloatStart(todayIso())
    setFloatEnd('')
    if (team) {
      setName(team.name)
      setHeadcount(String(team.headcount ?? ''))
      setStdHours(String(team.standardHoursPerWeek ?? 38))
      setColor(getTeamColors(team).bg)
    } else {
      setName('')
      setHeadcount('')
      setStdHours('38')
      setColor('#5DCAA5')
    }
  }, [open, team?.id])

  const coreMembers = team ? teamMemberships.filter((m) => m.teamId === team.id && m.membershipType === 'Core') : []
  const floatingMembers = team ? teamMemberships.filter((m) => m.teamId === team.id && m.membershipType === 'Floating') : []
  const internalWorkers = workers.filter((w) => w.workerType === 'Internal')
  const availableForCore = internalWorkers.filter((w) => !coreMembers.some((m) => m.workerId === w.id))

  async function handleSave() {
    if (!name) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name,
        type: 'QPaint' as const,
        headcount: Number(headcount) || undefined,
        standardHoursPerWeek: Number(stdHours) || undefined,
        color,
      }
      if (isEdit && team) {
        await updateTeam(team.id, payload)
        toast.success('Team updated')
      } else {
        await addTeam(payload)
        toast.success('Team added')
      }
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save team')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!team) return
    try {
      await deleteTeam(team.id)
      toast.success('Team deleted')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete team')
    }
  }

  async function handleAddCoreMember() {
    if (!team || !addMemberWorkerId) return
    try {
      await addTeamMembership({ workerId: addMemberWorkerId, teamId: team.id, startDate: todayIso(), membershipType: 'Core' })
      setAddMemberWorkerId('')
      toast.success('Member added')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add member')
    }
  }

  async function handleRemoveMembership(id: string) {
    try {
      await deleteTeamMembership(id)
      toast.success('Removed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove')
    }
  }

  async function handleAddFloating() {
    if (!team || !floatWorkerId || !floatStart) return
    try {
      await addTeamMembership({
        workerId: floatWorkerId,
        teamId: team.id,
        startDate: floatStart,
        endDate: floatEnd || undefined,
        membershipType: 'Floating',
      })
      setFloatWorkerId('')
      setFloatEnd('')
      toast.success('Floating membership added')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add floating membership')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {isEdit && <TeamColorDot team={team!} />}
            {isEdit ? team!.name : 'Add QPaint Team'}
          </SheetTitle>
          <SheetDescription>Crew details, capacity, and worker membership.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="col-span-3 space-y-1.5">
              <Label>Team name / leader</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team D — Alex" />
            </div>
            <div className="space-y-1.5">
              <Label>Headcount</Label>
              <Input type="number" value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Std hrs/week</Label>
              <Input type="number" value={stdHours} onChange={(e) => setStdHours(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Calendar color</Label>
              <div className="flex h-8 items-center">
                <ColorSwatchInput value={color} onChange={setColor} size="md" title="Change crew color" />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Calculated weekly capacity: <span className="font-medium text-foreground">{(Number(headcount) || 0) * (Number(stdHours) || 0)} hrs</span>
          </p>

          {error && <p className="text-sm text-danger">{error}</p>}

          {isEdit && (
            <>
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium">Core members</p>
                {coreMembers.length === 0 && <p className="text-xs text-muted-foreground">No core members yet.</p>}
                {coreMembers.map((m) => {
                  const w = workers.find((wk) => wk.id === m.workerId)
                  return (
                    <div key={m.id} className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-1.5 text-sm">
                      <span>{w ? `${w.firstName} ${w.lastName}` : m.workerId}</span>
                      <button onClick={() => handleRemoveMembership(m.id)} aria-label="Remove member">
                        <X className="size-3.5 text-muted-foreground hover:text-danger" />
                      </button>
                    </div>
                  )
                })}
                <div className="flex gap-2">
                  <Select value={addMemberWorkerId} onValueChange={(v) => setAddMemberWorkerId(v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: string | null) => { const w = availableForCore.find((wk) => wk.id === v); return w ? `${w.firstName} ${w.lastName}` : 'Add a worker' }}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {availableForCore.map((w) => <SelectItem key={w.id} value={w.id}>{w.firstName} {w.lastName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={handleAddCoreMember} disabled={!addMemberWorkerId}>Add</Button>
                </div>
              </div>

              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium">Floating members (borrowed, time-bound)</p>
                {floatingMembers.length === 0 && <p className="text-xs text-muted-foreground">None currently.</p>}
                {floatingMembers.map((m) => {
                  const w = workers.find((wk) => wk.id === m.workerId)
                  return (
                    <div key={m.id} className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-1.5 text-sm">
                      <span>
                        {w ? `${w.firstName} ${w.lastName}` : m.workerId}
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {m.startDate}{m.endDate ? ` – ${m.endDate}` : ' – ongoing'}
                        </span>
                      </span>
                      <button onClick={() => handleRemoveMembership(m.id)} aria-label="Remove member">
                        <X className="size-3.5 text-muted-foreground hover:text-danger" />
                      </button>
                    </div>
                  )
                })}
                <div className="grid grid-cols-2 gap-2">
                  <Select value={floatWorkerId} onValueChange={(v) => setFloatWorkerId(v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: string | null) => { const w = internalWorkers.find((wk) => wk.id === v); return w ? `${w.firstName} ${w.lastName}` : 'Select worker' }}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {internalWorkers.map((w) => <SelectItem key={w.id} value={w.id}>{w.firstName} {w.lastName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="date" value={floatStart} onChange={(e) => setFloatStart(e.target.value)} />
                  <Input type="date" placeholder="End date" value={floatEnd} onChange={(e) => setFloatEnd(e.target.value)} />
                  <Button size="sm" onClick={handleAddFloating} disabled={!floatWorkerId}>Add floating</Button>
                </div>
              </div>
            </>
          )}
        </div>

        <SheetFooter className="flex-row justify-between border-t border-border">
          {isEdit ? (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={handleSave} disabled={!name || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add team'}
          </Button>
        </SheetFooter>
      </SheetContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete team?"
        description={`This deletes ${team?.name} and cannot be undone. Schedule Blocks referencing this team will fail to load correctly.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </Sheet>
  )
}
