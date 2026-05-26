
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"
import { sendApprovalEmail } from "@/lib/email"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER"], "approvals.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const inspection = await prisma.inspection.findUnique({
            where: { id: params.id },
            include: {
                submitter: {
                    select: { name: true, email: true }
                },
                assignment: {
                    include: {
                        project: {
                            include: {
                                company: true
                            }
                        }
                    }
                },
                responses: {
                    include: {
                        field: true
                    }
                },
                shareableLink: true
            }
        })

        if (!inspection) {
            return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
        }

        return NextResponse.json(inspection)
    } catch (error) {
        console.error("GET_APPROVAL_DETAIL_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER"], "approvals.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { action, reviewerNotes } = await req.json()
        const inspectionId = params.id

        const inspection = await prisma.inspection.findUnique({
            where: { id: inspectionId },
            include: {
                submitter: true,
                assignment: { include: { project: { include: { company: true } } } }
            }
        })

        if (!inspection) {
            return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
        }

        if (inspection.status !== "pending") {
            return NextResponse.json({ error: "This inspection is not awaiting review" }, { status: 400 })
        }

        if ((action === "reject" || action === "send_back") && !reviewerNotes) {
            return NextResponse.json({ error: "Please provide a reason" }, { status: 400 })
        }

        const projectName = inspection.assignment?.project?.name || "Project"
        const companyName = inspection.assignment?.project?.company?.name || "Company"

        if (action === "send_back") {
            await prisma.$transaction(async (tx) => {
                await tx.inspection.update({
                    where: { id: inspectionId },
                    data: {
                        status: "draft",
                        reviewerNotes,
                        sentBackAt: new Date(),
                        sentBackCount: { increment: 1 }
                    }
                })

                // Notify inspector
                await tx.notification.create({
                    data: {
                        userId: inspection.submittedBy,
                        title: "Inspection Sent Back",
                        message: `Your inspection for ${projectName} (${companyName}) was sent back for corrections. Notes: ${reviewerNotes}`,
                        type: "send_back",
                        link: `/inspection/${inspection.assignmentId}/form`
                    }
                })
            })

            return NextResponse.json({ message: "Inspection sent back for corrections" })
        }

        let updatedStatus = action === "approve" ? "approved" : "rejected"
        let updateData: any = {
            status: updatedStatus,
            reviewerNotes: reviewerNotes || null
        }

        if (action === "approve") {
            updateData.approvedAt = new Date()
            updateData.approvedBy = session.user.id
        }

        const assignment = await prisma.assignment.findUnique({
            where: { id: inspection.assignmentId }
        })

        await prisma.$transaction(async (tx) => {
            await tx.inspection.update({
                where: { id: inspectionId },
                data: updateData
            })

            if (action === "approve") {
                await tx.assignment.update({
                    where: { id: inspection.assignmentId },
                    data: { status: "completed" }
                })

                // Notify inspector
                await tx.notification.create({
                    data: {
                        userId: inspection.submittedBy,
                        title: "Inspection Approved",
                        message: `Your inspection for ${projectName} (${companyName}) has been approved.`,
                        type: "report_approved",
                        link: `/inspection/${inspection.assignmentId}/form`
                    }
                })

                // Auto-create next recurring assignment
                if (assignment && assignment.recurrenceType !== "none" && assignment.recurrenceActive) {
                    await tx.assignment.create({
                        data: {
                            projectId: assignment.projectId,
                            inspectionBoyId: assignment.inspectionBoyId,
                            assignedBy: assignment.assignedBy,
                            status: "active",
                            recurrenceType: assignment.recurrenceType,
                            recurrenceActive: true
                        }
                    })
                }
            } else {
                // Notify inspector of rejection
                await tx.notification.create({
                    data: {
                        userId: inspection.submittedBy,
                        title: "Inspection Rejected",
                        message: `Your inspection for ${projectName} (${companyName}) was rejected. Notes: ${reviewerNotes || "No reason provided"}`,
                        type: "report_rejected",
                        link: `/inspection/${inspection.assignmentId}/form`
                    }
                })
            }
        })

        // After transaction: auto-create share link + email clients on approval
        if (action === "approve") {
            try {
                const companyId = inspection.assignment?.project?.companyId

                // Auto-create shareable link
                const shareLink = await prisma.shareableLink.upsert({
                    where: { inspectionId: inspectionId },
                    create: { inspectionId, createdBy: session.user.id },
                    update: {}
                })

                // NEXT_PUBLIC_APP_URL must be set on Vercel — fail loudly if missing
                // instead of silently sending links to the wrong domain.
                const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? ""
                const shareUrl = `${appUrl}/share/${shareLink.token}`

                // Find all active CLIENT users for this company
                const clients = companyId
                    ? await prisma.user.findMany({
                        where: {
                            role: Role.CLIENT,
                            companyId,
                            isActive: true,
                            email: { not: undefined }
                        },
                        select: { email: true, name: true }
                    })
                    : []

                if (clients.length > 0) {
                    const toEmails = clients.map(c => c.email).filter(Boolean) as string[]
                    const clientNames = clients.map(c => c.name || "Client")

                    await sendApprovalEmail({
                        toEmails,
                        clientNames,
                        projectName,
                        companyName,
                        inspectorName: inspection.submitter?.name || "Inspector",
                        approvedAt: new Date(),
                        reviewerNotes: reviewerNotes || null,
                        shareUrl,
                        approvedByName: session.user.name || session.user.email || "Manager"
                    })
                }
            } catch (emailErr) {
                // Email failure should NOT fail the approval
                console.error("EMAIL_SEND_ERROR", emailErr)
            }
        }

        return NextResponse.json({ message: `Inspection ${updatedStatus} successfully` })
    } catch (error) {
        console.error("PATCH_APPROVAL_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
