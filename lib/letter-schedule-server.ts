// Joining letters on a schedule — tracker (sent or not), issuing, daily job.
// Letters are ordinary HR documents (HrDocument) made from the HR document
// templates, so approval, recall, PDF and My Profile → Letters all work as before.
import prisma from "@/lib/prisma"
import { employeeScope, auditLater, type Access } from "@/lib/access"
import { postedSites } from "@/lib/attendance-guard"
import { normalizeEmploymentType } from "@/lib/employment-type"
import { fillTemplate, buildDocVars, generateDocNumber } from "@/lib/hr-document"
import { ensureHrDocRecallSchema, getUserSignature } from "@/lib/hr-doc-schema"
import { notifyApprovers, notifyEmployee } from "@/lib/hr-notify"
import { sanitizeLetterSettings, type LetterRule, type LetterSettings, type LetterStatus } from "@/lib/letter-schedule"

const KEY = "letterSchedule"
const SKIP_KEY = "letterSkips"

export async function getLetterSettings(): Promise<LetterSettings> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        return sanitizeLetterSettings(row?.value ? JSON.parse(row.value) : {})
    } catch { return sanitizeLetterSettings({}) }
}

export async function saveLetterSettings(input: unknown, userId: string): Promise<LetterSettings> {
    const s = sanitizeLetterSettings(input)
    const types = new Set((await prisma.hrDocumentType.findMany({ select: { id: true } })).map(t => t.id))
    s.rules = s.rules.filter(r => types.has(r.typeId))
    const value = JSON.stringify(s)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
    return s
}

type Skip = { reason: string; by: string; at: string }
async function getSkips(): Promise<Record<string, Skip>> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: SKIP_KEY } })
        const v = row?.value ? JSON.parse(row.value) : {}
        return v && typeof v === "object" ? v : {}
    } catch { return {} }
}
async function saveSkips(v: Record<string, Skip>, userId: string) {
    const value = JSON.stringify(v)
    await prisma.appSetting.upsert({ where: { key: SKIP_KEY }, update: { value, updatedBy: userId }, create: { key: SKIP_KEY, value, updatedBy: userId } })
}
const skipKey = (employeeId: string, typeId: string) => `${employeeId}:${typeId}`

// Dates as IST calendar days (YYYY-MM-DD).
const IST = 5.5 * 3600_000
const ymd = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10)
const addDays = (day: string, n: number) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

export type TrackerRow = {
    ruleId: string; typeId: string; typeName: string
    employeeId: string; code: string; name: string; designation: string | null; employmentType: string; siteId: string | null; site: string | null
    triggerDate: string; dueDate: string; daysLate: number
    status: LetterStatus
    doc: { id: string; docNumber: string; status: string; issuedAt: string | null; acknowledgedAt: string | null } | null
    skip: Skip | null
}

