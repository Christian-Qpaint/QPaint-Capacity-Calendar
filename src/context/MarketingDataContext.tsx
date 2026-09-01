import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '@/lib/apiClient'
import { useImportProgress } from './ImportProgressContext'
import type { AdSpendEntry, MarketingDeal } from '@/types'

/** Own fetch/CRUD context rather than folding into the app-wide DataContext — `deals` (read live
 * from the Deals CRM's Sales Pipeline, see marketing-data.mts) is only ever needed by the
 * Marketing/Owner roles, so there's no reason to load it for every office user on every page.
 *
 * A Context (not a bare per-component hook, which this used to be) specifically so the data
 * survives navigating away from /marketing and back — mounted once per authenticated session (see
 * RouteGuards.tsx's RequireAuth), it used to live inside MarketingDashboard.tsx itself, refetching
 * from scratch on every single visit to that page. */
interface MarketingDataContextValue {
  adSpend: AdSpendEntry[]
  deals: MarketingDeal[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  addAdSpend: (entry: Omit<AdSpendEntry, 'id'>) => Promise<AdSpendEntry>
  updateAdSpend: (id: string, amount: number) => Promise<void>
  deleteAdSpend: (id: string) => Promise<void>
}

const MarketingDataContext = createContext<MarketingDataContextValue | null>(null)

export function MarketingDataProvider({ children }: { children: ReactNode }) {
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

  // Background refresh only — navigating to /marketing no longer triggers its own fetch now that
  // this is mounted once per session instead of per-visit; this is what keeps that long-lived
  // cache from going stale. Any explicit "Sync from Pipedrive" action (below) already refetches
  // the moment it finishes.
  useEffect(() => {
    const interval = setInterval(refetch, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [refetch])

  // Refetch once a background job finishes — most relevantly the Deals board's "Sync from
  // Pipedrive" button (same ImportProgressContext), since that writes straight to crm_deals
  // without touching this context's own `deals` state, and this IS that data now.
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

  return (
    <MarketingDataContext.Provider value={{ adSpend, deals, loading, error, refetch, addAdSpend, updateAdSpend, deleteAdSpend }}>
      {children}
    </MarketingDataContext.Provider>
  )
}

export function useMarketingData() {
  const ctx = useContext(MarketingDataContext)
  if (!ctx) throw new Error('useMarketingData must be used within a MarketingDataProvider')
  return ctx
}
