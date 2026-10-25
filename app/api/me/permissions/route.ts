import { NextResponse } from "next/server"
import { guard } from "@/lib/access"

// What the signed-in user may do, for hiding menu items and buttons. The
// server still checks every request; this only shapes the screen.
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const { access } = g
    return NextResponse.json({
        isAdmin: access.isAdmin,
        scope: access.scope,
        siteIds: access.siteIds,
        permissions: access.permissions,
    })
}
