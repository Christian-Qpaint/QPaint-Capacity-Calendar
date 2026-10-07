import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useData } from '@/context/DataContext'
import { todayIso } from '@/lib/schedule'
import { WORKER_POSITIONS, WORKER_POSITION_DESCRIPTIONS } from '@/lib/workerPositions'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  DETAIL_DRAWER_CLASS,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { TeamColorDot } from '@/components/TeamColorDot'
import { Plus, Trash2, X } from 'lucide-react'
import type { Worker, WorkerTicket, WorkerType } from '@/types'

function SectionHeading({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="col-span-2 border-b border-border pb-1 pt-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function WorkerDrawer({
  open,
  onOpenChange,
  worker,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create mode */
  worker: Worker | null
}) {
  const { teams, contractors, teamMemberships, addWorker, updateWorker, deleteWorker, addTeamMembership, updateTeamMembership, deleteTeamMembership } =
    useData()
  const isEdit = !!worker

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [position, setPosition] = useState('Painter')
  const [workerType, setWorkerType] = useState<WorkerType>('Internal')
  const [contractorId, setContractorId] = useState('')
  const [whiteCard, setWhiteCard] = useState('')
  const [inductionDone, setInductionDone] = useState(false)
  const [inductionVerified, setInductionVerified] = useState(false)
  const [teamId, setTeamId] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [startDate, setStartDate] = useState('')
  const [licenceNumber, setLicenceNumber] = useState('')
  const [licenceExpiry, setLicenceExpiry] = useState('')
  const [whiteCardIssue, setWhiteCardIssue] = useState('')
  const [inductionDate, setInductionDate] = useState('')
  const [tickets, setTickets] = useState<WorkerTicket[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const existingCoreMembership = worker
    ? teamMemberships.find((tm) => tm.workerId === worker.id && tm.membershipType === 'Core')
    : undefined

  useEffect(() => {
    if (!open) return
    setError(null)
    if (worker) {
      setFirstName(worker.firstName)
      setLastName(worker.lastName)
      setPhone(worker.phone)
      setEmail(worker.email)
      setAddress(worker.address)
      setPosition(worker.position || 'Painter')
      setWorkerType(worker.workerType)
      setContractorId(worker.contractorId ?? '')
      setWhiteCard(worker.whiteCardNumber)
      setInductionDone(worker.qbuildInductionDone)
      setInductionVerified(worker.qbuildInductionVerified)
      setTeamId(existingCoreMembership?.teamId ?? '')
      setDateOfBirth(worker.dateOfBirth ?? '')
      setStartDate(worker.startDate ?? '')
      setLicenceNumber(worker.driversLicenceNumber ?? '')
      setLicenceExpiry(worker.driversLicenceExpiry ?? '')
      setWhiteCardIssue(worker.whiteCardIssueDate ?? '')
      setInductionDate(worker.qbuildInductionDate ?? '')
      setTickets(worker.otherTickets ?? [])
    } else {
      setFirstName('')
      setLastName('')
      setPhone('')
      setEmail('')
      setAddress('')
      setPosition('Painter')
      setWorkerType('Internal')
      setContractorId('')
      setWhiteCard('')
      setInductionDone(false)
      setInductionVerified(false)
      setTeamId('')
      setDateOfBirth('')
      setStartDate('')
      setLicenceNumber('')
      setLicenceExpiry('')
      setWhiteCardIssue('')
      setInductionDate('')
      setTickets([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, worker?.id])

  const crewOptions = workerType === 'Internal' ? teams.filter((t) => t.type === 'QPaint') : teams.filter((t) => t.contractorId === contractorId)

  async function syncCoreMembership(workerId: string) {
    if (teamId === (existingCoreMembership?.teamId ?? '')) return
    if (existingCoreMembership && !teamId) {
      await deleteTeamMembership(existingCoreMembership.id)
    } else if (existingCoreMembership && teamId) {
      await updateTeamMembership(existingCoreMembership.id, { teamId })
    } else if (!existingCoreMembership && teamId) {
      await addTeamMembership({ workerId, teamId, startDate: todayIso(), membershipType: 'Core' })
    }
  }

  async function handleSave() {
    if (!firstName || !lastName) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        firstName,
        lastName,
        phone,
        email,
        address,
        position,
        workerType,
        contractorId: workerType === 'Contractor' ? contractorId || undefined : undefined,
        whiteCardNumber: whiteCard,
        qbuildInductionDone: inductionDone,
        qbuildInductionVerified: inductionVerified,
        dateOfBirth: dateOfBirth || undefined,
        startDate: startDate || undefined,
        driversLicenceNumber: licenceNumber,
        driversLicenceExpiry: licenceExpiry || undefined,
        whiteCardIssueDate: whiteCardIssue || undefined,
        qbuildInductionDate: inductionDone ? inductionDate || undefined : undefined,
        otherTickets: tickets.filter((t) => t.name.trim() || t.number.trim()),
      }
      if (isEdit && worker) {
        await updateWorker(worker.id, payload)
        await syncCoreMembership(worker.id)
        toast.success('Worker updated')
      } else {
        const created = await addWorker(payload)
        await syncCoreMembership(created.id)
        toast.success('Worker added')
      }
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save worker')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!worker) return
    try {
      await deleteWorker(worker.id)
      toast.success('Worker deleted')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete worker')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={DETAIL_DRAWER_CLASS}>
        <SheetHeader>
          <SheetTitle>{isEdit ? `${worker!.firstName} ${worker!.lastName}` : 'Add Worker'}</SheetTitle>
          <SheetDescription>Worker directory record — contact, compliance, and crew assignment.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
          <div className="grid grid-cols-2 gap-3">
            <SectionHeading>Personal details</SectionHeading>
            <div className="space-y-1.5">
              <Label>First name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Last name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Date of birth</Label>
              <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>

            <SectionHeading hint="Who they work for and what they do.">Work</SectionHeading>
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Select value={position} onValueChange={(v) => v && setPosition(v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORKER_POSITIONS.map((p) => (
                    <SelectItem key={p} value={p}>{WORKER_POSITION_DESCRIPTIONS[p] ?? p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={workerType}
                onValueChange={(v) => {
                  if (!v) return
                  setWorkerType(v as WorkerType)
                  setTeamId('')
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Internal">Internal (QPaint employee)</SelectItem>
                  <SelectItem value="Contractor">Contractor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {workerType === 'Contractor' && (
              <div className="space-y-1.5">
                <Label>Employer (Contractor)</Label>
                <Select
                  value={contractorId}
                  onValueChange={(v) => {
                    setContractorId(v ?? '')
                    setTeamId('')
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string | null) => {
                        const c = v ? contractors.find((ct) => ct.id === v) : undefined
                        return c ? c.nickname || c.name : 'Select a contractor'
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.nickname || c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2 space-y-1.5">
              <Label>Crew / Team</Label>
              <Select value={teamId} onValueChange={(v) => setTeamId(v ?? '')} disabled={workerType === 'Contractor' && !contractorId}>
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
                        'Floating — no crew yet'
                      )
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {crewOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <TeamColorDot team={t} />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Leave this empty and the person stays “floating” until you pick a crew.</p>
            </div>

            <SectionHeading hint="Cards and licences, with their numbers and expiry dates.">Licences &amp; tickets</SectionHeading>
            <div className="space-y-1.5">
              <Label>Driver&apos;s licence number</Label>
              <Input value={licenceNumber} onChange={(e) => setLicenceNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Driver&apos;s licence expiry</Label>
              <Input type="date" value={licenceExpiry} onChange={(e) => setLicenceExpiry(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>White Card number</Label>
              <Input value={whiteCard} onChange={(e) => setWhiteCard(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>White Card issue date</Label>
              <Input type="date" value={whiteCardIssue} onChange={(e) => setWhiteCardIssue(e.target.value)} />
            </div>

            <div className="col-span-2 space-y-2">
              <Label>Other licences or tickets</Label>
              {tickets.length === 0 && <p className="text-xs text-muted-foreground">None yet — e.g. Blue Card, EWP Yellow Card, High Risk Work.</p>}
              {tickets.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_8.5rem_auto] items-center gap-2">
                  <Input
                    placeholder="Type (e.g. Blue Card)"
                    value={t.name}
                    onChange={(e) => setTickets((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <Input
                    placeholder="Number"
                    value={t.number}
                    onChange={(e) => setTickets((prev) => prev.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))}
                  />
                  <Input
                    type="date"
                    aria-label="Expiry date"
                    value={t.expiryDate ?? ''}
                    onChange={(e) => setTickets((prev) => prev.map((x, j) => (j === i ? { ...x, expiryDate: e.target.value || null } : x)))}
                  />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove ticket" onClick={() => setTickets((prev) => prev.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setTickets((prev) => [...prev, { name: '', number: '', expiryDate: null }])}>
                <Plus /> Add licence / ticket
              </Button>
            </div>

            <SectionHeading>QBuild induction</SectionHeading>
            <div className="col-span-2 flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={inductionDone} onChange={(e) => setInductionDone(e.target.checked)} />
                Induction done
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={inductionVerified} onChange={(e) => setInductionVerified(e.target.checked)} />
                Verified
              </label>
            </div>
            {inductionDone && (
              <div className="space-y-1.5">
                <Label>Date completed</Label>
                <Input type="date" value={inductionDate} onChange={(e) => setInductionDate(e.target.value)} />
              </div>
            )}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <SheetFooter className="flex-row justify-between border-t border-border">
          {isEdit ? (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={handleSave} disabled={!firstName || !lastName || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add worker'}
          </Button>
        </SheetFooter>
      </SheetContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete worker?"
        description={`This removes ${worker?.firstName} ${worker?.lastName} from the directory. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </Sheet>
  )
}
