import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/apiClient'
import { useImportProgress } from '@/context/ImportProgressContext'
import type { AdSpendEntry, MarketingDeal } from '@/types'

/** Own fetch/CRUD hook rather than folding into the app-wide DataContext — `deals` (read live from
 * the Deals CRM's Sales Pipeline, see marketing-data.mts) is only ever needed by the
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

  // Refetch once a background job finishes — most relevantly the Deals board's "Sync from
  // Pipedrive" button (same ImportProgressContext), since that writes straight to crm_deals
  // without touching this hook's local `deals` state, and this IS that data now.
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

  return { adSpend, deals, loading, error, refetch, addAdSpend, updateAdSpend, deleteAdSpend }
}
