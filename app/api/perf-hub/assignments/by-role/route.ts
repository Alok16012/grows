import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { UNASSIGNABLE_EMPLOYEE_STATUSES } from "@/lib/employee-filter"
import { perfCtx, perfErrorResponse, requireManager, jsonError } from "@/lib/perf-hub-db"
import { getDwmSettings } from "@/lib/dwm-settings"
import { applyAssignments, type ReviewerSpec } from "@/lib/dwm-assign"

export const dynamic = "force-dynamic"

/** Active staff whose designation is in the group (case-insensitive). */
async function groupEmployees(designations: string[], onlyUnassigned: boolean) {
    const wanted = new Set(designations.map(d => d.trim().toLowerCase()))
    const rows = await prisma.employee.findMany({
        where: {
            status: { notIn: [...UNASSIGNABLE_EMPLOYEE_STATUSES] },
            NOT: { onboardingRecord: { is: { status: { not: "COMPLETED" } } } },
            designation: { not: null },
            ...(onlyUnassigned ? { perfAssignment: { is: null } } : {}),
        },
        select: { id: true, designation: true },
    })
    return rows.filter(r => wanted.has((r.designation ?? "").trim().toLowerCase())).map(r => r.id)
}

// POST { group, reviewerMode?: "manager" | "keep", onlyUnassigned?, preview? }
// Assigns the group's template (DWM Settings → Role groups) to everyone in it.
export async function POST(req: Request) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        const body = await req.json().catch(() => ({}))
        const settings = await getDwmSettings()
        const group = settings.roleGroups.find(g => g.name === String(body?.group ?? ""))
        if (!group) return jsonError(400, "Role group not found — set it up in DWM Settings")
        if (!group.templateFamilyId) return jsonError(400, `Pick a template for "${group.name}" in DWM Settings first`)
        const live = await prisma.perfTemplate.findFirst({ where: { familyId: group.templateFamilyId, status: "PUBLISHED" }, select: { name: true } })
        if (!live) return jsonError(400, `The template for "${group.name}" isn't published yet`)

        const ids = await groupEmployees(group.designations, body?.onlyUnassigned === true)
        if (body?.preview) return NextResponse.json({ ok: true, count: ids.length, template: live.name })
        if (!ids.length) return jsonError(400, "Nobody in this role group to assign")

        const reviewer: ReviewerSpec = body?.reviewerMode === "manager" ? "manager" : undefined
        const result = await applyAssignments({ employeeIds: ids, templateFamilyId: group.templateFamilyId, reviewer, actorId: ctx.userId })
        return NextResponse.json({ ok: true, template: live.name, ...result })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_ASSIGN_BY_ROLE]")
    }
}
