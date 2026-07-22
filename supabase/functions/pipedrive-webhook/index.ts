// Real-time replacement for the old pipedrive-sync "always re-fetch and overwrite" model.
// Pipedrive calls this endpoint the moment a deal is added or changes — for any deal event, if we
// don't already have a job for that pipedrive_deal_id, we copy it in ONCE. If we already have one,
// we leave it completely alone: no field on an existing job is ever touched by this function again.
// That's the whole point — once a deal is copied in, our copy is independent of Pipedrive from then
// on, so manual edits/production tracking here can never be silently overwritten by a later sync.
//
// pipedrive-sync (the old "Sync from Pipedrive" button) is left in the repo, shelved rather than
// deleted, in case this needs to be reverted — but the button itself has been removed from the UI
// since its upsert-every-field behavior is exactly what this replaces.
//
// No calling-user JWT exists here (Pipedrive is the caller, not a logged-in user), so this uses the
// service-role key — Supabase injects SUPABASE_SERVICE_ROLE_KEY into every Edge Function
// automatically, no extra secret needed for that part. Auth on this endpoint instead comes from HTTP
// Basic Auth (PIPEDRIVE_WEBHOOK_USER / PIPEDRIVE_WEBHOOK_PASS secrets) — Pipedrive's classic webhook
// setup lets you attach Basic Auth credentials to a webhook subscription, and matching them here is
// the only thing stopping a random request to this public URL from creating jobs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FIELD_TARGET_HOURS = 'ad1cfb10c0818b49d646c93cfcb44b8dfa31a911'
const FIELD_CATEGORY = '27b0830b634b7730cc4cc6680db2ac2c7391ee77'
const FIELD_ADDRESS = '38ad82cad541cf48ddfec84ba30f5f0fa521737e'

// Pipedrive "Category Type" option ids -> our job_category enum. Options without a clean
// equivalent (QPaint, Work Projects, Other) fall back to Commercial rather than failing the import.
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

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function isAuthorized(req: Request): boolean {
  const user = Deno.env.get('PIPEDRIVE_WEBHOOK_USER')
  const pass = Deno.env.get('PIPEDRIVE_WEBHOOK_PASS')
  if (!user || !pass) {
    console.error('pipedrive-webhook: PIPEDRIVE_WEBHOOK_USER/PIPEDRIVE_WEBHOOK_PASS secret is not set on this function')
    return false
  }
  const header = req.headers.get('Authorization') ?? ''
  if (!header.startsWith('Basic ')) {
    console.error(`pipedrive-webhook: no Basic auth header on incoming request (got: ${header ? 'a different auth scheme' : 'no Authorization header at all'})`)
    return false
  }
  const decoded = atob(header.slice('Basic '.length))
  const match = decoded === `${user}:${pass}`
  if (!match) console.error('pipedrive-webhook: Basic auth credentials on the request do not match the configured secret')
  return match
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => null)
    // Tolerant of both the classic v1 webhook shape ({ current, previous, event }) and the newer
    // v2 shape ({ meta, data, previous }) — whichever this Pipedrive account ends up sending.
    const deal = body?.data ?? body?.current ?? null
    if (!deal?.id) {
      return ok({ imported: false, reason: 'No deal payload in request — ignored, not an error' })
    }

    if (deal.status !== 'won') {
      return ok({ imported: false, dealId: deal.id, reason: `status is "${deal.status}", not "won"` })
    }

    const targetHours = deal[FIELD_TARGET_HOURS]
    if (targetHours === null || targetHours === undefined) {
      return ok({ imported: false, dealId: deal.id, reason: 'No Target Hours custom field set on this deal yet' })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: existingJob } = await supabase
      .from('jobs')
      .select('id')
      .eq('pipedrive_deal_id', String(deal.id))
      .maybeSingle()
    if (existingJob) {
      return ok({ imported: false, dealId: deal.id, reason: 'Already copied in previously — left untouched' })
    }

    const clientName: string = deal.org_name || deal.person_name || 'Unknown client'
    const { data: existingClient } = await supabase.from('clients').select('id').eq('name', clientName).maybeSingle()

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

    const { data: created, error: insertError } = await supabase
      .from('jobs')
      .insert({
        pipedrive_deal_id: String(deal.id),
        client_id: clientId,
        address,
        category,
        total_value: deal.value ?? 0,
        target_hours: targetHours,
        date_won: dateWon,
        pipedrive_stage_id: deal.stage_id,
        pipedrive_deal_title: deal.title ?? null,
      })
      .select('id')
      .single()
    if (insertError) throw insertError

    return ok({ imported: true, dealId: deal.id, jobId: created.id })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
