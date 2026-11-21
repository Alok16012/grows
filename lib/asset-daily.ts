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
    return { reminded, overdue }
}
