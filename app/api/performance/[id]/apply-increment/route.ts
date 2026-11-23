import { getServerSession } from "next-auth"
import { recalcDraftPayroll } from "@/lib/payroll-recalc"
import { checkEffectiveMonth } from "@/lib/payroll-change-control"
import { refreshArrears, logRevisions, salaryFigures } from "@/lib/salary-arrears"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { revisionsForMonth, monthInIST } from "@/lib/salary-revision"
import { calcFullMonthCosts } from "@/lib/payroll-calc"
import { getPayrollRules } from "@/lib/payroll-rules-server"

// Turn an HR-approved appraisal's increment into a salary revision.
//
// GET  ?month=&year=  → preview: the structure in force that month and the
//                       new one with Basic raised by the increment %.
// POST { month, year } → save it as that month's SalaryRevision. Payroll
//                       picks it up from that month on; earlier months keep
//                       their figures. The live EmployeeSalary row is only
//                       updated when the month is the current one or earlier.
//
// Only Basic is raised: DA follows the minimum-wage notification and the
// other components are fixed amounts set on the salary structure.

const MARK = (id: string) => `appraisal:${id}`

async function load(reviewId: string, month: number, year: number) {
    const review = await prisma.performanceReview.findUnique({
        where: { id: reviewId },
        select: {
            id: true, employeeId: true, incrementPercent: true, hrApprovedAt: true, status: true, periodEnd: true,
            employee: { select: { firstName: true, lastName: true, gender: true, isHandicap: true, employeeSalary: true } },
        },
    })
    if (!review) return { error: NextResponse.json({ error: "Appraisal not found." }, { status: 404 }) }
    if (!review.hrApprovedAt && review.status !== "COMPLETED") {
        return { error: NextResponse.json({ error: "HR must approve the appraisal before its increment can be applied." }, { status: 409 }) }
    }
    const pct = Number(review.incrementPercent ?? 0)
    if (!(pct > 0) || pct > 100) return { error: NextResponse.json({ error: "Set an increment % on the appraisal first." }, { status: 400 }) }

    const inForce = (await revisionsForMonth([review.employeeId], { month, year })).get(review.employeeId)
    const base = inForce ?? review.employee.employeeSalary
    if (!base) return { error: NextResponse.json({ error: "This employee has no salary structure yet. Set one in Payroll → Salary Master." }, { status: 400 }) }
    const from = {
        basic: Number(base.basic) || 0, da: Number(base.da) || 0, hra: Number(base.hra) || 0, washing: Number(base.washing) || 0,
        conveyance: Number(base.conveyance) || 0, leaveWithWages: Number(base.leaveWithWages) || 0,
        otherAllowance: Number(base.otherAllowance) || 0, bonus: Number(base.bonus) || 0,
        otRatePerHour: Number((base as any).otRatePerHour) || 0, canteenRatePerDay: Number((base as any).canteenRatePerDay) || 0,
        complianceType: (base as any).complianceType === "CALL" ? "CALL" : "OR",
    }
    const to = { ...from, basic: Math.round(from.basic * (1 + pct / 100)) }
    const { rules } = await getPayrollRules({ month, year })
    const cost = (s: typeof from) => calcFullMonthCosts({ ...s, isHandicap: review.employee.isHandicap ?? false }, { gender: review.employee.gender ?? "Male" }, rules)
    return { review, pct, from, to, ctcFrom: cost(from).ctc, ctcTo: cost(to).ctc }
}

function monthYear(sp: { month?: unknown; year?: unknown }) {
    const month = Number(sp.month), year = Number(sp.year)
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2020 || year > 2100) return null
    return { month, year }
}

