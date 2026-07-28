// HTTP Basic Auth check shared by every Function Pipedrive itself calls directly (no logged-in
// user session exists on these — Pipedrive is the caller). Both the legacy pipedrive-webhook.mts
// and the new crm-deal-created.mts use the same PIPEDRIVE_WEBHOOK_USER/PASS secrets — one
// Pipedrive-side credential, reused across both webhook subscriptions.
export function isPipedriveWebhookAuthorized(req: Request): boolean {
  const user = process.env.PIPEDRIVE_WEBHOOK_USER
  const pass = process.env.PIPEDRIVE_WEBHOOK_PASS
  if (!user || !pass) {
    console.error('pipedrive webhook: PIPEDRIVE_WEBHOOK_USER/PIPEDRIVE_WEBHOOK_PASS is not set on this Function')
    return false
  }
  const header = req.headers.get('authorization') ?? ''
  if (!header.startsWith('Basic ')) return false
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf-8')
  return decoded === `${user}:${pass}`
}
