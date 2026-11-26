import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { inspectionScopeForApprover } from "@/lib/approval-scope"
import { QUALITY_VIEW, QUALITY_MANAGE, SEVERITIES, canManageQuality } from "@/lib/defect-library"
import { createNcr, inspectionFacts } from "@/lib/ncr"
import { getInspectionSettings } from "@/lib/inspection-settings"

export const dynamic = "force-dynamic"

// GET ?status=open|closed|all&q= — NCRs in the caller's scope (+ the ones they own).
// GET ?owners=1 — people who can own an NCR.
export async function GET(req: Request) {
    const g = await guard(req, QUALITY_VIEW)
    if (g instanceof NextResponse) return g
    try {
        const sp = new URL(req.url).searchParams
        if (sp.get("owners")) {
            const users = await prisma.user.findMany({
                where: {
                    isActive: true,
                    OR: [
                        { role: { in: ["ADMIN", "MANAGER", "HR_MANAGER"] } },
                        { customRole: { isActive: true, permissions: { hasSome: [...QUALITY_MANAGE, "approvals.view"] } } },
                    ],
                },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
                take: 500,
            })
            return NextResponse.json({ users })
        }
        const status = sp.get("status") || "open"
        const q = (sp.get("q") ?? "").trim()
        const and: Prisma.NcrWhereInput[] = []
        const scope = await inspectionScopeForApprover(g.session)
        if (scope) and.push({ OR: [{ projectId: { in: scope.assignment.projectId.in } }, { ownerUserId: g.access.userId }, { createdBy: g.access.userId }] })
        if (status === "open") and.push({ status: { notIn: ["CLOSED", "CANCELLED"] } })
        else if (status === "closed") and.push({ status: { in: ["CLOSED", "CANCELLED"] } })
        const inspectionId = sp.get("inspectionId")
        if (inspectionId) and.push({ inspectionId })
        if (q) and.push({ OR: [{ code: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, { partName: { contains: q, mode: "insensitive" } }, { lotNumber: { contains: q, mode: "insensitive" } }] })
        const rows = await prisma.ncr.findMany({
            where: { AND: and },
            select: {
                id: true, code: true, title: true, status: true, severity: true, source: true, partName: true, lotNumber: true,
                qtyAffected: true, dueDate: true, createdAt: true, closedAt: true, ownerUserId: true, inspectionId: true,
                project: { select: { name: true, site: { select: { name: true } } } },
            },
            orderBy: [{ createdAt: "desc" }],
            take: 500,
        })
        const ownerIds = Array.from(new Set(rows.map(r => r.ownerUserId).filter((x): x is string => !!x)))
        const owners = ownerIds.length ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }) : []
        const nameOf = new Map(owners.map(o => [o.id, o.name]))
        const counts = await prisma.ncr.groupBy({ by: ["status"], where: scope ? { AND: [and[0]] } : {}, _count: { _all: true } })
        return NextResponse.json({
            rows: rows.map(r => ({ ...r, ownerName: r.ownerUserId ? nameOf.get(r.ownerUserId) ?? null : null })),
            counts: Object.fromEntries(counts.map(c => [c.status, c._count._all])),
            canManage: canManageQuality(g.access),
        })
    } catch (e: any) {
        if (e?.code === "P2021") return NextResponse.json({ error: "NCRs aren't set up in the database yet." }, { status: 503 })
        console.error("[NCR_LIST]", e)
        return NextResponse.json({ error: "Could not load NCRs" }, { status: 500 })
    }
}

// POST — open an NCR by hand, optionally from an inspection (its facts are copied in).
export async function POST(req: Request) {
    const g = await guard(req, QUALITY_MANAGE)
    if (g instanceof NextResponse) return g
    try {
        const b = await req.json().catch(() => ({}))
        const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)
        const int = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? n : null }
        const settings = await getInspectionSettings()
        let data: any = {
            title: str(b?.title, 200), severity: SEVERITIES.includes(b?.severity) ? b.severity : "MAJOR",
            partName: str(b?.partName, 200), lotNumber: str(b?.lotNumber, 100), qtyAffected: int(b?.qtyAffected), qtyInspected: int(b?.qtyInspected),
            d2Problem: str(b?.d2Problem, 4000), projectId: str(b?.projectId, 60),
        }
        if (typeof b?.inspectionId === "string" && b.inspectionId) {
            const facts = await inspectionFacts(b.inspectionId)
            if (!facts) return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
            const f = facts.figures
            const n = (x: number) => x.toLocaleString("en-IN")
            data = {
                ...data, inspectionId: b.inspectionId, projectId: facts.project.id,
                title: data.title ?? `${facts.defects[0]?.name ?? "Non-conformance"}${f.part ? ` — ${f.part}` : ""}`,
                partName: data.partName ?? (f.part || null), lotNumber: data.lotNumber ?? facts.lot,
                qtyInspected: data.qtyInspected ?? (Math.round(f.inspected) || null), qtyAffected: data.qtyAffected ?? (Math.round(f.rejected + f.rework) || null),
                defectTypeId: facts.defects[0]?.id ?? null,
                d2Problem: data.d2Problem ?? `${facts.project.name}: ${n(f.inspected)} inspected, ${n(f.rework)} rework, ${n(f.rejected)} rejected.${facts.lot ? ` Lot ${facts.lot}.` : ""}${facts.defects.length ? ` Defects: ${facts.defects.slice(0, 5).map(d => `${d.name} ${n(d.qty)}`).join(", ")}.` : ""}`,
            }
        }
        if (!data.title) return NextResponse.json({ error: "Give the NCR a title" }, { status: 400 })
        const ownerUserId = str(b?.ownerUserId, 60) ?? g.access.userId
        const due = b?.dueDate ? new Date(b.dueDate) : new Date(Date.now() + settings.ncr.dueDays * 86_400_000)
        const ncr = await createNcr({ ...data, source: "MANUAL", status: "OPEN", ownerUserId, dueDate: isNaN(due.getTime()) ? null : due, createdBy: g.access.userId })
        await prisma.ncrEvent.create({ data: { ncrId: ncr.id, userId: g.access.userId, action: "CREATED", note: str(b?.note, 1000) } })
        if (ownerUserId !== g.access.userId) {
            await prisma.notification.create({ data: { userId: ownerUserId, type: "quality", title: `${ncr.code} assigned to you`, message: ncr.title, link: `/quality/ncr/${ncr.id}` } }).catch(() => {})
        }
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "quality.ncr_create", targetType: "Ncr", targetId: ncr.id, targetName: ncr.code, summary: ncr.title, ...requestMeta(req) })
        return NextResponse.json({ ncr }, { status: 201 })
    } catch (e) {
        console.error("[NCR_CREATE]", e)
        return NextResponse.json({ error: "Could not open the NCR" }, { status: 500 })
    }
}
