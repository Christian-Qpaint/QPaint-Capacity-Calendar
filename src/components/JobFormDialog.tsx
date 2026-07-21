import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useData } from '@/context/DataContext'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { JOB_CATEGORIES } from '@/lib/jobFilters'
import { PIPEDRIVE_STAGE_LABELS, PIPEDRIVE_TARGET_STAGE_IDS, stageLabel } from '@/lib/pipedriveStages'
import { cn } from '@/lib/utils'
import { Info, Search, Trash2, TriangleAlert } from 'lucide-react'
import type { Client, ClientType, Job } from '@/types'

const CLIENT_TYPES: ClientType[] = ['Individual', 'Company', 'Government', 'Body Corporate']

/** Same searchable-combobox pattern as the Job picker in AddEditPhaseDialog. */
function ClientPicker({
  clients,
  value,
  onChange,
}: {
  clients: Client[]
  value: string
  onChange: (clientId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = clients.find((c) => c.id === value)
  const filtered = clients.filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={open ? query : (selected?.name ?? '')}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setQuery('')
            setOpen(true)
          }}
          onBlur={() => setOpen(false)}
          placeholder="Search existing clients…"
          className="pl-8"
        />
      </div>
      {open && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-md">
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No clients match "{query}"</p>}
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(c.id)
                setOpen(false)
              }}
              className={cn('block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-accent', c.id === value && 'bg-accent')}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export interface JobFormState {
  open: boolean
  /** null = create mode */
  job: Job | null
}

export function JobFormDialog({ state, onOpenChange }: { state: JobFormState; onOpenChange: (open: boolean) => void }) {
  const { clients, addClient, addJob, updateJob, deleteJob, scheduleBlocks } = useData()
  const isEdit = !!state.job
  const isManual = state.job ? state.job.pipedriveDealId.startsWith('MANUAL-') : true

  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing')
  const [clientId, setClientId] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [newClientType, setNewClientType] = useState<ClientType>('Individual')

  const [address, setAddress] = useState('')
  const [category, setCategory] = useState<Job['category']>('Residential')
  const [totalValue, setTotalValue] = useState('')
  const [targetHours, setTargetHours] = useState('')
  const [dateWon, setDateWon] = useState('')
  const [stageId, setStageId] = useState(String(PIPEDRIVE_TARGET_STAGE_IDS[0]))

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!state.open) return
    setError(null)
    setClientMode('existing')
    setNewClientName('')
    setNewClientType('Individual')
    if (state.job) {
      setClientId(state.job.clientId)
      setAddress(state.job.address)
      setCategory(state.job.category)
      setTotalValue(String(state.job.totalValue))
      setTargetHours(String(state.job.targetHours))
      setDateWon(state.job.dateWon)
      setStageId(state.job.pipedriveStageId != null ? String(state.job.pipedriveStageId) : String(PIPEDRIVE_TARGET_STAGE_IDS[0]))
    } else {
      setClientId('')
      setAddress('')
      setCategory('Residential')
      setTotalValue('')
      setTargetHours('')
      setDateWon(new Date().toISOString().slice(0, 10))
      setStageId(String(PIPEDRIVE_TARGET_STAGE_IDS[0]))
    }
  }, [state])

  const phaseCount = state.job ? scheduleBlocks.filter((b) => b.jobId === state.job!.id).length : 0
  const canSave = (clientMode === 'existing' ? !!clientId : !!newClientName) && address && totalValue && targetHours && dateWon

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      let finalClientId = clientId
      if (clientMode === 'new') {
        const created = await addClient({ name: newClientName, type: newClientType, contactInfo: '' })
        finalClientId = created.id
      }
      const payload = {
        clientId: finalClientId,
        address,
        category,
        totalValue: Number(totalValue) || 0,
        targetHours: Number(targetHours) || 0,
        dateWon,
        pipedriveStageId: Number(stageId),
      }
      if (isEdit && state.job) {
        await updateJob(state.job.id, payload)
        toast.success('Job updated')
      } else {
        await addJob(payload)
        toast.success('Job added')
      }
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save job')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!state.job) return
    try {
      await deleteJob(state.job.id)
      toast.success('Job deleted')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete job')
    }
  }

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit job' : 'Add a job'}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          {isEdit && !isManual && (
            <div className="flex items-start gap-2 rounded-md bg-warning-bg px-3 py-2.5 text-xs text-warning">
              <TriangleAlert className="size-3.5 shrink-0 translate-y-0.5" />
              <span>
                This job is synced from Pipedrive — these fields (except Client) will be overwritten with whatever's in
                Pipedrive next time someone clicks "Sync from Pipedrive". Edit here only for a temporary fix, or edit the
                deal in Pipedrive for a permanent one.
              </span>
            </div>
          )}
          {isEdit && isManual && (
            <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2.5 text-xs text-muted-foreground">
              <Info className="size-3.5 shrink-0 translate-y-0.5" />
              <span>Manually-added job — not linked to a Pipedrive deal, so syncing never touches it.</span>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Client</Label>
              <button
                type="button"
                className="text-xs text-info hover:underline"
                onClick={() => setClientMode((m) => (m === 'existing' ? 'new' : 'existing'))}
              >
                {clientMode === 'existing' ? '+ New client' : 'Pick existing client'}
              </button>
            </div>
            {clientMode === 'existing' ? (
              <ClientPicker clients={clients} value={clientId} onChange={setClientId} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  className="col-span-2"
                  placeholder="Client name"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                />
                <Select value={newClientType} onValueChange={(v) => v && setNewClientType(v as ClientType)}>
                  <SelectTrigger className="col-span-2 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLIENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Example St, Suburb QLD 4000" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v as Job['category'])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JOB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Pipeline stage</Label>
              <Select value={stageId} onValueChange={(v) => v && setStageId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string | null) => (v ? stageLabel(Number(v)) : 'Select a stage')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PIPEDRIVE_TARGET_STAGE_IDS.map((id) => (
                    <SelectItem key={id} value={String(id)}>{PIPEDRIVE_STAGE_LABELS[id]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Total value ($)</Label>
              <Input type="number" value={totalValue} onChange={(e) => setTotalValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Target hours</Label>
              <Input type="number" value={targetHours} onChange={(e) => setTargetHours(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Date won</Label>
              <Input type="date" value={dateWon} onChange={(e) => setDateWon(e.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <DialogFooter>
          {isEdit && (
            <Button
              variant="ghost"
              className="mr-auto text-danger hover:bg-danger-bg hover:text-danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 /> Delete job
            </Button>
          )}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add job'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete job?"
        description={
          phaseCount > 0
            ? `This job has ${phaseCount} scheduled phase${phaseCount === 1 ? '' : 's'} — deleting it also deletes those phases and any hours logged against them. This can't be undone.`
            : "This can't be undone."
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </Dialog>
  )
}
