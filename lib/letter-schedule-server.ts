// HR letters on a schedule — tracker (sent or not), issuing, daily job.
// Letters are ordinary HR documents (HrDocument) made from the HR document
// templates, so approval, recall, PDF and My Profile → Letters all work as before.
//
// Each rule turns into "events": one per person for the one-time letters
// (joining, confirmation, exit), one per salary revision / site change for the
// repeating ones (increment, transfer). A letter counts as sent when an HR
// document of that template exists for the person — for repeating letters,
// one with the event's effective date.
import prisma from "@/lib/prisma"
import { employeeScope, auditLater, type Access } from "@/lib/access"
import { normalizeEmploymentType } from "@/lib/employment-type"
import { fillTemplate, buildDocVars, generateDocNumber } from "@/lib/hr-document"
import { ensureHrDocRecallSchema, getUserSignature } from "@/lib/hr-doc-schema"
import { notifyApprovers, notifyEmployee } from "@/lib/hr-notify"
import {
    sanitizeLetterSettings, isOnDemand, REPEATING_TRIGGERS, STANDARD_LETTERS, STARTER_TEMPLATES, LETTER_TRIGGERS,
    type LetterRule, type LetterSettings, type LetterStatus,
} from "@/lib/letter-schedule"

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

/**
 * Create the standard letter templates that do not exist yet (matched by name,
 * ignoring case). Existing templates are never changed. Returns the names made.
 */
export async function createMissingTemplates(names: string[] | null): Promise<string[]> {
    const have = new Set((await prisma.hrDocumentType.findMany({ select: { name: true } })).map(t => t.name.trim().toLowerCase()))
    const made: string[] = []
    for (const s of STANDARD_LETTERS) {
        if (names && !names.includes(s.name)) continue
        if (have.has(s.name.toLowerCase())) continue
        await prisma.hrDocumentType.create({
            data: { name: s.name, description: `${s.note}. Starter wording — edit it as needed.`, templateContent: STARTER_TEMPLATES[s.name] ?? "", requiresApproval: s.requiresApproval, isActive: true },
        })
        made.push(s.name)
    }
    return made
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
/** One-time letters keep the old key (employee:template); repeating ones add the event. */
const skipKey = (employeeId: string, typeId: string, eventKey?: string | null) => eventKey && eventKey !== "once" ? `${employeeId}:${typeId}:${eventKey}` : `${employeeId}:${typeId}`

// Dates as IST calendar days (YYYY-MM-DD).
const IST = 5.5 * 3600_000
const ymd = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10)
const istDate = (day: string) => new Date(`${day}T00:00:00+05:30`)
const addDays = (day: string, n: number) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
const addMonths = (day: string, n: number) => {
    const [y, m, d] = day.split("-").map(Number)
    const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate() // 31 Aug + 6 months → 28/29 Feb
    return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10)
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const dmy = (day: string) => { const [y, m, d] = day.split("-"); return `${d}/${m}/${y}` }
const money = (n: number) => Math.round(n).toLocaleString("en-IN")
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

const LIVE = ["ACTIVE", "ONBOARDING", "ON_LEAVE"]
const LEFT = ["INACTIVE", "TERMINATED", "RESIGNED"]

export type TrackerRow = {
    ruleId: string; typeId: string; typeName: string
    employeeId: string; code: string; name: string; designation: string | null; employmentType: string; siteId: string | null; site: string | null
    /** "once" for one-time letters; the event's day (YYYY-MM-DD) for increment / transfer. */
    eventKey: string
    /** What happened, e.g. "₹12,000 → ₹13,500 from April 2027" or "Site A → Site B". */
    event: string | null
    triggerDate: string; dueDate: string; daysLate: number
    status: LetterStatus
    doc: { id: string; docNumber: string; status: string; issuedAt: string | null; acknowledgedAt: string | null } | null
    skip: Skip | null
}
/** What the letter needs to be made: the effective date and the extra {{variables}}. */
type EventData = { effectiveDay: string | null; vars: Record<string, string> }
const evKey = (ruleId: string, employeeId: string, eventKey: string) => `${ruleId}|${employeeId}|${eventKey}`

