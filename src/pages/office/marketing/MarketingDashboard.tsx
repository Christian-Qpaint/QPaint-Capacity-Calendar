import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  BarChart3,
  CheckCircle2,
  DollarSign,
  FileText,
  Percent,
  Target,
  TrendingUp,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { usePersistedState } from '@/hooks/usePersistedState'
import { useMarketingData } from '@/hooks/useMarketingData'
import {
  computeMarketingSummary,
  filterAdSpend,
  filterDeals,
  groupAdSpendByMonth,
  groupByReferralSource,
  uniqueReferralSources,
  uniqueSalespeople,
  uniqueStages,
  type MarketingFilters,
} from '@/lib/marketingDataAccess'
import { formatCurrency, formatPercent } from '@/lib/formulas'
import { cn } from '@/lib/utils'
import { ImportDealsDialog } from './ImportDealsDialog'
import { AdSpendDialog } from './AdSpendDialog'

function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'muted',
  hint,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  tone?: 'muted' | 'info' | 'success' | 'warning'
  hint?: string
}) {
  const toneClass = {
    muted: 'bg-muted text-muted-foreground',
    info: 'bg-info-bg text-info',
    success: 'bg-success-bg text-success',
    warning: 'bg-warning-bg text-warning',
  }[tone]

  return (
    <Card className="gap-2 p-4 transition hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', toneClass)}>
          <Icon className="size-4" />
        </span>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

function formatMonthShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
}

function formatRoas(value: number): string {
  return `${value.toFixed(1)}x`
}

const SOURCE_CHART_CONFIG: ChartConfig = {
  leads: { label: 'Leads', color: 'var(--chart-1)' },
  quotes: { label: 'Quotes', color: 'var(--chart-3)' },
  jobsWon: { label: 'Jobs Won', color: 'var(--chart-5)' },
}

const SPEND_CHART_CONFIG: ChartConfig = {
  total: { label: 'Ad Spend', color: 'var(--chart-3)' },
}

export function MarketingDashboard() {
  const { adSpend, deals, loading, error, addAdSpend, deleteAdSpend, importDeals } = useMarketingData()

  const [dateFrom, setDateFrom] = usePersistedState('qpaint:marketing:dateFrom', '')
  const [dateTo, setDateTo] = usePersistedState('qpaint:marketing:dateTo', '')
  const [referralSource, setReferralSource] = usePersistedState('qpaint:marketing:referralSource', 'all')
  const [salesperson, setSalesperson] = usePersistedState('qpaint:marketing:salesperson', 'all')
  const [stage, setStage] = usePersistedState('qpaint:marketing:stage', 'all')

  const filters: MarketingFilters = useMemo(
    () => ({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, referralSource, salesperson, stage }),
    [dateFrom, dateTo, referralSource, salesperson, stage],
  )

  const filteredDeals = useMemo(() => filterDeals(deals, filters), [deals, filters])
  const filteredAdSpend = useMemo(() => filterAdSpend(adSpend, filters), [adSpend, filters])

  const summary = useMemo(() => computeMarketingSummary(filteredDeals, filteredAdSpend), [filteredDeals, filteredAdSpend])
  const bySource = useMemo(() => groupByReferralSource(filteredDeals, filteredAdSpend), [filteredDeals, filteredAdSpend])
  const monthlySpend = useMemo(() => groupAdSpendByMonth(filteredAdSpend), [filteredAdSpend])

  const allSources = useMemo(() => uniqueReferralSources(deals, adSpend), [deals, adSpend])
  const allSalespeople = useMemo(() => uniqueSalespeople(deals), [deals])
  const allStages = useMemo(() => uniqueStages(deals), [deals])

  const hasActiveFilters = !!dateFrom || !!dateTo || referralSource !== 'all' || salesperson !== 'all' || stage !== 'all'

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setReferralSource('all')
    setSalesperson('all')
    setStage('all')
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading marketing data…</div>
  }
  if (error) {
    return <div className="p-6 text-sm text-danger">Couldn't load marketing data: {error}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium">Marketing</h1>
          <p className="text-sm text-muted-foreground">Lead-to-job performance and ad spend efficiency by referral source.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdSpendDialog adSpend={adSpend} knownReferralSources={allSources} onSave={addAdSpend} onDelete={deleteAdSpend} />
          <ImportDealsDialog onImport={importDeals} />
        </div>
      </div>

      {deals.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Upload className="size-6" />
          </span>
          <div className="space-y-1">
            <p className="font-medium">No deals imported yet</p>
            <p className="text-sm text-muted-foreground">
              Import a CSV or Excel export from Pipedrive to see Lead/Quote/Won performance here.
            </p>
          </div>
          <ImportDealsDialog onImport={importDeals} />
        </Card>
      ) : (
        <>
          <Card className="gap-3 p-4">
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
                <Select value={referralSource} onValueChange={(v) => setReferralSource(v ?? 'all')}>
                  <SelectTrigger size="sm" className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    {allSources.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Salesperson</Label>
                <Select value={salesperson} onValueChange={(v) => setSalesperson(v ?? 'all')}>
                  <SelectTrigger size="sm" className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All salespeople</SelectItem>
                    {allSalespeople.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Stage</Label>
                <Select value={stage} onValueChange={(v) => setStage(v ?? 'all')}>
                  <SelectTrigger size="sm" className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stages</SelectItem>
                    {allStages.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="size-4" /> Clear
                </Button>
              )}
            </div>
          </Card>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Performance Summary</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              <KpiCard label="Total Leads" value={summary.totalLeads.toLocaleString()} icon={Users} tone="muted" />
              <KpiCard label="Total Quotes" value={summary.totalQuotes.toLocaleString()} icon={FileText} tone="info" />
              <KpiCard label="Total Quote Value" value={formatCurrency(summary.totalQuoteValue)} icon={DollarSign} tone="info" />
              <KpiCard label="Jobs Won" value={summary.jobsWon.toLocaleString()} icon={CheckCircle2} tone="success" />
              <KpiCard label="Jobs Won Value" value={formatCurrency(summary.jobsWonValue)} icon={DollarSign} tone="success" />
              <KpiCard label="Lead → Quote Conversion" value={formatPercent(summary.leadToQuoteConversion)} icon={Percent} tone="muted" />
              <KpiCard label="Quote → Job Conversion" value={formatPercent(summary.quoteToJobConversion)} icon={Percent} tone="muted" />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Marketing Analysis</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Cost Per Lead" value={formatCurrency(summary.cpl)} icon={Target} tone="muted" />
              <KpiCard label="Cost Per Quote" value={formatCurrency(summary.cpq)} icon={Target} tone="info" />
              <KpiCard label="Cost Per Job" value={formatCurrency(summary.cpj)} icon={Target} tone="success" />
              <KpiCard label="Avg Quote Value" value={formatCurrency(summary.avgQuoteValue)} icon={FileText} tone="muted" />
              <KpiCard label="Avg Sale Value" value={formatCurrency(summary.avgSaleValue)} icon={DollarSign} tone="success" />
              <KpiCard label="ROAS" value={formatRoas(summary.roas)} icon={TrendingUp} tone={summary.roas >= 1 ? 'success' : 'warning'} hint="Jobs Won Value ÷ Ad Spend" />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="gap-3 p-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Leads / Quotes / Jobs Won by Referral Source</h3>
              </div>
              {bySource.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No deals in this filter.</p>
              ) : (
                <ChartContainer config={SOURCE_CHART_CONFIG} className="h-64 w-full">
                  <BarChart data={bySource}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="referralSource" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="leads" fill="var(--color-leads)" radius={4} />
                    <Bar dataKey="quotes" fill="var(--color-quotes)" radius={4} />
                    <Bar dataKey="jobsWon" fill="var(--color-jobsWon)" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
            </Card>

            <Card className="gap-3 p-4">
              <div className="flex items-center gap-2">
                <DollarSign className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Monthly Ad Spend</h3>
              </div>
              {monthlySpend.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No ad spend recorded for this filter.</p>
              ) : (
                <ChartContainer config={SPEND_CHART_CONFIG} className="h-64 w-full">
                  <BarChart data={monthlySpend.map((r) => ({ month: formatMonthShort(r.month), total: r.total }))}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => formatCurrency(Number(v))} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                    <Bar dataKey="total" fill="var(--color-total)" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
            </Card>
          </div>

          <Card className="gap-3 p-4">
            <h3 className="text-sm font-medium">Referral Source Breakdown</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Quotes</TableHead>
                    <TableHead className="text-right">Jobs Won</TableHead>
                    <TableHead className="text-right">Jobs Won Value</TableHead>
                    <TableHead className="text-right">Ad Spend</TableHead>
                    <TableHead className="text-right">CPL</TableHead>
                    <TableHead className="text-right">CPQ</TableHead>
                    <TableHead className="text-right">CPJ</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bySource.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground">
                        No data for this filter.
                      </TableCell>
                    </TableRow>
                  )}
                  {bySource.map((row) => (
                    <TableRow key={row.referralSource}>
                      <TableCell className="font-medium">{row.referralSource}</TableCell>
                      <TableCell className="text-right">{row.leads}</TableCell>
                      <TableCell className="text-right">{row.quotes}</TableCell>
                      <TableCell className="text-right">{row.jobsWon}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.jobsWonValue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.adSpend)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.cpl)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.cpq)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.cpj)}</TableCell>
                      <TableCell className={cn('text-right font-medium', row.roas >= 1 ? 'text-success' : 'text-warning')}>
                        {formatRoas(row.roas)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
