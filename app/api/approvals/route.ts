import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"
import { withApproverNames } from "@/lib/inspection-approver"
import { inspectionScopeForApprover } from "@/lib/approval-scope"
import { unstable_cache } from "next/cache"
import { dayWindow, istDateOnly } from "@/lib/attendance-policy"

// Sidebar polls this count every 5 minutes. Cache for 60s so concurrent
// badge fetches don't hammer the DB. Keyed per caller: the queue is scoped to
// the projects they manage, so one shared number would leak (and mis-count)
// other managers' pending work.
const getPendingCount = unstable_cache(
    async (userId: string, scope: Awaited<ReturnType<typeof inspectionScopeForApprover>>) =>
        prisma.inspection.count({ where: { status: "pending", ...(scope ?? {}) } }),
    ["approvals-count"],
    { revalidate: 60, tags: ["approvals"] },
)

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER"], "approvals.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(req.url)
        const countOnly = searchParams.get("count") === "true"

        // Restrict to the caller's managed projects (null = ADMIN, sees all).
        // The detail/PATCH routes already enforce this; the list and badge
        // didn't, so approvers were shown — and counted — everyone's queue.
        const scope = await inspectionScopeForApprover(session)

        if (countOnly) {
            const count = await getPendingCount(session!.user.id, scope)
            return NextResponse.json({ count }, {
                headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
            })
        }

        // ?date=today = everything submitted in today's IST day, whatever its
        // outcome, so the dashboard's "inspections today" figure lands on the
        // same rows. A status narrows it; without one the queue stays pending-only.
        const todayOnly = searchParams.get("date") === "today"
        const statusParam = searchParams.get("status")
        const statusWhere = statusParam && statusParam !== "all"
            ? { status: statusParam }
            : todayOnly ? { status: { not: "draft" } } : { status: "pending" }
        const dateWhere = todayOnly ? { submittedAt: dayWindow(istDateOnly()) } : {}

        const pendingInspections = await prisma.inspection.findMany({
            where: { ...statusWhere, ...dateWhere, ...(scope ?? {}) },
            include: {
                submitter: {
                    select: { name: true }
                },
                assignment: {
                    include: {
                        project: {
                            include: {
                                site: { select: { id: true, name: true } }
                            }
                        }
                    }
                }
            },
            orderBy: {
                submittedAt: "desc"
            }
        })

        return NextResponse.json(await withApproverNames(pendingInspections))
    } catch (error) {
        console.error("GET_APPROVALS_ERROR", error)
        return NextResponse.json({
            error: "Database Connection Error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
