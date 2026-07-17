import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export const maxDuration = 60

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

type Candidate = { id: string; name: string | null; email: string | null; role: string }

// Collect every candidate id that is referenced by operational data. One
// bulk query per referencing table (instead of per-user counts, which was
// far too slow for 1,500+ users and timed out the function).
async function findReferencedIds(ids: string[]): Promise<Set<string>> {
    const referenced = new Set<string>()
    if (ids.length === 0) return referenced

    const collect = (rows: Record<string, string | null>[], key: string) => {
        for (const r of rows) {
            const v = r[key]
            if (v) referenced.add(v)
        }
    }

    const q = { in: ids }
    const results = await Promise.all([
        prisma.assignment.findMany({ where: { inspectionBoyId: q }, select: { inspectionBoyId: true }, distinct: ["inspectionBoyId"] }),
        prisma.assignment.findMany({ where: { assignedBy: q }, select: { assignedBy: true }, distinct: ["assignedBy"] }),
        prisma.inspection.findMany({ where: { submittedBy: q }, select: { submittedBy: true }, distinct: ["submittedBy"] }),
        prisma.projectManager.findMany({ where: { managerId: q }, select: { managerId: true }, distinct: ["managerId"] }),
        prisma.projectManager.findMany({ where: { assignedBy: q }, select: { assignedBy: true }, distinct: ["assignedBy"] }),
        prisma.siteAssignment.findMany({ where: { inspectionBoyId: q }, select: { inspectionBoyId: true }, distinct: ["inspectionBoyId"] }),
        prisma.siteAssignment.findMany({ where: { assignedBy: q }, select: { assignedBy: true }, distinct: ["assignedBy"] }),
        prisma.lead.findMany({ where: { assignedTo: q }, select: { assignedTo: true }, distinct: ["assignedTo"] }),
        prisma.lead.findMany({ where: { createdBy: q }, select: { createdBy: true }, distinct: ["createdBy"] }),
        prisma.leadActivity.findMany({ where: { userId: q }, select: { userId: true }, distinct: ["userId"] }),
        prisma.leadDocument.findMany({ where: { uploadedBy: q }, select: { uploadedBy: true }, distinct: ["uploadedBy"] }),
        prisma.leadFollowUp.findMany({ where: { createdBy: q }, select: { createdBy: true }, distinct: ["createdBy"] }),
        prisma.leadForm.findMany({ where: { createdBy: q }, select: { createdBy: true }, distinct: ["createdBy"] }),
        prisma.performanceReview.findMany({ where: { hrApprovedBy: q }, select: { hrApprovedBy: true }, distinct: ["hrApprovedBy"] }),
        prisma.jobPosting.findMany({ where: { createdBy: q }, select: { createdBy: true }, distinct: ["createdBy"] }),
    ])

    collect(results[0] as any, "inspectionBoyId")
    collect(results[1] as any, "assignedBy")
    collect(results[2] as any, "submittedBy")
    collect(results[3] as any, "managerId")
    collect(results[4] as any, "assignedBy")
    collect(results[5] as any, "inspectionBoyId")
    collect(results[6] as any, "assignedBy")
    collect(results[7] as any, "assignedTo")
    collect(results[8] as any, "createdBy")
    collect(results[9] as any, "userId")
    collect(results[10] as any, "uploadedBy")
    collect(results[11] as any, "createdBy")
    collect(results[12] as any, "createdBy")
    collect(results[13] as any, "hrApprovedBy")
    collect(results[14] as any, "createdBy")

    return referenced
}

async function findCandidates() {
    const candidates: Candidate[] = await prisma.user.findMany({
        where: {
            employeeProfile: { is: null },
            role: { notIn: ["ADMIN", "CLIENT"] },
            email: { notIn: DEMO_EMAILS },
        },
        select: { id: true, name: true, email: true, role: true },
    })

    const referenced = await findReferencedIds(candidates.map((c) => c.id))
    const deletable = candidates.filter((c) => !referenced.has(c.id))
    const blocked = candidates.filter((c) => referenced.has(c.id))
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
