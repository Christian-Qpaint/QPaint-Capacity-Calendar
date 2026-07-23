// snake_case DB rows <-> camelCase app entities for the Marketing module — kept separate from
// supabaseMappers.ts since this data set is fetched by its own hook (useMarketingData), not the
// app-wide DataContext (see that hook for why).

import type { AdSpendEntry, MarketingDeal } from '@/types'

export function mapAdSpendEntry(r: any): AdSpendEntry {
  return { id: r.id, month: r.month, referralSource: r.referral_source, amount: Number(r.amount) }
}
export function adSpendEntryToRow(e: Omit<AdSpendEntry, 'id'>) {
  return { month: e.month, referral_source: e.referralSource, amount: e.amount }
}

export function mapMarketingDeal(r: any): MarketingDeal {
  return {
    id: r.id,
    externalId: r.external_id,
    title: r.title,
    referralSource: r.referral_source,
    salesperson: r.salesperson,
    rawStage: r.raw_stage,
    isQuoted: r.is_quoted,
    isWon: r.is_won,
    value: Number(r.value),
    createdDate: r.created_date,
    eventDate: r.event_date,
    importBatchId: r.import_batch_id,
    importedAt: r.imported_at,
  }
}
export function marketingDealToRow(d: Omit<MarketingDeal, 'id' | 'importedAt'>) {
  return {
    external_id: d.externalId,
    title: d.title,
    referral_source: d.referralSource,
    salesperson: d.salesperson,
    raw_stage: d.rawStage,
    is_quoted: d.isQuoted,
    is_won: d.isWon,
    value: d.value,
    created_date: d.createdDate,
    event_date: d.eventDate,
    import_batch_id: d.importBatchId,
  }
}
