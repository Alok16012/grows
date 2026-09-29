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
            select: { id: true, gender: true, isHandicap: true },
        }),
    ])
    const empById = new Map(empDetails.map(e => [e.id, e]))

    // A future-dated increment must not change what the current month pays, so
    // the live EmployeeSalary row is only touched when the revision is already
    // in force. Payroll reads revisions anyway; EmployeeSalary is the snapshot
    // the rest of the app shows.
    const now = new Date()
    const isInForce = !hasEffective
        || monthKey(effYear!, effMonth!) <= monthKey(now.getFullYear(), now.getMonth() + 1)

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

            if (!isInForce) { updated++; continue }

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
        effectiveMonth: effMonth,
        effectiveYear:  effYear,
        // false when the increment is future-dated: the live structure was left
        // alone and only the revision was written.
        appliedNow: isInForce,
        affectedProcessed,
    })
}
