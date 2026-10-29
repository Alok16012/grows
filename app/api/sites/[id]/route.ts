import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { collectErrors, siteFieldChecks, validationResponse } from "@/lib/validation"

// Same helpers as app/api/sites/route.ts. A route file may only export HTTP
// handlers, so they are repeated here rather than shared.

/** Trimmed string or null — blank optional fields are stored as NULL, not "". */
const str = (v: unknown): string | null => {
    if (v === null || v === undefined) return null
    const t = String(v).trim()
    return t ? t : null
}

/** Finite number or null. Callers validate the range first; this only converts. */
const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null
    const n = typeof v === "number" ? v : Number(String(v).trim())
    return Number.isFinite(n) ? n : null
}

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "sites.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const site = await prisma.site.findUnique({
            where: { id: params.id },
            include: {
                deployments: {
                    // Working staff only — same rule as the site list's count.
                    where: { isActive: true, employee: { status: { in: ["ACTIVE", "ON_LEAVE"] } } },
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
                        deployments: { where: { isActive: true, employee: { status: { in: ["ACTIVE", "ON_LEAVE"] } } } },
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
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "sites.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const {
            name, address, city, state, pincode,
            clientName, clientId, latitude, longitude, radius,
            manpowerRequired, contactPerson, contactPhone,
            siteType, shift, isActive,
        } = body

        // Only the fields that were sent are checked, so the Activate /
        // Deactivate toggle ({ isActive }) is not asked for a name. A field
        // that IS sent must be well-formed — the old parseInt/parseFloat path
        // let "abc" through as NaN and answered "Internal Error".
        const errors = collectErrors({
            ...siteFieldChecks({ name, address, city, state, pincode, contactPerson, contactPhone, manpowerRequired, latitude, longitude, radius }),
            isActive: isActive !== undefined && typeof isActive !== "boolean" ? "isActive must be true or false" : null,
        })
        if (errors) return NextResponse.json(validationResponse(errors), { status: 400 })

        if (name !== undefined) {
            const clash = await prisma.site.findFirst({
                where: { name: { equals: String(name).trim(), mode: "insensitive" }, id: { not: params.id } },
                select: { name: true },
            })
            if (clash) {
                const message = `A site named '${clash.name}' already exists`
                return NextResponse.json({ error: message, message, fields: { name: message } }, { status: 409 })
            }
        }

        const site = await prisma.site.update({
            where: { id: params.id },
            data: {
                ...(name !== undefined && { name: String(name).trim() }),
                ...(address !== undefined && { address: String(address).trim() }),
                ...(city !== undefined && { city: str(city) }),
                ...(state !== undefined && { state: str(state) }),
                ...(pincode !== undefined && { pincode: str(pincode) }),
                ...(clientName !== undefined && { clientName: str(clientName) }),
                ...(clientId !== undefined && { clientId: str(clientId) }),
                ...(latitude !== undefined && { latitude: num(latitude) }),
                ...(longitude !== undefined && { longitude: num(longitude) }),
                // Blank radius falls back to the schema default rather than NaN.
                ...(radius !== undefined && { radius: num(radius) ?? 100 }),
                ...(manpowerRequired !== undefined && { manpowerRequired: num(manpowerRequired) ?? 1 }),
                ...(contactPerson !== undefined && { contactPerson: str(contactPerson) }),
                ...(contactPhone !== undefined && { contactPhone: str(contactPhone) }),
                ...(siteType !== undefined && { siteType: str(siteType) }),
                ...(shift !== undefined && { shift: str(shift) }),
                ...(isActive !== undefined && { isActive }),
            },
        })

        return NextResponse.json(site)
    } catch (error) {
        console.error("[SITE_PUT]", error)
        const code = (error as { code?: string })?.code
        if (code === "P2025") return NextResponse.json({ error: "Site not found" }, { status: 404 })
        if (code?.startsWith("P2")) {
            return NextResponse.json({ error: "Could not save the site — check the field values and try again." }, { status: 400 })
        }
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
