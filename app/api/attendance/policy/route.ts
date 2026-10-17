import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess } from "@/lib/permissions"
import { getAttendancePolicy, saveAttendancePolicy } from "@/lib/attendance-register"
import { DEFAULT_ATTENDANCE_POLICY } from "@/lib/attendance-policy"

export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    return NextResponse.json({ policy: await getAttendancePolicy(), defaults: DEFAULT_ATTENDANCE_POLICY })
}

export async function PUT(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (!checkAccess(session, [], "attendance.manage")) return new NextResponse("Forbidden", { status: 403 })
    try {
        return NextResponse.json({ policy: await saveAttendancePolicy(await req.json(), session.user.id) })
    } catch (error) {
        console.error("[ATTENDANCE_POLICY_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
