import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/lib/apiClient'
import type { FilterCondition, MatchMode } from '@/lib/crmDealFilters'
import type { CrmPipeline, CrmStage, CrmFieldDefinition, CrmDeal, CrmSavedFilter } from '@/types'

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
  /** Mutually exclusive with `conditions` in practice (the board clears one when the other is set)
   * — applies a copied-in Pipedrive saved filter's condition tree instead of the ad-hoc builder's. */
  savedFilterId?: string
  /** Sales Pipeline deals already marked Won are hidden by default once promoted to a Job (see
   * crm-data.mts) — set true to bring them back into view without needing a filter for it. */
  includeWon?: boolean
  /** Same idea for Lost deals — hidden by default on the Sales Pipeline board. Both flags are
   * ignored server-side whenever the active saved/ad-hoc filter already constrains `status`
   * itself (e.g. picking Pipedrive's real "All lost deals" filter just works on its own). */
  includeLost?: boolean
  /** Stages configured with an auto-hide age (e.g. Jobs Pipeline's "All Done & Paid", 180 days)
   * drop their long-sitting deals from the default view too — set true to bring them back. */
  includeAged?: boolean
  /** Whether to compute stageSummary/stageAvgDwellDays on this call — both are pipeline-wide
   * aggregates (identical no matter which stageId this particular request is for), so the Kanban
   * board only needs to ask for them once per pipeline/filter change, not once per column. Defaults
   * to true when no stageId is set (Table view's one call still needs them for the summary card). */
  includeSummary?: boolean
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
  /** Average days a completed stint spends in each stage (keyed by stageId) — historical
   * throughput, not scoped by the current search/filter. Absent key = no completed stints yet. */
  stageAvgDwellDays: Record<string, number>
}

