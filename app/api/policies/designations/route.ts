import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { policyErrorResponse } from "@/lib/policy-signoff"
import { designationKey } from "@/lib/policy-text"
import { adminCtx } from "@/lib/policy-admin"

// GET — designations in use (from employee records and existing mappings),
// with how many staff hold each. Designation is free text on the employee, so
// variants that differ only in case or spacing are merged.
export async function GET(req: Request) {
    try {
        await adminCtx(req)
        const [emps, mapped] = await Promise.all([
            prisma.employee.groupBy({
                by: ["designation"],
                where: { designation: { not: null }, status: { in: ["ONBOARDING", "ACTIVE", "ON_LEAVE"] } },
                _count: { _all: true },
            }),
            prisma.signoffPolicyDesignation.findMany({ select: { designationKey: true, designation: true }, distinct: ["designationKey"] }),
        ])
        const byKey = new Map<string, { designation: string; employees: number; best: number }>()
        for (const g of emps) {
            const k = designationKey(g.designation)
            if (!k) continue
            const cur = byKey.get(k)
            const n = g._count._all
            if (!cur) byKey.set(k, { designation: g.designation!.trim().replace(/\s+/g, " "), employees: n, best: n })
            else {
                cur.employees += n
                // Show the spelling most people have.
                if (n > cur.best) { cur.best = n; cur.designation = g.designation!.trim().replace(/\s+/g, " ") }
            }
        }
        for (const m of mapped) if (!byKey.has(m.designationKey)) byKey.set(m.designationKey, { designation: m.designation, employees: 0, best: 0 })
        const designations = Array.from(byKey.values())
            .map(({ designation, employees }) => ({ designation, employees }))
            .sort((a, b) => a.designation.localeCompare(b.designation))
        return NextResponse.json({ designations })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_DESIGNATIONS_GET]")
    }
}