const guard = (session: any) => checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.edit")

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!guard(session)) return NextResponse.json({ error: "You need Payroll (edit) to apply increments." }, { status: 403 })
    const sp = new URL(req.url).searchParams
    const my = monthYear({ month: sp.get("month"), year: sp.get("year") })
    if (!my) return NextResponse.json({ error: "Pick the month the increment starts." }, { status: 400 })
    const r = await load(params.id, my.month, my.year)
    if ("error" in r) return r.error
    const already = await prisma.salaryRevision.findFirst({ where: { employeeId: r.review.employeeId, note: { contains: MARK(r.review.id) } }, select: { effectiveMonth: true, effectiveYear: true } })
    return NextResponse.json({ incrementPercent: r.pct, from: r.from, to: r.to, ctcFrom: r.ctcFrom, ctcTo: r.ctcTo, alreadyApplied: already })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        if (!guard(session)) return NextResponse.json({ error: "You need Payroll (edit) to apply increments." }, { status: 403 })
        const body = await req.json().catch(() => ({}))
        const my = monthYear(body)
        if (!my) return NextResponse.json({ error: "Pick the month the increment starts." }, { status: 400 })
        // Change control (Payroll → Calculation Settings): open payroll month or the next.
        const effProblem = await checkEffectiveMonth(my, { isAdmin: (session.user as any)?.role === "ADMIN" }, body?.backdateReason)
        if (effProblem) return NextResponse.json({ error: effProblem }, { status: 400 })
        const r = await load(params.id, my.month, my.year)
        if ("error" in r) return r.error

        const already = await prisma.salaryRevision.findFirst({ where: { employeeId: r.review.employeeId, note: { contains: MARK(r.review.id) } } })
        if (already) return NextResponse.json({ error: `This increment was already applied from ${already.effectiveMonth}/${already.effectiveYear}.` }, { status: 409 })
        // A month payroll has already locked must not change under it.
        const locked = await prisma.payroll.findFirst({ where: { employeeId: r.review.employeeId, month: my.month, year: my.year, status: { in: ["PROCESSED", "PAID"] } }, select: { id: true } })
        if (locked) return NextResponse.json({ error: "Payroll for that month is already processed for this employee. Pick a later month." }, { status: 409 })

        const fields = { ...r.to, ctcMonthly: r.ctcTo, ctcAnnual: r.ctcTo * 12 }
        const note = `Increment ${r.pct}% (Basic ${r.from.basic} → ${r.to.basic}) from appraisal ${MARK(r.review.id)}`
        const now = monthInIST()
        const isNowOrPast = my.year * 12 + my.month <= now.year * 12 + now.month
        const prevRev = await prisma.salaryRevision.findUnique({ where: { employeeId_effectiveYear_effectiveMonth: { employeeId: r.review.employeeId, effectiveYear: my.year, effectiveMonth: my.month } } })
        await prisma.$transaction(async tx => {
            await tx.salaryRevision.upsert({
                where: { employeeId_effectiveYear_effectiveMonth: { employeeId: r.review.employeeId, effectiveYear: my.year, effectiveMonth: my.month } },
                create: { employeeId: r.review.employeeId, effectiveYear: my.year, effectiveMonth: my.month, createdBy: session.user.id, note, ...fields },
                update: { ...fields, note },
            })
            // The live row follows only once the increment is in effect, so
            // screens that read it don't show next month's pay today.
            if (isNowOrPast) {
                // Months before this fall back to the live row when nothing
                // earlier is on file, so record what it held first (same rule
                // as the Salary Master edit) or a re-run would pay the raise.
                const live = await tx.employeeSalary.findUnique({ where: { employeeId: r.review.employeeId } })
                const earlier = await tx.salaryRevision.findFirst({
                    where: { employeeId: r.review.employeeId, OR: [{ effectiveYear: { lt: my.year } }, { effectiveYear: my.year, effectiveMonth: { lt: my.month } }] },
                    select: { id: true },
                })
                if (live && !earlier) {
                    await tx.salaryRevision.createMany({
                        data: [{
                            employeeId: r.review.employeeId, effectiveYear: 2000, effectiveMonth: 1,
                            basic: live.basic, da: live.da, hra: live.hra, washing: live.washing, conveyance: live.conveyance,
                            leaveWithWages: live.leaveWithWages, otherAllowance: live.otherAllowance, bonus: live.bonus,
                            otRatePerHour: live.otRatePerHour, canteenRatePerDay: live.canteenRatePerDay, complianceType: live.complianceType,
                            ctcMonthly: live.ctcMonthly, ctcAnnual: live.ctcAnnual,
                            note: "Structure in force before an appraisal increment, recorded automatically",
                            createdBy: session.user.id,
                        }],
                        skipDuplicates: true,
                    })
                }
                await tx.employeeSalary.update({ where: { employeeId: r.review.employeeId }, data: { basic: r.to.basic, ctcMonthly: r.ctcTo, ctcAnnual: r.ctcTo * 12 } }).catch(() => null)
            }
        })
        await logRevisions([{ employeeId: r.review.employeeId, effectiveYear: my.year, effectiveMonth: my.month, source: "increment", before: salaryFigures(prevRev), after: salaryFigures(fields) ?? {}, changedBy: session.user.id }])
        // Draft payroll from that month on picks up the raise now.
        const recalculated = await recalcDraftPayroll({ from: my, employeeIds: [r.review.employeeId] })
        return NextResponse.json({ ok: true, effective: my, basicFrom: r.from.basic, basicTo: r.to.basic, ctcFrom: r.ctcFrom, ctcTo: r.ctcTo, recalculated })
    } catch (e) {
        console.error("[APPRAISAL_APPLY_INCREMENT]", e)
        return NextResponse.json({ error: "Could not apply the increment. Please try again." }, { status: 500 })
    }
}
