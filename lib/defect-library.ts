import prisma from "@/lib/prisma"

// Central defect library (Quality → Defect library). Project defect columns
// keep their own labels; each can be linked to one library defect so Pareto
// and severity work across all customers. Linking never changes or deletes a
// column or any recorded answer.

export const SEVERITIES = ["CRITICAL", "MAJOR", "MINOR"] as const
export type Severity = (typeof SEVERITIES)[number]
export const SUGGESTED_CATEGORIES = ["Welding", "Surface", "Dimension", "Assembly", "Paint / Coating", "Material", "Marking / Label", "Packing", "Other"]

/** Display form of a label: trimmed, single spaces, upper case. */
export const normLabel = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase()

/**
 * Matching key: letters and digits only, with a plural "S" dropped, so
 * "SCRATCH MARK", "Scratch-Marks" and "SCRATCH  MARKS" all match.
 */
export function defectKey(s: string): string {
    let k = s.toUpperCase().replace(/&/g, "AND").replace(/[^A-Z0-9]/g, "")
    if (k.length > 4 && k.endsWith("S") && !k.endsWith("SS")) k = k.slice(0, -1)
    return k
}

/** Next free code: D-001, D-002 … */
export async function nextDefectCode(): Promise<string> {
    const rows = await prisma.defectType.findMany({ select: { code: true } })
    const max = rows.reduce((m, r) => { const n = Number(/^D-(\d+)$/.exec(r.code)?.[1]); return Number.isFinite(n) && n > m ? n : m }, 0)
    return `D-${String(max + 1).padStart(3, "0")}`
}

/** key → library defect id, from every active defect's name and aliases. */
export async function libraryIndex(): Promise<Map<string, string>> {
    const lib = await prisma.defectType.findMany({ where: { isActive: true }, select: { id: true, name: true, aliases: true } })
    const idx = new Map<string, string>()
    for (const d of lib) for (const a of [d.name, ...d.aliases]) { const k = defectKey(a); if (k && !idx.has(k)) idx.set(k, d.id) }
    return idx
}

/**
 * Link unlinked DEFECT columns whose label matches a library defect's name or
 * an alias. Optionally only one project. Returns how many were linked.
 * Never throws (called after form-builder saves).
 */
export async function autoLinkDefects(projectId?: string): Promise<number> {
    try {
        const idx = await libraryIndex()
        if (!idx.size) return 0
        const fields = await prisma.formTemplate.findMany({
            where: { category: "DEFECT", defectTypeId: null, ...(projectId ? { projectId } : {}) },
            select: { id: true, fieldLabel: true },
        })
        const byDefect = new Map<string, string[]>()
        for (const f of fields) {
            const id = idx.get(defectKey(f.fieldLabel))
            if (id) byDefect.set(id, [...(byDefect.get(id) ?? []), f.id])
        }
        let n = 0
        for (const [defectTypeId, ids] of Array.from(byDefect)) {
            const r = await prisma.formTemplate.updateMany({ where: { id: { in: ids }, defectTypeId: null }, data: { defectTypeId } })
            n += r.count
        }
        return n
    } catch (e) {
        console.error("[DEFECT_AUTOLINK]", e)
        return 0
    }
}

export const QUALITY_VIEW = ["reports.view", "approvals.view", "projects.view"]
export const QUALITY_MANAGE = ["projects.manage", "approvals.manage"]
export const canManageQuality = (a: { isAdmin: boolean; permissions: string[] }) => a.isAdmin || QUALITY_MANAGE.some(p => a.permissions.includes(p))

/** Shared validation for create / edit. */
export function parseDefect(b: any, partial: boolean) {
    const out: { name?: string; severity?: string; category?: string | null; description?: string | null; photoUrl?: string | null; aliases?: string[]; isActive?: boolean } = {}
    if (!partial || b?.name !== undefined) {
        const name = normLabel(String(b?.name ?? "")).slice(0, 120)
        if (name.length < 2) throw new Error("Give the defect a name")
        out.name = name
    }
    if (!partial || b?.severity !== undefined) {
        const sev = String(b?.severity ?? "MINOR").toUpperCase()
        if (!(SEVERITIES as readonly string[]).includes(sev)) throw new Error("Severity must be critical, major or minor")
        out.severity = sev
    }
    if (b?.category !== undefined) out.category = String(b.category ?? "").trim().slice(0, 60) || null
    if (b?.description !== undefined) out.description = String(b.description ?? "").trim().slice(0, 1000) || null
    if (b?.photoUrl !== undefined) {
        const u = String(b.photoUrl ?? "").trim()
        if (u && !/^https?:\/\//.test(u)) throw new Error("Photo must be an uploaded image link")
        out.photoUrl = u.slice(0, 1000) || null
    }
    if (b?.aliases !== undefined) {
        out.aliases = Array.from(new Set((Array.isArray(b.aliases) ? b.aliases : []).map((a: unknown) => normLabel(String(a ?? ""))).filter((a: string) => a.length >= 2))).slice(0, 200) as string[]
    }
    if (b?.isActive !== undefined) out.isActive = !!b.isActive
    return out
}

/** Another active defect already uses this name / alias? */
export async function clashWith(names: string[], exceptId?: string): Promise<string | null> {
    const keys = new Set(names.map(defectKey))
    const others = await prisma.defectType.findMany({ where: { isActive: true, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { code: true, name: true, aliases: true } })
    for (const o of others) for (const a of [o.name, ...o.aliases]) if (keys.has(defectKey(a))) return `${o.code} ${o.name}`
    return null
}

