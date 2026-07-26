import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { adSpendEntryToRow, mapAdSpendEntry, mapMarketingDeal } from '@/lib/marketingMappers'
import { useImportProgress } from '@/context/ImportProgressContext'
import type { AdSpendEntry, MarketingDeal } from '@/types'

// PostgREST caps any single request at this project's `db.max_rows` setting (1000, the default) —
// a `.range()` beyond that still comes back truncated to 1000 rather than erroring, so a table
// past that size silently loses its most-recent rows (marketing_deals sorts ascending) unless we
// page through it ourselves.
const PAGE_SIZE = 1000

async function fetchAllRows<T>(table: string, orderColumn: string) {
  const rows: T[] = []
  let offset = 0
  for (;;) {
    // `id` is a tiebreaker, not the primary sort — without it, rows sharing the same
    // orderColumn value (e.g. many deals with the same created_date) can be ordered differently
    // between each paginated request, causing rows to be skipped or double-counted across pages.
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderColumn, { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return { data: rows, error: null }
}

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
      fetchAllRows<Parameters<typeof mapAdSpendEntry>[0]>('ad_spend', 'month'),
      fetchAllRows<Parameters<typeof mapMarketingDeal>[0]>('marketing_deals', 'created_date'),
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

  // A background import (started here or from a previous mount of this page) writes straight to
  // Supabase without touching this hook's local `deals` state — pick up the fresh rows as soon as
  // it finishes, whether that's while the user is still on this page or after they've come back to it.
  const { job } = useImportProgress()
  const handledJobId = useRef<string | null>(null)
  useEffect(() => {
    if (job?.status === 'done' && job.id !== handledJobId.current) {
      handledJobId.current = job.id
      refetch()
    }
  }, [job, refetch])

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

  /** Bulk-remove one or more import batches at once — the Data Management view's "delete
   * selected" action, so cleaning up a handful of bad imports doesn't mean deleting them one by
   * one. */
  async function deleteImportBatches(importBatchIds: string[]) {
    if (importBatchIds.length === 0) return
    const { error: err } = await supabase.from('marketing_deals').delete().in('import_batch_id', importBatchIds)
    if (err) throw new Error(err.message)
    const idSet = new Set(importBatchIds)
    setDeals((prev) => prev.filter((d) => !idSet.has(d.importBatchId)))
  }

  /** Wipes every deal so the user can re-sync from Pipedrive with a clean slate — deliberately
   * does not touch ad_spend (that's manually entered, unrelated to any import). */
  async function clearAllDeals() {
    const { error: err } = await supabase.from('marketing_deals').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (err) throw new Error(err.message)
    setDeals([])
  }

  return { adSpend, deals, loading, error, refetch, addAdSpend, updateAdSpend, deleteAdSpend, deleteImportBatches, clearAllDeals }
}
