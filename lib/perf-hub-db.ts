import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import type { Session } from "next-auth"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canManagePerfHub, canSelfServePerfHub, canViewPerfHub } from "@/lib/permissions"
import { isMissingTableErr, isUniqueErr } from "@/lib/asset-workflow"
import { UNASSIGNABLE_EMPLOYEE_STATUSES } from "@/lib/employee-filter"
import {
    PERF_HUB_MISSING_MESSAGE, FREQUENCIES, VALUE_TYPES, DIRECTIONS, ROLLUPS, SOURCE_TYPES, REGISTER_MODES,
    AGGREGATES, SYSTEM_METRIC_KEYS, isOneOf, istDay, addDays, periodWindow, achievement, rag, reportScore,
    registerValue, kpiKey, monthlyBreakdown, compliance, type Period, type RegisterField, type ScoreKra,
    type Observation,
} from "@/lib/perf-hub"

// Database side of the Performance Hub: request context, error mapping,
// template/KPI validation, AUTO values, report recompute and scorecards.

export { isUniqueErr }

/** An expected, user-facing failure: the route turns it into { error } + status. */
export class PerfHubError extends Error {
    status: number
    constructor(status: number, message: string) {
        super(message)
        this.status = status
    }
}

export const jsonError = (status: number, error: string) => NextResponse.json({ error }, { status })

/** Uniform error → response mapping for every perf-hub route. */
export function perfErrorResponse(e: unknown, tag: string) {
    if (e instanceof PerfHubError) return jsonError(e.status, e.message)
    if (isMissingTableErr(e)) return jsonError(503, PERF_HUB_MISSING_MESSAGE)
    console.error(tag, e)
    return jsonError(500, "Internal Error")
}

export const EMPLOYEE_SELECT = { id: true, employeeId: true, firstName: true, lastName: true, designation: true } as const

// ─── Request context ─────────────────────────────────────────────────────────

export type PerfCtx = {
    session: Session
    userId: string
    isManager: boolean   // performance.manage
    canView: boolean     // performance.view or manage
    selfServe: boolean   // self.view or any performance permission
    employee: { id: string; userId: string | null } | null // the caller's own employee record
}

/** Session + permissions + the caller's employee record, or throws 401. */
export async function perfCtx(req: Request): Promise<PerfCtx> {
    const session = await getApiSession(req)
    if (!session?.user?.id) throw new PerfHubError(401, "Unauthorized")
    const userId = session.user.id
    const employee = await prisma.employee.findUnique({ where: { userId }, select: { id: true, userId: true } }).catch(() => null)
    return {
        session, userId, employee,
        isManager: canManagePerfHub(session),
        canView: canViewPerfHub(session),
        selfServe: canSelfServePerfHub(session),
    }
}

export function requireManager(ctx: PerfCtx) {
    if (!ctx.isManager) throw new PerfHubError(403, "Forbidden")
}

export function myEmployeeId(ctx: PerfCtx): string {
    if (!ctx.employee) throw new PerfHubError(400, "Your login isn't linked to an employee record")
    return ctx.employee.id
}

/** Employee ids whose PerfAssignment names me as reviewer. */
export async function revieweeIds(userId: string): Promise<string[]> {
    const rows = await prisma.perfAssignment.findMany({ where: { reviewerUserId: userId }, select: { employeeId: true } })
    return rows.map(r => r.employeeId)
}

export async function isReviewerOf(userId: string, employeeId: string): Promise<boolean> {
    const a = await prisma.perfAssignment.findUnique({ where: { employeeId }, select: { reviewerUserId: true } })
    return !!a && a.reviewerUserId === userId
}

/** May the caller read this employee's Performance Hub data? */
export async function canSeeEmployee(ctx: PerfCtx, employeeId: string): Promise<boolean> {
    if (ctx.canView || ctx.employee?.id === employeeId) return true
    return isReviewerOf(ctx.userId, employeeId)
}

// ─── Templates ───────────────────────────────────────────────────────────────

