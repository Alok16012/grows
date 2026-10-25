import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"
import { checkAccess } from "@/lib/permissions"
import { collectErrors, siteFieldChecks, validationResponse } from "@/lib/validation"
import { accessFrom } from "@/lib/access"

/**
 * Case-insensitive, trimmed name clash. Site names are what supervisors pick
 * from in every dropdown, so "ABC HQ" and "abc hq " side by side are a bug.
 * Returns the 409 body or null.
 */
async function findSiteNameClash(name: string, excludeId?: string) {
    const trimmed = name.trim()
    const clash = await prisma.site.findFirst({
        where: {
            name: { equals: trimmed, mode: "insensitive" },
            ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true, name: true },
    })
    if (!clash) return null
    const message = `A site named '${clash.name}' already exists`
    return { error: message, message, fields: { name: message } }
}

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

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        // Reading the site list feeds several filter dropdowns (Employees,
        // Attendance, Deployments…), so anyone who can view those modules may list
        // sites — not just users with the dedicated sites.view permission.
        const canListSites =
            checkAccess(session, ["MANAGER", "HR_MANAGER"], "sites.view") ||
            checkAccess(session, [], "employees.view") ||
            checkAccess(session, [], "attendance.view") ||
            // Inspection setup (Site → Project → Assignment) also needs to list
            // sites when picking one for a project / assignment.
            checkAccess(session, [], "projects.view")
        if (!canListSites) {
            return NextResponse.json({
                error: "Forbidden - missing sites.view permission",
                debug: {
                    role: session.user.role,
                    permissions: (session.user as any).permissions || [],
                    permissionCount: ((session.user as any).permissions || []).length,
                    customRoleName: (session.user as any).customRoleName,
                }
            }, { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const isActive = searchParams.get("isActive")
        const city = searchParams.get("city")
        const siteType = searchParams.get("siteType")
        const search = searchParams.get("search")

        const where: Record<string, unknown> = {}
        // An Assigned-sites role lists only the sites set on the user.
        const access = accessFrom(session)
        if (access.scope === "ASSIGNED_SITES") where.id = { in: access.siteIds }
        if (isActive !== null && isActive !== "") where.isActive = isActive === "true"
        if (city) where.city = { contains: city, mode: "insensitive" }
        if (siteType) where.siteType = siteType
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
                { clientName: { contains: search, mode: "insensitive" } },
            ]
        }

        const sites = await prisma.site.findMany({
            where,
            include: {
                _count: {
                    select: {
                        deployments: { where: { isActive: true } },
                        attendances: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        })

        return NextResponse.json(sites)
    } catch (error) {
        console.error("[SITES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "sites.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }
        // Resolve real DB user ID
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })


        const body = await req.json()
        const {
            name, address, city, state, pincode,
            clientName, clientId, latitude, longitude, radius,
            manpowerRequired, contactPerson, contactPhone, siteType, shift,
        } = body

        // Field-level 400s: the wizard shows `fields` under the inputs and
        // toasts `error`. Nothing malformed gets as far as Prisma, so a bad
        // pincode or "abc" manpower can no longer surface as "Internal Error".
        const errors = collectErrors(siteFieldChecks(
            { name, address, city, state, pincode, contactPerson, contactPhone, manpowerRequired, latitude, longitude, radius },
            { requireCore: true },
        ))
        if (errors) return NextResponse.json(validationResponse(errors), { status: 400 })

        const clash = await findSiteNameClash(name)
        if (clash) return NextResponse.json(clash, { status: 409 })

        // Auto-generate site code as SITE-NNNN
        const lastSite = await prisma.site.findFirst({
            where: { code: { startsWith: "SITE-" } },
            orderBy: { createdAt: "desc" },
            select: { code: true },
        })
        let nextNum = 1
        if (lastSite?.code) {
            const match = lastSite.code.match(/\d+$/)
            if (match) nextNum = parseInt(match[0]) + 1
        }
        const code = `SITE-${String(nextNum).padStart(4, "0")}`
        const existing = await prisma.site.findUnique({ where: { code } })
        const finalCode = existing ? `SITE-${String(nextNum + 1).padStart(4, "0")}` : code

        const site = await prisma.site.create({
            data: {
                name: String(name).trim(),
                code: finalCode,
                address: String(address).trim(),
                city: str(city),
                state: str(state),
                pincode: str(pincode),
                clientName: str(clientName),
                clientId: str(clientId),
                latitude: num(latitude),
                longitude: num(longitude),
                radius: num(radius) ?? 100,
                manpowerRequired: num(manpowerRequired) ?? 1,
                contactPerson: str(contactPerson),
                contactPhone: str(contactPhone),
                siteType: siteType || null,
                shift: shift || null,
                createdBy: actorId!,
            },
        })

        return NextResponse.json(site)
    } catch (error) {
        console.error("[SITES_POST]", error)
        // A Prisma constraint/shape failure is a bad request, not an outage —
        // tell the client plainly instead of a bare "Internal Error".
        if ((error as { code?: string })?.code?.startsWith("P2")) {
            return NextResponse.json({ error: "Could not save the site — check the field values and try again." }, { status: 400 })
        }
        return new NextResponse("Internal Error", { status: 500 })
    }
}
