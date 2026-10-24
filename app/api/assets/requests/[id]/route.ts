import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canApproveAssets, canOverseeAssets } from "@/lib/permissions"
import {
    WorkflowError, workflowErrorResponse, jsonError, audit, loadRequest, loadIssues,
    userNames, parseIntStrict,
} from "@/lib/asset-workflow"

async function loadDetail(id: string) {
    const request = await loadRequest(prisma, id)
    if (!request) return null
    const [issues, logs] = await Promise.all([
        loadIssues(prisma, { where: { requestItem: { requestId: id } }, orderBy: { issuedAt: "desc" } }),
        prisma.assetAuditLog.findMany({ where: { entity: "AssetRequest", entityId: id }, orderBy: { createdAt: "asc" } }),
    ])
    const users = await userNames(prisma, logs.map(l => l.userId))
    const auditRows = logs.map(l => ({
        ...l, user: l.userId ? (users.get(l.userId) ?? { id: l.userId, name: "Unknown" }) : null,
    }))
    return { ...request, issues, audit: auditRows }
}

// GET — one request with its issues and decision trail.
export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        const detail = await loadDetail(params.id)
        if (!detail) return jsonError(404, "Request not found")
        if (!canOverseeAssets(session) && detail.requestedBy.id !== session.user.id) return jsonError(403, "Forbidden")
        return NextResponse.json(detail)
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_REQUEST_GET]")
    }
}

type ApproveItem = { id?: string; approvedQty?: unknown }

