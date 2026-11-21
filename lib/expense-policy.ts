// Expense policy (Expense Claims → Policy settings). Every limit is a setting
// the accounts / HR team edits — nothing is fixed in code. Client-safe: the
// claim form shows the same checks the server applies on Submit, and the
// approver sees them on the claim.

export type ExpenseLine = {
    category: string
    amount: number
    date: string | null          // yyyy-MM-dd
    receiptUrl: string | null
    kms: number                  // travel only
    vehicleType: string | null   // travel only: "2W" | "4W"
}

export type CategoryLimit = {
    /** Most one claim may hold for this category (sum of its lines). null = no limit. */
    perClaim: number | null
    /** Most one employee may claim for it in a calendar month (submitted, approved or paid). null = no limit. */
    perMonth: number | null
}

export type ExpensePolicy = {
    /** What happens when a claim is over a limit: "warn" lets it through flagged; "block" stops Submit. */
    overLimit: "warn" | "block"
    /** A line above this amount needs a receipt / bill to be submitted. 0 = never required. */
    receiptRequiredAbove: number
    /** An expense older than this many days (by its date) can't be claimed. 0 = no limit. */
    maxAgeDays: number
    /** Most km on one travel line (all journeys of that line). 0 = no limit. */
    maxKmPerClaim: number
    /** category → limits; a category not listed has none. */
    limits: Record<string, CategoryLimit>
}

export const DEFAULT_EXPENSE_POLICY: ExpensePolicy = {
    overLimit: "warn",
    receiptRequiredAbove: 0,
    maxAgeDays: 0,
    maxKmPerClaim: 0,
    limits: {},
}

const num = (v: unknown, d: number, min = 0, max = 100_000_000) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d }
const optMoney = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

export function sanitizeExpensePolicy(v: any): ExpensePolicy {
    const d = DEFAULT_EXPENSE_POLICY
    const limits: Record<string, CategoryLimit> = {}
    if (v?.limits && typeof v.limits === "object") {
        for (const [cat, raw] of Object.entries(v.limits as Record<string, any>).slice(0, 100)) {
            if (!/^[A-Z_]{2,40}$/.test(cat) || !raw) continue
            const l = { perClaim: optMoney(raw.perClaim), perMonth: optMoney(raw.perMonth) }
            if (l.perClaim !== null || l.perMonth !== null) limits[cat] = l
        }
    }
    return {
        overLimit: v?.overLimit === "block" ? "block" : "warn",
        receiptRequiredAbove: num(v?.receiptRequiredAbove, d.receiptRequiredAbove),
        maxAgeDays: num(v?.maxAgeDays, d.maxAgeDays, 0, 3650),
        maxKmPerClaim: num(v?.maxKmPerClaim, d.maxKmPerClaim, 0, 1_000_000),
        limits,
    }
}

const day = (v: unknown): string | null => {
    if (!v) return null
    const s = typeof v === "string" ? v : v instanceof Date ? v.toISOString() : String(v)
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
    return m ? m[1] : null
}

/** Every category line of a claim (multi-category claims, or a single legacy line). */
export function claimLines(exp: any): ExpenseLine[] {
    const items = Array.isArray(exp?.categoryItems) && exp.categoryItems.length ? exp.categoryItems : null
    const one = (it: any, fallback: any): ExpenseLine => {
        const entries = Array.isArray(it?.travelEntries) ? it.travelEntries : []
        return {
            category: String(it?.category ?? fallback.category ?? "OTHER"),
            amount: Number(it?.amount ?? fallback.amount) || 0,
            date: day(it?.date) ?? day(fallback.date),
            receiptUrl: it?.receiptUrl ? String(it.receiptUrl) : (items ? null : fallback.receiptUrl ? String(fallback.receiptUrl) : null),
            kms: entries.reduce((s: number, e: any) => s + (Number(e?.kms) || 0), 0),
            vehicleType: it?.vehicleType ?? entries.find((e: any) => e?.vehicleType)?.vehicleType ?? null,
        }
    }
    return items ? items.map((it: any) => one(it, exp)) : [one(exp, exp)]
}

export type PolicyFlag = {
    kind: "receipt" | "age" | "perClaim" | "perMonth" | "km"
    category: string | null
    message: string
    /** True when this stops Submit (receipt, age, km always; limits only when overLimit = "block"). */
    blocking: boolean
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")

/**
 * The policy checks for one claim. `monthClaimed` is what the employee already
 * has (other claims, submitted / approved / paid) per category for each
 * month "yyyy-MM" — only needed for per-month limits.
 */
export function checkClaim(exp: any, policy: ExpensePolicy, opts: {
    today?: string
    monthClaimed?: Record<string, Record<string, number>>
    label?: (category: string) => string
} = {}): PolicyFlag[] {
    const label = opts.label ?? ((c: string) => c.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, x => x.toUpperCase()))
    const lines = claimLines(exp)
    const flags: PolicyFlag[] = []
    const limitBlocks = policy.overLimit === "block"

    if (policy.receiptRequiredAbove > 0) {
        for (const l of lines) if (l.amount > policy.receiptRequiredAbove && !l.receiptUrl && l.category !== "TRAVEL") {
            flags.push({ kind: "receipt", category: l.category, blocking: true, message: `${label(l.category)} ${inr(l.amount)} needs a receipt (required above ${inr(policy.receiptRequiredAbove)})` })
        }
    }
    if (policy.maxAgeDays > 0) {
        const today = opts.today ?? new Date().toISOString().slice(0, 10)
        const cutoff = new Date(today + "T00:00:00Z"); cutoff.setUTCDate(cutoff.getUTCDate() - policy.maxAgeDays)
        const cut = cutoff.toISOString().slice(0, 10)
        const old = lines.filter(l => l.date && l.date < cut)
        if (old.length) flags.push({ kind: "age", category: null, blocking: true, message: `Expenses older than ${policy.maxAgeDays} days can't be claimed (${old.map(l => `${label(l.category)} on ${l.date}`).join(", ")})` })
    }
    if (policy.maxKmPerClaim > 0) {
        for (const l of lines) if (l.category === "TRAVEL" && l.kms > policy.maxKmPerClaim) {
            flags.push({ kind: "km", category: l.category, blocking: true, message: `Travel ${l.kms.toFixed(1)} km is over the ${policy.maxKmPerClaim} km limit for one claim` })
        }
    }
    // Per-category limits.
    const byCat = new Map<string, number>()
    for (const l of lines) byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.amount)
    for (const [cat, total] of Array.from(byCat)) {
        const lim = policy.limits[cat]
        if (!lim) continue
        if (lim.perClaim && total > lim.perClaim) {
            flags.push({ kind: "perClaim", category: cat, blocking: limitBlocks, message: `${label(cat)} ${inr(total)} is over the ${inr(lim.perClaim)} limit per claim` })
        }
        if (lim.perMonth && opts.monthClaimed) {
            // By the month of each line.
            const months = new Map<string, number>()
            for (const l of lines) if (l.category === cat) { const m = (l.date ?? opts.today ?? new Date().toISOString()).slice(0, 7); months.set(m, (months.get(m) ?? 0) + l.amount) }
            for (const [m, amt] of Array.from(months)) {
                const before = opts.monthClaimed[m]?.[cat] ?? 0
                if (before + amt > lim.perMonth) {
                    flags.push({ kind: "perMonth", category: cat, blocking: limitBlocks, message: `${label(cat)} for ${m}: ${inr(before + amt)} with this claim (${inr(before)} already) is over the ${inr(lim.perMonth)} monthly limit` })
                }
            }
        }
    }
    return flags
}
