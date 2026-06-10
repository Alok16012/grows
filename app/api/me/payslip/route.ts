import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"

export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const emp = await prisma.employee.findFirst({
        where: { userId: session.user.id },
        select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true }
    })
    if (!emp) return NextResponse.json([])

    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get("limit") ?? "12")

    const payslips = await prisma.payroll.findMany({
        where: { employeeId: emp.id, status: { not: "DRAFT" } },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: limit,
        select: {
            id: true, month: true, year: true, status: true,
            basicSalary: true, da: true, hra: true, washing: true,
            bonus: true, overtimePay: true, grossSalary: true,
            pfEmployee: true, esiEmployee: true, pt: true,
            canteen: true, penalty: true, advance: true,
            otherDeductions: true, totalDeductions: true,
            netSalary: true, workingDays: true, presentDays: true,
            otDays: true, pfEmployer: true, esiEmployer: true, ctc: true,
            grossFullMonth: true, paidAt: true,
        }
    })

    return NextResponse.json({ employee: emp, payslips })
}
