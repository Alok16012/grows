// Which months a salary or compliance change may take effect from.
//
// "Open payroll month" = the month after the latest month whose payroll is
// fully locked (every row PROCESSED / PAID). Old months with stray draft rows
// don't count — only the latest fully locked month matters. With nothing
// locked yet, it is the current calendar month (IST).
//
// Changes may start in the open month or the next one (Payroll → Calculation
// Settings → Change control). Back-dating is off unless that setting lets
// admins do it with a reason.
import prisma from "@/lib/prisma"

export type YM = { month: number; year: number }
export const ymKey = (p: YM) => p.year * 12 + p.month
export const addMonths = (p: YM, n: number): YM => { const k = ymKey(p) - 1 + n; return { year: Math.floor(k / 12), month: (k % 12) + 1 } }
export const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export const ymLabel = (p: YM) => `${MONTHS[p.month]} ${p.year}`

export function calendarMonthIST(now = new Date()): YM {
    const ist = new Date(now.getTime() + 330 * 60_000)
    return { month: ist.getUTCMonth() + 1, year: ist.getUTCFullYear() }
}

/** The open payroll month (see top of file). */
export async function openPayrollMonth(): Promise<YM> {
    try {
        const rows: { year: number; month: number; drafts: number }[] = await prisma.$queryRawUnsafe(`
            SELECT year, month, COUNT(*) FILTER (WHERE status::text = 'DRAFT')::int AS drafts
            FROM "Payroll" GROUP BY year, month ORDER BY year DESC, month DESC LIMIT 36`)
        const locked = rows.find(r => r.drafts === 0)
        if (locked) return addMonths({ year: locked.year, month: locked.month }, 1)
    } catch (e) {
        console.error("[OPEN_PAYROLL_MONTH]", e)
    }
    return calendarMonthIST()
}

// ─── Change control settings ─────────────────────────────────────────────────

export type ChangeControl = {
    /** "openOrNext" = the open payroll month or the next one; "nextOnly" = only the month after it. */
    allowedMonths: "openOrNext" | "nextOnly"
    /** "never" = no back-dating; "adminWithReason" = admins may pick an earlier month after giving a reason. */
    backdating: "never" | "adminWithReason"
}
export const DEFAULT_CHANGE_CONTROL: ChangeControl = { allowedMonths: "openOrNext", backdating: "never" }
const CC_KEY = "payrollChangeControl"

export function sanitizeChangeControl(v: any): ChangeControl {
    return {
        allowedMonths: v?.allowedMonths === "nextOnly" ? "nextOnly" : "openOrNext",
        backdating: v?.backdating === "adminWithReason" ? "adminWithReason" : "never",
    }
}

export async function getChangeControl(): Promise<ChangeControl> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: CC_KEY } })
        return row ? sanitizeChangeControl(JSON.parse(row.value)) : DEFAULT_CHANGE_CONTROL
    } catch { return DEFAULT_CHANGE_CONTROL }
}

export async function saveChangeControl(v: unknown, userId: string): Promise<ChangeControl> {
    const next = sanitizeChangeControl(v)
    const value = JSON.stringify(next)
    await prisma.appSetting.upsert({ where: { key: CC_KEY }, create: { key: CC_KEY, value, updatedBy: userId }, update: { value, updatedBy: userId } })
    return next
}

/** The months a change may start in right now, plus the rules behind them (for the UI). */
export async function effectiveWindow(): Promise<{ open: YM; allowed: YM[]; control: ChangeControl }> {
    const [open, control] = await Promise.all([openPayrollMonth(), getChangeControl()])
    const allowed = control.allowedMonths === "nextOnly" ? [addMonths(open, 1)] : [open, addMonths(open, 1)]
    return { open, allowed, control }
}

/**
 * Check a requested start month. Returns an error message to show, or null
 * when it's allowed. Earlier months only for admins, only when the setting
 * allows it, and only with a reason.
 */
export async function checkEffectiveMonth(
    req: YM, who: { isAdmin: boolean }, reason?: string | null,
): Promise<string | null> {
    if (!Number.isInteger(req.month) || req.month < 1 || req.month > 12 || !Number.isInteger(req.year)) return "Pick the month the change starts from."
    const { open, allowed, control } = await effectiveWindow()
    if (allowed.some(a => ymKey(a) === ymKey(req))) return null
    const list = allowed.map(ymLabel).join(" or ")
    if (ymKey(req) > ymKey(allowed[allowed.length - 1])) return `Changes can start only from ${list}.`
    // Earlier than allowed = back-dating.
    if (control.backdating !== "adminWithReason") return `Changes can start only from ${list} (${ymLabel(open)} is the open payroll month). Back-dating is switched off in Calculation Settings → Change control.`
    if (!who.isAdmin) return `Only an admin can back-date a change. Changes can start from ${list}.`
    if (!reason || reason.trim().length < 5) return "Give a reason for back-dating this change."
    return null
}
