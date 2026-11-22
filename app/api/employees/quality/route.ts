import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta, employeeScope, hiddenFields, maskValue } from "@/lib/access"
import { computeQuality, savePeopleSettings } from "@/lib/people-quality-server"
import { dupKey, FIXABLE, Q_FIELD } from "@/lib/people-quality"
import { normalizeEmploymentType } from "@/lib/employment-type"
import { applyAutoRoleSafe } from "@/lib/auto-role-server"
import { resolveManagerId } from "@/lib/employee-manager"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET — People → Data quality: gaps, wrong formats, duplicates, completeness.
export async function GET(req: Request) {
    const g = await guard(req, "employees.view")
    if (g instanceof NextResponse) return g
    return NextResponse.json({ ...(await computeQuality(g.access)), canEdit: g.access.isAdmin || g.access.permissions.includes("employees.edit") })
}

// PATCH { employeeId, field, value, force? } — fix one field in place.
// Same format checks as the employee form; a duplicate of another employee's
// value is refused unless `force` (the user saw the warning).
export async function PATCH(req: Request) {
    const g = await guard(req, "employees.edit")
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const employeeId = String(b?.employeeId ?? ""), field = String(b?.field ?? "")
    const f = Q_FIELD.get(field)
    if (!f || !FIXABLE.has(field)) return NextResponse.json({ error: "This field can't be fixed here" }, { status: 400 })
    if (hiddenFields(g.access).has(field)) return NextResponse.json({ error: `You can't see or change ${f.label}` }, { status: 403 })
    const scope = await employeeScope(g.access)
    const emp: any = await prisma.employee.findFirst({ where: scope ? { AND: [{ id: employeeId }, scope] } : { id: employeeId }, select: { id: true, employeeId: true, firstName: true, lastName: true, [field]: true } as any })
    if (!emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 })

    let value: any = typeof b?.value === "string" ? b.value.trim() : b?.value ?? null
    if (value === "") value = null
    if (value !== null && f.validate) { const err = f.validate(String(value)); if (err) return NextResponse.json({ error: err }, { status: 400 }) }
    if (value !== null) {
        if (f.type === "date") { const d = new Date(value); if (isNaN(d.getTime())) return NextResponse.json({ error: "Enter a valid date" }, { status: 400 }); value = d }
        if (field === "employmentType") value = normalizeEmploymentType(value)
        if (["panNumber", "bankIFSC"].includes(field)) value = String(value).toUpperCase().replace(/\s+/g, "")
        if (["aadharNumber", "uan", "esiNumber"].includes(field)) value = String(value).replace(/\D/g, "")
        if (field === "departmentId" && !(await prisma.department.findUnique({ where: { id: value }, select: { id: true } }))) return NextResponse.json({ error: "Pick a department" }, { status: 400 })
        if (field === "managerId") {
            try { value = await resolveManagerId(value, null) } catch (e: any) { return NextResponse.json({ error: e?.message || "Pick a manager from the list" }, { status: 400 }) }
            if (!value) return NextResponse.json({ error: "Pick a manager who has a login" }, { status: 400 })
        }
    }
    if (field === "employmentType" && value === null) return NextResponse.json({ error: "Employment type can't be blank" }, { status: 400 })
    if (field === "phone" && value === null) return NextResponse.json({ error: "Mobile can't be blank" }, { status: 400 })

    // Duplicate of someone else?
    if (value !== null && f.unique && !b?.force) {
        const key = dupKey(field, value)
        const others: any[] = await prisma.employee.findMany({ where: { id: { not: emp.id }, [field]: { not: null } } as any, select: { id: true, employeeId: true, firstName: true, lastName: true, status: true, [field]: true } as any })
        const hit = others.filter(o => dupKey(field, o[field]) === key)
        if (hit.length) return NextResponse.json({ duplicate: true, error: `${f.label} is already on ${hit.map(h => `${h.firstName} ${h.lastName ?? ""}`.trim() + ` (${h.employeeId}, ${String(h.status).toLowerCase()})`).join(", ")}` }, { status: 409 })
    }

    await prisma.employee.update({ where: { id: emp.id }, data: { [field]: value } as any })
    if (field === "designation" && value !== emp.designation) await applyAutoRoleSafe(emp.id, { oldDesignation: emp.designation ?? null, reason: `designation changed to ${value ?? "—"}`, actor: { id: g.access.userId, name: g.access.name } })
    const sensitive = ["aadharNumber", "panNumber", "bankAccountNumber", "uan", "pfNumber", "esiNumber"].includes(field)
    auditLater({
        actorId: g.access.userId, actorName: g.access.name, action: "employee.quality_fix", targetType: "Employee", targetId: emp.id,
        targetName: `${emp.firstName} ${emp.lastName ?? ""}`.trim(), summary: `${f.label} ${emp[field] ? "changed" : "added"} (Data quality)${b?.force ? " — duplicate accepted" : ""}`,
        before: { [field]: sensitive ? maskValue(emp[field]) : emp[field] ?? null }, after: { [field]: sensitive ? maskValue(String(value ?? "")) : value }, ...requestMeta(req),
    })
    return NextResponse.json({ ok: true })
}

// PUT { required, duplicatesAmong } — which fields are required per employment type.
export async function PUT(req: Request) {
    const g = await guard(req, "employees.edit")
    if (g instanceof NextResponse) return g
    const s = await savePeopleSettings(await req.json().catch(() => ({})), g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "employee.quality_settings", targetType: "Setting", targetId: "peopleSettings", targetName: "People data settings", summary: "Required fields saved", after: s, ...requestMeta(req) })
    return NextResponse.json({ ok: true, settings: s })
}


