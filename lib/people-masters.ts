// People → Masters: the standard designations (with aliases and a default
// department). Client-safe types and helpers; storage in people-masters-server.

export type DesignationEntry = { name: string; departmentId: string | null; aliases: string[] }

/** Comparable form of a designation: case, spaces and punctuation don't matter. */
export const foldDesignation = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")

export function sanitizeDesignations(v: unknown): DesignationEntry[] {
    if (!Array.isArray(v)) return []
    const out: DesignationEntry[] = []
    for (const r of v.slice(0, 1000)) {
        const name = typeof r?.name === "string" ? r.name.trim().replace(/\s+/g, " ").slice(0, 80) : ""
        if (!name || out.some(o => foldDesignation(o.name) === foldDesignation(name))) continue
        const aliases = Array.isArray(r?.aliases) ? Array.from(new Set(r.aliases.filter((a: unknown): a is string => typeof a === "string" && !!a.trim()).map((a: string) => a.trim().slice(0, 80)))) as string[] : []
        out.push({ name, departmentId: typeof r?.departmentId === "string" && r.departmentId ? r.departmentId : null, aliases: aliases.filter(a => foldDesignation(a) !== foldDesignation(name)) })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** The standard name a raw designation maps to, or null when the master doesn't know it. */
export function matchDesignation(master: DesignationEntry[], raw: string | null | undefined): DesignationEntry | null {
    const k = foldDesignation(raw)
    if (!k) return null
    return master.find(m => foldDesignation(m.name) === k || m.aliases.some(a => foldDesignation(a) === k)) ?? null
}
