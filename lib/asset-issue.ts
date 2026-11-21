// Issuing an approved request line — shared by the single Issue button
// (POST /api/assets/issues) and bulk issue (POST /api/assets/issues/bulk), so
// both apply exactly the same checks: request still approved, never more than
// approved, never more than in stock, never to an employee who has left.
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import {
    WorkflowError, withNumberRetry, issueAssetTx, recomputeRequestStatus,
    isUnassignableStatus, unassignableEmployeeMessage,
} from "@/lib/asset-workflow"

export type IssueLineInput = {
    requestItemId: string
    /** Units to issue; default = everything still to issue on the line. */
    quantity?: number | null
    actorId: string
    acknowledged?: boolean
    serialNo?: string | null
    remarks?: string | null
    attachmentUrl?: string | null
    idempotencyKey?: string | null
    replacesIssueId?: string | null
}

/** Issues one request line. Throws WorkflowError with a user-facing message. */
export async function issueRequestLine(input: IssueLineInput) {
    const item = await prisma.assetRequestItem.findUnique({
        where: { id: input.requestItemId },
        include: {
            request: { select: { id: true, status: true, requestNo: true } },
            asset: { select: { id: true, name: true, available: true, isActive: true } },
            employee: { select: { id: true, firstName: true, lastName: true, status: true } },
        },
    })
    if (!item) throw new WorkflowError(404, "Request item not found")
    if (!["APPROVED", "PARTIALLY_APPROVED"].includes(item.request.status)) {
        throw new WorkflowError(409, `Request ${item.request.requestNo} is ${item.request.status.toLowerCase().replace("_", " ")} — only approved requests can be issued`)
    }
    const left = (item.approvedQty ?? 0) - item.issuedQty
    const quantity = input.quantity ?? left
    if (!Number.isInteger(quantity) || quantity < 1) throw new WorkflowError(400, left < 1 ? "Nothing left to issue on this request" : "Quantity must be a whole number of at least 1")
    if (quantity > left) throw new WorkflowError(400, `Only ${Math.max(0, left)} left to issue on this request`)
    if (quantity > item.asset.available) throw new WorkflowError(400, `Only ${item.asset.available} ${item.asset.name} in stock`)
    if (isUnassignableStatus(item.employee.status)) throw new WorkflowError(400, unassignableEmployeeMessage(item.employee))

    const issue = await withNumberRetry("issueNo", bump => prisma.$transaction(async tx => {
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
            size: item.size, serialNo: input.serialNo ?? undefined, remarks: input.remarks ?? undefined,
            attachmentUrl: input.attachmentUrl ?? undefined, idempotencyKey: input.idempotencyKey ?? undefined,
            acknowledged: input.acknowledged === true, replacesIssueId: input.replacesIssueId ?? undefined,
            requestItemId: item.id, actorId: input.actorId, refType: "REQUEST",
        }, bump)
        await recomputeRequestStatus(tx, item.requestId)
        return created
    }))
    return { issue, item, quantity }
}
