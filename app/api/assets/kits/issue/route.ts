import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets } from "@/lib/permissions"
import { notifyEmployee } from "@/lib/hr-notify"
import { auditLater, requestMeta } from "@/lib/access"
import { jsonError, workflowErrorResponse } from "@/lib/asset-workflow"
import { issueKit, itemGroups, resolveKit, sanitizeKitItems, sizesOf } from "@/lib/asset-kits"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST { kitId, employeeIds, preview?: true, acknowledged? }
// preview: what each employee would get (their size per item) and what's missing.
// Otherwise issues the kit; each employee is told once.
export async function POST(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const b = await req.json().catch(() => ({}))
        const kitId = String(b?.kitId ?? "")
        const employeeIds: string[] = Array.isArray(b?.employeeIds) ? b.employeeIds.filter((x: unknown) => typeof x === "string").slice(0, 300) : []
        if (!kitId || !employeeIds.length) return jsonError(400, "Pick a kit and at least one employee")

        if (b?.preview) {
            const kit = await prisma.assetKit.findUnique({ where: { id: kitId } })
            if (!kit) return jsonError(404, "Kit not found")
            const [groups, sizes, emps] = await Promise.all([
                itemGroups(), sizesOf(employeeIds),
                prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, firstName: true, lastName: true, employeeId: true } }),
            ])
            const items = sanitizeKitItems(kit.items)
            return NextResponse.json({
                preview: emps.map(e => ({ employeeId: e.id, name: `${e.firstName} ${e.lastName}`.trim(), code: e.employeeId, lines: resolveKit(items, groups, sizes.get(e.id)) })),
            })
        }

        const r = await issueKit(kitId, employeeIds, { actorId: session.user.id, acknowledged: b?.acknowledged === true })
        for (const x of r.results.filter(x => x.issued.length)) {
            await notifyEmployee(x.employeeId, { title: "Kit issued to you", message: `${r.kit}: ${x.issued.join(", ")}${b?.acknowledged ? "" : " — please confirm you received it"}`, type: "asset", link: "/profile?tab=assets" })
        }
        const issued = r.results.reduce((s, x) => s + x.issued.length, 0)
        auditLater({ actorId: session.user.id, actorName: session.user.name ?? "", action: "asset.kit_issue", targetType: "AssetKit", targetId: kitId, targetName: r.kit, summary: `${issued} item line(s) to ${r.results.filter(x => x.issued.length).length} employee(s)`, ...requestMeta(req) })
        return NextResponse.json(r)
    } catch (e) { return workflowErrorResponse(e, "[ASSET_KIT_ISSUE]") }
}
