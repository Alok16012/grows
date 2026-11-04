// A permanent record of when people were added and where they were posted.
//
// Deployment rows say where someone is NOW, and can be edited or deleted
// later (deleting one erases it). These audit rows can't: every new employee
// and every site assignment, move, relief or removal is written once to the
// AuditLog, against the employee, with who did it, from which screen, and
// when. The New Joiners page reads them back as each person's site history.
//
// Writes are best-effort: a failed audit row never fails the change itself.

import prisma from "@/lib/prisma"
import { audit, requestMetaOf } from "@/lib/access-audit"

export type SiteChangeAction =
    | "employee.create"     // a new employee record
    | "deployment.assign"   // first / new posting, no current site before
    | "deployment.move"     // moved from one site to another
    | "deployment.relieve"  // posting ended (relieved, left, exit)
    | "deployment.restore"  // posting re-opened (rejoining)
    | "deployment.update"   // shift / role / dates / notes changed
    | "deployment.delete"   // posting removed outright (Admin)

/** Where the change was made. Shown in the history and the register. */
export type SiteChangeSource =
    | "Employee form" | "Bulk import" | "CLMS import" | "Join link" | "Recruitment"
    | "External onboarding" | "Deployments" | "New joiners" | "Employee leaving"
    | "Rejoining" | "Exit"

export type SiteChange = {
    action: SiteChangeAction
    employeeId: string
    source: SiteChangeSource
    siteId?: string | null
    fromSiteId?: string | null
    startDate?: Date | string | null
    joiningDate?: Date | string | null
    actorId?: string | null
    actorName?: string | null
    /** Extra details for the record (shift, role, status…). No personal data. */
    extra?: Record<string, unknown>
    req?: Request | null
}

export const SITE_HISTORY_ACTIONS: SiteChangeAction[] = [
    "employee.create", "deployment.assign", "deployment.move", "deployment.relieve",
    "deployment.restore", "deployment.update", "deployment.delete",
]

const day = (d: Date | string | null | undefined) => {
    if (!d) return null
    const x = new Date(d)
    return Number.isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10)
}
/** "2026-11-04" → "4 Nov 2026". */
export const niceDay = (iso: string | null) => nice(iso)
const nice = (iso: string | null) => {
    if (!iso) return ""
    const [y, m, d] = iso.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

/** One line a person can read, e.g. "Moved from A to B from 4 Nov 2026". */
export function siteChangeSummary(action: SiteChangeAction, site: string | null, fromSite: string | null, start: string | null, joining: string | null): string {
    const from = start ? ` from ${nice(start)}` : ""
    switch (action) {
        case "employee.create": return `Added${joining ? `, joining ${nice(joining)}` : ""}${site ? `, site ${site}` : ""}`
        case "deployment.assign": return `Assigned to ${site ?? "a site"}${from}`
        case "deployment.move": return `Moved from ${fromSite ?? "a site"} to ${site ?? "a site"}${from}`
        case "deployment.relieve": return `Relieved from ${site ?? "a site"}${from ? ` on ${nice(start)}` : ""}`
        case "deployment.restore": return `Posted back to ${site ?? "a site"}`
        case "deployment.update": return `Posting at ${site ?? "a site"} updated`
        case "deployment.delete": return `Posting at ${site ?? "a site"} deleted`
    }
}

async function write(e: SiteChange) {
    const ids = [e.siteId, e.fromSiteId].filter((x): x is string => !!x)
    const [emp, sites] = await Promise.all([
        prisma.employee.findUnique({ where: { id: e.employeeId }, select: { firstName: true, lastName: true, employeeId: true } }),
        ids.length ? prisma.site.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ])
    const siteName = sites.find(s => s.id === e.siteId)?.name ?? null
    const fromSiteName = sites.find(s => s.id === e.fromSiteId)?.name ?? null
    const start = day(e.startDate)
    const joining = day(e.joiningDate)
    const name = emp ? `${emp.firstName} ${emp.lastName}`.trim() + ` (${emp.employeeId})` : null
    const meta = requestMetaOf(e.req)
    await audit(prisma, {
        actorId: e.actorId ?? null,
        actorName: e.actorName ?? (e.source === "Join link" || e.source === "External onboarding" ? "Self (link)" : null),
        action: e.action,
        targetType: "Employee",
        targetId: e.employeeId,
        targetName: name,
        summary: `${siteChangeSummary(e.action, siteName, fromSiteName, start, joining)} · ${e.source}`,
        after: {
            source: e.source,
            siteId: e.siteId ?? null, siteName,
            fromSiteId: e.fromSiteId ?? null, fromSiteName,
            startDate: start, joiningDate: joining,
            ...(e.extra ?? {}),
        },
        ip: meta.ip, userAgent: meta.userAgent,
    })
}

/** Record one change. Never throws and never delays the caller's response. */
export function recordSiteChange(e: SiteChange): void {
    write(e).catch(err => console.error("[SITE_HISTORY]", e.action, err?.message ?? err))
}

/** Record several (e.g. every posting a leaver was relieved from). */
export function recordSiteChanges(list: SiteChange[]): void {
    for (const e of list) recordSiteChange(e)
}

/** Who did it, from a session — the shape every route has to hand. */
export function actorOf(session: { user?: { id?: string | null; name?: string | null } | null } | null | undefined) {
    return { actorId: session?.user?.id ?? null, actorName: session?.user?.name ?? null }
}
