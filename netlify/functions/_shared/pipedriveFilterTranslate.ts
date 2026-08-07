// Translates one Pipedrive saved deal filter's raw v1 condition tree into this app's own
// SavedFilterNode shape (savedFilterSql.ts) — used by crm-sync-filters.mts to keep saved filters
// current with whatever's edited directly in Pipedrive (there's no webhook for filter changes;
// confirmed by a dry POST to /v1/webhooks with event_object "filter", which Pipedrive rejects as
// "Event object unsupported" — so this only ever runs on-demand, triggered from Deals > Configure).
//
// Pipedrive's filter conditions reference fields by a numeric `field_id`, resolved here against
// /v1/dealFields' id -> key mapping. Only a small, confirmed set of system fields translates to a
// real crm_deals column (see SYSTEM_FIELD_KEY_MAP) — anything else (Pipeline, Owner, Organization,
// Contact person, activities, products, ...) is a relationship/object-shaped field this app has no
// equivalent column for, so it's left unsupported rather than guessed at, same philosophy as
// savedFilterSql.ts's own documented limitations. A custom field (40-char hex key) is only usable
// if it's already mirrored in crm_field_definitions.
import type { getDb } from './db.js'
import { crmStages, crmPipelines, crmFieldDefinitions } from '../../../db/schema.js'
import type { SavedFilterNode, SavedFilterOperator } from './savedFilterSql.js'

export interface RawPipedriveFilterNode {
  glue?: 'and' | 'or'
  conditions?: RawPipedriveFilterNode[]
  object?: string
  field_id?: string | number
  operator?: string
  extra_value?: string | null
  value?: string | string[] | null
  json_value_flag?: boolean
}

const OPERATOR_MAP: Record<string, SavedFilterOperator> = {
  '=': 'eq',
  '<>': 'neq',
  '!=': 'neq',
  '<': 'lt',
  '<=': 'lte',
  '>': 'gt',
  '>=': 'gte',
  'IS NULL': 'is_null',
  'IS NOT NULL': 'is_not_null',
  LIKE: 'contains',
  IN: 'in',
  'NOT IN': 'not_in',
}

// Pipedrive's own dealFields `key` -> savedFilterSql.ts's SYSTEM_COLUMNS key. Confirmed against
// real filters in this account (field ids 12464/12462/12551/12557/etc. resolved via /v1/dealFields).
const SYSTEM_FIELD_KEY_MAP: Record<string, string> = {
  status: 'status',
  stage_id: 'stageId',
  pipeline: 'pipelineId',
  value: 'value',
  title: 'title',
  currency: 'currency',
  lost_reason: 'lostReason',
  add_time: 'createdAt',
  won_time: 'wonAt',
  lost_time: 'lostAt',
  update_time: 'pipedriveUpdateTime',
  next_activity_date: 'nextActivityDate',
  activities_count: 'activitiesCount',
  stage_change_time: 'stageChangeTime',
  expected_close_date: 'expectedCloseDate',
}

// System fields whose Pipedrive filter value is a *numeric Pipedrive id* that needs resolving to
// our own local uuid before it means anything as a real column comparison — same idea for both,
// just against different lookup tables.
const ID_RESOLVING_SYSTEM_FIELDS: Record<string, keyof Pick<TranslateContext, 'stagePipedriveIdToLocalId' | 'pipelinePipedriveIdToLocalId'>> = {
  stageId: 'stagePipedriveIdToLocalId',
  pipelineId: 'pipelinePipedriveIdToLocalId',
}

export class UnsupportedFilterError extends Error {}

// Pipedrive's deal status includes "deleted" (and others); crm_deals.status is a Postgres enum
// with only these three values — comparing it to anything else at query time would make Postgres
// reject the whole query outright ("invalid input value for enum crm_deal_status"), not just
// silently not-match. A real filter in this account ("Deals in Quote Pipeline from Jan 2025") does
// exactly this: open AND != lost AND != won AND != deleted. Since no row here can ever equal a
// status outside this set, a not-equal/not-in check against one is vacuously true and safe to
// prune; an equals/in check against one can never be true, which isn't safely representable as a
// no-op condition, so that stays unsupported instead of guessed at.
const KNOWN_STATUS_VALUES = new Set(['open', 'won', 'lost'])

interface StatusLeafResult {
  omit: boolean
  value: string | string[] | null
}

function normalizeStatusLeaf(operator: SavedFilterOperator, value: string | string[] | null): StatusLeafResult {
  if (operator === 'neq' && typeof value === 'string' && !KNOWN_STATUS_VALUES.has(value)) return { omit: true, value: null }
  if (operator === 'not_in' && Array.isArray(value)) {
    const known = value.filter((v) => KNOWN_STATUS_VALUES.has(v))
    return known.length === 0 ? { omit: true, value: null } : { omit: false, value: known }
  }
  if (operator === 'eq' && typeof value === 'string' && !KNOWN_STATUS_VALUES.has(value)) {
    throw new UnsupportedFilterError(`compares Status to "${value}", which this app doesn't track`)
  }
  if (operator === 'in' && Array.isArray(value)) {
    const known = value.filter((v) => KNOWN_STATUS_VALUES.has(v))
    if (known.length === 0) throw new UnsupportedFilterError("compares Status to values this app doesn't track")
    return { omit: false, value: known }
  }
  return { omit: false, value }
}

