import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { AssetCondition } from "@prisma/client"
import { WorkflowError, ifWorkflowInstalled, recordLedgerOnly, returnLinkedIssue } from "@/lib/asset-workflow"

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "assets.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { employeeAssetId, returnCondition, notes, returnedAt } = body

        if (!employeeAssetId) {
            return new NextResponse("employeeAssetId is required", { status: 400 })
        }

        const empAsset = await prisma.employeeAsset.findUnique({
            where: { id: employeeAssetId },
            include: { asset: true },
        })
        if (!empAsset) return new NextResponse("Assignment not found", { status: 404 })
        if (!empAsset.isActive) return new NextResponse("Asset already returned", { status: 400 })
        if (empAsset.assetId !== params.id) return new NextResponse("Asset ID mismatch", { status: 400 })

        if (returnCondition !== undefined && returnCondition !== null
            && !Object.values(AssetCondition).includes(returnCondition)) {
            return new NextResponse(`Unknown returnCondition: ${returnCondition}`, { status: 400 })
        }

        const include = {
            employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
            asset: { select: { id: true, assetCode: true, name: true } },
        } as const

        // Issued through the workflow: return the whole remaining quantity via
        // the issue, so the ledger, issue status and audit stay in step.
        try {
            const handled = await returnLinkedIssue(employeeAssetId, {
                returnCondition: returnCondition ?? null, note: notes || null, actorId: session.user.id,
                returnedAt: returnedAt ? new Date(returnedAt) : undefined,
            })
            if (handled) {
                const assignment = await prisma.employeeAsset.update({
                    where: { id: employeeAssetId },
                    data: {
                        returnedAt: returnedAt ? new Date(returnedAt) : undefined,
                        returnCondition: returnCondition || undefined,
                        notes: notes || empAsset.notes || null,
                    },
                    include,
                })
                return NextResponse.json(assignment)
            }
        } catch (e) {
            if (e instanceof WorkflowError) return new NextResponse(e.message, { status: e.status })
            throw e
        }

        // A unit that came back LOST or DAMAGED isn't back on the shelf, so it
        // must not bump `available` — that's what let the stock count exceed
        // what could actually be handed out. Record the downgraded condition only.
        const assetUpdate: Record<string, unknown> = {}
        if (returnCondition === "DAMAGED" || returnCondition === "LOST") {
            assetUpdate.condition = returnCondition
        } else {
            assetUpdate.available = { increment: 1 }
        }

        const [assignment] = await prisma.$transaction([
            prisma.employeeAsset.update({
                where: { id: employeeAssetId },
                data: {
                    isActive: false,
                    returnedAt: returnedAt ? new Date(returnedAt) : new Date(),
                    returnedTo: session.user.id,
                    returnCondition: returnCondition || null,
                    notes: notes || empAsset.notes || null,
                },
                include,
            }),
            prisma.asset.update({
                where: { id: params.id },
                data: assetUpdate,
            }),
        ])

        const backOnShelf = !(returnCondition === "DAMAGED" || returnCondition === "LOST")
        await ifWorkflowInstalled(() => recordLedgerOnly(prisma, {
            assetId: params.id,
            type: backOnShelf ? "RETURN" : returnCondition === "LOST" ? "LOST" : "DAMAGED",
            qty: backOnShelf ? 1 : 0,
            refType: "LEGACY", refId: employeeAssetId, userId: session.user.id,
            note: backOnShelf ? null : `1 ${String(returnCondition).toLowerCase()} on return`,
        }), "[ASSET_RETURN_LEDGER]")

        return NextResponse.json(assignment)
    } catch (error) {
        console.error("[ASSET_RETURN_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
