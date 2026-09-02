// Turns a translated Pipedrive saved-filter condition tree (see crm-saved-filters-import script's
// header comment for the translation rules) into a real SQL predicate — entirely server-side, no
// live call back to Pipedrive. System fields (status, stage, value, title, dates, org/person name,
// lost reason) compare against their real typed column; everything else is assumed to be a
// crm_field_definitions.key and compared as text against a `fields` jsonb blob via `->>` — correct
// for the option-id/enum/date-string shapes Pipedrive's own custom fields actually store (ISO date
// strings sort lexicographically the same as chronologically), though a hypothetical custom NUMBER
// field compared with < / > would sort as text, not a numeric value — no filter in the initial
// 47-filter import needs that, so it's left as a known limitation rather than solved speculatively.
//
// Parameterized by a SavedFilterTarget rather than hardcoded to crm_deals, because Jobs Pipeline
// rows (post Jobs/Jobs-Pipeline merge) live in `jobs`, a different table/shape — same filter tree,
// different columns underneath. A job has no real `status` column (it's implicitly always "won",
// which is the only way a deal ever becomes a job) — CRM_DEALS_SAVED_FILTER_TARGET's `status` is a
// real column; JOBS_SAVED_FILTER_TARGET's `constantFields.status` instead makes a `status` leaf
// evaluate as a compile-time true/false against the literal 'won', no column involved.
import { and, or, eq, ne, lt, lte, gt, gte, ilike, isNull, isNotNull, inArray, notInArray, sql, type SQL, type AnyColumn } from 'drizzle-orm'
import { crmDeals, jobs } from '../../../db/schema.js'

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

export interface SavedFilterTarget {
  /** Real, comparable system columns available on this target's table. */
  columns: Record<string, AnyColumn>
  /** jsonb column holding raw Pipedrive custom-field values (compared via ->> ), e.g. crm_deals.fields
   * or jobs.fields. */
  customFieldsColumn: AnyColumn
  numericFields: Set<string>
  /** Fields with no real column on this target — the leaf instead evaluates as a compile-time
   * true/false against this literal value, e.g. a job's implicit status is always 'won'. */
  constantFields?: Record<string, string>
  /** Per-custom-field-key type hint (from crm_field_definitions.field_type), so a custom field's
   * `fields ->> key` text extraction gets cast before <//<=/>/>= comparison instead of sorting
   * lexicographically — e.g. "90" < "700" as text but not as a number. Built fresh per request
   * (crm-data.mts) from whichever custom fields a filter actually references; omit a key here and
   * it's compared as plain text, matching the previous behavior for eq/neq/contains anyway.
   * 'number' covers Pipedrive's number/monetary field types; 'date' covers its date field type. */
  customFieldTypes?: Record<string, 'number' | 'date'>
}

export const CRM_DEALS_SAVED_FILTER_TARGET: SavedFilterTarget = {
  columns: {
    status: crmDeals.status,
    stageId: crmDeals.stageId,
    pipelineId: crmDeals.pipelineId,
    value: crmDeals.value,
    title: crmDeals.title,
    currency: crmDeals.currency,
    orgName: crmDeals.orgName,
    personName: crmDeals.personName,
    lostReason: crmDeals.lostReason,
    createdAt: crmDeals.createdAt,
    wonAt: crmDeals.wonAt,
    lostAt: crmDeals.lostAt,
    pipedriveUpdateTime: crmDeals.pipedriveUpdateTime,
    nextActivityDate: crmDeals.nextActivityDate,
    activitiesCount: crmDeals.activitiesCount,
    stageChangeTime: crmDeals.stageChangeTime,
    expectedCloseDate: crmDeals.expectedCloseDate,
  },
  customFieldsColumn: crmDeals.fields,
  numericFields: new Set(['value', 'activitiesCount']),
}

// Jobs Pipeline rows (post Jobs/Jobs-Pipeline merge) live in `jobs`, not crm_deals — a much smaller
// set of real system columns maps cleanly. Custom fields still work identically: `fields` is
// migrated 1:1 from the deal onto its job at promotion time (see dealToJob.ts), same keys, same
// shapes. Anything not listed here (currency, orgName/personName, lostReason, most of the
// deal-activity timestamps) has no equivalent on a job and is left unsupported rather than guessed
// at — a leaf referencing one just drops out of the filter (see buildSavedFilterSql), same
// graceful-degradation behavior as an unrecognized field always had.
export const JOBS_SAVED_FILTER_TARGET: SavedFilterTarget = {
  columns: {
    stageId: jobs.stageId,
    value: jobs.totalValue,
    title: jobs.pipedriveDealTitle,
    wonAt: jobs.dateWon,
    // A real column now, not a compile-time 'won' constant — a Lost (or reverted-from-Won) Jobs
    // Pipeline deal is recorded as an archived Job rather than skipped/deleted (see dealSync.ts's
    // upsertJobsPipelineDeals), so won-vs-lost is a genuine, filterable distinction going forward.
    status: jobs.status,
  },
  customFieldsColumn: jobs.fields,
  numericFields: new Set(['value']),
}

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

