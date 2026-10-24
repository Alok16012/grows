import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canOverseeAssets, canRequestAssets } from "@/lib/permissions"
import { notifyApprovers } from "@/lib/hr-notify"
import {
    REQUEST_TYPES, REQUEST_REASONS, REQUEST_STATUSES, FULFILMENT_STATUSES, MAX_REQUEST_QTY,
    workflowErrorResponse, jsonError, nextNumber, withNumberRetry, audit,
    loadRequests, loadRequest, dateRange, pageParams, parseIntStrict,
    isUnassignableStatus, unassignableEmployeeMessage,
} from "@/lib/asset-workflow"

// GET — the request register. Approvers / issuers see everything; anyone else
// only the requests they raised.
export async function GET(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")

        const sp = new URL(req.url).searchParams
        const status = sp.get("status")
        const fulfilment = sp.get("fulfilment")
        const employeeId = sp.get("employeeId")
        const search = sp.get("search")?.trim()
        const { skip, take } = pageParams(sp)

        // Everything except the status filter, so the tab counts stay put while
        // the user flips between tabs.
        const base: Prisma.AssetRequestWhereInput = {}
        const and: Prisma.AssetRequestWhereInput[] = []
        if (!canOverseeAssets(session)) base.requestedBy = session.user.id
        if (fulfilment && (FULFILMENT_STATUSES as readonly string[]).includes(fulfilment)) base.fulfilmentStatus = fulfilment
        const created = dateRange(sp.get("from"), sp.get("to"))
        if (created) base.createdAt = created
        if (employeeId) and.push({ items: { some: { employeeId } } })
        if (search) {
            const s = { contains: search, mode: "insensitive" as const }
            and.push({
                OR: [
                    { requestNo: s },
                    { remarks: s },
                    { items: { some: { employee: { OR: [{ firstName: s }, { lastName: s }, { employeeId: s }] } } } },
                    { items: { some: { asset: { OR: [{ name: s }, { assetCode: s }] } } } },
                ],
            })
        }
        if (and.length) base.AND = and

        const where: Prisma.AssetRequestWhereInput = { ...base }
        if (status && status !== "ALL" && (REQUEST_STATUSES as readonly string[]).includes(status)) where.status = status

        const [requests, total, grouped] = await Promise.all([
            loadRequests(prisma, { where, orderBy: { createdAt: "desc" }, skip, take }),
            prisma.assetRequest.count({ where }),
            prisma.assetRequest.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
        ])
        const counts: Record<string, number> = Object.fromEntries(REQUEST_STATUSES.map(s => [s, 0]))
        let all = 0
        for (const g of grouped) {
            counts[g.status] = g._count._all
            all += g._count._all
        }

        return NextResponse.json({ requests, total, counts: { ...counts, all } })
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_REQUESTS_GET]")
    }
}

type ItemInput = { employeeId?: string; assetId?: string; size?: string; quantity?: unknown; remarks?: string }

// POST — raise a request for one or more employees.
export async function POST(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canRequestAssets(session)) return jsonError(403, "Forbidden")
        const actorId = session.user.id

        const body = await req.json().catch(() => ({}))
        const { requestType, reason, remarks, attachmentUrl } = body ?? {}
        const rawItems: ItemInput[] = Array.isArray(body?.items) ? body.items : []

        if (!(REQUEST_TYPES as readonly string[]).includes(requestType)) return jsonError(400, "requestType must be INDIVIDUAL or MULTIPLE")
        if (!(REQUEST_REASONS as readonly string[]).includes(reason)) return jsonError(400, "Pick a valid reason")
        if (rawItems.length === 0) return jsonError(400, "Add at least one item")

        const items: { employeeId: string; assetId: string; requestedQty: number; size: string | null; remarks: string | null }[] = []
        for (const it of rawItems) {
            if (!it?.employeeId || !it?.assetId) return jsonError(400, "Every item needs an employee and an asset")
            const quantity = parseIntStrict(it.quantity)
            if (quantity === null || quantity < 1 || quantity > MAX_REQUEST_QTY) {
                return jsonError(400, `Quantity must be a whole number from 1 to ${MAX_REQUEST_QTY}`)
            }
            items.push({
                employeeId: String(it.employeeId), assetId: String(it.assetId), requestedQty: quantity,
                size: it.size?.toString().trim() || null, remarks: it.remarks?.toString().trim() || null,
            })
        }

        const employeeIds = Array.from(new Set(items.map(i => i.employeeId)))
        if (requestType === "INDIVIDUAL" && employeeIds.length > 1) {
            return jsonError(400, "An individual request is for one employee — use Multiple for more")
        }
        const assetIds = Array.from(new Set(items.map(i => i.assetId)))
        const [employees, assets] = await Promise.all([
            prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, firstName: true, lastName: true, status: true } }),
            prisma.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, name: true, isActive: true } }),
        ])
        for (const id of employeeIds) {
            const e = employees.find(x => x.id === id)
            if (!e) return jsonError(400, "Employee not found")
            if (isUnassignableStatus(e.status)) return jsonError(400, unassignableEmployeeMessage(e))
        }
        for (const id of assetIds) {
            const a = assets.find(x => x.id === id)
            if (!a) return jsonError(400, "Asset not found")
            if (!a.isActive) return jsonError(400, `${a.name} is inactive and can't be requested`)
        }

        const created = await withNumberRetry("requestNo", bump => prisma.$transaction(async tx => {
            const requestNo = await nextNumber(tx, "AssetRequest", "AR", bump)
            const r = await tx.assetRequest.create({
                data: {
                    requestNo, requestType, reason,
                    remarks: remarks?.toString().trim() || null,
                    attachmentUrl: attachmentUrl || null,
                    requestedBy: actorId,
                    items: { create: items },
                },
            })
            await audit(tx, {
                entity: "AssetRequest", entityId: r.id, action: "CREATE", userId: actorId,
                after: { requestNo, requestType, reason, items },
            })
            return r
        }))

        await notifyApprovers(["assets.approve", "assets.manage"], {
            title: "Asset request raised",
            message: `Asset request ${created.requestNo} raised for ${employeeIds.length} employee(s)`,
            type: "asset",
            link: `/assets?tab=approvals&id=${created.id}`,
        }, actorId)

        const request = await loadRequest(prisma, created.id)
        return NextResponse.json(request, { status: 201 })
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_REQUESTS_POST]")
    }
}
