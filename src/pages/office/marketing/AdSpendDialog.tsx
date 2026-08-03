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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/formulas'
import { monthKeyNow, monthsBetweenKeys } from '@/lib/marketingDataAccess'
import type { AdSpendEntry } from '@/types'

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
  const [fromMonth, setFromMonth] = useState(monthKeyNow())
  const [toMonth, setToMonth] = useState(monthKeyNow())
  const [referralSource, setReferralSource] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...adSpend].sort((a, b) => b.month.localeCompare(a.month) || a.referralSource.localeCompare(b.referralSource)),
    [adSpend],
  )

  const groupedBySource = useMemo(() => {
    const bySource = new Map<string, AdSpendEntry[]>()
    for (const entry of adSpend) {
      const list = bySource.get(entry.referralSource) ?? []
      list.push(entry)
      bySource.set(entry.referralSource, list)
    }
    return [...bySource.entries()]
      .map(([source, entries]) => ({
        source,
        entries: [...entries].sort((a, b) => b.month.localeCompare(a.month)),
        total: entries.reduce((sum, e) => sum + e.amount, 0),
      }))
      .sort((a, b) => b.total - a.total || a.source.localeCompare(b.source))
  }, [adSpend])

  const monthsInRange = useMemo(() => monthsBetweenKeys(fromMonth, toMonth), [fromMonth, toMonth])

  const canSave = monthsInRange.length > 0 && referralSource.trim().length > 0 && amount !== '' && Number(amount) >= 0

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const trimmedSource = referralSource.trim()
      const amountValue = Number(amount)
      for (const key of monthsInRange) {
        await onSave({ month: `${key}-01`, referralSource: trimmedSource, amount: amountValue })
      }
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
            Enter spend for one month or a range of months and a referral source — used to calculate CPL, CPQ, CPJ,
            and ROAS. Saving a range applies the same amount to every month in it. One entry per month/source;
            saving again for the same pair updates it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="ad-spend-from">From</Label>
              <Input id="ad-spend-from" type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ad-spend-to">To</Label>
              <Input id="ad-spend-to" type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} />
            </div>
          </div>
          {fromMonth && toMonth && monthsInRange.length === 0 && (
            <p className="text-xs text-danger">"To" must be the same month as or later than "From".</p>
          )}
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
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
              <Label htmlFor="ad-spend-amount">Amount ($ per month)</Label>
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
              {saving ? 'Saving…' : monthsInRange.length > 1 ? `Save × ${monthsInRange.length}` : 'Save'}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="all" className="min-w-0 gap-2">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="by-source">By Source</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
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
          </TabsContent>

          <TabsContent value="by-source">
            {groupedBySource.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No ad spend recorded yet.</p>
            ) : (
              <Tabs defaultValue={groupedBySource[0].source} className="gap-2">
                <div className="overflow-x-auto">
                  <TabsList className="w-max">
                    {groupedBySource.map((group) => (
                      <TabsTrigger key={group.source} value={group.source} className="shrink-0">
                        {group.source}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {groupedBySource.map((group) => (
                  <TabsContent key={group.source} value={group.source}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium">{group.source}</span>
                      <span className="font-semibold">{formatCurrency(group.total)}</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.entries.map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell>{entry.month.slice(0, 7)}</TableCell>
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
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
