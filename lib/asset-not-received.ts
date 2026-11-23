// Employees saying an issued asset never reached them ("Not received" on the
// Dashboard). Kept in AppSetting "assetNotReceived" as { issueId: claim } —
// the AssetIssue table can't take new columns (owned by another DB role).
// A claim is cleared when receipt is later confirmed. Server-only.
import prisma from "@/lib/prisma"

const KEY = "assetNotReceived"
export type NotReceivedClaim = { at: string; byUserId: string; note: string | null }

export async function loadNotReceived(): Promise<Record<string, NotReceivedClaim>> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        const v = row?.value ? JSON.parse(row.value) : {}
        return v && typeof v === "object" ? v : {}
    } catch { return {} }
}

async function save(map: Record<string, NotReceivedClaim>, userId: string) {
    const value = JSON.stringify(map)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
}

export async function markNotReceived(issueId: string, userId: string, note: string | null) {
    const map = await loadNotReceived()
    map[issueId] = { at: new Date().toISOString(), byUserId: userId, note: note ? note.slice(0, 300) : null }
    await save(map, userId)
}

/** Receipt confirmed (by the employee or on their behalf): the claim is closed. */
export async function clearNotReceived(issueIds: string[], userId: string) {
    if (!issueIds.length) return
    const map = await loadNotReceived()
    let changed = false
    for (const id of issueIds) if (id in map) { delete map[id]; changed = true }
    if (changed) await save(map, userId)
}
