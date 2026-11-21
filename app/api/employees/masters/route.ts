import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { foldDesignation, matchDesignation } from "@/lib/people-masters"
import { getDesignations, saveDesignations } from "@/lib/people-masters-server"
import { normalizeEmploymentType, EMPLOYMENT_TYPES } from "@/lib/employment-type"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const ACTIVE = { status: { in: ["ACTIVE", "ONBOARDING"] as any } }

// GET — designation master with usage, every designation spelling in use with
// suggested merges, departments with counts, employment-type spellings.
export async function GET(req: Request) {
    const g = await guard(req, "employees.view")
    if (g instanceof NextResponse) return g
    const [master, rawDes, depts, deptCounts, types, noDept] = await Promise.all([
        getDesignations(),
        prisma.employee.groupBy({ by: ["designation"], where: ACTIVE, _count: { _all: true } }),
        prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true, description: true } }),
        prisma.employee.groupBy({ by: ["departmentId"], where: ACTIVE, _count: { _all: true } }),
        prisma.employee.groupBy({ by: ["employmentType"], where: ACTIVE, _count: { _all: true } }),
        prisma.employee.count({ where: { ...ACTIVE, departmentId: null } }),
    ])
    const raw = rawDes.filter(r => (r.designation ?? "").trim()).map(r => ({ value: r.designation!, count: r._count._all, standard: matchDesignation(master, r.designation)?.name ?? null }))
    // Suggested merges: spellings that differ only in case / spaces / punctuation.
    const groups = new Map<string, typeof raw>()
    for (const r of raw) { const k = foldDesignation(r.value); groups.set(k, [...(groups.get(k) ?? []), r]) }
    const suggestions = Array.from(groups.values()).filter(gr => gr.length > 1 || (gr[0].standard && gr[0].standard !== gr[0].value))
        .map(gr => { const sorted = [...gr].sort((a, b) => b.count - a.count); return { to: sorted[0].standard ?? sorted[0].value, from: sorted.map(x => x.value), employees: sorted.reduce((s, x) => s + x.count, 0) } })
        .filter(s => s.from.some(f => f !== s.to))
        .sort((a, b) => b.employees - a.employees)
    const deptCount = new Map(deptCounts.map(d => [d.departmentId, d._count._all]))
    return NextResponse.json({
        master: master.map(m => ({ ...m, employees: raw.filter(r => r.standard === m.name).reduce((s, r) => s + r.count, 0) })),
        raw: raw.sort((a, b) => b.count - a.count),
        suggestions,
        departments: depts.map(d => ({ ...d, employees: deptCount.get(d.id) ?? 0 })),
        noDepartment: noDept,
        employmentTypes: types.map(t => ({ value: t.employmentType, count: t._count._all, canonical: normalizeEmploymentType(t.employmentType) })).sort((a, b) => b.count - a.count),
        canEdit: g.access.isAdmin || g.access.permissions.includes("employees.edit"),
    })
}

