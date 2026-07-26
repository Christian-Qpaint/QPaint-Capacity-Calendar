// Fetches every deal across all of Pipedrive (not scoped to one pipeline/stage — Marketing needs
// Leads/Quotes/Won across the whole funnel, unlike pipedrive-sync which only pulls Jobs Pipeline
// deals that are already won) and shapes each into the same fields the CSV import produces, so the
// Marketing dashboard's existing calculations work unchanged regardless of where a deal came from.
//
// Read-only against Pipedrive and never touches our own database — the client receives normalized
// rows and decides which ones to import via the existing marketing_deals upsert path, the same one
// CSV import already uses.
//
// Referral Source and "Quote Sent" are custom fields whose Pipedrive-assigned key (an opaque hash)
// is account-specific, so they're resolved by NAME at request time via /v1/dealFields rather than
// hardcoded — if a field can't be found by name (renamed, not set up yet, ...), the response still
// succeeds with a warning instead of failing the whole pull.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DealField {
  key: string
  name: string
  options?: { id: number | string; label: string }[]
}

function findFieldByName(fields: DealField[], ...keywords: string[]): DealField | null {
  return (
    fields.find((f) => {
      const name = f.name.toLowerCase()
      return keywords.some((k) => name.includes(k))
    }) ?? null
  )
}

function resolveCustomValue(deal: any, field: DealField | null): string | null {
  if (!field) return null
  const raw = deal[field.key]
  if (raw === null || raw === undefined || raw === '') return null
  if (field.options) {
    const opt = field.options.find((o) => String(o.id) === String(raw))
    return opt?.label ?? String(raw)
  }
  return String(raw)
}

async function fetchJson(url: string) {
  const res = await fetch(url)
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? `Pipedrive API error calling ${url.split('?')[0]}`)
  return json
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const pipedriveToken = Deno.env.get('PIPEDRIVE_API_TOKEN')
    if (!pipedriveToken) throw new Error('PIPEDRIVE_API_TOKEN secret is not set on this Edge Function')

    // verify_jwt (on by default for this function) already rejects the request before this code
    // runs unless the caller sent a valid Supabase session/anon token — the Owner/Marketing role
    // gate itself is enforced client-side by RequireMarketingAccess. This function only reads from
    // Pipedrive and never touches our database, so there's no write for RLS to apply to here.
    if (!req.headers.get('Authorization')) throw new Error('Missing Authorization header')

    const warnings: string[] = []

    const fieldsJson = await fetchJson(`https://api.pipedrive.com/v1/dealFields?api_token=${pipedriveToken}`)
    const fields: DealField[] = fieldsJson.data ?? []
    const referralSourceField = findFieldByName(fields, 'referral source')
    const quoteSentField = findFieldByName(fields, 'quote sent')
    if (!referralSourceField) {
      warnings.push('Could not find a "Referral Source" field in Pipedrive — every deal will be labeled "Other".')
    }
    if (!quoteSentField) {
      warnings.push('Could not find a "Quote Sent" date field in Pipedrive — Quoted will only be inferred from Won deals.')
    }

    const pipelinesJson = await fetchJson(`https://api.pipedrive.com/v1/pipelines?api_token=${pipedriveToken}`)
    const pipelineNames = new Map<number, string>((pipelinesJson.data ?? []).map((p: any) => [p.id, p.name]))

    const deals: any[] = []
    let start = 0
    while (true) {
      const json = await fetchJson(`https://api.pipedrive.com/v1/deals?start=${start}&limit=500&api_token=${pipedriveToken}`)
      deals.push(...(json.data ?? []))
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
        return {
          externalId: String(deal.id),
          title: deal.title ?? null,
          referralSource: resolveCustomValue(deal, referralSourceField) || 'Other',
          salesperson: deal.owner_name ?? deal.user_id?.name ?? null,
          rawStage: deal.status ?? null,
          isQuoted: isWon || !!quotedRaw,
          isWon,
          value: deal.value ?? 0,
          createdDate: createdDate || null,
          eventDate: isWon ? wonDate || createdDate || null : null,
          pipeline: pipelineNames.get(deal.pipeline_id) ?? null,
          lostReason: deal.lost_reason ?? null,
          expectedCloseDate: deal.expected_close_date ?? null,
        }
      })
      // Same "no created date, can't place it on any date-scoped chart/filter" rule as CSV import.
      .filter((r) => r.createdDate)

    return new Response(JSON.stringify({ deals: rows, warnings, totalFetched: deals.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
