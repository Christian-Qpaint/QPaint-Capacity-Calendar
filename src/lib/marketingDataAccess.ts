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

/** One row per month, one column per referral source (plus `total`) — ad spend is only ever
 * recorded at month granularity (`AdSpendEntry.month`), so unlike the deal trend chart this stays
 * month-bucketed regardless of the active date range; it still zero-fills every month across
 * `rangeKeys` rather than only the months that have an entry, and splits by source (color =
 * identity) instead of the old single "total" bar colored by month index. */
export function groupAdSpendBySourceMonth(adSpend: AdSpendEntry[], sources: string[], rangeKeys: string[]): Record<string, string | number>[] {
  return rangeKeys.map((month) => {
    const row: Record<string, string | number> = { key: month, total: 0 }
    let total = 0
    for (const source of sources) {
      const amount = adSpend
        .filter((a) => a.month.slice(0, 7) === month && a.referralSource === source)
        .reduce((sum, a) => sum + a.amount, 0)
      row[source] = amount
      total += amount
    }
    row.total = total
    return row
  })
}

/** Month-key span covering every ad-spend entry — the fallback range for the spend chart when no
 * explicit date filter narrows it. */
export function adSpendMonthSpan(adSpend: AdSpendEntry[]): { from: string; to: string } | null {
  if (adSpend.length === 0) return null
  let from = adSpend[0].month
  let to = adSpend[0].month
  for (const a of adSpend) {
    if (a.month < from) from = a.month
    if (a.month > to) to = a.month
  }
  return { from, to }
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

// ---- Time bucketing (day / month / year) --------------------------------------------------
// The trend/spend charts used to always bucket by calendar month, sourced only from months that
// actually had data — a 2-week filter showed one crowded month-wide bucket, and a 5-year range
// showed 60 illegible month ticks. Bucketing now auto-picks a granularity from the active date
// span and enumerates every bucket across the FULL span (zero-filled), not just the ones with
// data, so a real gap in the timeline reads as a dip to zero rather than silently compressing out.

export type TimeGranularity = 'day' | 'month' | 'year'

/** Auto-pick a granularity from a date span: short ranges get daily resolution, medium ranges
 * get monthly, long ranges get yearly — chosen so a chart never renders more than ~90-100 ticks. */
export function pickGranularity(fromISO: string, toISO: string): TimeGranularity {
  const days = Math.max(0, Math.round((new Date(toISO).getTime() - new Date(fromISO).getTime()) / 86400000))
  if (days <= 90) return 'day'
  if (days <= 730) return 'month'
  return 'year'
}

export function bucketKeyForDate(dateISO: string, granularity: TimeGranularity): string {
  switch (granularity) {
    case 'day':
      return dateISO.slice(0, 10)
    case 'month':
      return dateISO.slice(0, 7)
    case 'year':
      return dateISO.slice(0, 4)
  }
}

export function bucketLabel(key: string, granularity: TimeGranularity): string {
  switch (granularity) {
    case 'day':
      return new Date(`${key}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    case 'month':
      return new Date(`${key}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
    case 'year':
      return key
  }
}

/** Every bucket key from `fromISO` to `toISO` inclusive, ascending — the zero-fill backbone for a
 * time-series chart's x-axis, independent of which buckets the data happens to touch. */
export function bucketRangeKeys(fromISO: string, toISO: string, granularity: TimeGranularity): string[] {
  const from = new Date(fromISO)
  const to = new Date(toISO)
  if (to < from) return []
  const keys: string[] = []
  if (granularity === 'day') {
    const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate())
    while (cur <= end) {
      keys.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
  } else if (granularity === 'month') {
    const cur = new Date(from.getFullYear(), from.getMonth(), 1)
    const end = new Date(to.getFullYear(), to.getMonth(), 1)
    while (cur <= end) {
      keys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
      cur.setMonth(cur.getMonth() + 1)
    }
  } else {
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) keys.push(String(y))
  }
  return keys
}

/** The earliest/latest `createdDate` across a deal set — the fallback span when no explicit
 * date-range filter is active, so the trend chart still covers exactly what's on screen. */
export function dealsDateSpan(deals: MarketingDeal[]): { from: string; to: string } | null {
  if (deals.length === 0) return null
  let from = deals[0].createdDate
  let to = deals[0].createdDate
  for (const d of deals) {
    if (d.createdDate < from) from = d.createdDate
    if (d.createdDate > to) to = d.createdDate
  }
  return { from, to }
}

/** One row per time bucket, one column per referral source — shaped for a multi-series chart
 * (recharts wants a flat object per point, not nested series). Buckets span the full `rangeKeys`
 * (zero-filled) rather than only the buckets that happen to contain deals. */
export function buildReferralSourceTimeSeries(
  deals: MarketingDeal[],
  sources: string[],
  metric: ComparisonMetric,
  granularity: TimeGranularity,
  rangeKeys: string[],
): Record<string, string | number>[] {
  if (sources.length === 0) return []

  return rangeKeys.map((key) => {
    const row: Record<string, string | number> = { key }
    for (const source of sources) {
      const bucketSourceDeals = deals.filter((d) => bucketKeyForDate(d.createdDate, granularity) === key && d.referralSource === source)
      row[source] = computeMetric(bucketSourceDeals, metric)
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

