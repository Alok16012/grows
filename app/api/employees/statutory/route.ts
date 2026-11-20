import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { randomUUID } from "crypto"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { checkAccess } from "@/lib/permissions"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { audit, requestMetaOf } from "@/lib/access-audit"
import { parseStatutory, statutoryFlagsFor, DEFAULT_STATUTORY, STATUTORY_MISSING_MESSAGE } from "@/lib/employee-statutory"

export const dynamic = "force-dynamic"

// Bulk PF / PF Pension (EPS) / ESIC applicability — Payroll → Compliance →
// Statutory Applicability. Same switches as Employee Master → Basic Info, for
// many people at once. They apply the next time payroll is processed; locked
// months are never recalculated.

// GET — active employees with their switches and current site.
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.view")) {
        return NextResponse.json({ error: "You need Employees (view) to see this." }, { status: 403 })
    }
    try {
        const employees = await prisma.employee.findMany({
            where: { status: { in: ["ACTIVE", "ON_LEAVE", "ONBOARDING"] } },
            select: {
                id: true, employeeId: true, firstName: true, lastName: true, designation: true,
                deployments: { where: { isActive: true }, select: { site: { select: { id: true, name: true } } }, take: 1 },
                employeeSalary: { select: { complianceType: true } },
            },
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        })
        let installed = true
        let flags = new Map<string, typeof DEFAULT_STATUTORY>()
        try {
            await prisma.employeeStatutory.count()
            flags = await statutoryFlagsFor(employees.map(e => e.id))
        } catch (e) {
            if (!isMissingTableErr(e)) throw e
            installed = false
        }
        return NextResponse.json({
            installed,
            employees: employees.map(e => ({
                id: e.id, employeeId: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(),
                designation: e.designation, site: e.deployments[0]?.site ?? null,
                compliance: e.employeeSalary?.complianceType ?? "OR",
                ...(flags.get(e.id) ?? DEFAULT_STATUTORY),
            })),
        })
    } catch (e) {
        console.error("[STATUTORY_LIST]", e)
        return NextResponse.json({ error: "Could not load employees." }, { status: 500 })
    }
}

// POST { employeeIds: string[], pfApplicable?, pensionApplicable?, esicApplicable? }
// Sets the given switches for every listed employee. Turning PF off turns
// pension off too; pension can only be turned on for people who have PF.
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.edit")) {
        return NextResponse.json({ error: "You need Employees (edit) to change these." }, { status: 403 })
    }
    try {
        const body = await req.json().catch(() => ({}))
        const ids: string[] = Array.from(new Set((Array.isArray(body?.employeeIds) ? body.employeeIds : []).filter((x: unknown): x is string => typeof x === "string")))
        if (!ids.length) return NextResponse.json({ error: "Select at least one employee." }, { status: 400 })
        if (ids.length > 2000) return NextResponse.json({ error: "At most 2,000 employees at a time." }, { status: 400 })
        const patch = parseStatutory(body)
        if (!Object.keys(patch).length) return NextResponse.json({ error: "Choose what to change." }, { status: 400 })

        const valid = (await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(e => e.id)
        const before = await statutoryFlagsFor(valid)
        const batchId = randomUUID()
        const userId = session.user.id ?? null
        let skippedPension = 0

        await prisma.$transaction(async tx => {
            // Rows for anyone who has none yet (defaults = all applicable).
            await tx.employeeStatutory.createMany({
                data: valid.filter(id => !before.has(id)).map(employeeId => ({ employeeId, ...DEFAULT_STATUTORY, updatedBy: userId })),
                skipDuplicates: true,
            })
            const { pensionApplicable, ...rest } = patch
            if (Object.keys(rest).length) {
                await tx.employeeStatutory.updateMany({ where: { employeeId: { in: valid } }, data: { ...rest, updatedBy: userId } })
            }
            if (pensionApplicable !== undefined) {
                // EPS is part of PF: only people with PF can have pension switched on.
                const where = pensionApplicable ? { employeeId: { in: valid }, pfApplicable: true } : { employeeId: { in: valid } }
                const res = await tx.employeeStatutory.updateMany({ where, data: { pensionApplicable, updatedBy: userId } })
                skippedPension = valid.length - res.count
            }
            await audit(tx, {
                actorId: userId, actorName: session.user.name ?? null, action: "employee.statutory.bulk", targetType: "Employee",
                summary: `PF/pension/ESIC switches set for ${valid.length} employee(s): ${Object.entries(patch).map(([k, v]) => `${k.replace("Applicable", "")} ${v ? "on" : "off"}`).join(", ")}`,
                after: { employees: valid.length, ...patch }, batchId, ...requestMetaOf(req),
            })
        }, { timeout: 30_000 })

        return NextResponse.json({ ok: true, updated: valid.length, skippedPension })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ error: STATUTORY_MISSING_MESSAGE, code: "NOT_SET_UP" }, { status: 503 })
        console.error("[STATUTORY_BULK]", e)
        return NextResponse.json({ error: "Could not save the changes." }, { status: 500 })
    }
}
