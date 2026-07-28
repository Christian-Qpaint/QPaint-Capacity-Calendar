import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '@/lib/apiClient'
import { useAuth } from './AuthContext'
import type {
  Client,
  Contractor,
  Credential,
  DailyHoursEntry,
  Job,
  MonthlySnapshot,
  MonthlyTarget,
  ScheduleBlock,
  Team,
  TeamMembership,
  WeeklyActual,
  Worker,
} from '@/types'

interface DataState {
  clients: Client[]
  contractors: Contractor[]
  credentials: Credential[]
  teams: Team[]
  workers: Worker[]
  teamMemberships: TeamMembership[]
  jobs: Job[]
  scheduleBlocks: ScheduleBlock[]
  dailyHoursEntries: DailyHoursEntry[]
  weeklyActuals: WeeklyActual[]
  monthlyTargets: MonthlyTarget[]
  monthlySnapshots: MonthlySnapshot[]
}

interface DataContextValue extends DataState {
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  addScheduleBlock: (block: Omit<ScheduleBlock, 'id'>) => Promise<ScheduleBlock>
  updateScheduleBlock: (id: string, patch: Partial<ScheduleBlock>) => Promise<void>
  deleteScheduleBlock: (id: string) => Promise<void>
  addDailyHoursEntry: (entry: Omit<DailyHoursEntry, 'id'>) => Promise<DailyHoursEntry>
  addTeam: (team: Omit<Team, 'id'>) => Promise<Team>
  updateTeam: (id: string, patch: Partial<Team>) => Promise<void>
  deleteTeam: (id: string) => Promise<void>
  addContractor: (contractor: Omit<Contractor, 'id'>) => Promise<Contractor>
  updateContractor: (id: string, patch: Partial<Contractor>) => Promise<void>
  deleteContractor: (id: string) => Promise<void>
  addClient: (client: Omit<Client, 'id'>) => Promise<Client>
  /** Manually add a job outside the Pipedrive sync — the server generates a synthetic
   * `MANUAL-<uuid>` pipedriveDealId (real deal ids are always numeric strings) so it satisfies the
   * same not-null/unique column the sync relies on without colliding with a real deal. */
  addJob: (job: Omit<Job, 'id' | 'pipedriveDealId' | 'actualHoursSource' | 'productionPercentSource'>) => Promise<Job>
  updateJob: (id: string, patch: Partial<Job>) => Promise<void>
  /** Deletes the job and, via ON DELETE CASCADE, every schedule block/hours entry logged against
   * it — the caller is responsible for warning the user about that before calling this. */
  deleteJob: (id: string) => Promise<void>
  addCredential: (credential: Omit<Credential, 'id'>) => Promise<Credential>
  updateCredential: (id: string, patch: Partial<Credential>) => Promise<void>
  deleteCredential: (id: string) => Promise<void>
  addWorker: (worker: Omit<Worker, 'id'>) => Promise<Worker>
  updateWorker: (id: string, patch: Partial<Worker>) => Promise<void>
  deleteWorker: (id: string) => Promise<void>
  addTeamMembership: (membership: Omit<TeamMembership, 'id'>) => Promise<TeamMembership>
  updateTeamMembership: (id: string, patch: Partial<TeamMembership>) => Promise<void>
  deleteTeamMembership: (id: string) => Promise<void>
  upsertMonthlyTarget: (year: number, month: number, targetDollars: number) => Promise<MonthlyTarget>
  takeMonthlySnapshot: (year: number, month: number, actualDollars: number) => Promise<MonthlySnapshot>
  /** Sets a manual Actual/Logged Hours override for a job, or pass `null` to resync (clear the
   * override so Actual Hours goes back to the computed sum of real logged hours). */
  updateJobActualHours: (jobId: string, override: number | null) => Promise<void>
  /** Sets a manual Production % override for a job, or pass `null` to resync (clear the override
   * so Production % goes back to the hours-weighted computed figure). */
  updateJobProduction: (jobId: string, override: number | null) => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

const EMPTY_STATE: DataState = {
  clients: [],
  contractors: [],
  credentials: [],
  teams: [],
  workers: [],
  teamMemberships: [],
  jobs: [],
  scheduleBlocks: [],
  dailyHoursEntries: [],
  weeklyActuals: [],
  monthlyTargets: [],
  monthlySnapshots: [],
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  // Keyed off the user id (not the Session object) — a new Session reference on every auth check
  // shouldn't re-run the fetch and flash the whole app to "Loading data…", wiping any open dialog/
  // in-progress form, when the user hasn't actually changed.
  const userId = session?.user.id
  const [state, setState] = useState<DataState>(EMPTY_STATE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!userId) {
      setState(EMPTY_STATE)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<DataState>('/api/data')
      setState(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const value = useMemo<DataContextValue>(
    () => ({
      ...state,
      loading,
      error,
      refetch: fetchAll,

      addScheduleBlock: async (block) => {
        const created = await api.post<ScheduleBlock>('/api/schedule-blocks', block)
        setState((prev) => ({ ...prev, scheduleBlocks: [...prev.scheduleBlocks, created] }))
        return created
      },
      updateScheduleBlock: async (id, patch) => {
        const current = state.scheduleBlocks.find((b) => b.id === id)
        if (!current) throw new Error('Schedule block not found')
        const merged = { ...current, ...patch }
        await api.patch(`/api/schedule-blocks?id=${id}`, merged)
        setState((prev) => ({ ...prev, scheduleBlocks: prev.scheduleBlocks.map((b) => (b.id === id ? merged : b)) }))
      },
      deleteScheduleBlock: async (id) => {
        await api.delete(`/api/schedule-blocks?id=${id}`)
        setState((prev) => ({ ...prev, scheduleBlocks: prev.scheduleBlocks.filter((b) => b.id !== id) }))
      },
      addDailyHoursEntry: async (entry) => {
        const created = await api.post<DailyHoursEntry>('/api/daily-hours-entries', entry)
        setState((prev) => ({ ...prev, dailyHoursEntries: [...prev.dailyHoursEntries, created] }))
        return created
      },

      addTeam: async (team) => {
        const created = await api.post<Team>('/api/teams', team)
        setState((prev) => ({ ...prev, teams: [...prev.teams, created] }))
        return created
      },
      updateTeam: async (id, patch) => {
        const current = state.teams.find((t) => t.id === id)
        if (!current) throw new Error('Team not found')
        const merged = { ...current, ...patch }
        await api.patch(`/api/teams?id=${id}`, merged)
        setState((prev) => ({ ...prev, teams: prev.teams.map((t) => (t.id === id ? merged : t)) }))
      },
      deleteTeam: async (id) => {
        await api.delete(`/api/teams?id=${id}`)
        setState((prev) => ({ ...prev, teams: prev.teams.filter((t) => t.id !== id) }))
      },

      addContractor: async (contractor) => {
        const created = await api.post<Contractor>('/api/contractors', contractor)
        setState((prev) => ({ ...prev, contractors: [...prev.contractors, created] }))
        return created
      },
      updateContractor: async (id, patch) => {
        const current = state.contractors.find((c) => c.id === id)
        if (!current) throw new Error('Contractor not found')
        const merged = { ...current, ...patch }
        await api.patch(`/api/contractors?id=${id}`, merged)
        setState((prev) => ({ ...prev, contractors: prev.contractors.map((c) => (c.id === id ? merged : c)) }))
      },
      deleteContractor: async (id) => {
        await api.delete(`/api/contractors?id=${id}`)
        setState((prev) => ({ ...prev, contractors: prev.contractors.filter((c) => c.id !== id) }))
      },

      addClient: async (client) => {
        const created = await api.post<Client>('/api/clients', client)
        setState((prev) => ({ ...prev, clients: [...prev.clients, created] }))
        return created
      },
      addJob: async (job) => {
        const created = await api.post<Job>('/api/jobs', job)
        setState((prev) => ({ ...prev, jobs: [...prev.jobs, created] }))
        return created
      },
      updateJob: async (id, patch) => {
        const current = state.jobs.find((j) => j.id === id)
        if (!current) throw new Error('Job not found')
        const merged = { ...current, ...patch }
        await api.patch(`/api/jobs?id=${id}`, merged)
        setState((prev) => ({ ...prev, jobs: prev.jobs.map((j) => (j.id === id ? merged : j)) }))
      },
      deleteJob: async (id) => {
        await api.delete(`/api/jobs?id=${id}`)
        setState((prev) => ({
          ...prev,
          jobs: prev.jobs.filter((j) => j.id !== id),
          scheduleBlocks: prev.scheduleBlocks.filter((b) => b.jobId !== id),
        }))
      },

      addCredential: async (credential) => {
        const created = await api.post<Credential>('/api/credentials', credential)
        setState((prev) => ({ ...prev, credentials: [...prev.credentials, created] }))
        return created
      },
      updateCredential: async (id, patch) => {
        const current = state.credentials.find((c) => c.id === id)
        if (!current) throw new Error('Credential not found')
        const merged = { ...current, ...patch }
        await api.patch(`/api/credentials?id=${id}`, merged)
        setState((prev) => ({ ...prev, credentials: prev.credentials.map((c) => (c.id === id ? merged : c)) }))
      },
      deleteCredential: async (id) => {
        await api.delete(`/api/credentials?id=${id}`)
        setState((prev) => ({ ...prev, credentials: prev.credentials.filter((c) => c.id !== id) }))
      },

      addWorker: async (worker) => {
        const created = await api.post<Worker>('/api/workers', worker)
        setState((prev) => ({ ...prev, workers: [...prev.workers, created] }))
        return created
      },
      updateWorker: async (id, patch) => {
        const current = state.workers.find((w) => w.id === id)
        if (!current) throw new Error('Worker not found')
        const merged = { ...current, ...patch }
        await api.patch(`/api/workers?id=${id}`, merged)
        setState((prev) => ({ ...prev, workers: prev.workers.map((w) => (w.id === id ? merged : w)) }))
      },
      deleteWorker: async (id) => {
        await api.delete(`/api/workers?id=${id}`)
        setState((prev) => ({ ...prev, workers: prev.workers.filter((w) => w.id !== id) }))
      },

      addTeamMembership: async (membership) => {
        const created = await api.post<TeamMembership>('/api/team-memberships', membership)
        setState((prev) => ({ ...prev, teamMemberships: [...prev.teamMemberships, created] }))
        return created
      },
      updateTeamMembership: async (id, patch) => {
        const current = state.teamMemberships.find((tm) => tm.id === id)
        if (!current) throw new Error('Team membership not found')
        const merged = { ...current, ...patch }
        await api.patch(`/api/team-memberships?id=${id}`, merged)
        setState((prev) => ({ ...prev, teamMemberships: prev.teamMemberships.map((tm) => (tm.id === id ? merged : tm)) }))
      },
      deleteTeamMembership: async (id) => {
        await api.delete(`/api/team-memberships?id=${id}`)
        setState((prev) => ({ ...prev, teamMemberships: prev.teamMemberships.filter((tm) => tm.id !== id) }))
      },

      upsertMonthlyTarget: async (year, month, targetDollars) => {
        const saved = await api.post<MonthlyTarget>('/api/monthly-targets', { year, month, targetDollars })
        setState((prev) => ({
          ...prev,
          monthlyTargets: [...prev.monthlyTargets.filter((t) => !(t.year === year && t.month === month)), saved],
        }))
        return saved
      },
      takeMonthlySnapshot: async (year, month, actualDollars) => {
        const saved = await api.post<MonthlySnapshot>('/api/monthly-snapshots', { year, month, actualDollars })
        setState((prev) => ({
          ...prev,
          monthlySnapshots: [...prev.monthlySnapshots.filter((s) => !(s.year === year && s.month === month)), saved],
        }))
        return saved
      },
      updateJobActualHours: async (jobId, override) => {
        await api.patch(`/api/jobs?id=${jobId}&action=actual-hours`, { override })
        setState((prev) => ({
          ...prev,
          jobs: prev.jobs.map((j) =>
            j.id === jobId ? { ...j, actualHoursOverride: override ?? undefined, actualHoursSource: override === null ? 'computed' : 'manual' } : j,
          ),
        }))
      },
      updateJobProduction: async (jobId, override) => {
        await api.patch(`/api/jobs?id=${jobId}&action=production`, { override })
        setState((prev) => ({
          ...prev,
          jobs: prev.jobs.map((j) =>
            j.id === jobId
              ? { ...j, productionPercentOverride: override ?? undefined, productionPercentSource: override === null ? 'computed' : 'manual' }
              : j,
          ),
        }))
      },
    }),
    [state, loading, error, fetchAll],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within a DataProvider')
  return ctx
}
