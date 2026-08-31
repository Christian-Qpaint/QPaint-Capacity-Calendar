import { useEffect, useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from 'recharts'
import {
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GatedButton } from '@/components/GatedButton'
import { usePersistedState } from '@/hooks/usePersistedState'
import { useMarketingData } from '@/hooks/useMarketingData'
import {
  buildReferralSourceTimeSeries,
  computeMarketingSummary,
  filterAdSpend,
  filterDeals,
  groupAdSpendByMonth,
  groupByReferralSource,
  topReferralSourcesByLeads,
  uniqueReferralSources,
  uniqueStages,
  COMPARISON_METRIC_LABELS,
  type ComparisonMetric,
  type MarketingFilters,
} from '@/lib/marketingDataAccess'
import { colorForIndex, colorForReferralSource, KPI_COLORS } from '@/lib/marketingColors'
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

function formatMonthShort(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
}

function formatRoas(value: number): string {
  return `${value.toFixed(1)}x`
}

const SPEND_CHART_CONFIG: ChartConfig = {
  total: { label: 'Ad Spend', color: 'var(--chart-3)' },
}

const METRIC_OPTIONS: ComparisonMetric[] = ['leads', 'quotes', 'jobsWon', 'quoteValue', 'jobsWonValue']
const STATUS_OPTIONS = ['Open', 'Won', 'Lost']
const STATUS_LABEL_TO_VALUE: Record<string, 'open' | 'won' | 'lost'> = { Open: 'open', Won: 'won', Lost: 'lost' }

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
  const [compareMetric, setCompareMetric] = usePersistedState<ComparisonMetric>('qpaint:marketing:compareMetric', 'leads')

  const statuses = useMemo(() => statusLabels.map((s) => STATUS_LABEL_TO_VALUE[s]).filter(Boolean), [statusLabels])

  const filters: MarketingFilters = useMemo(
    () => ({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, referralSources, stages, statuses }),
    [dateFrom, dateTo, referralSources, stages, statuses],
  )

  const filteredDeals = useMemo(() => filterDeals(deals, filters), [deals, filters])
  const filteredAdSpend = useMemo(() => filterAdSpend(adSpend, filters), [adSpend, filters])

  const summary = useMemo(() => computeMarketingSummary(filteredDeals, filteredAdSpend), [filteredDeals, filteredAdSpend])
  const bySource = useMemo(() => groupByReferralSource(filteredDeals, filteredAdSpend), [filteredDeals, filteredAdSpend])
  const monthlySpend = useMemo(() => groupAdSpendByMonth(filteredAdSpend), [filteredAdSpend])

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

  const trendSeries = useMemo(
    () => buildReferralSourceTimeSeries(filteredDeals, compareSources, compareMetric),
    [filteredDeals, compareSources, compareMetric],
  )

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
            <div className="flex items-center gap-2">
              <DollarSign className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Monthly Ad Spend</h3>
            </div>
            {monthlySpend.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No ad spend recorded for this filter.</p>
            ) : (
              <ChartContainer config={SPEND_CHART_CONFIG} className="h-64 w-full">
                <BarChart data={monthlySpend.map((r) => ({ month: r.month.slice(0, 7), total: r.total }))}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={formatMonthShort} />
                  <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => formatCurrency(Number(v))} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(label) => formatMonthShort(String(label))}
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                    }
                  />
                  <Bar dataKey="total" radius={4} isAnimationActive={false}>
                    {monthlySpend.map((r, i) => (
                      <Cell key={r.month} fill={colorForIndex(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </Card>

          <Card className="gap-3 p-4 break-inside-avoid">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <LineChartIcon className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Referral Source Trends</h3>
              </div>
              <Select value={compareMetric} onValueChange={(v) => v && setCompareMetric(v as ComparisonMetric)}>
                <SelectTrigger size="sm" className="w-40 print:hidden">
                  {/* Explicit label function — SelectValue's default item-label lookup only
                      populates after the popup has opened once, so it briefly shows the raw
                      value (e.g. "jobsWonValue") instead of "Jobs Won Value" on first render. */}
                  <SelectValue>{(v: unknown) => COMPARISON_METRIC_LABELS[v as ComparisonMetric]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {METRIC_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>{COMPARISON_METRIC_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
              Comparing {COMPARISON_METRIC_LABELS[compareMetric]} for: {compareSources.join(', ') || 'none selected'}
            </p>

            {compareSources.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Select one or more referral sources above to compare their trends over time.
              </p>
            ) : trendSeries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No deals in this filter.</p>
            ) : (
              <ChartContainer config={{}} className="h-72 w-full">
                <LineChart data={trendSeries}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={formatMonthShort} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(v) => (compareMetric === 'quoteValue' || compareMetric === 'jobsWonValue' ? formatCurrency(Number(v)) : String(v))}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(label) => formatMonthShort(String(label))}
                        formatter={(value, name) => [
                          compareMetric === 'quoteValue' || compareMetric === 'jobsWonValue' ? formatCurrency(Number(value)) : String(value),
                          String(name),
                        ]}
                      />
                    }
                  />
                  {compareSources.map((source) => (
                    <Line
                      key={source}
                      type="monotone"
                      dataKey={source}
                      stroke={colorForReferralSource(source, allSources)}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            )}
          </Card>

          <Card className="gap-3 p-4 break-inside-avoid">
            <h3 className="text-sm font-medium">Referral Source Breakdown</h3>
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
