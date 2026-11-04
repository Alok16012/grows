// New joiners: who has joined recently, and whether they have a site yet.
//
// Worked out live from Employee + Deployment on every request, never stored as
// notification messages, so it cannot go stale: the moment a posting is saved
// — from the alert, the Deployments screen, an import, the join link,
// recruitment or external onboarding — the person leaves "Needs a site".
// The permanent record of each step is in the AuditLog (lib/site-history).

import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { employeeScope, type Access } from "@/lib/access"
import { SITE_HISTORY_ACTIONS, siteChangeSummary, niceDay } from "@/lib/site-history"

/** Someone counts as a new joiner for this many days after joining (or being added). */
export const NEW_JOINER_DAYS = 30
/** People joining up to this many days ahead are shown too, so a site can be lined up. */
export const UPCOMING_DAYS = 60
/** A new joiner stays in "Recently deployed" this long after getting a site. */
export const RECENT_DEPLOY_DAYS = 7

const DAY = 86_400_000
const STATUSES = ["ACTIVE", "ON_LEAVE", "ONBOARDING"] as const

export type NewJoiner = {
    id: string
    code: string
    name: string
    designation: string | null
    department: string | null
    status: string
    /** Still in onboarding (not yet approved; may carry a PENDING-… code). */
    onboarding: boolean
    joiningDate: string | null
    addedOn: string
    addedBy: string | null
    /** Join link, Employee form, Recruitment… — recorded, or read from the data for older records. */
    addedFrom: AddedFrom
    /** Days since they were added, while they have no site. */
    daysWithoutSite: number | null
    /** Days until joining, for someone joining in the future. */
    joinsInDays: number | null
    site: { id: string; name: string; code: string | null; since: string; assignedOn: string; assignedBy: string | null } | null
}

export type NewJoinersResult = {
    needsSite: NewJoiner[]
    recentlyDeployed: NewJoiner[]
    windowDays: number
    recentDays: number
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const days = (ms: number) => Math.max(0, Math.floor(ms / DAY))

/** The Prisma filter for "joined (or was added) recently". */
export function newJoinerWhere(now = new Date()): Prisma.EmployeeWhereInput {
    // Whole days, both ends included: joined up to 30 days ago, joining up to
    // 60 days ahead. Joining dates are stored as midnight UTC of the day.
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const since = new Date(today - NEW_JOINER_DAYS * DAY)
    const until = new Date(today + (UPCOMING_DAYS + 1) * DAY - 1)
    return {
        status: { in: [...STATUSES] },
        OR: [
            { dateOfJoining: { gte: since, lte: until } },
            { dateOfJoining: null, createdAt: { gte: since } },
            // Still onboarding and added recently, whatever date was typed in.
            { status: "ONBOARDING", createdAt: { gte: since } },
        ],
    }
}

async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const list = Array.from(new Set(ids.filter((x): x is string => !!x)))
    if (!list.length) return new Map()
    const users = await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true, email: true } })
    return new Map(users.map(u => [u.id, u.name || u.email || "—"]))
}

// ─── How someone was added, for people added before records were kept ───────
//
// Each add route leaves a trace that tells them apart: the join link files a
// candidate (Lead, source "External Onboarding") linked to the employee;
// recruitment conversion links the candidate it converted; the Employee form
// sets a creator and opens an onboarding record; bulk import sets a creator
// and opens none. Anyone matching none of these stays unknown — no guess.
export type AddedFrom = { source: string; inferred: boolean } | null

export function inferAddedFrom(e: { createdBy: string | null; onboardingRecord: { status: string } | null }, leadSource: string | null | undefined): string | null {
    if (leadSource === "External Onboarding") return "Join link"
    if (leadSource) return "Recruitment"
    if (e.createdBy && e.onboardingRecord) return "Employee form"
    if (e.createdBy && !e.onboardingRecord) return "Bulk import"
    return null
}

/** Lead source per converted employee id. */
async function leadSources(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map()
    const leads = await prisma.lead.findMany({ where: { convertedEmployeeId: { in: ids } }, select: { convertedEmployeeId: true, source: true } })
    return new Map(leads.map(l => [l.convertedEmployeeId!, l.source]))
}

