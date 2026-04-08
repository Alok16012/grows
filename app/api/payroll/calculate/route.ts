import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const body = await req.json()
        const { month, year, branchId } = body

        if (!month || !year) {
            return new NextResponse("Month and Year required", { status: 400 })
        }

        // Check if run is locked
        let existingRun = await prisma.payrollRun.findUnique({
            where: { month_year: { month, year } }
        })

        if (existingRun && existingRun.status !== "DRAFT") {
            return new NextResponse(`Payroll for ${month}/${year} is not in DRAFT state. It is ${existingRun.status}.`, { status: 400 })
        }

        if (!existingRun) {
            existingRun = await prisma.payrollRun.create({
                data: {
                    month,
                    year,
                    processedBy: session.user.id,
                    status: "DRAFT"
                }
            })
        }

        // Fetch Employees (ACTIVE)
        const whereClause: any = { status: "ACTIVE" }
        if (branchId) whereClause.branchId = branchId

        const employees = await prisma.employee.findMany({
            where: whereClause,
            include: {
                employeeSalary: true,
                advances: {
                    where: { monthToImpact: month, yearToImpact: year, status: "APPROVED" }
                },
                attendances: {
                    where: {
                        date: {
                            gte: new Date(year, month - 1, 1),
                            lt: new Date(year, month, 1)
                        }
                    }
                }
            }
        })

        if (employees.length === 0) {
            return new NextResponse("No active employees found for this criteria.", { status: 404 })
        }

        const workingDays = new Date(year, month, 0).getDate() // days in month

        let batchTotalGross = 0
        let batchTotalNet = 0
        let batchTotalPfE = 0
        let batchTotalEsiE = 0
        let batchTotalLwf = 0
        let batchTotalTds = 0

        const upsertPromises = employees.map(async emp => {
            const sal = emp.employeeSalary
            if (!sal || sal.status !== "APPROVED") return null // Skip unapproved salaries

            // 1. Calculate Attendance
            // Assuming full days if missing, or exact. If attendance isn't meticulously tracked, we default to full.
            // But we must check attendance length
            let presentDays = 0
            let leaveDays = 0
            let otHrs = 0
            
            if (emp.attendances.length > 0) {
                emp.attendances.forEach(a => {
                    if (a.status === "PRESENT") presentDays += 1
                    else if (a.status === "LEAVE") leaveDays += 1
                    // half day logic etc
                    if (a.overtimeHrs > 0) otHrs += a.overtimeHrs
                })
            } else {
                // Default fallback if attendance not locked/mapped fully
                presentDays = workingDays
            }

            // Days calculated (Payable)
            const payableDays = Math.min(presentDays + leaveDays, workingDays) // Limit to working days

            // 2. Gross Earnings (Pro-Rata)
            const basicPr_rate = (sal.basic / workingDays) * payableDays
            const hraPr_rate = (sal.hra / workingDays) * payableDays
            const allowPr_rate = (sal.specialAllowance / workingDays) * payableDays

            // Overtime Pay = (Basic / WorkingDays / 8 hrs) * 2 * OTHrs
            const otHourlyRate = (sal.basic / workingDays / 8) * 2 
            const otPay = otHourlyRate * otHrs

            const computedGross = basicPr_rate + hraPr_rate + allowPr_rate + otPay

            // 3. Statutory Deductions
            let empPf = 0, emporPf = 0
            if (sal.isPfEligible) {
                empPf = basicPr_rate * 0.12
                emporPf = basicPr_rate * 0.12
            }

            let empEsi = 0, emporEsi = 0
            if (sal.isEsiEligible && computedGross <= 21000) {
                empEsi = computedGross * 0.0075 // 0.75%
                emporEsi = computedGross * 0.0325 // 3.25%
            }

            // PT & LWF (Mocks based on slabs, PT varies by state wildly. Setting flat mapping for demo)
            let pt = 0
            if (sal.isPtEligible) {
                if (computedGross >= 15000) pt = 200
            }
            let lwf = sal.lwfState ? 25 : 0 // Flat 25 deduction if LWF state appended
            
            // TDS mapping (Manual for now, but we can hook in a field on EmployeeSalary)
            let tds = 0

            // Advances Deductions
            let otherDeds = 0
            emp.advances.forEach(adv => {
                otherDeds += adv.amount
            })

            const totalDeds = empPf + empEsi + pt + lwf + tds + otherDeds
            const netPay = computedGross - totalDeds

            // Roll up totals for batch
            batchTotalGross += computedGross
            batchTotalNet += netPay
            batchTotalPfE += emporPf
            batchTotalEsiE += emporEsi
            batchTotalLwf += lwf
            batchTotalTds += tds

            // 4. Save to Payroll model
            return prisma.payroll.upsert({
                where: { employeeId_month_year: { employeeId: emp.id, month, year } },
                create: {
                    employeeId: emp.id,
                    payrollRunId: existingRun.id,
                    month,
                    year,
                    basicSalary: basicPr_rate,
                    hra: hraPr_rate,
                    allowances: allowPr_rate,
                    overtimePay: otPay,
                    grossSalary: computedGross,
                    pfEmployee: empPf,
                    pfEmployer: emporPf,
                    esiEmployee: empEsi,
                    esiEmployer: emporEsi,
                    pt,
                    lwf,
                    tds,
                    otherDeductions: otherDeds,
                    totalDeductions: totalDeds,
                    netSalary: netPay,
                    workingDays,
                    presentDays,
                    leaveDays,
                    lwpDays: workingDays - payableDays,
                    overtimeHrs: otHrs,
                    overtimeRate: otHourlyRate,
                    bonus: sal.bonus || 0,
                    siteId: emp.branchId, // Tagging with branchId as default site for now
                    status: "DRAFT"
                },
                update: {
                    payrollRunId: existingRun.id,
                    basicSalary: basicPr_rate,
                    hra: hraPr_rate,
                    allowances: allowPr_rate,
                    overtimePay: otPay,
                    grossSalary: computedGross,
                    pfEmployee: empPf,
                    pfEmployer: emporPf,
                    esiEmployee: empEsi,
                    esiEmployer: emporEsi,
                    pt,
                    lwf,
                    tds,
                    otherDeductions: otherDeds,
                    totalDeductions: totalDeds,
                    netSalary: netPay,
                    workingDays,
                    presentDays,
                    leaveDays,
                    lwpDays: workingDays - payableDays,
                    overtimeHrs: otHrs,
                    overtimeRate: otHourlyRate,
                    bonus: sal.bonus || 0,
                    siteId: emp.branchId,
                }
            })
        })

        const results = await Promise.all(upsertPromises)
        const processedCount = results.filter(r => r !== null).length

        // Update Run Totals
        await prisma.payrollRun.update({
            where: { id: existingRun.id },
            data: {
                totalGross: batchTotalGross,
                totalNet: batchTotalNet,
                totalPfEmployer: batchTotalPfE,
                totalEsiEmployer: batchTotalEsiE,
                totalLwf: batchTotalLwf,
                totalTds: batchTotalTds
            }
        })

        // Also mark Advances as DEDUCTED
        const advanceIdsToUpdate = employees.flatMap(e => e.advances.map(a => a.id))
        if (advanceIdsToUpdate.length > 0) {
            await prisma.advanceAndReimbursement.updateMany({
                where: { id: { in: advanceIdsToUpdate } },
                data: { status: "DEDUCTED" }
            })
        }

        return NextResponse.json({ success: true, processedCount, runId: existingRun.id })

    } catch (error) {
        console.error("[PAYROLL_CALCULATE_ERROR]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
