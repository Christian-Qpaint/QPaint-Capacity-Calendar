import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/apiClient'
import { Info, RefreshCw } from 'lucide-react'

// Diagnostic-only page — not linked from the main nav (see marketing.test_meta_ads in
// permissionCatalog.ts). Fetches raw data straight from Meta's Marketing API via
// meta-ad-spend-test.mts so we can see exactly what comes back before deciding how campaigns map
// onto QPaint's referral sources. Manual "Fetch" button only — no scheduled sync, nothing written
// to the ad_spend table.
interface MetaEntry {
  campaignId: string
  source: string
  spend: number
  impressions: number
  clicks: number
  cpc: number | null
  ctr: number | null
  dateStart: string
  dateStop: string
}

interface MetaFetchResult {
  accountName: string | null
  currency: string
  entries: MetaEntry[]
}

function formatMoney(value: number, currency: string): string {
  try {
    return value.toLocaleString('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 })
  } catch {
    return value.toFixed(2)
  }
}

export function MetaAdSpendTest() {
  const [result, setResult] = useState<MetaFetchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  async function handleFetch() {
    setLoading(true)
    try {
      const data = await api.get<MetaFetchResult>('/api/meta-ad-spend-test')
      setResult(data)
      setSourceFilter('all')
      toast.success(`Fetched ${data.entries.length} row(s) from Meta`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to fetch from Meta')
    } finally {
      setLoading(false)
    }
  }

  const sources = useMemo(() => Array.from(new Set((result?.entries ?? []).map((e) => e.source))).sort(), [result])

  const filteredEntries = useMemo(() => {
    if (!result) return []
    if (sourceFilter === 'all') return result.entries
    return result.entries.filter((e) => e.source === sourceFilter)
  }, [result, sourceFilter])

  const totalSpend = useMemo(() => filteredEntries.reduce((sum, e) => sum + e.spend, 0), [filteredEntries])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium">Meta Ads — Test Fetch</h1>
          <p className="text-sm text-muted-foreground">Raw data straight from the Meta Marketing API. Internal diagnostic, not linked from the nav.</p>
        </div>
        <Button onClick={handleFetch} disabled={loading}>
          <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} /> {loading ? 'Fetching…' : 'Fetch from Meta'}
        </Button>
      </div>

      <Card className="flex items-start gap-2 border-info/30 bg-info-bg/60 p-3 text-xs text-info">
        <Info className="size-4 shrink-0" />
        <p>
          Last 30 days, one row per campaign, pulled live on click — nothing here is saved or synced automatically yet.
        </p>
      </Card>

      {!result && !loading && <p className="text-sm text-muted-foreground">Click "Fetch from Meta" to load data.</p>}

      {result && (
        <Card className="gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">{result.accountName ?? 'Ad account'}</h3>
              <p className="text-xs text-muted-foreground">
                {filteredEntries.length} row(s) · Total spend: {formatMoney(totalSpend, result.currency)}
              </p>
            </div>
            <Select value={sourceFilter} onValueChange={(v) => v && setSourceFilter(v)}>
              <SelectTrigger size="sm" className="w-56">
                <SelectValue>{(v: unknown) => (v === 'all' ? 'All sources' : String(v))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source (campaign)</TableHead>
                  <TableHead className="w-32">Spend</TableHead>
                  <TableHead className="w-28">Impressions</TableHead>
                  <TableHead className="w-24">Clicks</TableHead>
                  <TableHead className="w-24">CPC</TableHead>
                  <TableHead className="w-24">CTR</TableHead>
                  <TableHead className="w-44">Date range</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No rows for this source.
                    </TableCell>
                  </TableRow>
                )}
                {filteredEntries.map((entry) => (
                  <TableRow key={entry.campaignId || entry.source}>
                    <TableCell className="font-medium">{entry.source}</TableCell>
                    <TableCell>{formatMoney(entry.spend, result.currency)}</TableCell>
                    <TableCell>{entry.impressions.toLocaleString()}</TableCell>
                    <TableCell>{entry.clicks.toLocaleString()}</TableCell>
                    <TableCell>{entry.cpc != null ? formatMoney(entry.cpc, result.currency) : '—'}</TableCell>
                    <TableCell>{entry.ctr != null ? `${entry.ctr.toFixed(2)}%` : '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.dateStart} → {entry.dateStop}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  )
}
