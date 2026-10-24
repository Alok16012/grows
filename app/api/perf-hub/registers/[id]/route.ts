import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { FREQUENCIES, isOneOf, parseRegisterFields } from "@/lib/perf-hub"
import { perfCtx, perfErrorResponse, requireManager, jsonError } from "@/lib/perf-hub-db"

type Params = { params: { id: string } }

export async function GET(req: Request, { params }: Params) {
    try {
        await perfCtx(req)
        const r = await prisma.perfRegister.findUnique({ where: { id: params.id }, include: { _count: { select: { entries: true } } } })
        if (!r) return jsonError(404, "Register not found")
        const { _count, ...register } = r
        return NextResponse.json({ register: { ...register, entryCount: _count.entries } })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_REGISTER_GET]")
    }
}

// PUT — edit a register. Old entries keep their JSON as-is; a field can't be
// removed while a KPI still reads it.
export async function PUT(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        const existing = await prisma.perfRegister.findUnique({ where: { id: params.id }, select: { id: true } })
        if (!existing) return jsonError(404, "Register not found")
        const body = await req.json().catch(() => ({}))
        const data: Prisma.PerfRegisterUpdateInput = {}

        if (body?.name !== undefined) {
            const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
            if (!name) return jsonError(400, "Register name is required")
            data.name = name
        }
        if (body?.code !== undefined) data.code = typeof body.code === "string" && body.code.trim() ? body.code.trim().slice(0, 40) : null
        if (body?.description !== undefined) {
            data.description = typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 1000) : null
        }
        if (body?.frequency !== undefined) {
            if (!isOneOf(FREQUENCIES, body.frequency)) return jsonError(400, "Frequency must be DAILY, WEEKLY or MONTHLY")
            data.frequency = body.frequency
        }
        if (body?.isActive !== undefined) data.isActive = !!body.isActive
        if (body?.fields !== undefined) {
            const parsed = parseRegisterFields(body.fields)
            if ("error" in parsed) return jsonError(400, parsed.error)
            const keys = new Set(parsed.fields.map(f => f.key))
            const kpis = await prisma.perfTemplateKpi.findMany({
                where: { registerId: params.id, template: { status: { not: "ARCHIVED" } } },
                select: { name: true, valueField: true, numeratorField: true, denominatorField: true },
            })
            for (const k of kpis) {
                for (const f of [k.valueField, k.numeratorField, k.denominatorField]) {
                    if (f && !keys.has(f)) return jsonError(400, `Field "${f}" is used by KPI "${k.name}"`)
                }
            }
            data.fields = parsed.fields as unknown as Prisma.InputJsonValue
        }

        const r = await prisma.perfRegister.update({ where: { id: params.id }, data, include: { _count: { select: { entries: true } } } })
        const { _count, ...register } = r
        return NextResponse.json({ register: { ...register, entryCount: _count.entries } })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_REGISTER_PUT]")
    }
}

// DELETE — soft (isActive=false) when it has entries or a KPI reads it, so
// history and report values stay explainable; hard delete otherwise.
export async function DELETE(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        const r = await prisma.perfRegister.findUnique({
            where: { id: params.id },
            include: { _count: { select: { entries: true, kpis: true } } },
        })
        if (!r) return jsonError(404, "Register not found")
        if (r._count.entries > 0 || r._count.kpis > 0) {
            await prisma.perfRegister.update({ where: { id: r.id }, data: { isActive: false } })
            return NextResponse.json({ ok: true, deactivated: true })
        }
        await prisma.perfRegister.delete({ where: { id: r.id } })
        return NextResponse.json({ ok: true, deactivated: false })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_REGISTER_DELETE]")
    }
}
