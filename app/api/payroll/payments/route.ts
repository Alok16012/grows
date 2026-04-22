import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status") || "progress"
        const search = searchParams.get("search") || ""

        // For now, mapping these to PayrollRun records or distinct Payroll batches
        // Real implementation: Filter PayrollRun by status
        // status mappings: 
        // progress -> DRAFT/PROCESSED but not locked
        // fla -> LOCKED/SUBMITTED to FLA
        // tla -> LOCKED/SUBMITTED to TLA
        // bank -> PAID / SENT TO BANK

        const payrolls = await prisma.payroll.findMany({
            where: {
                OR: [
                    { employee: { firstName: { contains: search, mode: "insensitive" } } },
                    { employee: { lastName: { contains: search, mode: "insensitive" } } },
                    { employee: { employeeId: { contains: search, mode: "insensitive" } } },
                ]
            },
            include: {
                employee: true,
                payrollRun: true
            },
            take: 50,
            orderBy: { createdAt: "desc" }
        })

        // Format to match UI
        const data = payrolls.map(p => ({
            id: p.id,
            account: p.employee.bankAccountNumber || "N/A",
            name: `${p.employee.firstName} ${p.employee.lastName}`,
            txn: 1,
            amount: p.netSalary,
            status: p.status, // DRAFT, PROCESSED, PAID
            file: p.remarks || "--",
            date: p.createdAt.toLocaleString()
        }))

        return NextResponse.json({ data })
    } catch (error) {
        console.error("[PAYROLL_PAYMENTS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
