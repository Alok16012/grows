import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"

// PATCH /api/me/password — the logged-in user changes their own password.
// Verifies the current password, then stores the new one (and clears the
// admin-visible plainPassword, since the user now owns a private password).
export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Not logged in" }, { status: 401 })

    try {
        const { currentPassword, newPassword } = await req.json() as {
            currentPassword?: string
            newPassword?: string
        }

        if (!currentPassword || !newPassword) {
            return NextResponse.json({ error: "Current and new password are required" }, { status: 400 })
        }
        if (String(newPassword).length < 6) {
            return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 })
        }

        const user = await prisma.user.findUnique({ where: { id: session.user.id as string } })
        if (!user || !user.password) {
            return NextResponse.json({ error: "Account not found" }, { status: 404 })
        }

        const ok = await bcrypt.compare(currentPassword, user.password)
        if (!ok) {
            return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: await bcrypt.hash(newPassword, 10),
                // Clear the admin-visible default — the user now owns a private password.
                plainPassword: null,
            },
        })

        return NextResponse.json({ success: true })
    } catch (e) {
        console.error("[ME_PASSWORD_PATCH]", e)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
