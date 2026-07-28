// Port of supabase/functions/pipedrive-webhook. Pipedrive calls this the moment a deal is added or
// changes — for any deal event, if we don't already have a job for that pipedrive_deal_id, we copy
// it in ONCE. If we already have one, we leave it completely alone: no field on an existing job is
// ever touched by this function again — once a deal is copied in, our copy is independent of
// Pipedrive from then on, so manual edits/production tracking here can never be silently
// overwritten by a later sync.
//
// No calling-user session exists here (Pipedrive is the caller, not a logged-in user) — auth comes
// entirely from HTTP Basic Auth (PIPEDRIVE_WEBHOOK_USER/PIPEDRIVE_WEBHOOK_PASS secrets), matching
// Pipedrive's classic webhook subscription setup. There's no RLS/service-role distinction to
// replicate here either — getDb() always has full table access; the Basic Auth check is the entire
// security boundary, same as it was in the old Supabase version.
import { eq } from 'drizzle-orm'
import { getDb } from '../_shared/db.js'
import { clients, jobs } from '../../../db/schema.js'

const FIELD_TARGET_HOURS = 'ad1cfb10c0818b49d646c93cfcb44b8dfa31a911'
const FIELD_CATEGORY = '27b0830b634b7730cc4cc6680db2ac2c7391ee77'
const FIELD_ADDRESS = '38ad82cad541cf48ddfec84ba30f5f0fa521737e'

const CATEGORY_OPTION_MAP: Record<string, 'Corporate' | 'Residential' | 'Government' | 'Commercial' | 'QPaint' | 'Work Projects' | 'Other'> = {
  '65': 'Corporate',
  '69': 'Residential',
  '70': 'QPaint',
  '71': 'Government',
  '73': 'Commercial',
  '1099': 'Work Projects',
  '1032': 'Other',
}

function isAuthorized(req: Request): boolean {
  const user = process.env.PIPEDRIVE_WEBHOOK_USER
  const pass = process.env.PIPEDRIVE_WEBHOOK_PASS
  if (!user || !pass) {
    console.error('pipedrive-webhook: PIPEDRIVE_WEBHOOK_USER/PIPEDRIVE_WEBHOOK_PASS is not set on this Function')
    return false
  }
  const header = req.headers.get('authorization') ?? ''
  if (!header.startsWith('Basic ')) return false
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf-8')
  return decoded === `${user}:${pass}`
}

export default async (req: Request): Promise<Response> => {
  if (!isAuthorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = (await req.json().catch(() => null)) as
      | { data?: Record<string, unknown>; current?: Record<string, unknown> }
      | null
    const deal = body?.data ?? body?.current ?? null
    if (!deal?.id) return Response.json({ imported: false, reason: 'No deal payload in request — ignored, not an error' })
    if (deal.status !== 'won') return Response.json({ imported: false, dealId: deal.id, reason: `status is "${deal.status}", not "won"` })

    const targetHours = deal[FIELD_TARGET_HOURS] as number | null | undefined
    if (targetHours === null || targetHours === undefined) {
      return Response.json({ imported: false, dealId: deal.id, reason: 'No Target Hours custom field set on this deal yet' })
    }

    const db = getDb()
    const [existingJob] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.pipedriveDealId, String(deal.id))).limit(1)
    if (existingJob) return Response.json({ imported: false, dealId: deal.id, reason: 'Already copied in previously — left untouched' })

    const clientName = (deal.org_name as string | undefined) || (deal.person_name as string | undefined) || 'Unknown client'
    const [existingClient] = await db.select({ id: clients.id }).from(clients).where(eq(clients.name, clientName)).limit(1)

    let clientId = existingClient?.id
    if (!clientId) {
      const [newClient] = await db
        .insert(clients)
        .values({ name: clientName, type: deal.org_name ? 'Company' : 'Individual', contactInfo: '' })
        .returning({ id: clients.id })
      clientId = newClient.id
    }

    const categoryOptionId = String(deal[FIELD_CATEGORY] ?? '')
    const category = CATEGORY_OPTION_MAP[categoryOptionId] ?? 'Commercial'
    const address = (deal[`${FIELD_ADDRESS}_formatted_address`] as string | undefined) || (deal[FIELD_ADDRESS] as string | undefined) || ''
    const dateWon = ((deal.won_time as string | undefined) || (deal.add_time as string | undefined) || new Date().toISOString()).slice(0, 10)

    const [created] = await db
      .insert(jobs)
      .values({
        pipedriveDealId: String(deal.id),
        clientId,
        address,
        category,
        totalValue: (deal.value as number | undefined) ?? 0,
        targetHours,
        dateWon,
        pipedriveStageId: deal.stage_id as number | undefined,
        pipedriveDealTitle: (deal.title as string | undefined) ?? null,
      })
      .returning({ id: jobs.id })

    return Response.json({ imported: true, dealId: deal.id, jobId: created.id })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export const config = {
  path: '/api/pipedrive-webhook',
}
