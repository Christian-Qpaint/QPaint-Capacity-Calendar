// Port of supabase/functions/marketing-pipedrive-deals — fetches every deal across all of
// Pipedrive (not scoped to one pipeline/stage, unlike the Jobs-only sync) and shapes each into the
// same fields the CSV import produces, so the Marketing dashboard's calculations work unchanged
// regardless of where a deal came from. Read-only against Pipedrive and never touches our own
// database — the client decides which rows to import via the existing marketing-deals upsert path.
//
// Referral Source and "Quote Sent" are custom fields whose Pipedrive-assigned key (an opaque hash)
// is account-specific, so they're resolved by NAME at request time via /v1/dealFields rather than
// hardcoded — if a field can't be found by name, the response still succeeds with a warning
// instead of failing the whole pull.
import { requireMarketingImport, withErrorHandling, HttpError } from '../_shared/authz.js'

interface DealField {
  key: string
  name: string
  options?: { id: number | string; label: string }[]
}

function findFieldByName(fields: DealField[], ...keywords: string[]): DealField | null {
  return fields.find((f) => keywords.some((k) => f.name.toLowerCase().includes(k))) ?? null
}

function resolveCustomValue(deal: Record<string, unknown>, field: DealField | null): string | null {
  if (!field) return null
  const raw = deal[field.key]
  if (raw === null || raw === undefined || raw === '') return null
  if (field.options) {
    const opt = field.options.find((o) => String(o.id) === String(raw))
    return opt?.label ?? String(raw)
  }
  return String(raw)
}

interface PipedriveResponse {
  success: boolean
  error?: string
  data?: unknown
  additional_data?: { pagination?: { more_items_in_collection?: boolean; next_start?: number } }
}

async function fetchJson(url: string): Promise<PipedriveResponse> {
  const res = await fetch(url)
  const json = (await res.json()) as PipedriveResponse
  if (!json.success) throw new Error(json.error ?? `Pipedrive API error calling ${url.split('?')[0]}`)
  return json
}

export default withErrorHandling(async (req: Request) => {
  await requireMarketingImport(req)

  const pipedriveToken = process.env.PIPEDRIVE_API_TOKEN
  if (!pipedriveToken) throw new HttpError(500, 'PIPEDRIVE_API_TOKEN is not set on this Function')

  const warnings: string[] = []

  const fieldsJson = await fetchJson(`https://api.pipedrive.com/v1/dealFields?api_token=${pipedriveToken}`)
  const fields = (fieldsJson.data as DealField[] | undefined) ?? []
  const referralSourceField = findFieldByName(fields, 'referral source')
  const quoteSentField = findFieldByName(fields, 'quote sent')
  if (!referralSourceField) {
    warnings.push('Could not find a "Referral Source" field in Pipedrive — every deal will be labeled "Other".')
  }
  if (!quoteSentField) {
    warnings.push('Could not find a "Quote Sent" date field in Pipedrive — Quoted will only be inferred from Won deals.')
  }

  const pipelinesJson = await fetchJson(`https://api.pipedrive.com/v1/pipelines?api_token=${pipedriveToken}`)
  const pipelines = (pipelinesJson.data as { id: number; name: string }[] | undefined) ?? []
  const pipelineNames = new Map<number, string>(pipelines.map((p) => [p.id, p.name]))

  const deals: Record<string, unknown>[] = []
  let start = 0
  for (;;) {
    const json = await fetchJson(`https://api.pipedrive.com/v1/deals?start=${start}&limit=500&api_token=${pipedriveToken}`)
    deals.push(...((json.data as Record<string, unknown>[] | undefined) ?? []))
    if (!json.additional_data?.pagination?.more_items_in_collection) break
    start = json.additional_data.pagination.next_start
    if (start > 20000) break // sanity backstop against a runaway loop
  }

  const rows = deals
    .map((deal) => {
      const isWon = deal.status === 'won'
      const quotedRaw = resolveCustomValue(deal, quoteSentField)
      const createdDate = String(deal.add_time ?? '').slice(0, 10)
      const wonDate = String(deal.won_time ?? '').slice(0, 10)
      const owner = deal.user_id as { name?: string } | undefined
      return {
        externalId: String(deal.id),
        title: deal.title ?? null,
        referralSource: resolveCustomValue(deal, referralSourceField) || 'Other',
        salesperson: deal.owner_name ?? owner?.name ?? null,
        rawStage: deal.status ?? null,
        isQuoted: isWon || !!quotedRaw,
        isWon,
        value: deal.value ?? 0,
        createdDate: createdDate || null,
        eventDate: isWon ? wonDate || createdDate || null : null,
        pipeline: pipelineNames.get(deal.pipeline_id as number) ?? null,
        lostReason: deal.lost_reason ?? null,
        expectedCloseDate: deal.expected_close_date ?? null,
      }
    })
    // Same "no created date, can't place it on any date-scoped chart/filter" rule as CSV import.
    .filter((r) => r.createdDate)

  return Response.json({ deals: rows, warnings, totalFetched: deals.length })
})

export const config = {
  path: '/api/marketing-pipedrive-deals',
}
