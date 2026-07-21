// Pulls every deal from the whole Jobs Pipeline (all stages — Quoting through Admin/Done, whatever
// exists) and upserts them into public.jobs — read-only against Pipedrive, per the locked spec ("No
// write-back to Pipedrive, ever"). Uses the CALLING USER's own JWT (not a service-role key) so the
// existing clients_write_office / jobs_write_office RLS policies are what actually gate who can run
// a sync — consistent with every other write path in this app.
//
// Previously this only queried 3 hardcoded stage ids (Ready to Schedule/Booked/In Progress), so any
// deal that moved to a later stage (Admin, Done, ...) or that was won while still in an earlier
// stage (Quoting) was never fetched at all — not "lost", just never pulled in, with no way for a
// user to add it by hand either.
//
// First attempt at the fix used GET /v1/pipelines/{id}/deals to fetch the whole pipeline in one
// call — verified against the real account and it came back empty (that endpoint doesn't return
// won deals the way the plain deals list does). Reverted to the proven-working per-stage
// GET /v1/deals?stage_id=X&status=won call, but the stage id LIST is now fetched dynamically from
// GET /v1/stages?pipeline_id=3 instead of a hardcoded array — so every stage that exists in the
// pipeline right now is covered automatically, including ones added later, without depending on an
// endpoint that turned out not to behave as expected.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const JOBS_PIPELINE_ID = 3

const FIELD_TARGET_HOURS = 'ad1cfb10c0818b49d646c93cfcb44b8dfa31a911'
const FIELD_CATEGORY = '27b0830b634b7730cc4cc6680db2ac2c7391ee77'
const FIELD_ADDRESS = '38ad82cad541cf48ddfec84ba30f5f0fa521737e'

// Pipedrive "Category Type" option ids -> our job_category enum. Options without a clean
// equivalent (QPaint, Work Projects, Other) fall back to Commercial rather than failing the sync.
const CATEGORY_OPTION_MAP: Record<string, string> = {
  '65': 'Corporate',
  '69': 'Residential',
  '71': 'Government',
  '73': 'Commercial',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function fetchPipelineStageIds(pipelineId: number, token: string): Promise<number[]> {
  const url = `https://api.pipedrive.com/v1/stages?pipeline_id=${pipelineId}&api_token=${token}`
  const res = await fetch(url)
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? `Pipedrive API error fetching stages for pipeline ${pipelineId}`)
  return (json.data ?? []).map((s: any) => s.id)
}

async function fetchStageDeals(stageId: number, token: string) {
  const deals: any[] = []
  let start = 0
  while (true) {
    // Deals in this Jobs Pipeline are marked "won" at deal acceptance and then move through
    // stages afterward for job tracking — "open" excludes them entirely. "lost" deals sitting in
    // an active stage are treated as stale/abandoned cards, not real jobs, so they're excluded too.
    const url = `https://api.pipedrive.com/v1/deals?stage_id=${stageId}&status=won&start=${start}&limit=100&api_token=${token}`
    const res = await fetch(url)
    const json = await res.json()
    if (!json.success) throw new Error(json.error ?? `Pipedrive API error fetching stage ${stageId}`)
    deals.push(...(json.data ?? []))
    if (!json.additional_data?.pagination?.more_items_in_collection) break
    start = json.additional_data.pagination.next_start
  }
  return deals
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const pipedriveToken = Deno.env.get('PIPEDRIVE_API_TOKEN')
    if (!pipedriveToken) throw new Error('PIPEDRIVE_API_TOKEN secret is not set on this Edge Function')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const stageIds = await fetchPipelineStageIds(JOBS_PIPELINE_ID, pipedriveToken)
    const dealLists = await Promise.all(stageIds.map((id) => fetchStageDeals(id, pipedriveToken)))
    const deals = dealLists.flat()

    let synced = 0
    let skipped = 0
    const errors: string[] = []

    for (const deal of deals) {
      try {
        const targetHours = deal[FIELD_TARGET_HOURS]
        if (targetHours === null || targetHours === undefined) {
          skipped++
          continue
        }

        const clientName: string = deal.org_name || deal.person_name || 'Unknown client'
        const { data: existingClient } = await supabase
          .from('clients')
          .select('id')
          .eq('name', clientName)
          .maybeSingle()

        let clientId = existingClient?.id
        if (!clientId) {
          const { data: newClient, error: clientError } = await supabase
            .from('clients')
            .insert({ name: clientName, type: deal.org_name ? 'Company' : 'Individual', contact_info: '' })
            .select('id')
            .single()
          if (clientError) throw clientError
          clientId = newClient.id
        }

        const categoryOptionId = String(deal[FIELD_CATEGORY] ?? '')
        const category = CATEGORY_OPTION_MAP[categoryOptionId] ?? 'Commercial'
        const address: string = deal[`${FIELD_ADDRESS}_formatted_address`] || deal[FIELD_ADDRESS] || ''
        const dateWon: string = (deal.won_time || deal.add_time || new Date().toISOString()).slice(0, 10)

        const { error: upsertError } = await supabase.from('jobs').upsert(
          {
            pipedrive_deal_id: String(deal.id),
            client_id: clientId,
            address,
            category,
            total_value: deal.value ?? 0,
            target_hours: targetHours,
            date_won: dateWon,
            pipedrive_stage_id: deal.stage_id,
            pipedrive_deal_title: deal.title ?? null,
          },
          { onConflict: 'pipedrive_deal_id' },
        )
        if (upsertError) throw upsertError
        synced++
      } catch (e) {
        errors.push(`Deal ${deal.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return new Response(JSON.stringify({ synced, skipped, errors, totalFetched: deals.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
