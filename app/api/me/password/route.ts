import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { hasOwnPassword } from "@/lib/credentials"
import { mustChangePasswordFor } from "@/lib/access-session"

export const dynamic = "force-dynamic"

// GET /api/me/password — does the signed-in user have a password of their own?
// Accounts are created without one; the profile page uses this to show "Set
// password" instead of "Change password".
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Not logged in" }, { status: 401 })
    try {
        const user = await prisma.user.findUnique({ where: { id: session.user.id as string }, select: { password: true } })
        if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 })
        return NextResponse.json({ hasPassword: hasOwnPassword(user.password) })
    } catch (e) {
        console.error("[ME_PASSWORD_GET]", e)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

// PATCH /api/me/password — the logged-in user sets or changes their own password.
// The current password is only required when they already have one AND this
// session was opened with it: an OTP or MPIN login has already proven who they
// are, and a first-time password has nothing to compare against.
export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Not logged in" }, { status: 401 })

    try {
        const { currentPassword, newPassword } = await req.json() as {
            currentPassword?: string
            newPassword?: string
        }

        if (!newPassword) {
            return NextResponse.json({ error: "New password is required" }, { status: 400 })
        }
        // Replacing an admin-set initial password follows the same rule it was
        // set with (Users → Create user): 10+ characters, not the same one.
        const mustChange = await mustChangePasswordFor(session.user.id as string)
        const minLength = mustChange ? 10 : 6
        if (String(newPassword).length < minLength) {
            return NextResponse.json({ error: `New password must be at least ${minLength} characters` }, { status: 400 })
        }

        const user = await prisma.user.findUnique({ where: { id: session.user.id as string }, select: { id: true, password: true } })
        if (!user) {
            return NextResponse.json({ error: "Account not found" }, { status: 404 })
        }

        const loginMethod = (session.user as { loginMethod?: string }).loginMethod || "password"
        const mustProveCurrent = hasOwnPassword(user.password) && loginMethod === "password"
        if (mustProveCurrent) {
            if (!currentPassword) {
                return NextResponse.json({ error: "Current password is required" }, { status: 400 })
            }
            const ok = await bcrypt.compare(currentPassword, user.password)
            if (!ok) {
                return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
            }
        }

        if (mustChange && hasOwnPassword(user.password) && (await bcrypt.compare(String(newPassword), user.password))) {
            return NextResponse.json({ error: "Choose a new password, not the one you were given" }, { status: 400 })
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: await bcrypt.hash(String(newPassword), 10),
                // Never a visible password — the user is the only one who knows it.
                plainPassword: null,
            },
        })
        if (mustChange) {
            await prisma.userAccess.update({ where: { userId: user.id }, data: { mustChangePassword: false } }).catch(() => { /* table missing */ })
        }

        return NextResponse.json({ success: true })
    } catch (e) {
        console.error("[ME_PASSWORD_PATCH]", e)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
