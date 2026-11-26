import { NextResponse } from "next/server"
import { withSnapshot } from "@/lib/form-version"
import prisma from "@/lib/prisma"

// Public, unauthenticated endpoint — anyone holding the token can read this.
// Select ONLY what app/share/[token]/page.tsx and components/InspectionPDF.tsx
// render. No submitter email, no raw assignment/project rows.
export async function GET(
    req: Request,
    { params }: { params: { token: string } }
) {
    const link = await prisma.shareableLink.findUnique({
        where: { token: params.token },
        select: {
            expiresAt: true,
            viewCount: true,
            createdAt: true,
            inspection: {
                select: {
                    id: true,
                    status: true,
                    submittedAt: true,
                    approvedAt: true,
                    gpsLocation: true,
                    signature: true,
                    approvedBy: true,
                    defectPhotos: true,
                    customerSignature: true,
                    customerSignedName: true,
                    customerSignedAt: true,
                    formSnapshot: true,
                    submitter: { select: { name: true } },
                    assignment: {
                        select: {
                            project: {
                                select: {
                                    name: true,
                                    reportConfig: true,
                                    site: { select: { id: true, name: true } },
                                },
                            },
                        },
                    },
                    responses: {
                        select: {
                            id: true,
                            fieldId: true,
                            value: true,
                            field: { select: { fieldLabel: true, fieldType: true, displayOrder: true, isHidden: true } },
                        },
                    },
                },
            },
        },
    })

    if (!link) return NextResponse.json({ error: "Link not found or expired" }, { status: 404 })

    if (link.expiresAt && link.expiresAt < new Date()) {
        return NextResponse.json({ error: "This link has expired" }, { status: 410 })
    }

    // The link was issued for an approved report. If the inspection has since
    // been sent back / rejected, the public copy must stop resolving.
    if (link.inspection.status !== "approved") {
        return NextResponse.json({ error: "This report is no longer available" }, { status: 410 })
    }

    // Increment view count
    await prisma.shareableLink.update({
        where: { token: params.token },
        data: { viewCount: { increment: 1 } }
    })

    // The approver's name for the report's approval signature (never their id).
    const approver = link.inspection.approvedBy
        ? await prisma.user.findUnique({ where: { id: link.inspection.approvedBy }, select: { name: true } })
        : null
    const { approvedBy: _drop, formSnapshot, ...inspectionOut } = link.inspection
    return NextResponse.json({
        inspection: { ...inspectionOut, responses: withSnapshot(inspectionOut.responses, formSnapshot), approverName: approver?.name ?? null },
        viewCount: link.viewCount + 1,
        createdAt: link.createdAt
    })
}
