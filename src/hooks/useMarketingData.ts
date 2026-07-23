import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { adSpendEntryToRow, mapAdSpendEntry, mapMarketingDeal, marketingDealToRow } from '@/lib/marketingMappers'
import type { AdSpendEntry, MarketingDeal } from '@/types'

/** Own fetch/CRUD hook rather than folding into the app-wide DataContext — marketing_deals grows
 * with every CSV import (potentially thousands of rows over time) and is only ever read by the
 * Marketing/Owner roles, so there's no reason to load it for every office user on every page. */
export function useMarketingData() {
  const [adSpend, setAdSpend] = useState<AdSpendEntry[]>([])
  const [deals, setDeals] = useState<MarketingDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [adSpendRes, dealsRes] = await Promise.all([
      supabase.from('ad_spend').select('*').order('month', { ascending: true }),
      supabase.from('marketing_deals').select('*').order('created_date', { ascending: true }),
    ])
    const firstError = [adSpendRes, dealsRes].find((r) => r.error)?.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }
    setAdSpend((adSpendRes.data ?? []).map(mapAdSpendEntry))
    setDeals((dealsRes.data ?? []).map(mapMarketingDeal))
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function addAdSpend(entry: Omit<AdSpendEntry, 'id'>) {
    const { data, error: err } = await supabase
      .from('ad_spend')
      .upsert(adSpendEntryToRow(entry), { onConflict: 'month,referral_source' })
      .select()
      .single()
    if (err) throw new Error(err.message)
    const saved = mapAdSpendEntry(data)
    setAdSpend((prev) => [...prev.filter((a) => !(a.month === saved.month && a.referralSource === saved.referralSource)), saved])
    return saved
  }

  async function updateAdSpend(id: string, amount: number) {
    const { error: err } = await supabase.from('ad_spend').update({ amount, updated_at: new Date().toISOString() }).eq('id', id)
    if (err) throw new Error(err.message)
    setAdSpend((prev) => prev.map((a) => (a.id === id ? { ...a, amount } : a)))
  }

  async function deleteAdSpend(id: string) {
    const { error: err } = await supabase.from('ad_spend').delete().eq('id', id)
    if (err) throw new Error(err.message)
    setAdSpend((prev) => prev.filter((a) => a.id !== id))
  }

  /** Bulk insert from a CSV/Excel import. Rows sharing an externalId with an existing deal are
   * upserted (updated in place) rather than duplicated — lets the same export be re-imported
   * safely as a pipeline progresses (e.g. a lead that's since been quoted or won). */
  async function importDeals(rows: Omit<MarketingDeal, 'id' | 'importedAt'>[]) {
    if (rows.length === 0) return { imported: 0 }
    const { data, error: err } = await supabase
      .from('marketing_deals')
      .upsert(
        rows.map((r) => marketingDealToRow(r)),
        { onConflict: 'external_id', ignoreDuplicates: false },
      )
      .select()
    if (err) throw new Error(err.message)
    const saved = (data ?? []).map(mapMarketingDeal)
    setDeals((prev) => {
      const savedIds = new Set(saved.map((s) => s.id))
      return [...prev.filter((d) => !savedIds.has(d.id)), ...saved]
    })
    return { imported: saved.length }
  }

  async function deleteImportBatch(importBatchId: string) {
    const { error: err } = await supabase.from('marketing_deals').delete().eq('import_batch_id', importBatchId)
    if (err) throw new Error(err.message)
    setDeals((prev) => prev.filter((d) => d.importBatchId !== importBatchId))
  }

  return { adSpend, deals, loading, error, refetch, addAdSpend, updateAdSpend, deleteAdSpend, importDeals, deleteImportBatch }
}
