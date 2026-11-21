import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets } from "@/lib/permissions"
import { notifyEmployee } from "@/lib/hr-notify"
import { commNotify, employeeRecipients } from "@/lib/comm/recipients"
import { auditLater, requestMeta } from "@/lib/access"
import { WorkflowError, workflowErrorResponse, jsonError } from "@/lib/asset-workflow"
import { issueRequestLine } from "@/lib/asset-issue"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST { lines: [{ requestItemId, quantity? }], acknowledged?, remarks? }
// Issues many approved request lines in one go (Assets → Issue → Issue selected).
// Each line is its own transaction with the same checks as the single Issue,
// so one short-of-stock line never blocks the rest. Each employee is told once.
export async function POST(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const actorId = session.user.id
        const body = await req.json().catch(() => ({}))
        const lines: { requestItemId: string; quantity?: number | null }[] = Array.isArray(body?.lines)
            ? body.lines.filter((l: any) => typeof l?.requestItemId === "string").slice(0, 300) : []
        if (!lines.length) return jsonError(400, "Pick at least one line to issue")
        const acknowledged = body?.acknowledged === true
        const remarks = typeof body?.remarks === "string" ? body.remarks.slice(0, 300) : null

        const done: { requestItemId: string; issueNo: string; employeeId: string; asset: string; quantity: number }[] = []
        const failed: { requestItemId: string; error: string }[] = []
        for (const l of lines) {
            try {
                const q = l.quantity != null && Number.isInteger(Number(l.quantity)) ? Number(l.quantity) : null
                const r = await issueRequestLine({ requestItemId: l.requestItemId, quantity: q, actorId, acknowledged, remarks })
                done.push({ requestItemId: l.requestItemId, issueNo: r.issue.issueNo, employeeId: r.item.employeeId, asset: r.item.asset.name, quantity: r.quantity })
            } catch (e) {
                if (e instanceof WorkflowError) failed.push({ requestItemId: l.requestItemId, error: e.message })
                else { console.error("[ASSET_BULK_ISSUE_LINE]", e); failed.push({ requestItemId: l.requestItemId, error: "Could not issue" }) }
            }
        }

        // One message per employee.
        const byEmp = new Map<string, string[]>()
        for (const d of done) byEmp.set(d.employeeId, [...(byEmp.get(d.employeeId) ?? []), d.quantity > 1 ? `${d.asset} × ${d.quantity}` : d.asset])
        for (const [employeeId, items] of Array.from(byEmp)) {
            await notifyEmployee(employeeId, {
                title: "Assets issued to you",
                message: `Issued: ${items.join(", ")}${acknowledged ? "" : " — please confirm you received them"}`,
                type: "asset", link: "/profile?tab=assets",
            })
            await commNotify("asset_issued", employeeRecipients([employeeId]), { asset: items.join(", ") },
                { refType: "Asset", refId: done.find(d => d.employeeId === employeeId)!.issueNo, createdBy: actorId, link: "/profile?tab=assets" })
        }
        auditLater({ actorId, actorName: session.user.name ?? "", action: "asset.bulk_issue", targetType: "AssetIssue", targetId: done.slice(0, 5).map(d => d.issueNo).join(","), targetName: "Bulk issue", summary: `Issued ${done.length} line(s), ${failed.length} failed${acknowledged ? " (handed over in person)" : ""}`, ...requestMeta(req) })
        return NextResponse.json({ issued: done.length, units: done.reduce((s, d) => s + d.quantity, 0), employees: byEmp.size, failed, done })
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_BULK_ISSUE]")
    }
}
