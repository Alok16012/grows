import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { recordSiteChange, actorOf } from "@/lib/site-history"

// A posting that is gone (wrong link, or someone else removed it meanwhile)
// used to surface as "Internal Error"; say what happened instead.
const NOT_FOUND = "This posting no longer exists. It may have been deleted. Refresh the page and try again."
const isNotFound = (e: unknown) => (e as { code?: string })?.code === "P2025"
const badDate = (v: unknown) => v !== undefined && v !== null && v !== "" && Number.isNaN(new Date(v as string).getTime())

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "sites.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { shift, role, endDate, relievedAt, notes } = body
        if (badDate(endDate)) return new NextResponse("End date is not a valid date", { status: 400 })
        if (badDate(relievedAt)) return new NextResponse("Relieved date is not a valid date", { status: 400 })

        const updateData: Record<string, unknown> = {}
        if (shift !== undefined) updateData.shift = shift
        if (role !== undefined) updateData.role = role
        if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null
        if (notes !== undefined) updateData.notes = notes
        if (relievedAt !== undefined) {
            updateData.relievedAt = relievedAt ? new Date(relievedAt) : null
            updateData.isActive = false
            updateData.endDate = relievedAt ? new Date(relievedAt) : null
        }

        const before = await prisma.deployment.findUnique({ where: { id: params.id }, select: { isActive: true } })
        if (!before) return new NextResponse(NOT_FOUND, { status: 404 })
        const deployment = await prisma.deployment.update({
            where: { id: params.id },
            data: updateData,
            include: {
                employee: {
                    select: {
                        id: true,
                        employeeId: true,
                        firstName: true,
                        lastName: true,
                        designation: true,
                        phone: true,
                        photo: true,
                    },
                },
                site: {
                    select: { id: true, name: true, code: true },
                },
            },
        })

        // Relieving an active posting is the change that matters for the record;
        // anything else is an edit of its details.
        const relieved = relievedAt !== undefined && before?.isActive === true
        recordSiteChange({
            action: relieved ? "deployment.relieve" : "deployment.update",
            employeeId: deployment.employeeId, siteId: deployment.siteId,
            startDate: relieved ? (relievedAt || new Date()) : null,
            source: "Deployments", ...actorOf(session),
            extra: relieved ? undefined : { changed: Object.keys(updateData) }, req,
        })

        return NextResponse.json(deployment)
    } catch (error) {
        if (isNotFound(error)) return new NextResponse(NOT_FOUND, { status: 404 })
        console.error("[DEPLOYMENT_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const gone = await prisma.deployment.delete({ where: { id: params.id }, select: { employeeId: true, siteId: true, startDate: true, isActive: true } })
        recordSiteChange({
            action: "deployment.delete", employeeId: gone.employeeId, siteId: gone.siteId, startDate: gone.startDate,
            source: "Deployments", ...actorOf(session), extra: { wasActive: gone.isActive }, req,
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        if (isNotFound(error)) return new NextResponse(NOT_FOUND, { status: 404 })
        console.error("[DEPLOYMENT_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
