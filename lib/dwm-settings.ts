import prisma from "@/lib/prisma"

// DWM settings (Performance → Setup → DWM Settings). Every deadline, reminder,
// lock and escalation rule for daily / weekly / monthly KPI reports lives
// here — nothing about them is fixed in code.

export type RoleGroup = {
    /** e.g. "Quality Engineer / Inspector" */
    name: string
    /** Designations (as typed on employee records, any case) that belong to this group. */
    designations: string[]
    /** Template family assigned by "Assign by role". */
    templateFamilyId: string | null
}

export type DwmSettings = {
    reviewer: {
        /** New assignments take the employee's manager (HR record) as reviewer when none is picked. */
        defaultFromManager: boolean
    }
    deadlines: {
        /** Days after the period ends that a report is still on time. 0 = due on the last day. */
        dailyGraceDays: number
        weeklyGraceDays: number
        monthlyGraceDays: number
        /** After the deadline the employee can no longer fill / submit the report (HR still can). */
        lockAfterDue: boolean
    }
    reminders: {
        /** Remind the employee about a report that is due and not yet submitted. */
        employee: boolean
        /** Tell each reviewer which of their people missed yesterday's deadline. */
        reviewerMissedList: boolean
    }
    review: {
        /** A submitted report older than this reminds the reviewer. 0 = never. */
        targetDays: number
        /** Older than this, HR (performance.manage) is told. 0 = never. */
        escalateAfterDays: number
        /** Older than this, a report with no RED KPI is approved automatically. 0 = never. */
        autoApproveAfterDays: number
    }
    roleGroups: RoleGroup[]
}

export const DEFAULT_DWM_SETTINGS: DwmSettings = {
    reviewer: { defaultFromManager: true },
    deadlines: { dailyGraceDays: 1, weeklyGraceDays: 2, monthlyGraceDays: 3, lockAfterDue: false },
    reminders: { employee: true, reviewerMissedList: true },
    review: { targetDays: 2, escalateAfterDays: 5, autoApproveAfterDays: 0 },
    roleGroups: [],
}

const KEY = "dwmSettings"
const num = (v: unknown, d: number, min = 0, max = 365) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d }
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d)

export function sanitizeDwmSettings(v: any): DwmSettings {
    const d = DEFAULT_DWM_SETTINGS
    const r = v?.reviewer ?? {}, dl = v?.deadlines ?? {}, rm = v?.reminders ?? {}, rv = v?.review ?? {}
    const groups: RoleGroup[] = (Array.isArray(v?.roleGroups) ? v.roleGroups : []).slice(0, 30).map((g: any) => ({
        name: String(g?.name ?? "").trim().slice(0, 80),
        designations: Array.from(new Set<string>((Array.isArray(g?.designations) ? g.designations : [])
            .map((x: unknown) => String(x ?? "").trim().slice(0, 100)).filter(Boolean))).slice(0, 100),
        templateFamilyId: typeof g?.templateFamilyId === "string" && g.templateFamilyId ? g.templateFamilyId : null,
    })).filter((g: RoleGroup) => g.name)
    return {
        reviewer: { defaultFromManager: bool(r.defaultFromManager, d.reviewer.defaultFromManager) },
        deadlines: {
            dailyGraceDays: num(dl.dailyGraceDays, d.deadlines.dailyGraceDays, 0, 7),
            weeklyGraceDays: num(dl.weeklyGraceDays, d.deadlines.weeklyGraceDays, 0, 14),
            monthlyGraceDays: num(dl.monthlyGraceDays, d.deadlines.monthlyGraceDays, 0, 28),
            lockAfterDue: bool(dl.lockAfterDue, d.deadlines.lockAfterDue),
        },
        reminders: {
            employee: bool(rm.employee, d.reminders.employee),
            reviewerMissedList: bool(rm.reviewerMissedList, d.reminders.reviewerMissedList),
        },
        review: {
            targetDays: num(rv.targetDays, d.review.targetDays, 0, 60),
            escalateAfterDays: num(rv.escalateAfterDays, d.review.escalateAfterDays, 0, 90),
            autoApproveAfterDays: num(rv.autoApproveAfterDays, d.review.autoApproveAfterDays, 0, 90),
        },
        roleGroups: groups,
    }
}

export async function getDwmSettings(): Promise<DwmSettings> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        if (!row) return DEFAULT_DWM_SETTINGS
        return sanitizeDwmSettings(JSON.parse(row.value))
    } catch {
        return DEFAULT_DWM_SETTINGS
    }
}

export async function saveDwmSettings(v: unknown, updatedBy?: string | null): Promise<DwmSettings> {
    const next = sanitizeDwmSettings(v)
    const value = JSON.stringify(next)
    await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value, updatedBy: updatedBy ?? null }, update: { value, updatedBy: updatedBy ?? null } })
    return next
}

/** Grace days for a frequency. */
export function graceDays(s: DwmSettings, frequency: string): number {
    return frequency === "DAILY" ? s.deadlines.dailyGraceDays : frequency === "WEEKLY" ? s.deadlines.weeklyGraceDays : s.deadlines.monthlyGraceDays
}

/** Last IST day (UTC-midnight date) on which a report for this period is on time. */
export function dueDay(s: DwmSettings, frequency: string, periodEnd: Date): Date {
    return new Date(periodEnd.getTime() + graceDays(s, frequency) * 86_400_000)
}

/** Which role group a designation belongs to (case-insensitive, trimmed). */
export function groupOf(s: DwmSettings, designation: string | null | undefined): RoleGroup | null {
    const d = (designation ?? "").trim().toLowerCase()
    if (!d) return null
    return s.roleGroups.find(g => g.designations.some(x => x.trim().toLowerCase() === d)) ?? null
}
