
// WhatsApp Business messages through Meta's Cloud API (direct, no partner).
//
// Environment (Vercel → Settings → Environment Variables):
//   WHATSAPP_TOKEN            permanent System User access token (Business Manager)
//   WHATSAPP_PHONE_NUMBER_ID  the sending number's ID (WhatsApp → API Setup)
//   WHATSAPP_WABA_ID          WhatsApp Business Account ID — to list templates
//   WHATSAPP_APP_SECRET       Meta app secret — checks webhook signatures
//   WHATSAPP_VERIFY_TOKEN     any long random text; typed into the webhook setup too
//   WHATSAPP_API_VERSION      optional, default v21.0
//
// Business-initiated messages must use a template Meta has approved, so every
// send here is a template send. The Communication Center (lib/comm/engine)
// queues and logs them; receipts come back through /api/whatsapp/webhook.

export type WaConfig = { token: string; phoneId: string; wabaId: string | null; appSecret: string | null; verifyToken: string | null; version: string }

export function waConfig(): WaConfig | null {
    const token = process.env.WHATSAPP_TOKEN?.trim()
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
    if (!token || !phoneId) return null
    return {
        token, phoneId,
        wabaId: process.env.WHATSAPP_WABA_ID?.trim() || null,
        appSecret: process.env.WHATSAPP_APP_SECRET?.trim() || null,
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim() || null,
        version: process.env.WHATSAPP_API_VERSION?.trim() || "v21.0",
    }
}

/** Which settings are present — never the values. */
export function waEnvStatus() {
    const has = (k: string) => !!process.env[k]?.trim()
    return {
        WHATSAPP_TOKEN: has("WHATSAPP_TOKEN"),
        WHATSAPP_PHONE_NUMBER_ID: has("WHATSAPP_PHONE_NUMBER_ID"),
        WHATSAPP_WABA_ID: has("WHATSAPP_WABA_ID"),
        WHATSAPP_APP_SECRET: has("WHATSAPP_APP_SECRET"),
        WHATSAPP_VERIFY_TOKEN: has("WHATSAPP_VERIFY_TOKEN"),
    }
}

/** Indian mobile in WhatsApp form (91XXXXXXXXXX), or null if it isn't one. */
export function waPhone(raw: string | null | undefined): string | null {
    let d = String(raw ?? "").replace(/\D/g, "")
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1)
    if (d.length === 10 && /^[6-9]/.test(d)) return `91${d}`
    if (d.length === 12 && d.startsWith("91") && /^[6-9]/.test(d.slice(2))) return d
    return null
}

