import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { commNotify, employeeRecipients, userRecipients, fmtRange, fmtInr } from "@/lib/comm/recipients"

// POST /api/payroll/final/paid  { month, year, siteIds? }
// Marks every LOCKED (PROCESSED) row for the month as PAID in one go. Before
// this the only way was one row at a time from the payslip drawer, so a month
// with hundreds of employees never actually reached PAID and the hub's last
// step could never finish. DRAFT rows are left alone: unlocked pay is not paid.
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, [], "payroll.markPaid")) {
            return new NextResponse("Forbidden — missing payroll.markPaid", { status: 403 })
        }

        const { month, year, siteIds } = await req.json()
        if (!month || !year) return new NextResponse("Month and Year required", { status: 400 })

        // Who is about to be paid, for the "salary credited" message.
        const toPay = await prisma.payroll.findMany({
            where: { month, year, status: "PROCESSED", ...(siteIds?.length ? { siteId: { in: siteIds as string[] } } : {}) },
            select: { id: true, employeeId: true, netSalary: true },
        })

        const { paid, stillDraft, runPaid } = await prisma.$transaction(async tx => {
            const paid = await tx.payroll.updateMany({
                where: {
                    month, year,
                    status: "PROCESSED",
                    ...(siteIds?.length ? { siteId: { in: siteIds as string[] } } : {}),
                },
                data: { status: "PAID", paidAt: new Date(), paidBy: session.user.id ?? "system" },
            })

            // The run is PAID only once nothing for the month is still owed.
            const [stillDraft, stillLocked] = await Promise.all([
                tx.payroll.count({ where: { month, year, status: "DRAFT" } }),
                tx.payroll.count({ where: { month, year, status: "PROCESSED" } }),
            ])
            const runPaid = stillDraft === 0 && stillLocked === 0
            if (runPaid) {
                await tx.payrollRun.updateMany({ where: { month, year }, data: { status: "PAID" } })
            }
            return { paid, stillDraft, runPaid }
        })

        const monthLabel = new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })
        const commQueued = await commNotify("salary_credited",
            employeeRecipients(toPay.map(p => p.employeeId), new Map(toPay.map(p => [p.employeeId, { amount: fmtInr(p.netSalary) }]))),
            { month: monthLabel }, { refType: "PayrollMonth", refId: `${year}-${String(month).padStart(2, "0")}`, createdBy: session.user.id, budgetMs: 2000, link: "/profile?tab=payslips" })

        return NextResponse.json({ success: true, paid: paid.count, stillDraft, runPaid, commQueued })
    } catch (error) {
        console.error("[PAYROLL_FINAL_PAID]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
