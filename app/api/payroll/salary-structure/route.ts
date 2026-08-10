import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { calcFullMonthCosts } from "@/lib/payroll-calc"
import { getPayrollRules } from "@/lib/payroll-rules-server"

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
// Bulk upsert salary structures
// Body: { rows: Array<{ employeeId, basic, da, washing, conveyance, leaveWithWages, otherAllowance, otRatePerHour, canteenRatePerDay, complianceType }> }
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.manage")) {
        return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await req.json()
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

    return NextResponse.json({ updated, errors })
}
