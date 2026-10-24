import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { parseDay, parseEntryValues, istDay, type RegisterField } from "@/lib/perf-hub"
import { perfCtx, perfErrorResponse, jsonError, PerfHubError, type PerfCtx } from "@/lib/perf-hub-db"

type Params = { params: { id: string; entryId: string } }

const EDIT_WINDOW_MS = 7 * 86400000

/** The owner may correct an entry for 7 days; HR any time. */
async function editableEntry(ctx: PerfCtx, registerId: string, entryId: string) {
    const entry = await prisma.perfRegisterEntry.findUnique({ where: { id: entryId }, include: { register: true } })
    if (!entry || entry.registerId !== registerId) throw new PerfHubError(404, "Entry not found")
    if (ctx.isManager) return entry
    const owner = entry.employeeId === ctx.employee?.id || entry.createdBy === ctx.userId
    if (!owner) throw new PerfHubError(403, "Forbidden")
    if (Date.now() - entry.createdAt.getTime() > EDIT_WINDOW_MS) {
        throw new PerfHubError(403, "Entries can only be changed within 7 days — ask HR")
    }
    return entry
}

export async function PUT(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        const entry = await editableEntry(ctx, params.id, params.entryId)
        const body = await req.json().catch(() => ({}))
        const data: Prisma.PerfRegisterEntryUpdateInput = {}
        if (body?.date !== undefined) {
            const date = parseDay(body.date)
            if (!date) return jsonError(400, "Date must be YYYY-MM-DD")
            if (date.getTime() > istDay().getTime()) return jsonError(400, "Can't move an entry to a future date")
            data.date = date
        }
        if (body?.values !== undefined) {
            const parsed = parseEntryValues(entry.register.fields as unknown as RegisterField[], body.values)
            if ("error" in parsed) return jsonError(400, parsed.error)
            data.values = parsed.values as Prisma.InputJsonValue
        }
        const updated = await prisma.perfRegisterEntry.update({
            where: { id: entry.id }, data,
            select: {
                id: true, date: true, values: true, createdAt: true, updatedAt: true, createdBy: true,
                employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
            },
        })
        return NextResponse.json({ entry: updated })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_ENTRY_PUT]")
    }
}

export async function DELETE(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        const entry = await editableEntry(ctx, params.id, params.entryId)
        await prisma.perfRegisterEntry.delete({ where: { id: entry.id } })
        return NextResponse.json({ ok: true })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_ENTRY_DELETE]")
    }
}
