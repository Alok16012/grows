import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const month = searchParams.get("month")
        const year = searchParams.get("year")
        const status = searchParams.get("status")
        const employeeId = searchParams.get("employeeId")
        const search = searchParams.get("search")

        const where: Record<string, unknown> = {}
        if (month) where.month = parseInt(month)
        if (year) where.year = parseInt(year)
        if (status) where.status = status
        if (employeeId) where.employeeId = employeeId

        if (search) {
            where.employee = {
                OR: [
                    { firstName: { contains: search, mode: "insensitive" } },
                    { lastName: { contains: search, mode: "insensitive" } },
                    { employeeId: { contains: search, mode: "insensitive" } },
                ],
            }
        }

        const payrolls = await prisma.payroll.findMany({
            where,
            include: {
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                        photo: true,
                        deployments: {
                            where: { isActive: true },
                            include: { site: { select: { name: true } } },
                            take: 1,
                        },
                        department: { select: { name: true } },
                    },
                },
            },
            orderBy: [{ year: "desc" }, { month: "desc" }, { employee: { firstName: "asc" } }],
        })

        return NextResponse.json(payrolls)
    } catch (error) {
        console.error("[PAYROLL_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { employeeId, month, year, allowances, overtimePay, otherDeductions, tds, workingDays } = body

        if (!employeeId || !month || !year) {
            return new NextResponse("employeeId, month and year are required", { status: 400 })
        }

        const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
        if (!employee) return new NextResponse("Employee not found", { status: 404 })

        const m = parseInt(month)
        const y = parseInt(year)
        const wDays = workingDays || 26

        // Fetch attendance for the month
        const startDate = new Date(y, m - 1, 1)
        const endDate = new Date(y, m, 1)
        const attendances = await prisma.attendance.findMany({
            where: {
                employeeId,
                date: { gte: startDate, lt: endDate },
            },
        })

        const presentDays = attendances.filter(a => a.status === "PRESENT" || a.status === "HALF_DAY").length
        const leaveDays = attendances.filter(a => a.status === "LEAVE").length
        const lwpDays = attendances.filter(a => a.status === "ABSENT").length
        const overtimeHrs = attendances.reduce((s, a) => s + (a.overtimeHrs || 0), 0)

        const basicSalary = employee.basicSalary
        const effectiveDays = presentDays > 0 ? presentDays : wDays
        const dailyRate = basicSalary / wDays
        const earnedBasic = dailyRate * effectiveDays
        const hraAmt = earnedBasic * 0.2
        const allowancesAmt = allowances || 0
        const overtimePayAmt = overtimePay || 0
        const grossSalary = earnedBasic + hraAmt + allowancesAmt + overtimePayAmt

        const pfEmployee = Math.round(earnedBasic * 0.12)
        const pfEmployer = Math.round(earnedBasic * 0.12)
        const esiEmployee = grossSalary <= 21000 ? Math.round(grossSalary * 0.0075) : 0
        const esiEmployer = grossSalary <= 21000 ? Math.round(grossSalary * 0.0325) : 0
        const tdsAmt = tds || 0
        const otherDeductionsAmt = otherDeductions || 0
        const totalDeductions = pfEmployee + esiEmployee + tdsAmt + otherDeductionsAmt
        const netSalary = grossSalary - totalDeductions

        const data = {
            basicSalary: Math.round(earnedBasic),
            hra: Math.round(hraAmt),
            allowances: allowancesAmt,
            overtimePay: overtimePayAmt,
            grossSalary: Math.round(grossSalary),
            pfEmployee,
            pfEmployer,
            esiEmployee,
            esiEmployer,
            tds: tdsAmt,
            otherDeductions: otherDeductionsAmt,
            totalDeductions,
            netSalary: Math.round(netSalary),
            workingDays: wDays,
            presentDays: effectiveDays,
            leaveDays,
            lwpDays,
            overtimeHrs,
            status: "DRAFT" as const,
        }

        const payroll = await prisma.payroll.upsert({
            where: { employeeId_month_year: { employeeId, month: m, year: y } },
            update: data,
            create: { employeeId, month: m, year: y, ...data },
        })

        return NextResponse.json(payroll)
    } catch (error) {
        console.error("[PAYROLL_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
