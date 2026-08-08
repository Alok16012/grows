
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkAccess, INSPECTION_PERMISSIONS, PROJECT_MANAGER_PERMISSIONS } from "@/lib/permissions"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)

    if (!checkAccess(session, ["MANAGER"], "employees.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const role = searchParams.get("role")
    const ids = searchParams.get("ids")
    const siteId = searchParams.get("siteId")

    try {
        // Get users by IDs
        if (ids) {
            const userIds = ids.split(",")
            const users = await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, email: true }
            })
            return NextResponse.json(users)
        }

        // `?role=` is the caller's filter name, not a base-role lookup: who counts
        // as an inspector / a manager is decided by the custom-role permissions.
        // Assigning a custom role sets the system role to MANAGER, so INSPECTION_BOY
        // never matched a real inspector, and Role.MANAGER matched every staff user
        // regardless of what they do.
        const permissionsFor = (r: string | null) =>
            r === "INSPECTION_BOY" ? INSPECTION_PERMISSIONS
                : r === "MANAGER" ? PROJECT_MANAGER_PERMISSIONS
                    : null

        const permissions = permissionsFor(role)
        if (!permissions) {
            return NextResponse.json({ error: "Invalid role filter" }, { status: 400 })
        }

        const where: any = {
            // Only real staff — users with a linked Employee record.
            employeeProfile: { isNot: null },
            customRole: { isActive: true, permissions: { hasSome: permissions } },
        }

        // Narrow to one site's team when asked. Membership is a union on purpose:
        // SiteAssignment is the explicit, multi-site link, but it starts empty, so
        // on its own it would show nobody until every site had been curated by hand.
        // An active HR deployment and existing project membership are both already
        // populated and both genuinely mean "this person works at this site".
        if (siteId) {
            where.OR = [
                { siteMemberships: { some: { siteId, status: "active" } } },
                { employeeProfile: { deployments: { some: { siteId, isActive: true } } } },
                { assignmentsAsInspector: { some: { project: { siteId } } } },
                { managedProjects: { some: { project: { siteId } } } },
            ]
        }

        const users = await prisma.user.findMany({
            where,
            select: { id: true, name: true, email: true, phone: true },
            orderBy: { name: "asc" },
        })
        return NextResponse.json(users)
    } catch (error) {
        console.error("GET_USERS_ERROR", error)
        return NextResponse.json({
            error: "Database Connection Error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
