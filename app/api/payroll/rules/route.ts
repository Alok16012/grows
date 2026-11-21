import { getServerSession } from "next-auth"
import { recalcDraftPayroll } from "@/lib/payroll-recalc"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { auditLater, requestMeta } from "@/lib/access"
import { getPayrollRules, loadRulesHistory, resetPayrollRules, savePayrollRules, deletePayrollRulesVersion } from "@/lib/payroll-rules-server"
import { checkEffectiveMonth, effectiveWindow, saveChangeControl, type YM } from "@/lib/payroll-change-control"

// Calculation Settings are dated versions (lib/payroll-rules-server).
//
// GET /api/payroll/rules[?month=&year=] — the rules in force for that payroll
// month (default: the open payroll month), the list of versions, and which
// months a change may start from. Readable by anyone who can see payroll
// figures or salary structures: the same rules drive their previews.
export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    const canRead =
        checkAccess(session, [], "payroll.view") ||
        checkAccess(session, [], "payroll.manage") ||
        checkAccess(session, [], "employees.viewSalary")
    if (!canRead) return new NextResponse("Forbidden", { status: 403 })

    const sp = new URL(req.url).searchParams
    const m = Number(sp.get("month")), y = Number(sp.get("year"))
    const period = Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(y) && y > 2000 ? { month: m, year: y } : undefined
    const [{ rules, customized, from }, history, window] = await Promise.all([getPayrollRules(period), loadRulesHistory(), effectiveWindow()])
    return NextResponse.json({
        rules, customized, from,
        versions: history.versions.map(v => ({ fromYear: v.fromYear, fromMonth: v.fromMonth, savedBy: v.savedBy, savedAt: v.savedAt, note: v.note ?? null })),
        window,
    })
}

function readFrom(body: any): YM | null {
    const month = Number(body?.effectiveMonth), year = Number(body?.effectiveYear)
    return Number.isInteger(month) && Number.isInteger(year) ? { month, year } : null
}

// PUT /api/payroll/rules — { rules, effectiveMonth, effectiveYear, reason? }
// saves a version from that month; { reset: true, effectiveMonth, effectiveYear }
// puts the verified defaults in from that month; { changeControl } saves the
// change-control settings. Changing statutory rates changes real pay, so this
// needs the payroll write permission.
export async function PUT(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (!checkAccess(session, [], "payroll.manage")) {
        return new NextResponse("Forbidden", { status: 403 })
    }
    const userId = session.user.id ?? "system"
    const isAdmin = (session.user as any).role === "ADMIN"

    try {
        const body = await req.json()
        if (body?.changeControl) {
            // Who may loosen the rules about back-dating: admins only.
            if (!isAdmin) return NextResponse.json({ error: "Only an admin can change the change-control rules." }, { status: 403 })
            const control = await saveChangeControl(body.changeControl, userId)
            auditLater({ actorId: userId, actorName: session.user.name ?? "", action: "payroll.change_control", targetType: "Setting", targetId: "payrollChangeControl", targetName: "Payroll change control", summary: "Change-control rules saved", after: control, ...requestMeta(req) })
            return NextResponse.json({ ok: true, window: await effectiveWindow() })
        }

        const from = readFrom(body)
        if (!from) return NextResponse.json({ error: "Pick the month these settings apply from." }, { status: 400 })
        const problem = await checkEffectiveMonth(from, { isAdmin }, body?.reason)
        if (problem) return NextResponse.json({ error: problem }, { status: 400 })

        const rules = body?.reset === true
            ? await resetPayrollRules(userId, from)
            : await savePayrollRules(body?.rules ?? body, userId, from, typeof body?.reason === "string" ? body.reason.slice(0, 300) : null)
        auditLater({
            actorId: userId, actorName: session.user.name ?? "", action: body?.reset ? "payroll.rules_reset" : "payroll.rules_save",
            targetType: "Setting", targetId: `payrollRules:${from.year}-${from.month}`, targetName: "Calculation settings",
            summary: `${body?.reset ? "Defaults" : "Calculation settings"} from ${from.month}/${from.year}${body?.reason ? ` — back-dated: ${body.reason}` : ""}`,
            after: rules, ...requestMeta(req),
        })
        // Draft payroll from that month on picks up the new settings now — no attendance re-upload.
        const recalculated = await recalcDraftPayroll({ from })
        return NextResponse.json({ rules, customized: true, from, recalculated })
    } catch (e) {
        console.error("[PAYROLL_RULES_PUT]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

// DELETE /api/payroll/rules?month=&year= — drop a version that hasn't started yet.
export async function DELETE(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (!checkAccess(session, [], "payroll.manage")) return new NextResponse("Forbidden", { status: 403 })
    const sp = new URL(req.url).searchParams
    const from = { month: Number(sp.get("month")), year: Number(sp.get("year")) }
    const problem = await deletePayrollRulesVersion(from, session.user.id ?? "system")
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    auditLater({ actorId: session.user.id ?? "system", actorName: session.user.name ?? "", action: "payroll.rules_delete", targetType: "Setting", targetId: `payrollRules:${from.year}-${from.month}`, targetName: "Calculation settings", summary: `Removed the version from ${from.month}/${from.year}`, ...requestMeta(req) })
    const recalculated = await recalcDraftPayroll({ from })
    return NextResponse.json({ ok: true, recalculated })
}