async function graph<T = any>(cfg: WaConfig, path: string, init?: { method?: string; body?: unknown }): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
    try {
        const res = await fetch(`https://graph.facebook.com/${cfg.version}/${path}`, {
            method: init?.method ?? "GET",
            headers: { Authorization: `Bearer ${cfg.token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
            body: init?.body ? JSON.stringify(init.body) : undefined,
            cache: "no-store",
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
            const e = (data as any)?.error
            return { ok: false, status: res.status, data, error: e ? `${e.message ?? "Error"}${e.code ? ` (code ${e.code})` : ""}` : `HTTP ${res.status}` }
        }
        return { ok: true, status: res.status, data, error: null }
    } catch (e: any) {
        return { ok: false, status: 0, data: null, error: e?.message || "Network error" }
    }
}

// A document goes either by public link or by a media id from uploadMedia()
// (preferred for private files such as salary slips: no URL ever exists).
export type WaHeader = { type: "document"; link: string; filename?: string } | { type: "document"; id: string; filename?: string } | { type: "image"; link: string }
export type WaSend = {
    to: string
    template: string
    language: string
    /** Values for {{1}}, {{2}}… in the template body, in order. */
    body?: string[]
    header?: WaHeader
}

export type WaResult = { ok: true; wamid: string } | { ok: false; error: string; permanent?: boolean }

/** Sends one approved template message. Never throws; logging is the caller's (lib/comm/engine). */
export async function sendTemplate(m: WaSend): Promise<WaResult> {
    const cfg = waConfig()
    if (!cfg) return { ok: false, error: "WhatsApp is not connected — set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID" }
    const to = waPhone(m.to)
    if (!to) return { ok: false, error: "Not a valid Indian mobile number", permanent: true }
    const components: unknown[] = []
    if (m.header) {
        components.push({
            type: "header",
            parameters: [m.header.type === "document"
                ? { type: "document", document: { ...("id" in m.header ? { id: m.header.id } : { link: m.header.link }), ...(m.header.filename ? { filename: m.header.filename } : {}) } }
                : { type: "image", image: { link: m.header.link } }],
        })
    }
    if (m.body?.length) components.push({ type: "body", parameters: m.body.map(text => ({ type: "text", text: String(text || "-").slice(0, 1000) })) })
    const r = await graph(cfg, `${cfg.phoneId}/messages`, {
        method: "POST",
        body: {
            messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
            template: { name: m.template, language: { code: m.language }, ...(components.length ? { components } : {}) },
        },
    })
    const wamid = (r.data as any)?.messages?.[0]?.id as string | undefined
    if (!r.ok || !wamid) return { ok: false, error: r.error || "WhatsApp did not accept the message", permanent: r.status === 400 }
    return { ok: true, wamid }
}

/** Uploads a file to WhatsApp (kept by Meta ~30 days) and returns its media id. */
export async function uploadMedia(data: Buffer, filename: string, mime = "application/pdf"): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    const cfg = waConfig()
    if (!cfg) return { ok: false, error: "WhatsApp is not connected" }
    try {
        const form = new FormData()
        form.append("messaging_product", "whatsapp")
        form.append("type", mime)
        form.append("file", new Blob([new Uint8Array(data)], { type: mime }), filename)
        const res = await fetch(`https://graph.facebook.com/${cfg.version}/${cfg.phoneId}/media`, { method: "POST", headers: { Authorization: `Bearer ${cfg.token}` }, body: form })
        const d = await res.json().catch(() => null) as any
        if (!res.ok || !d?.id) return { ok: false, error: d?.error?.message ? `${d.error.message}${d.error.code ? ` (code ${d.error.code})` : ""}` : `Upload failed (HTTP ${res.status})` }
        return { ok: true, id: String(d.id) }
    } catch (e: any) {
        return { ok: false, error: e?.message || "Upload failed" }
    }
}

export type WaTemplate = { name: string; language: string; status: string; category: string; body: string; params: number; header: string | null }

/** Templates on the WhatsApp Business Account (approved and pending). */
export async function listTemplates(): Promise<{ ok: boolean; templates: WaTemplate[]; error: string | null }> {
    const cfg = waConfig()
    if (!cfg) return { ok: false, templates: [], error: "Not connected" }
    if (!cfg.wabaId) return { ok: false, templates: [], error: "Set WHATSAPP_WABA_ID to list templates" }
    const r = await graph<{ data: any[] }>(cfg, `${cfg.wabaId}/message_templates?fields=name,language,status,category,components&limit=200`)
    if (!r.ok) return { ok: false, templates: [], error: r.error }
    const templates = (r.data?.data ?? []).map(t => {
        const body = (t.components ?? []).find((c: any) => c.type === "BODY")?.text ?? ""
        const header = (t.components ?? []).find((c: any) => c.type === "HEADER")?.format ?? null
        const params = new Set(String(body).match(/\{\{\d+\}\}/g) ?? []).size
        return { name: t.name, language: t.language, status: t.status, category: t.category, body, params, header }
    })
    return { ok: true, templates, error: null }
}

/** The connected sending number, as Meta reports it. */
export async function phoneInfo() {
    const cfg = waConfig()
    if (!cfg) return null
    const r = await graph(cfg, `${cfg.phoneId}?fields=display_phone_number,verified_name,quality_rating,name_status,code_verification_status`)
    return r.ok ? { ...(r.data as any), error: null } : { error: r.error }
}