/** Every employee each rule applies to, with the due date and whether the letter went out. */
export async function letterTracker(access: Access | null, now = new Date(), override?: LetterSettings) {
    const settings = override ?? await getLetterSettings()
    const types = await prisma.hrDocumentType.findMany({ select: { id: true, name: true, requiresApproval: true, isActive: true, templateContent: true }, orderBy: { name: "asc" } })
    const typeOf = new Map(types.map(t => [t.id, t]))
    const rules = settings.rules.filter(r => typeOf.has(r.typeId))
    if (!rules.length) return { settings, types, rows: [] as TrackerRow[] }

    const scope = access ? await employeeScope(access) : null
    const live = { status: { in: ["ACTIVE", "ONBOARDING", "ON_LEAVE"] as any } }
    const emps = await prisma.employee.findMany({
        where: scope ? { AND: [live, scope] } : live,
        select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true, employmentType: true, dateOfJoining: true, createdAt: true },
    })
    const ids = emps.map(e => e.id)
    const [posted, sites, approvedAt, docs, skips] = await Promise.all([
        postedSites(ids),
        prisma.site.findMany({ select: { id: true, name: true } }),
        rules.some(r => r.trigger === "APPROVED")
            ? prisma.onboardingRecord.findMany({ where: { employeeId: { in: ids }, completedAt: { not: null } }, select: { employeeId: true, completedAt: true } }).then(l => new Map(l.map(x => [x.employeeId, x.completedAt!])))
            : Promise.resolve(new Map<string, Date>()),
        prisma.hrDocument.findMany({
            where: { employeeId: { in: ids }, typeId: { in: Array.from(new Set(rules.map(r => r.typeId))) }, status: { notIn: ["RECALLED", "REJECTED"] as any } },
            select: { id: true, docNumber: true, employeeId: true, typeId: true, status: true, issuedAt: true, acknowledged: true, acknowledgedAt: true, createdAt: true },
            orderBy: { createdAt: "desc" },
        }),
        getSkips(),
    ])
    const siteName = new Map(sites.map(s => [s.id, s.name]))
    const docOf = new Map<string, (typeof docs)[number]>()
    for (const d of docs) { const k = skipKey(d.employeeId, d.typeId); if (!docOf.has(k)) docOf.set(k, d) }
    const today = ymd(now)

    const rows: TrackerRow[] = []
    for (const r of rules) {
        const t = typeOf.get(r.typeId)!
        for (const e of emps) {
            const type = normalizeEmploymentType(e.employmentType)
            if (r.employmentTypes.length && !r.employmentTypes.includes(type)) continue
            const siteId = posted.get(e.id) ?? null
            if (r.siteIds.length && (!siteId || !r.siteIds.includes(siteId))) continue
            const tDate = r.trigger === "JOINING" ? e.dateOfJoining : r.trigger === "CONVERTED" ? e.createdAt : approvedAt.get(e.id) ?? null
            if (!tDate) continue
            const triggerDate = ymd(tDate)
            if (r.fromDate && triggerDate < r.fromDate) continue
            const dueDate = addDays(triggerDate, r.offsetDays)
            const k = skipKey(e.id, r.typeId)
            const d = docOf.get(k) ?? null
            const skip = skips[k] ?? null
            const late = daysBetween(dueDate, today)
            const status: LetterStatus = d
                ? (d.status === "ISSUED" ? (d.acknowledged ? "ACKNOWLEDGED" : "SENT") : "WAITING")
                : skip ? "SKIPPED"
                : late < 0 ? "UPCOMING" : late > settings.overdueAfterDays ? "OVERDUE" : "DUE"
            rows.push({
                ruleId: r.id, typeId: r.typeId, typeName: t.name,
                employeeId: e.id, code: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(), designation: e.designation, employmentType: type,
                siteId, site: siteId ? siteName.get(siteId) ?? null : null,
                triggerDate, dueDate, daysLate: Math.max(0, late), status,
                doc: d ? { id: d.id, docNumber: d.docNumber, status: String(d.status), issuedAt: d.issuedAt?.toISOString() ?? null, acknowledgedAt: d.acknowledgedAt?.toISOString() ?? null } : null,
                skip,
            })
        }
    }
    rows.sort((a, b) => b.daysLate - a.daysLate || a.dueDate.localeCompare(b.dueDate))
    return { settings, types, rows }
}

export class LetterError extends Error {}

/**
 * Make one letter from the rule's template. Types that need approval wait as
 * PENDING_APPROVAL (approved and issued in Letters & Documents); the rest are
 * ISSUED and appear in the employee's My Profile → Letters.
 */
