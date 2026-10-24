import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { FREQUENCIES, isOneOf, parseRegisterFields } from "@/lib/perf-hub"
import { perfCtx, perfErrorResponse, requireManager, jsonError } from "@/lib/perf-hub-db"

// GET — register definitions (field lists only, no entries). Everyone filing
// entries needs these, so any signed-in user may read them.
export async function GET(req: Request) {
    try {
        await perfCtx(req)
        const activeOnly = new URL(req.url).searchParams.get("active") === "1"
        const rows = await prisma.perfRegister.findMany({
            where: activeOnly ? { isActive: true } : {},
            orderBy: { name: "asc" },
            include: { _count: { select: { entries: true } } },
        })
        return NextResponse.json({
            registers: rows.map(({ _count, ...r }) => ({ ...r, entryCount: _count.entries })),
        })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_REGISTERS_GET]")
    }
}

export async function POST(req: Request) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        const body = await req.json().catch(() => ({}))
        const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : ""
        if (!name) return jsonError(400, "Register name is required")
        const frequency = body?.frequency ?? "DAILY"
        if (!isOneOf(FREQUENCIES, frequency)) return jsonError(400, "Frequency must be DAILY, WEEKLY or MONTHLY")
        const parsed = parseRegisterFields(body?.fields)
        if ("error" in parsed) return jsonError(400, parsed.error)

        const register = await prisma.perfRegister.create({
            data: {
                name, frequency,
                code: typeof body?.code === "string" && body.code.trim() ? body.code.trim().slice(0, 40) : null,
                description: typeof body?.description === "string" && body.description.trim() ? body.description.trim().slice(0, 1000) : null,
                fields: parsed.fields as unknown as Prisma.InputJsonValue,
                createdBy: ctx.userId,
            },
        })
        return NextResponse.json({ ...register, entryCount: 0 }, { status: 201 })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_REGISTERS_POST]")
    }
}
