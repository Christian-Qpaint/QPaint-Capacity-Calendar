// Thin wrapper around Pipedrive's v1 REST API, used to re-fetch a deal's full, canonical, flat
// v1-shaped record (title/value/status/stage_id/org_name/person_name + custom fields as flat
// top-level keys) from just a deal id. Both crm-deal-created.mts and crm-deal-updated.mts rely on
// this rather than parsing their incoming webhook body directly — Pipedrive's webhooks are v2
// format (scalar org_id/person_id, custom fields nested under `custom_fields`), a different shape
// than the v1 fields the rest of this codebase (and the original backfill) is written against. The
// webhook body is only ever used to learn a deal id + pipeline id; this call is the actual source
// of truth for everything else.
export interface PipedriveDealPayload {
  id: number
  title?: string | null
  value?: number | null
  currency?: string | null
  status?: string | null
  stage_id?: number | null
  pipeline_id?: number | null
  org_name?: string | null
  person_name?: string | null
  lost_reason?: string | null
  won_time?: string | null
  lost_time?: string | null
  add_time?: string | null
  [key: string]: unknown
}

export async function fetchFullDeal(dealId: number): Promise<PipedriveDealPayload | null> {
  const token = process.env.PIPEDRIVE_API_TOKEN
  if (!token) return null
  const res = await fetch(`https://api.pipedrive.com/v1/deals/${dealId}?api_token=${token}`)
  if (!res.ok) return null
  const json = (await res.json()) as { success?: boolean; data?: PipedriveDealPayload }
  return json.success ? (json.data ?? null) : null
}

interface FieldDefLike {
  key: string
  fieldType: string
}

/** Extracts every crm_field_definitions-keyed value present on a v1-shaped deal payload — shared
 * by crm-deal-created.mts (initial copy-in) and crm-deal-updated.mts (re-sync), so a field once
 * populated in Pipedrive and later cleared there also gets cleared locally (absent from the
 * returned object, matching this codebase's null-means-absent convention). */
export function extractFieldsFromV1Deal(deal: PipedriveDealPayload, fieldDefs: FieldDefLike[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const def of fieldDefs) {
    if (def.fieldType === 'address') {
      const formatted = deal[`${def.key}_formatted_address`] as string | undefined
      const raw = deal[def.key] as string | undefined
      if (formatted || raw) fields[def.key] = formatted ?? raw
      continue
    }
    const raw = deal[def.key]
    if (raw !== null && raw !== undefined && raw !== '') fields[def.key] = raw
  }
  return fields
}
