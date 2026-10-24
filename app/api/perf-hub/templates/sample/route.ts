import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import type { RegisterField } from "@/lib/perf-hub"
import { perfCtx, perfErrorResponse, requireManager, loadTemplate } from "@/lib/perf-hub-db"

// POST — seed two sample DRAFT templates (Operation Manager, Recruiter) and the
// registers they read, so HR has something real to edit. Anything that already
// exists by name is reused / skipped, so a second click doesn't duplicate.

type SampleKpi = Omit<Prisma.PerfTemplateKpiUncheckedCreateInput, "kraId" | "templateId" | "registerId"> & { register?: string }
type SampleKra = { title: string; weight: number; kpis: SampleKpi[] }

const REGISTERS: { name: string; code: string; description: string; fields: RegisterField[] }[] = [
    {
        name: "Daily Recruitment Status",
        code: "REG-REC",
        description: "Recruiter's end-of-day numbers",
        fields: [
            { key: "cvs_sourced", label: "CVs sourced", type: "number", required: true },
            { key: "calls_made", label: "Calls made", type: "number" },
            { key: "interviews", label: "Interviews scheduled", type: "number", required: true },
            { key: "offers", label: "Offers released", type: "number" },
            { key: "joinings", label: "Joinings", type: "number" },
            { key: "remarks", label: "Remarks", type: "text" },
        ],
    },
    {
        name: "Daily Site Tracker",
        code: "REG-SITE",
        description: "Planned vs present manpower per site, filed daily by the operation manager",
        fields: [
            { key: "site", label: "Site", type: "text", required: true },
            { key: "planned", label: "Planned manpower", type: "number", required: true },
            { key: "present", label: "Present manpower", type: "number", required: true },
            { key: "attendance_updated", label: "Attendance updated", type: "yesno" },
            { key: "remarks", label: "Remarks", type: "text" },
        ],
    },
]

const pct100 = { valueType: "PERCENT", direction: "HIGHER", target: 100, targetLabel: "100%" }
const zeroCount = { valueType: "COUNT", direction: "LOWER", target: 0, targetLabel: "0" }

// Weights: KRAs total 100 and each KRA's KPIs total its weight.
const OPERATION_MANAGER: SampleKra[] = [
    {
        title: "Operations", weight: 40, kpis: [
            {
                name: "Manpower Fulfilment %", code: "OPS-01", frequency: "DAILY", valueType: "PERCENT", direction: "HIGHER",
                target: 98, targetLabel: ">=98%", weightage: 15, rollup: "AVG",
                measurable: "Present ÷ planned manpower across sites",
                sourceType: "REGISTER", register: "Daily Site Tracker", registerMode: "RATIO",
                numeratorField: "present", denominatorField: "planned",
            },
            { name: "Daily Attendance Updated on Projects", code: "OPS-02", frequency: "DAILY", ...pct100, weightage: 5, rollup: "AVG" },
            { name: "Project & Engineer List Updated", code: "OPS-03", frequency: "WEEKLY", ...pct100, weightage: 20, rollup: "AVG" },
        ],
    },
    {
        title: "Quality", weight: 5, kpis: [
            { name: "Compliance of Onsite Requirements", code: "QLT-01", frequency: "WEEKLY", ...pct100, weightage: 5, rollup: "AVG", evidenceRequired: true },
        ],
    },
    {
        title: "Safety", weight: 25, kpis: [
            { name: "Safety Incidents", code: "SAF-01", frequency: "DAILY", ...zeroCount, weightage: 5, rollup: "SUM" },
            { name: "Near Miss", code: "SAF-02", frequency: "DAILY", ...zeroCount, weightage: 20, rollup: "SUM" },
        ],
    },
    {
        title: "People & Training", weight: 30, kpis: [
            { name: "Open Positions", code: "PPL-01", frequency: "WEEKLY", ...zeroCount, weightage: 15, rollup: "LAST" },
            { name: "Leave Without Approval", code: "PPL-02", frequency: "MONTHLY", ...zeroCount, weightage: 15, rollup: "SUM" },
        ],
    },
]

