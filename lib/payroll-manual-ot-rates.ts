// Manual OT rates per employee — always first:
//   1. a manual rate (typed in Salary Master, uploaded, or set in the Employee
//      OT window) is the OT rate per hour, whatever the site's rule;
//   2. no manual rate → the site's OT rule from Calculation Settings.
// Kept in AppSetting "payrollManualOtRates" as { employeeId: ₹ per hour },
// not in the dated Calculation Settings, so it applies at once and a later
// settings save can't wipe it. Server-only.
import prisma from "@/lib/prisma"

const KEY = "payrollManualOtRates"

export async function loadManualOtRates(): Promise<Record<string, number>> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        const v = row?.value ? JSON.parse(row.value) : {}
        const out: Record<string, number> = {}
        for (const [id, r] of Object.entries(v && typeof v === "object" ? v : {})) {
            const n = Number(r)
            if (id && Number.isFinite(n) && n > 0) out[id] = n
        }
        return out
    } catch { return {} }
}

/** Sets (₹ > 0) or clears (null / 0 / blank) manual rates. Returns how many changed. */
export async function setManualOtRates(changes: Record<string, unknown>, userId: string): Promise<number> {
    const cur = await loadManualOtRates()
    let n = 0
    for (const [id, raw] of Object.entries(changes).slice(0, 20000)) {
        if (!id || id.length > 64) continue
        const v = raw === null || raw === undefined || raw === "" ? 0 : Number(raw)
        if (!Number.isFinite(v) || v < 0 || v > 100000) continue
        const r = Math.round(v * 100) / 100
        if (r > 0) { if (cur[id] !== r) { cur[id] = r; n++ } }
        else if (id in cur) { delete cur[id]; n++ }
    }
    if (n) {
        const value = JSON.stringify(cur)
        await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
    }
    return n
}
