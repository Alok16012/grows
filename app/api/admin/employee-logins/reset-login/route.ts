import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { resetLogin } from "@/lib/login-security"
import { auditLater, requestMeta } from "@/lib/access"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// POST /api/admin/employee-logins/reset-login — ADMIN only.
// One-shot: reset EVERY employee login — password and MPIN gone, lockouts
// cleared. Each employee then signs in with an OTP to their mobile and sets a
// fresh MPIN. Nothing is created here; use "Generate logins" for that. Meant
// for the switch to OTP-first sign-in, not for everyday use.
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    // Wipes every employee's password and MPIN in one go, so it must be asked
    // for explicitly — a bare POST (stray click, retried request, script) does nothing.
    const body = await req.json().catch(() => ({}))
    if (body?.confirm !== "RESET ALL LOGINS") {
        return NextResponse.json({ error: 'Send { "confirm": "RESET ALL LOGINS" } to reset every employee login' }, { status: 400 })
    }

    try {
        const employees = await prisma.employee.findMany({
            where: { userId: { not: null } },
            select: { userId: true },
        })
        const userIds = employees.map(e => e.userId).filter((id): id is string => !!id)
        await resetLogin(userIds)
        auditLater({
            actorId: session.user.id, actorName: session.user.name ?? null, action: "user.resetLogin", targetType: "User",
            targetName: "All employee logins", summary: `Reset all employee logins · ${userIds.length} users`,
            after: { users: userIds.length }, ...requestMeta(req),
        })
        return NextResponse.json({ reset: userIds.length })
    } catch (error) {
        console.error("RESET_LOGIN_ALL_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
