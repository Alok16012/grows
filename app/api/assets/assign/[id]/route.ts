import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { WorkflowError, ifWorkflowInstalled, recordLedgerOnly, returnLinkedIssue } from "@/lib/asset-workflow"

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "assets.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const existing = await prisma.employeeAsset.findUnique({
            where: { id: params.id },
        })
        if (!existing) return new NextResponse("Assignment not found", { status: 404 })
        if (!existing.isActive) {
            return new NextResponse("Asset has already been returned", { status: 400 })
        }

        const include = {
            employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, photo: true } },
            asset: { select: { id: true, assetCode: true, name: true, category: true, serialNo: true } },
        } as const

        // Issued through the workflow: return the remaining quantity via the issue.
        try {
            if (await returnLinkedIssue(params.id, { actorId: session.user.id })) {
                return NextResponse.json(await prisma.employeeAsset.findUnique({ where: { id: params.id }, include }))
            }
        } catch (e) {
            if (e instanceof WorkflowError) return new NextResponse(e.message, { status: e.status })
            throw e
        }

        const [assignment] = await prisma.$transaction([
            prisma.employeeAsset.update({
                where: { id: params.id },
                data: { returnedAt: new Date(), isActive: false },
                include,
            }),
            prisma.asset.update({
                where: { id: existing.assetId },
                data: { available: { increment: 1 } },
            }),
        ])

        await ifWorkflowInstalled(() => recordLedgerOnly(prisma, {
            assetId: existing.assetId, type: "RETURN", qty: 1,
            refType: "LEGACY", refId: params.id, userId: session.user.id,
        }), "[ASSET_RETURN_LEDGER]")

        return NextResponse.json(assignment)
    } catch (error) {
        console.error("[ASSET_RETURN_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
