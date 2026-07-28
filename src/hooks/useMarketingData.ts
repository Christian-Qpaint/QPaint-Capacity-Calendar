import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/apiClient'
import { useImportProgress } from '@/context/ImportProgressContext'
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
    try {
      const data = await api.get<{ adSpend: AdSpendEntry[]; deals: MarketingDeal[] }>('/api/marketing-data')
      setAdSpend(data.adSpend)
      setDeals(data.deals)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marketing data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  // A background import (started here or from a previous mount of this page) writes straight to
  // the API without touching this hook's local `deals` state — pick up the fresh rows as soon as
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
    const saved = await api.post<AdSpendEntry>('/api/ad-spend', entry)
    setAdSpend((prev) => [...prev.filter((a) => !(a.month === saved.month && a.referralSource === saved.referralSource)), saved])
    return saved
  }

  async function updateAdSpend(id: string, amount: number) {
    await api.patch(`/api/ad-spend?id=${id}`, { amount })
    setAdSpend((prev) => prev.map((a) => (a.id === id ? { ...a, amount } : a)))
  }

  async function deleteAdSpend(id: string) {
    await api.delete(`/api/ad-spend?id=${id}`)
    setAdSpend((prev) => prev.filter((a) => a.id !== id))
  }

  /** Bulk-remove one or more import batches at once — the Data Management view's "delete
   * selected" action, so cleaning up a handful of bad imports doesn't mean deleting them one by
   * one. */
  async function deleteImportBatches(importBatchIds: string[]) {
    if (importBatchIds.length === 0) return
    await api.delete(`/api/marketing-deals?importBatchIds=${importBatchIds.join(',')}`)
    const idSet = new Set(importBatchIds)
    setDeals((prev) => prev.filter((d) => !idSet.has(d.importBatchId)))
  }

  /** Wipes every deal so the user can re-sync from Pipedrive with a clean slate — deliberately
   * does not touch ad_spend (that's manually entered, unrelated to any import). */
  async function clearAllDeals() {
    await api.delete('/api/marketing-deals?all=true')
    setDeals([])
  }

  return { adSpend, deals, loading, error, refetch, addAdSpend, updateAdSpend, deleteAdSpend, deleteImportBatches, clearAllDeals }
}