const RECRUITER: SampleKra[] = [
    {
        title: "Sourcing", weight: 50, kpis: [
            {
                name: "CVs Sourced per Day", code: "REC-01", frequency: "DAILY", valueType: "COUNT", direction: "HIGHER",
                target: 10, targetLabel: ">=10/day", weightage: 20, rollup: "AVG", greenAt: 95, amberAt: 80,
                sourceType: "SYSTEM", systemMetric: "recruitment.leads_created",
            },
            {
                name: "Interviews Scheduled", code: "REC-02", frequency: "DAILY", valueType: "COUNT", direction: "HIGHER",
                target: 3, targetLabel: ">=3/day", weightage: 30, rollup: "AVG",
                sourceType: "SYSTEM", systemMetric: "recruitment.interviews",
            },
        ],
    },
    {
        title: "Closures", weight: 30, kpis: [
            {
                name: "Joinings", code: "REC-03", frequency: "MONTHLY", valueType: "COUNT", direction: "HIGHER",
                target: 8, targetLabel: ">=8/month", weightage: 30, rollup: "SUM",
                sourceType: "SYSTEM", systemMetric: "recruitment.joined",
            },
        ],
    },
    {
        title: "Quality", weight: 20, kpis: [
            {
                name: "Quality of Hire", code: "REC-04", frequency: "MONTHLY", valueType: "PERCENT", direction: "HIGHER",
                target: 90, targetLabel: ">=90% retained 90 days", weightage: 20, rollup: "LAST",
                measurable: "Joiners still active after 90 days",
            },
        ],
    },
]

const TEMPLATES = [
    { name: "Operation Manager KRA", roleLabel: "Operation Manager", kras: OPERATION_MANAGER },
    { name: "Recruiter KRA", roleLabel: "Recruiter", kras: RECRUITER },
]

export async function POST(req: Request) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)

        const result = await prisma.$transaction(async tx => {
            const registerIds = new Map<string, string>()
            const registers: { id: string; name: string; created: boolean }[] = []
            for (const r of REGISTERS) {
                const found = await tx.perfRegister.findFirst({ where: { name: r.name }, select: { id: true } })
                const id = found?.id ?? (await tx.perfRegister.create({
                    data: { ...r, fields: r.fields as unknown as Prisma.InputJsonValue, createdBy: ctx.userId },
                })).id
                registerIds.set(r.name, id)
                registers.push({ id, name: r.name, created: !found })
            }

            const created: string[] = []
            const skipped: string[] = []
            for (const t of TEMPLATES) {
                if (await tx.perfTemplate.findFirst({ where: { name: t.name }, select: { id: true } })) {
                    skipped.push(t.name)
                    continue
                }
                const tpl = await tx.perfTemplate.create({
                    data: { name: t.name, roleLabel: t.roleLabel, familyId: randomUUID(), createdBy: ctx.userId },
                })
                for (const [i, kra] of t.kras.entries()) {
                    const k = await tx.perfTemplateKra.create({
                        data: { templateId: tpl.id, title: kra.title, weight: kra.weight, sortOrder: i },
                    })
                    await tx.perfTemplateKpi.createMany({
                        data: kra.kpis.map(({ register, ...kpi }, j) => ({
                            ...kpi, kraId: k.id, templateId: tpl.id, sortOrder: j,
                            registerId: register ? registerIds.get(register) ?? null : null,
                        })),
                    })
                }
                created.push(tpl.id)
            }
            return { created, skipped, registers }
        }, { timeout: 20000 })

        const templates = await Promise.all(result.created.map(id => loadTemplate(id)))
        return NextResponse.json({ templates, skipped: result.skipped, registers: result.registers }, { status: 201 })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_TEMPLATES_SAMPLE]")
    }
}
