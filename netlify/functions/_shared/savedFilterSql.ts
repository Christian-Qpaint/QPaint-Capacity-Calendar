// Turns a translated Pipedrive saved-filter condition tree (see crm-saved-filters-import script's
// header comment for the translation rules) into a real SQL predicate against crm_deals — entirely
// server-side, no live call back to Pipedrive. System fields (status, stage, value, title, dates,
// org/person name, lost reason) compare against their real typed column; everything else is
// assumed to be a crm_field_definitions.key and compared as text against the `fields` jsonb blob
// via `->>` — correct for the option-id/enum/date-string shapes Pipedrive's own custom fields
// actually store (ISO date strings sort lexicographically the same as chronologically), though a
// hypothetical custom NUMBER field compared with < / > would sort as text, not a numeric value —
// no filter in the initial 47-filter import needs that, so it's left as a known limitation rather
// than solved speculatively.
import { and, or, eq, ne, lt, lte, gt, gte, ilike, isNull, isNotNull, inArray, notInArray, sql, type SQL, type AnyColumn } from 'drizzle-orm'
import { crmDeals } from '../../../db/schema.js'

export type SavedFilterOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'is_null' | 'is_not_null' | 'contains' | 'in' | 'not_in'

export interface SavedFilterLeaf {
  /** A key in SYSTEM_COLUMNS below, or (when isCustom) a crm_field_definitions.key. */
  field: string
  isCustom: boolean
  operator: SavedFilterOperator
  value: string | string[] | null
  /** True => value (or each item, for in/not_in) is a relative-date token — see
   * RELATIVE_DATE_RESOLVERS — resolved fresh against "now" every time this filter runs, not frozen
   * at import time. A Pipedrive "period" condition (this_year, this_month, this_quarter,
   * last_quarter, this_week) is split at import time into a start/end pair of gte/lte leaves under
   * an AND group, each referencing the matching `_start`/`_end` token. */
  isRelativeDate?: boolean
}
export interface SavedFilterGroup {
  glue: 'and' | 'or'
  conditions: SavedFilterNode[]
}
export type SavedFilterNode = SavedFilterLeaf | SavedFilterGroup

function isGroup(node: SavedFilterNode): node is SavedFilterGroup {
  return 'glue' in node
}

export const SYSTEM_COLUMNS: Record<string, AnyColumn> = {
  status: crmDeals.status,
  stageId: crmDeals.stageId,
  value: crmDeals.value,
  title: crmDeals.title,
  currency: crmDeals.currency,
  orgName: crmDeals.orgName,
  personName: crmDeals.personName,
  lostReason: crmDeals.lostReason,
  createdAt: crmDeals.createdAt,
  wonAt: crmDeals.wonAt,
  lostAt: crmDeals.lostAt,
}
const NUMERIC_SYSTEM_FIELDS = new Set(['value'])

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function startOfQuarter(d: Date, quarterOffset = 0): Date {
  const q = Math.floor(d.getMonth() / 3) + quarterOffset
  const year = d.getFullYear() + Math.floor(q / 4)
  const month = ((q % 4) + 4) % 4
  return new Date(year, month * 3, 1)
}

const RELATIVE_DATE_RESOLVERS: Record<string, () => string> = {
  today: () => toIsoDate(new Date()),
  '12_months_ago': () => {
    const d = new Date()
    d.setMonth(d.getMonth() - 12)
    return toIsoDate(d)
  },
  '3_months_ago': () => {
    const d = new Date()
    d.setMonth(d.getMonth() - 3)
    return toIsoDate(d)
  },
  this_year_start: () => toIsoDate(new Date(new Date().getFullYear(), 0, 1)),
  this_year_end: () => toIsoDate(new Date(new Date().getFullYear(), 11, 31)),
  this_month_start: () => {
    const d = new Date()
    return toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1))
  },
  this_month_end: () => {
    const d = new Date()
    return toIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  },
  this_quarter_start: () => toIsoDate(startOfQuarter(new Date(), 0)),
  this_quarter_end: () => {
    const s = startOfQuarter(new Date(), 1)
    s.setDate(s.getDate() - 1)
    return toIsoDate(s)
  },
  last_quarter_start: () => toIsoDate(startOfQuarter(new Date(), -1)),
  last_quarter_end: () => {
    const s = startOfQuarter(new Date(), 0)
    s.setDate(s.getDate() - 1)
    return toIsoDate(s)
  },
  this_week_start: () => {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return toIsoDate(new Date(d.getFullYear(), d.getMonth(), diff))
  },
  this_week_end: () => {
    const start = new Date(RELATIVE_DATE_RESOLVERS.this_week_start())
    start.setDate(start.getDate() + 6)
    return toIsoDate(start)
  },
}

