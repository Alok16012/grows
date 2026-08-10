import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { getPayrollRules, resetPayrollRules, savePayrollRules } from "@/lib/payroll-rules-server"

// GET /api/payroll/rules — current calculation rules (defaults if never saved).
// Readable by anyone who can see payroll figures or salary structures: the
// same rules drive the previews on those screens.
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    const canRead =
        checkAccess(session, [], "payroll.view") ||
        checkAccess(session, [], "payroll.manage") ||
        checkAccess(session, [], "employees.viewSalary")
    if (!canRead) return new NextResponse("Forbidden", { status: 403 })

    const { rules, customized } = await getPayrollRules()
    return NextResponse.json({ rules, customized })
}

// PUT /api/payroll/rules — save edited rules, or { reset: true } to go back to
// the verified Growus defaults. Changing statutory rates changes real pay, so
// this needs the payroll write permission.
export async function PUT(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (!checkAccess(session, [], "payroll.manage")) {
        return new NextResponse("Forbidden", { status: 403 })
    }

    try {
        const body = await req.json()
        if (body?.reset === true) {
            const rules = await resetPayrollRules()
            return NextResponse.json({ rules, customized: false })
        }
        const rules = await savePayrollRules(body?.rules ?? body, session.user.id ?? "system")
        return NextResponse.json({ rules, customized: true })
    } catch (e) {
        console.error("[PAYROLL_RULES_PUT]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