export const TEMPLATE_INCLUDE = {
    kras: {
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
        include: { kpis: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    },
} satisfies Prisma.PerfTemplateInclude

export async function loadTemplate(id: string) {
    const t = await prisma.perfTemplate.findUnique({ where: { id }, include: TEMPLATE_INCLUDE })
    if (!t) throw new PerfHubError(404, "Template not found")
    return t
}

/** Structure edits are only allowed on drafts. */
export async function assertDraft(templateId: string) {
    const t = await prisma.perfTemplate.findUnique({ where: { id: templateId }, select: { status: true } })
    if (!t) throw new PerfHubError(404, "Template not found")
    if (t.status === "PUBLISHED") throw new PerfHubError(409, "Published — create a new version")
    if (t.status !== "DRAFT") throw new PerfHubError(409, "Archived — create a new version from the published one")
}

/** The live (PUBLISHED) version of each family. */
export async function publishedByFamily(familyIds: string[]) {
    if (!familyIds.length) return new Map<string, { id: string; name: string; version: number; roleLabel: string | null }>()
    const rows = await prisma.perfTemplate.findMany({
        where: { familyId: { in: familyIds }, status: "PUBLISHED" },
        select: { id: true, name: true, version: true, roleLabel: true, familyId: true },
    })
    return new Map(rows.map(r => [r.familyId, r]))
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const optStr = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)

function num(v: unknown, label: string, opts: { min?: number; max?: number } = {}): number {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v
    if (typeof n !== "number" || !Number.isFinite(n)) throw new PerfHubError(400, `${label} must be a number`)
    if (opts.min !== undefined && n < opts.min) throw new PerfHubError(400, `${label} can't be below ${opts.min}`)
    if (opts.max !== undefined && n > opts.max) throw new PerfHubError(400, `${label} can't be above ${opts.max}`)
    return n
}

function pick<T extends string>(list: readonly T[], v: unknown, label: string): T {
    if (!isOneOf(list, v)) throw new PerfHubError(400, `${label} must be one of ${list.join(", ")}`)
    return v
}

type Body = Record<string, unknown>
const asBody = (v: unknown): Body => (v && typeof v === "object" ? (v as Body) : {})

export function parseKraInput(raw: unknown, partial: boolean) {
    const body = asBody(raw)
    const data: { title?: string; weight?: number; sortOrder?: number } = {}
    if (!partial || body?.title !== undefined) {
        const title = str(body?.title)
        if (!title) throw new PerfHubError(400, "KRA title is required")
        data.title = title
    }
    if (!partial || body?.weight !== undefined) data.weight = num(body?.weight ?? 0, "KRA weight", { min: 0, max: 100 })
    if (body?.sortOrder !== undefined) data.sortOrder = Math.trunc(num(body.sortOrder, "sortOrder"))
    return data
}

type KpiRow = Prisma.PerfTemplateKpiUncheckedCreateInput

/**
 * Validate KPI fields (all for create, only those present for update), merge
 * with the existing row, and clear source bindings that no longer apply.
 */
export async function normalizeKpi(body: unknown, existing?: KpiRow): Promise<Partial<KpiRow>> {
    const b = asBody(body)
    const has = (k: string) => existing ? b[k] !== undefined : true
    const d: Partial<KpiRow> = {}

    if (has("name")) {
        const name = str(b.name)
        if (!name) throw new PerfHubError(400, "KPI name is required")
        d.name = name
    }
    if (b.code !== undefined) d.code = optStr(b.code, 40)
    if (b.measurable !== undefined) d.measurable = optStr(b.measurable, 500)
    if (b.targetLabel !== undefined) d.targetLabel = optStr(b.targetLabel, 60)
    if (has("frequency")) d.frequency = pick(FREQUENCIES, b.frequency, "Frequency")
    if (has("valueType")) d.valueType = pick(VALUE_TYPES, b.valueType, "Value type")
    if (b.direction !== undefined || !existing) d.direction = pick(DIRECTIONS, b.direction ?? "HIGHER", "Direction")
    if (has("target")) {
        const vt = d.valueType ?? existing?.valueType
        d.target = num(b.target ?? (vt === "YESNO" ? 1 : undefined), "Target")
    }
    if (has("weightage")) d.weightage = num(b.weightage ?? 0, "Weightage", { min: 0, max: 100 })
    if (b.rollup !== undefined || !existing) d.rollup = pick(ROLLUPS, b.rollup ?? "AVG", "Roll-up")
    if (b.greenAt !== undefined) d.greenAt = num(b.greenAt, "Green threshold", { min: 0 })
    if (b.amberAt !== undefined) d.amberAt = num(b.amberAt, "Amber threshold", { min: 0 })
    if (b.evidenceRequired !== undefined) d.evidenceRequired = !!b.evidenceRequired
    if (b.sourceType !== undefined || !existing) d.sourceType = pick(SOURCE_TYPES, b.sourceType ?? "MANUAL", "Source")
    if (b.registerId !== undefined) d.registerId = optStr(b.registerId, 64)
    if (b.registerMode !== undefined) d.registerMode = b.registerMode ? pick(REGISTER_MODES, b.registerMode, "Register mode") : null
    if (b.valueField !== undefined) d.valueField = optStr(b.valueField, 50)
    if (b.numeratorField !== undefined) d.numeratorField = optStr(b.numeratorField, 50)
    if (b.denominatorField !== undefined) d.denominatorField = optStr(b.denominatorField, 50)
    if (b.aggregate !== undefined) d.aggregate = b.aggregate ? pick(AGGREGATES, b.aggregate, "Aggregate") : null
    if (b.systemMetric !== undefined) d.systemMetric = b.systemMetric ? pick(SYSTEM_METRIC_KEYS, b.systemMetric, "System metric") : null
    if (b.sortOrder !== undefined) d.sortOrder = Math.trunc(num(b.sortOrder, "sortOrder"))

    const m = { greenAt: 95, amberAt: 80, ...existing, ...d } as KpiRow
    if ((m.amberAt ?? 80) > (m.greenAt ?? 95)) throw new PerfHubError(400, "Amber threshold can't be above green")

    if (m.sourceType === "REGISTER") {
        if (!m.registerId) throw new PerfHubError(400, "Pick the register this KPI reads")
        const reg = await prisma.perfRegister.findUnique({ where: { id: m.registerId }, select: { fields: true } })
        if (!reg) throw new PerfHubError(400, "Register not found")
        const keys = new Set(((reg.fields as unknown as RegisterField[]) ?? []).map(f => f.key))
        const mode = m.registerMode ?? "SINGLE"
        d.registerMode = mode
        const need = (k: string | null | undefined, label: string) => {
            if (!k) throw new PerfHubError(400, `Pick the register ${label}`)
            if (!keys.has(k)) throw new PerfHubError(400, `Register has no field "${k}"`)
        }
        if (mode === "RATIO") {
            need(m.numeratorField, "numerator field")
            need(m.denominatorField, "denominator field")
            d.valueField = null
            d.aggregate = null
        } else {
            d.aggregate = m.aggregate ?? "SUM"
            if (d.aggregate !== "COUNT") need(m.valueField, "value field")
            d.numeratorField = null
            d.denominatorField = null
        }
    } else {
        Object.assign(d, { registerId: null, registerMode: null, valueField: null, numeratorField: null, denominatorField: null, aggregate: null })
    }
    if (m.sourceType === "SYSTEM") {
        if (!m.systemMetric) throw new PerfHubError(400, "Pick the system metric this KPI reads")
    } else {
        d.systemMetric = null
    }
    return d
}

// ─── AUTO values ─────────────────────────────────────────────────────────────

type AutoKpi = {
    id: string
    sourceType: string
    registerId: string | null
    registerMode: string | null
    valueField: string | null
    numeratorField: string | null
    denominatorField: string | null
    aggregate: string | null
    systemMetric: string | null
}

const INTERVIEW_MOVES = ["→ Interview Scheduled", "→ Interview Done", "→ INTERVIEW_SCHEDULED", "→ INTERVIEW_DONE"]
const JOIN_MOVES = ["→ Joined", "→ On-site Joined", "→ ON_SITE_JOINED", "converted to Employee"]

/**
 * Leads whose status moved (per the LeadActivity "status_change" trail) into
 * one of `moves` during the window, where the user made the move or owns the
 * lead. Distinct leads, so Scheduled → Done counts once. Lead has no status
 * history table; the activity text ("Status changed: X → Interview Scheduled")
 * is the only record of a move. A lead created directly in that status has no
 * such row and isn't counted.
 */
async function leadMoves(userId: string, moves: string[], window: { gte: Date; lt: Date }): Promise<number> {
    const rows = await prisma.leadActivity.findMany({
        where: {
            type: "status_change",
            createdAt: window,
            OR: moves.map(m => ({ content: { contains: m, mode: "insensitive" as const } })),
            AND: [{ OR: [{ userId }, { lead: { assignedTo: userId } }] }],
        },
        distinct: ["leadId"],
        select: { leadId: true },
    })
    return rows.length
}

/** A SYSTEM metric for one employee over a period; null when it can't be measured. */
export async function systemMetricValue(metric: string, emp: { id: string; userId: string | null }, period: Period): Promise<number | null> {
    const window = periodWindow(period)
    const uid = emp.userId
    switch (metric) {
        case "recruitment.leads_created":
            return uid ? prisma.lead.count({ where: { createdBy: uid, createdAt: window } }) : null
        case "recruitment.interviews":
            return uid ? leadMoves(uid, INTERVIEW_MOVES, window) : null
        case "recruitment.joined":
            return uid ? leadMoves(uid, JOIN_MOVES, window) : null
        case "inspections.submitted":
            return uid ? prisma.inspection.count({ where: { submittedBy: uid, submittedAt: window, status: { in: ["pending", "approved"] } } }) : null
        case "inspections.approved":
            return uid ? prisma.inspection.count({ where: { submittedBy: uid, status: "approved", approvedAt: window } }) : null
        case "fieldtasks.completed":
            // Older completions have no completedAt; their last update stands in.
            return prisma.fieldTask.count({
                where: {
                    employeeId: emp.id, status: "COMPLETED",
                    OR: [{ completedAt: window }, { completedAt: null, updatedAt: window }],
                },
            })
        default:
            return null
    }
}

/** REGISTER / SYSTEM values for a set of KPIs over one period. */
export async function computeAutoValues(kpis: AutoKpi[], emp: { id: string; userId: string | null }, period: Period) {
    const out = new Map<string, number | null>()
    const regKpis = kpis.filter(k => k.sourceType === "REGISTER" && k.registerId)
    if (regKpis.length) {
        const entries = await prisma.perfRegisterEntry.findMany({
            where: {
                employeeId: emp.id,
                registerId: { in: Array.from(new Set(regKpis.map(k => k.registerId!))) },
                date: { gte: period.start, lt: addDays(period.end, 1) },
            },
            select: { registerId: true, date: true, values: true },
        })
        for (const k of regKpis) out.set(k.id, registerValue(k, entries.filter(e => e.registerId === k.registerId)))
    }
    for (const k of kpis.filter(k => k.sourceType === "SYSTEM" && k.systemMetric)) {
        out.set(k.id, await systemMetricValue(k.systemMetric!, emp, period))
    }
    return out
}

/**
 * Re-read the AUTO values of a report. A computed value always wins; when
 * nothing can be computed, an earlier auto value is cleared but a manual
 * fallback someone typed in is left alone.
 */
export async function refreshAutoValues(reportId: string) {
    const r = await prisma.perfReport.findUnique({
        where: { id: reportId },
        include: { employee: { select: { id: true, userId: true } }, values: true },
    })
    if (!r) throw new PerfHubError(404, "Report not found")
    const kpis = await prisma.perfTemplateKpi.findMany({
        where: { templateId: r.templateId, frequency: r.frequency, sourceType: { in: ["REGISTER", "SYSTEM"] } },
    })
    if (!kpis.length) return
    const computed = await computeAutoValues(kpis, r.employee, { start: r.periodStart, end: r.periodEnd })
    for (const k of kpis) {
        const v = computed.get(k.id) ?? null
        const row = r.values.find(x => x.kpiId === k.id)
        if (v !== null) {
            await prisma.perfReportValue.upsert({
                where: { reportId_kpiId: { reportId, kpiId: k.id } },
                create: { reportId, kpiId: k.id, actual: v, isAuto: true },
                update: { actual: v, isAuto: true },
            })
        } else if (row?.isAuto && row.actual !== null) {
            await prisma.perfReportValue.update({ where: { id: row.id }, data: { actual: null } })
        }
    }
}

/** Achievement / RAG on every value, then the report score. */
export async function recomputeReport(reportId: string) {
    const values = await prisma.perfReportValue.findMany({ where: { reportId }, include: { kpi: true } })
    const scored: { weightage: number; achievementPct: number | null }[] = []
    for (const v of values) {
        const ach = achievement(v.kpi, v.actual)
        const r = rag(v.kpi, ach)
        if (ach !== v.achievementPct || r !== v.rag) {
            await prisma.perfReportValue.update({ where: { id: v.id }, data: { achievementPct: ach, rag: r } })
        }
        scored.push({ weightage: v.kpi.weightage, achievementPct: ach })
    }
    await prisma.perfReport.update({ where: { id: reportId }, data: { score: reportScore(scored) } })
}

export async function logActivity(reportId: string, action: string, userId: string, note?: string | null) {
    await prisma.perfReportActivity.create({ data: { reportId, action, userId, note: note || null } })
}

// ─── Report detail ───────────────────────────────────────────────────────────

/** Full report for the screen: KRAs → this frequency's KPIs with values, activity, and what I may do. */
export async function reportDetail(reportId: string, ctx: PerfCtx) {
    const r = await prisma.perfReport.findUnique({
        where: { id: reportId },
        include: {
            employee: { select: { ...EMPLOYEE_SELECT, userId: true, perfAssignment: { select: { reviewer: { select: { id: true, name: true } } } } } },
            template: { select: { id: true, name: true, version: true, roleLabel: true } },
            values: true,
            activity: { orderBy: { createdAt: "asc" } },
        },
    })
    if (!r) throw new PerfHubError(404, "Report not found")
    const isOwner = !!r.employee.userId && r.employee.userId === ctx.userId
    const reviewer = r.employee.perfAssignment?.reviewer ?? null
    const isReviewer = reviewer?.id === ctx.userId
    if (!isOwner && !isReviewer && !ctx.canView) throw new PerfHubError(403, "Forbidden")

    const kras = await prisma.perfTemplateKra.findMany({
        where: { templateId: r.templateId },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
        include: { kpis: { where: { frequency: r.frequency }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    })
    const valueOf = new Map(r.values.map(v => [v.kpiId, v]))
    const userIds = Array.from(new Set(r.activity.map(a => a.userId)))
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : []
    const nameOf = new Map(users.map(u => [u.id, u.name]))

    const editable = r.status === "DRAFT" || r.status === "RETURNED"
    const canEdit = editable && (isOwner || ctx.isManager)
    const e = r.employee
    return {
        id: r.id, employeeId: r.employeeId, templateId: r.templateId, frequency: r.frequency,
        periodStart: r.periodStart, periodEnd: r.periodEnd, status: r.status, score: r.score,
        submittedAt: r.submittedAt, decidedBy: r.decidedBy, decidedAt: r.decidedAt, decisionNote: r.decisionNote,
        createdAt: r.createdAt, updatedAt: r.updatedAt,
        template: r.template,
        employee: { id: e.id, employeeId: e.employeeId, firstName: e.firstName, lastName: e.lastName, designation: e.designation },
        reviewer,
        kras: kras.filter(k => k.kpis.length).map(k => ({
            id: k.id, title: k.title, weight: k.weight, sortOrder: k.sortOrder,
            kpis: k.kpis.map(kpi => {
                const v = valueOf.get(kpi.id)
                return {
                    ...kpi,
                    value: v ? { actual: v.actual, isAuto: v.isAuto, achievementPct: v.achievementPct, rag: v.rag, remark: v.remark, evidenceUrl: v.evidenceUrl } : null,
                }
            }),
        })),
        activity: r.activity.map(a => ({ action: a.action, user: { name: nameOf.get(a.userId) ?? "Unknown" }, note: a.note, createdAt: a.createdAt })),
        canEdit,
        canSubmit: canEdit,
        canReview: r.status === "SUBMITTED" && (isReviewer || ctx.isManager) && !isOwner,
    }
}

// ─── Notifications ───────────────────────────────────────────────────────────

/** Best effort: a notification failing must never fail the action that caused it. */
export async function notifyUser(userId: string, note: { title: string; message: string; link?: string }) {
    try {
        await prisma.notification.create({ data: { userId, type: "performance", ...note } })
    } catch (e) {
        console.error("[PERF_HUB_NOTIFY]", e)
    }
}

// ─── Scorecards ──────────────────────────────────────────────────────────────

/**
 * Monthly scorecards for the given employees (null = everyone assigned).
 * The month is scored on the template of the latest report filed in it (or
 * the live version when none was), with KPIs matched across versions.
 */
export async function buildScorecards(employeeIds: string[] | null, month: Period, approvedOnly: boolean) {
    const assignments = await prisma.perfAssignment.findMany({
        where: {
            ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
            employee: { status: { notIn: [...UNASSIGNABLE_EMPLOYEE_STATUSES] } },
        },
        include: { employee: { select: EMPLOYEE_SELECT } },
        orderBy: [{ employee: { firstName: "asc" } }, { employee: { lastName: "asc" } }],
    })
    const empIds = assignments.map(a => a.employeeId)
    const [published, reports] = await Promise.all([
        publishedByFamily(Array.from(new Set(assignments.map(a => a.templateFamilyId)))),
        prisma.perfReport.findMany({
            where: { employeeId: { in: empIds }, periodStart: { gte: month.start, lte: month.end } },
            select: {
                id: true, employeeId: true, templateId: true, frequency: true, periodStart: true, status: true, createdAt: true,
                values: { where: { actual: { not: null } }, select: { kpiId: true, actual: true } },
            },
            orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }],
        }),
    ])
    const templateIds = new Set<string>(reports.map(r => r.templateId))
    Array.from(published.values()).forEach(p => templateIds.add(p.id))
    const templates = await prisma.perfTemplate.findMany({ where: { id: { in: Array.from(templateIds) } }, include: TEMPLATE_INCLUDE })
    const templateById = new Map(templates.map(t => [t.id, t]))
    const keyOf = new Map<string, string>()
    for (const t of templates) for (const kra of t.kras) for (const kpi of kra.kpis) keyOf.set(kpi.id, kpiKey(kra.title, kpi))

    const today = istDay()
    const counted = approvedOnly ? ["APPROVED"] : ["SUBMITTED", "APPROVED"]

    return assignments.map(a => {
        const mine = reports.filter(r => r.employeeId === a.employeeId)
        const latest = mine[mine.length - 1]
        const template = templateById.get(latest?.templateId ?? published.get(a.templateFamilyId)?.id ?? "") ?? null
        const kras: ScoreKra[] = (template?.kras ?? []).map(kra => ({
            id: kra.id, title: kra.title, weight: kra.weight,
            kpis: kra.kpis.map(kpi => ({ ...kpi, key: kpiKey(kra.title, kpi) })),
        }))
        const obs: Observation[] = []
        for (const r of mine) {
            if (!counted.includes(r.status)) continue
            for (const v of r.values) {
                const key = keyOf.get(v.kpiId)
                if (key && v.actual !== null) obs.push({ key, frequency: r.frequency, periodStart: r.periodStart, actual: v.actual })
            }
        }
        const breakdown = monthlyBreakdown(kras, obs)
        const filed: Record<string, number> = {}
        for (const r of mine) if (r.status === "SUBMITTED" || r.status === "APPROVED") filed[r.frequency] = (filed[r.frequency] ?? 0) + 1
        const frequencies = kras.flatMap(k => k.kpis.map(x => x.frequency))
        return {
            employee: a.employee,
            roleLabel: template?.roleLabel ?? null,
            template: template ? { id: template.id, name: template.name, version: template.version } : null,
            breakdown,
            overall: breakdown.overall,
            grade: breakdown.grade,
            compliance: compliance(frequencies, month, today, filed, a.effectiveFrom ? istDay(a.effectiveFrom) : null),
            red: breakdown.redKpis,
            pending: mine.filter(r => r.status === "SUBMITTED").length,
        }
    })
}
