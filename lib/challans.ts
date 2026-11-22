// Payroll → Compliance → Challans: dues per month from payroll (same maths as
// the ECR / challan reports), the challans paid against them (StatutoryChallan),
// due dates and reminders, a sanity check on a month's payroll, and old drafts.
import prisma from "@/lib/prisma"
import { getPayrollRules } from "@/lib/payroll-rules-server"
import { rulesForPeriod } from "@/lib/payroll-rules"
import { statutoryFlagsForMonth } from "@/lib/employee-statutory"
import { employerPfWages, epsContrib, epfEmployerContrib } from "@/lib/statutory-calc"
import { notifyApprovers } from "@/lib/hr-notify"

export const CHALLAN_TYPES = { PF: "PF (EPFO)", ESI: "ESIC", PT: "Professional Tax", LWF: "Labour Welfare Fund", TDS: "TDS" } as const
export type ChallanType = keyof typeof CHALLAN_TYPES

// ─── Settings ────────────────────────────────────────────────────────────────

export type ChallanSettings = {
    /** Day of the following month each challan is due (PF / ESIC 15, TDS 7, PT end of month). */
    dueDay: Record<ChallanType, number>
    /** LWF is paid for these months only (Maharashtra: June and December), due on dueDay of the month after. */
    lwfMonths: number[]
    /** Remind payroll this many days before the due date (0 = off), and again when overdue. */
    remindDaysBefore: number
    /** Sanity check: warn when more than this % of a month's payslips are ₹0. */
    zeroNetWarnPct: number
    /** …or PF / ESIC moves more than this % from the month before. */
    swingWarnPct: number
}
export const DEFAULT_CHALLAN_SETTINGS: ChallanSettings = { dueDay: { PF: 15, ESI: 15, PT: 30, LWF: 15, TDS: 7 }, lwfMonths: [6, 12], remindDaysBefore: 3, zeroNetWarnPct: 10, swingWarnPct: 40 }

const KEY = "challanSettings"
export function sanitizeChallanSettings(v: any): ChallanSettings {
    const d = DEFAULT_CHALLAN_SETTINGS
    const day = (x: unknown, def: number) => { const n = Math.round(Number(x)); return Number.isFinite(n) && n >= 1 && n <= 31 ? n : def }
    const pct = (x: unknown, def: number) => { const n = Number(x); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : def }
    return {
        dueDay: Object.fromEntries((Object.keys(CHALLAN_TYPES) as ChallanType[]).map(k => [k, day(v?.dueDay?.[k], d.dueDay[k])])) as Record<ChallanType, number>,
        lwfMonths: Array.isArray(v?.lwfMonths) ? Array.from(new Set(v.lwfMonths.map((m: unknown) => Math.round(Number(m))).filter((m: number) => m >= 1 && m <= 12))).sort((a, b) => (a as number) - (b as number)) as number[] : d.lwfMonths,
        remindDaysBefore: Math.max(0, Math.min(30, Math.round(Number(v?.remindDaysBefore ?? d.remindDaysBefore)) || 0)),
        zeroNetWarnPct: pct(v?.zeroNetWarnPct, d.zeroNetWarnPct),
        swingWarnPct: pct(v?.swingWarnPct, d.swingWarnPct),
    }
}
export async function getChallanSettings() {
    try { const r = await prisma.appSetting.findUnique({ where: { key: KEY } }); return sanitizeChallanSettings(r?.value ? JSON.parse(r.value) : {}) } catch { return sanitizeChallanSettings({}) }
}
export async function saveChallanSettings(input: unknown, userId: string) {
    const s = sanitizeChallanSettings(input)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(s), updatedBy: userId }, create: { key: KEY, value: JSON.stringify(s), updatedBy: userId } })
    return s
}

/** Due date (IST) of a challan for a wage month: dueDay of the next month (clamped to that month's length). */
export function dueDate(type: ChallanType, month: number, year: number, s: ChallanSettings): Date {
    const nm = month === 12 ? 1 : month + 1, ny = month === 12 ? year + 1 : year
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
    const d = Math.min(s.dueDay[type], last)
    return new Date(`${ny}-${String(nm).padStart(2, "0")}-${String(d).padStart(2, "0")}T23:59:59+05:30`)
}
export const lwfDueThisMonth = (month: number, s: ChallanSettings) => s.lwfMonths.includes(month)

