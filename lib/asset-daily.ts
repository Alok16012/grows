// Daily asset job (vercel.json → /api/cron/asset-daily): remind employees to
// confirm receipt of assets issued to them, and tell the issuers about
// receipts still not confirmed. Days are in Assets → Settings.
import prisma from "@/lib/prisma"
import { notifyEmployee, notifyApprovers } from "@/lib/hr-notify"
import { getAssetSettings } from "@/lib/asset-settings"

export async function runAssetDaily(now = new Date()) {
    const s = await getAssetSettings()
    const { remindAfterDays, tellIssuersAfterDays } = s.acknowledgement
    let reminded = 0, overdue = 0
    if (remindAfterDays > 0) {
        const cutoff = new Date(now.getTime() - remindAfterDays * 86_400_000)
        const due = await prisma.assetIssue.findMany({ where: { status: "ACTIVE", acknowledgedAt: null, issuedAt: { lt: cutoff } }, select: { employeeId: true, quantity: true, asset: { select: { name: true } } } })
        const byEmp = new Map<string, string[]>()
        for (const d of due) byEmp.set(d.employeeId, [...(byEmp.get(d.employeeId) ?? []), d.quantity > 1 ? `${d.asset.name} × ${d.quantity}` : d.asset.name])
        for (const [employeeId, items] of Array.from(byEmp)) {
            await notifyEmployee(employeeId, { title: "Please confirm you received your assets", message: `Not confirmed yet: ${items.join(", ")}`, type: "asset", link: "/profile?tab=assets" })
        }
        reminded = byEmp.size
    }
    if (tellIssuersAfterDays > 0) {
        const cutoff = new Date(now.getTime() - tellIssuersAfterDays * 86_400_000)
        overdue = await prisma.assetIssue.count({ where: { status: "ACTIVE", acknowledgedAt: null, issuedAt: { lt: cutoff } } })
        if (overdue) {
            await notifyApprovers(["assets.issue", "assets.manage"], { title: "Asset receipts not confirmed", message: `${overdue} issued item(s) not confirmed by the employee for more than ${tellIssuersAfterDays} days.`, type: "asset", link: "/assets?tab=issued" })
        }
    }
    // Items at or below their reorder level.
    let lowStock = 0
    if (s.stock.lowStockAlert) {
        const low: { name: string; available: number; reorderLevel: number }[] = await prisma.$queryRawUnsafe(
            `SELECT a.name, a.available, m."reorderLevel" FROM "Asset" a JOIN "AssetMeta" m ON m."assetId" = a.id WHERE a."isActive" AND m."reorderLevel" > 0 AND a.available <= m."reorderLevel" ORDER BY a.name`)
        lowStock = low.length
        if (low.length) await notifyApprovers(["assets.issue", "assets.manage"], { title: "Low stock", message: low.slice(0, 8).map(l => `${l.name}: ${l.available} left (reorder at ${l.reorderLevel})`).join("; ") + (low.length > 8 ? "…" : ""), type: "asset", link: "/assets?tab=stock" })
    }
    // Warranties ending soon (Assets → Register).
    let warranties = 0
    if (s.register.warrantyAlertDays > 0) {
        const until = new Date(now.getTime() + s.register.warrantyAlertDays * 86_400_000)
        const ending = await prisma.assetDetail.findMany({ where: { warrantyUntil: { gte: now, lte: until } }, select: { assetId: true, warrantyUntil: true } })
        if (ending.length) {
            const names = new Map((await prisma.asset.findMany({ where: { id: { in: ending.map(e => e.assetId) }, isActive: true }, select: { id: true, name: true, assetCode: true } })).map(a => [a.id, `${a.name} (${a.assetCode})`]))
            const list = ending.filter(e => names.has(e.assetId))
            warranties = list.length
            if (list.length) await notifyApprovers(["assets.manage"], { title: "Warranties ending soon", message: list.slice(0, 8).map(e => `${names.get(e.assetId)}: ${e.warrantyUntil!.toISOString().slice(0, 10)}`).join("; ") + (list.length > 8 ? "…" : ""), type: "asset", link: "/assets/register" })
        }
    }
    return { reminded, overdue, lowStock, warranties }
}
