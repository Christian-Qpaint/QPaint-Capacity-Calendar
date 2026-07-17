// Pulls deals from the three requested Jobs Pipeline stages (Ready to Schedule, Booked, In
// Progress) and upserts them into public.jobs — read-only against Pipedrive, per the locked spec
// ("No write-back to Pipedrive, ever"). Uses the CALLING USER's own JWT (not a service-role key) so
// the existing clients_write_office / jobs_write_office RLS policies are what actually gate who can
// run a sync — consistent with every other write path in this app.
//
// Known limitation: this only ever queries these 3 stages. If a deal moves to a later stage
// (e.g. "5. Completed"), re-running sync won't see it move and its last-synced pipedrive_stage_id
// stays put — it will keep appearing on the Jobs List until a broader full-pipeline poll or a
// Pipedrive webhook is added. Flagged here rather than silently assumed solved.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TARGET_STAGE_IDS = [26, 27, 28] // 2. Ready to Schedule, 3. Booked, 4. In Progress

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

    const dealLists = await Promise.all(TARGET_STAGE_IDS.map((id) => fetchStageDeals(id, pipedriveToken)))
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
