import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess, canIssueAssets, canOverseeAssets } from "@/lib/permissions"
import { notifyEmployee } from "@/lib/hr-notify"
import {
    ISSUE_STATUSES, WorkflowError, workflowErrorResponse, jsonError, withNumberRetry, isUniqueErr,
    issueAssetTx, recomputeRequestStatus, loadIssue, loadIssues, loadRequest, dateRange, pageParams,
    parseIntStrict, isUnassignableStatus, unassignableEmployeeMessage,
} from "@/lib/asset-workflow"

// GET — issue register. Asset staff see everyone's; anyone else only their own.
export async function GET(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")

        const sp = new URL(req.url).searchParams
        const { skip, take } = pageParams(sp)
        const where: Prisma.AssetIssueWhereInput = {}
        const and: Prisma.AssetIssueWhereInput[] = []

        if (!canOverseeAssets(session) && !checkAccess(session, [], "assets.view")) {
            const emp = await prisma.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
            if (!emp) return NextResponse.json({ issues: [], total: 0 })
            where.employeeId = emp.id
        } else if (sp.get("employeeId")) {
            where.employeeId = sp.get("employeeId")!
        }
        if (sp.get("assetId")) where.assetId = sp.get("assetId")!
        const status = sp.get("status")
        if (status && (ISSUE_STATUSES as readonly string[]).includes(status)) where.status = status
        const issuedAt = dateRange(sp.get("from"), sp.get("to"))
        if (issuedAt) where.issuedAt = issuedAt
        const search = sp.get("search")?.trim()
        if (search) {
            const s = { contains: search, mode: "insensitive" as const }
            and.push({
                OR: [
                    { issueNo: s },
                    { serialNo: s },
                    { employee: { OR: [{ firstName: s }, { lastName: s }, { employeeId: s }] } },
                    { asset: { OR: [{ name: s }, { assetCode: s }] } },
                    { requestItem: { request: { requestNo: s } } },
                ],
            })
        }
        if (and.length) where.AND = and

        const [issues, total] = await Promise.all([
            loadIssues(prisma, { where, orderBy: { issuedAt: "desc" }, skip, take }),
            prisma.assetIssue.count({ where }),
        ])
        return NextResponse.json({ issues, total })
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_ISSUES_GET]")
    }
}

// POST — issue against an approved request item.
export async function POST(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const actorId = session.user.id

        const body = await req.json().catch(() => ({}))
        const requestItemId = body?.requestItemId?.toString()
        const idempotencyKey = body?.idempotencyKey?.toString().trim() || null
        const quantity = parseIntStrict(body?.quantity)
        if (!requestItemId) return jsonError(400, "requestItemId is required")

        // A retried click / flaky network re-sends the same key: hand back the
        // first issue and leave stock alone.
        const replay = async () => {
            if (!idempotencyKey) return null
            const prior = await prisma.assetIssue.findUnique({ where: { idempotencyKey }, select: { id: true, requestItem: { select: { requestId: true } } } })
            if (!prior) return null
            const [issue, request] = await Promise.all([
                loadIssue(prisma, prior.id),
                prior.requestItem ? loadRequest(prisma, prior.requestItem.requestId) : null,
            ])
            return NextResponse.json({ issue, request }, { status: 200 })
        }
        const first = await replay()
        if (first) return first

        if (quantity === null || quantity < 1) return jsonError(400, "Quantity must be a whole number of at least 1")

        const item = await prisma.assetRequestItem.findUnique({
            where: { id: requestItemId },
            include: {
                request: { select: { id: true, status: true, requestNo: true } },
                asset: { select: { id: true, name: true, available: true, isActive: true } },
                employee: { select: { id: true, firstName: true, lastName: true, status: true } },
            },
        })
        if (!item) return jsonError(404, "Request item not found")
        if (!["APPROVED", "PARTIALLY_APPROVED"].includes(item.request.status)) {
            return jsonError(409, `Request ${item.request.requestNo} is ${item.request.status.toLowerCase().replace("_", " ")} — only approved requests can be issued`)
        }
        const left = (item.approvedQty ?? 0) - item.issuedQty
        if (quantity > left) return jsonError(400, `Only ${Math.max(0, left)} left to issue on this request`)
        if (quantity > item.asset.available) return jsonError(400, `Only ${item.asset.available} in stock`)
        if (isUnassignableStatus(item.employee.status)) return jsonError(400, unassignableEmployeeMessage(item.employee))

        let issue
        try {
            issue = await withNumberRetry("issueNo", bump => prisma.$transaction(async tx => {
                // Re-checked under the transaction: the request can't have been
                // cancelled, and two issuers can't over-issue the same item.
                const req2 = await tx.assetRequest.findUnique({ where: { id: item.request.id }, select: { status: true } })
                if (!req2 || !["APPROVED", "PARTIALLY_APPROVED"].includes(req2.status)) {
                    throw new WorkflowError(409, "This request is no longer open for issue")
                }
                const bumped = await tx.$queryRaw<{ issuedQty: number; approvedQty: number | null }[]>(Prisma.sql`
                    UPDATE "AssetRequestItem" SET "issuedQty" = "issuedQty" + ${quantity}
                    WHERE "id" = ${item.id} AND "issuedQty" + ${quantity} <= COALESCE("approvedQty", 0)
                    RETURNING "issuedQty", "approvedQty"`)
                if (bumped.length === 0) {
                    const now = await tx.assetRequestItem.findUnique({ where: { id: item.id }, select: { issuedQty: true, approvedQty: true } })
                    throw new WorkflowError(400, `Only ${Math.max(0, (now?.approvedQty ?? 0) - (now?.issuedQty ?? 0))} left to issue on this request`)
                }
                const created = await issueAssetTx(tx, {
                    employeeId: item.employeeId, assetId: item.assetId, quantity,
                    size: item.size, serialNo: body?.serialNo?.toString(), remarks: body?.remarks?.toString(),
                    attachmentUrl: body?.attachmentUrl?.toString(), idempotencyKey,
                    acknowledged: body?.acknowledged === true, replacesIssueId: body?.replacesIssueId?.toString(),
                    requestItemId: item.id, actorId, refType: "REQUEST",
                }, bump)
                await recomputeRequestStatus(tx, item.requestId)
                return created
            }))
        } catch (e) {
            // Same key raced in from a second tab: the other one won, return it.
            if (idempotencyKey && isUniqueErr(e, "idempotencyKey")) {
                const again = await replay()
                if (again) return again
            }
            throw e
        }

        await notifyEmployee(item.employeeId, {
            title: "Asset issued to you",
            message: `Asset issued: ${item.asset.name} × ${quantity}`,
            type: "asset",
            link: "/profile?tab=assets",
        })

        const [issueOut, request] = await Promise.all([loadIssue(prisma, issue.id), loadRequest(prisma, item.requestId)])
        return NextResponse.json({ issue: issueOut, request }, { status: 201 })
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_ISSUES_POST]")
    }
}
