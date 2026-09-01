// Scheduled (hourly) self-healing check for the 5 Pipedrive webhook subscriptions this app
// depends on for real-time sync. Confirmed via forwarded Pipedrive emails (Aug 7-26) that these
// silently die: Pipedrive auto-deletes a webhook after 3 consecutive days with zero successful
// deliveries (its own documented policy — 10s response timeout, 3 retries, delete after 3 days
// dark: https://devcommunity.pipedrive.com/t/webhooks-policy/4309), and the most likely trigger
// found this session was a PIPEDRIVE_WEBHOOK_USER/PASS rotation that wasn't followed by
// re-registering the webhooks — each subscription's Basic Auth credentials are captured once, at
// registration time, not read live, so a credential change silently orphans every existing hook.
//
// This alone doesn't prevent that from happening again (nothing can stop someone from rotating a
// secret without thinking about webhooks) — but it makes the failure self-correcting within one
// hour instead of a silent multi-week drift only noticed by chance via forwarded vendor emails.
// Re-registering is safe to run even when nothing is actually missing (checked first, no-op if
// everything's healthy) and safe to run repeatedly (Pipedrive doesn't de-dupe on its own, so this
// function does the de-dupe itself by checking existence before creating).
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

interface PipedriveWebhook {
  id: number
  event_action: string
  event_object: string
  subscription_url: string
  is_active: 0 | 1
  remove_time: string | null
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
    const missing = EXPECTED_WEBHOOKS.filter(
      (exp) => !live.some((h) => h.event_action === exp.event_action && h.subscription_url === exp.subscription_url),
    )

    if (missing.length === 0) return Response.json({ ok: true, missing: 0 })

    const restored: string[] = []
    const failed: string[] = []
    for (const hook of missing) {
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
      if (json.success) restored.push(hook.label)
      else failed.push(`${hook.label} (${json.error ?? res.status})`)
    }

    await notifyOwners(db, {
      type: 'pipedrive_webhook_repair',
      title: failed.length > 0 ? 'Pipedrive sync webhooks need attention' : 'Pipedrive sync webhooks auto-repaired',
      body: [
        restored.length > 0 ? `Re-registered: ${restored.join(', ')}.` : null,
        failed.length > 0 ? `Failed to re-register: ${failed.join(', ')} — check PIPEDRIVE_API_TOKEN/PIPEDRIVE_WEBHOOK_USER/PASS.` : null,
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
