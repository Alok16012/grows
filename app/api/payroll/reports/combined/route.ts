import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const month = parseInt(searchParams.get("month") || "")
        const year = parseInt(searchParams.get("year") || "")
        const siteId = searchParams.get("siteId")

        if (!month || !year) {
            return new NextResponse("Month and Year required", { status: 400 })
        }

        const where: any = { month, year }
        if (siteId) where.siteId = siteId

        const payrolls = await prisma.payroll.findMany({
            where,
            include: {
                employee: {
                    select: {
                        employeeId: true,
                        firstName: true,
                        lastName: true,
                        designation: true,
                        branch: { select: { name: true } }
                    }
                }
            },
            orderBy: { employee: { firstName: "asc" } }
        })

        if (payrolls.length === 0) {
            return new NextResponse("No payroll data found for this period.", { status: 404 })
        }

        // Generate combined sheet JSON (easy to convert to CSV/Excel on frontend)
        const data = payrolls.map(p => ({
            "Emp ID": p.employee.employeeId,
            "Name": `${p.employee.firstName} ${p.employee.lastName}`,
            "Designation": p.employee.designation,
            "Branch": p.employee.branch?.name,
            "Working Days": p.workingDays,
            "Present Days": p.presentDays,
            "Basic Salary": p.basicSalary,
            "HRA": p.hra,
            "Allowances": p.allowances,
            "OT Pay": p.overtimePay,
            "Bonus": p.bonus,
            "Gross Salary": p.grossSalary,
            "PF (Employee)": p.pfEmployee,
            "PF (Employer)": p.pfEmployer,
            "ESI (Employee)": p.esiEmployee,
            "ESI (Employer)": p.esiEmployer,
            "PT": p.pt,
            "LWF": p.lwf,
            "TDS": p.tds,
            "Other Deductions": p.otherDeductions,
            "Total Deductions": p.totalDeductions,
            "Net Salary": p.netSalary,
            "Status": p.status
        }))

        return NextResponse.json(data)

    } catch (error) {
        console.error("[REPORT_COMBINED_ERROR]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
