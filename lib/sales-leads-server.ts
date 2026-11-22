// Sales leads (prospects) — who sees which, creating with a lead number, cleaning input.
import prisma from "@/lib/prisma"
import type { Access } from "@/lib/access"
import { canSeeTeam, canEditAny } from "@/lib/dialer-server"
import { phoneKey, cleanPhone, STAGES } from "@/lib/dialer"

/** Everyone with dialer.view / dialer.edit sees all leads; others see the ones assigned to or added by them. */
export function leadWhere(a: Access): any {
    return canSeeTeam(a) || canEditAny(a) ? {} : { OR: [{ assignedTo: a.userId }, { createdBy: a.userId }] }
}
export async function canTouch(a: Access, id: string) {
    const l = await prisma.salesLead.findUnique({ where: { id }, select: { assignedTo: true, createdBy: true } })
    if (!l) return null
    return canEditAny(a) || l.assignedTo === a.userId || l.createdBy === a.userId ? l : false
}

const str = (v: unknown, n = 200) => { const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim(); return s ? s.slice(0, n) : null }

export function cleanLead(b: any, partial = false) {
    const out: any = {}
    const set = (k: string, v: unknown) => { if (!partial || k in (b ?? {})) out[k] = v }
    set("company", str(b?.company)); set("contactName", str(b?.contactName, 120)); set("designation", str(b?.designation, 120))
    set("altPhone", str(b?.altPhone, 20) ? cleanPhone(b.altPhone) : null); set("email", str(b?.email, 120)); set("city", str(b?.city, 80))
    set("industry", str(b?.industry, 80)); set("service", str(b?.service, 120)); set("source", str(b?.source, 80)); set("notes", str(b?.notes, 8000))
    set("lostReason", str(b?.lostReason, 300))
    if (!partial || "phone" in (b ?? {})) { const p = cleanPhone(b?.phone); out.phone = p; out.phoneKey = phoneKey(p) }
    if (!partial || "expectedValue" in (b ?? {})) { const n = Number(b?.expectedValue); out.expectedValue = b?.expectedValue === "" || b?.expectedValue == null || !Number.isFinite(n) ? null : n }
    if (!partial || "nextFollowUp" in (b ?? {})) { const d = b?.nextFollowUp ? new Date(b.nextFollowUp) : null; out.nextFollowUp = d && !isNaN(d.getTime()) ? d : null }
    if ("stage" in (b ?? {}) && b.stage in STAGES) out.stage = b.stage
    if ("assignedTo" in (b ?? {})) out.assignedTo = str(b.assignedTo, 60)
    return out
}

export async function nextLeadNo(): Promise<number> {
    const r: { n: number | null }[] = await prisma.$queryRawUnsafe(`SELECT MAX(NULLIF(regexp_replace("leadNo", '\\D', '', 'g'), '')::int) AS n FROM "SalesLead"`)
    return (r[0]?.n ?? 0) + 1
}

export async function createLead(a: Access, b: any) {
    const data = cleanLead(b)
    if (!data.contactName && data.company) data.contactName = data.company
    if (!data.contactName) throw new Error("Enter the contact name")
    if (data.phoneKey.length < 6) throw new Error("Enter a valid phone number")
    // Leads added by a caller stay with them unless someone who manages leads assigns them.
    data.assignedTo = canEditAny(a) ? (data.assignedTo ?? a.userId) : a.userId
    let no = await nextLeadNo()
    for (let tries = 0; tries < 5; tries++) {
        try { return await prisma.salesLead.create({ data: { ...data, leadNo: `SL-${String(no).padStart(5, "0")}`, createdBy: a.userId } }) }
        catch (e: any) { if (e?.code === "P2002") { no = await nextLeadNo(); continue } throw e }
    }
    throw new Error("Could not number the lead — try again")
}
