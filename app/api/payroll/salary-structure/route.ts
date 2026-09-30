import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { calcFullMonthCosts } from "@/lib/payroll-calc"
import { getPayrollRules } from "@/lib/payroll-rules-server"
import { isValidEffectiveMonth, monthKey } from "@/lib/salary-revision"

// GET /api/payroll/salary-structure
// Returns all employees (active) with their salary structure (null if not set)
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.view")) {
        return new NextResponse("Forbidden", { status: 403 })
    }

    const employees = await prisma.employee.findMany({
        where: { status: "ACTIVE" },
        orderBy: { firstName: "asc" },
        select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            designation: true,
            basicSalary: true,
            gender: true,
            isHandicap: true,
            department: { select: { name: true } },
            deployments: {
                where: { isActive: true },
                include: { site: { select: { name: true } } },
                take: 1,
            },
            employeeSalary: true,
        },
    })

    return NextResponse.json(employees)
}

// POST /api/payroll/salary-structure
// Bulk upsert salary structures.
// Body: { rows: Array<{ employeeId, basic, da, washing, ... }>,
//         effectiveMonth?: number, effectiveYear?: number }
//
// With an effective month, each row is also written as a SalaryRevision dated
// to it, and the wage run uses that revision for any month from then on. The
// live EmployeeSalary row is only overwritten when the increment is effective
// NOW or earlier — a future-dated one must not change what this month pays.
// Without an effective month the behaviour is unchanged: overwrite in place.
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.manage")) {
        return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await req.json()

    // Effective month is optional, and invalid values are refused rather than
    // quietly ignored — silently applying an increment to the wrong month is
    // far worse than a rejected upload.
    const hasEffective = body.effectiveMonth != null && body.effectiveYear != null
    if (hasEffective && !isValidEffectiveMonth(body.effectiveMonth, body.effectiveYear)) {
        return new NextResponse("Invalid effective month", { status: 400 })
    }
    const effMonth = hasEffective ? Number(body.effectiveMonth) : null
    const effYear  = hasEffective ? Number(body.effectiveYear)  : null

    const rows: {
        employeeId: string   // the UUID from Employee.id
        basic: number; da: number; hra?: number; washing: number; conveyance: number
        leaveWithWages: number; otherAllowance: number
        bonus: number
        otRatePerHour: number; canteenRatePerDay: number
        complianceType: string
    }[] = body.rows ?? []

    if (!rows.length) return NextResponse.json({ updated: 0 })

    // Rules drive default rates and the CTC preview; employee gender/handicap
    // feed the same engine the wage run uses, so stored CTC matches reality.
    const [{ rules }, empDetails] = await Promise.all([
        getPayrollRules(),
        prisma.employee.findMany({
            where: { id: { in: rows.map(r => r.employeeId) } },
            select: { id: true, gender: true, isHandicap: true, dateOfJoining: true },
        }),
    ])
    const empById = new Map(empDetails.map(e => [e.id, e]))

    // EmployeeSalary is the snapshot the rest of the app shows, so it must hold
    // whatever is in force TODAY. Payroll itself reads revisions and doesn't
    // depend on this.
    //
    // Two ways an upload must leave it alone. A FUTURE-dated increment, which
    // must not change what the current month pays. And a BACK-dated one that a
    // later revision already supersedes — filing what August was paid on must
    // not drag the live row back to August's figures. The second is per
    // employee, since only some of them may have a newer revision on file.
    const now = new Date()
    const nowKey = monthKey(now.getFullYear(), now.getMonth() + 1)
    const notFutureDated = !hasEffective || monthKey(effYear!, effMonth!) <= nowKey

    // Employees already carrying a revision that sits AFTER this one but is
    // still in force today — for them this upload is history, not the current
    // structure.
    const supersededFor = new Set<string>()
    if (hasEffective && notFutureDated) {
        const later = await prisma.salaryRevision.findMany({
            where: {
                employeeId: { in: rows.map(r => r.employeeId) },
                OR: [
                    { effectiveYear: { gt: effYear! } },
                    { effectiveYear: effYear!, effectiveMonth: { gt: effMonth! } },
                ],
            },
            select: { employeeId: true, effectiveYear: true, effectiveMonth: true },
        })
        for (const r of later) {
            if (monthKey(r.effectiveYear, r.effectiveMonth) <= nowKey) supersededFor.add(r.employeeId)
        }
    }

    // SalaryRevision arrived in a migration, and production migrations here are
    // applied by hand. Without the table every row throws inside the loop below
    // and the upload comes back "0 updated" with the real reason buried in a
    // per-row error list — which is exactly how it failed the first time. Check
    // once, up front, and say what to do about it.
    if (hasEffective) {
        try {
            await prisma.salaryRevision.findFirst({ select: { id: true } })
        } catch (e) {
            const msg = (e as Error).message ?? ""
            if (/does not exist|P2021|relation .* does not exist/i.test(msg)) {
                return new NextResponse(
                    "Salary revisions are not set up on this database yet. Run the pending migration "
                    + "(prisma/migrations/20260929120000_salary_revision) and upload again. "
                    + "Nothing was changed.",
                    { status: 503 },
                )
            }
            throw e
        }
    }

    // ── Preserve the structure being replaced ────────────────────────────────
    // A dated increment only protects earlier months if those months have a
    // revision of their own to read. Without one they fall back to
    // EmployeeSalary — the very row this upload is about to overwrite — so
    // re-running an OLD month would quietly pay the NEW figures. That is the
    // whole thing effective dating exists to prevent.
    //
    // So before writing the increment, the outgoing structure is recorded as a
    // revision covering the period before it: dated to the employee's joining
    // month, since that is the earliest month they could ever be paid for.
    // Only for employees who have no earlier revision already — once history
    // exists, it is the truth and must not be overwritten by today's snapshot.
    let preserved = 0
    if (hasEffective) {
        const ids = rows.map(r => r.employeeId)
        const [currentSalaries, earlier] = await Promise.all([
            prisma.employeeSalary.findMany({ where: { employeeId: { in: ids } } }),
            prisma.salaryRevision.findMany({
                where: {
                    employeeId: { in: ids },
                    OR: [
                        { effectiveYear: { lt: effYear! } },
                        { effectiveYear: effYear!, effectiveMonth: { lt: effMonth! } },
                    ],
                },
                select: { employeeId: true },
            }),
        ])
        const alreadyHasHistory = new Set(earlier.map(r => r.employeeId))

        const baselines = currentSalaries.flatMap(sal => {
            if (alreadyHasHistory.has(sal.employeeId)) return []
            const doj = empById.get(sal.employeeId)?.dateOfJoining
            // No joining date on file: fall back to the floor the validator
            // allows, which simply means "for as long as this employee existed".
            const bYear  = doj ? doj.getFullYear()  : 2000
            const bMonth = doj ? doj.getMonth() + 1 : 1
            // Joined on or after the increment: there is no earlier period to
            // protect, and a baseline would only sit on top of the new one.
            if (monthKey(bYear, bMonth) >= monthKey(effYear!, effMonth!)) return []
            return [{
                employeeId:        sal.employeeId,
                effectiveYear:     bYear,
                effectiveMonth:    bMonth,
                basic:             sal.basic,
                da:                sal.da,
                hra:               sal.hra,
                washing:           sal.washing,
                conveyance:        sal.conveyance,
                leaveWithWages:    sal.leaveWithWages,
                otherAllowance:    sal.otherAllowance,
                bonus:             sal.bonus,
                otRatePerHour:     sal.otRatePerHour,
                canteenRatePerDay: sal.canteenRatePerDay,
                complianceType:    sal.complianceType,
                ctcMonthly:        sal.ctcMonthly,
                ctcAnnual:         sal.ctcAnnual,
                note:              "Structure in force before the increment, recorded automatically",
                createdBy:         session.user.id,
            }]
        })

        if (baselines.length) {
            // skipDuplicates, never overwrite: a revision already sitting on
            // that month is real history and outranks this snapshot.
            const res = await prisma.salaryRevision.createMany({ data: baselines, skipDuplicates: true })
            preserved = res.count
        }
    }

    let updated = 0
    const errors: { employeeId: string; reason: string }[] = []

    for (const row of rows) {
        try {
            const basic      = Number(row.basic) || 0
            const da         = Number(row.da) || 0
            const washing    = Number(row.washing) || 0
            const conveyance = Number(row.conveyance) || 0
            const lww        = Number(row.leaveWithWages) || 0
            const other      = Number(row.otherAllowance) || 0
            const bonus      = Number(row.bonus) || 0
            const hra        = Number(row.hra) || 0
            const otRate     = Number(row.otRatePerHour) || rules.defaults.otRatePerHour
            const canteen    = Number(row.canteenRatePerDay) || rules.defaults.canteenRatePerDay
            const cType      = String(row.complianceType || "OR").toUpperCase() === "CALL" ? "CALL" : "OR"
            const emp        = empById.get(row.employeeId)
            // Full CTC (gross + employer PF/ESIC) from the shared engine — the
            // old inline sum stored gross-only, disagreeing with every other
            // CTC in the app.
            const ctcM       = calcFullMonthCosts({
                basic, da, washing, conveyance,
                leaveWithWages: lww, otherAllowance: other, hra, bonus,
                complianceType: cType,
                isHandicap: emp?.isHandicap ?? false,
            }, { gender: emp?.gender ?? "Male" }, rules).ctc

            if (hasEffective) {
                const fields = {
                    basic, da, washing, conveyance,
                    leaveWithWages:    lww,
                    otherAllowance:    other,
                    bonus,
                    otRatePerHour:     otRate,
                    canteenRatePerDay: canteen,
                    hra,
                    ctcMonthly:        ctcM,
                    ctcAnnual:         ctcM * 12,
                    complianceType:    cType,
                }
                // Re-uploading a month corrects that month rather than stacking
                // a second revision the lookup would have to break ties on.
                await prisma.salaryRevision.upsert({
                    where: {
                        employeeId_effectiveYear_effectiveMonth: {
                            employeeId:     row.employeeId,
                            effectiveYear:  effYear!,
                            effectiveMonth: effMonth!,
                        },
                    },
                    create: {
                        employeeId:     row.employeeId,
                        effectiveYear:  effYear!,
                        effectiveMonth: effMonth!,
                        createdBy:      session.user.id,
                        ...fields,
                    },
                    update: fields,
                })
            }

            // Future-dated, or already superseded for this employee: the
            // revision is filed and the live structure is left as it is.
            if (!notFutureDated || supersededFor.has(row.employeeId)) { updated++; continue }

            await prisma.employeeSalary.upsert({
                where: { employeeId: row.employeeId },
                create: {
                    employeeId:       row.employeeId,
                    basic, da, washing, conveyance,
                    leaveWithWages:   lww,
                    otherAllowance:   other,
                    bonus,
                    otRatePerHour:    otRate,
                    canteenRatePerDay: canteen,
                    hra, ctcMonthly: ctcM, ctcAnnual: ctcM * 12,
                    complianceType:   cType,
                    status:           "APPROVED",
                    proposedBy:       session.user.id,
                    approvedBy:       session.user.id,
                },
                update: {
                    basic, da, washing, conveyance,
                    leaveWithWages:   lww,
                    otherAllowance:   other,
                    bonus,
                    otRatePerHour:    otRate,
                    canteenRatePerDay: canteen,
                    hra, ctcMonthly: ctcM, ctcAnnual: ctcM * 12,
                    complianceType:   cType,
                    status:           "APPROVED",
                },
            })
            updated++
        } catch (e) {
            errors.push({ employeeId: row.employeeId, reason: (e as Error).message })
        }
    }

    // Already-processed months that this increment would now compute
    // differently. Nothing stored is rewritten and a locked row is never
    // touched by a re-run — but whoever uploaded the increment should know
    // which months are affected, so they can settle arrears themselves.
    let affectedProcessed: { month: number; year: number; count: number }[] = []
    if (hasEffective) {
        const processed = await prisma.payroll.groupBy({
            by: ["year", "month"],
            where: {
                employeeId: { in: rows.map(r => r.employeeId) },
                status: { not: "DRAFT" },
                OR: [
                    { year: { gt: effYear! } },
                    { year: effYear!, month: { gte: effMonth! } },
                ],
            },
            _count: { _all: true },
        })
        affectedProcessed = processed
            .map(p => ({ month: p.month, year: p.year, count: p._count._all }))
            .sort((a, b) => monthKey(a.year, a.month) - monthKey(b.year, b.month))
    }

    return NextResponse.json({
        updated,
        errors,
        // Employees whose previous structure was captured as history by this
        // upload, so earlier months keep paying what they used to.
        preserved,
        effectiveMonth: effMonth,
        effectiveYear:  effYear,
        // false when nothing became the live structure: the upload was
        // future-dated, or every row it touched is already superseded by a
        // newer revision. Either way only revisions were written.
        appliedNow: notFutureDated && supersededFor.size < rows.length,
        affectedProcessed,
    })
}
