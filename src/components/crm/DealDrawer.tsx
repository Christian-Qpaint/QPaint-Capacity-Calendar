import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useCrmData } from '@/context/CrmDataContext'
import { usePermissions } from '@/context/PermissionsContext'
import { CrmFieldInput } from '@/components/crm/CrmFieldInput'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowUpRight, Trash2 } from 'lucide-react'
import type { CrmDeal } from '@/types'

const STATUS_STYLES: Record<CrmDeal['status'], string> = {
  open: 'bg-info-bg text-info',
  won: 'bg-success-bg text-success',
  lost: 'bg-danger-bg text-danger',
}

export function DealDrawer({
  open,
  onOpenChange,
  deal,
  onDealUpdated,
  onDealDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  deal: CrmDeal | null
  /** Fired after every successful save/move/mark-won/mark-lost so the board's own paginated
   * column/table state (which no longer mirrors a shared context array — see
   * CrmDataContext.tsx's header comment) can patch itself in place. */
  onDealUpdated?: (deal: CrmDeal) => void
  onDealDeleted?: (id: string) => void
}) {
  const { stages, fieldDefinitions, updateDeal, moveDealStage, markDealWon, markDealLost, deleteDeal } = useCrmData()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('crm.manage')

  // Own copy, kept in sync with every mutation below — the `deal` prop is a point-in-time
  // snapshot from whenever the drawer was opened, and never updates on its own after
  // markDealWon/markDealLost/moveDealStage/updateDeal resolve.
  const [currentDeal, setCurrentDeal] = useState<CrmDeal | null>(null)
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')
  const [currency, setCurrency] = useState('AUD')
  const [orgName, setOrgName] = useState('')
  const [personName, setPersonName] = useState('')
  const [stageId, setStageId] = useState('')
  const [fields, setFields] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [lostReasonPrompt, setLostReasonPrompt] = useState(false)
  const [lostReason, setLostReason] = useState('')

  useEffect(() => {
    if (!open || !deal) return
    setCurrentDeal(deal)
    setTitle(deal.title)
    setValue(deal.value === null ? '' : String(deal.value))
    setCurrency(deal.currency)
    setOrgName(deal.orgName ?? '')
    setPersonName(deal.personName ?? '')
    setStageId(deal.stageId)
    setFields(deal.fields ?? {})
  }, [open, deal])

  if (!currentDeal) return null

  const pipelineStages = stages.filter((s) => s.pipelineId === currentDeal.pipelineId).sort((a, b) => a.order - b.order)
  const sortedFieldDefs = [...fieldDefinitions].sort((a, b) => a.order - b.order)

  async function handleSave() {
    if (!currentDeal) return
    setSaving(true)
    try {
      let latest = currentDeal
      if (stageId !== currentDeal.stageId) {
        const { promoted, promotionSkippedReason, deal: movedDeal } = await moveDealStage(currentDeal.id, stageId)
        latest = movedDeal
        if (promoted) toast.success('Moved to a Won stage — a Job was created')
        else if (promotionSkippedReason) toast.warning(`Moved, but couldn't create a Job yet: ${promotionSkippedReason}`)
      }
      latest = await updateDeal(currentDeal.id, {
        title: title.trim(),
        value: Number(value) || 0,
        currency,
        orgName: orgName.trim() || undefined,
        personName: personName.trim() || undefined,
        fields,
      })
      setCurrentDeal(latest)
      onDealUpdated?.(latest)
      toast.success('Deal updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save deal')
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkWon() {
    if (!currentDeal) return
    try {
      const updated = await markDealWon(currentDeal.id)
      setCurrentDeal(updated)
      onDealUpdated?.(updated)
      if (updated.promoted) toast.success('Marked Won — a Job was created')
      else if (updated.promotionSkippedReason) toast.warning(`Marked Won, but couldn't create a Job yet: ${updated.promotionSkippedReason}`)
      else toast.success('Marked Won')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to mark Won')
    }
  }

  async function handleMarkLost() {
    if (!currentDeal) return
    try {
      const updated = await markDealLost(currentDeal.id, lostReason.trim() || undefined)
      setCurrentDeal(updated)
      onDealUpdated?.(updated)
      toast.success('Marked Lost')
      setLostReasonPrompt(false)
      setLostReason('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to mark Lost')
    }
  }

  async function handleDelete() {
    if (!currentDeal) return
    try {
      await deleteDeal(currentDeal.id)
      toast.success('Deal deleted')
      onDealDeleted?.(currentDeal.id)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete deal')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="truncate">{currentDeal.title}</SheetTitle>
          <SheetDescription>
            {currentDeal.pipedriveDealId ? `Pipedrive deal #${currentDeal.pipedriveDealId}` : 'Added manually — never existed in Pipedrive'}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[currentDeal.status]}`}>
              {currentDeal.status === 'open' ? 'Open' : currentDeal.status === 'won' ? 'Won' : 'Lost'}
            </span>
            {currentDeal.status === 'open' && canManage && (
              <>
                <Button size="xs" variant="outline" onClick={handleMarkWon}>Mark Won</Button>
                <Button size="xs" variant="outline" onClick={() => setLostReasonPrompt(true)}>Mark Lost</Button>
              </>
            )}
          </div>

          {lostReasonPrompt && (
            <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
              <Label>Lost reason (optional)</Label>
              <div className="flex gap-2">
                <Input value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="e.g. Timing not right" />
                <Button size="sm" onClick={handleMarkLost}>Confirm</Button>
                <Button size="sm" variant="ghost" onClick={() => setLostReasonPrompt(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canManage} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Client / organisation</Label>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={!canManage} />
            </div>
            <div className="space-y-1.5">
              <Label>Contact person</Label>
              <Input value={personName} onChange={(e) => setPersonName(e.target.value)} disabled={!canManage} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Value</Label>
              <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} disabled={!canManage} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} disabled={!canManage} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Stage</Label>
            <Select value={stageId} onValueChange={(v) => v && setStageId(v)} disabled={!canManage}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => pipelineStages.find((s) => s.id === stageId)?.name ?? 'Select a stage'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {pipelineStages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {currentDeal.status === 'lost' && currentDeal.lostReason && (
            <div className="space-y-1.5">
              <Label>Lost reason</Label>
              <Input value={currentDeal.lostReason} disabled />
            </div>
          )}

          {sortedFieldDefs.length > 0 && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-medium">Details</p>
              {sortedFieldDefs.map((def) => (
                <div key={def.key} className="space-y-1.5">
                  <Label>{def.label}</Label>
                  <CrmFieldInput
                    definition={def}
                    value={fields[def.key]}
                    onChange={(v) => canManage && setFields((prev) => ({ ...prev, [def.key]: v }))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <SheetFooter className="flex-row justify-between border-t border-border">
          {canManage ? (
            <Button variant="ghost" className="text-danger hover:bg-danger-bg hover:text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {currentDeal.jobId && (
              <Button variant="outline" size="sm" render={<Link to={`/jobs/${currentDeal.jobId}`} />}>
                View Job <ArrowUpRight />
              </Button>
            )}
            {canManage && (
              <Button onClick={handleSave} disabled={saving || !title.trim()}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete deal?"
        description="This can't be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </Sheet>
  )
}
