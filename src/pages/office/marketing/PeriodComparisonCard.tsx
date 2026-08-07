import { useEffect, useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { usePersistedState } from '@/hooks/usePersistedState'
import {
  computeMarketingSummary,
  filterAdSpend,
  filterDeals,
  monthKeyNow,
  monthKeyRange,
  monthKeyToDateRange,
  shiftMonthKey,
  COMPARISON_METRIC_LABELS,
  type ComparisonMetric,
  type MarketingFilters,
  type MarketingSummary,
} from '@/lib/marketingDataAccess'
import { colorForIndex } from '@/lib/marketingColors'
import { formatCurrency } from '@/lib/formulas'
import { MultiSelectFilter } from '@/components/MultiSelectFilter'
import type { AdSpendEntry, MarketingDeal } from '@/types'

const METRIC_OPTIONS: ComparisonMetric[] = ['leads', 'quotes', 'jobsWon', 'quoteValue', 'jobsWonValue']
const DURATIONS = [1, 3, 6] as const
type Duration = (typeof DURATIONS)[number]

function formatMonthKeyLabel(key: string): string {
  return new Date(`${key}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

function metricValue(summary: MarketingSummary, metric: ComparisonMetric): number {
  switch (metric) {
    case 'leads':
      return summary.totalLeads
    case 'quotes':
      return summary.totalQuotes
    case 'jobsWon':
      return summary.jobsWon
    case 'quoteValue':
      return summary.totalQuoteValue
    case 'jobsWonValue':
      return summary.jobsWonValue
  }
}

/** Calendar-style period comparison — pick a duration (1/3/6 months) and step the whole window
 * backward/forward like ResourceCalendar's month navigation, rather than typing custom date
 * ranges. Always monthly granularity; the duration just controls how many consecutive months
 * are compared at once. Has its own referral-source filter, independent of the page-level one. */
export function PeriodComparisonCard({
  baseFilters,
  deals,
  adSpend,
  allSources,
}: {
  baseFilters: MarketingFilters
  deals: MarketingDeal[]
  adSpend: AdSpendEntry[]
  allSources: string[]
}) {
  const [duration, setDuration] = usePersistedState<Duration>('qpaint:marketing:periodDuration', 3)
  const [anchorMonth, setAnchorMonth] = usePersistedState('qpaint:marketing:periodAnchor', monthKeyNow())
  const [metric, setMetric] = usePersistedState<ComparisonMetric>('qpaint:marketing:periodMetric', 'leads')
  const [referralSources, setReferralSources] = usePersistedState<string[]>('qpaint:marketing:periodReferralSources', [])

  // First-load default: if the anchor is still sitting on today's month but the deal data doesn't
  // reach that far (e.g. a historical import that stops years ago), jump back to the most recent
  // month that actually has deals — otherwise the chart opens on an all-zero window and the user
  // has to click "back" dozens of times to find any data.
  useEffect(() => {
    if (deals.length === 0) return
    const latestDealMonth = deals.reduce((max, d) => {
      const month = d.createdDate.slice(0, 7)
      return month > max ? month : max
    }, '0000-00')
    if (anchorMonth === monthKeyNow() && latestDealMonth < anchorMonth) {
      setAnchorMonth(latestDealMonth)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals.length])

  const monthKeys = useMemo(() => monthKeyRange(anchorMonth, duration), [anchorMonth, duration])

  const rows = useMemo(
    () =>
      monthKeys.map((key, index) => {
        const { from, to } = monthKeyToDateRange(key)
        const periodFilters: MarketingFilters = {
          dateFrom: from,
          dateTo: to,
          referralSources: referralSources.length > 0 ? referralSources : undefined,
          stages: baseFilters.stages,
          statuses: baseFilters.statuses,
        }
        const periodDeals = filterDeals(deals, periodFilters)
        const periodAdSpend = filterAdSpend(adSpend, periodFilters)
        return { key, label: formatMonthKeyLabel(key), index, summary: computeMarketingSummary(periodDeals, periodAdSpend) }
      }),
    [monthKeys, referralSources, baseFilters.stages, baseFilters.statuses, deals, adSpend],
  )

  const isCurrency = metric === 'quoteValue' || metric === 'jobsWonValue'

  const chartData = rows.map((r) => ({
    label: r.label,
    value: metricValue(r.summary, metric),
    fill: colorForIndex(r.index),
  }))

  return (
    <Card className="gap-3 p-4 break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Period Comparison</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            {DURATIONS.map((d) => (
              <Button key={d} size="sm" variant={duration === d ? 'secondary' : 'ghost'} onClick={() => setDuration(d)}>
                {d} {d === 1 ? 'Month' : 'Months'}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => setAnchorMonth((m) => shiftMonthKey(m, -1))}
              aria-label="Shift back a month"
              title="Shift back a month"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => setAnchorMonth((m) => shiftMonthKey(m, 1))}
              aria-label="Shift forward a month"
              title="Shift forward a month"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <MultiSelectFilter label="Source" options={allSources} selected={referralSources} onChange={setReferralSources} />
          <Select value={metric} onValueChange={(v) => v && setMetric(v as ComparisonMetric)}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue>{(v: unknown) => COMPARISON_METRIC_LABELS[v as ComparisonMetric]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {METRIC_OPTIONS.map((m) => (
                <SelectItem key={m} value={m}>{COMPARISON_METRIC_LABELS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {rows[0]?.label} – {rows[rows.length - 1]?.label}
        {referralSources.length > 0 && ` · Source: ${referralSources.join(', ')}`}
      </p>

      <ChartContainer config={{}} className="h-56 w-full">
        <BarChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (isCurrency ? formatCurrency(Number(v)) : String(v))} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => (isCurrency ? formatCurrency(Number(value)) : String(value))} />} />
          <Bar dataKey="value" radius={4} isAnimationActive={false}>
            {chartData.map((entry) => (
              <Cell key={entry.label} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {rows.map((r) => (
          <PeriodMiniCard key={r.key} label={r.label} color={colorForIndex(r.index)} summary={r.summary} />
        ))}
      </div>
    </Card>
  )
}

function PeriodMiniCard({ label, color, summary }: { label: string; color: string; summary: MarketingSummary }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: `${color}33`, backgroundColor: `${color}0d` }}>
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <h4 className="truncate text-xs font-semibold" style={{ color }}>{label}</h4>
      </div>
      <div className="space-y-1 px-3 pb-3 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">Leads</span><span className="font-medium">{summary.totalLeads}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Quotes</span><span className="font-medium">{summary.totalQuotes}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Won</span><span className="font-medium">{summary.jobsWon}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Won Value</span><span className="font-medium">{formatCurrency(summary.jobsWonValue)}</span></div>
      </div>
    </div>
  )
}
