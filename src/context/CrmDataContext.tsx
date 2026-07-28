import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/lib/apiClient'
import type { FilterCondition, MatchMode } from '@/lib/crmDealFilters'
import type { CrmPipeline, CrmStage, CrmFieldDefinition, CrmDeal } from '@/types'

/** Own context rather than folding into the app-wide DataContext (same reasoning as
 * useMarketingData/`/api/marketing-data`) — crm_deals holds every stage of every pipeline
 * (much larger, mostly page-irrelevant to Scheduler/Production/Field users) vs. jobs' curated
 * won-only set. A context (not a bare hook) because the whole /deals page tree — board, kanban,
 * deal drawer, Fields/Stages config — needs to share the same fetched data and cache.
 *
 * There's deliberately no shared `deals` array here — a real pipeline can hold 11k+ rows, so
 * CrmBoard owns its own paginated/lazy-loaded state (per Kanban column, or one flat page for the
 * table) and calls `queryDeals` directly whenever it needs a page. `loadDealDetail` fetches one
 * full record (including `fields`, omitted from list rows — see types/index.ts's CrmDeal.fields
 * comment) on demand when a card/row is actually opened. */
export interface CrmDealsQuery {
  pipelineId: string
  stageId?: string
  search?: string
  sortKey?: string | null
  sortDir?: 'asc' | 'desc'
  conditions?: FilterCondition[]
  matchMode?: MatchMode
  limit?: number
  offset?: number
}
export interface CrmStageSummary {
  stageId: string
  count: number
  totalValue: number | null
}
export interface CrmDealsQueryResult {
  deals: CrmDeal[]
  total: number
  stageSummary: CrmStageSummary[]
}

