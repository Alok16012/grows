import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess, INSPECTION_PERMISSIONS, PROJECT_MANAGER_PERMISSIONS } from "@/lib/permissions"
import { resolveUserId } from "@/lib/resolveUserId"

// The site team: which staff work at this site. Membership is many-to-many, so one
// inspector can cover several sites at once — the HR Deployment record cannot say
// that (an employee is posted to exactly one site until relieved), which is why
// project pickers read this table rather than deployments alone.
//
// Nothing here records "inspector" vs "manager". That is read off each member's
// custom-role permissions at render time, so a person holding both appears under
// both headings and there is no second thing to keep in sync.

type Member = {
    id: string
    userId: string
    name: string
    email: string
    phone: string | null
    isInspector: boolean
    isManager: boolean
}

function classify(permissions: string[] | undefined) {
    const held = permissions ?? []
    return {
        isInspector: INSPECTION_PERMISSIONS.some((p) => held.includes(p)),
        isManager: PROJECT_MANAGER_PERMISSIONS.some((p) => held.includes(p)),
    }
}

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!checkAccess(session, [], "sites.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const rows = await prisma.siteAssignment.findMany({
            where: { siteId: params.id, status: "active" },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        customRole: { select: { permissions: true, isActive: true } },
                    },
                },
            },
            orderBy: { createdAt: "asc" },
        })

        const members: Member[] = rows.map((r) => {
            const active = r.user.customRole?.isActive ? r.user.customRole.permissions : []
            return {
                id: r.id,
                userId: r.user.id,
                name: r.user.name,
                email: r.user.email,
                phone: r.user.phone,
                ...classify(active),
            }
        })

        return NextResponse.json(members)
    } catch (error) {
        console.error("[SITE_TEAM_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!checkAccess(session, [], "sites.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const actorId = await resolveUserId(session!)
        if (!actorId) return new NextResponse("Could not resolve the acting user", { status: 400 })

        const { userIds } = await req.json()
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return new NextResponse("userIds is required", { status: 400 })
        }

        const site = await prisma.site.findUnique({ where: { id: params.id }, select: { id: true } })
        if (!site) return new NextResponse("Site not found", { status: 404 })

        // Only staff who could actually be picked on a project are worth adding —
        // otherwise the team fills up with people no picker will ever show.
        const eligible = await prisma.user.findMany({
            where: {
                id: { in: userIds },
                customRole: {
                    isActive: true,
                    permissions: { hasSome: [...INSPECTION_PERMISSIONS, ...PROJECT_MANAGER_PERMISSIONS] },
                },
            },
            select: { id: true },
        })
        if (eligible.length === 0) {
            return new NextResponse(
                "None of the selected people hold inspection or approval permissions",
                { status: 400 }
            )
        }

        // A previously removed member is reactivated rather than duplicated — the
        // (siteId, userId) pair is unique, so a plain create would fail on re-add.
        await prisma.$transaction(
            eligible.map((u) =>
                prisma.siteAssignment.upsert({
                    where: { siteId_userId: { siteId: params.id, userId: u.id } },
                    create: { siteId: params.id, userId: u.id, assignedBy: actorId, status: "active" },
                    update: { status: "active" },
                })
            )
        )

        return NextResponse.json({ added: eligible.length })
    } catch (error) {
        console.error("[SITE_TEAM_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!checkAccess(session, [], "sites.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const userId = searchParams.get("userId")
        if (!userId) return new NextResponse("userId is required", { status: 400 })

        // Deleted, not deactivated: this row only decides who the pickers offer. The
        // person's existing project assignments and submitted inspections are
        // untouched, so removing them here never destroys inspection history.
        await prisma.siteAssignment.deleteMany({ where: { siteId: params.id, userId } })

        return NextResponse.json({ removed: true })
    } catch (error) {
        console.error("[SITE_TEAM_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
