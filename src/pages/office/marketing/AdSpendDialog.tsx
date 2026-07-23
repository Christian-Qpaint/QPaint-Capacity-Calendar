import { useMemo, useState } from 'react'
import { DollarSign, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/formulas'
import type { AdSpendEntry } from '@/types'

function currentMonthValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function AdSpendDialog({
  adSpend,
  knownReferralSources,
  onSave,
  onDelete,
}: {
  adSpend: AdSpendEntry[]
  knownReferralSources: string[]
  onSave: (entry: Omit<AdSpendEntry, 'id'>) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(currentMonthValue())
  const [referralSource, setReferralSource] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const sorted = useMemo(() => [...adSpend].sort((a, b) => b.month.localeCompare(a.month) || a.referralSource.localeCompare(b.referralSource)), [adSpend])

  const canSave = month.length === 7 && referralSource.trim().length > 0 && Number(amount) >= 0 && amount !== ''

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave({ month: `${month}-01`, referralSource: referralSource.trim(), amount: Number(amount) })
      setReferralSource('')
      setAmount('')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await onDelete(id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <DollarSign className="size-4" />
        Ad Spend
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Monthly Ad Spend</DialogTitle>
          <DialogDescription>
            Enter spend by month and referral source — used to calculate CPL, CPQ, CPJ, and ROAS. One entry per
            month/source; saving again for the same pair updates it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="ad-spend-month">Month</Label>
            <Input id="ad-spend-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ad-spend-source">Referral Source</Label>
            <Input
              id="ad-spend-source"
              list="ad-spend-known-sources"
              value={referralSource}
              onChange={(e) => setReferralSource(e.target.value)}
              placeholder="e.g. Google Ads"
            />
            <datalist id="ad-spend-known-sources">
              {knownReferralSources.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ad-spend-amount">Amount ($)</Label>
            <Input
              id="ad-spend-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Referral Source</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No ad spend recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.month.slice(0, 7)}</TableCell>
                  <TableCell>{entry.referralSource}</TableCell>
                  <TableCell className="text-right">{formatCurrency(entry.amount)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                    >
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
