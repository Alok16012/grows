import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { getRelease, isVisible } from "@/lib/payslip-release"

export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    // The employee's master details that the official salary slip prints
    // (lib/payslip-html) — the same slip HR sees in Payroll → Salary slips.
    const emp = await prisma.employee.findFirst({
        where: { userId: session.user.id },
        select: {
            id: true, firstName: true, lastName: true, employeeId: true, designation: true,
            uan: true, pfNumber: true, esiNumber: true, dateOfBirth: true, dateOfJoining: true,
            deployments: { where: { isActive: true }, select: { site: { select: { name: true } } }, take: 1 },
        },
    })
    if (!emp) return NextResponse.json([])

    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get("limit") ?? "12")

    // Only payslips HR has sent for the employee's site (Payroll → Salary slips → Send).
    const release = await getRelease()
    const all = await prisma.payroll.findMany({
        where: { employeeId: emp.id, status: { not: "DRAFT" } },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: Math.min(60, limit + 6),
        select: {
            id: true, month: true, year: true, status: true, siteId: true,
            basicSalary: true, da: true, hra: true, washing: true, conveyance: true, lwwEarned: true,
            bonus: true, overtimePay: true, overtimeHrs: true, allowances: true, productionIncentive: true,
            grossSalary: true,
            pfEmployee: true, esiEmployee: true, pt: true, lwf: true, tds: true,
            canteen: true, penalty: true, advance: true,
            otherDeductions: true, totalDeductions: true,
            netSalary: true, workingDays: true, presentDays: true,
            otDays: true, pfEmployer: true, esiEmployer: true, ctc: true,
            grossFullMonth: true, paidAt: true, arrears: true, reimbursement: true,
        }
    })

    // The site each month was paid at, for the slip's SITE line.
    const siteIds = Array.from(new Set(all.map(p => p.siteId).filter(Boolean) as string[]))
    const siteName = new Map((siteIds.length ? await prisma.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } }) : []).map(s => [s.id, s.name]))

    const payslips = all
        .filter(p => isVisible({ ...p, status: String(p.status), employeeId: emp.id }, release))
        .slice(0, limit)
        .map(({ siteId, ...p }) => ({ ...p, siteName: siteId ? siteName.get(siteId) ?? null : null }))
    const { id: _id, ...employee } = emp
    return NextResponse.json({ employee, payslips })
}
