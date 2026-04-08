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

        const where: any = { month, year, status: "PROCESSED" } // Only processed/approved for banking
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
            return new NextResponse("No processed payroll data found for bank transfer.", { status: 404 })
        }

        const data = payrolls.map(p => ({
            "Beneficiary Name": `${p.employee.firstName} ${p.employee.lastName}`,
            "Bank Name": p.employee.bankName || "N/A",
            "Account Number": p.employee.bankAccountNumber || "N/A",
            "IFSC Code": p.employee.bankIFSC || "N/A",
            "Amount": p.netSalary,
            "Narration": `Salary ${month}/${year}`
        }))

        return NextResponse.json(data)

    } catch (error) {
        console.error("[REPORT_BANK_SHEET_ERROR]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
