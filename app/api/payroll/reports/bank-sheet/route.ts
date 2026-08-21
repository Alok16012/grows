import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { csvSafe } from "@/lib/csv-safe"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.view")) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const month = parseInt(searchParams.get("month") || "")
        const year = parseInt(searchParams.get("year") || "")
        const siteId = searchParams.get("siteId")

        if (!month || !year) {
            return new NextResponse("Month and Year required", { status: 400 })
        }

        // Only PROCESSED and PAID payrolls are eligible for bank transfer
        const where: any = { month, year, status: { in: ["PROCESSED", "PAID"] } }
        // Payroll rows carry the site they were processed under — filtering by
        // employee.branchId compared a Site id against Branch ids and matched nothing.
        if (siteId) where.siteId = siteId

        const payrolls = await prisma.payroll.findMany({
            where,
            include: {
                employee: {
                    select: {
                        firstName: true,
                        lastName: true,
                        bankName: true,
                        bankAccountNumber: true,
                        bankIFSC: true
                    }
                }
            },
            orderBy: { employee: { firstName: "asc" } }
        })

        if (payrolls.length === 0) {
            return new NextResponse("No payroll data found for this period. Please calculate payroll first.", { status: 404 })
        }

        const data = payrolls.map(p => ({
            "Beneficiary Name": csvSafe(`${p.employee.firstName} ${p.employee.lastName}`),
            "Bank Name": csvSafe(p.employee.bankName || "N/A"),
            "Account Number": csvSafe(p.employee.bankAccountNumber || "N/A"),
            "IFSC Code": csvSafe(p.employee.bankIFSC || "N/A"),
            "Amount": p.netSalary,
            "Narration": `Salary ${month}/${year}`
        }))

        return NextResponse.json(data)

    } catch (error) {
        console.error("[REPORT_BANK_SHEET_ERROR]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
