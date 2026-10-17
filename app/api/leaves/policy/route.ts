import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess } from "@/lib/permissions"
import { getLeavePolicy, saveLeavePolicy } from "@/lib/leave-policy-server"
import { DEFAULT_LEAVE_POLICY } from "@/lib/leave-policy"

// Any signed-in user reads the policy — the apply form needs the leave types,
// half-day rules and weekly offs. Only leaves.manage may change it.
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    const { policy, customized } = await getLeavePolicy()
    return NextResponse.json({ policy, customized, defaults: DEFAULT_LEAVE_POLICY })
}

export async function PUT(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (!checkAccess(session, [], "leaves.manage")) return new NextResponse("Forbidden", { status: 403 })
    try {
        const policy = await saveLeavePolicy(await req.json(), session.user.id)
        return NextResponse.json({ policy, customized: true })
    } catch (error) {
        console.error("[LEAVE_POLICY_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