interface CrmDataContextValue {
  pipelines: CrmPipeline[]
  stages: CrmStage[]
  fieldDefinitions: CrmFieldDefinition[]
  savedFilters: CrmSavedFilter[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  queryDeals: (query: CrmDealsQuery) => Promise<CrmDealsQueryResult>
  /** `isJob` routes to /api/jobs instead of /api/crm-deals — Jobs Pipeline rows are `jobs` rows
   * shaped to look like a CrmDeal (see CrmDeal.isJob), not real crm_deals rows. */
  loadDealDetail: (id: string, isJob?: boolean) => Promise<CrmDeal>

  addDeal: (payload: { pipelineId: string; stageId: string; title: string; value: number; currency?: string; orgName?: string; personName?: string }) => Promise<CrmDeal>
  updateDeal: (id: string, patch: Partial<Pick<CrmDeal, 'title' | 'value' | 'currency' | 'orgName' | 'personName'>> & { fields?: Record<string, unknown> }, isJob?: boolean) => Promise<CrmDeal>
  moveDealStage: (id: string, stageId: string, isJob?: boolean) => Promise<{ promoted: boolean; promotionSkippedReason?: string; deal: CrmDeal }>
  markDealWon: (id: string) => Promise<CrmDeal & { promoted: boolean; promotionSkippedReason?: string }>
  markDealLost: (id: string, lostReason?: string) => Promise<CrmDeal>
  /** Manual retry for a Won deal stuck with no linked Job (Target Hours wasn't set when it would
   * normally have been promoted) — throws with the skip reason if it still can't be created. */
  createJobFromDeal: (id: string) => Promise<CrmDeal & { promoted: boolean; promotionSkippedReason?: string }>
  deleteDeal: (id: string) => Promise<void>
  /** Jobs are never deleted — archive/unarchive hides/restores them on the Pipeline board's
   * default view only; the Capacity Calendar always shows every job regardless. */
  archiveJob: (id: string) => Promise<CrmDeal>
  unarchiveJob: (id: string) => Promise<CrmDeal>

  addPipeline: (payload: { name: string; order?: number }) => Promise<CrmPipeline>
  updatePipeline: (id: string, patch: { name: string; order: number }) => Promise<void>
  deletePipeline: (id: string) => Promise<void>

  addStage: (payload: { pipelineId: string; name: string; order?: number; isWonStage?: boolean; color?: string | null }) => Promise<CrmStage>
  updateStage: (id: string, patch: { pipelineId: string; name: string; order: number; isWonStage: boolean; color?: string | null }) => Promise<void>
  deleteStage: (id: string) => Promise<void>

  addFieldDefinition: (payload: { label: string; fieldType: CrmFieldDefinition['fieldType']; options?: { id: string; label: string }[] | null; order?: number }) => Promise<CrmFieldDefinition>
  updateFieldDefinition: (id: string, patch: { label: string; fieldType: CrmFieldDefinition['fieldType']; options?: { id: string; label: string }[] | null; order: number }) => Promise<void>
  deleteFieldDefinition: (id: string) => Promise<void>

  /** Re-pulls every saved deal filter from Pipedrive and upserts crm_saved_filters — there's no
   * Pipedrive webhook for filter changes, so this is the only way edits made directly in Pipedrive
   * (Tas especially) ever reach the copy the Deals board runs against. Owner-only. */
}

const CrmDataContext = createContext<CrmDataContextValue | null>(null)

export function CrmDataProvider({ children }: { children: ReactNode }) {
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([])
  const [stages, setStages] = useState<CrmStage[]>([])
  const [fieldDefinitions, setFieldDefinitions] = useState<CrmFieldDefinition[]>([])
  const [savedFilters, setSavedFilters] = useState<CrmSavedFilter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ pipelines: CrmPipeline[]; stages: CrmStage[]; fieldDefinitions: CrmFieldDefinition[]; savedFilters: CrmSavedFilter[] }>('/api/crm-data')
      setPipelines(data.pipelines)
      setStages(data.stages)
      setFieldDefinitions(data.fieldDefinitions)
      setSavedFilters(data.savedFilters)
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
    if (query.savedFilterId) params.set('savedFilterId', query.savedFilterId)
    if (query.includeWon) params.set('includeWon', '1')
    if (query.includeLost) params.set('includeLost', '1')
    if (query.includeAged) params.set('includeAged', '1')
    if (query.includeSummary) params.set('includeSummary', '1')
    params.set('limit', String(query.limit ?? 50))
    params.set('offset', String(query.offset ?? 0))
    return api.get<CrmDealsQueryResult>(`/api/crm-data?${params.toString()}`)
  }, [])

  async function loadDealDetail(id: string, isJob?: boolean) {
    return api.get<CrmDeal>(isJob ? `/api/jobs?id=${id}` : `/api/crm-deals?id=${id}`)
  }

  async function addDeal(payload: { pipelineId: string; stageId: string; title: string; value: number; currency?: string; orgName?: string; personName?: string }) {
    return api.post<CrmDeal>('/api/crm-deals', payload)
  }

  async function updateDeal(
    id: string,
    patch: Partial<Pick<CrmDeal, 'title' | 'value' | 'currency' | 'orgName' | 'personName'>> & { fields?: Record<string, unknown> },
    isJob?: boolean,
  ) {
    return api.patch<CrmDeal>(isJob ? `/api/jobs?id=${id}&action=update-fields` : `/api/crm-deals?id=${id}`, patch)
  }

  async function moveDealStage(id: string, stageId: string, isJob?: boolean) {
    const updated = await api.patch<CrmDeal & { promoted?: boolean; promotionSkippedReason?: string }>(
      isJob ? `/api/jobs?id=${id}&action=stage` : `/api/crm-deals?id=${id}&action=stage`,
      { stageId },
    )
    return { promoted: updated.promoted ?? false, promotionSkippedReason: updated.promotionSkippedReason, deal: updated }
  }

  async function markDealWon(id: string) {
    return api.patch<CrmDeal & { promoted: boolean; promotionSkippedReason?: string }>(`/api/crm-deals?id=${id}&action=mark-won`, {})
  }

  async function markDealLost(id: string, lostReason?: string) {
    return api.patch<CrmDeal>(`/api/crm-deals?id=${id}&action=mark-lost`, { lostReason })
  }

  async function createJobFromDeal(id: string) {
    return api.patch<CrmDeal & { promoted: boolean; promotionSkippedReason?: string }>(`/api/crm-deals?id=${id}&action=create-job`, {})
  }

  async function deleteDeal(id: string) {
    await api.delete(`/api/crm-deals?id=${id}`)
  }

  async function archiveJob(id: string) {
    return api.patch<CrmDeal>(`/api/jobs?id=${id}&action=archive`, {})
  }

  async function unarchiveJob(id: string) {
    return api.patch<CrmDeal>(`/api/jobs?id=${id}&action=unarchive`, {})
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
        savedFilters,
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
        createJobFromDeal,
        deleteDeal,
        archiveJob,
        unarchiveJob,
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
