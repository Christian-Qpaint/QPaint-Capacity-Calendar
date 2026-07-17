import { useMemo, useState } from 'react'
import { useData } from '@/context/DataContext'
import { useCurrentUser } from '@/context/AuthContext'
import { isOfficeRole } from '@/lib/permissions'
import { formatPercent } from '@/lib/formulas'
import { todayIso } from '@/lib/schedule'
import { supabase } from '@/lib/supabaseClient'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function UpdateProgress() {
  const { jobs, scheduleBlocks, updateScheduleBlock } = useData()
  const currentUser = useCurrentUser()
  const isOffice = isOfficeRole(currentUser.role)

  const eligibleBlocks = useMemo(
    () => scheduleBlocks.filter((b) => isOffice || b.teamId === currentUser.teamId),
    [scheduleBlocks, isOffice, currentUser.teamId],
  )

  const [scheduleBlockId, setScheduleBlockId] = useState(eligibleBlocks[0]?.id ?? '')
  const block = scheduleBlocks.find((b) => b.id === scheduleBlockId)
  const job = jobs.find((j) => j.id === block?.jobId)

  const [percent, setPercent] = useState(block?.percentComplete ?? 0)
  const [savedPace, setSavedPace] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSelectBlock(id: string) {
    setScheduleBlockId(id)
    const b = scheduleBlocks.find((sb) => sb.id === id)
    setPercent(b?.percentComplete ?? 0)
    setSavedPace(null)
    setError(null)
  }

  async function handleSave() {
    if (!block) return
    setSaving(true)
    setError(null)
    try {
      await updateScheduleBlock(block.id, {
        percentComplete: percent,
        percentCompleteUpdatedBy: currentUser.name,
        percentCompleteUpdatedAt: todayIso(),
      })
      // Pace is computed server-side (get_production_pace RPC) so the raw $ figures behind it
      // never reach this client at all — never mind get masked after the fact.
      const { data, error: rpcError } = await supabase.rpc('get_production_pace', { p_schedule_block_id: block.id })
      if (rpcError) throw rpcError
      setSavedPace(typeof data === 'number' ? data : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save progress')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-sm gap-4 p-5">
        <div className="space-y-1.5">
          <Label>Phase</Label>
          <Select value={scheduleBlockId} onValueChange={(v) => v && handleSelectBlock(v)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string | null) => {
                  if (!v) return 'Select a phase'
                  const b = scheduleBlocks.find((sb) => sb.id === v)
                  const j = jobs.find((job) => job.id === b?.jobId)
                  return b ? `${j?.address} — ${b.workArea}` : v
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {eligibleBlocks.map((b) => {
                const j = jobs.find((job) => job.id === b.jobId)
                return (
                  <SelectItem key={b.id} value={b.id}>
                    {j?.address} — {b.workArea}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        {block && (
          <>
            <div>
              <p className="text-base font-medium">Update progress</p>
              <p className="text-sm text-muted-foreground">
                {job?.address} — {block.workArea}
              </p>
              {block.percentCompleteUpdatedBy && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Last updated: {block.percentComplete}% · by {block.percentCompleteUpdatedBy}
                </p>
              )}
            </div>

            <div className="text-center">
              <span className="text-4xl font-medium">{percent}%</span>
            </div>
            <Slider
              value={[percent]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => setPercent(Array.isArray(v) ? v[0] : v)}
            />

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save progress'}
            </Button>

            {savedPace !== null && (
              <div className="rounded-md bg-card p-3 text-center shadow-sm ring-1 ring-border">
                <p className="text-xs text-muted-foreground">Your pace on this phase</p>
                <p className="text-xl font-medium text-success">{formatPercent(savedPace)} of target</p>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
