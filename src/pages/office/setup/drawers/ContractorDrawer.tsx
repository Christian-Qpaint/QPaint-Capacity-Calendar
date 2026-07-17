import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useData } from '@/context/DataContext'
import { useCurrentUser } from '@/context/AuthContext'
import { useDataAccess } from '@/hooks/useDataAccess'
import { contractorDirectoryTier } from '@/lib/permissions'
import { safetyTarget, formatCurrency } from '@/lib/formulas'
import { todayIso } from '@/lib/schedule'
import { getTeamColors } from '@/lib/teamColors'
import { ColorSwatchInput } from '@/components/ColorSwatchInput'
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
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CompliancePill } from '@/components/StatusBadges'
import { Trash2, X } from 'lucide-react'
import type { Contractor, CredentialJobTypeScope, CredentialType } from '@/types'

const CREDENTIAL_TYPES: CredentialType[] = [
  'Licence', 'Insurance', 'WorkCover', 'Public Liability', 'White Card', 'Blue Card', 'Police Check', 'WHS Induction', 'Driver Licence', 'Other',
]
const JOB_TYPE_SCOPES: CredentialJobTypeScope[] = ['All', 'Residential', 'Government', 'Corporate', 'Commercial']

function CrewMembers({ teamId, contractorId }: { teamId: string; contractorId: string }) {
  const { workers, teamMemberships, addTeamMembership, deleteTeamMembership } = useData()
  const [addWorkerId, setAddWorkerId] = useState('')

  const members = teamMemberships.filter((m) => m.teamId === teamId)
  const contractorWorkers = workers.filter((w) => w.workerType === 'Contractor' && w.contractorId === contractorId)
  const available = contractorWorkers.filter((w) => !members.some((m) => m.workerId === w.id))

  async function handleAdd() {
    if (!addWorkerId) return
    try {
      await addTeamMembership({ workerId: addWorkerId, teamId, startDate: todayIso(), membershipType: 'Core' })
      setAddWorkerId('')
      toast.success('Worker assigned')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign worker')
    }
  }

  async function handleRemove(id: string) {
    try {
      await deleteTeamMembership(id)
      toast.success('Removed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove')
    }
  }

  return (
    <div className="space-y-1.5 pl-3">
      {members.map((m) => {
        const w = workers.find((wk) => wk.id === m.workerId)
        return (
          <div key={m.id} className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{w ? `${w.firstName} ${w.lastName}` : m.workerId}</span>
            <button onClick={() => handleRemove(m.id)} aria-label="Remove worker">
              <X className="size-3 hover:text-danger" />
            </button>
          </div>
        )
      })}
      <div className="flex gap-1.5">
        <Select value={addWorkerId} onValueChange={(v) => setAddWorkerId(v ?? '')}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>{(v: string | null) => { const w = available.find((wk) => wk.id === v); return w ? `${w.firstName} ${w.lastName}` : 'Assign worker' }}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {available.map((w) => <SelectItem key={w.id} value={w.id}>{w.firstName} {w.lastName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleAdd} disabled={!addWorkerId}>Add</Button>
      </div>
    </div>
  )
}

export function ContractorDrawer({
  open,
  onOpenChange,
  contractor,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create mode */
  contractor: Contractor | null
}) {
  const { teams, addTeam, updateTeam, deleteTeam, credentials, addCredential, deleteCredential, addContractor, updateContractor, deleteContractor } =
    useData()
  const currentUser = useCurrentUser()
  const da = useDataAccess()
  const tier = contractorDirectoryTier(currentUser.role)
  const isEdit = !!contractor

  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [capacity, setCapacity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [newTeamName, setNewTeamName] = useState('')
  const [credType, setCredType] = useState<CredentialType>('Insurance')
  const [credNumber, setCredNumber] = useState('')
  const [credExpiry, setCredExpiry] = useState('')
  const [credScope, setCredScope] = useState<CredentialJobTypeScope>('All')

  useEffect(() => {
    if (!open) return
    setError(null)
    setNewTeamName('')
    setCredNumber('')
    setCredExpiry('')
    if (contractor) {
      setName(contractor.name)
      setNickname(contractor.nickname ?? '')
      setCapacity(String(contractor.reportedMonthlyCapacity))
    } else {
      setName('')
      setNickname('')
      setCapacity('')
    }
  }, [open, contractor?.id])

  const contractorTeams = contractor ? teams.filter((t) => t.contractorId === contractor.id) : []
  const contractorCredentials = contractor ? credentials.filter((c) => c.contractorId === contractor.id) : []
  const compliance = contractor ? da.getContractorCompliance(contractor.id) : null

  async function handleSave() {
    if (!name || !capacity) return
    setSaving(true)
    setError(null)
    try {
      if (isEdit && contractor) {
        await updateContractor(contractor.id, { name, nickname: nickname || undefined, reportedMonthlyCapacity: Number(capacity) })
        toast.success('Contractor updated')
      } else {
        await addContractor({ name, nickname: nickname || undefined, reportedMonthlyCapacity: Number(capacity) })
        toast.success('Contractor added')
      }
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save contractor')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!contractor) return
    try {
      await deleteContractor(contractor.id)
      toast.success('Contractor deleted')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete contractor')
    }
  }

  async function handleAddTeam() {
    if (!contractor || !newTeamName) return
    try {
      await addTeam({ name: newTeamName, type: 'Contractor', contractorId: contractor.id })
      setNewTeamName('')
      toast.success('Crew added')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add crew')
    }
  }

  async function handleDeleteTeam(teamId: string) {
    try {
      await deleteTeam(teamId)
      toast.success('Crew deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete crew')
    }
  }

  async function handleAddCredential() {
    if (!contractor || !credNumber || !credExpiry) return
    try {
      await addCredential({
        contractorId: contractor.id,
        credentialType: credType,
        number: credNumber,
        expiryDate: credExpiry,
        jobTypeScope: credScope === 'All' ? null : credScope,
      })
      setCredNumber('')
      setCredExpiry('')
      toast.success('Credential added')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add credential')
    }
  }

  async function handleDeleteCredential(id: string) {
    try {
      await deleteCredential(id)
      toast.success('Credential removed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove credential')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0 sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>{isEdit ? contractor!.nickname || contractor!.name : 'Add Contractor'}</SheetTitle>
            {compliance && <CompliancePill flag={compliance.flag} />}
          </div>
          <SheetDescription>
            {isEdit ? contractor!.tradingName || 'Business relationship, crews, credentials.' : 'New contractor business relationship.'}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4">
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label>Legal name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Painting Pty Ltd" />
            </div>
            <div className="space-y-1.5">
              <Label>Nickname</Label>
              <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Acme (optional — shown in scheduling views)" />
            </div>
            <div className="space-y-1.5">
              <Label>Reported monthly capacity ($)</Label>
              <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Safety target (80%): <span className="font-medium text-foreground">{formatCurrency(safetyTarget(Number(capacity) || 0))}</span>
            </p>
          </div>

          {isEdit && contractor && (contractor.abn || contractor.address || contractor.primaryContactName) && (
            <div className="space-y-1 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              {contractor.abn && <p>ABN {contractor.abn}{contractor.acn ? ` · ACN ${contractor.acn}` : ''}</p>}
              {contractor.address && <p>{contractor.address}, {contractor.suburb} {contractor.state} {contractor.postcode}</p>}
              {contractor.primaryContactName && <p>{contractor.primaryContactName} · {contractor.primaryContactMobile} · {contractor.primaryContactEmail}</p>}
              {contractor.licenceCategory && <p>Licence category: {contractor.licenceCategory}</p>}
              {contractor.yearsExperience != null && <p>{contractor.yearsExperience} years experience</p>}
              {(contractor.approved || contractor.active) && <p>Approved: {contractor.approved ?? '—'} · Active: {contractor.active ?? '—'}</p>}
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          {isEdit && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-sm font-medium">Crews / Teams</p>
                {contractorTeams.length === 0 && <p className="text-xs text-muted-foreground">No crews yet.</p>}
                {contractorTeams.map((t) => (
                  <div key={t.id} className="space-y-1.5 rounded-md border border-border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <ColorSwatchInput
                          value={getTeamColors(t).bg}
                          onChange={(v) => updateTeam(t.id, { color: v })}
                          title="Change crew color"
                        />
                        <span className="truncate text-sm font-medium">{t.name}</span>
                      </div>
                      <button onClick={() => handleDeleteTeam(t.id)} aria-label="Delete crew">
                        <Trash2 className="size-3.5 shrink-0 text-muted-foreground hover:text-danger" />
                      </button>
                    </div>
                    <CrewMembers teamId={t.id} contractorId={contractor!.id} />
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <Input className="h-8" placeholder="Crew name (e.g. Team 3)" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
                  <Button size="sm" onClick={handleAddTeam} disabled={!newTeamName}>Add crew</Button>
                </div>
              </div>

              {tier === 'full' && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Credentials</p>
                    {contractorCredentials.length === 0 && <p className="text-xs text-muted-foreground">None on file.</p>}
                    {contractorCredentials.map((cr) => (
                      <div key={cr.id} className="flex items-center justify-between text-xs">
                        <span>
                          {cr.credentialType} · {cr.number ?? '—'} {cr.jobTypeScope ? `(${cr.jobTypeScope})` : ''}
                        </span>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>{cr.expiryDate ? `Expires ${new Date(cr.expiryDate).toLocaleDateString('en-AU')}` : 'No expiry on file'}</span>
                          <button onClick={() => handleDeleteCredential(cr.id)} aria-label="Delete credential">
                            <X className="size-3 hover:text-danger" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/60 p-3">
                      <Select value={credType} onValueChange={(v) => v && setCredType(v as CredentialType)}>
                        <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CREDENTIAL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input className="h-8" placeholder="Number" value={credNumber} onChange={(e) => setCredNumber(e.target.value)} />
                      <Input className="h-8" type="date" value={credExpiry} onChange={(e) => setCredExpiry(e.target.value)} />
                      <Select value={credScope} onValueChange={(v) => v && setCredScope(v as CredentialJobTypeScope)}>
                        <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {JOB_TYPE_SCOPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="col-span-2" onClick={handleAddCredential}>Save credential</Button>
                    </div>
                  </div>
                </>
              )}
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
          <Button onClick={handleSave} disabled={!name || !capacity || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add contractor'}
          </Button>
        </SheetFooter>
      </SheetContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete contractor?"
        description={`This deletes ${contractor?.name}, its crews, and its credentials. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </Sheet>
  )
}
