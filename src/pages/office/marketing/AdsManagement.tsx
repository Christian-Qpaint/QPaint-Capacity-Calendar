import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePersistedState } from '@/hooks/usePersistedState'
import { api } from '@/lib/apiClient'
import { cn } from '@/lib/utils'
import { addMonths, formatMonthLabel, monthStart, toIsoDate } from '@/lib/schedule'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Eye,
  MousePointerClick,
  RefreshCw,
  Search,
  Target,
  UserPlus,
} from 'lucide-react'

// Ads Management — per-platform campaign data synced on demand from each ad platform's own API
// (Meta first; Google Ads is a placeholder tab until that integration is built). A sync always
// replaces the saved rows for the exact (platform, month) it just re-fetched rather than
// accumulating — see ad-platform-sync.mts for why ("re-sync overwrites" is correct behavior here,
// since ad platforms revise conversion/attribution numbers for a window after a month closes).
type Platform = 'meta' | 'google'

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'meta', label: 'Meta' },
  { id: 'google', label: 'Google Ads' },
]

const PLATFORM_PILL_STYLES: Record<Platform, string> = {
  meta: 'bg-info-bg text-info',
  google: 'bg-warning-bg text-warning',
}

interface CampaignRow {
  id: string
  platform: Platform
  month: string
  campaignId: string
  source: string
  spend: number
  impressions: number
  reach?: number
  frequency?: number
  clicks: number
  cpc?: number
  ctr?: number
  cpm?: number
  leads?: number
  currency: string
  dateStart: string
  dateStop: string
  updatedAt: string
}

const COST_PER_LEAD_FLAG_THRESHOLD = 50 // AUD — above this, Cost Per Lead is a red flag for Tas

function formatMoney(value: number, currency: string): string {
  try {
    return value.toLocaleString('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 })
  } catch {
    return value.toFixed(2)
  }
}

function formatWhen(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Full, static class strings per tone — Tailwind's build-time scanner only picks up literal class
// names, so a template-literal like `bg-${tone}-bg` would silently compile to no styling at all.
const KPI_TONE_STYLES: Record<'info' | 'success' | 'danger', string> = {
  info: 'bg-info-bg text-info',
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  hint,
  flagged,
}: {
  label: string
  value: string
  icon: ComponentType<{ className?: string }>
  tone: keyof typeof KPI_TONE_STYLES
  hint?: string
  flagged?: boolean
}) {
  return (
    <Card className={cn('gap-2 p-4 transition hover:shadow-md', flagged && 'ring-1 ring-danger/40')}>
      <div className="flex items-center gap-2">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', KPI_TONE_STYLES[tone])}>
          <Icon className="size-4" />
        </span>
        <p className="text-xs text-muted-foreground">{label}</p>
        {flagged && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-medium text-danger">
            <AlertTriangle className="size-3" /> Needs attention
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

function KpiCardsRow({ rows, currency }: { rows: CampaignRow[]; currency: string }) {
  const totals = useMemo(() => {
    const spend = rows.reduce((sum, r) => sum + r.spend, 0)
    const impressions = rows.reduce((sum, r) => sum + r.impressions, 0)
    const clicks = rows.reduce((sum, r) => sum + r.clicks, 0)
    const leads = rows.reduce((sum, r) => sum + (r.leads ?? 0), 0)
    const costPerLead = leads > 0 ? spend / leads : null
    return { spend, impressions, clicks, leads, costPerLead }
  }, [rows])

  const flagged = totals.costPerLead != null && totals.costPerLead > COST_PER_LEAD_FLAG_THRESHOLD

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard label="Spend" value={formatMoney(totals.spend, currency)} icon={DollarSign} tone="info" />
      <KpiCard label="Impressions" value={totals.impressions.toLocaleString()} icon={Eye} tone="info" />
      <KpiCard label="Clicks" value={totals.clicks.toLocaleString()} icon={MousePointerClick} tone="info" />
      <KpiCard label="Leads" value={totals.leads.toLocaleString()} icon={UserPlus} tone="info" />
      <KpiCard
        label="Cost Per Lead"
        value={totals.costPerLead != null ? formatMoney(totals.costPerLead, currency) : '—'}
        icon={flagged ? AlertTriangle : Target}
        tone={flagged ? 'danger' : 'success'}
        hint={`Flags above ${formatMoney(COST_PER_LEAD_FLAG_THRESHOLD, currency)}`}
        flagged={flagged}
      />
    </div>
  )
}

type SortKey = 'platform' | 'source' | 'spend' | 'impressions' | 'reach' | 'frequency' | 'clicks' | 'cpc' | 'ctr' | 'cpm' | 'leads' | 'costPerLead' | 'dateStart'
type SortDirection = 'asc' | 'desc'
const PAGE_SIZE = 50

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  sort: { key: SortKey; direction: SortDirection }
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sort.key === sortKey
  const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn('inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground', active && 'text-foreground')}
      >
        {label}
        <Icon className={cn('size-3.5', !active && 'opacity-30')} />
      </button>
    </TableHead>
  )
}

