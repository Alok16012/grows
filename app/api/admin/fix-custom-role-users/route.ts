import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

// POST /api/admin/fix-custom-role-users
// One-time fix: upgrades all users who have a customRole but are still
// INSPECTION_BOY to MANAGER so they get the correct dashboard & sidebar.
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const result = await prisma.user.updateMany({
            where: {
                customRoleId: { not: null },   // has a custom role
                // Deliberate: INSPECTION_BOY is no longer assigned anywhere, so this
                // is the legacy population this repair tool exists to find and migrate.
                role: "INSPECTION_BOY",
            },
            data: { role: "MANAGER" },          // upgrade to manager dashboard
        })

        return NextResponse.json({
            success: true,
            fixed: result.count,
            message: `${result.count} users ko MANAGER level pe upgrade kar diya. Ab unhe sahi dashboard milega.`,
        })
    } catch (e: any) {
        console.error("[FIX_CUSTOM_ROLE_USERS]", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
