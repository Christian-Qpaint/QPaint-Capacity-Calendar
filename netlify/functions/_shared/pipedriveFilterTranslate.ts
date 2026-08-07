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
import { crmStages, crmFieldDefinitions } from '../../../db/schema.js'
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
  value: 'value',
  title: 'title',
  currency: 'currency',
  lost_reason: 'lostReason',
  add_time: 'createdAt',
  won_time: 'wonAt',
  lost_time: 'lostAt',
}

export class UnsupportedFilterError extends Error {}

interface TranslateContext {
  fieldIdToKey: Map<string, { key: string; name: string }>
  stagePipedriveIdToLocalId: Map<number, string>
  localCustomFieldKeys: Set<string>
}

export async function buildTranslateContext(
  db: ReturnType<typeof getDb>,
  fieldIdToKey: Map<string, { key: string; name: string }>,
): Promise<TranslateContext> {
  const [stageRows, fieldDefRows] = await Promise.all([
    db.select({ id: crmStages.id, pipedriveStageId: crmStages.pipedriveStageId }).from(crmStages),
    db.select({ key: crmFieldDefinitions.key }).from(crmFieldDefinitions),
  ])
  return {
    fieldIdToKey,
    stagePipedriveIdToLocalId: new Map(
      stageRows.filter((s): s is typeof s & { pipedriveStageId: number } => s.pipedriveStageId != null).map((s) => [s.pipedriveStageId, s.id]),
    ),
    localCustomFieldKeys: new Set(fieldDefRows.map((f) => f.key)),
  }
}

function translateLeaf(leaf: RawPipedriveFilterNode, ctx: TranslateContext): SavedFilterNode {
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
    if (systemKey === 'stageId' && typeof value === 'string') {
      const localId = ctx.stagePipedriveIdToLocalId.get(Number(value))
      if (!localId) throw new UnsupportedFilterError(`references a Pipedrive stage (id ${value}) that isn't mirrored locally yet`)
      value = localId
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
  return translateLeaf(node, ctx)
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
