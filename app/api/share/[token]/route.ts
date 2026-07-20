import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(
    req: Request,
    { params }: { params: { token: string } }
) {
    const link = await prisma.shareableLink.findUnique({
        where: { token: params.token },
        include: {
            inspection: {
                include: {
                    submitter: { select: { name: true, email: true } },
                    assignment: {
                        include: {
                            project: { include: { site: { select: { id: true, name: true } } } }
                        }
                    },
                    responses: { include: { field: true } }
                }
            }
        }
    })

    if (!link) return NextResponse.json({ error: "Link not found or expired" }, { status: 404 })

    if (link.expiresAt && link.expiresAt < new Date()) {
        return NextResponse.json({ error: "This link has expired" }, { status: 410 })
    }

    // Increment view count
    await prisma.shareableLink.update({
        where: { token: params.token },
        data: { viewCount: { increment: 1 } }
    })

    return NextResponse.json({
        inspection: link.inspection,
        viewCount: link.viewCount + 1,
        createdAt: link.createdAt
    })
}