// ─── Dues ────────────────────────────────────────────────────────────────────

export type Dues = {
    month: number; year: number; rows: number; drafts: number
    PF: { members: number; ee: number; epfEr: number; eps: number; edli: number; admin: number; total: number }
    ESI: { members: number; ee: number; er: number; total: number }
    PT: { members: number; total: number }
    LWF: { members: number; ee: number; er: number; total: number }
    TDS: { members: number; total: number }
}

/** What is owed for a wage month, from its processed / paid payroll rows (drafts are counted but left out). */
export async function monthDues(month: number, year: number): Promise<Dues> {
    const [{ rules: stored }, rows, drafts] = await Promise.all([
        getPayrollRules({ year, month }),
        prisma.payroll.findMany({ where: { month, year, status: { not: "DRAFT" } }, select: { employeeId: true, basicSalary: true, da: true, pfEmployee: true, grossSalary: true, esiEmployee: true, esiEmployer: true, pt: true, lwf: true, tds: true } }),
        prisma.payroll.count({ where: { month, year, status: "DRAFT" } }),
    ])
    const rules = rulesForPeriod(stored, month, year)
    const flags = await statutoryFlagsForMonth(Array.from(new Set(rows.map(r => r.employeeId))), { year, month }).catch(() => new Map())
    const rws = rows.map(r => ({ ...r, pensionApplicable: (flags.get(r.employeeId) as { pensionApplicable?: boolean } | undefined)?.pensionApplicable !== false }))
    const pf = rws.filter(r => r.pfEmployee > 0)
    const erWages = pf.reduce((s, r) => s + employerPfWages(r, rules), 0)
    const PF = {
        members: pf.length,
        ee: Math.round(pf.reduce((s, r) => s + r.pfEmployee, 0)),
        epfEr: Math.round(pf.reduce((s, r) => s + epfEmployerContrib(r, rules), 0)),
        eps: Math.round(pf.reduce((s, r) => s + epsContrib(r, rules), 0)),
        edli: Math.round(erWages * rules.pf.employer.edliPct / 100),
        admin: Math.round(erWages * rules.pf.employer.adminPct / 100),
        total: 0,
    }
    PF.total = PF.ee + PF.epfEr + PF.eps + PF.edli + PF.admin
    const esi = rws.filter(r => r.esiEmployee > 0 || r.esiEmployer > 0)
    const ESI = { members: esi.length, ee: Math.round(esi.reduce((s, r) => s + r.esiEmployee, 0)), er: Math.round(esi.reduce((s, r) => s + r.esiEmployer, 0) * 100) / 100, total: 0 }
    ESI.total = Math.ceil(ESI.ee + ESI.er)
    const pt = rws.filter(r => r.pt > 0)
    const lwf = rws.filter(r => r.lwf > 0)
    const lwfEr = lwf.length * (rules.lwf?.employerDefault ?? 0)
    const tds = rws.filter(r => r.tds > 0)
    return {
        month, year, rows: rows.length, drafts, PF, ESI,
        PT: { members: pt.length, total: Math.round(pt.reduce((s, r) => s + r.pt, 0)) },
        LWF: { members: lwf.length, ee: Math.round(lwf.reduce((s, r) => s + r.lwf, 0)), er: Math.round(lwfEr), total: Math.round(lwf.reduce((s, r) => s + r.lwf, 0) + lwfEr) },
        TDS: { members: tds.length, total: Math.round(tds.reduce((s, r) => s + r.tds, 0)) },
    }
}

// ─── Register ────────────────────────────────────────────────────────────────

export type ChallanRow = { type: ChallanType; label: string; due: number; dueDate: string; paid: number; status: "NOTHING_DUE" | "DUE" | "OVERDUE" | "PART_PAID" | "PAID"; challans: { id: string; trrnNumber: string | null; amount: number; paymentDate: string | null; status: string; documentUrl: string | null }[] }

