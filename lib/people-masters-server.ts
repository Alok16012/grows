import prisma from "@/lib/prisma"
import { matchDesignation, sanitizeDesignations, type DesignationEntry } from "@/lib/people-masters"

const KEY = "designationMaster"

export async function getDesignations(): Promise<DesignationEntry[]> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        return sanitizeDesignations(row?.value ? JSON.parse(row.value) : [])
    } catch { return [] }
}

export async function saveDesignations(list: unknown, userId: string): Promise<DesignationEntry[]> {
    const clean = sanitizeDesignations(list)
    const value = JSON.stringify(clean)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
    return clean
}

/**
 * The standard spelling of a designation when the master knows it ("quality
 * inspector " → "Quality Inspector"); anything else is kept as typed (trimmed),
 * so an empty master changes nothing. Used by the employee form and imports.
 */
export async function standardDesignation(raw: string | null | undefined, cached?: DesignationEntry[]): Promise<string | null> {
    if (raw === null || raw === undefined) return raw ?? null
    const t = String(raw).trim().replace(/\s+/g, " ")
    if (!t) return t
    const m = matchDesignation(cached ?? await getDesignations(), t)
    return m ? m.name : t
}
