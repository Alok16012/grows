import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

// Admin-only cleanup of orphan logins: User rows that have NO linked Employee
// record. These come from old imports / auto-created logins and inflate the
// "Total Users" stat. GET = dry-run preview, POST = actually delete.
//
// Safety rails:
//   - ADMIN and CLIENT logins are never touched (clients are not employees by
//     design; admins run the system).
//   - The demo accounts are never touched.
//   - Users referenced by operational data (inspections, assignments, leads,
//     projects, …) are SKIPPED, not deleted — removing them would destroy or
//     orphan real work history.

const DEMO_EMAILS = [
    "admin@cims.com",
    "manager@cims.com",
    "hr@cims.com",
    "inspector@cims.com",
    "client@cims.com",
]

// Every User back-relation that must block a hard delete. Notifications are
// excluded — they cascade with the user and carry no operational history.
const BLOCKING_COUNTS = {
    assignmentsAsAssigner: true,
    assignmentsAsInspector: true,
    inspections: true,
    managedProjects: true,
    assignedProjects: true,
    leadsAssigned: true,
    leadsCreated: true,
    leadActivities: true,
    leadDocsUploaded: true,
    leadFollowUpsCreated: true,
    leadFormsCreated: true,
    hrApprovedReviews: true,
    jobPostingsCreated: true,
    siteAssignmentsAsInspector: true,
    siteAssignmentsAsAssigner: true,
} as const

async function findCandidates() {
    const candidates = await prisma.user.findMany({
        where: {
            employeeProfile: { is: null },
            role: { notIn: ["ADMIN", "CLIENT"] },
            email: { notIn: DEMO_EMAILS },
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            _count: { select: BLOCKING_COUNTS },
        },
    })

    const deletable: typeof candidates = []
    const blocked: typeof candidates = []
    for (const u of candidates) {
        const hasData = Object.values(u._count).some((n) => n > 0)
        if (hasData) blocked.push(u)
        else deletable.push(u)
    }
    return { candidates, deletable, blocked }
}

function requireAdmin(session: { user?: { role?: string } } | null) {
    return session?.user?.role === "ADMIN"
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!requireAdmin(session)) return new NextResponse("Forbidden", { status: 403 })

        const [totalUsers, { deletable, blocked }] = await Promise.all([
            prisma.user.count(),
            findCandidates(),
        ])

        return NextResponse.json({
            totalUsers,
            orphanLogins: deletable.length + blocked.length,
            deletable: deletable.length,
            blocked: blocked.length,
            deletableSample: deletable.slice(0, 20).map((u) => ({ name: u.name, email: u.email, role: u.role })),
            blockedSample: blocked.slice(0, 20).map((u) => ({ name: u.name, email: u.email, role: u.role })),
        })
    } catch (error) {
        console.error("[CLEANUP_USERS_GET]", error)
        return NextResponse.json({ error: "Failed to analyse users" }, { status: 500 })
    }
}

export async function POST() {
    try {
        const session = await getServerSession(authOptions)
        if (!requireAdmin(session)) return new NextResponse("Forbidden", { status: 403 })

        const { deletable, blocked } = await findCandidates()
        const ids = deletable.map((u) => u.id)

        let deleted = 0
        let failed = 0
        const CHUNK = 200
        for (let i = 0; i < ids.length; i += CHUNK) {
            const chunk = ids.slice(i, i + CHUNK)
            try {
                // Notifications first — the DB-level cascade may not exist on
                // older prod schemas (migrations are applied manually there).
                await prisma.notification.deleteMany({ where: { userId: { in: chunk } } })
                const res = await prisma.user.deleteMany({ where: { id: { in: chunk } } })
                deleted += res.count
            } catch {
                // Chunk hit an unexpected FK — fall back to one-by-one so a
                // single bad row doesn't sink the rest.
                for (const id of chunk) {
                    try {
                        await prisma.notification.deleteMany({ where: { userId: id } })
                        await prisma.user.delete({ where: { id } })
                        deleted++
                    } catch {
                        failed++
                    }
                }
            }
        }

        const totalUsers = await prisma.user.count()
        return NextResponse.json({ deleted, failed, skipped: blocked.length, totalUsers })
    } catch (error) {
        console.error("[CLEANUP_USERS_POST]", error)
        return NextResponse.json({ error: "Cleanup failed" }, { status: 500 })
    }
}
