// Advanced-filter field config for the Deals CRM board — same condition-builder mechanics as
// jobFilters.ts (field/operator/value rows, AND/OR match mode), but scoped to the system columns
// that are always present on a list row. Per-pipeline custom fields (crm_deals.fields) are
// deliberately excluded: they're the very payload the crm-data list query stops loading for
// performance (see crm-data.mts), so filtering on them would mean loading it back for every row.
// Evaluation itself happens server-side (crm-data.mts) since deals are paginated, not held
// entirely in memory the way jobFilters.ts's client-side evaluateCondition can assume.

export type FilterFieldKey = 'title' | 'orgName' | 'personName' | 'stageId' | 'status' | 'value' | 'currency' | 'createdAt'
export type FilterFieldType = 'text' | 'number' | 'enum' | 'date'

export interface FilterFieldConfig {
  key: FilterFieldKey
  label: string
  type: FilterFieldType
  options?: { value: string; label: string }[]
}

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const

export const FILTER_FIELDS: FilterFieldConfig[] = [
  { key: 'title', label: 'Deal', type: 'text' },
  { key: 'orgName', label: 'Organization', type: 'text' },
  { key: 'personName', label: 'Person', type: 'text' },
  { key: 'stageId', label: 'Stage', type: 'enum', options: [] }, // overridden with live stages per pipeline
  { key: 'status', label: 'Status', type: 'enum', options: DEAL_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
  { key: 'value', label: 'Value ($)', type: 'number' },
  { key: 'currency', label: 'Currency', type: 'text' },
  { key: 'createdAt', label: 'Created', type: 'date' },
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
export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: FilterFieldKey | null
  direction: SortDirection
}

export const SORTABLE_FIELDS: FilterFieldKey[] = ['title', 'orgName', 'personName', 'value', 'status', 'createdAt']
