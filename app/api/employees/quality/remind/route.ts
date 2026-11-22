import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { computeQuality } from "@/lib/people-quality-server"
import { SELF_SERVICE_FIELDS } from "@/lib/people-quality"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const TYPE = "PROFILE_REMINDER"
const SELF = new Set(SELF_SERVICE_FIELDS)

// POST { employeeIds } — in-app reminder to each employee to fill the gaps they
// can fill themselves in My Profile (photo, address, emergency contact …).
// Skips people without a login, with nothing self-fillable, or reminded within
// the cooldown (People data settings).
export async function POST(req: Request) {
    const g = await guard(req, "employees.edit")
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const ids: string[] = Array.isArray(b?.employeeIds) ? b.employeeIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 500) : []
    if (!ids.length) return NextResponse.json({ error: "Pick at least one employee" }, { status: 400 })

    // Only employees in the caller's scope, with their current gaps.
    const q = await computeQuality(g.access)
    const want = new Set(ids)
    const rows = q.employees.filter(r => want.has(r.id))
    const users = await prisma.employee.findMany({ where: { id: { in: rows.map(r => r.id) } }, select: { id: true, userId: true } })
    const userOf = new Map(users.map(u => [u.id, u.userId]))
    const cooldown = q.settings.reminderCooldownHours
    const since = new Date(Date.now() - cooldown * 3600_000)
    const recent = cooldown > 0
        ? new Set((await prisma.notification.findMany({ where: { type: TYPE, createdAt: { gte: since }, userId: { in: users.map(u => u.userId).filter((x): x is string => !!x) } }, select: { userId: true } })).map(n => n.userId))
        : new Set<string>()

    let sent = 0, noLogin = 0, nothing = 0, cooling = 0
    const notes: { userId: string; title: string; message: string; type: string; link: string }[] = []
    for (const r of rows) {
        const gaps = Array.from(new Set(r.issues.filter(i => SELF.has(i.field)).map(i => i.kind === "missing" ? i.label : `${i.label} (please correct)`)))
        if (!gaps.length) { nothing++; continue }
        const userId = userOf.get(r.id)
        if (!userId) { noLogin++; continue }
        if (recent.has(userId)) { cooling++; continue }
        const docGap = r.issues.some(i => i.field.startsWith("doc_"))
        notes.push({ userId, type: TYPE, link: docGap ? "/profile?tab=documents" : "/profile", title: "Please complete your profile", message: `HR needs these details from you: ${gaps.join(", ")}. Open My Profile to add them.` })
        sent++
    }
    if (notes.length) await prisma.notification.createMany({ data: notes })
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "employee.profile_reminder", targetType: "Employee", targetId: rows.slice(0, 5).map(r => r.id).join(","), targetName: `${sent} employee(s)`, summary: `Profile reminder sent to ${sent}; skipped ${noLogin} without login, ${nothing} with nothing to fill, ${cooling} reminded in the last ${cooldown} h`, ...requestMeta(req) })
    return NextResponse.json({ sent, noLogin, nothing, cooling, cooldownHours: cooldown })
}
