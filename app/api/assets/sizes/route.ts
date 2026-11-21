import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets, canOverseeAssets } from "@/lib/permissions"
import { jsonError, workflowErrorResponse } from "@/lib/asset-workflow"
import { postedSites } from "@/lib/attendance-guard"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET ?siteId=&search= — employees (active / onboarding) with their sizes per item group.
export async function GET(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canOverseeAssets(session) && !canIssueAssets(session)) return jsonError(403, "Forbidden")
        const sp = new URL(req.url).searchParams
        const siteId = sp.get("siteId") || null
        const search = sp.get("search")?.trim() || ""
        let ids: string[] | null = null
        if (siteId) ids = (await prisma.deployment.findMany({ where: { siteId, isActive: true }, select: { employeeId: true } })).map(d => d.employeeId)
        const s = { contains: search, mode: "insensitive" as const }
        const emps = await prisma.employee.findMany({
            where: {
                status: { in: ["ACTIVE", "ONBOARDING"] as any },
                ...(ids ? { id: { in: ids } } : {}),
                ...(search ? { OR: [{ firstName: s }, { lastName: s }, { employeeId: s }] } : {}),
            },
            select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true },
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }], take: 1000,
        })
        const [sizes, posted, sites] = await Promise.all([
            prisma.employeeSize.findMany({ where: { employeeId: { in: emps.map(e => e.id) } } }),
            postedSites(emps.map(e => e.id)),
            prisma.site.findMany({ select: { id: true, name: true } }),
        ])
        const siteName = new Map(sites.map(x => [x.id, x.name]))
        const by = new Map<string, Record<string, string>>()
        for (const r of sizes) by.set(r.employeeId, { ...(by.get(r.employeeId) ?? {}), [r.groupName]: r.size })
        return NextResponse.json({
            employees: emps.map(e => ({ id: e.id, code: e.employeeId, name: `${e.firstName} ${e.lastName}`.trim(), designation: e.designation, site: siteName.get(posted.get(e.id) ?? "") ?? null, sizes: by.get(e.id) ?? {} })),
        })
    } catch (e) { return workflowErrorResponse(e, "[ASSET_SIZES_GET]") }
}

// PUT { sizes: [{ employeeId, groupName, size }] } — blank size removes it. Many at once (Excel upload).
export async function PUT(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const b = await req.json().catch(() => ({}))
        const rows: { employeeId: string; groupName: string; size: string }[] = Array.isArray(b?.sizes) ? b.sizes.slice(0, 5000) : []
        let saved = 0, removed = 0
        for (const r of rows) {
            const employeeId = String(r?.employeeId ?? ""), groupName = String(r?.groupName ?? "").trim().slice(0, 80), size = String(r?.size ?? "").trim().slice(0, 20)
            if (!employeeId || !groupName) continue
            if (!size) { const d = await prisma.employeeSize.deleteMany({ where: { employeeId, groupName } }); removed += d.count; continue }
            await prisma.employeeSize.upsert({ where: { employeeId_groupName: { employeeId, groupName } }, create: { employeeId, groupName, size, updatedBy: session.user.id }, update: { size, updatedBy: session.user.id } })
            saved++
        }
        return NextResponse.json({ saved, removed })
    } catch (e) { return workflowErrorResponse(e, "[ASSET_SIZES_PUT]") }
}
