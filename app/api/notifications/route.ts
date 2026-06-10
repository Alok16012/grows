import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"

export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const notifications = await prisma.notification.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 50
    })

    const unreadCount = notifications.filter(n => !n.isRead).length
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
