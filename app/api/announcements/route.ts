import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { resolveUserId } from "@/lib/resolveUserId"
import { audienceWhere, cleanIdArray } from "@/lib/audience"

// GET — signed-in users see active announcements targeted at their site/role
// (newest / pinned first). Managers/admins see all (audienceWhere → null).
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    try {
        const aud = await audienceWhere(session)
        const announcements = await prisma.announcement.findMany({
            where: aud ? { isActive: true, ...aud } : { isActive: true },
            orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
        })
        return NextResponse.json(announcements)
    } catch (err: any) {
        // Table not migrated yet — degrade gracefully instead of 500.
        const msg = String(err?.message || "")
        if (msg.includes("does not exist") || err?.code === "P2021" || err?.code === "P2022") {
            return NextResponse.json([])
        }
        console.error("[ANNOUNCEMENTS_GET]", err)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

// POST — create an announcement (management permission only).
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "announcements.manage")) {
        return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { title, body: text, category, pinned, targetSiteIds, targetRoleIds } = body
    if (!title || !text) {
        return new NextResponse("title and body are required", { status: 400 })
    }

    const createdBy = session ? await resolveUserId(session) : null

    const announcement = await prisma.announcement.create({
        data: {
            title,
            body: text,
            category: category || "NOTICE",
            pinned: !!pinned,
            createdBy: createdBy ?? null,
            targetSiteIds: cleanIdArray(targetSiteIds),
            targetRoleIds: cleanIdArray(targetRoleIds),
        },
    })
    return NextResponse.json(announcement)
}
