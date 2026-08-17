
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"
import { inspectionScopeForApprover } from "@/lib/approval-scope"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER"], "assignments.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status")
        const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")))
        const skip = (page - 1) * limit

        // Only the projects this approver manages. Without it, holding an
        // approvals permission showed the whole company's pending queue.
        const scope = await inspectionScopeForApprover(session)

        const where: any = { ...(scope ?? {}) }
        if (status && status !== "all") {
            where.status = status
        }

        const withCounts = searchParams.get("withCounts") === "true"

        const queries: Promise<any>[] = [
            prisma.inspection.findMany({
                where,
                select: {
                    id: true,
                    status: true,
                    createdAt: true,
                    submittedAt: true,
                    approvedAt: true,
                    submitter: { select: { name: true } },
                    assignment: {
                        select: {
                            project: {
                                select: {
                                    id: true,
                                    name: true,
                                    // The queue renders and searches on project.site.name.
                                    // This selected the legacy `company` relation instead,
                                    // which no longer gets written — so every row showed a
                                    // blank site and the site search never matched.
                                    site: { select: { id: true, name: true } }
                                }
                            }
                        }
                    }
                },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit
            }),
            prisma.inspection.count({ where })
        ]

        if (withCounts) {
            queries.push(
                prisma.inspection.count({ where: { ...(scope ?? {}), status: "pending" } }),
                prisma.inspection.count({ where: { ...(scope ?? {}), status: "approved" } }),
                prisma.inspection.count({ where: { ...(scope ?? {}), status: "rejected" } }),
                prisma.inspection.count({ where: { ...(scope ?? {}) } })
            )
        }

        const results = await Promise.all(queries)
        const [inspections, total] = results

        const response: any = { inspections, total, page, limit }
        if (withCounts) {
            response.counts = {
                pending: results[2],
                approved: results[3],
                rejected: results[4],
                all: results[5]
            }
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error("GET_ALL_INSPECTIONS_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
