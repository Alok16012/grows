import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { inspectionScopeForApprover } from "@/lib/approval-scope"
import { QUALITY_VIEW, SEVERITIES } from "@/lib/defect-library"
import { NCR_STATUSES, canEditNcr } from "@/lib/ncr"

export const dynamic = "force-dynamic"

async function load(id: string) {
    return prisma.ncr.findUnique({
        where: { id },
        include: {
            project: { select: { id: true, name: true, site: { select: { name: true } } } },
            inspection: { select: { id: true, submittedAt: true, status: true } },
            events: { orderBy: { createdAt: "asc" } },
        },
    })
}

async function visible(g: Exclude<Awaited<ReturnType<typeof guard>>, NextResponse>, n: { projectId: string | null; ownerUserId: string | null; createdBy: string }) {
    const scope = await inspectionScopeForApprover(g.session)
    if (!scope) return true
    return (!!n.projectId && scope.assignment.projectId.in.includes(n.projectId)) || n.ownerUserId === g.access.userId || n.createdBy === g.access.userId
}

async function detail(id: string, access: { userId: string; isAdmin: boolean; permissions: string[] }) {
    const n = await load(id)
    if (!n) return null
    const userIds = Array.from(new Set([n.ownerUserId, n.closedBy, n.createdBy, ...n.events.map(e => e.userId)].filter((x): x is string => !!x)))
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    const defect = n.defectTypeId ? await prisma.defectType.findUnique({ where: { id: n.defectTypeId }, select: { id: true, code: true, name: true, severity: true } }) : null
    return {
        ...n, defect,
        ownerName: n.ownerUserId ? nameOf.get(n.ownerUserId) ?? null : null,
        closedByName: n.closedBy ? nameOf.get(n.closedBy) ?? null : null,
        createdByName: nameOf.get(n.createdBy) ?? null,
        events: n.events.map(e => ({ ...e, userName: nameOf.get(e.userId) ?? (e.userId === "system" ? "System" : null) })),
        canEdit: canEditNcr(access, n),
    }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, QUALITY_VIEW)
    if (g instanceof NextResponse) return g
    const n = await load(params.id)
    if (!n) return NextResponse.json({ error: "NCR not found" }, { status: 404 })
    if (!(await visible(g, n))) return NextResponse.json({ error: "This NCR belongs to a project you don't manage" }, { status: 403 })
    return NextResponse.json({ ncr: await detail(params.id, g.access) })
}

const TEXT = ["title", "partName", "lotNumber", "d1Team", "d2Problem", "d3Containment", "d4RootCause", "d5Action", "d6Implemented", "d7Prevention", "d8Closure"] as const
const DATES = ["dueDate", "d3Date", "d6Date"] as const

// PATCH — fill 8D steps, change owner / due date / severity / status, or comment.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, QUALITY_VIEW)
    if (g instanceof NextResponse) return g
    try {
        const n = await load(params.id)
        if (!n) return NextResponse.json({ error: "NCR not found" }, { status: 404 })
        if (!canEditNcr(g.access, n)) return NextResponse.json({ error: "Only the owner or quality managers can change this NCR" }, { status: 403 })
        const b = await req.json().catch(() => ({}))
        const data: Record<string, unknown> = {}
        for (const k of TEXT) if (b?.[k] !== undefined) data[k] = typeof b[k] === "string" && b[k].trim() ? b[k].trim().slice(0, k === "title" ? 200 : 6000) : null
        if (data.title === null) return NextResponse.json({ error: "The title can't be empty" }, { status: 400 })
        for (const k of DATES) if (b?.[k] !== undefined) { const d = b[k] ? new Date(b[k]) : null; data[k] = d && !isNaN(d.getTime()) ? d : null }
        if (b?.d4Whys !== undefined) data.d4Whys = (Array.isArray(b.d4Whys) ? b.d4Whys : []).slice(0, 7).map((w: unknown) => String(w ?? "").slice(0, 500))
        if (b?.severity !== undefined) { if (!SEVERITIES.includes(b.severity)) return NextResponse.json({ error: "Unknown severity" }, { status: 400 }); data.severity = b.severity }
        if (b?.qtyAffected !== undefined) { const v = Math.round(Number(b.qtyAffected)); data.qtyAffected = Number.isFinite(v) && v >= 0 ? v : null }
        if (b?.effective !== undefined) data.effective = b.effective === null ? null : !!b.effective
        if (b?.ownerUserId !== undefined) {
            const u = b.ownerUserId ? await prisma.user.findUnique({ where: { id: String(b.ownerUserId) }, select: { id: true, isActive: true } }) : null
            if (b.ownerUserId && (!u || !u.isActive)) return NextResponse.json({ error: "Owner not found or inactive" }, { status: 400 })
            data.ownerUserId = u?.id ?? null
        }
        const note = typeof b?.note === "string" && b.note.trim() ? b.note.trim().slice(0, 2000) : null

        let statusChange: string | null = null
        if (b?.status !== undefined && b.status !== n.status) {
            if (!(NCR_STATUSES as readonly string[]).includes(b.status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 })
            const merged = { ...n, ...data } as any
            if (b.status === "CLOSED") {
                const missing = [
                    !merged.d3Containment && "D3 containment", !merged.d4RootCause && "D4 root cause", !merged.d5Action && "D5 corrective action",
                    !merged.d7Prevention && "D7 prevention", merged.effective !== true && "D7 effectiveness confirmed",
                ].filter(Boolean)
                if (missing.length) return NextResponse.json({ error: `Fill these before closing: ${missing.join(", ")}` }, { status: 400 })
                data.closedAt = new Date(); data.closedBy = g.access.userId
            } else if (b.status === "CANCELLED") {
                if (!note) return NextResponse.json({ error: "Say why it's cancelled" }, { status: 400 })
                data.closedAt = new Date(); data.closedBy = g.access.userId
            } else {
                data.closedAt = null; data.closedBy = null
            }
            data.status = b.status
            statusChange = b.status
        }
        if (Object.keys(data).length) await prisma.ncr.update({ where: { id: n.id }, data })
        if (statusChange) await prisma.ncrEvent.create({ data: { ncrId: n.id, userId: g.access.userId, action: "STATUS", note: `→ ${statusChange}${note ? `: ${note}` : ""}` } })
        else if (note) await prisma.ncrEvent.create({ data: { ncrId: n.id, userId: g.access.userId, action: "COMMENT", note } })
        else if (Object.keys(data).length) await prisma.ncrEvent.create({ data: { ncrId: n.id, userId: g.access.userId, action: "UPDATED", note: Object.keys(data).filter(k => !["closedAt", "closedBy"].includes(k)).join(", ") } })
        if (data.ownerUserId && data.ownerUserId !== n.ownerUserId && data.ownerUserId !== g.access.userId) {
            await prisma.notification.create({ data: { userId: data.ownerUserId as string, type: "quality", title: `${n.code} assigned to you`, message: n.title, link: `/quality/ncr/${n.id}` } }).catch(() => {})
        }
        if (statusChange) auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "quality.ncr_status", targetType: "Ncr", targetId: n.id, targetName: n.code, summary: `${n.status} → ${statusChange}`, ...requestMeta(req) })
        return NextResponse.json({ ncr: await detail(n.id, g.access) })
    } catch (e) {
        console.error("[NCR_PATCH]", e)
        return NextResponse.json({ error: "Could not save" }, { status: 500 })
    }
}
