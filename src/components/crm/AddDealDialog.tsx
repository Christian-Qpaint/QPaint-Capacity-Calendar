import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useCrmData } from '@/context/CrmDataContext'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CrmDeal } from '@/types'

/** Deliberately small — pipeline/stage/title/value/currency only. Custom fields get filled in via
 * the drawer that opens right after creation; an add-dialog trying to show ~65 fields up front
 * would be unusable. */
export function AddDealDialog({
  open,
  onOpenChange,
  defaultPipelineId,
  defaultStageId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultPipelineId?: string
  defaultStageId?: string
  onCreated: (deal: CrmDeal) => void
}) {
  const { pipelines, stages, addDeal } = useCrmData()
  const sortedPipelines = [...pipelines].sort((a, b) => a.order - b.order)

  const [pipelineId, setPipelineId] = useState('')
  const [stageId, setStageId] = useState('')
  const [title, setTitle] = useState('')
  const [orgName, setOrgName] = useState('')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setOrgName('')
    setValue('')
    setError(null)
    setPipelineId(defaultPipelineId ?? sortedPipelines[0]?.id ?? '')
    setStageId(defaultStageId ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultPipelineId, defaultStageId])

  const pipelineStages = stages.filter((s) => s.pipelineId === pipelineId).sort((a, b) => a.order - b.order)
  useEffect(() => {
    if (!open) return
    if (!pipelineStages.some((s) => s.id === stageId)) setStageId(pipelineStages[0]?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId, open])

  const canSave = !!pipelineId && !!stageId && !!title.trim()

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const saved = await addDeal({
        pipelineId,
        stageId,
        title: title.trim(),
        value: Number(value) || 0,
        currency: 'AUD',
        orgName: orgName.trim() || undefined,
      })
      toast.success('Deal added')
      onOpenChange(false)
      onCreated(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add deal')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a deal</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Pipeline</Label>
              <Select value={pipelineId} onValueChange={(v) => v && setPipelineId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => sortedPipelines.find((p) => p.id === pipelineId)?.name ?? 'Select a pipeline'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sortedPipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={stageId} onValueChange={(v) => v && setStageId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => pipelineStages.find((s) => s.id === stageId)?.name ?? 'Select a stage'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {pipelineStages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Deal title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 123 Example St, Suburb" />
          </div>

          <div className="space-y-1.5">
            <Label>Client / organisation</Label>
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Optional" />
          </div>

          <div className="space-y-1.5">
            <Label>Value (AUD)</Label>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Adding…' : 'Add deal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