async function buildRows(settings: LetterSettings, access: Access | null, now: Date, onlyEmployeeIds?: string[]) {
    const types = await prisma.hrDocumentType.findMany({ select: { id: true, name: true, requiresApproval: true, isActive: true, templateContent: true }, orderBy: { name: "asc" } })
    const typeOf = new Map(types.map(t => [t.id, t]))
    const rules = settings.rules.filter(r => typeOf.has(r.typeId) && !isOnDemand(r.trigger))
    const events = new Map<string, EventData>()
    if (!rules.length) return { types, rows: [] as TrackerRow[], events }

    const wantLive = rules.some(r => r.trigger !== "EXIT"), wantLeft = rules.some(r => r.trigger === "EXIT")
    const statuses = [...(wantLive ? LIVE : []), ...(wantLeft ? LEFT : [])]
    const scope = access ? await employeeScope(access) : null
    const where: any = { AND: [{ status: { in: statuses } }, ...(scope ? [scope] : []), ...(onlyEmployeeIds ? [{ id: { in: onlyEmployeeIds } }] : [])] }
    const emps = await prisma.employee.findMany({
        where,
        select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true, employmentType: true, dateOfJoining: true, dateOfLeaving: true, createdAt: true, status: true },
    })
    const ids = emps.map(e => e.id)
    const leftIds = emps.filter(e => LEFT.includes(String(e.status))).map(e => e.id)
    const need = (t: LetterRule["trigger"]) => rules.some(r => r.trigger === t)
    const [deps, sites, approvedAt, exits, revisions, docs, skips] = await Promise.all([
        prisma.deployment.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true, siteId: true, startDate: true, isActive: true, createdAt: true }, orderBy: [{ startDate: "asc" }, { createdAt: "asc" }] }),
        prisma.site.findMany({ select: { id: true, name: true } }),
        need("APPROVED")
            ? prisma.onboardingRecord.findMany({ where: { employeeId: { in: ids }, completedAt: { not: null } }, select: { employeeId: true, completedAt: true } }).then(l => new Map(l.map(x => [x.employeeId, x.completedAt!])))
            : Promise.resolve(new Map<string, Date>()),
        leftIds.length
            ? prisma.exitRequest.findMany({ where: { employeeId: { in: leftIds } }, select: { employeeId: true, lastWorkingDate: true } }).then(l => new Map(l.map(x => [x.employeeId, x.lastWorkingDate])))
            : Promise.resolve(new Map<string, Date | null>()),
        need("SALARY_REVISION")
            ? prisma.salaryRevision.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true, effectiveYear: true, effectiveMonth: true, ctcMonthly: true, createdAt: true }, orderBy: [{ effectiveYear: "asc" }, { effectiveMonth: "asc" }] })
            : Promise.resolve([]),
        prisma.hrDocument.findMany({
            where: { employeeId: { in: ids }, typeId: { in: Array.from(new Set(rules.map(r => r.typeId))) }, status: { notIn: ["RECALLED", "REJECTED"] as any } },
            select: { id: true, docNumber: true, employeeId: true, typeId: true, status: true, issuedAt: true, acknowledged: true, acknowledgedAt: true, effectiveDate: true, createdAt: true },
            orderBy: { createdAt: "desc" },
        }),
        getSkips(),
    ])
    const siteName = new Map(sites.map(s => [s.id, s.name]))
    // Current site: the latest active posting; for leavers, the last posting.
    const depsOf = new Map<string, typeof deps>()
    for (const d of deps) { const l = depsOf.get(d.employeeId) ?? []; l.push(d); depsOf.set(d.employeeId, l) }
    const siteOf = (empId: string) => { const l = depsOf.get(empId) ?? []; return ([...l].reverse().find(d => d.isActive) ?? l[l.length - 1])?.siteId ?? null }
    const revsOf = new Map<string, typeof revisions>()
    for (const r of revisions) { const l = revsOf.get(r.employeeId) ?? []; l.push(r); revsOf.set(r.employeeId, l) }
    const docOnce = new Map<string, (typeof docs)[number]>(), docAt = new Map<string, (typeof docs)[number]>()
    for (const d of docs) {
        const k = `${d.employeeId}:${d.typeId}`
        if (!docOnce.has(k)) docOnce.set(k, d)
        if (d.effectiveDate) { const k2 = `${k}:${ymd(d.effectiveDate)}`; if (!docAt.has(k2)) docAt.set(k2, d) }
    }
    const today = ymd(now)

    const rows: TrackerRow[] = []
    for (const r of rules) {
        const t = typeOf.get(r.typeId)!
        const repeating = REPEATING_TRIGGERS.includes(r.trigger)
        for (const e of emps) {
            const isLeft = LEFT.includes(String(e.status))
            if ((r.trigger === "EXIT") !== isLeft) continue
            const type = normalizeEmploymentType(e.employmentType)
            if (r.employmentTypes.length && !r.employmentTypes.includes(type)) continue
            const siteId = siteOf(e.id)
            if (r.siteIds.length && (!siteId || !r.siteIds.includes(siteId))) continue

            // The events this rule has for this person.
            const evs: { key: string; trigger: string; label: string | null; data: EventData }[] = []
            if (r.trigger === "JOINING" || r.trigger === "CONVERTED" || r.trigger === "APPROVED") {
                const tDate = r.trigger === "JOINING" ? e.dateOfJoining : r.trigger === "CONVERTED" ? e.createdAt : approvedAt.get(e.id) ?? null
                if (tDate) evs.push({ key: "once", trigger: ymd(tDate), label: null, data: { effectiveDay: e.dateOfJoining ? ymd(e.dateOfJoining) : null, vars: {} } })
            } else if (r.trigger === "CONFIRMATION") {
                if (e.dateOfJoining) {
                    const day = addMonths(ymd(e.dateOfJoining), r.periodMonths)
                    evs.push({ key: "once", trigger: day, label: `${r.periodMonths} months from joining`, data: { effectiveDay: day, vars: { confirmation_date: dmy(day), probation_months: String(r.periodMonths) } } })
                }
            } else if (r.trigger === "EXIT") {
                const lwd = exits.get(e.id) ?? e.dateOfLeaving
                if (lwd) { const day = ymd(lwd); evs.push({ key: "once", trigger: day, label: `Last working day ${dmy(day)}`, data: { effectiveDay: day, vars: { last_working_date: dmy(day) } } }) }
            } else if (r.trigger === "SALARY_REVISION") {
                const l = revsOf.get(e.id) ?? []
                for (let i = 1; i < l.length; i++) {
                    const prev = l[i - 1], cur = l[i]
                    const diff = Math.round(cur.ctcMonthly - prev.ctcMonthly)
                    if (!diff || (r.onlyIncrease && diff < 0) || Math.abs(diff) < r.minChange || cur.ctcMonthly <= 0) continue
                    const day = `${cur.effectiveYear}-${String(cur.effectiveMonth).padStart(2, "0")}-01`
                    const month = `${MONTHS[cur.effectiveMonth - 1]} ${cur.effectiveYear}`
                    evs.push({
                        key: day, trigger: ymd(cur.createdAt), label: `₹${money(prev.ctcMonthly)} → ₹${money(cur.ctcMonthly)} from ${month}`,
                        data: { effectiveDay: day, vars: { old_salary: money(prev.ctcMonthly), new_salary: money(cur.ctcMonthly), increment_amount: money(diff), effective_month: month, salary: String(Math.round(cur.ctcMonthly)) } },
                    })
                }
            } else if (r.trigger === "SITE_CHANGE") {
                const l = depsOf.get(e.id) ?? []
                for (let i = 1; i < l.length; i++) {
                    if (l[i].siteId === l[i - 1].siteId) continue
                    const day = ymd(l[i].startDate)
                    const from = siteName.get(l[i - 1].siteId) ?? "previous site", to = siteName.get(l[i].siteId) ?? "new site"
                    evs.push({ key: day, trigger: day, label: `${from} → ${to}`, data: { effectiveDay: day, vars: { from_site: from, to_site: to, transfer_date: dmy(day) } } })
                }
            }

            for (const ev of evs) {
                if (r.fromDate && ev.trigger < r.fromDate) continue
                const dueDate = addDays(ev.trigger, r.offsetDays)
                const d = (repeating ? docAt.get(`${e.id}:${r.typeId}:${ev.key}`) : docOnce.get(`${e.id}:${r.typeId}`)) ?? null
                const skip = skips[skipKey(e.id, r.typeId, ev.key)] ?? null
                const late = daysBetween(dueDate, today)
                const status: LetterStatus = d
                    ? (d.status === "ISSUED" ? (d.acknowledged ? "ACKNOWLEDGED" : "SENT") : "WAITING")
                    : skip ? "SKIPPED"
                    : late < 0 ? "UPCOMING" : late > settings.overdueAfterDays ? "OVERDUE" : "DUE"
                events.set(evKey(r.id, e.id, ev.key), ev.data)
                rows.push({
                    ruleId: r.id, typeId: r.typeId, typeName: t.name,
                    employeeId: e.id, code: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(), designation: e.designation, employmentType: type,
                    siteId, site: siteId ? siteName.get(siteId) ?? null : null,
                    eventKey: ev.key, event: ev.label,
                    triggerDate: ev.trigger, dueDate, daysLate: Math.max(0, late), status,
                    doc: d ? { id: d.id, docNumber: d.docNumber, status: String(d.status), issuedAt: d.issuedAt?.toISOString() ?? null, acknowledgedAt: d.acknowledgedAt?.toISOString() ?? null } : null,
                    skip,
                })
            }
        }
    }
    rows.sort((a, b) => b.daysLate - a.daysLate || a.dueDate.localeCompare(b.dueDate))
    return { types, rows, events }
}

