// Marketing module — pure calculation functions, mirroring the formulas style already
// established in formulas.ts. Kept separate since these operate on MarketingDeal/AdSpendEntry
// rather than the Job/Phase/Contractor domain.

import type { AdSpendEntry, MarketingDeal } from '@/types'

export interface MarketingFilters {
  dateFrom?: string // ISO date, inclusive, compared against deal.createdDate
  dateTo?: string // ISO date, inclusive
  referralSources?: string[] // empty/omitted = every source
  stages?: string[] // empty/omitted = every raw stage
  statuses?: ('open' | 'won' | 'lost')[] // empty/omitted = every status
}

export interface MarketingSummary {
  totalLeads: number
  totalQuotes: number
  totalQuoteValue: number
  jobsWon: number
  jobsWonValue: number
  leadToQuoteConversion: number // %, 0 when totalLeads is 0
  quoteToJobConversion: number // %, 0 when totalQuotes is 0
  totalAdSpend: number
  cpl: number // cost per lead
  cpq: number // cost per quote
  cpj: number // cost per job won
  avgQuoteValue: number
  avgSaleValue: number
  roas: number // return on ad spend
}

export interface ReferralSourceRow {
  referralSource: string
  leads: number
  quotes: number
  quoteValue: number
  jobsWon: number
  jobsWonValue: number
  adSpend: number
  cpl: number
  cpq: number
  cpj: number
  roas: number
}

export interface MonthlyAdSpendRow {
  month: string // ISO date, 1st of month
  total: number
}

