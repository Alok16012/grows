import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { managerOptions } from "@/lib/employee-manager"

// GET /api/employees/manager-options[?include=<userId>]
// The "Reports to" picker on the employee form: who can be someone's manager,
// by name and role only (see lib/employee-manager). `include` keeps the
// current manager listed even if they would no longer qualify.
export async function GET(req: Request) {
    const g = await guard(req, ["employees.view", "employees.create", "employees.edit", "recruitment.manage"])
    if (g instanceof NextResponse) return g
    try {
        const include = new URL(req.url).searchParams.get("include")
        return NextResponse.json(await managerOptions(include ? [include] : []))
    } catch (e) {
        console.error("[MANAGER_OPTIONS]", e)
        return NextResponse.json({ error: "Couldn't load the list of managers" }, { status: 500 })
    }
}