interface CrmDataContextValue {
  pipelines: CrmPipeline[]
  stages: CrmStage[]
  fieldDefinitions: CrmFieldDefinition[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  queryDeals: (query: CrmDealsQuery) => Promise<CrmDealsQueryResult>
  loadDealDetail: (id: string) => Promise<CrmDeal>

  addDeal: (payload: { pipelineId: string; stageId: string; title: string; value: number; currency?: string; orgName?: string; personName?: string }) => Promise<CrmDeal>
  updateDeal: (id: string, patch: Partial<Pick<CrmDeal, 'title' | 'value' | 'currency' | 'orgName' | 'personName'>> & { fields?: Record<string, unknown> }) => Promise<CrmDeal>
  moveDealStage: (id: string, stageId: string) => Promise<{ promoted: boolean; promotionSkippedReason?: string; deal: CrmDeal }>
  markDealWon: (id: string) => Promise<CrmDeal & { promoted: boolean; promotionSkippedReason?: string }>
  markDealLost: (id: string, lostReason?: string) => Promise<CrmDeal>
  deleteDeal: (id: string) => Promise<void>

  addPipeline: (payload: { name: string; order?: number }) => Promise<CrmPipeline>
  updatePipeline: (id: string, patch: { name: string; order: number }) => Promise<void>
  deletePipeline: (id: string) => Promise<void>

  addStage: (payload: { pipelineId: string; name: string; order?: number; isWonStage?: boolean; color?: string | null }) => Promise<CrmStage>
  updateStage: (id: string, patch: { pipelineId: string; name: string; order: number; isWonStage: boolean; color?: string | null }) => Promise<void>
  deleteStage: (id: string) => Promise<void>

  addFieldDefinition: (payload: { label: string; fieldType: CrmFieldDefinition['fieldType']; options?: { id: string; label: string }[] | null; order?: number }) => Promise<CrmFieldDefinition>
  updateFieldDefinition: (id: string, patch: { label: string; fieldType: CrmFieldDefinition['fieldType']; options?: { id: string; label: string }[] | null; order: number }) => Promise<void>
  deleteFieldDefinition: (id: string) => Promise<void>
}

const CrmDataContext = createContext<CrmDataContextValue | null>(null)

export function CrmDataProvider({ children }: { children: ReactNode }) {
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([])
  const [stages, setStages] = useState<CrmStage[]>([])
  const [fieldDefinitions, setFieldDefinitions] = useState<CrmFieldDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ pipelines: CrmPipeline[]; stages: CrmStage[]; fieldDefinitions: CrmFieldDefinition[] }>('/api/crm-data')
      setPipelines(data.pipelines)
      setStages(data.stages)
      setFieldDefinitions(data.fieldDefinitions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CRM data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const queryDeals = useCallback(async (query: CrmDealsQuery): Promise<CrmDealsQueryResult> => {
    const params = new URLSearchParams()
    params.set('pipelineId', query.pipelineId)
    if (query.stageId) params.set('stageId', query.stageId)
    if (query.search) params.set('search', query.search)
    if (query.sortKey) {
      params.set('sortKey', query.sortKey)
      params.set('sortDir', query.sortDir ?? 'asc')
    }
    if (query.conditions?.length) {
      params.set('conditions', JSON.stringify(query.conditions))
      params.set('matchMode', query.matchMode ?? 'AND')
    }
    params.set('limit', String(query.limit ?? 50))
    params.set('offset', String(query.offset ?? 0))
    return api.get<CrmDealsQueryResult>(`/api/crm-data?${params.toString()}`)
  }, [])

  async function loadDealDetail(id: string) {
    return api.get<CrmDeal>(`/api/crm-deals?id=${id}`)
  }

  async function addDeal(payload: { pipelineId: string; stageId: string; title: string; value: number; currency?: string; orgName?: string; personName?: string }) {
    return api.post<CrmDeal>('/api/crm-deals', payload)
  }

  async function updateDeal(id: string, patch: Partial<Pick<CrmDeal, 'title' | 'value' | 'currency' | 'orgName' | 'personName'>> & { fields?: Record<string, unknown> }) {
    return api.patch<CrmDeal>(`/api/crm-deals?id=${id}`, patch)
  }

  async function moveDealStage(id: string, stageId: string) {
    const updated = await api.patch<CrmDeal & { promoted: boolean; promotionSkippedReason?: string }>(`/api/crm-deals?id=${id}&action=stage`, { stageId })
    return { promoted: updated.promoted, promotionSkippedReason: updated.promotionSkippedReason, deal: updated }
  }

  async function markDealWon(id: string) {
    return api.patch<CrmDeal & { promoted: boolean; promotionSkippedReason?: string }>(`/api/crm-deals?id=${id}&action=mark-won`, {})
  }

  async function markDealLost(id: string, lostReason?: string) {
    return api.patch<CrmDeal>(`/api/crm-deals?id=${id}&action=mark-lost`, { lostReason })
  }

  async function deleteDeal(id: string) {
    await api.delete(`/api/crm-deals?id=${id}`)
  }

  async function addPipeline(payload: { name: string; order?: number }) {
    const saved = await api.post<CrmPipeline>('/api/crm-pipelines', payload)
    setPipelines((prev) => [...prev, saved])
    return saved
  }

  async function updatePipeline(id: string, patch: { name: string; order: number }) {
    const updated = await api.patch<CrmPipeline>(`/api/crm-pipelines?id=${id}`, patch)
    setPipelines((prev) => prev.map((p) => (p.id === id ? updated : p)))
  }

  async function deletePipeline(id: string) {
    await api.delete(`/api/crm-pipelines?id=${id}`)
    setPipelines((prev) => prev.filter((p) => p.id !== id))
  }

  async function addStage(payload: { pipelineId: string; name: string; order?: number; isWonStage?: boolean; color?: string | null }) {
    const saved = await api.post<CrmStage>('/api/crm-stages', payload)
    setStages((prev) => [...prev, saved])
    return saved
  }

  async function updateStage(id: string, patch: { pipelineId: string; name: string; order: number; isWonStage: boolean; color?: string | null }) {
    const updated = await api.patch<CrmStage>(`/api/crm-stages?id=${id}`, patch)
    setStages((prev) => prev.map((s) => (s.id === id ? updated : s)))
  }

  async function deleteStage(id: string) {
    await api.delete(`/api/crm-stages?id=${id}`)
    setStages((prev) => prev.filter((s) => s.id !== id))
  }

  async function addFieldDefinition(payload: { label: string; fieldType: CrmFieldDefinition['fieldType']; options?: { id: string; label: string }[] | null; order?: number }) {
    const saved = await api.post<CrmFieldDefinition>('/api/crm-field-definitions', payload)
    setFieldDefinitions((prev) => [...prev, saved])
    return saved
  }

  async function updateFieldDefinition(id: string, patch: { label: string; fieldType: CrmFieldDefinition['fieldType']; options?: { id: string; label: string }[] | null; order: number }) {
    const updated = await api.patch<CrmFieldDefinition>(`/api/crm-field-definitions?id=${id}`, patch)
    setFieldDefinitions((prev) => prev.map((f) => (f.id === id ? updated : f)))
  }

  async function deleteFieldDefinition(id: string) {
    await api.delete(`/api/crm-field-definitions?id=${id}`)
    setFieldDefinitions((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <CrmDataContext.Provider
      value={{
        pipelines,
        stages,
        fieldDefinitions,
        loading,
        error,
        refetch,
        queryDeals,
        loadDealDetail,
        addDeal,
        updateDeal,
        moveDealStage,
        markDealWon,
        markDealLost,
        deleteDeal,
        addPipeline,
        updatePipeline,
        deletePipeline,
        addStage,
        updateStage,
        deleteStage,
        addFieldDefinition,
        updateFieldDefinition,
        deleteFieldDefinition,
      }}
    >
      {children}
    </CrmDataContext.Provider>
  )
}

export function useCrmData() {
  const ctx = useContext(CrmDataContext)
  if (!ctx) throw new Error('useCrmData must be used within a CrmDataProvider')
  return ctx
}