// POST { action, ... } — every change to the masters (see the cases below).
export async function POST(req: Request) {
    const g = await guard(req, "employees.edit")
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const a = String(b?.action ?? "")
    const log = (summary: string, after?: unknown) => auditLater({ actorId: g.access.userId, actorName: g.access.name, action: `employee.master_${a}`, targetType: "Setting", targetId: "employeeMasters", targetName: "Employee masters", summary, after, ...requestMeta(req) })
    const master = await getDesignations()
    const bad = (m: string) => NextResponse.json({ error: m }, { status: 400 })

    switch (a) {
        case "addDesignation": {
            const name = String(b?.name ?? "").trim()
            if (!name) return bad("Enter a designation")
            if (matchDesignation(master, name)) return bad(`"${name}" is already in the list (or an alias of one)`)
            const saved = await saveDesignations([...master, { name, departmentId: b?.departmentId || null, aliases: [] }], g.access.userId)
            log(`Designation added: ${name}`); return NextResponse.json({ master: saved })
        }
        case "updateDesignation": {
            const cur = master.find(m => m.name === b?.name)
            if (!cur) return bad("Designation not found")
            const newName = b?.newName !== undefined ? String(b.newName).trim() : cur.name
            if (!newName) return bad("Enter a name")
            const clash = master.find(m => m !== cur && (foldDesignation(m.name) === foldDesignation(newName) || m.aliases.some(x => foldDesignation(x) === foldDesignation(newName))))
            if (clash) return bad(`"${newName}" is already used by ${clash.name}`)
            const next = { ...cur, name: newName, departmentId: b?.departmentId !== undefined ? (b.departmentId || null) : cur.departmentId, aliases: Array.isArray(b?.aliases) ? b.aliases : cur.aliases }
            if (newName !== cur.name) next.aliases = [...next.aliases, cur.name]
            const saved = await saveDesignations(master.map(m => m === cur ? next : m), g.access.userId)
            // A rename carries the employees with it.
            let moved = 0
            if (newName !== cur.name) moved = (await prisma.employee.updateMany({ where: { designation: cur.name }, data: { designation: newName } })).count
            log(`Designation updated: ${cur.name}${newName !== cur.name ? ` → ${newName} (${moved} employees)` : ""}`, next); return NextResponse.json({ master: saved, moved })
        }
        case "deleteDesignation": {
            const saved = await saveDesignations(master.filter(m => m.name !== b?.name), g.access.userId)
            log(`Designation removed from the list: ${b?.name} (employees keep it)`); return NextResponse.json({ master: saved })
        }
        case "merge": {
            const to = String(b?.to ?? "").trim()
            const from: string[] = Array.isArray(b?.from) ? b.from.filter((x: unknown): x is string => typeof x === "string").slice(0, 200) : []
            if (!to || !from.length) return bad("Pick the spellings to merge and the standard name")
            const moved = (await prisma.employee.updateMany({ where: { designation: { in: from.filter(f => f !== to) } }, data: { designation: to } })).count
            // Remember the old spellings so imports and forms map to the standard.
            const entry = master.find(m => m.name === to) ?? { name: to, departmentId: null, aliases: [] }
            const merged = { ...entry, aliases: Array.from(new Set([...entry.aliases, ...from.filter(f => f !== to)])) }
            const saved = await saveDesignations([...master.filter(m => m.name !== to), merged], g.access.userId)
            log(`Merged ${from.length} spelling(s) into "${to}": ${moved} employees`, { from, to }); return NextResponse.json({ master: saved, moved })
        }
        case "applyDepartments": {
            // Each standard designation's default department → its employees (blank ones, or all with overwrite).
            let set = 0
            for (const m of master.filter(x => x.departmentId)) {
                set += (await prisma.employee.updateMany({ where: { ...ACTIVE, designation: { in: [m.name, ...m.aliases] }, ...(b?.overwrite ? {} : { departmentId: null }) }, data: { departmentId: m.departmentId } })).count
            }
            log(`Departments applied from designations: ${set} employees${b?.overwrite ? " (overwrite)" : ""}`); return NextResponse.json({ updated: set })
        }
        case "addDepartment": {
            const name = String(b?.name ?? "").trim().slice(0, 80)
            if (!name) return bad("Enter a department name")
            if (await prisma.department.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) return bad("That department already exists")
            const d = await prisma.department.create({ data: { name, description: b?.description ? String(b.description).slice(0, 200) : null } })
            log(`Department added: ${name}`); return NextResponse.json({ department: d })
        }
        case "updateDepartment": {
            const d = await prisma.department.findUnique({ where: { id: String(b?.id ?? "") } })
            if (!d) return bad("Department not found")
            const data: any = {}
            if (b?.name !== undefined) { const n = String(b.name).trim().slice(0, 80); if (!n) return bad("Enter a name"); data.name = n }
            if (b?.isActive !== undefined) data.isActive = b.isActive === true
            const u = await prisma.department.update({ where: { id: d.id }, data })
            log(`Department updated: ${d.name}`, data); return NextResponse.json({ department: u })
        }
        case "assignDepartment": {
            const departmentId = b?.departmentId ? String(b.departmentId) : null
            if (departmentId && !(await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } }))) return bad("Pick a department")
            const designations: string[] = Array.isArray(b?.designations) ? b.designations : []
            const employeeIds: string[] = Array.isArray(b?.employeeIds) ? b.employeeIds : []
            if (!designations.length && !employeeIds.length) return bad("Pick designations or employees")
            const where: any = { ...ACTIVE, OR: [...(designations.length ? [{ designation: { in: designations } }] : []), ...(employeeIds.length ? [{ id: { in: employeeIds } }] : [])], ...(b?.onlyBlank ? { departmentId: null } : {}) }
            const n = (await prisma.employee.updateMany({ where, data: { departmentId } })).count
            log(`Department assigned to ${n} employees`, { departmentId, designations: designations.length, employeeIds: employeeIds.length }); return NextResponse.json({ updated: n })
        }
        case "normaliseEmploymentTypes": {
            const types = await prisma.employee.groupBy({ by: ["employmentType"], _count: { _all: true } })
            let n = 0
            for (const t of types) {
                const c = normalizeEmploymentType(t.employmentType)
                if (c !== t.employmentType && (EMPLOYMENT_TYPES as readonly string[]).includes(c)) n += (await prisma.employee.updateMany({ where: { employmentType: t.employmentType }, data: { employmentType: c } })).count
            }
            log(`Employment types normalised: ${n} employees`); return NextResponse.json({ updated: n })
        }
    }
    return bad("Unknown action")
}
