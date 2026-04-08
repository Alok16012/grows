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
        const { payrollRunId, clientId, branchId } = body

        if (!payrollRunId) return new NextResponse("payrollRunId is required", { status: 400 })

        // 1. Fetch the locked Payroll Run records matching the client/branch
        const payrollDetails = await prisma.payroll.findMany({
            where: {
                payrollRunId: payrollRunId,
                ...(branchId ? { employee: { branchId } } : {})
                // If clientId mapped to branch via company, filter here.
            },
            include: {
                employee: {
                    include: { employeeSalary: true, branch: { include: { company: true } } }
                }
            }
        })

        if (payrollDetails.length === 0) {
            return new NextResponse("No payroll data found for invoicing in this run.", { status: 404 })
        }

        let totalSalaryCost = 0
        let totalPfEmployerCost = 0
        let totalEsiEmployerCost = 0
        let totalLwfCost = 0
        let totalMarginValue = 0

        // 2. Compute Manpower Formula per employee: Client Billing = Salary (Gross) + Statutory (Employer Parts) + Margin
        const lineItems = payrollDetails.map(pay => {
            const marginPercent = pay.employee.employeeSalary?.serviceChargeRate || 0
            
            const employeeCostBeforeMargin = pay.grossSalary + pay.pfEmployer + pay.esiEmployer + pay.lwf
            const computedMargin = employeeCostBeforeMargin * (marginPercent / 100)
            const finalClientBillingShare = employeeCostBeforeMargin + computedMargin

            totalSalaryCost += pay.grossSalary
            totalPfEmployerCost += pay.pfEmployer
            totalEsiEmployerCost += pay.esiEmployer
            totalLwfCost += pay.lwf
            totalMarginValue += computedMargin

            return {
                employeeId: pay.employeeId,
                name: `${pay.employee.firstName} ${pay.employee.lastName}`,
                gross: pay.grossSalary,
                statutoryCost: pay.pfEmployer + pay.esiEmployer + pay.lwf,
                marginAmt: computedMargin,
                billedAmount: finalClientBillingShare
            }
        })

        const totalCompanyCost = totalSalaryCost + totalPfEmployerCost + totalEsiEmployerCost + totalLwfCost
        const grandTotalBilled = totalCompanyCost + totalMarginValue

        // 3. (Optional) Create actual Invoice Model record here if your schema has an invoice hook
        // For now, we return the structured JSON so the UI can construct exactly what lines the PDF / UI table needs.

        return NextResponse.json({
            success: true,
            billingSummary: {
                headcount: payrollDetails.length,
                totalGrossSalaries: totalSalaryCost,
                totalEmployerStatutory: totalPfEmployerCost + totalEsiEmployerCost + totalLwfCost,
                totalCTC_Cost: totalCompanyCost,
                totalServiceCharge: totalMarginValue,
                grandTotalInvoiceAmount: grandTotalBilled
            },
            employeeBreakdown: lineItems
        })

    } catch (error) {
        console.error("[BILLING_GENERATE_ERROR]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
