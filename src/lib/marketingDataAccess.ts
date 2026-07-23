// Marketing module — pure calculation functions, mirroring the formulas style already
// established in formulas.ts. Kept separate since these operate on MarketingDeal/AdSpendEntry
// rather than the Job/Phase/Contractor domain.

import type { AdSpendEntry, MarketingDeal } from '@/types'

export interface MarketingFilters {
  dateFrom?: string // ISO date, inclusive, compared against deal.createdDate
  dateTo?: string // ISO date, inclusive
  referralSource?: string // omit or 'all' for every source
  salesperson?: string // omit or 'all' for every salesperson
  stage?: string // omit or 'all' for every raw stage
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
    if (filters.referralSource && filters.referralSource !== 'all' && d.referralSource !== filters.referralSource) return false
    if (filters.salesperson && filters.salesperson !== 'all' && d.salesperson !== filters.salesperson) return false
    if (filters.stage && filters.stage !== 'all' && d.rawStage !== filters.stage) return false
    return true
  })
}

export function filterAdSpend(adSpend: AdSpendEntry[], filters: MarketingFilters): AdSpendEntry[] {
  return adSpend.filter((a) => {
    if (filters.dateFrom && a.month < filters.dateFrom) return false
    if (filters.dateTo && a.month > filters.dateTo) return false
    if (filters.referralSource && filters.referralSource !== 'all' && a.referralSource !== filters.referralSource) return false
    return true
  })
}

export function totalAdSpend(adSpend: AdSpendEntry[]): number {
  return adSpend.reduce((sum, a) => sum + a.amount, 0)
}

export function computeMarketingSummary(deals: MarketingDeal[], adSpend: AdSpendEntry[]): MarketingSummary {
  const totalLeads = deals.length
  const quoted = deals.filter((d) => d.isQuoted)
  const won = deals.filter((d) => d.isWon)
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

export function uniqueSalespeople(deals: MarketingDeal[]): string[] {
  return Array.from(new Set(deals.map((d) => d.salesperson).filter((s): s is string => !!s))).sort()
}

export function uniqueStages(deals: MarketingDeal[]): string[] {
  return Array.from(new Set(deals.map((d) => d.rawStage).filter((s): s is string => !!s))).sort()
}
