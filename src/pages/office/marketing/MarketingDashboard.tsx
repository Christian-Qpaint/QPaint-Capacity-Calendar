import { useEffect, useMemo } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, XAxis, YAxis } from 'recharts'
import {
  BarChart3,
  CheckCircle2,
  DollarSign,
  FileText,
  Info,
  LineChart as LineChartIcon,
  Percent,
  Printer,
  Target,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GatedButton } from '@/components/GatedButton'
import { usePersistedState } from '@/hooks/usePersistedState'
import { useMarketingData } from '@/context/MarketingDataContext'
import {
  bucketLabel,
  bucketRangeKeys,
  buildReferralSourceTimeSeries,
  computeMarketingSummary,
  dealsDateSpan,
  filterAdSpend,
  filterDeals,
  groupByReferralSource,
  pickGranularity,
  topReferralSourcesByLeads,
  totalAdSpend,
  trendMetricFormat,
  uniqueReferralSources,
  uniqueStages,
  TREND_METRIC_GROUPS,
  TREND_METRIC_LABELS,
  type MarketingFilters,
  type ReferralSourceRow,
  type TimeGranularity,
  type TrendMetric,
} from '@/lib/marketingDataAccess'
import { colorForReferralSource, gradientId, KPI_COLORS } from '@/lib/marketingColors'
import { formatCurrency, formatPercent } from '@/lib/formulas'
import { cn } from '@/lib/utils'
import { AdSpendDialog } from './AdSpendDialog'
import { MultiSelectFilter } from '@/components/MultiSelectFilter'
import { PeriodComparisonCard } from './PeriodComparisonCard'

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  hint,
  info,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  hint?: string
  info: string
}) {
  return (
    <Card className="relative gap-2 overflow-hidden p-4 pt-5 break-inside-avoid transition hover:shadow-md">
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />
      <div className="flex items-center gap-2">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          <Icon className="size-4" />
        </span>
        <p className="flex-1 text-xs text-muted-foreground">{label}</p>
        <Tooltip>
          <TooltipTrigger className="text-muted-foreground/60 hover:text-muted-foreground print:hidden" aria-label={`About ${label}`}>
            <Info className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{info}</TooltipContent>
        </Tooltip>
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

function SourceChip({
  source,
  color,
  active,
  onToggle,
}: {
  source: string
  color: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition',
        active ? 'border-transparent' : 'border-border bg-transparent text-muted-foreground hover:bg-muted',
      )}
      style={active ? { backgroundColor: `${color}22`, color } : undefined}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {source}
    </button>
  )
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-background/70 px-2 py-1.5 text-center">
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  )
}

/** Google Calendar-style colorful event chip, applied to a referral source's stats — a soft
 * color wash card (same hue as everywhere else this source appears: chips, trends chart lines,
 * breakdown table dot) instead of a dense data-table row. */
function ReferralSourceCard({
  row,
  color,
}: {
  row: ReturnType<typeof groupByReferralSource>[number]
  color: string
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border transition hover:shadow-md"
      style={{ borderColor: `${color}33`, backgroundColor: `${color}0d` }}
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-1">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <h4 className="truncate text-sm font-semibold" style={{ color }}>{row.referralSource}</h4>
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 py-2">
        <StatPill label="Leads" value={row.leads} />
        <StatPill label="Quotes" value={row.quotes} />
        <StatPill label="Won" value={row.jobsWon} />
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 py-2">
        <StatPill label="Won Value" value={formatCurrency(row.jobsWonValue)} />
        <StatPill label="Ad Spend" value={formatCurrency(row.adSpend)} />
        <StatPill label="CPL" value={formatCurrency(row.cpl)} />
        <StatPill label="CPQ" value={formatCurrency(row.cpq)} />
      </div>
      <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: `${color}1a` }}>
        <span className="text-xs text-muted-foreground">ROAS</span>
        <span className={cn('text-sm font-bold', row.roas >= 1 ? 'text-success' : 'text-warning')}>{formatRoas(row.roas)}</span>
      </div>
    </div>
  )
}