export async function issueLetter(employeeId: string, rule: LetterRule, actor: { id: string; name: string } | null) {
    await ensureHrDocRecallSchema()
    const [employee, type] = await Promise.all([
        prisma.employee.findUnique({ where: { id: employeeId }, include: { branch: { include: { company: true } }, department: true, employeeSalary: { select: { ctcMonthly: true } } } }),
        prisma.hrDocumentType.findUnique({ where: { id: rule.typeId } }),
    ])
    if (!employee || !type) throw new LetterError("Employee or letter template not found")
    if (!type.isActive) throw new LetterError(`The "${type.name}" template is switched off in Letters & Documents`)
    if (!type.templateContent?.trim()) throw new LetterError(`The "${type.name}" template is empty`)
    const existing = await prisma.hrDocument.findFirst({ where: { employeeId, typeId: rule.typeId, status: { notIn: ["RECALLED", "REJECTED"] as any } }, select: { id: true } })
    if (existing) throw new LetterError("Already sent")

    const content = fillTemplate(type.templateContent, buildDocVars(employee, employee.dateOfJoining))
    const signer = rule.signerUserId ?? actor?.id ?? null
    const signature = signer ? await getUserSignature(signer).catch(() => null) : null
    const waiting = type.requiresApproval
    const now = new Date()
    let doc: { id: string; docNumber: string } | null = null
    for (let i = 0; i < 6 && !doc; i++) {
        try {
            doc = await prisma.hrDocument.create({
                data: {
                    docNumber: generateDocNumber(), employeeId, typeId: rule.typeId, effectiveDate: employee.dateOfJoining, content,
                    status: waiting ? "PENDING_APPROVAL" : "ISSUED",
                    remarks: "Joining letter schedule",
                    createdBy: actor?.id ?? "system",
                    ...(waiting ? {} : { issuedBy: signer ?? actor?.id ?? "system", issuedAt: now }),
                    signature,
                },
                select: { id: true, docNumber: true },
            })
        } catch (e: any) { if (e?.code !== "P2002") throw e } // doc number taken → try another
    }
    if (!doc) throw new LetterError("Could not number the letter; try again")
    if (!waiting && rule.notify) await notifyEmployee(employeeId, { title: `Your ${type.name} is ready`, message: "Open My Profile → Letters to read, download and acknowledge it.", type: "document", link: "/profile?tab=letters" })
    return { ...doc, waiting, typeName: type.name }
}

/** Issue several (from the tracker). Returns counts and the first errors. */
export async function issueMany(items: { employeeId: string; ruleId: string }[], actor: { id: string; name: string } | null) {
    const settings = await getLetterSettings()
    const ruleOf = new Map(settings.rules.map(r => [r.id, r]))
    let issued = 0, waiting = 0
    const errors: string[] = []
    for (const it of items) {
        const rule = ruleOf.get(it.ruleId)
        if (!rule) { errors.push("Rule not found"); continue }
        try { const d = await issueLetter(it.employeeId, rule, actor); if (d.waiting) waiting++; else issued++ }
        catch (e: any) { if (!(e instanceof LetterError && e.message === "Already sent")) errors.push(e?.message || "Failed") }
    }
    if (waiting) await notifyApprovers(["documents.send"], { title: "Letters waiting for approval", message: `${waiting} joining letter(s) were created and need approval before they are issued.`, type: "document", link: "/documents/send" }, actor?.id)
    return { issued, waiting, failed: errors.length, errors: Array.from(new Set(errors)).slice(0, 5) }
}

export async function setSkipped(items: { employeeId: string; typeId: string }[], reason: string | null, actor: { id: string; name: string }) {
    const skips = await getSkips()
    for (const it of items) {
        const k = skipKey(it.employeeId, it.typeId)
        if (reason) skips[k] = { reason: reason.slice(0, 200), by: actor.name, at: new Date().toISOString() }
        else delete skips[k]
    }
    await saveSkips(skips, actor.id)
}

/** Daily job: issue letters that are due under rules with automatic issue on. */
export async function runDueLetters(now = new Date()) {
    const settings = await getLetterSettings()
    const auto = new Set(settings.rules.filter(r => r.enabled && r.autoIssue).map(r => r.id))
    if (!auto.size) return { issued: 0, waiting: 0, failed: 0 }
    const { rows } = await letterTracker(null, now)
    const due = rows.filter(r => auto.has(r.ruleId) && (r.status === "DUE" || r.status === "OVERDUE")).slice(0, settings.maxPerRun)
    const res = await issueMany(due.map(r => ({ employeeId: r.employeeId, ruleId: r.ruleId })), null)
    if (due.length) auditLater({ actorName: "Daily job", action: "letters.auto_issue", targetType: "HrDocument", targetName: `${due.length} letter(s)`, summary: `Joining letters: ${res.issued} issued, ${res.waiting} waiting for approval, ${res.failed} failed` })
    return res
}