// PATCH — APPROVE (per-item quantities) / REJECT / CANCEL.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        const actorId = session.user.id
        const isAdmin = session.user.role === "ADMIN"

        const body = await req.json().catch(() => ({}))
        const action = String(body?.action ?? "").toUpperCase()
        if (!["APPROVE", "REJECT", "CANCEL"].includes(action)) return jsonError(400, "action must be APPROVE, REJECT or CANCEL")

        const existing = await prisma.assetRequest.findUnique({ where: { id: params.id }, include: { items: true } })
        if (!existing) return jsonError(404, "Request not found")
        const isRequester = existing.requestedBy === actorId
        const isApprover = canApproveAssets(session)

        let outcome = ""
        let message = ""

        if (action === "APPROVE" || action === "REJECT") {
            if (!isApprover) return jsonError(403, "Forbidden")
            // Nobody signs off their own request — except ADMIN, who has no one above.
            if (isRequester && !isAdmin) {
                return jsonError(403, action === "APPROVE" ? "You cannot approve your own request" : "You cannot reject your own request — cancel it instead")
            }
            if (existing.status !== "SUBMITTED") return jsonError(409, `This request is already ${existing.status.toLowerCase().replace("_", " ")}`)
        }

        if (action === "APPROVE") {
            const given: ApproveItem[] = Array.isArray(body?.items) ? body.items : []
            const byId = new Map(given.filter(g => g?.id).map(g => [String(g.id), g]))
            for (const id of Array.from(byId.keys())) {
                if (!existing.items.some(i => i.id === id)) return jsonError(400, "An item doesn't belong to this request")
            }
            const decisions: { id: string; approvedQty: number }[] = []
            for (const it of existing.items) {
                const g = byId.get(it.id)
                // An item left out is approved as requested.
                const q = g ? parseIntStrict(g.approvedQty) : it.requestedQty
                if (q === null || q < 0 || q > it.requestedQty) {
                    return jsonError(400, `Approved quantity must be between 0 and ${it.requestedQty}`)
                }
                decisions.push({ id: it.id, approvedQty: q })
            }
            if (decisions.every(d => d.approvedQty === 0)) return jsonError(400, "Use Reject to decline every item")
            const full = decisions.every(d => d.approvedQty === existing.items.find(i => i.id === d.id)!.requestedQty)
            const status = full ? "APPROVED" : "PARTIALLY_APPROVED"
            const note = body?.note?.toString().trim() || null

            await prisma.$transaction(async tx => {
                // Status guard in the WHERE: two approvers clicking at once can't both win.
                const won = await tx.assetRequest.updateMany({
                    where: { id: existing.id, status: "SUBMITTED" },
                    data: { status, decidedBy: actorId, decidedAt: new Date(), decisionNote: note },
                })
                if (won.count === 0) throw new WorkflowError(409, "This request was already decided")
                for (const d of decisions) {
                    await tx.assetRequestItem.update({ where: { id: d.id }, data: { approvedQty: d.approvedQty } })
                }
                await audit(tx, {
                    entity: "AssetRequest", entityId: existing.id, action: status === "APPROVED" ? "APPROVE" : "PARTIAL_APPROVE",
                    userId: actorId, reason: note,
                    before: { status: existing.status, items: existing.items.map(i => ({ id: i.id, requestedQty: i.requestedQty, approvedQty: i.approvedQty })) },
                    after: { status, items: decisions },
                })
            })
            outcome = status === "APPROVED" ? "approved" : "partially approved"
            message = note ? ` — ${note}` : ""
        } else if (action === "REJECT") {
            const reason = body?.reason?.toString().trim() ?? ""
            if (reason.length < 3) return jsonError(400, "Give a reason for rejecting (at least 3 characters)")
            await prisma.$transaction(async tx => {
                const won = await tx.assetRequest.updateMany({
                    where: { id: existing.id, status: "SUBMITTED" },
                    data: { status: "REJECTED", decidedBy: actorId, decidedAt: new Date(), decisionNote: reason },
                })
                if (won.count === 0) throw new WorkflowError(409, "This request was already decided")
                await tx.assetRequestItem.updateMany({ where: { requestId: existing.id }, data: { approvedQty: 0 } })
                await audit(tx, {
                    entity: "AssetRequest", entityId: existing.id, action: "REJECT", userId: actorId, reason,
                    before: { status: existing.status }, after: { status: "REJECTED" },
                })
            })
            outcome = "rejected"
            message = `: ${reason}`
        } else {
            if (!isRequester && !isApprover) return jsonError(403, "Forbidden")
            if (!["SUBMITTED", "APPROVED", "PARTIALLY_APPROVED"].includes(existing.status)) {
                return jsonError(409, `This request is already ${existing.status.toLowerCase().replace("_", " ")}`)
            }
            const reason = body?.reason?.toString().trim() || null
            await prisma.$transaction(async tx => {
                const won = await tx.assetRequest.updateMany({
                    where: { id: existing.id, status: existing.status },
                    data: { status: "CANCELLED", ...(reason ? { decisionNote: reason } : {}) },
                })
                if (won.count === 0) throw new WorkflowError(409, "This request changed — refresh and try again")
                // Checked inside the transaction so an issue racing the cancel is seen.
                const issued = await tx.assetRequestItem.aggregate({ where: { requestId: existing.id }, _sum: { issuedQty: true } })
                const n = issued._sum.issuedQty ?? 0
                if (n > 0) throw new WorkflowError(409, `${n} already issued on this request — it can't be cancelled`)
                await audit(tx, {
                    entity: "AssetRequest", entityId: existing.id, action: "CANCEL", userId: actorId, reason,
                    before: { status: existing.status }, after: { status: "CANCELLED" },
                })
            })
            outcome = "cancelled"
            message = reason ? `: ${reason}` : ""
        }

        if (!isRequester) {
            try {
                await prisma.notification.create({
                    data: {
                        userId: existing.requestedBy,
                        title: `Asset request ${outcome}`,
                        message: `Your asset request ${existing.requestNo} was ${outcome}${message}`,
                        type: "asset",
                        link: `/assets?tab=requests&id=${existing.id}`,
                    },
                })
            } catch (notifErr) {
                console.error("[ASSET_REQUEST_NOTIF]", notifErr)
            }
        }

        return NextResponse.json(await loadDetail(existing.id))
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_REQUEST_PATCH]")
    }
}
