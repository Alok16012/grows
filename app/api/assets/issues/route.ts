import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess, canIssueAssets, canOverseeAssets } from "@/lib/permissions"
import { notifyEmployee } from "@/lib/hr-notify"
import { commNotify, employeeRecipients } from "@/lib/comm/recipients"
import {
    ISSUE_STATUSES, workflowErrorResponse, jsonError, isUniqueErr,
    loadIssue, loadIssues, loadRequest, dateRange, pageParams, parseIntStrict,
} from "@/lib/asset-workflow"
import { issueRequestLine } from "@/lib/asset-issue"

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
        // Receipts the employee hasn't confirmed yet (Issued → Not confirmed).
        if (sp.get("ack") === "pending") { where.acknowledgedAt = null; where.status = "ACTIVE" }
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

        let issue, item
        try {
            ({ issue, item } = await issueRequestLine({
                requestItemId, quantity, actorId, acknowledged: body?.acknowledged === true,
                serialNo: body?.serialNo?.toString(), remarks: body?.remarks?.toString(),
                attachmentUrl: body?.attachmentUrl?.toString(), idempotencyKey, replacesIssueId: body?.replacesIssueId?.toString(),
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
        await commNotify("asset_issued", employeeRecipients([item.employeeId]), { asset: quantity > 1 ? `${item.asset.name} × ${quantity}` : item.asset.name },
            { refType: "Asset", refId: issue.id, createdBy: actorId, link: "/profile?tab=assets" })

        const [issueOut, request] = await Promise.all([loadIssue(prisma, issue.id), loadRequest(prisma, item.requestId)])
        return NextResponse.json({ issue: issueOut, request }, { status: 201 })
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_ISSUES_POST]")
    }
}
