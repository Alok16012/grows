import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const site = await prisma.site.findUnique({
            where: { id: params.id },
            include: {
                branch: { select: { id: true, name: true } },
                deployments: {
                    where: { isActive: true },
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
                    },
                    orderBy: { startDate: "desc" },
                },
                _count: {
                    select: {
                        deployments: { where: { isActive: true } },
                        attendances: true,
                    },
                },
            },
        })

        if (!site) return new NextResponse("Not Found", { status: 404 })

        return NextResponse.json(site)
    } catch (error) {
        console.error("[SITE_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const {
            name, address, city, state, pincode,
            clientName, clientId, latitude, longitude, radius,
            manpowerRequired, contactPerson, contactPhone,
            siteType, shift, isActive,
        } = body

        const site = await prisma.site.update({
            where: { id: params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(address !== undefined && { address }),
                ...(city !== undefined && { city }),
                ...(state !== undefined && { state }),
                ...(pincode !== undefined && { pincode }),
                ...(clientName !== undefined && { clientName }),
                ...(clientId !== undefined && { clientId }),
                ...(latitude !== undefined && { latitude: latitude ? parseFloat(latitude) : null }),
                ...(longitude !== undefined && { longitude: longitude ? parseFloat(longitude) : null }),
                ...(radius !== undefined && { radius: parseFloat(radius) }),
                ...(manpowerRequired !== undefined && { manpowerRequired: parseInt(manpowerRequired) }),
                ...(contactPerson !== undefined && { contactPerson }),
                ...(contactPhone !== undefined && { contactPhone }),
                ...(siteType !== undefined && { siteType }),
                ...(shift !== undefined && { shift }),
                ...(isActive !== undefined && { isActive }),
            },
        })

        return NextResponse.json(site)
    } catch (error) {
        console.error("[SITE_PUT]", error)
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

        // Check for active deployments
        const activeDeployments = await prisma.deployment.count({
            where: { siteId: params.id, isActive: true },
        })

        if (activeDeployments > 0) {
            return new NextResponse(
                `Cannot delete site with ${activeDeployments} active deployment(s). Relieve all employees first.`,
                { status: 400 }
            )
        }

        await prisma.site.delete({ where: { id: params.id } })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[SITE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
