import { NextResponse } from "next/server"
import { clearNotReceived, markNotReceived } from "@/lib/asset-not-received"
import { createRecovery } from "@/lib/asset-recovery"
import { getAssetSettings } from "@/lib/asset-settings"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess, canIssueAssets, canOverseeAssets, canRequestAssets } from "@/lib/permissions"
import {
    workflowErrorResponse, jsonError, audit, loadIssue, parseIntStrict,
    returnIssueTx, closeIssueTx,
} from "@/lib/asset-workflow"

async function sessionEmployeeId(userId: string) {
    const emp = await prisma.employee.findUnique({ where: { userId }, select: { id: true } })
    return emp?.id ?? null
}

// GET — one issue (asset staff, or the employee it was issued to).
export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        const issue = await loadIssue(prisma, params.id)
        if (!issue) return jsonError(404, "Issue not found")
        if (!canOverseeAssets(session) && !checkAccess(session, [], "assets.view")
            && issue.employee.id !== await sessionEmployeeId(session.user.id)) {
            return jsonError(403, "Forbidden")
        }
        return NextResponse.json({ issue })
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_ISSUE_GET]")
    }
}

const CLOSE_ACTIONS = ["LOST", "DAMAGED", "WRITTEN_OFF"] as const

// PATCH — ACKNOWLEDGE / RETURN / LOST / DAMAGED / WRITTEN_OFF / REPLACE.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        const actorId = session.user.id

        const body = await req.json().catch(() => ({}))
        const action = String(body?.action ?? "").toUpperCase()

        const issue = await prisma.assetIssue.findUnique({ where: { id: params.id } })
        if (!issue) return jsonError(404, "Issue not found")

        if (action === "ACKNOWLEDGE") {
            // The employee confirms receipt themself, or the issuer does it on their behalf.
            const own = issue.employeeId === await sessionEmployeeId(actorId)
            if (!own && !canIssueAssets(session)) return jsonError(403, "Forbidden")
            if (!issue.acknowledgedAt) {
                await prisma.$transaction(async tx => {
                    const done = await tx.assetIssue.updateMany({
                        where: { id: issue.id, acknowledgedAt: null },
                        data: { acknowledgedAt: new Date(), acknowledgedBy: actorId },
                    })
                    if (done.count > 0) {
                        await audit(tx, {
                            entity: "AssetIssue", entityId: issue.id, action: "ACKNOWLEDGE", userId: actorId,
                            after: { onBehalf: !own },
                        })
                    }
                })
            }
            await clearNotReceived([issue.id], actorId).catch(() => {})
            return NextResponse.json({ issue: await loadIssue(prisma, issue.id) })
        }

        // The employee says the item never reached them (Dashboard "Not received").
        // Recorded for the asset team; the issuer is told. Confirming receipt later clears it.
        if (action === "NOT_RECEIVED") {
            if (issue.employeeId !== await sessionEmployeeId(actorId)) return jsonError(403, "Only the employee can report this")
            if (issue.acknowledgedAt) return jsonError(400, "Receipt was already confirmed")
            const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) : null
            await markNotReceived(issue.id, actorId, note || null)
            await prisma.$transaction(tx => audit(tx, { entity: "AssetIssue", entityId: issue.id, action: "NOT_RECEIVED", userId: actorId, after: { note } })).catch(() => {})
            const [asset, emp] = await Promise.all([
                prisma.asset.findUnique({ where: { id: issue.assetId }, select: { name: true } }),
                prisma.employee.findUnique({ where: { id: issue.employeeId }, select: { firstName: true, lastName: true, employeeId: true } }),
            ])
            if (issue.issuedBy && issue.issuedBy !== actorId) {
                await prisma.notification.create({ data: {
                    userId: issue.issuedBy, type: "asset_not_received", link: "/assets?tab=issued",
                    title: "Asset not received",
                    message: `${[emp?.firstName, emp?.lastName].filter(Boolean).join(" ")} (${emp?.employeeId ?? ""}) says ${asset?.name ?? "an item"} (${issue.issueNo}) has not reached them${note ? `: ${note}` : ""}.`,
                } }).catch(() => {})
            }
            return NextResponse.json({ ok: true })
        }

        if (action === "RETURN") {
            if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
            const quantity = parseIntStrict(body?.quantity ?? issue.quantity - issue.returnedQty)
            const condition = String(body?.condition ?? "GOOD").toUpperCase()
            if (!["GOOD", "FAIR", "DAMAGED"].includes(condition)) return jsonError(400, "condition must be GOOD, FAIR or DAMAGED")
            if (quantity === null) return jsonError(400, "Quantity must be a whole number")
            await prisma.$transaction(tx => returnIssueTx(tx, {
                issueId: issue.id, quantity, condition: condition as "GOOD" | "FAIR" | "DAMAGED",
                note: body?.note?.toString().trim() || null, actorId,
            }))
            return NextResponse.json({ issue: await loadIssue(prisma, issue.id) })
        }

        if ((CLOSE_ACTIONS as readonly string[]).includes(action)) {
            if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
            const note = body?.note?.toString().trim() ?? ""
            if (note.length < 3) return jsonError(400, "Add a note (at least 3 characters)")
            const { outstanding } = await prisma.$transaction(tx => closeIssueTx(tx, {
                issueId: issue.id, status: action as (typeof CLOSE_ACTIONS)[number], note, actorId,
            }))
            // Assets → Settings → Recovery: a charge to check, for lost / damaged items.
            let recovery = null
            if ((action === "LOST" || action === "DAMAGED") && outstanding > 0 && (await getAssetSettings()).recovery.autoChargeLostDamaged) {
                recovery = await createRecovery({ employeeId: issue.employeeId, assetId: issue.assetId, issueId: issue.id, quantity: outstanding, reason: action, note, actorId }).catch(e => { console.error("[ASSET_AUTO_RECOVERY]", e); return null })
            }
            return NextResponse.json({ issue: await loadIssue(prisma, issue.id), recovery })
        }

        if (action === "REPLACE") {
            if (!canIssueAssets(session) && !canRequestAssets(session)) return jsonError(403, "Forbidden")
            const reason = body?.reason?.toString().trim() ?? ""
            if (reason.length < 3) return jsonError(400, "Give a reason for the replacement (at least 3 characters)")
            const { outstanding } = await prisma.$transaction(tx => closeIssueTx(tx, {
                issueId: issue.id, status: "REPLACED", note: reason, actorId,
            }))
            // The UI raises the follow-up request from this; nothing is issued here.
            return NextResponse.json({
                issue: await loadIssue(prisma, issue.id),
                replaceRequestPrefill: {
                    employeeId: issue.employeeId,
                    assetId: issue.assetId,
                    size: issue.size,
                    quantity: Math.max(1, outstanding),
                    reason: "REPLACEMENT",
                    remarks: `Replaces ${issue.issueNo} — ${reason}`,
                    replacesIssueId: issue.id,
                },
            })
        }

        return jsonError(400, "action must be ACKNOWLEDGE, NOT_RECEIVED, RETURN, LOST, DAMAGED, WRITTEN_OFF or REPLACE")
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_ISSUE_PATCH]")
    }
}
