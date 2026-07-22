import type { Job, JobCategory } from '@/types'
import { PIPEDRIVE_STAGE_LABELS, PIPEDRIVE_TARGET_STAGE_IDS } from '@/lib/pipedriveStages'

export const JOB_CATEGORIES: JobCategory[] = ['Residential', 'Corporate', 'Commercial', 'Government']
export const JOB_STATUSES = ['Unscheduled', 'Scheduled', 'In Production', 'Overdue', 'Completed'] as const

export type FilterFieldKey =
  | 'clientName'
  | 'jobName'
  | 'category'
  | 'pipelineStage'
  | 'status'
  | 'totalValue'
  | 'targetHours'
  | 'allocatedHours'
  | 'actualDollars'
  | 'productionPercent'
  | 'dateWon'

export type FilterFieldType = 'text' | 'number' | 'enum' | 'date'

export interface FilterFieldConfig {
  key: FilterFieldKey
  label: string
  type: FilterFieldType
  options?: { value: string; label: string }[]
}

export const FILTER_FIELDS: FilterFieldConfig[] = [
  { key: 'clientName', label: 'Client', type: 'text' },
  { key: 'jobName', label: 'Job', type: 'text' },
  { key: 'category', label: 'Category', type: 'enum', options: JOB_CATEGORIES.map((c) => ({ value: c, label: c })) },
  {
    key: 'pipelineStage',
    label: 'Pipeline stage',
    type: 'enum',
    options: PIPEDRIVE_TARGET_STAGE_IDS.map((id) => ({ value: String(id), label: PIPEDRIVE_STAGE_LABELS[id] })),
  },
  { key: 'status', label: 'Status', type: 'enum', options: JOB_STATUSES.map((s) => ({ value: s, label: s })) },
  { key: 'totalValue', label: 'Total value ($)', type: 'number' },
  { key: 'targetHours', label: 'Target hours', type: 'number' },
  { key: 'allocatedHours', label: 'Allocated hours', type: 'number' },
  { key: 'actualDollars', label: 'Production $', type: 'number' },
  { key: 'productionPercent', label: 'Production %', type: 'number' },
  { key: 'dateWon', label: 'Date won', type: 'date' },
]

export const TEXT_OPERATORS = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
]
export const NUMBER_OPERATORS = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
]
export const ENUM_OPERATORS = [
  { value: 'equals', label: 'is' },
  { value: 'not_equals', label: 'is not' },
]
export const DATE_OPERATORS = [
  { value: 'on', label: 'on' },
  { value: 'before', label: 'before' },
  { value: 'after', label: 'after' },
]

export function operatorsForType(type: FilterFieldType) {
  switch (type) {
    case 'text':
      return TEXT_OPERATORS
    case 'number':
      return NUMBER_OPERATORS
    case 'enum':
      return ENUM_OPERATORS
    case 'date':
      return DATE_OPERATORS
  }
}

export interface FilterCondition {
  id: string
  field: FilterFieldKey
  operator: string
  value: string
}

export type MatchMode = 'AND' | 'OR'

export interface JobFilterContext {
  job: Job
  clientName: string
  jobName: string
  status: string
  allocatedHours: number
  actualDollars: number
  productionPercent: number
}

function getFieldValue(ctx: JobFilterContext, key: FilterFieldKey): string | number {
  switch (key) {
    case 'clientName':
      return ctx.clientName
    case 'jobName':
      return ctx.jobName
    case 'category':
      return ctx.job.category
    case 'pipelineStage':
      return ctx.job.pipedriveStageId ?? 0
    case 'status':
      return ctx.status
    case 'totalValue':
      return ctx.job.totalValue
    case 'targetHours':
      return ctx.job.targetHours
    case 'allocatedHours':
      return ctx.allocatedHours
    case 'actualDollars':
      return ctx.actualDollars
    case 'productionPercent':
      return ctx.productionPercent
    case 'dateWon':
      return ctx.job.dateWon
  }
}

function evaluateCondition(ctx: JobFilterContext, condition: FilterCondition): boolean {
  const config = FILTER_FIELDS.find((f) => f.key === condition.field)
  if (!config || condition.value === '') return true
  const raw = getFieldValue(ctx, condition.field)

  switch (config.type) {
    case 'text': {
      const a = String(raw).toLowerCase()
      const b = condition.value.toLowerCase()
      if (condition.operator === 'contains') return a.includes(b)
      if (condition.operator === 'equals') return a === b
      if (condition.operator === 'not_equals') return a !== b
      return true
    }
    case 'number': {
      const a = Number(raw)
      const b = Number(condition.value)
      if (Number.isNaN(b)) return true
      switch (condition.operator) {
        case 'eq':
          return a === b
        case 'neq':
          return a !== b
        case 'lt':
          return a < b
        case 'lte':
          return a <= b
        case 'gt':
          return a > b
        case 'gte':
          return a >= b
        default:
          return true
      }
    }
    case 'enum': {
      const a = String(raw)
      if (condition.operator === 'equals') return a === condition.value
      if (condition.operator === 'not_equals') return a !== condition.value
      return true
    }
    case 'date': {
      const a = String(raw)
      const b = condition.value
      if (condition.operator === 'on') return a === b
      if (condition.operator === 'before') return a < b
      if (condition.operator === 'after') return a > b
      return true
    }
  }
}

export function applyConditions(rows: JobFilterContext[], conditions: FilterCondition[], matchMode: MatchMode): JobFilterContext[] {
  const active = conditions.filter((c) => c.value !== '')
  if (active.length === 0) return rows
  return rows.filter((ctx) => {
    const results = active.map((c) => evaluateCondition(ctx, c))
    return matchMode === 'AND' ? results.every(Boolean) : results.some(Boolean)
  })
}

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: FilterFieldKey | null
  direction: SortDirection
}

export function sortRows<T extends JobFilterContext>(rows: T[], sort: SortState): T[] {
  if (!sort.key) return rows
  const key = sort.key
  const dir = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = getFieldValue(a, key)
    const bv = getFieldValue(b, key)
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
}
