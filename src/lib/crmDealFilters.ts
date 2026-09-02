// Advanced-filter field/operator config for the Deals CRM board — matches Pipedrive's own filter
// builder: every system field plus every real custom field (crm_field_definitions) is filterable,
// each with the operator set Pipedrive itself offers for that field's type. Shares its condition
// shape (field/isCustom/operator/value) directly with _shared/savedFilterSql.ts's SavedFilterLeaf
// so the backend runs both saved filters and this ad-hoc one through the exact same SQL builder —
// see crm-data.mts's header for how a condition list here becomes one SavedFilterGroup.
//
// Evaluation happens server-side since deals are paginated, not held entirely in memory the way
// jobFilters.ts's client-side evaluateCondition can assume.
import type { CrmFieldDefinition } from '@/types'

export type FilterFieldType = 'text' | 'number' | 'enum' | 'date'
export type FilterOperator = 'contains' | 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'is_null' | 'is_not_null'

export interface FilterFieldConfig {
  /** System field key (matches a SavedFilterTarget column, e.g. 'title') or a custom field's
   * crm_field_definitions.key (an opaque Pipedrive hash) when isCustom is true. */
  key: string
  label: string
  type: FilterFieldType
  isCustom: boolean
  options?: { value: string; label: string }[]
}

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const

// Sales Pipeline / Business Development — both read crm_deals, so both get this same full set of
// real columns (matches CRM_DEALS_SAVED_FILTER_TARGET's own `columns` map in savedFilterSql.ts).
export const SALES_SYSTEM_FIELDS: FilterFieldConfig[] = [
  { key: 'title', label: 'Deal', type: 'text', isCustom: false },
  { key: 'stageId', label: 'Stage', type: 'enum', isCustom: false, options: [] }, // overridden with live stages per pipeline
  { key: 'status', label: 'Status', type: 'enum', isCustom: false, options: DEAL_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
  { key: 'value', label: 'Value ($)', type: 'number', isCustom: false },
  { key: 'currency', label: 'Currency', type: 'text', isCustom: false },
  { key: 'orgName', label: 'Organization', type: 'text', isCustom: false },
  { key: 'personName', label: 'Person', type: 'text', isCustom: false },
  { key: 'lostReason', label: 'Lost Reason', type: 'text', isCustom: false },
  { key: 'createdAt', label: 'Deal Created', type: 'date', isCustom: false },
  { key: 'wonAt', label: 'Won Time', type: 'date', isCustom: false },
  { key: 'lostAt', label: 'Lost Time', type: 'date', isCustom: false },
  { key: 'expectedCloseDate', label: 'Expected Close Date', type: 'date', isCustom: false },
  { key: 'nextActivityDate', label: 'Next Activity Date', type: 'date', isCustom: false },
  { key: 'stageChangeTime', label: 'Stage Change Time', type: 'date', isCustom: false },
  { key: 'pipedriveUpdateTime', label: 'Update Time', type: 'date', isCustom: false },
  { key: 'activitiesCount', label: 'Activities Count', type: 'number', isCustom: false },
]

// Jobs Pipeline — reads `jobs`, which has far fewer real columns (see JOBS_SAVED_FILTER_TARGET).
// `status` is a real, meaningful filter here now too: a Lost (or reverted-from-Won) deal is
// recorded as an archived Job rather than skipped/deleted (see dealSync.ts's
// upsertJobsPipelineDeals), so won-vs-lost genuinely varies instead of every row being 'won'.
export const JOBS_SYSTEM_FIELDS: FilterFieldConfig[] = [
  { key: 'title', label: 'Job', type: 'text', isCustom: false },
  { key: 'stageId', label: 'Stage', type: 'enum', isCustom: false, options: [] }, // overridden with live stages per pipeline
  { key: 'status', label: 'Status', type: 'enum', isCustom: false, options: DEAL_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
  { key: 'value', label: 'Value ($)', type: 'number', isCustom: false },
  { key: 'wonAt', label: 'Won Date', type: 'date', isCustom: false },
]

/** Maps one crm_field_definitions row to a filterable field — every real Pipedrive custom field
 * (~96 on this account: text, number, date, boolean, select, multiselect, address, monetary)
 * becomes filterable this way, not just the two (Category, Referral Source) previously
 * hardcoded. Multiselect is treated the same as select (single-value equality against the raw
 * jsonb array's stringified form) — a known approximation, not a real "is any of" match; nothing
 * in this account's real filters currently needs that finer distinction. */
export function customFieldToFilterConfig(def: CrmFieldDefinition): FilterFieldConfig {
  const type: FilterFieldType =
    def.fieldType === 'number' || def.fieldType === 'monetary'
      ? 'number'
      : def.fieldType === 'date'
        ? 'date'
        : def.fieldType === 'select' || def.fieldType === 'multiselect' || def.fieldType === 'boolean'
          ? 'enum'
          : 'text' // 'text' | 'address'
  const options =
    def.fieldType === 'boolean'
      ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]
      : (def.options ?? []).map((o) => ({ value: o.id, label: o.label }))
  return { key: def.key, label: def.label, type, isCustom: true, options: type === 'enum' ? options : undefined }
}

export const TEXT_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
  { value: 'is_null', label: 'is empty' },
  { value: 'is_not_null', label: 'is not empty' },
]
export const NUMBER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'is_null', label: 'is empty' },
  { value: 'is_not_null', label: 'is not empty' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
]
export const ENUM_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
  { value: 'is_null', label: 'is empty' },
  { value: 'is_not_null', label: 'is not empty' },
]
export const DATE_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
  { value: 'is_null', label: 'is empty' },
  { value: 'is_not_null', label: 'is not empty' },
  { value: 'lte', label: 'is exactly on or before' },
  { value: 'lt', label: 'is before' },
  { value: 'gte', label: 'is exactly on or after' },
  { value: 'gt', label: 'is after' },
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

/** is_null/is_not_null need no value at all — Pipedrive's own "is empty"/"is not empty" rows just
 * show the field + operator with nothing after them. */
export function operatorNeedsValue(operator: string): boolean {
  return operator !== 'is_null' && operator !== 'is_not_null'
}

export interface FilterCondition {
  id: string
  field: string
  isCustom: boolean
  operator: FilterOperator
  value: string
}

export type MatchMode = 'AND' | 'OR'
export type SortDirection = 'asc' | 'desc'

// Sorting stays system-columns-only (no custom-field sort — same jsonb-per-row cost the list query
// was rewritten to avoid; see crm-data.mts's header), so this is intentionally narrower than
// FilterFieldConfig's full field set. 'orgName' stays here even though it's not in every pipeline's
// system field list, since JobsList-style SortableHead columns use it as the table's Client column
// sort key regardless of which pipeline is active.
export type SortFieldKey = 'title' | 'orgName' | 'value' | 'status' | 'createdAt'

export interface SortState {
  key: SortFieldKey | null
  direction: SortDirection
}
