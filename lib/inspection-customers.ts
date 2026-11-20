import prisma from "@/lib/prisma"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { waPhone } from "@/lib/whatsapp"
import { extractInspectionDimensions } from "@/lib/inspection-fields"
import type { Recipient } from "@/lib/comm/engine"

// Who at a customer (site) receives inspection reports, alerts and summaries:
// its active contacts set to receive reports (all projects, or this project),
// plus the contact person saved on the Site itself.
export async function siteCustomerRecipients(siteId: string, projectId?: string | null): Promise<Recipient[]> {
    const [site, contacts] = await Promise.all([
        prisma.site.findUnique({ where: { id: siteId }, select: { id: true, contactPerson: true, contactPhone: true } }),
        prisma.customerContact.findMany({ where: { siteId, active: true, receiveReports: true } })
            .catch(e => { if (isMissingTableErr(e)) return []; throw e }),
    ])
    const list: Recipient[] = contacts
        .filter(c => !projectId || c.projectIds.length === 0 || c.projectIds.includes(projectId))
        .map(c => ({ type: "customer" as const, id: c.id, name: c.name, phone: c.phone, email: c.email }))
    const sitePhone = site?.contactPhone ? waPhone(site.contactPhone) : null
    if (site?.contactPerson && sitePhone && !list.some(r => r.phone && waPhone(r.phone) === sitePhone)) {
        list.push({ type: "customer", id: `site:${site.id}`, name: site.contactPerson, phone: site.contactPhone, email: null })
    }
    return list
}

type Answer = { value: string | null; field: { fieldLabel: string; category: string | null; reportRole: string | null } }

/** Inspected / rework / rejected / accepted and the defects found on one report. */
export function reportFigures(responses: Answer[]) {
    const d = extractInspectionDimensions(responses)
    const defects = responses
        .filter(r => r.field.category === "DEFECT")
        .map(r => ({ name: r.field.fieldLabel, qty: Number(r.value) || 0 }))
        .filter(x => x.qty > 0)
    return { inspected: d.inspected, rework: d.rework, rejected: d.rejected, accepted: d.accepted, part: d.partName ?? d.partNumber ?? "", defects }
}

/**
 * After a report is approved: if it crosses a limit in Approvals → Settings,
 * send the customer the rework / rejection alert (Communication Center event
 * "inspection_rework" — goes on whichever channels are switched on there).
 * Once per report. Never throws.
 */
export async function maybeSendReworkAlert(inspectionId: string, limits: { rejectedPct: number; rejectedQty: number; reworkPct: number }, createdBy: string | null): Promise<boolean> {
    try {
        const { commNotify } = await import("@/lib/comm/recipients")
        const i = await prisma.inspection.findUnique({
            where: { id: inspectionId },
            select: {
                submittedAt: true, approvedAt: true,
                assignment: { select: { project: { select: { id: true, name: true, siteId: true } } } },
                responses: { select: { value: true, field: { select: { fieldLabel: true, category: true, reportRole: true } } } },
            },
        })
        const proj = i?.assignment.project
        if (!i || !proj?.siteId) return false
        const f = reportFigures(i.responses)
        const pct = (x: number) => (f.inspected > 0 ? (x / f.inspected) * 100 : 0)
        const hit = (limits.rejectedPct > 0 && f.rejected > 0 && pct(f.rejected) >= limits.rejectedPct)
            || (limits.rejectedQty > 0 && f.rejected >= limits.rejectedQty)
            || (limits.reworkPct > 0 && f.rework > 0 && pct(f.rework) >= limits.reworkPct)
        if (!hit) return false
        try {
            if (await prisma.commMessage.count({ where: { event: "inspection_rework", refType: "Inspection", refId: inspectionId } })) return false
        } catch (e) { if (!isMissingTableErr(e)) throw e }
        const recipients = await siteCustomerRecipients(proj.siteId, proj.id)
        if (!recipients.length) return false
        const date = (i.submittedAt ?? i.approvedAt ?? new Date()).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
        const top = f.defects.sort((a, b) => b.qty - a.qty).slice(0, 3).map(d => `${d.name} ${d.qty}`).join(", ")
        const n = (x: number) => x.toLocaleString("en-IN")
        const summary = `${n(f.rework)} rework, ${n(f.rejected)} rejected of ${n(f.inspected)} inspected${f.part ? ` (${f.part})` : ""}${top ? ` — ${top}` : ""}`
        await commNotify("inspection_rework", recipients, { project: proj.name, date, summary }, { refType: "Inspection", refId: inspectionId, createdBy })
        return true
    } catch (e) {
        console.error("[REWORK_ALERT]", e)
        return false
    }
}
