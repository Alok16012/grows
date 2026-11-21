import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets, canOverseeAssets } from "@/lib/permissions"
import { jsonError, workflowErrorResponse, parseIntStrict } from "@/lib/asset-workflow"
import { createRecovery, leaversHoldingAssets, unitValue } from "@/lib/asset-recovery"
import { effectiveWindow } from "@/lib/payroll-change-control"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET — recoveries, leavers still holding assets, and the open payroll months.
export async function GET(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canOverseeAssets(session) && !canIssueAssets(session)) return jsonError(403, "Forbidden")
        const [rows, leavers, w] = await Promise.all([
            prisma.assetRecovery.findMany({ orderBy: { createdAt: "desc" }, take: 1000 }),
            leaversHoldingAssets(),
            effectiveWindow(),
        ])
        const [emps, assets] = await Promise.all([
            prisma.employee.findMany({ where: { id: { in: Array.from(new Set(rows.map(r => r.employeeId))) } }, select: { id: true, firstName: true, lastName: true, employeeId: true, status: true } }),
            prisma.asset.findMany({ where: { id: { in: Array.from(new Set(rows.map(r => r.assetId))) } }, select: { id: true, name: true, assetCode: true } }),
        ])
        const empOf = new Map(emps.map(e => [e.id, e])), assetOf = new Map(assets.map(a => [a.id, a]))
        return NextResponse.json({
            allowed: w.allowed,
            leavers,
            recoveries: rows.map(r => ({
                ...r,
                employee: empOf.get(r.employeeId) ? `${empOf.get(r.employeeId)!.firstName} ${empOf.get(r.employeeId)!.lastName}`.trim() : "",
                employeeCode: empOf.get(r.employeeId)?.employeeId ?? "", employeeStatus: empOf.get(r.employeeId)?.status ?? null,
                asset: assetOf.get(r.assetId)?.name ?? "", assetCode: assetOf.get(r.assetId)?.assetCode ?? "",
            })),
        })
    } catch (e) { return workflowErrorResponse(e, "[ASSET_RECOVERIES_GET]") }
}

// POST { issueId, quantity?, reason, amount?, note?, fnf? }  — charge for an issued item
//      { issueIds: [...], reason: "NOT_RETURNED", fnf: true } — many leavers' items at once
//      { valueOf: issueId } — just the suggested amount for an item
export async function POST(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const b = await req.json().catch(() => ({}))
        const reason = ["LOST", "DAMAGED", "NOT_RETURNED"].includes(b?.reason) ? b.reason : "NOT_RETURNED"
        if (b?.valueOf) {
            const i = await prisma.assetIssue.findUnique({ where: { id: String(b.valueOf) }, select: { assetId: true, issuedAt: true, quantity: true, returnedQty: true } })
            if (!i) return jsonError(404, "Issue not found")
            return NextResponse.json({ unit: await unitValue(i.assetId, i.issuedAt), outstanding: i.quantity - i.returnedQty })
        }
        const ids: string[] = Array.isArray(b?.issueIds) ? b.issueIds.slice(0, 300) : b?.issueId ? [String(b.issueId)] : []
        if (!ids.length) return jsonError(400, "Pick an issued item")
        const issues = await prisma.assetIssue.findMany({ where: { id: { in: ids } }, select: { id: true, employeeId: true, assetId: true, quantity: true, returnedQty: true } })
        const created = []
        for (const i of issues) {
            const qty = ids.length === 1 && b?.quantity != null ? parseIntStrict(b.quantity) : i.quantity - i.returnedQty
            if (!qty || qty < 1) continue
            const already = await prisma.assetRecovery.findFirst({ where: { issueId: i.id, status: { not: "WAIVED" } }, select: { id: true } })
            if (already && ids.length > 1) continue // bulk: never charge twice
            created.push(await createRecovery({
                employeeId: i.employeeId, assetId: i.assetId, issueId: i.id, quantity: qty, reason,
                amount: ids.length === 1 && b?.amount != null && b.amount !== "" ? Number(b.amount) : null,
                note: b?.note ? String(b.note).slice(0, 300) : null, actorId: session.user.id, via: b?.fnf ? "FNF" : null,
            }))
        }
        return NextResponse.json({ created: created.length, recoveries: created })
    } catch (e) { return workflowErrorResponse(e, "[ASSET_RECOVERIES_POST]") }
}
