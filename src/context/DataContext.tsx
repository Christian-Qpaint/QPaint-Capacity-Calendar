import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'
import * as m from '@/lib/supabaseMappers'
import { useAuth } from './AuthContext'
import type {
  Client,
  Contractor,
  Credential,
  DailyHoursEntry,
  Job,
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
  addCredential: (credential: Omit<Credential, 'id'>) => Promise<Credential>
  updateCredential: (id: string, patch: Partial<Credential>) => Promise<void>
  deleteCredential: (id: string) => Promise<void>
  addWorker: (worker: Omit<Worker, 'id'>) => Promise<Worker>
  updateWorker: (id: string, patch: Partial<Worker>) => Promise<void>
  deleteWorker: (id: string) => Promise<void>
  addTeamMembership: (membership: Omit<TeamMembership, 'id'>) => Promise<TeamMembership>
  updateTeamMembership: (id: string, patch: Partial<TeamMembership>) => Promise<void>
  deleteTeamMembership: (id: string) => Promise<void>
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
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [state, setState] = useState<DataState>(EMPTY_STATE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!session) {
      setState(EMPTY_STATE)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const [clients, contractors, credentials, teams, workers, teamMemberships, jobs, scheduleBlocks, dailyHoursEntries, weeklyActuals] =
      await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('contractors_view').select('*'),
        supabase.from('credentials').select('*'),
        supabase.from('teams').select('*'),
        supabase.from('workers').select('*'),
        supabase.from('team_memberships').select('*'),
        supabase.from('jobs_view').select('*'),
        supabase.from('schedule_blocks').select('*'),
        supabase.from('daily_hours_entries').select('*'),
        supabase.from('weekly_actuals').select('*'),
      ])

    const firstError = [
      clients, contractors, credentials, teams, workers, teamMemberships, jobs, scheduleBlocks, dailyHoursEntries, weeklyActuals,
    ].find((r) => r.error)?.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    setState({
      clients: (clients.data ?? []).map(m.mapClient),
      contractors: (contractors.data ?? []).map(m.mapContractor),
      credentials: (credentials.data ?? []).map(m.mapCredential),
      teams: (teams.data ?? []).map(m.mapTeam),
      workers: (workers.data ?? []).map(m.mapWorker),
      teamMemberships: (teamMemberships.data ?? []).map(m.mapTeamMembership),
      jobs: (jobs.data ?? []).map(m.mapJob),
      scheduleBlocks: (scheduleBlocks.data ?? []).map(m.mapScheduleBlock),
      dailyHoursEntries: (dailyHoursEntries.data ?? []).map(m.mapDailyHoursEntry),
      weeklyActuals: (weeklyActuals.data ?? []).map(m.mapWeeklyActual),
    })
    setLoading(false)
  }, [session])

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
        const { data, error } = await supabase.from('schedule_blocks').insert(m.scheduleBlockToRow(block)).select().single()
        if (error) throw new Error(error.message)
        const created = m.mapScheduleBlock(data)
        setState((prev) => ({ ...prev, scheduleBlocks: [...prev.scheduleBlocks, created] }))
        return created
      },
      updateScheduleBlock: async (id, patch) => {
        const current = state.scheduleBlocks.find((b) => b.id === id)
        if (!current) throw new Error('Schedule block not found')
        const merged = { ...current, ...patch }
        const { error } = await supabase.from('schedule_blocks').update(m.scheduleBlockToRow(merged)).eq('id', id)
        if (error) throw new Error(error.message)
        setState((prev) => ({ ...prev, scheduleBlocks: prev.scheduleBlocks.map((b) => (b.id === id ? merged : b)) }))
      },
      deleteScheduleBlock: async (id) => {
        const { error } = await supabase.from('schedule_blocks').delete().eq('id', id)
        if (error) throw new Error(error.message)
        setState((prev) => ({ ...prev, scheduleBlocks: prev.scheduleBlocks.filter((b) => b.id !== id) }))
      },
      addDailyHoursEntry: async (entry) => {
        const { data, error } = await supabase.from('daily_hours_entries').insert(m.dailyHoursEntryToRow(entry)).select().single()
        if (error) throw new Error(error.message)
        const created = m.mapDailyHoursEntry(data)
        setState((prev) => ({ ...prev, dailyHoursEntries: [...prev.dailyHoursEntries, created] }))
        return created
      },

      addTeam: async (team) => {
        const { data, error } = await supabase.from('teams').insert(m.teamToRow(team)).select().single()
        if (error) throw new Error(error.message)
        const created = m.mapTeam(data)
        setState((prev) => ({ ...prev, teams: [...prev.teams, created] }))
        return created
      },
      updateTeam: async (id, patch) => {
        const current = state.teams.find((t) => t.id === id)
        if (!current) throw new Error('Team not found')
        const merged = { ...current, ...patch }
        const { error } = await supabase.from('teams').update(m.teamToRow(merged)).eq('id', id)
        if (error) throw new Error(error.message)
        setState((prev) => ({ ...prev, teams: prev.teams.map((t) => (t.id === id ? merged : t)) }))
      },
      deleteTeam: async (id) => {
        const { error } = await supabase.from('teams').delete().eq('id', id)
        if (error) throw new Error(error.message)
        setState((prev) => ({ ...prev, teams: prev.teams.filter((t) => t.id !== id) }))
      },

      addContractor: async (contractor) => {
        const { data, error } = await supabase.from('contractors').insert(m.contractorToRow(contractor)).select().single()
        if (error) throw new Error(error.message)
        const created = m.mapContractor(data)
        setState((prev) => ({ ...prev, contractors: [...prev.contractors, created] }))
        return created
      },
      updateContractor: async (id, patch) => {
        const current = state.contractors.find((c) => c.id === id)
        if (!current) throw new Error('Contractor not found')
        const merged = { ...current, ...patch }
        const { error } = await supabase.from('contractors').update(m.contractorToRow(merged)).eq('id', id)
        if (error) throw new Error(error.message)
        setState((prev) => ({ ...prev, contractors: prev.contractors.map((c) => (c.id === id ? merged : c)) }))
      },
      deleteContractor: async (id) => {
        const { error } = await supabase.from('contractors').delete().eq('id', id)
        if (error) throw new Error(error.message)
        setState((prev) => ({ ...prev, contractors: prev.contractors.filter((c) => c.id !== id) }))
      },

      addCredential: async (credential) => {
        const { data, error } = await supabase.from('credentials').insert(m.credentialToRow(credential)).select().single()
        if (error) throw new Error(error.message)
        const created = m.mapCredential(data)
        setState((prev) => ({ ...prev, credentials: [...prev.credentials, created] }))
        return created
      },
      updateCredential: async (id, patch) => {
        const current = state.credentials.find((c) => c.id === id)
        if (!current) throw new Error('Credential not found')
        const merged = { ...current, ...patch }
        const { error } = await supabase.from('credentials').update(m.credentialToRow(merged)).eq('id', id)
        if (error) throw new Error(error.message)
        setState((prev) => ({ ...prev, credentials: prev.credentials.map((c) => (c.id === id ? merged : c)) }))
      },
      deleteCredential: async (id) => {
        const { error } = await supabase.from('credentials').delete().eq('id', id)
        if (error) throw new Error(error.message)
        setState((prev) => ({ ...prev, credentials: prev.credentials.filter((c) => c.id !== id) }))
      },

      addWorker: async (worker) => {
        const { data, error } = await supabase.from('workers').insert(m.workerToRow(worker)).select().single()
        if (error) throw new Error(error.message)
        const created = m.mapWorker(data)
        setState((prev) => ({ ...prev, workers: [...prev.workers, created] }))
        return created
      },
      updateWorker: async (id, patch) => {
        const current = state.workers.find((w) => w.id === id)
        if (!current) throw new Error('Worker not found')
        const merged = { ...current, ...patch }
        const { error } = await supabase.from('workers').update(m.workerToRow(merged)).eq('id', id)
        if (error) throw new Error(error.message)
        setState((prev) => ({ ...prev, workers: prev.workers.map((w) => (w.id === id ? merged : w)) }))
      },
      deleteWorker: async (id) => {
        const { error } = await supabase.from('workers').delete().eq('id', id)
        if (error) throw new Error(error.message)
        setState((prev) => ({ ...prev, workers: prev.workers.filter((w) => w.id !== id) }))
      },

      addTeamMembership: async (membership) => {
        const { data, error } = await supabase.from('team_memberships').insert(m.teamMembershipToRow(membership)).select().single()
        if (error) throw new Error(error.message)
        const created = m.mapTeamMembership(data)
        setState((prev) => ({ ...prev, teamMemberships: [...prev.teamMemberships, created] }))
        return created
      },
      updateTeamMembership: async (id, patch) => {
        const current = state.teamMemberships.find((tm) => tm.id === id)
        if (!current) throw new Error('Team membership not found')
        const merged = { ...current, ...patch }
        const { error } = await supabase.from('team_memberships').update(m.teamMembershipToRow(merged)).eq('id', id)
        if (error) throw new Error(error.message)
        setState((prev) => ({ ...prev, teamMemberships: prev.teamMemberships.map((tm) => (tm.id === id ? merged : tm)) }))
      },
      deleteTeamMembership: async (id) => {
        const { error } = await supabase.from('team_memberships').delete().eq('id', id)
        if (error) throw new Error(error.message)
        setState((prev) => ({ ...prev, teamMemberships: prev.teamMemberships.filter((tm) => tm.id !== id) }))
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
