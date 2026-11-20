import prisma from "@/lib/prisma"
import { COMM_EVENTS, type CommEvent } from "@/lib/comm/events"

// Communication Center settings, in AppSetting "commSettings". Every event
// starts switched off on every channel — nothing is sent until someone turns
// it on in Settings → Communication.

export type EventChannels = {
    whatsapp: { enabled: boolean; template: string; language: string }
    email: { enabled: boolean; subject: string; body: string }
    inapp: { enabled: boolean }
}
export type CommSettings = {
    events: Record<string, EventChannels>
    /** WhatsApp to employees waits outside these hours (IST, "HH:MM"). Empty = no quiet hours. */
    quietStart: string
    quietEnd: string
    /** Name shown as the email sender. */
    emailFromName: string
}

const KEY = "commSettings"
const hhmm = (v: unknown, d: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d)
const str = (v: unknown, max: number, d = "") => (typeof v === "string" ? v.slice(0, max) : d)

export function defaultChannels(ev: CommEvent): EventChannels {
    return {
        whatsapp: { enabled: false, template: "", language: "en" },
        email: { enabled: false, subject: ev.defaultSubject, body: ev.defaultBody },
        inapp: { enabled: false },
    }
}

export function sanitizeCommSettings(v: any): CommSettings {
    const events: Record<string, EventChannels> = {}
    for (const ev of COMM_EVENTS) {
        const x = v?.events?.[ev.key] ?? {}
        const d = defaultChannels(ev)
        const template = str(x.whatsapp?.template, 512).trim()
        events[ev.key] = {
            whatsapp: {
                enabled: x.whatsapp?.enabled === true && !!template,
                template,
                language: typeof x.whatsapp?.language === "string" && /^[a-z]{2,3}(_[A-Z]{2})?$/.test(x.whatsapp.language) ? x.whatsapp.language : "en",
            },
            email: {
                enabled: x.email?.enabled === true,
                subject: str(x.email?.subject, 200, d.email.subject).trim() || d.email.subject,
                body: str(x.email?.body, 5000, d.email.body).trim() || d.email.body,
            },
            // In-app needs a login, so customers without one simply get none.
            inapp: { enabled: x.inapp?.enabled === true },
        }
    }
    return {
        events,
        quietStart: v?.quietStart === "" ? "" : hhmm(v?.quietStart, "21:00"),
        quietEnd: v?.quietEnd === "" ? "" : hhmm(v?.quietEnd, "08:00"),
        emailFromName: str(v?.emailFromName, 80, "").trim(),
    }
}

export async function getCommSettings(): Promise<CommSettings> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        if (row?.value) return sanitizeCommSettings(JSON.parse(row.value))
        // First run: carry over what was set on the old WhatsApp page.
        const old = await prisma.appSetting.findUnique({ where: { key: "whatsappSettings" } })
        const ov = old?.value ? JSON.parse(old.value) : null
        const seed: any = { events: {} }
        for (const [k, e] of Object.entries<any>(ov?.events ?? {})) seed.events[k] = { whatsapp: e }
        return sanitizeCommSettings(seed)
    } catch {
        return sanitizeCommSettings({})
    }
}

export async function saveCommSettings(s: CommSettings, userId: string) {
    const value = JSON.stringify(sanitizeCommSettings(s))
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
}
