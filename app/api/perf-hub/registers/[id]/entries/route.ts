import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { parseDay, parseEntryValues, istDay, type RegisterField } from "@/lib/perf-hub"
import {
    perfCtx, perfErrorResponse, jsonError, myEmployeeId, isReviewerOf,
} from "@/lib/perf-hub-db"

type Params = { params: { id: string } }

const ENTRY_SELECT = {
    id: true, date: true, values: true, createdAt: true, updatedAt: true, createdBy: true,
    employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
} as const

// GET — entries of one register. Team viewers see everyone, a reviewer their
// reviewee, anyone else only their own.
export async function GET(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        const sp = new URL(req.url).searchParams
        const asked = sp.get("employeeId")
        const where: Prisma.PerfRegisterEntryWhereInput = { registerId: params.id }

        if (ctx.canView) {
            if (asked) where.employeeId = asked
        } else if (asked && asked !== ctx.employee?.id) {
            if (!(await isReviewerOf(ctx.userId, asked))) return jsonError(403, "Forbidden")
            where.employeeId = asked
        } else {
            where.employeeId = myEmployeeId(ctx)
        }

        const from = sp.get("from") ? parseDay(sp.get("from")) : null
        const to = sp.get("to") ? parseDay(sp.get("to")) : null
        if ((sp.get("from") && !from) || (sp.get("to") && !to)) return jsonError(400, "from / to must be YYYY-MM-DD")
        if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }

        const entries = await prisma.perfRegisterEntry.findMany({
            where, select: ENTRY_SELECT, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1000,
        })
        return NextResponse.json({ entries })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_ENTRIES_GET]")
    }
}

// POST — file an entry. Only HR (performance.manage) may file for someone else.
export async function POST(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        const body = await req.json().catch(() => ({}))
        const register = await prisma.perfRegister.findUnique({ where: { id: params.id } })
        if (!register) return jsonError(404, "Register not found")
        if (!register.isActive) return jsonError(400, "This register is no longer in use")

        let employeeId: string
        if (body?.employeeId && body.employeeId !== ctx.employee?.id) {
            if (!ctx.isManager) return jsonError(403, "Only HR can add entries for another employee")
            const emp = await prisma.employee.findUnique({ where: { id: String(body.employeeId) }, select: { id: true } })
            if (!emp) return jsonError(400, "Employee not found")
            employeeId = emp.id
        } else {
            if (!ctx.selfServe) return jsonError(403, "Forbidden")
            employeeId = myEmployeeId(ctx)
        }

        const date = body?.date ? parseDay(body.date) : istDay()
        if (!date) return jsonError(400, "Date must be YYYY-MM-DD")
        if (date.getTime() > istDay().getTime()) return jsonError(400, "Can't add an entry for a future date")

        const parsed = parseEntryValues(register.fields as unknown as RegisterField[], body?.values)
        if ("error" in parsed) return jsonError(400, parsed.error)

        const entry = await prisma.perfRegisterEntry.create({
            data: {
                registerId: register.id, employeeId, date,
                values: parsed.values as Prisma.InputJsonValue,
                createdBy: ctx.userId,
            },
            select: ENTRY_SELECT,
        })
        return NextResponse.json({ entry }, { status: 201 })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_ENTRIES_POST]")
    }
}

