import prisma from "@/lib/prisma"

// Inspection settings (Approvals → Settings). Every limit used by the
// approval reminders, customer alerts and summaries, draft clean-up and
// signatures lives here — nothing about them is fixed in code.

export type InspectionSettings = {
    approval: {
        /** A pending report older than this is "overdue" (inbox badge, reminders). */
        targetHours: number
        /** Overdue reports older than this are escalated to admins. 0 = never. */
        escalateAfterHours: number
        /** Remind approvers every day about overdue reports. */
        remindApprovers: boolean
        /** Stamp the approver's saved signature on a report when they approve it. */
        autoSignature: boolean
    }
    alerts: {
        /** Send the customer the rework / rejection alert when an approved report crosses a limit. */
        enabled: boolean
        /** Rejected ÷ inspected, in %, at or above which the alert goes. 0 = not used. */
        rejectedPct: number
        /** Rejected pieces at or above which the alert goes. 0 = not used. */
        rejectedQty: number
        /** Rework ÷ inspected, in %, at or above which the alert goes. 0 = not used. */
        reworkPct: number
    }
    summary: {
        /** Report summary to each customer's contacts. */
        frequency: "off" | "daily" | "weekly"
        /** For weekly: 0 = Sunday … 6 = Saturday. */
        weekday: number
    }
    drafts: {
        /** Remind the inspector about a draft this many days old. 0 = never. */
        remindAfterDays: number
        /** Delete drafts with nothing filled in after this many days. 0 = never. */
        deleteEmptyAfterDays: number
    }
}

export const DEFAULT_INSPECTION_SETTINGS: InspectionSettings = {
    approval: { targetHours: 24, escalateAfterHours: 72, remindApprovers: true, autoSignature: true },
    alerts: { enabled: true, rejectedPct: 2, rejectedQty: 0, reworkPct: 0 },
    summary: { frequency: "off", weekday: 1 },
    drafts: { remindAfterDays: 2, deleteEmptyAfterDays: 0 },
}

const KEY = "inspectionSettings"
const num = (v: unknown, d: number, min = 0, max = 100000) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d }
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d)

export function sanitizeInspectionSettings(v: any): InspectionSettings {
    const d = DEFAULT_INSPECTION_SETTINGS
    const a = v?.approval ?? {}, al = v?.alerts ?? {}, s = v?.summary ?? {}, dr = v?.drafts ?? {}
    return {
        approval: {
            targetHours: num(a.targetHours, d.approval.targetHours, 1, 24 * 60),
            escalateAfterHours: num(a.escalateAfterHours, d.approval.escalateAfterHours, 0, 24 * 90),
            remindApprovers: bool(a.remindApprovers, d.approval.remindApprovers),
            autoSignature: bool(a.autoSignature, d.approval.autoSignature),
        },
        alerts: {
            enabled: bool(al.enabled, d.alerts.enabled),
            rejectedPct: num(al.rejectedPct, d.alerts.rejectedPct, 0, 100),
            rejectedQty: num(al.rejectedQty, d.alerts.rejectedQty, 0),
            reworkPct: num(al.reworkPct, d.alerts.reworkPct, 0, 100),
        },
        summary: {
            frequency: s.frequency === "daily" || s.frequency === "weekly" || s.frequency === "off" ? s.frequency : d.summary.frequency,
            weekday: num(s.weekday, d.summary.weekday, 0, 6),
        },
        drafts: {
            remindAfterDays: num(dr.remindAfterDays, d.drafts.remindAfterDays, 0, 365),
            deleteEmptyAfterDays: num(dr.deleteEmptyAfterDays, d.drafts.deleteEmptyAfterDays, 0, 365),
        },
    }
}

export async function getInspectionSettings(): Promise<InspectionSettings> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        return sanitizeInspectionSettings(row?.value ? JSON.parse(row.value) : {})
    } catch {
        return sanitizeInspectionSettings({})
    }
}

export async function saveInspectionSettings(s: InspectionSettings, userId: string) {
    const value = JSON.stringify(sanitizeInspectionSettings(s))
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
}
