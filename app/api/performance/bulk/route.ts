import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { applyTemplate } from "@/lib/performance-server"
import { templateRoleFor } from "@/lib/performance-score"

const CYCLES = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"]

// POST — start a review cycle for many employees at once.
// { cycle, periodStart, periodEnd, departmentId?, designation?, employeeIds?, template: "auto" | "<role>" | "none", dryRun? }
// Anyone who already has a review for the same period start is skipped.
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "performance.manage")) return new NextResponse("Forbidden", { status: 403 })
    try {
        const b = await req.json()
        if (!CYCLES.includes(b.cycle)) return new NextResponse("Choose a review cycle", { status: 400 })
        const start = new Date(b.periodStart), end = new Date(b.periodEnd)
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return new NextResponse("Choose a valid review period", { status: 400 })

        const where: Record<string, unknown> = { status: { in: ["ACTIVE", "ON_LEAVE"] } }
        if (Array.isArray(b.employeeIds) && b.employeeIds.length) where.id = { in: b.employeeIds }
        if (b.departmentId) where.departmentId = b.departmentId
        if (b.designation) where.designation = { contains: String(b.designation), mode: "insensitive" }
        const employees = await prisma.employee.findMany({
            where,
            select: { id: true, designation: true, user: { select: { role: true } }, reviews: { where: { periodStart: start }, select: { id: true } } },
        })
        const fresh = employees.filter(e => e.reviews.length === 0)
        const roles = (await prisma.kPITemplate.findMany({ distinct: ["role"], select: { role: true } })).map(r => r.role)
        const roleOf = (e: (typeof fresh)[number]) =>
            b.template === "none" ? null : b.template && b.template !== "auto" ? b.template : templateRoleFor(e.designation, e.user?.role, roles)

        const preview = { matched: employees.length, toCreate: fresh.length, skipped: employees.length - fresh.length, withTemplate: fresh.filter(roleOf).length }
        if (b.dryRun) return NextResponse.json(preview)
        if (fresh.length > 1000) return new NextResponse("More than 1,000 reviews at once — narrow it down by department or designation", { status: 400 })

        let created = 0, templated = 0
        for (const e of fresh) {
            const review = await prisma.performanceReview.create({
                data: { employeeId: e.id, reviewerId: session!.user.id, cycle: b.cycle, periodStart: start, periodEnd: end, status: "DRAFT" },
                select: { id: true },
            })
            created++
            const role = roleOf(e)
            if (role && await applyTemplate(review.id, role)) templated++
        }
        return NextResponse.json({ ...preview, created, templated })
    } catch (error) {
        console.error("[PERFORMANCE_BULK]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
