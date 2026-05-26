import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Debug endpoint — returns the current session's role + permissions
// so we can verify what the server actually sees.
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 })

    const dbUser = session.user.id
        ? await prisma.user.findUnique({
            where: { id: session.user.id as string },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                customRole: {
                    select: { name: true, isActive: true, permissions: true }
                }
            }
        })
        : null

    return NextResponse.json({
        session: {
            userId: session.user.id,
            email: session.user.email,
            role: session.user.role,
            permissions: (session.user as any).permissions || [],
            customRoleName: (session.user as any).customRoleName,
        },
        database: dbUser ? {
            id: dbUser.id,
            email: dbUser.email,
            role: dbUser.role,
            customRole: dbUser.customRole,
        } : null,
        mismatch: dbUser ? {
            sessionPermsCount: ((session.user as any).permissions || []).length,
            dbCustomRolePermsCount: dbUser.customRole?.permissions?.length || 0,
        } : null,
    })
}