export function resolveRelativeDateToken(token: string): string | null {
  return RELATIVE_DATE_RESOLVERS[token]?.() ?? null
}

function resolveLeafValue(value: string, isRelativeDate?: boolean): string {
  if (!isRelativeDate) return value
  return resolveRelativeDateToken(value) ?? value
}

function customFieldExpr(key: string) {
  return sql`(${crmDeals.fields} ->> ${key})`
}

function leafToSql(leaf: SavedFilterLeaf): SQL | undefined {
  const col = leaf.isCustom ? undefined : SYSTEM_COLUMNS[leaf.field]
  if (!leaf.isCustom && !col) return undefined
  const expr = leaf.isCustom ? customFieldExpr(leaf.field) : undefined

  if (leaf.operator === 'is_null') return leaf.isCustom ? sql`${expr} IS NULL` : isNull(col!)
  if (leaf.operator === 'is_not_null') return leaf.isCustom ? sql`${expr} IS NOT NULL` : isNotNull(col!)

  if (leaf.operator === 'in' || leaf.operator === 'not_in') {
    const raw = Array.isArray(leaf.value) ? leaf.value : [leaf.value ?? '']
    const values = raw.map((v) => resolveLeafValue(v, leaf.isRelativeDate))
    if (leaf.isCustom) {
      const list = sql.join(
        values.map((v) => sql`${v}`),
        sql`, `,
      )
      return leaf.operator === 'in' ? sql`${expr} IN (${list})` : sql`${expr} NOT IN (${list})`
    }
    const typed = NUMERIC_SYSTEM_FIELDS.has(leaf.field) ? values.map(Number) : values
    return leaf.operator === 'in' ? inArray(col!, typed) : notInArray(col!, typed)
  }

  const rawValue = Array.isArray(leaf.value) ? (leaf.value[0] ?? '') : (leaf.value ?? '')
  const value = resolveLeafValue(rawValue, leaf.isRelativeDate)

  if (leaf.isCustom) {
    switch (leaf.operator) {
      case 'eq': return sql`${expr} = ${value}`
      case 'neq': return sql`${expr} != ${value}`
      case 'lt': return sql`${expr} < ${value}`
      case 'lte': return sql`${expr} <= ${value}`
      case 'gt': return sql`${expr} > ${value}`
      case 'gte': return sql`${expr} >= ${value}`
      case 'contains': return sql`${expr} ILIKE ${'%' + value + '%'}`
      default: return undefined
    }
  }

  const typedValue = NUMERIC_SYSTEM_FIELDS.has(leaf.field) ? Number(value) : value
  switch (leaf.operator) {
    case 'eq': return eq(col!, typedValue)
    case 'neq': return ne(col!, typedValue)
    case 'lt': return lt(col!, typedValue)
    case 'lte': return lte(col!, typedValue)
    case 'gt': return gt(col!, typedValue)
    case 'gte': return gte(col!, typedValue)
    case 'contains': return ilike(col!, `%${value}%`)
    default: return undefined
  }
}

export function buildSavedFilterSql(node: SavedFilterNode): SQL | undefined {
  if (isGroup(node)) {
    const parts = node.conditions.map(buildSavedFilterSql).filter((x): x is SQL => !!x)
    if (parts.length === 0) return undefined
    if (parts.length === 1) return parts[0]
    return node.glue === 'or' ? or(...parts) : and(...parts)
  }
  return leafToSql(node)
}

/** Whether this filter tree already constrains the given system field anywhere in it — used by
 * crm-data.mts to back off its own default "hide Won/Lost" exclusion when the filter someone
 * picked already has its own opinion about `status` (e.g. a "All lost deals" saved filter), rather
 * than silently AND-ing the two together and returning zero rows. */
export function savedFilterReferencesField(node: SavedFilterNode, field: string): boolean {
  if (isGroup(node)) return node.conditions.some((c) => savedFilterReferencesField(c, field))
  return !node.isCustom && node.field === field
}