/** How each person was added: their record if there is one, else read from the data. */
async function addedFromMap(rows: { id: string; createdBy: string | null; onboardingRecord: { status: string } | null }[]): Promise<Map<string, AddedFrom>> {
    const ids = rows.map(r => r.id)
    if (!ids.length) return new Map()
    const [logs, leads] = await Promise.all([
        prisma.auditLog.findMany({
            where: { targetType: "Employee", targetId: { in: ids }, action: "employee.create" },
            select: { targetId: true, after: true }, orderBy: { at: "asc" },
        }),
        leadSources(ids),
    ])
    const out = new Map<string, AddedFrom>()
    for (const l of logs) {
        const s = ((l.after ?? {}) as { source?: string }).source
        if (s && !out.has(l.targetId!)) out.set(l.targetId!, { source: s, inferred: false })
    }
    for (const r of rows) {
        if (out.has(r.id)) continue
        const s = inferAddedFrom(r, leads.get(r.id))
        if (s) out.set(r.id, { source: s, inferred: true })
    }
    return out
}

/** "Self (link)" for the join link's own sign-ups, which have no creator. */
const selfIfLink = (source: string | null | undefined) => (source === "Join link" ? "Self (link)" : null)

const employeeSelect = {
    id: true, employeeId: true, firstName: true, lastName: true, designation: true, status: true,
    dateOfJoining: true, createdAt: true, createdBy: true,
    department: { select: { name: true } },
    onboardingRecord: { select: { status: true } },
    deployments: {
        orderBy: { createdAt: "asc" as const },
        select: { id: true, isActive: true, startDate: true, createdAt: true, createdBy: true, site: { select: { id: true, name: true, code: true } } },
    },
} satisfies Prisma.EmployeeSelect

type EmpRow = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>

function toJoiner(e: EmpRow, names: Map<string, string>, now: Date, from: AddedFrom): NewJoiner {
    const active = e.deployments.filter(d => d.isActive).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    const joinsIn = e.dateOfJoining && e.dateOfJoining.getTime() > now.getTime() ? Math.ceil((e.dateOfJoining.getTime() - now.getTime()) / DAY) : null
    return {
        id: e.id,
        code: e.employeeId,
        name: `${e.firstName} ${e.lastName}`.trim(),
        designation: e.designation,
        department: e.department?.name ?? null,
        status: e.status,
        onboarding: e.status === "ONBOARDING" || (!!e.onboardingRecord && e.onboardingRecord.status !== "COMPLETED"),
        joiningDate: iso(e.dateOfJoining),
        addedOn: e.createdAt.toISOString(),
        addedBy: (e.createdBy ? names.get(e.createdBy) ?? null : null) ?? selfIfLink(from?.source),
        addedFrom: from,
        daysWithoutSite: active ? null : days(now.getTime() - e.createdAt.getTime()),
        joinsInDays: joinsIn,
        site: active ? {
            id: active.site.id, name: active.site.name, code: active.site.code,
            since: active.startDate.toISOString(), assignedOn: active.createdAt.toISOString(),
            assignedBy: active.createdBy ? names.get(active.createdBy) ?? null : null,
        } : null,
    }
}

/** The live alert: new joiners without a site, and those deployed in the last week. */
export async function listNewJoiners(access: Access, now = new Date()): Promise<NewJoinersResult> {
    const scope = await employeeScope(access)
    const where: Prisma.EmployeeWhereInput = scope ? { AND: [newJoinerWhere(now), scope] } : newJoinerWhere(now)
    const rows = await prisma.employee.findMany({ where, select: employeeSelect, take: 500 })
    const names = await userNames(rows.flatMap(r => [r.createdBy, ...r.deployments.map(d => d.createdBy)]))
    const sources = await addedFromMap(rows)
    const all = rows.map(r => toJoiner(r, names, now, sources.get(r.id) ?? null))
    const recentSince = now.getTime() - RECENT_DEPLOY_DAYS * DAY
    const needsSite = all.filter(j => !j.site)
        // Longest-waiting first; future joiners after everyone who has already joined.
        .sort((a, b) => (a.joinsInDays ?? -1) - (b.joinsInDays ?? -1) || (b.daysWithoutSite ?? 0) - (a.daysWithoutSite ?? 0))
    const recentlyDeployed = all.filter(j => j.site && new Date(j.site.assignedOn).getTime() >= recentSince)
        .sort((a, b) => b.site!.assignedOn.localeCompare(a.site!.assignedOn))
    return { needsSite, recentlyDeployed, windowDays: NEW_JOINER_DAYS, recentDays: RECENT_DEPLOY_DAYS }
}

