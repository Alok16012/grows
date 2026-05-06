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

        // Get or create payroll run — always allow recalculation by resetting to DRAFT
        let runId: string
        const existing = await prisma.payrollRun.findUnique({ where: { month_year: { month, year } } })
        if (existing) {
            if (existing.status !== "DRAFT") {
                await prisma.payrollRun.update({
                    where: { id: existing.id },
                    data: { status: "DRAFT", processedBy: session.user.id ?? "system" }
                })
            }
            runId = existing.id
        } else {
            const created = await prisma.payrollRun.create({
                data: { month, year, processedBy: session.user.id ?? "system", status: "DRAFT" }
            })
            runId = created.id
        }

        // Build employee list:
        // If attendance array is provided (bulk upload flow), process EXACTLY those employees.
        // This ensures all employees from the uploaded sheet are processed, regardless of
        // whether they have a deployment record for this site.
        // Fallback: fetch by site deployment or branch if no attendance array is given.
        let employeeIds: string[] | null = null

        if (attendance && Array.isArray(attendance) && attendance.length > 0) {
            // Use the employee IDs from the attendance array directly
            employeeIds = (attendance as { employeeId: string }[]).map(a => a.employeeId).filter(Boolean)
        } else if (siteId) {
            const deployments = await prisma.deployment.findMany({
                where: { siteId, isActive: true },
                select: { employeeId: true },
            })
            employeeIds = deployments.map(d => d.employeeId)
            if (!employeeIds.length) return new NextResponse("No active deployments found for this site", { status: 404 })
        }

        const whereClause: Record<string, unknown> = {}
        if (employeeIds && employeeIds.length > 0) {
            // When processing from attendance upload, include ALL employees in the array
            // regardless of status — if they're in the sheet, they worked and need payroll
            whereClause.id = { in: employeeIds }
        } else {
            // Fallback (no attendance array): only process ACTIVE employees
            whereClause.status = "ACTIVE"
            if (branchId) whereClause.branchId = branchId
        }

        const employees = await prisma.employee.findMany({
            where: whereClause,
            include: { employeeSalary: true },
        })

        if (!employees.length) return new NextResponse("No active employees found", { status: 404 })

        const defaultMonthDays = 26
        let totalGross = 0, totalNet = 0, totalPfE = 0, totalEsiE = 0

        // ── STEP 1: Calculate ALL payroll values in memory (pure JS, zero DB calls) ──
        type PayrollRow = {
            employeeId: string
            payrollRunId: string
            month: number
            year: number
            siteId: string | null
            processedBy: string
            status: "DRAFT"
            workingDays: number
            presentDays: number
            lwpDays: number
            overtimeHrs: number
            canteenDays: number
            [key: string]: unknown
        }

        const allRows: PayrollRow[] = employees.map(emp => {
            const sal      = emp.employeeSalary
            const salBasic = (sal?.status === "APPROVED" ? sal.basic : null) ?? emp.basicSalary ?? 0
            const salData  = sal?.status === "APPROVED" ? sal : null

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
                basic:             salBasic,
                da:                salData?.da               ?? 0,
                washing:           salData?.washing          ?? 0,
                conveyance:        salData?.conveyance       ?? 0,
                leaveWithWages:    salData?.leaveWithWages   ?? 0,
                otherAllowance:    salData?.otherAllowance   ?? 0,
                bonus:             salData?.bonus            ?? undefined,
                otRatePerHour:     salData?.otRatePerHour    ?? 170,
                canteenRatePerDay: salData?.canteenRatePerDay ?? 55,
                complianceType:    salData?.complianceType   ?? "OR",
                isHandicap:        emp.isHandicap            ?? false,
            }, {
                ...att,
                gender: emp.gender ?? "Male",
                month,
            })

            totalGross += calc.grossSalary
            totalNet   += calc.netSalary
            totalPfE   += calc.pfEmployer
            totalEsiE  += calc.esiEmployer

            return {
                employeeId:  emp.id,
                payrollRunId: runId,
                month, year,
                siteId:      siteId ?? null,
                ...calc,
                canteenDays: att.canteenDays,
                workingDays: att.monthDays,
                presentDays: att.workedDays,
                lwpDays:     att.monthDays - att.workedDays,
                overtimeHrs: Math.round(att.otDays * 8),
                status:      "DRAFT" as const,
                processedBy: session.user.id ?? "system",
            }
        })

        // ── STEP 2: Find which records already exist (1 DB call) ──────────────────
        const existingRecords = await prisma.payroll.findMany({
            where: {
                month, year,
                employeeId: { in: employees.map(e => e.id) },
            },
            select: { employeeId: true },
        })
        const existingSet = new Set(existingRecords.map(r => r.employeeId))

        const toCreate = allRows.filter(r => !existingSet.has(r.employeeId))
        const toUpdate = allRows.filter(r =>  existingSet.has(r.employeeId))

        // ── STEP 3: Bulk-create new records (1 DB call for ALL) ───────────────────
        if (toCreate.length > 0) {
            await prisma.payroll.createMany({ data: toCreate, skipDuplicates: true })
        }

        // ── STEP 4: Update existing records in a single transaction ───────────────
        // prisma.$transaction([...array]) runs all ops on one connection — much faster
        // than individual round trips, and won't timeout on 144 records.
        if (toUpdate.length > 0) {
            const updateOps = toUpdate.map(row => {
                const { employeeId: empId, ...data } = row
                return prisma.payroll.update({
                    where: { employeeId_month_year: { employeeId: empId, month, year } },
                    data,
                })
            })
            await prisma.$transaction(updateOps)
        }

        const processedCount = allRows.length   // all rows were either created or updated

        // ── STEP 5: Update payroll run totals (1 DB call) ─────────────────────────
        await prisma.payrollRun.update({
            where: { id: runId },
            data: { totalGross, totalNet, totalPfEmployer: totalPfE, totalEsiEmployer: totalEsiE }
        })

        return NextResponse.json({
            success: true,
            processedCount,
            runId,
            failedCount: 0,
            totalEmployees: employees.length,
        })
    } catch (error) {
        console.error("[PAYROLL_CALCULATE]", error)
        const msg = error instanceof Error ? error.message : "Internal Error"
        return new NextResponse(msg, { status: 500 })
    }
}
