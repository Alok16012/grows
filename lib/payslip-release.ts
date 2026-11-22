// Payroll → Salary slips → Send to employees. A processed payslip shows in the
// employee's My Profile (and the app) only once HR has sent that month for the
// employee's site. In-app only — payslips are never sent on WhatsApp.
// Stored in AppSetting "payslipRelease" (no table).
import prisma from "@/lib/prisma"
import { openPayrollMonth } from "@/lib/payroll-change-control"

const KEY = "payslipRelease"
export const NO_SITE = "none"

export type SentInfo = { at: string; by: string; byName: string; count: number }
export type ReleaseState = {
    /** Employees see a payslip only after it is sent (off = as soon as it is processed, the old way). */
    requireSend: boolean
    /** Months before this (YYYY-MM) count as sent — payslips employees could already see stay visible. */
    startFrom: string | null
    /** "YYYY-MM" → site id (or "none") → who sent it. */
    sent: Record<string, Record<string, SentInfo>>
}

export const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`

export async function getRelease(): Promise<ReleaseState> {
    let s: ReleaseState = { requireSend: true, startFrom: null, sent: {} }
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        if (row?.value) { const v = JSON.parse(row.value); s = { requireSend: v.requireSend !== false, startFrom: typeof v.startFrom === "string" ? v.startFrom : null, sent: v.sent && typeof v.sent === "object" ? v.sent : {} } }
    } catch { /* defaults */ }
    if (!s.startFrom) {
        // First use: the open payroll month onwards needs sending; earlier months stay as they were.
        const m = await openPayrollMonth().catch(() => null)
        s.startFrom = m ? ym(m.year, m.month) : ym(new Date().getFullYear(), new Date().getMonth() + 1)
        await saveRelease(s, null).catch(() => {})
    }
    return s
}

export async function saveRelease(s: ReleaseState, userId: string | null) {
    const value = JSON.stringify(s)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, ...(userId ? { updatedBy: userId } : {}) }, create: { key: KEY, value, ...(userId ? { updatedBy: userId } : {}) } })
}

/** Can the employee see this payslip yet? */
export function isVisible(p: { month: number; year: number; siteId: string | null; status: string }, s: ReleaseState): boolean {
    if (p.status === "DRAFT") return false
    if (!s.requireSend) return true
    const k = ym(p.year, p.month)
    if (s.startFrom && k < s.startFrom) return true
    return !!s.sent[k]?.[p.siteId ?? NO_SITE]
}
