import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess, canOverseeAssets } from "@/lib/permissions"
import { csvSafe } from "@/lib/csv-safe"
import { workflowErrorResponse, jsonError, dateRange, userNames, employeeName } from "@/lib/asset-workflow"

const TYPES = [
    "employee-wise", "asset-wise", "pending-approvals", "approved-not-issued", "partially-fulfilled",
    "monthly", "exit-clearance", "size-wise", "returns-lost",
] as const
type ReportType = (typeof TYPES)[number]
type Cell = string | number | null
type Report = { columns: string[]; rows: Cell[][] }

const IST_OFFSET_MS = 330 * 60_000
// Users read dates in IST; the server runs in UTC.
const day = (d: Date | null | undefined) =>
    d ? d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : ""
const monthKey = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 7)
const daysSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000)
const OPEN_FOR_ISSUE = ["APPROVED", "PARTIALLY_APPROVED"]

const empSelect = { id: true, employeeId: true, firstName: true, lastName: true, department: { select: { name: true } } } as const
const assetSelect = { id: true, assetCode: true, name: true, category: true, available: true } as const

async function build(type: ReportType, from: string | null, to: string | null): Promise<Report> {
    const range = dateRange(from, to)

    switch (type) {
        case "employee-wise": {
            const issues = await prisma.assetIssue.findMany({
                where: range ? { issuedAt: range } : {},
                include: { employee: { select: empSelect }, asset: { select: assetSelect }, requestItem: { select: { request: { select: { requestNo: true } } } } },
                orderBy: [{ employee: { firstName: "asc" } }, { issuedAt: "desc" }],
            })
            return {
                columns: ["Employee Code", "Employee", "Department", "Issue No", "Request No", "Asset Code", "Asset", "Size", "Serial No", "Qty", "Returned", "Outstanding", "Status", "Issued On", "Acknowledged On"],
                rows: issues.map(i => [
                    i.employee.employeeId, employeeName(i.employee), i.employee.department?.name ?? "", i.issueNo,
                    i.requestItem?.request.requestNo ?? "Direct", i.asset.assetCode, i.asset.name, i.size, i.serialNo,
                    i.quantity, i.returnedQty, i.status === "ACTIVE" ? i.quantity - i.returnedQty : 0, i.status,
                    day(i.issuedAt), day(i.acknowledgedAt),
                ]),
            }
        }

        case "asset-wise": {
            const [assets, items, issues, returns, metas, active] = await Promise.all([
                prisma.asset.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, assetCode: true, name: true, category: true, quantity: true, available: true } }),
                prisma.assetRequestItem.findMany({ where: range ? { request: { createdAt: range } } : {}, select: { assetId: true, requestedQty: true, approvedQty: true } }),
                prisma.assetIssue.findMany({ where: range ? { issuedAt: range } : {}, select: { assetId: true, quantity: true } }),
                prisma.assetStockTxn.findMany({ where: { type: "RETURN", ...(range ? { createdAt: range } : {}) }, select: { assetId: true, qty: true } }),
                prisma.assetMeta.findMany({ select: { assetId: true, size: true, reorderLevel: true } }),
                prisma.assetIssue.findMany({ where: { status: "ACTIVE" }, select: { assetId: true, quantity: true, returnedQty: true } }),
            ])
            const sum = <T extends { assetId: string }>(rows: T[], f: (r: T) => number) => {
                const m = new Map<string, number>()
                for (const r of rows) m.set(r.assetId, (m.get(r.assetId) ?? 0) + f(r))
                return m
            }
            const req = sum(items, r => r.requestedQty), appr = sum(items, r => r.approvedQty ?? 0)
            const iss = sum(issues, r => r.quantity), ret = sum(returns, r => r.qty)
            const out = sum(active, r => r.quantity - r.returnedQty)
            const meta = new Map(metas.map(m => [m.assetId, m]))
            return {
                columns: ["Asset Code", "Asset", "Category", "Size", "Owned", "Available", "Out With Employees", "Requested", "Approved", "Issued", "Returned", "Reorder Level"],
                rows: assets.map(a => [
                    a.assetCode, a.name, a.category, meta.get(a.id)?.size ?? "", a.quantity, a.available, out.get(a.id) ?? 0,
                    req.get(a.id) ?? 0, appr.get(a.id) ?? 0, iss.get(a.id) ?? 0, ret.get(a.id) ?? 0, meta.get(a.id)?.reorderLevel ?? 0,
                ]),
            }
        }

        case "pending-approvals": {
            const reqs = await prisma.assetRequest.findMany({
                where: { status: "SUBMITTED", ...(range ? { createdAt: range } : {}) },
                include: { items: { include: { employee: { select: empSelect }, asset: { select: assetSelect } } } },
                orderBy: { createdAt: "asc" },
            })
            const users = await userNames(prisma, reqs.map(r => r.requestedBy))
            return {
                columns: ["Request No", "Raised On", "Raised By", "Reason", "Employee Code", "Employee", "Asset", "Size", "Qty", "Age (days)"],
                rows: reqs.flatMap(r => r.items.map(i => [
                    r.requestNo, day(r.createdAt), users.get(r.requestedBy)?.name ?? "", r.reason,
                    i.employee.employeeId, employeeName(i.employee), i.asset.name, i.size, i.requestedQty, daysSince(r.createdAt),
                ])),
            }
        }

        case "approved-not-issued":
        case "partially-fulfilled": {
            const items = await prisma.assetRequestItem.findMany({
                where: {
                    request: { status: { in: OPEN_FOR_ISSUE }, ...(range ? { decidedAt: range } : {}) },
                    approvedQty: { gt: 0 },
                    ...(type === "approved-not-issued" ? { issuedQty: 0 } : { issuedQty: { gt: 0 } }),
                },
                include: { request: { select: { requestNo: true, decidedAt: true } }, employee: { select: empSelect }, asset: { select: assetSelect } },
                orderBy: { request: { decidedAt: "asc" } },
            })
            const rows = items
                .filter(i => i.issuedQty < (i.approvedQty ?? 0))
                .map(i => [
                    i.request.requestNo, day(i.request.decidedAt), i.employee.employeeId, employeeName(i.employee),
                    i.asset.name, i.size, i.approvedQty ?? 0, i.issuedQty, (i.approvedQty ?? 0) - i.issuedQty, i.asset.available,
                    i.request.decidedAt ? daysSince(i.request.decidedAt) : "",
                ])
            return {
                columns: ["Request No", "Approved On", "Employee Code", "Employee", "Asset", "Size", "Approved", "Issued", "Pending", "In Stock", "Waiting (days)"],
                rows,
            }
        }

        case "monthly": {
            // Default to the last 12 months so an open-ended run stays small.
            const r = range ?? { gte: new Date(Date.now() - 365 * 86_400_000) }
            const [reqs, issues, returns, losses] = await Promise.all([
                prisma.assetRequest.findMany({ where: { createdAt: r }, select: { createdAt: true, items: { select: { requestedQty: true, approvedQty: true } } } }),
                prisma.assetIssue.findMany({ where: { issuedAt: r }, select: { issuedAt: true, quantity: true } }),
                prisma.assetStockTxn.findMany({ where: { type: "RETURN", createdAt: r }, select: { createdAt: true, qty: true } }),
                prisma.assetAuditLog.findMany({
                    where: { entity: "AssetIssue", action: { in: ["LOST", "DAMAGED", "WRITTEN_OFF", "RETURN"] }, createdAt: r },
                    select: { createdAt: true, action: true, after: true },
                }),
            ])
            type Row = { requests: number; requested: number; approved: number; issued: number; returned: number; lost: number }
            const m = new Map<string, Row>()
            const at = (d: Date) => {
                const k = monthKey(d)
                if (!m.has(k)) m.set(k, { requests: 0, requested: 0, approved: 0, issued: 0, returned: 0, lost: 0 })
                return m.get(k)!
            }
            for (const q of reqs) {
                const row = at(q.createdAt)
                row.requests++
                for (const i of q.items) { row.requested += i.requestedQty; row.approved += i.approvedQty ?? 0 }
            }
            for (const i of issues) at(i.issuedAt).issued += i.quantity
            for (const t of returns) at(t.createdAt).returned += t.qty
            for (const l of losses) {
                const after = (l.after ?? {}) as { quantity?: number; condition?: string }
                if (l.action === "RETURN" && after.condition !== "DAMAGED") continue
                at(l.createdAt).lost += Number(after.quantity ?? 0)
            }
            return {
                columns: ["Month", "Requests", "Units Requested", "Units Approved", "Units Issued", "Units Returned", "Lost / Damaged"],
                rows: Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
                    .map(([k, v]) => [k, v.requests, v.requested, v.approved, v.issued, v.returned, v.lost]),
            }
        }

        case "exit-clearance": {
            const exits = await prisma.exitRequest.findMany({
                where: { status: { not: "CANCELLED" }, ...(range ? { resignationDate: range } : {}) },
                select: {
                    status: true, lastWorkingDate: true,
                    employee: {
                        select: {
                            ...empSelect,
                            assetIssues: { where: { status: "ACTIVE" }, include: { asset: { select: assetSelect } } },
                            // Pre-workflow assignments have no AssetIssue but still block clearance.
                            assets: { where: { isActive: true, workflowIssue: { is: null } }, include: { asset: { select: assetSelect } } },
                        },
                    },
                },
                orderBy: { lastWorkingDate: "asc" },
            })
            const rows: Cell[][] = []
            for (const x of exits) {
                const e = x.employee
                const base = [e.employeeId, employeeName(e), e.department?.name ?? "", x.status, day(x.lastWorkingDate)]
                for (const i of e.assetIssues) {
                    rows.push([...base, i.issueNo, i.asset.assetCode, i.asset.name, i.size, i.serialNo, i.quantity - i.returnedQty, day(i.issuedAt)])
                }
                for (const a of e.assets) {
                    rows.push([...base, "Legacy", a.asset.assetCode, a.asset.name, "", "", 1, day(a.issuedAt)])
                }
            }
            return {
                columns: ["Employee Code", "Employee", "Department", "Exit Status", "Last Working Day", "Issue No", "Asset Code", "Asset", "Size", "Serial No", "Outstanding", "Issued On"],
                rows,
            }
        }

        case "size-wise": {
            const [items, active] = await Promise.all([
                prisma.assetRequestItem.findMany({
                    where: { request: { status: { notIn: ["CANCELLED"] }, ...(range ? { createdAt: range } : {}) } },
                    include: { asset: { select: assetSelect } },
                }),
                prisma.assetIssue.findMany({ where: { status: "ACTIVE" }, include: { asset: { select: assetSelect } } }),
            ])
            type Row = { asset: string; category: string; size: string; requested: number; approved: number; issued: number; out: number }
            const m = new Map<string, Row>()
            const at = (a: { id: string; name: string; category: string }, size: string | null) => {
                const k = `${a.id}|${size ?? ""}`
                if (!m.has(k)) m.set(k, { asset: a.name, category: a.category, size: size ?? "—", requested: 0, approved: 0, issued: 0, out: 0 })
                return m.get(k)!
            }
            for (const i of items) {
                const row = at(i.asset, i.size)
                row.requested += i.requestedQty; row.approved += i.approvedQty ?? 0; row.issued += i.issuedQty
            }
            for (const i of active) at(i.asset, i.size).out += i.quantity - i.returnedQty
            return {
                columns: ["Asset", "Category", "Size", "Requested", "Approved", "Issued", "Out With Employees"],
                rows: Array.from(m.values()).sort((a, b) => a.asset.localeCompare(b.asset) || a.size.localeCompare(b.size))
                    .map(r => [r.asset, r.category, r.size, r.requested, r.approved, r.issued, r.out]),
            }
        }

        case "returns-lost": {
            const logs = await prisma.assetAuditLog.findMany({
                where: { entity: "AssetIssue", action: { in: ["RETURN", "LOST", "DAMAGED", "WRITTEN_OFF", "REPLACE"] }, ...(range ? { createdAt: range } : {}) },
                orderBy: { createdAt: "desc" },
            })
            const issues = await prisma.assetIssue.findMany({
                where: { id: { in: Array.from(new Set(logs.map(l => l.entityId))) } },
                include: { employee: { select: empSelect }, asset: { select: assetSelect } },
            })
            const byId = new Map(issues.map(i => [i.id, i]))
            const users = await userNames(prisma, logs.map(l => l.userId))
            return {
                columns: ["Date", "Action", "Issue No", "Employee Code", "Employee", "Asset", "Qty", "Condition", "Note", "By"],
                rows: logs.flatMap(l => {
                    const i = byId.get(l.entityId)
                    if (!i) return []
                    const after = (l.after ?? {}) as { quantity?: number; condition?: string }
                    return [[
                        day(l.createdAt), l.action, i.issueNo, i.employee.employeeId, employeeName(i.employee), i.asset.name,
                        after.quantity ?? "", after.condition ?? "", l.reason ?? "", l.userId ? (users.get(l.userId)?.name ?? "") : "",
                    ]]
                }),
            }
        }
    }
}

function toCsv(r: Report) {
    const cell = (v: Cell) => {
        const s = csvSafe(v)
        return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    return [r.columns, ...r.rows].map(row => row.map(cell).join(",")).join("\r\n")
}

// GET — asset reports as { columns, rows } or a CSV download.
export async function GET(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!checkAccess(session, [], "assets.view") && !canOverseeAssets(session)) return jsonError(403, "Forbidden")

        const sp = new URL(req.url).searchParams
        const type = sp.get("type") as ReportType
        if (!TYPES.includes(type)) return jsonError(400, `type must be one of: ${TYPES.join(", ")}`)

        const report = await build(type, sp.get("from"), sp.get("to"))
        if (sp.get("format") === "csv") {
            const stamp = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10)
            // BOM so Excel opens ₹ / non-ASCII names correctly.
            return new NextResponse("﻿" + toCsv(report), {
                headers: {
                    "Content-Type": "text/csv; charset=utf-8",
                    "Content-Disposition": `attachment; filename="asset-${type}-${stamp}.csv"`,
                },
            })
        }
        return NextResponse.json(report)
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_REPORTS_GET]")
    }
}
