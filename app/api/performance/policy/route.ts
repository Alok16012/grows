import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { getBands, saveBands } from "@/lib/performance-server"
import { DEFAULT_BANDS } from "@/lib/performance-score"

// Rating bands: score range → label, rank, suggested increment / bonus, PIP.
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    const { bands, customized } = await getBands()
    return NextResponse.json({ bands, customized, defaults: DEFAULT_BANDS })
}

export async function PUT(req: Request) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "performance.manage")) return new NextResponse("Forbidden", { status: 403 })
    const { bands } = await req.json()
    return NextResponse.json({ bands: await saveBands(bands, session!.user.id) })
}