/** Counts only, for the top-bar badge poll. */
export async function countNewJoiners(access: Access, now = new Date()) {
    const scope = await employeeScope(access)
    const base = scope ? { AND: [newJoinerWhere(now), scope] } : newJoinerWhere(now)
    const recentSince = new Date(now.getTime() - RECENT_DEPLOY_DAYS * DAY)
    const [needsSite, recentlyDeployed] = await Promise.all([
        prisma.employee.count({ where: { AND: [base, { deployments: { none: { isActive: true } } }] } }),
        prisma.employee.count({ where: { AND: [base, { deployments: { some: { isActive: true, createdAt: { gte: recentSince } } } }] } }),
    ])
    return { needsSite, recentlyDeployed }
}

// ─── Register (the record) ───────────────────────────────────────────────────

export type RegisterRow = {
    id: string
    code: string
    name: string
    designation: string | null
    department: string | null
    status: string
    joiningDate: string | null
    addedOn: string
    addedBy: string | null
    source: string | null
    /** True when `source` was read from the data (added before records were kept). */
    sourceInferred: boolean
    firstSite: string | null
    firstSiteFrom: string | null
    assignedOn: string | null
    assignedBy: string | null
    /** Days from being added to getting a first site; null while still waiting. */
    daysToAssign: number | null
    /** Days waiting so far, while there is no site. */
    waitingDays: number | null
    currentSite: string | null
    siteChanges: number
}

/** Everyone who joined in [from, to] (any status, leavers too), with how and when they got a site. */
export async function newJoinerRegister(access: Access, opts: { from: Date; to: Date; siteId?: string | null }, now = new Date()): Promise<RegisterRow[]> {
    const scope = await employeeScope(access)
    const inRange: Prisma.EmployeeWhereInput = {
        OR: [
            { dateOfJoining: { gte: opts.from, lte: opts.to } },
            { dateOfJoining: null, createdAt: { gte: opts.from, lte: opts.to } },
        ],
    }
    const and: Prisma.EmployeeWhereInput[] = [inRange]
    if (scope) and.push(scope)
    if (opts.siteId) and.push({ deployments: { some: { siteId: opts.siteId } } })
    const rows = await prisma.employee.findMany({
        where: { AND: and }, select: employeeSelect,
        orderBy: [{ dateOfJoining: "desc" }, { createdAt: "desc" }], take: 5000,
    })
    const ids = rows.map(r => r.id)
    // The record of how each person was added and first posted, where it exists
    // (rows from before records were kept have none: the deployment fills in).
    const logs = ids.length ? await prisma.auditLog.findMany({
        where: { targetType: "Employee", targetId: { in: ids }, action: { in: ["employee.create", "deployment.assign", "deployment.move"] } },
        select: { targetId: true, action: true, actorName: true, at: true, after: true },
        orderBy: { at: "asc" },
    }) : []
    const created = new Map<string, { actor: string | null }>()
    const firstAssign = new Map<string, { actor: string | null }>()
    for (const l of logs) {
        if (l.action === "employee.create" && !created.has(l.targetId!)) created.set(l.targetId!, { actor: l.actorName })
        if (l.action !== "employee.create" && !firstAssign.has(l.targetId!)) firstAssign.set(l.targetId!, { actor: l.actorName })
    }
    const [names, sources] = await Promise.all([
        userNames(rows.flatMap(r => [r.createdBy, ...r.deployments.map(d => d.createdBy)])),
        addedFromMap(rows),
    ])
    return rows.map(e => {
        const first = e.deployments[0]
        const current = e.deployments.filter(d => d.isActive).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
        const c = created.get(e.id)
        const from = sources.get(e.id) ?? null
        return {
            id: e.id,
            code: e.employeeId,
            name: `${e.firstName} ${e.lastName}`.trim(),
            designation: e.designation,
            department: e.department?.name ?? null,
            status: e.status,
            joiningDate: iso(e.dateOfJoining),
            addedOn: e.createdAt.toISOString(),
            addedBy: (e.createdBy ? names.get(e.createdBy) : null) ?? c?.actor ?? selfIfLink(from?.source),
            source: from?.source ?? null,
            sourceInferred: from?.inferred ?? false,
            firstSite: first?.site.name ?? null,
            firstSiteFrom: iso(first?.startDate),
            assignedOn: iso(first?.createdAt),
            assignedBy: (first?.createdBy ? names.get(first.createdBy) : null) ?? firstAssign.get(e.id)?.actor ?? null,
            daysToAssign: first ? days(first.createdAt.getTime() - e.createdAt.getTime()) : null,
            waitingDays: first ? null : days(now.getTime() - e.createdAt.getTime()),
            currentSite: current?.site.name ?? null,
            siteChanges: e.deployments.length,
        }
    })
}

