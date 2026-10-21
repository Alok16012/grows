import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess } from "@/lib/permissions"
import { checkLeaveRequest } from "@/lib/leave-policy-server"
import { notifyApprovers, notifyEmployee } from "@/lib/hr-notify"

export async function GET(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        // Self-service: anyone WITHOUT the management permission falls back to
        // their own leaves only (scoped to their linked employee record). This
        // is role-independent — every employee sees their own data.
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "leaves.view")) {
            const linkedEmployee = await prisma.employee.findUnique({ where: { userId: session.user.id } })
            if (!linkedEmployee) return NextResponse.json([])
            const { searchParams } = new URL(req.url)
            const monthParam = searchParams.get("month")
            const where: Record<string, unknown> = { employeeId: linkedEmployee.id }
            if (monthParam?.includes("-")) {
                const [yr, mo] = monthParam.split("-").map(Number)
                // Any leave touching the month, not just ones starting in it — a
                // leave from 28 Jan to 3 Feb belongs on February's calendar too.
                where.startDate = { lt: new Date(Date.UTC(yr, mo, 1)) }
                where.endDate = { gte: new Date(Date.UTC(yr, mo - 1, 1)) }
            }
            const leaves = await prisma.leave.findMany({
                where,
                include: { employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, photo: true } } },
                orderBy: { createdAt: "desc" },
            })
            return NextResponse.json(leaves)
        }

        const { searchParams } = new URL(req.url)
        const employeeId = searchParams.get("employeeId")
        const status = searchParams.get("status")
        const monthParam = searchParams.get("month") // YYYY-MM
        const search = searchParams.get("search")
        const leaveType = searchParams.get("type")

        const where: Record<string, unknown> = {}
        if (employeeId) where.employeeId = employeeId
        if (status) where.status = status
        if (leaveType) where.type = leaveType

        if (monthParam && monthParam.includes("-")) {
            const [yr, mo] = monthParam.split("-").map(Number)
            where.startDate = { lt: new Date(Date.UTC(yr, mo, 1)) }
            where.endDate = { gte: new Date(Date.UTC(yr, mo - 1, 1)) }
        }

        if (search) {
            where.employee = {
                OR: [
                    { firstName: { contains: search, mode: "insensitive" } },
                    { lastName: { contains: search, mode: "insensitive" } },
                    { employeeId: { contains: search, mode: "insensitive" } },
                ],
            }
        }

        // Sidebar badge: just the number (e.g. ?status=PENDING&count=true), same filters.
        if (searchParams.get("count") === "true") {
            return NextResponse.json({ count: await prisma.leave.count({ where }) })
        }

        const leaves = await prisma.leave.findMany({
            where,
            include: {
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                        photo: true,
                        branch: { select: { name: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        })

        return NextResponse.json(leaves)
    } catch (error) {
        console.error("[LEAVES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const body = await req.json()
        const { type, startDate, endDate, reason, halfDay, override } = body
        if (!type || !startDate || !endDate) {
            return new NextResponse("type, startDate and endDate are required", { status: 400 })
        }

        // Self-service: anyone WITHOUT leaves.manage can apply only for their own
        // linked employee. Creating leave for an arbitrary employeeId requires
        // leaves.manage — a read-only leaves.view role falls through to here.
        const isManager = checkAccess(session, ["MANAGER", "HR_MANAGER"], "leaves.manage")
        let employeeId: string
        if (isManager) {
            if (!body.employeeId) return new NextResponse("employeeId is required", { status: 400 })
            employeeId = body.employeeId
        } else {
            const linkedEmployee = await prisma.employee.findUnique({ where: { userId: session.user.id } })
            if (!linkedEmployee) return new NextResponse("No employee record linked", { status: 400 })
            // Refuse rather than silently redirecting the row: a request naming
            // someone else must fail loudly instead of filing it under the caller.
            if (body.employeeId && body.employeeId !== linkedEmployee.id) {
                return new NextResponse("You can only apply leave for yourself", { status: 403 })
            }
            employeeId = linkedEmployee.id
        }

        // Days are always worked out here — weekly offs and holidays inside the
        // range are not charged — so a client-sent `days` is ignored.
        const check = await checkLeaveRequest({
            employeeId, type, startDate, endDate, halfDay: !!halfDay, isManager,
        })
        if (!check.ok) return new NextResponse(check.error, { status: check.status })
        // HR may go past a rule (short notice, negative balance) but has to say so.
        if (check.warnings.length && !override) {
            return NextResponse.json({ needsConfirm: true, warnings: check.warnings }, { status: 409 })
        }

        const leave = await prisma.leave.create({
            data: {
                employeeId,
                type: check.type,
                startDate: check.start,
                endDate: check.end,
                days: check.breakdown.days,
                reason: reason || null,
                status: "PENDING",
            },
            include: { employee: { select: { firstName: true, lastName: true } } },
        })

        const who = `${leave.employee.firstName} ${leave.employee.lastName}`.trim()
        const span = `${check.breakdown.days} day${check.breakdown.days === 1 ? "" : "s"} from ${startDate.slice(0, 10)}`
        await notifyApprovers(["leaves.approve", "leaves.manage"], {
            title: "Leave request", message: `${who} applied for ${check.type} — ${span}`, type: "leave", link: `/leaves?id=${leave.id}`,
        }, session.user.id)
        if (isManager) {
            await notifyEmployee(employeeId, {
                title: "Leave recorded", message: `HR recorded ${check.type} for you — ${span}, awaiting approval`, type: "leave", link: `/leaves?id=${leave.id}`,
            })
        }

        return NextResponse.json(leave)
    } catch (error) {
        console.error("[LEAVES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
