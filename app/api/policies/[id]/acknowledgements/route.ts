import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { policyErrorResponse, PolicyError } from "@/lib/policy-signoff"
import { adminCtx, requireReport, employeesInScope, minValidVersion } from "@/lib/policy-admin"

const csvCell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v)
    // Neutralise spreadsheet formulas as well as quoting.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

// GET ?format=csv — who signed which version (with evidence) and who is still pending.
export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const ctx = await adminCtx(req)
        requireReport(ctx)
        const p = await prisma.signoffPolicy.findUnique({
            where: { id: params.id },
            include: { designations: { select: { designationKey: true } }, versions: { select: { id: true, versionNo: true, requireResign: true, contentHash: true } } },
        })
        if (!p) throw new PolicyError(404, "NOT_FOUND", "Policy not found")
        const current = p.versions.find(v => v.id === p.currentVersionId)
        const min = current ? minValidVersion(p.versions, current.versionNo) : 1
        const [acks, scope] = await Promise.all([
            prisma.signoffAck.findMany({
                where: { signedAt: { not: null }, version: { policyId: p.id } },
                include: {
                    employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true, status: true } },
                    version: { select: { versionNo: true, contentHash: true } },
                },
                orderBy: { signedAt: "desc" },
            }),
            p.status === "ACTIVE" ? employeesInScope(p) : Promise.resolve([]),
        ])
        const signed = acks.map(a => ({
            ackId: a.id,
            employee: a.employee,
            versionNo: a.version.versionNo,
            contentHash: a.version.contentHash,
            valid: a.version.versionNo >= min,
            signedAt: a.signedAt,
            scrolledAt: a.scrolledAt,
            typedName: a.typedName,
            signatureType: a.signatureType,
            ipAddress: a.ipAddress,
            channel: a.channel,
        }))
        const validIds = new Set(signed.filter(s => s.valid).map(s => s.employee.id))
        const pending = scope.filter(e => !validIds.has(e.id)).map(({ userId: _u, ...e }) => e)

        if (new URL(req.url).searchParams.get("format") === "csv") {
            const header = ["Status", "Employee ID", "Name", "Designation", "Employee status", "Version", "Valid for current", "Signed at (UTC)", "Read to end at (UTC)", "Typed name", "Signature", "IP address", "Channel", "Content SHA-256"]
            const rows = [
                ...signed.map(s => ["Signed", s.employee.employeeId, `${s.employee.firstName} ${s.employee.lastName}`, s.employee.designation, s.employee.status, `v${s.versionNo}`, s.valid ? "Yes" : "No — re-sign needed", s.signedAt?.toISOString(), s.scrolledAt?.toISOString(), s.typedName, s.signatureType, s.ipAddress, s.channel, s.contentHash]),
                ...pending.map(e => ["Pending", e.employeeId, `${e.firstName} ${e.lastName}`, e.designation, e.status, "", "", "", "", "", "", "", "", ""]),
            ]
            const csv = [header, ...rows].map(r => r.map(csvCell).join(",")).join("\n")
            const name = p.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "policy"
            return new NextResponse(csv, {
                headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="signoffs-${name}.csv"` },
            })
        }
        return NextResponse.json({ currentVersionNo: current?.versionNo ?? null, minValidVersionNo: min, signed, pending })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_ACKS]")
    }
}
