import { useEffect, useMemo, useState } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/apiClient'
import { formatCurrency } from '@/lib/formulas'
import { monthKeyNow, monthsBetweenKeys } from '@/lib/marketingDataAccess'
import type { AdSpendEntry } from '@/types'

const SYNCED_PLATFORM_LABELS: Record<string, string> = { meta: 'Meta', google: 'Google Ads' }

interface UnmappedCampaign {
  platform: string
  campaignId: string
  source: string
  spend: number
  month: string
}

function campaignKey(platform: string, campaignId: string): string {
  return `${platform}:${campaignId}`
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
  const [fromMonth, setFromMonth] = useState(monthKeyNow())
  const [toMonth, setToMonth] = useState(monthKeyNow())
  const [referralSource, setReferralSource] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [unmapped, setUnmapped] = useState<UnmappedCampaign[]>([])
  const [selectedCampaignKey, setSelectedCampaignKey] = useState('')

  // Campaigns already synced from an ad platform (see Ads Management) that haven't been linked to
  // a referral source yet — picking one here both fills the Amount field and, once saved, records
  // the mapping so this same campaign won't show up as "unmapped" again next time. Same
  // marketing.import permission tier as the rest of this dialog, not owner-only.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    api
      .get<{ unmapped: UnmappedCampaign[] }>('/api/ad-campaign-mappings')
      .then((data) => {
        if (!cancelled) setUnmapped(data.unmapped)
      })
      .catch(() => {
        if (!cancelled) setUnmapped([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

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

  function handlePickUnmapped(key: string) {
    setSelectedCampaignKey(key)
    const campaign = unmapped.find((c) => campaignKey(c.platform, c.campaignId) === key)
    if (!campaign) return
    setAmount(campaign.spend.toFixed(2))
    setFromMonth(campaign.month)
    setToMonth(campaign.month)
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const trimmedSource = referralSource.trim()
      const amountValue = Number(amount)
      for (const key of monthsInRange) {
        await onSave({ month: `${key}-01`, referralSource: trimmedSource, amount: amountValue })
      }

      const campaign = unmapped.find((c) => campaignKey(c.platform, c.campaignId) === selectedCampaignKey)
      if (campaign) {
        await api.post('/api/ad-campaign-mappings', {
          platform: campaign.platform,
          campaignId: campaign.campaignId,
          source: campaign.source,
          referralSource: trimmedSource,
        })
        setUnmapped((prev) => prev.filter((c) => campaignKey(c.platform, c.campaignId) !== selectedCampaignKey))
      }

      setReferralSource('')
      setAmount('')
      setSelectedCampaignKey('')
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
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Monthly Ad Spend</DialogTitle>
          <DialogDescription>
            Enter spend for one month or a range of months and a referral source — used to calculate CPL, CPQ, CPJ,
            and ROAS. Saving a range applies the same amount to every month in it. One entry per month/source;
            saving again for the same pair updates it.
          </DialogDescription>
        </DialogHeader>

        {/* The dialog shell is a 3-row grid (header/1fr/footer); wrapping everything between header
            and footer in one flex-col column gives it that single 1fr slot, and flex-1 + min-h-0 on
            each nested level below lets the source list and its table actually grow to fill the
            modal's height instead of being capped at an arbitrary fixed height. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4">
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
                onChange={(e) => {
                  setAmount(e.target.value)
                  setSelectedCampaignKey('')
                }}
                placeholder="0.00"
              />
            </div>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? 'Saving…' : monthsInRange.length > 1 ? `Save × ${monthsInRange.length}` : 'Save'}
            </Button>
          </div>

          {unmapped.length > 0 && (
            <div className="space-y-1">
              <Label>Or fill from an unmapped ad</Label>
              <Select value={selectedCampaignKey} onValueChange={(v) => v && handlePickUnmapped(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {() => {
                      const campaign = unmapped.find((c) => campaignKey(c.platform, c.campaignId) === selectedCampaignKey)
                      return campaign
                        ? `${SYNCED_PLATFORM_LABELS[campaign.platform] ?? campaign.platform} — ${campaign.source}`
                        : 'Choose a synced campaign not yet linked to a referral source…'
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {unmapped.map((c) => (
                    <SelectItem key={campaignKey(c.platform, c.campaignId)} value={campaignKey(c.platform, c.campaignId)}>
                      {SYNCED_PLATFORM_LABELS[c.platform] ?? c.platform} — {c.source} ({formatCurrency(c.spend)}, {c.month})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Picking one fills the amount above and, once saved, remembers this campaign under whatever referral
                source you enter — it won't show here again.
              </p>
            </div>
          )}
        </div>

        <Tabs defaultValue="all" className="min-h-0 min-w-0 flex-1 gap-2">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="by-source">By Source</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
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

          <TabsContent value="by-source" className="flex min-h-0 flex-col">
            {groupedBySource.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No ad spend recorded yet.</p>
            ) : (
              <Tabs defaultValue={groupedBySource[0].source} orientation="vertical" className="min-h-0 flex-1 gap-3">
                <TabsList className="h-full w-48 shrink-0 items-stretch justify-start gap-0.5 overflow-y-auto p-1">
                  {groupedBySource.map((group) => (
                    <TabsTrigger key={group.source} value={group.source} className="justify-start px-2 py-1.5 text-left">
                      <span className="truncate">{group.source}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {groupedBySource.map((group) => (
                  <TabsContent key={group.source} value={group.source} className="flex min-w-0 min-h-0 flex-col">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium">{group.source}</span>
                      <span className="font-semibold">{formatCurrency(group.total)}</span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
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
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
