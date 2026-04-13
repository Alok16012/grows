import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { month, year, workingDays } = body

        if (!month || !year) {
            return new NextResponse("month and year are required", { status: 400 })
        }

        const m = parseInt(month)
        const y = parseInt(year)
        const wDays = workingDays || 26

        const employees = await prisma.employee.findMany({
            where: { status: "ACTIVE" },
            select: { id: true, basicSalary: true },
        })

        const startDate = new Date(y, m - 1, 1)
        const endDate = new Date(y, m, 1)

        let generated = 0
        const errors: string[] = []

        for (const employee of employees) {
            try {
                const attendances = await prisma.attendance.findMany({
                    where: {
                        employeeId: employee.id,
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
                const grossSalary = earnedBasic + hraAmt

                const pfEmployee = Math.round(earnedBasic * 0.12)
                const pfEmployer = Math.round(earnedBasic * 0.12)
                const esiEmployee = grossSalary <= 21000 ? Math.round(grossSalary * 0.0075) : 0
                const esiEmployer = grossSalary <= 21000 ? Math.round(grossSalary * 0.0325) : 0
                const totalDeductions = pfEmployee + esiEmployee
                const netSalary = grossSalary - totalDeductions

                const data = {
                    basicSalary: Math.round(earnedBasic),
                    hra: Math.round(hraAmt),
                    allowances: 0,
                    overtimePay: 0,
                    grossSalary: Math.round(grossSalary),
                    pfEmployee,
                    pfEmployer,
                    esiEmployee,
                    esiEmployer,
                    tds: 0,
                    otherDeductions: 0,
                    totalDeductions,
                    netSalary: Math.round(netSalary),
                    workingDays: wDays,
                    presentDays: effectiveDays,
                    leaveDays,
                    lwpDays,
                    overtimeHrs,
                    status: "DRAFT" as const,
                }

                await prisma.payroll.upsert({
                    where: { employeeId_month_year: { employeeId: employee.id, month: m, year: y } },
                    update: data,
                    create: { employeeId: employee.id, month: m, year: y, ...data },
                })

                generated++
            } catch (err) {
                errors.push(`Employee ${employee.id}: ${String(err)}`)
            }
        }

        return NextResponse.json({ generated, total: employees.length, errors })
    } catch (error) {
        console.error("[PAYROLL_BULK_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
