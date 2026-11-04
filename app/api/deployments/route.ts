import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"
import { checkAccess } from "@/lib/permissions"
import { recordSiteChange, actorOf } from "@/lib/site-history"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "sites.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const siteId = searchParams.get("siteId")
        const employeeId = searchParams.get("employeeId")
        const isActive = searchParams.get("isActive")

        const where: Record<string, unknown> = {}
        if (siteId) where.siteId = siteId
        if (employeeId) where.employeeId = employeeId
        if (isActive !== null && isActive !== "") where.isActive = isActive === "true"

        const deployments = await prisma.deployment.findMany({
            where,
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
                    select: { id: true, name: true, code: true, city: true },
                },
            },
            orderBy: { startDate: "desc" },
        })

        return NextResponse.json(deployments)
    } catch (error) {
        console.error("[DEPLOYMENTS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

/** A rule refusal raised inside the transaction, answered as a 400. */
class DeploymentRefusal extends Error {}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "sites.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }
        // Resolve real DB user ID
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })


        const body = await req.json()
        const { employeeId, siteId, startDate, shift, role, notes, move, source } = body

        if (!employeeId || !siteId || !startDate) {
            return new NextResponse("employeeId, siteId and startDate are required", { status: 400 })
        }
        const start = new Date(startDate)
        if (Number.isNaN(start.getTime())) {
            return new NextResponse("startDate is not a valid date", { status: 400 })
        }

        const now = new Date()
        const createData = {
            employeeId,
            siteId,
            startDate: start,
            shift: shift || null,
            role: role || null,
            notes: notes || null,
            createdBy: actorId!,
            isActive: true,
        }
        const include = {
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
        }

        // An employee holds one active posting at a time. The check and the
        // write run under a per-employee lock: two saves at the same moment
        // (two HR users on the same New Joiners alert) both passed the check
        // and left the person posted at two sites.
        let existingDeployment: { id: string; siteId: string; site: { name: string } } | null = null
        const deployment = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"deployment:" + employeeId}))`
            existingDeployment = await tx.deployment.findFirst({
                where: { employeeId, isActive: true },
                select: { id: true, siteId: true, site: { select: { name: true } } },
            })
            if (existingDeployment && existingDeployment.siteId === siteId) {
                throw new DeploymentRefusal(`Employee is already deployed at ${existingDeployment.site.name}.`)
            }
            // Without `move: true` the old answer stands — the caller must relieve
            // first. With it (the Assign form asked "Move X from A to B?" and the
            // user confirmed) the old posting is closed and the new one opened
            // together, so a failure can't leave the employee at zero sites.
            if (existingDeployment && move !== true) {
                throw new DeploymentRefusal(`Employee is already deployed at ${existingDeployment.site.name}. Relieve them first.`)
            }
            if (existingDeployment) {
                await tx.deployment.update({
                    where: { id: existingDeployment.id },
                    data: { isActive: false, endDate: now, relievedAt: now },
                })
            }
            return tx.deployment.create({ data: createData, include })
        }, { timeout: 20_000, maxWait: 10_000 })
        const previous = existingDeployment as { siteId: string } | null

        recordSiteChange({
            action: previous ? "deployment.move" : "deployment.assign",
            employeeId, siteId, fromSiteId: previous?.siteId ?? null, startDate: start,
            source: source === "new-joiners" ? "New joiners" : "Deployments",
            ...actorOf(session), extra: { shift: shift || null, role: role || null }, req,
        })

        return NextResponse.json(deployment)
    } catch (error) {
        if (error instanceof DeploymentRefusal) return new NextResponse(error.message, { status: 400 })
        console.error("[DEPLOYMENTS_POST]", error)
        const code = (error as { code?: string })?.code
        // P2003 = unknown employeeId / siteId foreign key.
        if (code === "P2003") return new NextResponse("Employee or site not found", { status: 400 })
        return new NextResponse("Internal Error", { status: 500 })
    }
}
