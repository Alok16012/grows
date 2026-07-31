import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"

export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // `?count=true` skips the row payload — the badge poll runs every 30s per
    // open tab and only needs the number.
    const countOnly = new URL(req.url).searchParams.get("count") === "true"

    // Counted in the DB, not from the fetched page: deriving it from the latest
    // 50 rows capped the badge at 50 and under-reported anyone with more.
    const unreadCountPromise = prisma.notification.count({
        where: { userId: session.user.id, isRead: false },
    })

    if (countOnly) {
        return NextResponse.json({ notifications: [], unreadCount: await unreadCountPromise })
    }

    const [notifications, unreadCount] = await Promise.all([
        prisma.notification.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" },
            take: 50
        }),
        unreadCountPromise,
    ])

    return NextResponse.json({ notifications, unreadCount })
}

export async function PATCH(req: Request) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { markAllRead, id } = await req.json()

    if (markAllRead) {
        await prisma.notification.updateMany({
            where: { userId: session.user.id, isRead: false },
            data: { isRead: true }
        })
    } else if (id) {
        await prisma.notification.updateMany({
            where: { id, userId: session.user.id },
            data: { isRead: true }
        })
    }

    return NextResponse.json({ success: true })
}
