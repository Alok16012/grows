import nodemailer, { type Transporter } from "nodemailer"
import { COMPANY } from "@/lib/company"

// Outgoing email for the Communication Center.
//
//   Default — Gmail:  GMAIL_USER, GMAIL_APP_PASSWORD (about 500 emails a day).
//   Any provider — set EMAIL_PROVIDER=smtp and
//       SMTP_HOST, SMTP_PORT (587 / 465), SMTP_USER, SMTP_PASS, EMAIL_FROM
//   Amazon SES, Zoho ZeptoMail, Resend, Brevo… all offer SMTP, so switching
//   needs no code change.

type Provider = { kind: "gmail" | "smtp"; from: string; transport: () => Transporter }

let cached: { key: string; t: Transporter } | null = null

function provider(): Provider | null {
    if ((process.env.EMAIL_PROVIDER || "").toLowerCase() === "smtp") {
        const host = process.env.SMTP_HOST?.trim(), user = process.env.SMTP_USER?.trim(), pass = process.env.SMTP_PASS
        const from = process.env.EMAIL_FROM?.trim() || user
        if (!host || !user || !pass || !from) return null
        const port = Number(process.env.SMTP_PORT) || 587
        return { kind: "smtp", from, transport: () => nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } }) }
    }
    const user = process.env.GMAIL_USER?.trim(), pass = process.env.GMAIL_APP_PASSWORD
    if (!user || !pass) return null
    return { kind: "gmail", from: user, transport: () => nodemailer.createTransport({ service: "gmail", auth: { user, pass } }) }
}

export function emailStatus() {
    const p = provider()
    return p ? { configured: true, provider: p.kind, from: p.from } : { configured: false, provider: (process.env.EMAIL_PROVIDER || "gmail").toLowerCase(), from: null }
}

export type MailAttachment = { filename: string; content: Buffer; contentType?: string }

export async function sendEmail(m: { to: string; subject: string; html: string; text: string; fromName?: string; attachments?: MailAttachment[] }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    const p = provider()
    if (!p) return { ok: false, error: "Email is not set up (GMAIL_USER / GMAIL_APP_PASSWORD or SMTP_*)" }
    try {
        const key = `${p.kind}:${p.from}`
        if (!cached || cached.key !== key) cached = { key, t: p.transport() }
        const info = await cached.t.sendMail({
            from: { name: m.fromName || COMPANY.legalName, address: p.from },
            to: m.to, subject: m.subject, html: m.html, text: m.text,
            attachments: m.attachments?.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
        })
        return { ok: true, id: String(info.messageId || "") }
    } catch (e: any) {
        return { ok: false, error: (e?.response || e?.message || "Could not send").toString().slice(0, 300) }
    }
}

/** Plain text → the branded email page (logo, card, footer). */
export function emailLayout(subject: string, body: string, opts: { appUrl?: string | null } = {}) {
    const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
    // Escape first, then turn links and line breaks into HTML.
    const html = esc(body)
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0b5cff">$1</a>')
        .replace(/\n/g, "<br/>")
    const logo = opts.appUrl ? `<img src="${opts.appUrl.replace(/\/$/, "")}/logo.png" alt="" height="36" style="display:block;height:36px;margin-bottom:6px"/>` : ""
    return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f1729">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:28px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="padding:0 4px 14px">${logo}<span style="font-size:15px;font-weight:700">${esc(COMPANY.legalName)}</span></td></tr>
<tr><td style="background:#ffffff;border:1px solid #e6eaf5;border-radius:14px;padding:28px 30px;font-size:14.5px;line-height:1.6">${html}</td></tr>
<tr><td style="padding:14px 4px;font-size:11.5px;color:#7a8499">Sent by ${esc(COMPANY.name)} on behalf of ${esc(COMPANY.legalName)}. Please don't reply to this automated message.</td></tr>
</table></td></tr></table></body></html>`
}
