import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { unstable_cache } from "next/cache"

// Sidebar polls this count every 5 minutes. Cache for 60s so concurrent
// badge fetches don't hammer the DB.
const getPendingCount = unstable_cache(
    async () => prisma.inspection.count({ where: { status: "pending" } }),
    ["approvals-count"],
    { revalidate: 60, tags: ["approvals"] },
)

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(req.url)
        const countOnly = searchParams.get("count") === "true"

        if (countOnly) {
            const count = await getPendingCount()
            return NextResponse.json({ count }, {
                headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
            })
        }

        const pendingInspections = await prisma.inspection.findMany({
            where: { status: "pending" },
            include: {
                submitter: {
                    select: { name: true }
                },
                assignment: {
                    include: {
                        project: {
                            include: {
                                company: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                submittedAt: "desc"
            }
        })

        return NextResponse.json(pendingInspections)
    } catch (error) {
        console.error("GET_APPROVALS_ERROR", error)
        return NextResponse.json({
            error: "Database Connection Error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
