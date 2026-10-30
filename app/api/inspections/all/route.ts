
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"
import { inspectionScopeForApprover } from "@/lib/approval-scope"
import { withApproverNames, istDayStart, istDayEnd, searchDate } from "@/lib/inspection-approver"

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

        // Optional Submitted-date range (IST days, either end may be open). It
        // also narrows the tab counts, so they describe the dates on screen.
        const from = istDayStart(searchParams.get("from"))
        const to = istDayEnd(searchParams.get("to"))
        const dateWhere: any = from || to
            ? { submittedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
            : {}

        const where: any = { ...(scope ?? {}), ...dateWhere }
        if (status && status !== "all") {
            where.status = status
        }
        // Server-side search, so it covers every page and not just the rows on
        // screen: inspector, project or site name — or, when the box holds a
        // date (30/10/2026), the inspections submitted that day (IST).
        const q = (searchParams.get("q") ?? "").trim().slice(0, 100)
        const qDate = q ? searchDate(q) : null
        if (qDate) {
            where.AND = [{ submittedAt: { gte: istDayStart(qDate), lte: istDayEnd(qDate) } }]
        } else if (q) {
            where.OR = [
                { submitter: { name: { contains: q, mode: "insensitive" } } },
                { assignment: { project: { name: { contains: q, mode: "insensitive" } } } },
                { assignment: { project: { site: { name: { contains: q, mode: "insensitive" } } } } },
            ]
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
                    approvedBy: true,
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
                // Newest submission first (the date the queue shows); drafts,
                // which have no submittedAt, go last. Was createdAt — the time
                // the form was started — so the Submitted column looked shuffled.
                orderBy: [{ submittedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
                skip,
                take: limit
            }),
            prisma.inspection.count({ where })
        ]

        if (withCounts) {
            queries.push(
                prisma.inspection.count({ where: { ...(scope ?? {}), ...dateWhere, status: "pending" } }),
                prisma.inspection.count({ where: { ...(scope ?? {}), ...dateWhere, status: "approved" } }),
                prisma.inspection.count({ where: { ...(scope ?? {}), ...dateWhere, status: "rejected" } }),
                prisma.inspection.count({ where: { ...(scope ?? {}), ...dateWhere } })
            )
        }

        const results = await Promise.all(queries)
        const [inspections, total] = results

        const response: any = { inspections: await withApproverNames(inspections), total, page, limit }
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