function costPerLead(row: CampaignRow): number | null {
  return row.leads && row.leads > 0 ? row.spend / row.leads : null
}

function CampaignTableSection({ rows, showPlatform }: { rows: CampaignRow[]; showPlatform: boolean }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'spend', direction: 'desc' })
  const [page, setPage] = useState(1)

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }))
    setPage(1)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.source.toLowerCase().includes(q))
  }, [rows, search])

  const sorted = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'source':
          return a.source.localeCompare(b.source) * dir
        case 'platform':
          return a.platform.localeCompare(b.platform) * dir
        case 'dateStart':
          return a.dateStart.localeCompare(b.dateStart) * dir
        case 'costPerLead':
          return ((costPerLead(a) ?? -1) - (costPerLead(b) ?? -1)) * dir
        default: {
          const av = (a[sort.key] as number | undefined) ?? 0
          const bv = (b[sort.key] as number | undefined) ?? 0
          return (av - bv) * dir
        }
      }
    })
  }, [filtered, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Campaigns</h3>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search campaigns…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {showPlatform && <SortableHead label="Platform" sortKey="platform" sort={sort} onSort={toggleSort} className="w-28" />}
              <SortableHead label="Source (campaign)" sortKey="source" sort={sort} onSort={toggleSort} />
              <SortableHead label="Spend" sortKey="spend" sort={sort} onSort={toggleSort} className="w-28" />
              <SortableHead label="Impressions" sortKey="impressions" sort={sort} onSort={toggleSort} className="w-28" />
              <SortableHead label="Reach" sortKey="reach" sort={sort} onSort={toggleSort} className="w-24" />
              <SortableHead label="Frequency" sortKey="frequency" sort={sort} onSort={toggleSort} className="w-24" />
              <SortableHead label="Clicks" sortKey="clicks" sort={sort} onSort={toggleSort} className="w-24" />
              <SortableHead label="CPC" sortKey="cpc" sort={sort} onSort={toggleSort} className="w-24" />
              <SortableHead label="CTR" sortKey="ctr" sort={sort} onSort={toggleSort} className="w-20" />
              <SortableHead label="CPM" sortKey="cpm" sort={sort} onSort={toggleSort} className="w-24" />
              <SortableHead label="Leads" sortKey="leads" sort={sort} onSort={toggleSort} className="w-20" />
              <SortableHead label="Cost/Lead" sortKey="costPerLead" sort={sort} onSort={toggleSort} className="w-28" />
              <SortableHead label="Date range" sortKey="dateStart" sort={sort} onSort={toggleSort} className="w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={showPlatform ? 13 : 12} className="py-8 text-center text-sm text-muted-foreground">
                  No data yet — click "Fetch" to pull the latest, or adjust your search.
                </TableCell>
              </TableRow>
            )}
            {paged.map((row) => {
              const cpl = costPerLead(row)
              const flagged = cpl != null && cpl > COST_PER_LEAD_FLAG_THRESHOLD
              return (
                <TableRow key={row.id}>
                  {showPlatform && (
                    <TableCell>
                      <span className={cn('inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium', PLATFORM_PILL_STYLES[row.platform])}>
                        {PLATFORMS.find((p) => p.id === row.platform)?.label ?? row.platform}
                      </span>
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{row.source}</TableCell>
                  <TableCell>{formatMoney(row.spend, row.currency)}</TableCell>
                  <TableCell>{row.impressions.toLocaleString()}</TableCell>
                  <TableCell>{row.reach != null ? row.reach.toLocaleString() : '—'}</TableCell>
                  <TableCell>{row.frequency != null ? row.frequency.toFixed(2) : '—'}</TableCell>
                  <TableCell>{row.clicks.toLocaleString()}</TableCell>
                  <TableCell>{row.cpc != null ? formatMoney(row.cpc, row.currency) : '—'}</TableCell>
                  <TableCell>{row.ctr != null ? `${row.ctr.toFixed(2)}%` : '—'}</TableCell>
                  <TableCell>{row.cpm != null ? formatMoney(row.cpm, row.currency) : '—'}</TableCell>
                  <TableCell>{row.leads != null ? row.leads.toLocaleString() : '—'}</TableCell>
                  <TableCell>
                    {cpl != null ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                          flagged ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success',
                        )}
                      >
                        {flagged && <AlertTriangle className="size-3" />}
                        {formatMoney(cpl, row.currency)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatWhen(row.dateStart)} → {formatWhen(row.dateStop)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Page {currentPage} of {totalPages} · {sorted.length} campaigns
          </span>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <Button size="icon-sm" variant="ghost" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function PlatformPanel({
  platform,
  month,
  onSynced,
}: {
  platform: Platform
  month: string
  onSynced: () => void
}) {
  const [rows, setRows] = useState<CampaignRow[]>([])
  const [currency, setCurrency] = useState('AUD')
  const [accountName, setAccountName] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  async function sync(silent: boolean) {
    setSyncing(true)
    try {
      const data = await api.post<{ accountName: string | null; currency: string; rows: CampaignRow[] }>('/api/ad-platform-sync', { platform, month })
      setRows(data.rows)
      setCurrency(data.currency)
      setAccountName(data.accountName)
      if (!silent) toast.success(`Synced ${data.rows.length} campaign(s) from ${PLATFORMS.find((p) => p.id === platform)?.label}`)
      onSynced()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  // Every month navigation (and the initial mount) pulls the latest for that month automatically —
  // the "Fetch" button below is a manual re-run of the exact same sync, just with its own toast.
  useEffect(() => {
    sync(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, month])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{accountName ?? 'Ad account'}</p>
        <Button onClick={() => sync(false)} disabled={syncing}>
          <RefreshCw className={syncing ? 'size-4 animate-spin' : 'size-4'} />
          {syncing ? 'Fetching…' : `Fetch from ${PLATFORMS.find((p) => p.id === platform)?.label}`}
        </Button>
      </div>
      <KpiCardsRow rows={rows} currency={currency} />
      <CampaignTableSection rows={rows} showPlatform={false} />
    </div>
  )
}

function OverviewPanel({ month, refreshKey }: { month: string; refreshKey: number }) {
  const [rows, setRows] = useState<CampaignRow[]>([])

  useEffect(() => {
    let cancelled = false
    api
      .get<{ rows: CampaignRow[] }>(`/api/ad-platform-campaigns?month=${month}`)
      .then((data) => {
        if (!cancelled) setRows(data.rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [month, refreshKey])

  const currency = rows[0]?.currency ?? 'AUD'

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Combined across every connected ad platform for this month.</p>
      <KpiCardsRow rows={rows} currency={currency} />
      <CampaignTableSection rows={rows} showPlatform />
    </div>
  )
}

export function AdsManagement() {
  const [month, setMonth] = usePersistedState('qpaint:ads-management:month', toIsoDate(monthStart(new Date())).slice(0, 7))
  const [activeTab, setActiveTab] = usePersistedState<'overview' | Platform>('qpaint:ads-management:tab', 'overview')
  const [refreshKey, setRefreshKey] = useState(0)

  const monthDate = useMemo(() => new Date(`${month}-01T00:00:00`), [month])
  const monthLabel = formatMonthLabel(monthStart(monthDate))

  function stepMonth(dir: 1 | -1) {
    const next = addMonths(monthDate, dir)
    setMonth(toIsoDate(monthStart(next)).slice(0, 7))
  }
  function goToday() {
    setMonth(toIsoDate(monthStart(new Date())).slice(0, 7))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium">Ads Management</h1>
        <p className="text-sm text-muted-foreground">Per-platform campaign data, synced on demand straight from each ad platform's own API.</p>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button size="icon-sm" variant="ghost" onClick={() => stepMonth(-1)} aria-label="Previous month">
          <ChevronLeft />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium">{monthLabel}</span>
        <Button size="icon-sm" variant="ghost" onClick={() => stepMonth(1)} aria-label="Next month">
          <ChevronRight />
        </Button>
        <Button size="sm" variant="ghost" onClick={goToday}>
          This month
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => v && setActiveTab(v as 'overview' | Platform)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {PLATFORMS.map((p) => (
            <TabsTrigger key={p.id} value={p.id}>
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <OverviewPanel month={month} refreshKey={refreshKey} />
        </TabsContent>
        {PLATFORMS.map((p) => (
          <TabsContent key={p.id} value={p.id}>
            <PlatformPanel platform={p.id} month={month} onSynced={() => setRefreshKey((k) => k + 1)} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
