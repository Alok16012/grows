import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope } from "@/lib/access"
import { canReportPolicies } from "@/lib/permissions"
import { policyErrorResponse, PolicyError, signoffReady } from "@/lib/policy-signoff"
import { minValidVersion } from "@/lib/policy-admin"
import { designationKey } from "@/lib/policy-text"

// GET — every employee's policy sign-offs in one call, for the Policies column
// on Employee Documents. Same rules as GET /api/policies/employee/[employeeId]
// (active, signature-required policies for the designation; an older signature
// counts unless a later version asked to re-sign), without the policy text.
// Needs Employee Documents access plus the Policies report permission, and
// covers only the employees in the caller's data scope.
//
// { ready, employees: { [employee.id]: { title, versionNo, signed, ackId, signedAt }[] } }
// An employee with no applicable policy is left out.
export async function GET(req: Request) {
    try {
        const g = await guard(req, "documents.view")
        if (g instanceof NextResponse) return g
        if (!canReportPolicies(g.session)) throw new PolicyError(403, "FORBIDDEN", "Forbidden")
        if (!(await signoffReady())) return NextResponse.json({ ready: false, employees: {} })

        const scope = await employeeScope(g.access)
        const [policies, employees] = await Promise.all([
            prisma.signoffPolicy.findMany({
                where: { status: "ACTIVE", requiresSignature: true, currentVersionId: { not: null } },
                select: {
                    id: true, appliesToAll: true, currentVersionId: true,
                    designations: { select: { designationKey: true } },
                    versions: { select: { id: true, versionNo: true, requireResign: true, title: true } },
                },
                orderBy: [{ title: "asc" }],
            }),
            prisma.employee.findMany({ where: scope ?? {}, select: { id: true, designation: true } }),
        ])
        const live = policies.flatMap(p => {
            const current = p.versions.find(v => v.id === p.currentVersionId)
            if (!current) return []
            return [{
                id: p.id, appliesToAll: p.appliesToAll, keys: new Set(p.designations.map(d => d.designationKey)),
                title: current.title, versionNo: current.versionNo, min: minValidVersion(p.versions, current.versionNo),
            }]
        })
        if (!live.length) return NextResponse.json({ ready: true, employees: {} })

        const ids = new Set(employees.map(e => e.id))
        const acks = await prisma.signoffAck.findMany({
            where: { signedAt: { not: null }, version: { policyId: { in: live.map(p => p.id) } } },
            select: { id: true, employeeId: true, signedAt: true, version: { select: { policyId: true, versionNo: true } } },
        })
        // Newest valid signature per employee and policy.
        const best = new Map<string, (typeof acks)[number]>()
        for (const a of acks) {
            if (!ids.has(a.employeeId)) continue
            const p = live.find(x => x.id === a.version.policyId)
            if (!p || a.version.versionNo < p.min) continue
            const k = `${a.employeeId}|${p.id}`
            const prev = best.get(k)
            if (!prev || a.version.versionNo > prev.version.versionNo) best.set(k, a)
        }

        const out: Record<string, { title: string; versionNo: number; signed: boolean; ackId: string | null; signedAt: string | null }[]> = {}
        for (const e of employees) {
            const key = designationKey(e.designation)
            const mine = live.filter(p => p.appliesToAll || (key && p.keys.has(key)))
            if (!mine.length) continue
            out[e.id] = mine.map(p => {
                const a = best.get(`${e.id}|${p.id}`)
                return { title: p.title, versionNo: p.versionNo, signed: !!a, ackId: a?.id ?? null, signedAt: a?.signedAt?.toISOString() ?? null }
            })
        }
        return NextResponse.json({ ready: true, employees: out })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_EMPLOYEE_STATUS_ALL]")
    }
}