// ─── One person's site history ───────────────────────────────────────────────

export type HistoryEvent = {
    at: string
    action: string
    summary: string
    by: string | null
    source: string | null
    /** "record" = from the audit log; "posting" / "employee" = read off the posting or the employee record (before records were kept). */
    from: "record" | "posting" | "employee"
}

export async function siteHistory(employeeId: string): Promise<HistoryEvent[]> {
    const [logs, deps, emp] = await Promise.all([
        prisma.auditLog.findMany({
            where: { targetType: "Employee", targetId: employeeId, action: { in: SITE_HISTORY_ACTIONS } },
            select: { at: true, action: true, summary: true, actorName: true, after: true },
            orderBy: { at: "asc" },
        }),
        prisma.deployment.findMany({
            where: { employeeId },
            select: { id: true, createdAt: true, startDate: true, endDate: true, isActive: true, createdBy: true, site: { select: { id: true, name: true } } },
            orderBy: { createdAt: "asc" },
        }),
        prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, createdAt: true, createdBy: true, dateOfJoining: true, onboardingRecord: { select: { status: true } } } }),
    ])
    const names = await userNames([...deps.map(d => d.createdBy), emp?.createdBy])
    const events: HistoryEvent[] = logs.map(l => {
        const after = (l.after ?? {}) as { source?: string }
        return { at: l.at.toISOString(), action: l.action, summary: (l.summary ?? l.action).replace(/ · [^·]+$/, ""), by: l.actorName, source: after.source ?? null, from: "record" }
    })
    // Added before records were kept: the step is read off the employee record
    // (when, by whom) and, where the data shows it, how.
    if (emp && !logs.some(l => l.action === "employee.create")) {
        const from = inferAddedFrom(emp, (await leadSources([emp.id])).get(emp.id))
        const joining = emp.dateOfJoining ? emp.dateOfJoining.toISOString().slice(0, 10) : null
        events.push({
            at: emp.createdAt.toISOString(), action: "employee.create",
            summary: siteChangeSummary("employee.create", null, null, null, joining),
            by: (emp.createdBy ? names.get(emp.createdBy) ?? null : null) ?? selfIfLink(from),
            source: from, from: "employee",
        })
    }
    // Postings from before records were kept: shown from the posting itself.
    const recordedSites = new Set(logs.filter(l => l.action === "deployment.assign" || l.action === "deployment.move")
        .map(l => ((l.after ?? {}) as { siteId?: string }).siteId))
    for (const d of deps) {
        if (recordedSites.has(d.site.id)) continue
        events.push({
            at: d.createdAt.toISOString(), action: "deployment.assign",
            summary: `Posted to ${d.site.name} from ${niceDay(d.startDate.toISOString().slice(0, 10))}${d.isActive ? "" : d.endDate ? ` until ${niceDay(d.endDate.toISOString().slice(0, 10))}` : " (ended)"}`,
            by: d.createdBy ? names.get(d.createdBy) ?? null : null, source: null, from: "posting",
        })
    }
    return events.sort((a, b) => a.at.localeCompare(b.at))
}
