import { useMemo, useState } from 'react'
import { useData } from '@/context/DataContext'
import { useCurrentUser } from '@/context/AuthContext'
import { isOfficeRole } from '@/lib/permissions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TeamColorDot } from '@/components/TeamColorDot'
import { todayIso } from '@/lib/schedule'

const TODAY = todayIso()

export function LogHours() {
  const { teams, jobs, scheduleBlocks, dailyHoursEntries, addDailyHoursEntry } = useData()
  const currentUser = useCurrentUser()

  const isOffice = isOfficeRole(currentUser.role)
  const [loggingForSomeoneElse, setLoggingForSomeoneElse] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState(currentUser.teamId ?? '')
  const [scheduleBlockId, setScheduleBlockId] = useState('')
  const [hours, setHours] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const showTeamPicker = isOffice || loggingForSomeoneElse
  const effectiveTeamId = showTeamPicker ? selectedTeamId : currentUser.teamId ?? ''

  const activeBlocksForTeam = useMemo(
    () =>
      scheduleBlocks.filter((b) => b.teamId === effectiveTeamId && b.startDate <= TODAY && b.endDate >= TODAY),
    [scheduleBlocks, effectiveTeamId],
  )

  const todayEntries = dailyHoursEntries.filter((e) => e.enteredByUserId === currentUser.id && e.date === TODAY)

  async function handleLog() {
    if (!scheduleBlockId || !hours || !effectiveTeamId) return
    setSaving(true)
    setError(null)
    try {
      await addDailyHoursEntry({
        scheduleBlockId,
        teamId: effectiveTeamId,
        enteredByUserId: currentUser.id,
        date: TODAY,
        hours: Number(hours),
      })
      setScheduleBlockId('')
      setHours('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log hours')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-sm gap-4 p-5">
        <div>
          <p className="text-base font-medium">Log hours</p>
          <p className="text-sm text-muted-foreground">
            {new Date(TODAY + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>

        {showTeamPicker && (
          <div className="space-y-1.5">
            <Label>Team</Label>
            <Select value={selectedTeamId} onValueChange={(v) => setSelectedTeamId(v ?? '')}>
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
        )}

        <div className="space-y-1.5">
          <Label>Job</Label>
          <Select value={scheduleBlockId} onValueChange={(v) => setScheduleBlockId(v ?? '')} disabled={!effectiveTeamId}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string | null) => {
                  if (!v) return effectiveTeamId ? 'Select a job' : 'Select a team first'
                  const b = scheduleBlocks.find((sb) => sb.id === v)
                  const job = jobs.find((j) => j.id === b?.jobId)
                  return b ? `${job?.address} — ${b.workArea}` : v
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {activeBlocksForTeam.map((b) => {
                const job = jobs.find((j) => j.id === b.jobId)
                return (
                  <SelectItem key={b.id} value={b.id}>
                    {job?.address} — {b.workArea}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Hours worked today</Label>
          <Input type="number" step="0.5" placeholder="0.0" className="text-lg" value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button className="w-full" onClick={handleLog} disabled={!scheduleBlockId || !hours || saving}>
          {saving ? 'Logging…' : 'Log hours'}
        </Button>

        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Logged today</p>
          {todayEntries.length === 0 && <p className="text-sm text-muted-foreground">Nothing logged yet.</p>}
          {todayEntries.map((entry) => {
            const block = scheduleBlocks.find((b) => b.id === entry.scheduleBlockId)
            const job = jobs.find((j) => j.id === block?.jobId)
            return (
              <div key={entry.id} className="flex items-center justify-between py-1">
                <p className="text-sm">{job?.address}</p>
                <span className="text-sm font-medium">{entry.hours} hrs</span>
              </div>
            )
          })}
        </div>

        {!isOffice && (
          <button
            type="button"
            className="text-center text-sm text-info"
            onClick={() => setLoggingForSomeoneElse((v) => !v)}
          >
            {loggingForSomeoneElse ? 'Log for my own team instead' : 'Logging for someone else?'}
          </button>
        )}
      </Card>
    </div>
  )
}