/** Each challan type for a month: due, paid, status. */
export async function monthRegister(month: number, year: number, now = new Date()) {
    const [dues, s, recs] = await Promise.all([monthDues(month, year), getChallanSettings(), prisma.statutoryChallan.findMany({ where: { month, year }, orderBy: { createdAt: "asc" } })])
    const dueOf: Record<ChallanType, number> = { PF: dues.PF.total, ESI: dues.ESI.total, PT: dues.PT.total, LWF: lwfDueThisMonth(month, s) ? dues.LWF.total : 0, TDS: dues.TDS.total }
    const rows: ChallanRow[] = (Object.keys(CHALLAN_TYPES) as ChallanType[]).map(type => {
        const list = recs.filter(r => r.type === type && r.status !== "FAILED")
        const paid = Math.round(list.filter(r => r.status === "PAID").reduce((a, r) => a + r.amount, 0))
        const due = dueOf[type]
        const dd = dueDate(type, month, year, s)
        const status: ChallanRow["status"] = due <= 0 && !list.length ? "NOTHING_DUE" : paid >= due && paid > 0 ? "PAID" : paid > 0 ? "PART_PAID" : now > dd ? "OVERDUE" : "DUE"
        return { type, label: CHALLAN_TYPES[type], due, dueDate: dd.toISOString(), paid, status, challans: recs.filter(r => r.type === type).map(r => ({ id: r.id, trrnNumber: r.trrnNumber, amount: r.amount, paymentDate: r.paymentDate?.toISOString() ?? null, status: r.status, documentUrl: r.documentUrl })) }
    })
    return { dues, rows, settings: s }
}

/** Recent months with their challan status (for the overview and reminders). */
export async function recentMonths(count = 6, now = new Date()) {
    const months: { year: number; month: number }[] = await prisma.$queryRawUnsafe(`SELECT DISTINCT year, month FROM "Payroll" WHERE status::text <> 'DRAFT' ORDER BY year DESC, month DESC LIMIT ${Math.max(1, Math.min(24, count))}`)
    const out = []
    for (const m of months) { const r = await monthRegister(m.month, m.year, now); out.push({ month: m.month, year: m.year, rows: r.rows.map(x => ({ type: x.type, due: x.due, paid: x.paid, status: x.status, dueDate: x.dueDate })) }) }
    return out
}

/** Daily: remind payroll about challans due soon or overdue. */
export async function remindChallans(now = new Date()) {
    const s = await getChallanSettings()
    if (!s.remindDaysBefore) return 0
    const list = await recentMonths(3, now)
    const soon: string[] = [], late: string[] = []
    for (const m of list) for (const r of m.rows) {
        if (r.status === "PAID" || r.status === "NOTHING_DUE") continue
        const days = Math.ceil((new Date(r.dueDate).getTime() - now.getTime()) / 86_400_000)
        const tag = `${CHALLAN_TYPES[r.type as ChallanType]} ${m.month}/${m.year} ₹${(r.due - r.paid).toLocaleString("en-IN")}`
        if (days < 0) late.push(tag); else if (days <= s.remindDaysBefore) soon.push(`${tag} (due in ${days} day${days === 1 ? "" : "s"})`)
    }
    if (late.length || soon.length) await notifyApprovers(["payroll.markPaid", "payroll.edit"], { title: late.length ? "Statutory challans overdue" : "Statutory challans due soon", message: [late.length ? `Overdue: ${late.slice(0, 4).join(", ")}` : "", soon.length ? `Due soon: ${soon.slice(0, 4).join(", ")}` : ""].filter(Boolean).join(". "), type: "payroll", link: "/payroll/compliance/challans" })
    return late.length + soon.length
}

// ─── Sanity check ────────────────────────────────────────────────────────────

export type SanityIssue = { level: "warn" | "info"; text: string }

