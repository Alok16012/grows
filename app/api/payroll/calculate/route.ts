import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { calcGrowusPayroll } from "@/lib/payroll-calc"

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const role = session.user.role
        if (role !== "ADMIN" && role !== "MANAGER" && role !== "HR_MANAGER") {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const body = await req.json()
        const { branchId, siteId, attendance } = body
        // Parse month/year as integers always
        const month = parseInt(String(body.month))
        const year  = parseInt(String(body.year))

        if (!month || !year) return new NextResponse("Month and Year required", { status: 400 })

        // Get or create payroll run
        let runId: string
        const existing = await prisma.payrollRun.findUnique({ where: { month_year: { month, year } } })
        if (existing) {
            if (existing.status !== "DRAFT") {
                return new NextResponse(`Payroll ${month}/${year} is ${existing.status} — cannot recalculate.`, { status: 400 })
            }
            runId = existing.id
        } else {
            const created = await prisma.payrollRun.create({
                data: { month, year, processedBy: session.user.id ?? "system", status: "DRAFT" }
            })
            runId = created.id
        }

        // Build employee list — site-wise takes priority over branch-wise
        let employeeIds: string[] | null = null
        if (siteId) {
            const deployments = await prisma.deployment.findMany({
                where: { siteId, isActive: true },
                select: { employeeId: true },
            })
            employeeIds = deployments.map(d => d.employeeId)
            if (!employeeIds.length) return new NextResponse("No active deployments found for this site", { status: 404 })
        }

        const whereClause: Record<string, unknown> = { status: "ACTIVE" }
        if (employeeIds) whereClause.id = { in: employeeIds }
        else if (branchId) whereClause.branchId = branchId

        const employees = await prisma.employee.findMany({
            where: whereClause,
            include: { employeeSalary: true },
        })

        if (!employees.length) return new NextResponse("No active employees found", { status: 404 })

        const defaultMonthDays = new Date(year, month, 0).getDate()
        let totalGross = 0, totalNet = 0, totalPfE = 0, totalEsiE = 0

        const results = await Promise.allSettled(
            employees.map(async emp => {
                // Use approved salary structure if available, else fall back to employee basic salary
                const sal = emp.employeeSalary
                const salBasic = (sal?.status === "APPROVED" ? sal.basic : null) ?? emp.basicSalary ?? 0
                const salData = sal?.status === "APPROVED" ? sal : null

                const attInput = (attendance as any[])?.find((a: any) => a.employeeId === emp.id) ?? {}
                const att = {
                    monthDays:           parseInt(String(attInput.monthDays  ?? defaultMonthDays)) || defaultMonthDays,
                    workedDays:          parseInt(String(attInput.workedDays ?? defaultMonthDays)) || defaultMonthDays,
                    otDays:              Number(attInput.otDays)              || 0,
                    canteenDays:         Math.round(Number(attInput.canteenDays) || 0),
                    penalty:             Number(attInput.penalty)             || 0,
                    advance:             Number(attInput.advance)             || 0,
                    otherDeductions:     Number(attInput.otherDeductions)     || 0,
                    productionIncentive: Number(attInput.productionIncentive) || 0,
                    lwf:                 Number(attInput.lwf)                 || 0,
                }

                const calc = calcGrowusPayroll({
                    basic:            salBasic,
                    da:               salData?.da               ?? 0,
                    washing:          salData?.washing          ?? 0,
                    conveyance:       salData?.conveyance       ?? 0,
                    leaveWithWages:   salData?.leaveWithWages   ?? 0,
                    otherAllowance:   salData?.otherAllowance   ?? 0,
                    otRatePerHour:    salData?.otRatePerHour    ?? 170,
                    canteenRatePerDay:salData?.canteenRatePerDay?? 55,
                    complianceType:   salData?.complianceType   ?? "OR",
                }, {
                    ...att,
                    gender: emp.gender ?? "Male",
                    month,
                })

                totalGross += calc.grossSalary
                totalNet   += calc.netSalary
                totalPfE   += calc.pfEmployer
                totalEsiE  += calc.esiEmployer

                return prisma.payroll.upsert({
                    where:  { employeeId_month_year: { employeeId: emp.id, month, year } },
                    create: {
                        employeeId: emp.id, payrollRunId: runId, month, year,
                        siteId: siteId ?? null,
                        ...calc,
                        canteenDays: att.canteenDays,
                        workingDays: att.monthDays,
                        presentDays: att.workedDays,
                        lwpDays:     att.monthDays - att.workedDays,
                        overtimeHrs: att.otDays,
                        status: "DRAFT",
                        processedBy: session.user.id ?? "system",
                    },
                    update: {
                        payrollRunId: runId,
                        siteId: siteId ?? null,
                        ...calc,
                        canteenDays: att.canteenDays,
                        workingDays: att.monthDays,
                        presentDays: att.workedDays,
                        lwpDays:     att.monthDays - att.workedDays,
                        overtimeHrs: att.otDays,
                        processedBy: session.user.id ?? "system",
                    }
                })
            })
        )

        const processedCount = results.filter(r => r.status === "fulfilled" && r.value !== null).length
        const failed = results.filter(r => r.status === "rejected")
        if (failed.length > 0) {
            console.error("[PAYROLL_CALCULATE] Some upserts failed:", failed.map(f => (f as PromiseRejectedResult).reason))
        }

        await prisma.payrollRun.update({
            where: { id: runId },
            data: { totalGross, totalNet, totalPfEmployer: totalPfE, totalEsiEmployer: totalEsiE }
        })

        return NextResponse.json({ success: true, processedCount, runId, failedCount: failed.length })
    } catch (error) {
        console.error("[PAYROLL_CALCULATE]", error)
        const msg = error instanceof Error ? error.message : "Internal Error"
        return new NextResponse(msg, { status: 500 })
    }
}
