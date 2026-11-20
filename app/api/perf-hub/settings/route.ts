import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auditLater, requestMeta } from "@/lib/access"
import { getDwmSettings, saveDwmSettings } from "@/lib/dwm-settings"
import { perfCtx, perfErrorResponse, requireManager, jsonError } from "@/lib/perf-hub-db"
import { UNASSIGNABLE_EMPLOYEE_STATUSES } from "@/lib/employee-filter"

export const dynamic = "force-dynamic"

// Performance → Setup → DWM Settings. GET also returns every designation in
// use (with head-count) so role groups can be built from real values.
export async function GET(req: Request) {
    try {
        const ctx = await perfCtx(req)
        if (!ctx.canView && !ctx.selfServe) return jsonError(403, "Forbidden")
        const settings = await getDwmSettings()
        if (!ctx.isManager) return NextResponse.json({ settings })
        const rows = await prisma.employee.groupBy({
            by: ["designation"],
            where: { status: { notIn: [...UNASSIGNABLE_EMPLOYEE_STATUSES] } },
            _count: { _all: true },
        })
        const designations = rows
            .filter(r => r.designation && r.designation.trim())
            .map(r => ({ designation: r.designation!.trim(), count: r._count._all }))
            .sort((a, b) => b.count - a.count)
        return NextResponse.json({ settings, designations })
    } catch (e) {
        return perfErrorResponse(e, "[DWM_SETTINGS_GET]")
    }
}

export async function PUT(req: Request) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        const next = await saveDwmSettings(await req.json().catch(() => ({})), ctx.userId)
        auditLater({
            actorId: ctx.userId, actorName: ctx.session.user?.name ?? null, action: "performance.dwm_settings",
            targetType: "Setting", targetId: "dwmSettings", targetName: "DWM settings", summary: "DWM settings saved", after: next, ...requestMeta(req),
        })
        return NextResponse.json({ ok: true, settings: next })
    } catch (e) {
        return perfErrorResponse(e, "[DWM_SETTINGS_PUT]")
    }
}
