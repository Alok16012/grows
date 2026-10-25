import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import * as XLSX from "xlsx"
import prisma from "@/lib/prisma"
import { guard, has, accessTablesReady, ACCESS_NOT_SET_UP, auditLater, requestMeta } from "@/lib/access"

// Audit log: who changed what access, when. Read-only — rows cannot be edited
// or deleted (a database trigger refuses it).
//
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&group=roles|users|signins|refused|payroll
//     &actor=<userId>&target=<id>&targetType=Role|User&q=…&page=1
// GET …&format=xlsx  → Excel (audit.export)

const PAGE_SIZE = 50
const IST_MS = 5.5 * 60 * 60 * 1000

const GROUPS: Record<string, Prisma.AuditLogWhereInput> = {
    roles: { action: { startsWith: "role." } },
    users: { action: { startsWith: "user." } },
    signins: { action: { startsWith: "auth." } },
    refused: { action: "permission.denied" },
    payroll: { OR: [{ action: { startsWith: "payroll." } }, { action: { startsWith: "export." } }] },
}

function istDay(v: string | null, endOfDay: boolean): Date | null {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
    const t = Date.parse(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    return Number.isNaN(t) ? null : new Date(t - IST_MS)
}

export async function GET(req: Request) {
    const g = await guard(req, "audit.view")
    if (g instanceof NextResponse) return g
    if (!(await accessTablesReady())) return NextResponse.json({ error: ACCESS_NOT_SET_UP, code: "NOT_SET_UP" }, { status: 503 })
    try {
        const sp = new URL(req.url).searchParams
        const and: Prisma.AuditLogWhereInput[] = []
        const from = istDay(sp.get("from"), false)
        const to = istDay(sp.get("to"), true)
        if (from || to) and.push({ at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } })
        const group = sp.get("group")
        if (group && GROUPS[group]) and.push(GROUPS[group])
        const actor = sp.get("actor")
        if (actor) and.push({ actorId: actor })
        const target = sp.get("target")
        if (target) and.push({ targetId: target })
        const targetType = sp.get("targetType")
        if (targetType) and.push({ targetType })
        const q = (sp.get("q") || "").trim()
        if (q) {
            and.push({
                OR: [
                    { actorName: { contains: q, mode: "insensitive" } },
                    { targetName: { contains: q, mode: "insensitive" } },
                    { summary: { contains: q, mode: "insensitive" } },
                    { action: { contains: q, mode: "insensitive" } },
                ],
            })
        }
        const where: Prisma.AuditLogWhereInput = and.length ? { AND: and } : {}

        if (sp.get("format") === "xlsx") {
            if (!has(g.access, "audit.export")) return NextResponse.json({ error: "Forbidden — missing audit.export" }, { status: 403 })
            const rows = await prisma.auditLog.findMany({ where, orderBy: { at: "desc" }, take: 20000 })
            const sheet = XLSX.utils.json_to_sheet(rows.map(r => ({
                When: new Date(r.at.getTime() + IST_MS).toISOString().replace("T", " ").slice(0, 19),
                Who: r.actorName ?? "", Action: r.action, Target: r.targetName ?? r.targetId ?? "", Type: r.targetType,
                "What changed": r.summary ?? "", Before: r.before ? JSON.stringify(r.before) : "", After: r.after ? JSON.stringify(r.after) : "",
                "IP address": r.ip ?? "", Batch: r.batchId ?? "",
            })))
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, sheet, "Audit log")
            const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
            auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "export.audit", targetType: "Export", targetName: "Audit log", summary: `Audit log export · ${rows.length} rows`, after: { rows: rows.length }, ...requestMeta(req) })
            return new NextResponse(new Uint8Array(buf), {
                headers: {
                    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.xlsx"`,
                },
            })
        }

        const page = Math.max(1, parseInt(sp.get("page") || "1") || 1)
        const [rows, total] = await Promise.all([
            prisma.auditLog.findMany({ where, orderBy: { at: "desc" }, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
            prisma.auditLog.count({ where }),
        ])

        // Alert: someone refused 10 times inside 5 minutes during the last day.
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const denials = await prisma.auditLog.findMany({
            where: { action: "permission.denied", at: { gte: since } },
            select: { actorId: true, actorName: true, at: true },
            orderBy: { at: "asc" },
            take: 5000,
        })
        const byActor = new Map<string, { name: string; times: number[] }>()
        for (const d of denials) {
            const key = d.actorId ?? "unknown"
            const e = byActor.get(key) ?? { name: d.actorName ?? "Unknown", times: [] }
            e.times.push(d.at.getTime())
            byActor.set(key, e)
        }
        const alerts: { actorId: string; actorName: string; count: number; at: string }[] = []
        for (const [actorId, e] of Array.from(byActor.entries())) {
            let best = 0, bestAt = 0
            for (let i = 0, j = 0; j < e.times.length; j++) {
                while (e.times[j] - e.times[i] > 5 * 60 * 1000) i++
                if (j - i + 1 > best) { best = j - i + 1; bestAt = e.times[j] }
            }
            if (best >= 10) alerts.push({ actorId, actorName: e.name, count: best, at: new Date(bestAt).toISOString() })
        }

        return NextResponse.json({
            rows, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
            alerts, canExport: has(g.access, "audit.export"),
        })
    } catch (e) {
        console.error("[AUDIT_GET]", e)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
