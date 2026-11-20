import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { monthPeriod } from "@/lib/perf-hub"
import { buildScorecards, publishedByFamily, TEMPLATE_INCLUDE } from "@/lib/perf-hub-db"

// POST { replace?: boolean } — load the employee's KPI Hub template (People &
// Roles → assigned KRA/KPI template) onto this appraisal, with each KPI's
// actual = average monthly achievement % from APPROVED hub reports across the
// review period (target 100). So the appraisal score follows the same KPIs
// people report on every day/week/month instead of being typed again.
//
// A review that already has KRAs needs { replace: true }: its KRAs and KPIs
// are replaced (ratings and remarks on them go too). Completed reviews are
// never touched.
export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "performance.manage")) {
            return NextResponse.json({ error: "You need Performance (edit) to change an appraisal's KPIs." }, { status: 403 })
        }
        const body = await req.json().catch(() => ({}))
        const review = await prisma.performanceReview.findUnique({
            where: { id: params.id },
            select: { id: true, employeeId: true, periodStart: true, periodEnd: true, status: true, _count: { select: { kras: true, kpis: true } } },
        })
        if (!review) return NextResponse.json({ error: "Appraisal not found." }, { status: 404 })
        if (review.status === "COMPLETED") return NextResponse.json({ error: "This appraisal is completed; its KPIs can't change." }, { status: 409 })
        if ((review._count.kras || review._count.kpis) && body?.replace !== true) {
            return NextResponse.json({ error: "This appraisal already has KRAs. Confirm to replace them.", needsConfirm: true }, { status: 409 })
        }

        const assignment = await prisma.perfAssignment.findUnique({ where: { employeeId: review.employeeId } }).catch(() => null)
        if (!assignment) {
            return NextResponse.json({ error: "No KPI template is assigned to this employee. Assign one in Performance → People & Roles." }, { status: 400 })
        }
        const live = (await publishedByFamily([assignment.templateFamilyId])).get(assignment.templateFamilyId)
        const template = live ? await prisma.perfTemplate.findUnique({ where: { id: live.id }, include: TEMPLATE_INCLUDE }) : null
        if (!template || !template.kras.length) {
            return NextResponse.json({ error: "The assigned KPI template has no published version with KRAs yet." }, { status: 400 })
        }

        // Every month the review period touches (max 24).
        const months: string[] = []
        const d = new Date(Date.UTC(review.periodStart.getUTCFullYear(), review.periodStart.getUTCMonth(), 1))
        const end = review.periodEnd
        while (d <= end && months.length < 24) {
            months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`)
            d.setUTCMonth(d.getUTCMonth() + 1)
        }

        // Achievement % per KPI (by KRA title + KPI name) for each month.
        const perKpi = new Map<string, number[]>()
        const keyOf = (kra: string, kpi: string) => `${kra.trim().toLowerCase()}|${kpi.trim().toLowerCase()}`
        for (const m of months) {
            const period = monthPeriod(m)
            if (!period) continue
            const [card] = await buildScorecards([review.employeeId], period, true)
            for (const kra of card?.breakdown.kras ?? []) {
                for (const kpi of kra.kpis) {
                    if (kpi.achievementPct === null || kpi.achievementPct === undefined) continue
                    const k = keyOf(kra.title, kpi.name)
                    perKpi.set(k, [...(perKpi.get(k) ?? []), kpi.achievementPct])
                }
            }
        }
        const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10

        let kras = 0, kpis = 0, filled = 0
        await prisma.$transaction(async tx => {
            if (body?.replace === true) {
                await tx.kPI.deleteMany({ where: { reviewId: review.id } })
                await tx.kRA.deleteMany({ where: { reviewId: review.id } })
            }
            for (const kra of template.kras) {
                const created = await tx.kRA.create({
                    data: { reviewId: review.id, title: kra.title, weightage: kra.weight, description: `From KPI Hub: ${template.name} v${template.version}` },
                })
                kras++
                for (const kpi of kra.kpis) {
                    const vals = perKpi.get(keyOf(kra.title, kpi.name)) ?? []
                    const target = kpi.targetLabel ?? `${kpi.target}`
                    await tx.kPI.create({
                        data: {
                            reviewId: review.id, kraId: created.id, title: kpi.name, weightage: kpi.weightage,
                            target: 100, actual: vals.length ? avg(vals) : null,
                            description: `Achievement % of target (${target}, ${kpi.frequency.toLowerCase()}, ${kpi.direction === "LOWER" ? "lower is better" : "higher is better"}). `
                                + (vals.length ? `Average of ${vals.length} month(s) of approved reports.` : "No approved reports in this period yet."),
                        },
                    })
                    kpis++
                    if (vals.length) filled++
                }
            }
        }, { timeout: 30_000 })

        return NextResponse.json({ ok: true, template: `${template.name} v${template.version}`, months: months.length, kras, kpis, filled })
    } catch (e) {
        console.error("[APPRAISAL_HUB_IMPORT]", e)
        return NextResponse.json({ error: "Could not load from the KPI Hub. Please try again." }, { status: 500 })
    }
}