interface TranslateContext {
  fieldIdToKey: Map<string, { key: string; name: string }>
  stagePipedriveIdToLocalId: Map<number, string>
  pipelinePipedriveIdToLocalId: Map<number, string>
  localCustomFieldKeys: Set<string>
}

export async function buildTranslateContext(
  db: ReturnType<typeof getDb>,
  fieldIdToKey: Map<string, { key: string; name: string }>,
): Promise<TranslateContext> {
  const [stageRows, pipelineRows, fieldDefRows] = await Promise.all([
    db.select({ id: crmStages.id, pipedriveStageId: crmStages.pipedriveStageId }).from(crmStages),
    db.select({ id: crmPipelines.id, pipedrivePipelineId: crmPipelines.pipedrivePipelineId }).from(crmPipelines),
    db.select({ key: crmFieldDefinitions.key }).from(crmFieldDefinitions),
  ])
  return {
    fieldIdToKey,
    stagePipedriveIdToLocalId: new Map(
      stageRows.filter((s): s is typeof s & { pipedriveStageId: number } => s.pipedriveStageId != null).map((s) => [s.pipedriveStageId, s.id]),
    ),
    pipelinePipedriveIdToLocalId: new Map(
      pipelineRows
        .filter((p): p is typeof p & { pipedrivePipelineId: number } => p.pipedrivePipelineId != null)
        .map((p) => [p.pipedrivePipelineId, p.id]),
    ),
    localCustomFieldKeys: new Set(fieldDefRows.map((f) => f.key)),
  }
}

function translateLeaf(leaf: RawPipedriveFilterNode, ctx: TranslateContext): SavedFilterNode | null {
  const fieldId = leaf.field_id != null ? String(leaf.field_id) : undefined
  if (!fieldId) throw new UnsupportedFilterError('a condition is missing its field')
  const fieldMeta = ctx.fieldIdToKey.get(fieldId)
  if (!fieldMeta) throw new UnsupportedFilterError(`references an unknown Pipedrive field (id ${fieldId})`)

  const rawOperator = leaf.operator ?? '='
  const isArrayValue = !!leaf.json_value_flag && Array.isArray(leaf.value)
  let operator = OPERATOR_MAP[rawOperator]
  if (!operator) throw new UnsupportedFilterError(`uses an unsupported operator ("${rawOperator}") on "${fieldMeta.name}"`)
  if (isArrayValue) operator = operator === 'eq' ? 'in' : operator === 'neq' ? 'not_in' : operator

  const systemKey = SYSTEM_FIELD_KEY_MAP[fieldMeta.key]
  if (systemKey) {
    let value = leaf.value ?? null
    const idMapKey = ID_RESOLVING_SYSTEM_FIELDS[systemKey]
    if (idMapKey && typeof value === 'string') {
      const localId = ctx[idMapKey].get(Number(value))
      if (!localId) throw new UnsupportedFilterError(`references a Pipedrive ${fieldMeta.name} (id ${value}) that isn't mirrored locally yet`)
      value = localId
    }
    if (systemKey === 'status') {
      const normalized = normalizeStatusLeaf(operator, value)
      if (normalized.omit) return null
      value = normalized.value
    }
    return { field: systemKey, isCustom: false, operator, value }
  }

  // A real Pipedrive custom field key is always a 40-char hex hash; a locally-added one is always
  // "local_"-prefixed (see CrmFieldDefinition.key's own doc comment). Anything else that reaches
  // here is a bare Pipedrive *system* field key (e.g. "user_id", "org_id", "pipeline") this
  // translator doesn't have a real column for — even if it happens to also exist as a row in
  // crm_field_definitions (seeding cruft), treating it as a custom field would silently compare
  // against the wrong data (crm_deals.fields never stores these system keys the way it does real
  // custom fields), so it must stay unsupported rather than translate to something plausible-but-wrong.
  const isRealCustomFieldKey = /^[0-9a-f]{40}$/i.test(fieldMeta.key) || fieldMeta.key.startsWith('local_')
  if (isRealCustomFieldKey && ctx.localCustomFieldKeys.has(fieldMeta.key)) {
    return { field: fieldMeta.key, isCustom: true, operator, value: leaf.value ?? null }
  }

  throw new UnsupportedFilterError(`references Pipedrive field "${fieldMeta.name}", which isn't mirrored locally`)
}

function translateNode(node: RawPipedriveFilterNode, ctx: TranslateContext): SavedFilterNode {
  if (node.conditions) {
    return {
      glue: node.glue === 'or' ? 'or' : 'and',
      conditions: node.conditions.map((c) => translateNode(c, ctx)),
    }
  }
  // A pruned leaf (vacuously true — see normalizeStatusLeaf) becomes an empty group, which
  // buildSavedFilterSql already treats as "no constraint" and drops from its parent, same as it
  // does for Pipedrive's own genuinely-empty "or" groups.
  return translateLeaf(node, ctx) ?? { glue: 'and', conditions: [] }
}

export interface TranslateResult {
  supported: boolean
  conditions: SavedFilterNode
  reason: string | null
}

export function translatePipedriveFilter(raw: RawPipedriveFilterNode, ctx: TranslateContext): TranslateResult {
  try {
    return { supported: true, conditions: translateNode(raw, ctx), reason: null }
  } catch (err) {
    return {
      supported: false,
      conditions: { glue: 'and', conditions: [] },
      reason: err instanceof UnsupportedFilterError ? err.message : 'Could not translate this filter',
    }
  }
}
