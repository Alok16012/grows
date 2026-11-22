import { NextResponse } from "next/server"
import { guard, has } from "@/lib/access"
import { canUse, canSeeTeam, canEditAny, canSales, getDialerSettings } from "@/lib/dialer-server"

export const dynamic = "force-dynamic"

// GET — what the signed-in user can do in the dialer (which tabs to show).
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const a = g.access
    return NextResponse.json({
        me: a.userId, name: a.name, canUse: canUse(a), canSeeTeam: canSeeTeam(a), canEditAny: canEditAny(a), canSales: canSales(a),
        canExport: a.isAdmin || has(a, "dialer.export"), appUrl: (await getDialerSettings()).appUrl,
    })
}