function customFieldExpr(target: SavedFilterTarget, key: string) {
  const raw = sql`(${target.customFieldsColumn} ->> ${key})`
  const type = target.customFieldTypes?.[key]
  if (type === 'number') return sql`(${raw})::numeric`
  if (type === 'date') return sql`(${raw})::date`
  return raw
}

/** Evaluates a leaf against a compile-time constant (e.g. Jobs Pipeline's always-'won' status) in
 * plain JS rather than SQL — there's no column to compare against, just a fixed string every row
 * shares. Same operator semantics as the real-column path below, minus the ones that only make
 * sense against an actual column (lt/lte/gt/gte/contains/is_null/is_not_null all collapse to a
 * fixed true/false here since a non-null constant is never null and ordering/substring comparisons
 * against a single-word status aren't a real Pipedrive filter shape). */
function evalConstantLeaf(constant: string, leaf: SavedFilterLeaf): SQL {
  const literal = (b: boolean) => (b ? sql`true` : sql`false`)
  if (leaf.operator === 'is_null') return literal(false)
  if (leaf.operator === 'is_not_null') return literal(true)
  if (leaf.operator === 'in' || leaf.operator === 'not_in') {
    const raw = Array.isArray(leaf.value) ? leaf.value : [leaf.value ?? '']
    const values = raw.map((v) => resolveLeafValue(v, leaf.isRelativeDate))
    const isIn = values.includes(constant)
    return literal(leaf.operator === 'in' ? isIn : !isIn)
  }
  const rawValue = Array.isArray(leaf.value) ? (leaf.value[0] ?? '') : (leaf.value ?? '')
  const value = resolveLeafValue(rawValue, leaf.isRelativeDate)
  if (leaf.operator === 'eq') return literal(constant === value)
  if (leaf.operator === 'neq') return literal(constant !== value)
  return literal(false)
}

function leafToSql(leaf: SavedFilterLeaf, target: SavedFilterTarget): SQL | undefined {
  if (!leaf.isCustom && target.constantFields?.[leaf.field] != null) {
    return evalConstantLeaf(target.constantFields[leaf.field], leaf)
  }

  const col = leaf.isCustom ? undefined : target.columns[leaf.field]
  if (!leaf.isCustom && !col) return undefined
  const expr = leaf.isCustom ? customFieldExpr(target, leaf.field) : undefined

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
    const typed = target.numericFields.has(leaf.field) ? values.map(Number) : values
    return leaf.operator === 'in' ? inArray(col!, typed) : notInArray(col!, typed)
  }

  const rawValue = Array.isArray(leaf.value) ? (leaf.value[0] ?? '') : (leaf.value ?? '')
  const value = resolveLeafValue(rawValue, leaf.isRelativeDate)

  if (leaf.isCustom) {
    const customType = target.customFieldTypes?.[leaf.field]
    // Matches customFieldExpr's own cast on the column side — comparing a ::numeric/::date
    // expression against a bare text parameter mostly coerces fine on its own, but casting the
    // value explicitly too avoids relying on Postgres inferring the right side from context.
    const typedValue = customType === 'number' ? sql`${value}::numeric` : customType === 'date' ? sql`${value}::date` : sql`${value}`
    switch (leaf.operator) {
      case 'eq': return sql`${expr} = ${typedValue}`
      case 'neq': return sql`${expr} != ${typedValue}`
      case 'lt': return sql`${expr} < ${typedValue}`
      case 'lte': return sql`${expr} <= ${typedValue}`
      case 'gt': return sql`${expr} > ${typedValue}`
      case 'gte': return sql`${expr} >= ${typedValue}`
      case 'contains': return sql`${expr} ILIKE ${'%' + value + '%'}`
      default: return undefined
    }
  }

  const typedValue = target.numericFields.has(leaf.field) ? Number(value) : value
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

export function buildSavedFilterSql(node: SavedFilterNode, target: SavedFilterTarget = CRM_DEALS_SAVED_FILTER_TARGET): SQL | undefined {
  if (isGroup(node)) {
    const parts = node.conditions.map((c) => buildSavedFilterSql(c, target)).filter((x): x is SQL => !!x)
    if (parts.length === 0) return undefined
    if (parts.length === 1) return parts[0]
    return node.glue === 'or' ? or(...parts) : and(...parts)
  }
  return leafToSql(node, target)
}

/** Whether this filter tree already constrains the given system field anywhere in it — used by
 * crm-data.mts to back off its own default "hide Won/Lost" exclusion when the filter someone
 * picked already has its own opinion about `status` (e.g. a "All lost deals" saved filter), rather
 * than silently AND-ing the two together and returning zero rows. */
export function savedFilterReferencesField(node: SavedFilterNode, field: string): boolean {
  if (isGroup(node)) return node.conditions.some((c) => savedFilterReferencesField(c, field))
  return !node.isCustom && node.field === field
}
