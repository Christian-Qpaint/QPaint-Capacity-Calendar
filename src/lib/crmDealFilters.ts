// Advanced-filter field config for the Deals CRM board — same condition-builder mechanics as
// jobFilters.ts (field/operator/value rows, AND/OR match mode). Mostly the system columns that are
// always present on a list row, plus two named custom fields (Category, Referral Source) whose
// jsonb comparison crm-data.mts's ad-hoc filter builder special-cases — not a general "filter on
// any custom field" mechanism, since loading the rest of the ~90-key `fields` blob back for every
// row is the exact perf cost the list query was rewritten to avoid (see crm-data.mts's header).
// Evaluation happens server-side since deals are paginated, not held entirely in memory the way
// jobFilters.ts's client-side evaluateCondition can assume.
//
// 'orgName' stays in the FilterFieldKey type (JobsList-style SortableHead columns use it as a sort
// key for the table's Client column) even though it's no longer offered as an advanced-filter
// choice below — organization/person text search is still available via the board's search box.

export type FilterFieldKey = 'title' | 'orgName' | 'stageId' | 'status' | 'value' | 'category' | 'referralSource' | 'createdAt'
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
  { key: 'stageId', label: 'Stage', type: 'enum', options: [] }, // overridden with live stages per pipeline
  { key: 'status', label: 'Status', type: 'enum', options: DEAL_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
  { key: 'value', label: 'Value ($)', type: 'number' },
  { key: 'category', label: 'Category', type: 'enum', options: [] }, // overridden with the live Category Type field's options
  { key: 'referralSource', label: 'Referral Source', type: 'enum', options: [] }, // overridden with the live Referral Source field's options
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
