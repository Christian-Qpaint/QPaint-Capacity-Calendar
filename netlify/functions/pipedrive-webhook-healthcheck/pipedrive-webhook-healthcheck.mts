// Scheduled (hourly) self-healing check for the 6 Pipedrive webhook subscriptions this app
// depends on for real-time sync. Confirmed via forwarded Pipedrive emails (Aug 7-26, then again
// Sep 16 for crm-deal-updated) that these silently die: Pipedrive auto-deletes a webhook after 3
// consecutive days with zero successful deliveries (its own documented policy — 10s response
// timeout, 3 retries, delete after 3 days dark:
// https://devcommunity.pipedrive.com/t/webhooks-policy/4309), and the trigger both times was a
// PIPEDRIVE_WEBHOOK_USER/PASS mismatch — each subscription's Basic Auth credentials are captured
// once, at registration time, not read live, so a credential change (or, confirmed the second
// time, this function re-registering one with whatever the env vars were at that moment) can
// leave a webhook silently 401ing forever without ever going "missing".
//
// That second case is exactly why this used to be a real gap: the original version of this check
// only looked for a webhook that didn't exist at all — an existing one stuck 401ing on every
// delivery still counts as "present" by event_action+subscription_url, so it was never touched
// until Pipedrive's own 3-day policy finally deleted it (which is the exact email this function
// exists to make unnecessary). Now also treats any live webhook that's actually been tried and
// keeps getting an auth-shaped failure (401/403) as broken — deletes it and re-registers a fresh
// one with the current credentials, the same as it already does for a genuinely missing one.
import { getDb } from '../_shared/db.js'
import { notifyOwners } from '../_shared/notifyOwners.js'

const APP_ORIGIN = 'https://qpaintos.com.au'

interface ExpectedWebhook {
  event_action: 'create' | 'change' | 'delete'
  event_object: 'deal'
  subscription_url: string
  label: string
}

// The complete, intended set — see crm-deal-created.mts/crm-deal-updated.mts/crm-job-updated.mts
// for what each endpoint actually does once a delivery arrives.
const EXPECTED_WEBHOOKS: ExpectedWebhook[] = [
  { event_action: 'create', event_object: 'deal', subscription_url: `${APP_ORIGIN}/api/crm-deal-created`, label: 'Deal created (Sales/BizDev)' },
  { event_action: 'change', event_object: 'deal', subscription_url: `${APP_ORIGIN}/api/crm-deal-updated`, label: 'Deal changed (Sales/BizDev)' },
  { event_action: 'delete', event_object: 'deal', subscription_url: `${APP_ORIGIN}/api/crm-deal-updated`, label: 'Deal deleted (Sales/BizDev)' },
  { event_action: 'create', event_object: 'deal', subscription_url: `${APP_ORIGIN}/api/crm-job-updated`, label: 'Deal created (Jobs Pipeline)' },
  { event_action: 'change', event_object: 'deal', subscription_url: `${APP_ORIGIN}/api/crm-job-updated`, label: 'Deal changed (Jobs Pipeline)' },
  { event_action: 'delete', event_object: 'deal', subscription_url: `${APP_ORIGIN}/api/crm-job-updated`, label: 'Deal deleted (Jobs Pipeline)' },
]

// Auth-shaped failure codes — treated as "this webhook's credentials no longer match ours", not
// as a transient server hiccup (a 5xx, or a 4xx unrelated to auth, isn't grounds to delete and
// re-register something that might just be having a bad moment).
const AUTH_FAILURE_STATUSES = new Set(['401', '403'])

interface PipedriveWebhook {
  id: number
  event_action: string
  event_object: string
  subscription_url: string
  is_active: 0 | 1
  remove_time: string | null
  last_delivery_time: string | null
  last_http_status: string | null
}

