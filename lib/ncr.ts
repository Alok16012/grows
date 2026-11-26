import prisma from "@/lib/prisma"
import { reportFigures } from "@/lib/inspection-customers"
import { withSnapshot } from "@/lib/form-version"
import { canManageQuality } from "@/lib/defect-library"

// Non-conformance reports + CAPA in the 8D format (Quality → NCR / 8D).

export const NCR_STATUSES = ["OPEN", "CONTAINMENT", "ROOT_CAUSE", "ACTION", "VERIFICATION", "CLOSED", "CANCELLED"] as const
export type NcrStatus = (typeof NCR_STATUSES)[number]
export const NCR_STATUS_LABEL: Record<NcrStatus, string> = {
    OPEN: "Open", CONTAINMENT: "Containment (D3)", ROOT_CAUSE: "Root cause (D4)", ACTION: "Corrective action (D5–D6)",
    VERIFICATION: "Verification (D7)", CLOSED: "Closed", CANCELLED: "Cancelled",
}
export const isOpenStatus = (s: string) => s !== "CLOSED" && s !== "CANCELLED"

/** NCR-2026-0001 — numbered per calendar year. */
export async function nextNcrCode(now = new Date()): Promise<string> {
    const y = now.getFullYear()
    const rows = await prisma.ncr.findMany({ where: { code: { startsWith: `NCR-${y}-` } }, select: { code: true } })
    const max = rows.reduce((m, r) => { const n = Number(r.code.split("-")[2]); return Number.isFinite(n) && n > m ? n : m }, 0)
    return `NCR-${y}-${String(max + 1).padStart(4, "0")}`
}

/** Create with a fresh code, retrying if two are opened at the same moment. */
export async function createNcr(data: Omit<Parameters<typeof prisma.ncr.create>[0]["data"], "code">) {
    for (let i = 0; i < 4; i++) {
        try { return await prisma.ncr.create({ data: { ...(data as any), code: await nextNcrCode() } }) }
        catch (e: any) { if (e?.code !== "P2002") throw e }
    }
    throw new Error("Could not number the NCR — try again")
}

/** The owner and HR/quality managers may edit; everyone with Quality access may read. */
export function canEditNcr(access: { userId: string; isAdmin: boolean; permissions: string[] }, ncr: { ownerUserId: string | null }) {
    return canManageQuality(access) || (!!ncr.ownerUserId && ncr.ownerUserId === access.userId)
}

/** Facts from an inspection to start an NCR: part, lot, quantities, worst defects. */
export async function inspectionFacts(inspectionId: string) {
    const i = await prisma.inspection.findUnique({
        where: { id: inspectionId },
        select: {
            id: true, submittedAt: true, approvedBy: true, formSnapshot: true,
            assignment: { select: { project: { select: { id: true, name: true } } } },
            responses: { select: { fieldId: true, value: true, field: { select: { fieldLabel: true, category: true, reportRole: true, defectTypeId: true } } } },
        },
    })
    if (!i) return null
    const responses = withSnapshot(i.responses, i.formSnapshot)
    const f = reportFigures(responses as any)
    const lot = responses.find(r => r.field?.reportRole === "LOT_NUMBER" && r.value)?.value ?? null
    // Library defects found on the report, with severity.
    const found = responses.filter(r => r.field?.category === "DEFECT" && r.field.defectTypeId && Number(r.value) > 0)
    const lib = found.length ? await prisma.defectType.findMany({ where: { id: { in: found.map(r => r.field!.defectTypeId!) } }, select: { id: true, name: true, severity: true } }) : []
    const libOf = new Map(lib.map(d => [d.id, d]))
    const defects = found.map(r => ({ id: r.field!.defectTypeId!, name: libOf.get(r.field!.defectTypeId!)?.name ?? r.field!.fieldLabel, severity: libOf.get(r.field!.defectTypeId!)?.severity ?? "MINOR", qty: Number(r.value) }))
        .sort((a, b) => b.qty - a.qty)
    return { inspection: i, figures: f, lot, defects, project: i.assignment.project }
}

/**
 * After an inspection is approved: open an NCR when it crosses a limit in
 * Approvals → Settings (rejection % / pieces, or any CRITICAL library defect).
 * Once per inspection. Never throws. Returns the NCR id when one was opened.
 */
export async function maybeOpenNcr(
    inspectionId: string,
    limits: { rejectedPct: number; rejectedQty: number; onCritical: boolean; dueDays: number },
    approverId: string,
): Promise<string | null> {
    try {
        if (await prisma.ncr.count({ where: { inspectionId, source: { startsWith: "AUTO" } } })) return null
        const facts = await inspectionFacts(inspectionId)
        if (!facts) return null
        const { figures: f, defects, project, lot } = facts
        const pct = f.inspected > 0 ? (f.rejected / f.inspected) * 100 : 0
        const critical = limits.onCritical ? defects.filter(d => d.severity === "CRITICAL") : []
        const byRate = (limits.rejectedPct > 0 && f.rejected > 0 && pct >= limits.rejectedPct) || (limits.rejectedQty > 0 && f.rejected >= limits.rejectedQty)
        if (!critical.length && !byRate) return null

        const n = (x: number) => x.toLocaleString("en-IN")
        const part = f.part ? ` — ${f.part}` : ""
        const title = critical.length
            ? `Critical defect: ${critical[0].name}${part}`
            : `Rejection ${pct.toFixed(1)}% (${n(f.rejected)} pcs)${part}`
        const top = defects.slice(0, 5).map(d => `${d.name} ${n(d.qty)}`).join(", ")
        const problem = `${project.name}: ${n(f.inspected)} inspected, ${n(f.rework)} rework, ${n(f.rejected)} rejected (${pct.toFixed(2)}%).${lot ? ` Lot ${lot}.` : ""}${top ? ` Defects: ${top}.` : ""}`
        const ncr = await createNcr({
            title: title.slice(0, 200), source: critical.length ? "AUTO_CRITICAL" : "AUTO_REJECTION", status: "OPEN",
            severity: critical.length ? "CRITICAL" : "MAJOR",
            inspectionId, projectId: project.id, defectTypeId: (critical[0] ?? defects[0])?.id ?? null,
            partName: f.part || null, lotNumber: lot, qtyInspected: Math.round(f.inspected) || null, qtyAffected: Math.round(f.rejected + f.rework) || null,
            ownerUserId: approverId, dueDate: new Date(Date.now() + limits.dueDays * 86_400_000),
            d2Problem: problem, createdBy: approverId,
        })
        await prisma.ncrEvent.create({ data: { ncrId: ncr.id, userId: approverId, action: "CREATED", note: "Opened automatically on approval (Approvals → Settings)" } })
        await prisma.notification.create({
            data: { userId: approverId, type: "quality", title: `${ncr.code} opened`, message: `${title}. You own it — fill the 8D steps by ${ncr.dueDate!.toLocaleDateString("en-GB")}.`, link: `/quality/ncr/${ncr.id}` },
        }).catch(() => {})
        return ncr.id
    } catch (e) {
        console.error("[NCR_AUTO_OPEN]", e)
        return null
    }
}
