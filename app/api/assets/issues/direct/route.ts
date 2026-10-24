import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets } from "@/lib/permissions"
import { notifyEmployee } from "@/lib/hr-notify"
import {
    workflowErrorResponse, jsonError, withNumberRetry, isUniqueErr, issueAssetTx, loadIssue,
    parseIntStrict, isUnassignableStatus, unassignableEmployeeMessage, MAX_REQUEST_QTY,
} from "@/lib/asset-workflow"

// POST — issue straight from stock without a request (the old "Issue" button).
// Same stock and serial rules as a request issue; the ledger marks it DIRECT.
export async function POST(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const actorId = session.user.id

        const body = await req.json().catch(() => ({}))
        const employeeId = body?.employeeId?.toString()
        const assetId = body?.assetId?.toString()
        const idempotencyKey = body?.idempotencyKey?.toString().trim() || null
        const quantity = parseIntStrict(body?.quantity ?? 1)
        if (!employeeId || !assetId) return jsonError(400, "employeeId and assetId are required")

        const replay = async () => {
            if (!idempotencyKey) return null
            const prior = await prisma.assetIssue.findUnique({ where: { idempotencyKey }, select: { id: true } })
            return prior ? NextResponse.json({ issue: await loadIssue(prisma, prior.id), request: null }, { status: 200 }) : null
        }
        const first = await replay()
        if (first) return first

        if (quantity === null || quantity < 1 || quantity > MAX_REQUEST_QTY) {
            return jsonError(400, `Quantity must be a whole number from 1 to ${MAX_REQUEST_QTY}`)
        }
        const [employee, asset] = await Promise.all([
            prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, firstName: true, lastName: true, status: true } }),
            prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, name: true, available: true, isActive: true } }),
        ])
        if (!employee) return jsonError(404, "Employee not found")
        if (!asset) return jsonError(404, "Asset not found")
        if (isUnassignableStatus(employee.status)) return jsonError(400, unassignableEmployeeMessage(employee))
        if (!asset.isActive) return jsonError(400, `${asset.name} is inactive and can't be issued`)
        if (quantity > asset.available) return jsonError(400, `Only ${asset.available} in stock`)

        let issue
        try {
            issue = await withNumberRetry("issueNo", bump => prisma.$transaction(tx => issueAssetTx(tx, {
                employeeId, assetId, quantity,
                size: body?.size?.toString() || null, serialNo: body?.serialNo?.toString(),
                remarks: body?.remarks?.toString(), attachmentUrl: body?.attachmentUrl?.toString(),
                idempotencyKey, acknowledged: body?.acknowledged === true,
                replacesIssueId: body?.replacesIssueId?.toString(),
                actorId, refType: "DIRECT",
            }, bump)))
        } catch (e) {
            if (idempotencyKey && isUniqueErr(e, "idempotencyKey")) {
                const again = await replay()
                if (again) return again
            }
            throw e
        }

        await notifyEmployee(employeeId, {
            title: "Asset issued to you",
            message: `Asset issued: ${asset.name} × ${quantity}`,
            type: "asset",
            link: "/profile?tab=assets",
        })

        return NextResponse.json({ issue: await loadIssue(prisma, issue.id), request: null }, { status: 201 })
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_ISSUE_DIRECT_POST]")
    }
}