async function registerWebhook(token: string, webhookUser: string, webhookPass: string, hook: ExpectedWebhook): Promise<boolean> {
  const res = await fetch(`https://api.pipedrive.com/v1/webhooks?api_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription_url: hook.subscription_url,
      event_action: hook.event_action,
      event_object: hook.event_object,
      http_auth_user: webhookUser,
      http_auth_pass: webhookPass,
    }),
  })
  const json = (await res.json()) as { success?: boolean; error?: string }
  return !!json.success
}

export default async (): Promise<Response> => {
  const db = getDb()
  const token = process.env.PIPEDRIVE_API_TOKEN
  const webhookUser = process.env.PIPEDRIVE_WEBHOOK_USER
  const webhookPass = process.env.PIPEDRIVE_WEBHOOK_PASS
  if (!token || !webhookUser || !webhookPass) {
    console.error('pipedrive-webhook-healthcheck: missing PIPEDRIVE_API_TOKEN/PIPEDRIVE_WEBHOOK_USER/PIPEDRIVE_WEBHOOK_PASS')
    return Response.json({ ok: false, reason: 'missing env vars' })
  }

  try {
    const listRes = await fetch(`https://api.pipedrive.com/v1/webhooks?api_token=${token}`)
    const listJson = (await listRes.json()) as { success?: boolean; error?: string; data?: PipedriveWebhook[] }
    if (!listJson.success) throw new Error(listJson.error ?? 'Pipedrive webhooks list failed')

    const live = (listJson.data ?? []).filter((h) => h.is_active === 1 && !h.remove_time)
    const findLive = (exp: ExpectedWebhook) => live.find((h) => h.event_action === exp.event_action && h.subscription_url === exp.subscription_url)

    const missing = EXPECTED_WEBHOOKS.filter((exp) => !findLive(exp))
    // "Broken" = exists, has actually been attempted at least once (so a brand-new webhook that
    // hasn't had its first delivery try yet is never mistaken for one that's failing), and its
    // most recent attempt came back with an auth-shaped status.
    const broken = EXPECTED_WEBHOOKS.filter((exp) => {
      const hook = findLive(exp)
      return !!hook?.last_delivery_time && AUTH_FAILURE_STATUSES.has(String(hook.last_http_status))
    })

    if (missing.length === 0 && broken.length === 0) return Response.json({ ok: true, missing: 0, broken: 0 })

    const brokenDeleteFailed: string[] = []
    for (const hook of broken) {
      const hookRow = findLive(hook)
      if (!hookRow) continue
      const delRes = await fetch(`https://api.pipedrive.com/v1/webhooks/${hookRow.id}?api_token=${token}`, { method: 'DELETE' })
      const delJson = (await delRes.json()) as { success?: boolean }
      if (!delJson.success) brokenDeleteFailed.push(hook.label)
    }

    const toRegister = [...missing, ...broken.filter((hook) => !brokenDeleteFailed.includes(hook.label))]
    const restored: string[] = []
    const failed: string[] = [...brokenDeleteFailed.map((label) => `${label} (couldn't delete the broken one first)`)]
    for (const hook of toRegister) {
      const success = await registerWebhook(token, webhookUser, webhookPass, hook)
      if (success) restored.push(hook.label)
      else failed.push(hook.label)
    }

    await notifyOwners(db, {
      type: 'pipedrive_webhook_repair',
      title: failed.length > 0 ? 'Pipedrive sync webhooks need attention' : 'Pipedrive sync webhooks auto-repaired',
      body: [
        missing.length > 0 ? `Re-registered missing: ${missing.map((h) => h.label).join(', ')}.` : null,
        broken.length > 0 ? `Replaced failing (401/403): ${broken.map((h) => h.label).join(', ')}.` : null,
        failed.length > 0 ? `Failed to fix: ${failed.join(', ')} — check PIPEDRIVE_API_TOKEN/PIPEDRIVE_WEBHOOK_USER/PASS.` : null,
      ]
        .filter(Boolean)
        .join(' '),
    })

    return Response.json({ ok: failed.length === 0, restored, failed })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('pipedrive-webhook-healthcheck failed:', message)
    await notifyOwners(db, {
      type: 'pipedrive_webhook_repair',
      title: 'Pipedrive webhook health check failed to run',
      body: message,
    })
    return Response.json({ ok: false, error: message })
  }
}

export const config = {
  schedule: '15 * * * *',
}
