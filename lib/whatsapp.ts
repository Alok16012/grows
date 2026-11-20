import prisma from "@/lib/prisma"
import { isMissingTableErr } from "@/lib/asset-workflow"

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
// send here is a template send. Each one is logged in WhatsAppMessage, and
// delivery / read / failure come back through /api/whatsapp/webhook.

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

export type WaHeader = { type: "document"; link: string; filename?: string } | { type: "image"; link: string }
export type WaSend = {
    to: string
    template: string
    language: string
    /** Values for {{1}}, {{2}}… in the template body, in order. */
    body?: string[]
    header?: WaHeader
    /** For the log: what this message is about. */
    event: string
    recipientName?: string | null
    employeeId?: string | null
    refType?: string | null
    refId?: string | null
    sentBy?: string | null
}

export type WaResult = { ok: true; id: string | null; wamid: string } | { ok: false; id: string | null; error: string }

async function logCreate(data: Record<string, unknown>): Promise<string | null> {
    try {
        const row = await prisma.whatsAppMessage.create({ data: data as any, select: { id: true } })
        return row.id
    } catch (e) {
        if (isMissingTableErr(e)) return null      // table not created yet: still send
        throw e
    }
}
async function logUpdate(id: string | null, data: Record<string, unknown>) {
    if (!id) return
    try { await prisma.whatsAppMessage.update({ where: { id }, data: data as any }) } catch (e) { if (!isMissingTableErr(e)) console.error("[WA_LOG]", e) }
}

/** Sends one approved template message and logs it. Never throws. */
export async function sendTemplate(m: WaSend): Promise<WaResult> {
    const cfg = waConfig()
    const to = waPhone(m.to)
    const components: unknown[] = []
    if (m.header) {
        components.push({
            type: "header",
            parameters: [m.header.type === "document"
                ? { type: "document", document: { link: m.header.link, ...(m.header.filename ? { filename: m.header.filename } : {}) } }
                : { type: "image", image: { link: m.header.link } }],
        })
    }
    if (m.body?.length) components.push({ type: "body", parameters: m.body.map(text => ({ type: "text", text: String(text).slice(0, 1000) })) })

    let id: string | null = null
    try {
        id = await logCreate({
            toPhone: to ?? String(m.to ?? ""), recipientName: m.recipientName ?? null, employeeId: m.employeeId ?? null,
            event: m.event, template: m.template, language: m.language,
            refType: m.refType ?? null, refId: m.refId ?? null, sentBy: m.sentBy ?? null,
            // The header link is signed and short-lived; keep only what was sent.
            payload: { body: m.body ?? [], header: m.header ? { type: m.header.type } : null },
        })
    } catch (e) { console.error("[WA_LOG_CREATE]", e) }

    const fail = async (error: string): Promise<WaResult> => { await logUpdate(id, { status: "failed", error }); return { ok: false, id, error } }
    if (!cfg) return fail("WhatsApp is not connected — set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID")
    if (!to) return fail("Not a valid Indian mobile number")

    const r = await graph(cfg, `${cfg.phoneId}/messages`, {
        method: "POST",
        body: {
            messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
            template: { name: m.template, language: { code: m.language }, ...(components.length ? { components } : {}) },
        },
    })
    const wamid = (r.data as any)?.messages?.[0]?.id as string | undefined
    if (!r.ok || !wamid) return fail(r.error || "WhatsApp did not accept the message")
    await logUpdate(id, { status: "sent", wamid, sentAt: new Date() })
    return { ok: true, id, wamid }
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

// ─── Which events send on WhatsApp, with which template ─────────────────────

export const WA_EVENTS = [
    { key: "payslip", label: "Salary slip ready", hint: "To the employee. Body {{1}} name, {{2}} month. Header: Document (the slip PDF)." },
    { key: "inspection_report", label: "Inspection report to customer", hint: "To customer contacts after approval. Body {{1}} contact name, {{2}} project, {{3}} date. Header: Document (report PDF)." },
    { key: "leave_decision", label: "Leave approved / rejected", hint: "To the employee. Body {{1}} name, {{2}} leave dates, {{3}} Approved / Rejected." },
    { key: "announcement", label: "Important announcement", hint: "To employees in the audience. Body {{1}} title. Usually a Marketing template — costs more." },
] as const
export type WaEventKey = typeof WA_EVENTS[number]["key"]
export type WaEventSetting = { enabled: boolean; template: string; language: string }
export type WaSettings = { events: Record<WaEventKey, WaEventSetting> }

const SETTINGS_KEY = "whatsappSettings"
const blank = (): WaEventSetting => ({ enabled: false, template: "", language: "en" })

export function sanitizeWaSettings(v: any): WaSettings {
    const events = {} as Record<WaEventKey, WaEventSetting>
    for (const e of WA_EVENTS) {
        const x = v?.events?.[e.key] ?? {}
        events[e.key] = {
            enabled: x.enabled === true,
            template: typeof x.template === "string" ? x.template.trim().slice(0, 512) : "",
            language: typeof x.language === "string" && /^[a-z]{2}(_[A-Z]{2})?$/.test(x.language) ? x.language : "en",
        }
        if (!events[e.key].template) events[e.key].enabled = false
    }
    return { events }
}

export async function getWaSettings(): Promise<WaSettings> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } })
        return sanitizeWaSettings(row?.value ? JSON.parse(row.value) : {})
    } catch {
        return sanitizeWaSettings({})
    }
}

export async function saveWaSettings(s: WaSettings, userId: string) {
    const value = JSON.stringify(sanitizeWaSettings(s))
    await prisma.appSetting.upsert({ where: { key: SETTINGS_KEY }, update: { value, updatedBy: userId }, create: { key: SETTINGS_KEY, value, updatedBy: userId } })
}

/** The template to use for an event, or null when that event is switched off. */
export async function waEventTemplate(event: WaEventKey): Promise<WaEventSetting | null> {
    const s = (await getWaSettings()).events[event] ?? blank()
    return s.enabled && s.template ? s : null
}
