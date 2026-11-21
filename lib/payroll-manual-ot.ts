// "Manual OT — monthly amount per employee" (Calculation Settings → OT Rule by
// Site). The ₹ OT typed or uploaded for each employee, per payroll month.
// Kept in AppSetting "payrollManualOtAmounts" as { "2026-11": { employeeId: ₹ } }.
// Used only for sites whose OT rule is that manual option; anyone without an
// amount for the month gets OT days × their own rate, as before.
import prisma from "@/lib/prisma"

const KEY = "payrollManualOtAmounts"
type YM = { month: number; year: number }
type Store = Record<string, Record<string, number>>

export const manualOtKey = (p: YM) => `${p.year}-${String(p.month).padStart(2, "0")}`

export async function loadManualOt(): Promise<Store> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        const v = row?.value ? JSON.parse(row.value) : {}
        return v && typeof v === "object" ? v : {}
    } catch { return {} }
}

/** (employeeId, month) → the manual OT amount, or null when none was entered. */
export async function manualOtResolver(): Promise<(employeeId: string, p: YM) => number | null> {
    const store = await loadManualOt()
    return (id, p) => {
        const v = store[manualOtKey(p)]?.[id]
        return typeof v === "number" && Number.isFinite(v) ? v : null
    }
}

/** Saves amounts for one month (null / blank removes). Returns how many were set or removed. */
export async function saveManualOtAmounts(p: YM, amounts: Record<string, unknown>, userId: string): Promise<number> {
    const store = await loadManualOt()
    const k = manualOtKey(p)
    const month = { ...(store[k] ?? {}) }
    let n = 0
    for (const [id, raw] of Object.entries(amounts).slice(0, 5000)) {
        if (!id || id.length > 64) continue
        const v = raw === null || raw === "" || raw === undefined ? null : Number(raw)
        if (v === null) { if (id in month) { delete month[id]; n++ } continue }
        if (!Number.isFinite(v) || v < 0 || v > 10_000_000) continue
        month[id] = Math.round(v * 100) / 100
        n++
    }
    if (Object.keys(month).length) store[k] = month; else delete store[k]
    const value = JSON.stringify(store)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
    return n
}
