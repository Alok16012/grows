import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { istDay } from "@/lib/perf-hub"
import { perfCtx, perfErrorResponse, publishedByFamily } from "@/lib/perf-hub-db"

// GET — the registers my live KPI template reads, i.e. what I should be filing.
export async function GET(req: Request) {
    try {
        const ctx = await perfCtx(req)
        if (!ctx.employee) return NextResponse.json({ registers: [], template: null })
        const assignment = await prisma.perfAssignment.findUnique({ where: { employeeId: ctx.employee.id } })
        if (!assignment) return NextResponse.json({ registers: [], template: null })
        const template = (await publishedByFamily([assignment.templateFamilyId])).get(assignment.templateFamilyId) ?? null
        if (!template) return NextResponse.json({ registers: [], template: null })

        const kpis = await prisma.perfTemplateKpi.findMany({
            where: { templateId: template.id, sourceType: "REGISTER", registerId: { not: null } },
            select: { id: true, name: true, frequency: true, registerId: true },
        })
        const ids = Array.from(new Set(kpis.map(k => k.registerId!)))
        const [registers, today] = await Promise.all([
            prisma.perfRegister.findMany({ where: { id: { in: ids }, isActive: true }, orderBy: { name: "asc" } }),
            prisma.perfRegisterEntry.groupBy({
                by: ["registerId"],
                where: { employeeId: ctx.employee.id, registerId: { in: ids }, date: istDay() },
                _count: { _all: true },
            }),
        ])
        const todayBy = new Map(today.map(t => [t.registerId, t._count._all]))
        return NextResponse.json({
            template: { id: template.id, name: template.name, version: template.version },
            registers: registers.map(r => ({
                ...r,
                kpis: kpis.filter(k => k.registerId === r.id).map(({ registerId: _r, ...k }) => k),
                myEntriesToday: todayBy.get(r.id) ?? 0,
            })),
        })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_MY_REGISTERS]")
    }
}