function formatRoas(value: number): string {
  return `${value.toFixed(1)}x`
}

const STATUS_OPTIONS = ['Open', 'Won', 'Lost']
const STATUS_LABEL_TO_VALUE: Record<string, 'open' | 'won' | 'lost'> = { Open: 'open', Won: 'won', Lost: 'lost' }

// 'auto' picks day/month/year from the active date span (see pickGranularity) — the user can pin
// one explicitly, e.g. to compare full years even while zoomed into a shorter filter window.
type GranularityChoice = 'auto' | TimeGranularity
const GRANULARITY_LABELS: Record<GranularityChoice, string> = { auto: 'Auto', day: 'Day', month: 'Month', year: 'Year' }

type BreakdownMetric = 'leads' | 'quotes' | 'jobsWon' | 'jobsWonValue' | 'adSpend' | 'roas'
const BREAKDOWN_METRIC_LABELS: Record<BreakdownMetric, string> = {
  leads: 'Leads',
  quotes: 'Quotes',
  jobsWon: 'Jobs Won',
  jobsWonValue: 'Jobs Won Value',
  adSpend: 'Ad Spend',
  roas: 'ROAS',
}
const BREAKDOWN_METRIC_OPTIONS: BreakdownMetric[] = ['jobsWonValue', 'leads', 'quotes', 'jobsWon', 'adSpend', 'roas']

function breakdownMetricValue(row: ReferralSourceRow, metric: BreakdownMetric): number {
  return metric === 'roas' ? Number(row.roas.toFixed(2)) : row[metric]
}

function formatBreakdownMetric(value: number, metric: BreakdownMetric): string {
  if (metric === 'roas') return formatRoas(value)
  if (metric === 'jobsWonValue' || metric === 'adSpend') return formatCurrency(value)
  return value.toLocaleString()
}

// ROAS is deliberately excluded here (unlike BreakdownMetric above) — it's a per-source ratio, not
// an additive quantity, so it can't honestly be shown as a "share of the whole" pie slice.
type ShareMetric = Exclude<BreakdownMetric, 'roas'>
const SHARE_METRIC_OPTIONS: ShareMetric[] = ['adSpend', 'jobsWonValue', 'leads', 'quotes', 'jobsWon']

const SHARE_OTHER_COLOR = 'var(--muted-foreground)'

/** Top 7 sources by the chosen metric, any remainder folded into a single "Other sources" slice —
 * a real account can have 15+ referral sources, and a pie with that many slices is unreadable
 * (see the series-count ladder: past ~8 slices, fold the tail rather than seat another color). */
function buildShareSlices(rows: ReferralSourceRow[], metric: ShareMetric): { referralSource: string; value: number }[] {
  const sorted = rows
    .map((row) => ({ referralSource: row.referralSource, value: breakdownMetricValue(row, metric) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, 7)
  const restTotal = sorted.slice(7).reduce((sum, r) => sum + r.value, 0)
  return restTotal > 0 ? [...top, { referralSource: 'Other sources', value: restTotal }] : top
}

function formatTrendValue(value: number, metric: TrendMetric): string {
  switch (trendMetricFormat(metric)) {
    case 'roas':
      return formatRoas(value)
    case 'currency':
      return formatCurrency(value)
    case 'percent':
      return formatPercent(value)
    case 'count':
      return value.toLocaleString()
  }
}

/** Shimmering placeholder matching this page's eventual shape (header, filter bar, KPI cards,
 * chart) — shown while useMarketingData's own fetch (separate from the app-wide data bootstrap)
 * is in flight, replacing what used to be a plain "Loading marketing data…" line. */
function MarketingDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-36" />
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  )
}

