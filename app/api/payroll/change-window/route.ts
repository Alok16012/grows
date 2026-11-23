import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { effectiveWindow } from "@/lib/payroll-change-control"

export const dynamic = "force-dynamic"

// GET — the months a salary / compliance change may start from right now
// (open payroll month, or the next), and whether admins may back-date.
// Used by every "Applies from" picker.
export async function GET(req: Request) {
    const g = await guard(req, ["payroll.view", "payroll.edit", "employees.viewSalary", "performance.edit"])
    if (g instanceof NextResponse) return g
    return NextResponse.json({ ...(await effectiveWindow()), isAdmin: g.access.isAdmin })
}