/** Every employee (and event) each rule applies to, with the due date and whether the letter went out. */
export async function letterTracker(access: Access | null, now = new Date(), override?: LetterSettings) {
    const settings = override ?? await getLetterSettings()
    const { types, rows } = await buildRows(settings, access, now)
    return { settings, types, rows }
}

export class LetterError extends Error {}

/**
 * Make one letter from the rule's template. Types that need approval wait as
 * PENDING_APPROVAL (approved and issued in Send & issued); the rest are
 * ISSUED and appear in the employee's My Profile → Letters.
 */
export async function issueLetter(employeeId: string, rule: LetterRule, actor: { id: string; name: string } | null, ev: EventData & { eventKey: string }) {
    await ensureHrDocRecallSchema()
    const [employee, type] = await Promise.all([
        prisma.employee.findUnique({ where: { id: employeeId }, include: { branch: { include: { company: true } }, department: true, employeeSalary: { select: { ctcMonthly: true } } } }),
        prisma.hrDocumentType.findUnique({ where: { id: rule.typeId } }),
    ])
    if (!employee || !type) throw new LetterError("Employee or letter template not found")
    if (!type.isActive) throw new LetterError(`The "${type.name}" template is switched off in Send & issued`)
    if (!type.templateContent?.trim()) throw new LetterError(`The "${type.name}" template is empty`)
    const effectiveDate = ev.effectiveDay ? istDate(ev.effectiveDay) : employee.dateOfJoining
    const repeating = REPEATING_TRIGGERS.includes(rule.trigger)
    const sameType = await prisma.hrDocument.findMany({ where: { employeeId, typeId: rule.typeId, status: { notIn: ["RECALLED", "REJECTED"] as any } }, select: { effectiveDate: true } })
    if (repeating ? sameType.some(d => d.effectiveDate && ymd(d.effectiveDate) === ev.eventKey) : sameType.length > 0) throw new LetterError("Already sent")

    const content = fillTemplate(type.templateContent, { ...buildDocVars(employee, effectiveDate), ...ev.vars })
    const signer = rule.signerUserId ?? actor?.id ?? null
    const signature = signer ? await getUserSignature(signer).catch(() => null) : null
    const waiting = type.requiresApproval
    const now = new Date()
    let doc: { id: string; docNumber: string } | null = null
    for (let i = 0; i < 6 && !doc; i++) {
        try {
            doc = await prisma.hrDocument.create({
                data: {
                    docNumber: generateDocNumber(), employeeId, typeId: rule.typeId, effectiveDate, content,
                    status: waiting ? "PENDING_APPROVAL" : "ISSUED",
                    remarks: `HR letter schedule — ${LETTER_TRIGGERS[rule.trigger]}`,
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

async function issueEvents(list: { employeeId: string; rule: LetterRule; ev: (EventData & { eventKey: string }) | null }[], actor: { id: string; name: string } | null) {
    let issued = 0, waiting = 0
    const errors: string[] = []
    for (const it of list) {
        if (!it.ev) { errors.push("This letter is not due for that person any more"); continue }
        try { const d = await issueLetter(it.employeeId, it.rule, actor, it.ev); if (d.waiting) waiting++; else issued++ }
        catch (e: any) { if (!(e instanceof LetterError && e.message === "Already sent")) errors.push(e?.message || "Failed") }
    }
    if (waiting) await notifyApprovers(["documents.send"], { title: "Letters waiting for approval", message: `${waiting} HR letter(s) were created and need approval before they are issued.`, type: "document", link: "/documents/send" }, actor?.id)
    return { issued, waiting, failed: errors.length, errors: Array.from(new Set(errors)).slice(0, 5) }
}

/** Issue several (from the tracker). Returns counts and the first errors. */
export async function issueMany(items: { employeeId: string; ruleId: string; eventKey?: string }[], actor: { id: string; name: string } | null) {
    const settings = await getLetterSettings()
    const ruleOf = new Map(settings.rules.map(r => [r.id, r]))
    const { events } = await buildRows(settings, null, new Date(), Array.from(new Set(items.map(i => i.employeeId))))
    const list = items.flatMap(it => {
        const rule = ruleOf.get(it.ruleId)
        if (!rule) return []
        const key = it.eventKey || "once"
        const ev = events.get(evKey(rule.id, it.employeeId, key))
        return [{ employeeId: it.employeeId, rule, ev: ev ? { ...ev, eventKey: key } : null }]
    })
    const res = await issueEvents(list, actor)
    const missing = items.length - list.length
    return missing ? { ...res, failed: res.failed + missing, errors: ["Rule not found", ...res.errors].slice(0, 5) } : res
}

export async function setSkipped(items: { employeeId: string; typeId: string; eventKey?: string | null }[], reason: string | null, actor: { id: string; name: string }) {
    const skips = await getSkips()
    for (const it of items) {
        const k = skipKey(it.employeeId, it.typeId, it.eventKey)
        if (reason) skips[k] = { reason: reason.slice(0, 200), by: actor.name, at: new Date().toISOString() }
        else delete skips[k]
    }
    await saveSkips(skips, actor.id)
}

/** Daily job: issue letters that are due under rules with automatic issue on. */
export async function runDueLetters(now = new Date()) {
    const settings = await getLetterSettings()
    const auto = new Map(settings.rules.filter(r => r.enabled && r.autoIssue && !isOnDemand(r.trigger)).map(r => [r.id, r]))
    if (!auto.size) return { issued: 0, waiting: 0, failed: 0 }
    const { rows, events } = await buildRows(settings, null, now)
    const due = rows.filter(r => auto.has(r.ruleId) && (r.status === "DUE" || r.status === "OVERDUE")).slice(0, settings.maxPerRun)
    const res = await issueEvents(due.map(r => {
        const ev = events.get(evKey(r.ruleId, r.employeeId, r.eventKey))
        return { employeeId: r.employeeId, rule: auto.get(r.ruleId)!, ev: ev ? { ...ev, eventKey: r.eventKey } : null }
    }), null)
    if (due.length) auditLater({ actorName: "Daily job", action: "letters.auto_issue", targetType: "HrDocument", targetName: `${due.length} letter(s)`, summary: `HR letters: ${res.issued} issued, ${res.waiting} waiting for approval, ${res.failed} failed` })
    return res
}