function safeDiv(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

export function filterDeals(deals: MarketingDeal[], filters: MarketingFilters): MarketingDeal[] {
  return deals.filter((d) => {
    if (filters.dateFrom && d.createdDate < filters.dateFrom) return false
    if (filters.dateTo && d.createdDate > filters.dateTo) return false
    if (filters.referralSources?.length && !filters.referralSources.includes(d.referralSource)) return false
    if (filters.stages?.length && !(d.rawStage && filters.stages.includes(d.rawStage))) return false
    if (filters.statuses?.length && !filters.statuses.includes(d.status)) return false
    return true
  })
}

export function filterAdSpend(adSpend: AdSpendEntry[], filters: MarketingFilters): AdSpendEntry[] {
  return adSpend.filter((a) => {
    if (filters.dateFrom && a.month < filters.dateFrom) return false
    if (filters.dateTo && a.month > filters.dateTo) return false
    if (filters.referralSources?.length && !filters.referralSources.includes(a.referralSource)) return false
    return true
  })
}

export function totalAdSpend(adSpend: AdSpendEntry[]): number {
  return adSpend.reduce((sum, a) => sum + a.amount, 0)
}

// Leads/Quotes are Sales-Pipeline-only (a Jobs Pipeline record is already-won production, not a
// fresh lead); Jobs Won/Value are Jobs-Pipeline-only (the real production record, not just a Sales
// deal's own status flag). Without this split, a Sales deal promoted to a Job was counted twice —
// once via its own crm_deals row (source: 'sales', isWon true), again via the job it produced
// (source: 'jobsPipeline') — see MarketingDeal.source's comment and marketing-data.mts's header.
export function computeMarketingSummary(deals: MarketingDeal[], adSpend: AdSpendEntry[]): MarketingSummary {
  const salesDeals = deals.filter((d) => d.source === 'sales')
  const jobsPipelineDeals = deals.filter((d) => d.source === 'jobsPipeline')
  const totalLeads = salesDeals.length
  const quoted = salesDeals.filter((d) => d.isQuoted)
  const won = jobsPipelineDeals
  const totalQuotes = quoted.length
  const totalQuoteValue = quoted.reduce((sum, d) => sum + d.value, 0)
  const jobsWon = won.length
  const jobsWonValue = won.reduce((sum, d) => sum + d.value, 0)
  const spend = totalAdSpend(adSpend)

  return {
    totalLeads,
    totalQuotes,
    totalQuoteValue,
    jobsWon,
    jobsWonValue,
    leadToQuoteConversion: safeDiv(totalQuotes, totalLeads) * 100,
    quoteToJobConversion: safeDiv(jobsWon, totalQuotes) * 100,
    totalAdSpend: spend,
    cpl: safeDiv(spend, totalLeads),
    cpq: safeDiv(spend, totalQuotes),
    cpj: safeDiv(spend, jobsWon),
    avgQuoteValue: safeDiv(totalQuoteValue, totalQuotes),
    avgSaleValue: safeDiv(jobsWonValue, jobsWon),
    roas: safeDiv(jobsWonValue, spend),
  }
}

export function groupByReferralSource(deals: MarketingDeal[], adSpend: AdSpendEntry[]): ReferralSourceRow[] {
  const sources = new Set<string>([...deals.map((d) => d.referralSource), ...adSpend.map((a) => a.referralSource)])

  return Array.from(sources)
    .map((referralSource) => {
      const sourceDeals = deals.filter((d) => d.referralSource === referralSource)
      const sourceSpend = adSpend.filter((a) => a.referralSource === referralSource)
      const summary = computeMarketingSummary(sourceDeals, sourceSpend)
      return {
        referralSource,
        leads: summary.totalLeads,
        quotes: summary.totalQuotes,
        quoteValue: summary.totalQuoteValue,
        jobsWon: summary.jobsWon,
        jobsWonValue: summary.jobsWonValue,
        adSpend: summary.totalAdSpend,
        cpl: summary.cpl,
        cpq: summary.cpq,
        cpj: summary.cpj,
        roas: summary.roas,
      }
    })
    .sort((a, b) => b.jobsWonValue - a.jobsWonValue)
}

export function groupAdSpendByMonth(adSpend: AdSpendEntry[]): MonthlyAdSpendRow[] {
  const byMonth = new Map<string, number>()
  for (const a of adSpend) {
    byMonth.set(a.month, (byMonth.get(a.month) ?? 0) + a.amount)
  }
  return Array.from(byMonth.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

export function uniqueReferralSources(deals: MarketingDeal[], adSpend: AdSpendEntry[]): string[] {
  return Array.from(new Set([...deals.map((d) => d.referralSource), ...adSpend.map((a) => a.referralSource)])).sort()
}

/** Which referral sources bring in the most leads — used to pick a sane default selection for the
 * trends comparison chart (rather than showing nothing, or every source at once, on first load).
 * Sales-Pipeline-only, matching the "Leads" metric elsewhere (a Jobs Pipeline record isn't a lead). */
export function topReferralSourcesByLeads(deals: MarketingDeal[], limit: number): string[] {
  const counts = new Map<string, number>()
  for (const d of deals) {
    if (d.source !== 'sales') continue
    counts.set(d.referralSource, (counts.get(d.referralSource) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([source]) => source)
}

export type ComparisonMetric = 'leads' | 'quotes' | 'jobsWon' | 'quoteValue' | 'jobsWonValue'

export const COMPARISON_METRIC_LABELS: Record<ComparisonMetric, string> = {
  leads: 'Leads',
  quotes: 'Quotes',
  jobsWon: 'Jobs Won',
  quoteValue: 'Quote Value',
  jobsWonValue: 'Jobs Won Value',
}

// Same source split as computeMarketingSummary — leads/quotes from Sales Pipeline deals only,
// jobsWon/jobsWonValue from Jobs Pipeline records only.
function computeMetric(deals: MarketingDeal[], metric: ComparisonMetric): number {
  switch (metric) {
    case 'leads':
      return deals.filter((d) => d.source === 'sales').length
    case 'quotes':
      return deals.filter((d) => d.source === 'sales' && d.isQuoted).length
    case 'jobsWon':
      return deals.filter((d) => d.source === 'jobsPipeline').length
    case 'quoteValue':
      return deals.filter((d) => d.source === 'sales' && d.isQuoted).reduce((sum, d) => sum + d.value, 0)
    case 'jobsWonValue':
      return deals.filter((d) => d.source === 'jobsPipeline').reduce((sum, d) => sum + d.value, 0)
  }
}

/** One row per month, one column per referral source — shaped for a multi-line "trends" chart
 * (recharts wants a flat object per point, not nested series). Months are derived from the
 * filtered deals themselves so the chart's x-axis always matches whatever date range is active,
 * rather than a hardcoded lookback window. */
export function buildReferralSourceTimeSeries(
  deals: MarketingDeal[],
  sources: string[],
  metric: ComparisonMetric,
): Record<string, string | number>[] {
  if (deals.length === 0 || sources.length === 0) return []
  const months = Array.from(new Set(deals.map((d) => d.createdDate.slice(0, 7)))).sort()

  return months.map((month) => {
    const row: Record<string, string | number> = { month }
    for (const source of sources) {
      const monthSourceDeals = deals.filter((d) => d.createdDate.slice(0, 7) === month && d.referralSource === source)
      row[source] = computeMetric(monthSourceDeals, metric)
    }
    return row
  })
}

export function uniqueStages(deals: MarketingDeal[]): string[] {
  return Array.from(new Set(deals.map((d) => d.rawStage).filter((s): s is string => !!s))).sort()
}

/** Month-key ("YYYY-MM") helpers shared by the Period Comparison navigator and the Ad Spend
 * month-range entry — kept string-based (rather than Date) since that's how months are already
 * represented everywhere else in the marketing module (createdDate.slice(0, 7), ad_spend.month). */
export function monthKeyNow(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Returns `count` consecutive month keys ending at (and including) `endKey`, oldest first. */
export function monthKeyRange(endKey: string, count: number): string[] {
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) keys.push(shiftMonthKey(endKey, -i))
  return keys
}

/** All month keys from `fromKey` to `toKey` inclusive, ascending. Empty if `toKey` precedes `fromKey`. */
export function monthsBetweenKeys(fromKey: string, toKey: string): string[] {
  const [fy, fm] = fromKey.split('-').map(Number)
  const [ty, tm] = toKey.split('-').map(Number)
  const totalMonths = (ty - fy) * 12 + (tm - fm)
  if (totalMonths < 0) return []
  const keys: string[] = []
  for (let i = 0; i <= totalMonths; i++) keys.push(shiftMonthKey(fromKey, i))
  return keys
}

export function monthKeyToDateRange(key: string): { from: string; to: string } {
  const [y, m] = key.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { from: `${key}-01`, to: `${key}-${String(lastDay).padStart(2, '0')}` }
}

