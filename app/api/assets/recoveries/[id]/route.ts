import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets } from "@/lib/permissions"
import { notifyEmployee } from "@/lib/hr-notify"
import { jsonError, workflowErrorResponse } from "@/lib/asset-workflow"
import { actOnRecovery, type RecoveryAction } from "@/lib/asset-recovery"
import { ymLabel } from "@/lib/payroll-change-control"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// PUT { action: SCHEDULE_PAYROLL (month, year) | FNF | CASH (note?) | WAIVE (note) | UNSCHEDULE | AMOUNT (amount) }
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const b = await req.json().catch(() => ({}))
        const a = { ...b, month: Number(b?.month), year: Number(b?.year), amount: Number(b?.amount) } as RecoveryAction
        const r = await actOnRecovery(params.id, a, session.user.id)
        if (a.action === "SCHEDULE_PAYROLL") {
            await notifyEmployee(r.recovery.employeeId, { title: "Asset recovery from salary", message: `₹${r.recovery.amount.toLocaleString("en-IN")} (${r.recovery.recoveryNo}, ${r.recovery.reason.toLowerCase().replace("_", " ")}) will be deducted from your ${ymLabel({ month: a.month, year: a.year })} salary.`, type: "asset", link: "/profile?tab=assets" })
        }
        return NextResponse.json(r)
    } catch (e) { return workflowErrorResponse(e, "[ASSET_RECOVERY_PUT]") }
}
