// The one look and feel for every email QPaint OS sends. Any new email builds its body from the
// small helpers below and passes it through renderEmail(), so they all share the same header,
// card, button and footer. Table-based, inline-styled HTML so it renders the same in Gmail,
// Outlook and Apple Mail (no web fonts, no images — the logo mark is a styled cell).

const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const INK = '#171717' // QPaint OS primary (near-black)
const TEXT = '#3f4752'
const MUTED = '#6b7280'
const LINE = '#e4e7ec'
const PAGE_BG = '#f4f5f7'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A paragraph of body copy. Pass already-escaped HTML (use escapeHtml / <strong>) — not raw user input. */
export function emailParagraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${TEXT}">${html}</p>`
}

/** A small label/value panel, e.g. "Your role — Team Leader / Foreperson". */
export function emailDetails(rows: { label: string; value: string }[]): string {
  const cells = rows
    .map(
      (r) => `<tr>
        <td style="padding:10px 16px;font-family:${FONT};font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">${escapeHtml(r.label)}</td>
        <td style="padding:10px 16px;font-family:${FONT};font-size:15px;font-weight:600;color:${INK}">${escapeHtml(r.value)}</td>
      </tr>`,
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;background:#f8f9fb;border:1px solid ${LINE};border-radius:10px">${cells}</table>`
}

/** The big call-to-action button (bulletproof: a coloured table cell, so it survives Outlook). */
function emailButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px">
    <tr><td bgcolor="${INK}" style="border-radius:10px">
      <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(label)}</a>
    </td></tr>
  </table>`
}

export interface EmailContent {
  /** Hidden inbox-preview line. */
  preheader: string
  heading: string
  /** Body HTML built from emailParagraph / emailDetails. */
  bodyHtml: string
  cta?: { label: string; url: string }
  /** Small grey note under the button (e.g. "This link expires in 7 days"). */
  note?: string
}

export function renderEmail(c: EmailContent): string {
  const fallbackLink = c.cta
    ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED}">Button not working? Paste this link into your browser:</p>
       <p style="margin:0 0 18px;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};word-break:break-all"><a href="${escapeHtml(c.cta.url)}" style="color:${MUTED}">${escapeHtml(c.cta.url)}</a></p>`
    : ''
  const note = c.note ? `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTED}">${escapeHtml(c.note)}</p>` : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(c.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAGE_BG}" style="background:${PAGE_BG}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px">

      <tr><td style="padding:0 4px 18px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td width="36" height="36" align="center" valign="middle" bgcolor="${INK}" style="width:36px;height:36px;border-radius:9px;font-family:${FONT};font-size:19px;font-weight:700;color:#ffffff;line-height:36px">Q</td>
          <td style="padding-left:10px;font-family:${FONT};font-size:19px;font-weight:700;letter-spacing:-0.01em;color:${INK}">QPaint OS</td>
        </tr></table>
      </td></tr>

      <tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="34%" height="5" bgcolor="#97c459" style="height:5px;line-height:5px;font-size:0;border-top-left-radius:16px">&nbsp;</td>
            <td width="33%" height="5" bgcolor="#378add" style="height:5px;line-height:5px;font-size:0">&nbsp;</td>
            <td width="33%" height="5" bgcolor="#ef9f27" style="height:5px;line-height:5px;font-size:0;border-top-right-radius:16px">&nbsp;</td>
          </tr>
          <tr><td colspan="3" style="padding:34px 36px 30px">
            <h1 style="margin:0 0 18px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.015em;color:${INK}">${escapeHtml(c.heading)}</h1>
            ${c.bodyHtml}
            ${c.cta ? emailButton(c.cta.label, c.cta.url) : ''}
            ${fallbackLink}
            ${note}
          </td></tr>
        </table>
      </td></tr>

      <tr><td align="center" style="padding:22px 12px 0">
        <p style="margin:0 0 4px;font-family:${FONT};font-size:12px;color:${MUTED}"><strong style="color:${TEXT}">QPaint OS</strong> &middot; Scheduling &amp; production, in one place</p>
        <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:#9aa1ad">You’re receiving this because someone at QPaint sent it to you. If you weren’t expecting it, you can safely ignore it.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}