export function MarketingDashboard() {
  const { adSpend, deals, loading, error, addAdSpend, deleteAdSpend } = useMarketingData()

  const [dateFrom, setDateFrom] = usePersistedState('qpaint:marketing:dateFrom', '')
  const [dateTo, setDateTo] = usePersistedState('qpaint:marketing:dateTo', '')
  const [referralSources, setReferralSources] = usePersistedState<string[]>('qpaint:marketing:referralSources', [])
  const [stages, setStages] = usePersistedState<string[]>('qpaint:marketing:stages', [])
  const [statusLabels, setStatusLabels] = usePersistedState<string[]>('qpaint:marketing:statuses', [])
  const [compareSources, setCompareSources] = usePersistedState<string[]>('qpaint:marketing:compareSources', [])
  const [compareMetric, setCompareMetric] = usePersistedState<TrendMetric>('qpaint:marketing:trendMetric', 'totalLeads')
  const [trendGranularity, setTrendGranularity] = usePersistedState<GranularityChoice>('qpaint:marketing:trendGranularity', 'auto')
  const [breakdownMetric, setBreakdownMetric] = usePersistedState<BreakdownMetric>('qpaint:marketing:breakdownMetric', 'jobsWonValue')
  const [shareMetric, setShareMetric] = usePersistedState<ShareMetric>('qpaint:marketing:shareMetric', 'adSpend')

  const statuses = useMemo(() => statusLabels.map((s) => STATUS_LABEL_TO_VALUE[s]).filter(Boolean), [statusLabels])

  const filters: MarketingFilters = useMemo(
    () => ({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, referralSources, stages, statuses }),
    [dateFrom, dateTo, referralSources, stages, statuses],
  )

  const filteredDeals = useMemo(() => filterDeals(deals, filters), [deals, filters])
  const filteredAdSpend = useMemo(() => filterAdSpend(adSpend, filters), [adSpend, filters])

  const summary = useMemo(() => computeMarketingSummary(filteredDeals, totalAdSpend(filteredAdSpend)), [filteredDeals, filteredAdSpend])
  const bySource = useMemo(() => groupByReferralSource(filteredDeals, filteredAdSpend), [filteredDeals, filteredAdSpend])

  const allSources = useMemo(() => uniqueReferralSources(deals, adSpend), [deals, adSpend])
  const allStages = useMemo(() => uniqueStages(deals), [deals])

  // First-load default: compare the top 5 sources by lead volume, rather than opening on an empty
  // chart or every source at once — the user can add/remove any source from here.
  useEffect(() => {
    if (compareSources.length === 0 && deals.length > 0) {
      setCompareSources(topReferralSourcesByLeads(deals, Math.min(5, allSources.length)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals.length])

  function toggleCompareSource(source: string) {
    setCompareSources((prev) => (prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]))
  }

  // Granularity auto-picks day/month/year from the active span so a 2-week filter isn't crushed
  // into one month-wide bucket and a multi-year range doesn't render 60+ illegible month ticks —
  // and the bucket range always covers the FULL span (zero-filled), not just months with deals in
  // them, so the chart never silently truncates to whatever a hardcoded window used to allow.
  const trendSpan = useMemo(() => {
    if (dateFrom && dateTo) return { from: dateFrom, to: dateTo }
    return dealsDateSpan(filteredDeals)
  }, [dateFrom, dateTo, filteredDeals])
  const autoTrendGranularity = trendSpan ? pickGranularity(trendSpan.from, trendSpan.to) : 'month'
  const effectiveGranularity: TimeGranularity = trendGranularity === 'auto' ? autoTrendGranularity : trendGranularity
  const trendRangeKeys = useMemo(
    () => (trendSpan ? bucketRangeKeys(trendSpan.from, trendSpan.to, effectiveGranularity) : []),
    [trendSpan, effectiveGranularity],
  )
  const trendSeries = useMemo(
    () => buildReferralSourceTimeSeries(filteredDeals, filteredAdSpend, compareSources, compareMetric, effectiveGranularity, trendRangeKeys),
    [filteredDeals, filteredAdSpend, compareSources, compareMetric, effectiveGranularity, trendRangeKeys],
  )
  const trendChartConfig: ChartConfig = useMemo(
    () => Object.fromEntries(compareSources.map((s) => [s, { label: s, color: colorForReferralSource(s, allSources) }])),
    [compareSources, allSources],
  )

  const breakdownRows = useMemo(
    () =>
      [...bySource]
        .map((row) => ({ ...row, value: breakdownMetricValue(row, breakdownMetric) }))
        .sort((a, b) => b.value - a.value),
    [bySource, breakdownMetric],
  )

  const shareSlices = useMemo(() => buildShareSlices(bySource, shareMetric), [bySource, shareMetric])
  const shareTotal = useMemo(() => shareSlices.reduce((sum, s) => sum + s.value, 0), [shareSlices])

  const hasActiveFilters = !!dateFrom || !!dateTo || referralSources.length > 0 || stages.length > 0 || statusLabels.length > 0

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setReferralSources([])
    setStages([])
    setStatusLabels([])
  }

  function describeActiveFilters(): string {
    const parts: string[] = []
    if (dateFrom || dateTo) parts.push(`${dateFrom || 'earliest'} → ${dateTo || 'latest'}`)
    if (referralSources.length > 0) parts.push(`Source: ${referralSources.join(', ')}`)
    if (stages.length > 0) parts.push(`Stage: ${stages.join(', ')}`)
    if (statusLabels.length > 0) parts.push(`Status: ${statusLabels.join(', ')}`)
    return parts.length > 0 ? parts.join(' · ') : 'All deals, no filters applied'
  }

  if (loading) {
    return <MarketingDashboardSkeleton />
  }
  if (error) {
    return <div className="p-6 text-sm text-danger">Couldn't load marketing data: {error}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-lg font-medium">Marketing</h1>
          <p className="text-sm text-muted-foreground">Lead-to-job performance and ad spend efficiency by referral source.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <GatedButton permissionKey="marketing.export" label="Print / Export" icon={Printer}>
            {() => (
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="size-4" /> Print / Export
              </Button>
            )}
          </GatedButton>
          <GatedButton permissionKey="marketing.manage_ad_spend" label="Ad Spend" icon={DollarSign}>
            {() => <AdSpendDialog adSpend={adSpend} knownReferralSources={allSources} onSave={addAdSpend} onDelete={deleteAdSpend} />}
          </GatedButton>
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">QPaint Marketing Report</h1>
        <p className="text-sm text-muted-foreground">
          Generated {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })} · {describeActiveFilters()}
        </p>
      </div>

      {deals.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FileText className="size-6" />
          </span>
          <div className="space-y-1">
            <p className="font-medium">No deals yet</p>
            <p className="text-sm text-muted-foreground">
              Marketing reads live from the Deals CRM's Sales and Jobs pipelines — once deals start flowing in
              from Pipedrive (or are added manually there), Lead/Quote/Won performance will show up here automatically.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <Card className="gap-3 p-4 print:hidden">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input type="date" className="w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input type="date" className="w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Referral Source</Label>
                <MultiSelectFilter label="Source" options={allSources} selected={referralSources} onChange={setReferralSources} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Stage</Label>
                <MultiSelectFilter label="Stage" options={allStages} selected={stages} onChange={setStages} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <MultiSelectFilter label="Status" options={STATUS_OPTIONS} selected={statusLabels} onChange={setStatusLabels} />
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="size-4" /> Clear
                </Button>
              )}
            </div>
          </Card>

          <section className="space-y-3 break-inside-avoid">
            <h2 className="text-sm font-medium text-muted-foreground">Performance Summary</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              <KpiCard
                label="Total Leads"
                value={summary.totalLeads.toLocaleString()}
                icon={Users}
                color={KPI_COLORS.leads}
                info="Every Sales Pipeline deal in the current filter, regardless of status or stage — the top of the funnel. Jobs Pipeline records aren't counted here since they're already-won production, not fresh leads."
              />
              <KpiCard
                label="Total Quotes"
                value={summary.totalQuotes.toLocaleString()}
                icon={FileText}
                color={KPI_COLORS.quotes}
                info="Sales Pipeline deals marked as Quoted, from either a Quote Sent date or a Quoted stage classification during import."
              />
              <KpiCard
                label="Total Quote Value"
                value={formatCurrency(summary.totalQuoteValue)}
                icon={DollarSign}
                color={KPI_COLORS.quoteValue}
                info="Sum of deal value across every Quoted Sales Pipeline deal."
              />
              <KpiCard
                label="Jobs Won"
                value={summary.jobsWon.toLocaleString()}
                icon={CheckCircle2}
                color={KPI_COLORS.jobsWon}
                info="Every job on the Jobs Pipeline board — the real production record, whether it was promoted from a tracked Sales lead or created directly in Jobs Pipeline."
              />
              <KpiCard
                label="Jobs Won Value"
                value={formatCurrency(summary.jobsWonValue)}
                icon={DollarSign}
                color={KPI_COLORS.jobsWonValue}
                info="Sum of total value across every job on the Jobs Pipeline board."
              />
              <KpiCard
                label="Lead → Quote Conversion"
                value={formatPercent(summary.leadToQuoteConversion)}
                icon={Percent}
                color={KPI_COLORS.conversion}
                info="Total Quotes ÷ Total Leads — the share of leads that got as far as a quote."
              />
              <KpiCard
                label="Quote → Job Conversion"
                value={formatPercent(summary.quoteToJobConversion)}
                icon={Percent}
                color={KPI_COLORS.conversion}
                info="Jobs Won ÷ Total Quotes — the share of quotes that turned into a won job."
              />
            </div>
          </section>

          <section className="space-y-3 break-inside-avoid">
            <h2 className="text-sm font-medium text-muted-foreground">Marketing Analysis</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <KpiCard
                label="Cost Per Lead"
                value={formatCurrency(summary.cpl)}
                icon={Target}
                color={KPI_COLORS.cost}
                info="Total Ad Spend ÷ Total Leads — what one lead costs, on average."
              />
              <KpiCard
                label="Cost Per Quote"
                value={formatCurrency(summary.cpq)}
                icon={Target}
                color={KPI_COLORS.cost}
                info="Total Ad Spend ÷ Total Quotes — what one quote costs, on average."
              />
              <KpiCard
                label="Cost Per Job"
                value={formatCurrency(summary.cpj)}
                icon={Target}
                color={KPI_COLORS.cost}
                info="Total Ad Spend ÷ Jobs Won — what one won job costs in ad spend, on average."
              />
              <KpiCard
                label="Sum Cost"
                value={formatCurrency(summary.totalAdSpend)}
                icon={DollarSign}
                color={KPI_COLORS.cost}
                info="Total Ad Spend across every source for this filter."
              />
              <KpiCard
                label="Avg Quote Value"
                value={formatCurrency(summary.avgQuoteValue)}
                icon={FileText}
                color={KPI_COLORS.avgValue}
                info="Total Quote Value ÷ Total Quotes."
              />
              <KpiCard
                label="Avg Sale Value"
                value={formatCurrency(summary.avgSaleValue)}
                icon={DollarSign}
                color={KPI_COLORS.avgValue}
                info="Jobs Won Value ÷ Jobs Won."
              />
              <KpiCard
                label="ROAS"
                value={formatRoas(summary.roas)}
                icon={TrendingUp}
                color={summary.roas >= 1 ? KPI_COLORS.roasGood : KPI_COLORS.roasBad}
                hint="Jobs Won Value ÷ Ad Spend"
                info="Return on ad spend — Jobs Won Value ÷ Total Ad Spend. Above 1.0x means the ad spend paid for itself in won work."
              />
            </div>
          </section>

          <PeriodComparisonCard baseFilters={filters} deals={deals} adSpend={adSpend} allSources={allSources} />

          <Card className="gap-3 p-4 break-inside-avoid">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <LineChartIcon className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Referral Source Comparison</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <Select value={trendGranularity} onValueChange={(v) => v && setTrendGranularity(v as GranularityChoice)}>
                  <SelectTrigger size="sm" className="w-28">
                    <SelectValue>{(v: unknown) => GRANULARITY_LABELS[v as GranularityChoice]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(['auto', 'day', 'month', 'year'] as const).map((g) => (
                      <SelectItem key={g} value={g}>{GRANULARITY_LABELS[g]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={compareMetric} onValueChange={(v) => v && setCompareMetric(v as TrendMetric)}>
                  <SelectTrigger size="sm" className="w-44">
                    {/* Explicit label function — SelectValue's default item-label lookup only
                        populates after the popup has opened once, so it briefly shows the raw
                        value (e.g. "jobsWonValue") instead of "Jobs Won Value" on first render. */}
                    <SelectValue>{(v: unknown) => TREND_METRIC_LABELS[v as TrendMetric]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TREND_METRIC_GROUPS.map((group) => (
                      <SelectGroup key={group.label}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.metrics.map((m) => (
                          <SelectItem key={m} value={m}>{TREND_METRIC_LABELS[m]}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Comparing <span className="font-medium text-foreground">{TREND_METRIC_LABELS[compareMetric]}</span> across sources ·{' '}
              {describeActiveFilters()} · Bucketed by {effectiveGranularity}
              {trendGranularity === 'auto' && ' (auto)'}
            </p>

            <div className="flex flex-wrap gap-1.5 print:hidden">
              {allSources.map((source) => (
                <SourceChip
                  key={source}
                  source={source}
                  color={colorForReferralSource(source, allSources)}
                  active={compareSources.includes(source)}
                  onToggle={() => toggleCompareSource(source)}
                />
              ))}
            </div>
            <p className="hidden text-xs text-muted-foreground print:block">
              Comparing {TREND_METRIC_LABELS[compareMetric]} for: {compareSources.join(', ') || 'none selected'}
            </p>

            {compareSources.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Select one or more referral sources above to compare them over time.
              </p>
            ) : trendSeries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No deals in this filter.</p>
            ) : (
              <ChartContainer config={trendChartConfig} className="h-72 w-full">
                <AreaChart data={trendSeries}>
                  <defs>
                    {compareSources.map((source) => {
                      const color = colorForReferralSource(source, allSources)
                      return (
                        <linearGradient key={source} id={gradientId('trend', source)} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={color} stopOpacity={0.32} />
                          <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                        </linearGradient>
                      )
                    })}
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="key"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={24}
                    interval="preserveStartEnd"
                    tickFormatter={(k) => bucketLabel(String(k), effectiveGranularity)}
                  />
                  <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatTrendValue(Number(v), compareMetric)} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(label) => bucketLabel(String(label), effectiveGranularity)}
                        formatter={(value, name) => [formatTrendValue(Number(value), compareMetric), String(name)]}
                      />
                    }
                  />
                  {compareSources.map((source) => (
                    <Area
                      key={source}
                      type="monotone"
                      dataKey={source}
                      stroke={colorForReferralSource(source, allSources)}
                      strokeWidth={2}
                      fill={`url(#${gradientId('trend', source)})`}
                      fillOpacity={1}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ChartContainer>
            )}
          </Card>

          <Card className="gap-3 p-4 break-inside-avoid">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <DollarSign className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Referral Source Share</h3>
              </div>
              <Select value={shareMetric} onValueChange={(v) => v && setShareMetric(v as ShareMetric)}>
                <SelectTrigger size="sm" className="w-40 print:hidden">
                  <SelectValue>{(v: unknown) => BREAKDOWN_METRIC_LABELS[v as ShareMetric]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SHARE_METRIC_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>{BREAKDOWN_METRIC_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">{describeActiveFilters()} · Share of {BREAKDOWN_METRIC_LABELS[shareMetric]}</p>
            {shareSlices.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No data for this filter.</p>
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                <ChartContainer config={{}} className="mx-auto aspect-square h-64 max-h-64 w-64 shrink-0">
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => [
                            `${formatBreakdownMetric(Number(value), shareMetric)} (${((Number(value) / shareTotal) * 100).toFixed(0)}%)`,
                            String(name),
                          ]}
                        />
                      }
                    />
                    <Pie
                      data={shareSlices}
                      dataKey="value"
                      nameKey="referralSource"
                      innerRadius={56}
                      outerRadius={100}
                      paddingAngle={2}
                      stroke="var(--card)"
                      strokeWidth={2}
                      isAnimationActive={false}
                      label={({ percent }) => (percent >= 0.08 ? `${(percent * 100).toFixed(0)}%` : '')}
                      labelLine={false}
                    >
                      {shareSlices.map((slice) => (
                        <Cell
                          key={slice.referralSource}
                          fill={slice.referralSource === 'Other sources' ? SHARE_OTHER_COLOR : colorForReferralSource(slice.referralSource, allSources)}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {shareSlices.map((slice) => (
                    <div key={slice.referralSource} className="flex items-center gap-2 text-xs">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: slice.referralSource === 'Other sources' ? SHARE_OTHER_COLOR : colorForReferralSource(slice.referralSource, allSources) }}
                      />
                      <span className="flex-1 truncate text-muted-foreground">{slice.referralSource}</span>
                      <span className="font-medium">{formatBreakdownMetric(slice.value, shareMetric)}</span>
                      <span className="w-9 text-right text-muted-foreground">{((slice.value / shareTotal) * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="gap-3 p-4 break-inside-avoid">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Referral Source Performance</h3>
              </div>
              <Select value={breakdownMetric} onValueChange={(v) => v && setBreakdownMetric(v as BreakdownMetric)}>
                <SelectTrigger size="sm" className="w-40 print:hidden">
                  <SelectValue>{(v: unknown) => BREAKDOWN_METRIC_LABELS[v as BreakdownMetric]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {BREAKDOWN_METRIC_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>{BREAKDOWN_METRIC_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">{describeActiveFilters()} · Ranked by {BREAKDOWN_METRIC_LABELS[breakdownMetric]}</p>
            {breakdownRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No data for this filter.</p>
            ) : (
              <ChartContainer config={{}} className="w-full" style={{ height: Math.max(160, breakdownRows.length * 36) }}>
                <BarChart data={breakdownRows} layout="vertical" margin={{ right: 56 }}>
                  <defs>
                    {breakdownRows.map((row) => {
                      const color = colorForReferralSource(row.referralSource, allSources)
                      return (
                        <linearGradient key={row.referralSource} id={gradientId('breakdown', row.referralSource)} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={color} stopOpacity={0.55} />
                          <stop offset="100%" stopColor={color} stopOpacity={1} />
                        </linearGradient>
                      )
                    })}
                  </defs>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="referralSource" width={120} tickLine={false} axisLine={false} />
                  <ChartTooltip
                    cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                    content={<ChartTooltipContent formatter={(value) => formatBreakdownMetric(Number(value), breakdownMetric)} />}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
                    {breakdownRows.map((row) => (
                      <Cell key={row.referralSource} fill={`url(#${gradientId('breakdown', row.referralSource)})`} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      className="fill-foreground text-xs"
                      formatter={(v: number) => formatBreakdownMetric(v, breakdownMetric)}
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </Card>

          <Card className="gap-3 p-4 break-inside-avoid">
            <h3 className="text-sm font-medium">Referral Source Breakdown</h3>
            <p className="text-xs text-muted-foreground">{describeActiveFilters()}</p>
            {bySource.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No data for this filter.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {bySource.map((row) => (
                  <ReferralSourceCard key={row.referralSource} row={row} color={colorForReferralSource(row.referralSource, allSources)} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
