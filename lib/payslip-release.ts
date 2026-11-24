// Payroll → payslips to employees. When a processed payslip shows in the
// employee's My Profile (and the app) is a setting (Payroll → Settings →
// Payslips to employees):
//   manual    — only once HR sends it: a whole site, or chosen employees
//   onLock    — automatically when the payroll is locked (processed)
//   onPaid    — automatically when it is marked paid
// In manual/onPaid, HR can still send any site or employee early by hand.
// In-app only — payslips are never sent on WhatsApp.
// Stored in AppSetting "payslipRelease" (no table).
import prisma from "@/lib/prisma"
import { openPayrollMonth } from "@/lib/payroll-change-control"

const KEY = "payslipRelease"
export const NO_SITE = "none"

export type SentInfo = { at: string; by: string; byName: string; count: number }
export type SendMode = "manual" | "onLock" | "onPaid"
export const SEND_MODE_LABEL: Record<SendMode, string> = {
    manual: "Manual — HR sends (whole site or chosen employees)",
    onLock: "Automatic — as soon as payroll is locked",
    onPaid: "Automatic — when salary is marked paid",
}
export type ReleaseState = {
    /** Kept for older readers: false only when mode is onLock. */
    requireSend: boolean
    mode: SendMode
    /** In-app note to the employee when a payslip is released (sent or automatic). */
    notify: boolean
    /** Months before this (YYYY-MM) count as sent — payslips employees could already see stay visible. */
    startFrom: string | null
    /** "YYYY-MM" → site id (or "none") → who sent it. */
    sent: Record<string, Record<string, SentInfo>>
    /** "YYYY-MM" → employee id → who sent it (individual sends). */
    sentEmp: Record<string, Record<string, SentInfo>>
}

export const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`

export async function getRelease(): Promise<ReleaseState> {
    let s: ReleaseState = { requireSend: true, mode: "manual", notify: true, startFrom: null, sent: {}, sentEmp: {} }
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        if (row?.value) {
            const v = JSON.parse(row.value)
            // Older records had only requireSend: false meant "visible once processed".
            const mode: SendMode = ["manual", "onLock", "onPaid"].includes(v.mode) ? v.mode : v.requireSend === false ? "onLock" : "manual"
            s = {
                requireSend: mode !== "onLock", mode, notify: v.notify !== false,
                startFrom: typeof v.startFrom === "string" ? v.startFrom : null,
                sent: v.sent && typeof v.sent === "object" ? v.sent : {},
                sentEmp: v.sentEmp && typeof v.sentEmp === "object" ? v.sentEmp : {},
            }
        }
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
export function isVisible(p: { month: number; year: number; siteId: string | null; status: string; employeeId?: string }, s: ReleaseState): boolean {
    if (p.status === "DRAFT") return false
    if (s.mode === "onLock") return true
    const k = ym(p.year, p.month)
    if (s.startFrom && k < s.startFrom) return true
    if (s.mode === "onPaid" && p.status === "PAID") return true
    return !!s.sent[k]?.[p.siteId ?? NO_SITE] || (!!p.employeeId && !!s.sentEmp[k]?.[p.employeeId])
}

/** In-app "your payslip is ready" note (never WhatsApp). */
export async function notifyPayslipReady(employeeIds: string[], month: number, year: number) {
    if (!employeeIds.length) return 0
    const emps = await prisma.employee.findMany({ where: { id: { in: Array.from(new Set(employeeIds)) }, userId: { not: null } }, select: { userId: true } })
    const users = Array.from(new Set(emps.map(e => e.userId).filter((x): x is string => !!x)))
    const label = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" })
    for (let i = 0; i < users.length; i += 500) {
        await prisma.notification.createMany({ data: users.slice(i, i + 500).map(userId => ({ userId, title: `Payslip for ${label}`, message: "Your payslip is ready. Open My Profile → Payslips to view or download it.", type: "payroll", link: "/profile?tab=payslip" })) }).catch(e => console.error("[PAYSLIP_NOTIFY]", e))
    }
    return users.length
}

/** After a lock / mark-paid: tell employees whose payslip just became visible automatically. */
export async function notifyAutoRelease(event: "lock" | "paid", rows: { employeeId: string }[], month: number, year: number) {
    try {
        const s = await getRelease()
        if (!s.notify || !rows.length) return 0
        if (!((event === "lock" && s.mode === "onLock") || (event === "paid" && s.mode === "onPaid"))) return 0
        if (s.startFrom && ym(year, month) < s.startFrom) return 0
        return await notifyPayslipReady(rows.map(r => r.employeeId), month, year)
    } catch (e) { console.error("[PAYSLIP_AUTO_NOTIFY]", e); return 0 }
}