/** Things that look wrong in a month's payroll (₹0 payslips, no attendance, big swings). */
export async function monthSanity(month: number, year: number): Promise<{ issues: SanityIssue[]; stats: Record<string, number> }> {
    const s = await getChallanSettings()
    const pm = month === 1 ? 12 : month - 1, py = month === 1 ? year - 1 : year
    const q = async (m: number, y: number) => (await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int n,
        COUNT(*) FILTER (WHERE COALESCE("netSalary",0) = 0)::int zero_net,
        COUNT(*) FILTER (WHERE COALESCE("presentDays",0) = 0)::int zero_present,
        COUNT(*) FILTER (WHERE status::text = 'DRAFT')::int drafts,
        COALESCE(SUM("pfEmployee"),0)::float pf, COALESCE(SUM("esiEmployee"),0)::float esi, COALESCE(SUM("netSalary"),0)::float net
        FROM "Payroll" WHERE month = ${Math.round(m)} AND year = ${Math.round(y)}`) as any[])[0]
    const [cur, prev] = await Promise.all([q(month, year), q(pm, py)])
    const issues: SanityIssue[] = []
    if (!cur.n) return { issues: [{ level: "info", text: "No payroll for this month yet." }], stats: cur }
    const zeroPct = Math.round(cur.zero_net / cur.n * 100)
    if (zeroPct > s.zeroNetWarnPct) issues.push({ level: "warn", text: `${cur.zero_net} of ${cur.n} payslips (${zeroPct}%) are ₹0 — attendance may not be uploaded.` })
    if (cur.zero_present > 0 && cur.zero_present !== cur.zero_net) issues.push({ level: "info", text: `${cur.zero_present} employee(s) have 0 present days.` })
    if (cur.drafts) issues.push({ level: "info", text: `${cur.drafts} payslip(s) still draft.` })
    const swing = (a: number, b: number) => b > 0 ? Math.round(Math.abs(a - b) / b * 100) : 0
    if (prev.n && swing(cur.pf, prev.pf) > s.swingWarnPct) issues.push({ level: "warn", text: `PF deducted is ${cur.pf > prev.pf ? "up" : "down"} ${swing(cur.pf, prev.pf)}% on last month (₹${Math.round(cur.pf).toLocaleString("en-IN")} vs ₹${Math.round(prev.pf).toLocaleString("en-IN")}).` })
    if (prev.n && swing(cur.esi, prev.esi) > s.swingWarnPct) issues.push({ level: "warn", text: `ESIC deducted is ${cur.esi > prev.esi ? "up" : "down"} ${swing(cur.esi, prev.esi)}% on last month.` })
    if (prev.n && swing(cur.n, prev.n) > s.swingWarnPct) issues.push({ level: "warn", text: `${cur.n} payslips vs ${prev.n} last month.` })
    const att: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int n FROM "Attendance" WHERE date >= '${year}-${String(month).padStart(2, "0")}-01' AND date < '${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01'`)
    return { issues, stats: { ...cur, prevRows: prev.n, prevPf: prev.pf, attendanceRows: att[0]?.n ?? 0 } }
}

// ─── Old drafts ──────────────────────────────────────────────────────────────

/** Months whose payroll is all drafts and older than the open month (never processed). */
export async function oldDraftMonths() {
    const rows: { year: number; month: number; n: number; drafts: number; net: number }[] = await prisma.$queryRawUnsafe(`SELECT year, month, COUNT(*)::int n, COUNT(*) FILTER (WHERE status::text = 'DRAFT')::int drafts, COALESCE(SUM("netSalary"),0)::float net FROM "Payroll" GROUP BY year, month ORDER BY year DESC, month DESC`)
    const latestProcessed = rows.find(r => r.drafts < r.n)
    const cutoff = latestProcessed ? latestProcessed.year * 12 + latestProcessed.month : 0
    return rows.filter(r => r.drafts === r.n && r.year * 12 + r.month < cutoff).map(r => ({ year: r.year, month: r.month, drafts: r.drafts, net: Math.round(r.net) }))
}

/** Delete the draft payslips (and empty draft runs) of the chosen old months. Processed / paid rows are never touched. */
export async function deleteOldDrafts(months: { year: number; month: number }[], actor: { id: string; name: string }) {
    const allowed = new Set((await oldDraftMonths()).map(m => `${m.year}-${m.month}`))
    const pick = months.filter(m => allowed.has(`${m.year}-${m.month}`))
    let rows = 0, runs = 0
    for (const m of pick) {
        rows += (await prisma.payroll.deleteMany({ where: { year: m.year, month: m.month, status: "DRAFT" } })).count
        runs += (await prisma.payrollRun.deleteMany({ where: { year: m.year, month: m.month, status: "DRAFT" } }).catch(() => ({ count: 0 }))).count
    }
    if (rows) await prisma.auditLog.create({ data: { actorId: actor.id, actorName: actor.name, action: "payroll.delete_old_drafts", targetType: "Payroll", targetName: pick.map(m => `${m.month}/${m.year}`).join(", "), summary: `Deleted ${rows} draft payslip(s) and ${runs} draft run(s) from months never processed: ${pick.map(m => `${m.month}/${m.year}`).join(", ")}` } }).catch(() => {})
    return { rows, runs, months: pick.length }
}
