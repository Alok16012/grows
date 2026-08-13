
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"

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
                                site: { select: { id: true, name: true } }
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
                assignment: { include: { project: { include: { site: { select: { id: true, name: true } } } } } }
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
        const companyName = inspection.assignment?.project?.site?.name || "Site"

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
            updateData.approvedBy = session!.user.id
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
                // A multi-part assignment covers several visits, so approving one
                // part must not close it — it stays active on the inspector's
                // list until a manager closes it deliberately (PATCH the
                // assignment with status "completed"). Single-visit assignments
                // still close on approval, exactly as before.
                if (!assignment?.isMultiPart) {
                    await tx.assignment.update({
                        where: { id: inspection.assignmentId },
                        data: { status: "completed" }
                    })
                }

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

                // Auto-create next recurring assignment.
                // Belt-and-braces with the disarm on project edit: never recur from
                // an assignment that was deactivated, or approving the last pending
                // inspection would put a removed inspector back on the project.
                // Not for a multi-part assignment: it hasn't finished yet, so
                // spawning the next cycle on every approved part would pile up
                // duplicate assignments. It recurs when a manager closes it.
                if (assignment && assignment.recurrenceType !== "none" && assignment.recurrenceActive
                    && assignment.status !== "inactive" && !assignment.isMultiPart) {
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

        // After transaction: auto-create the public share link on approval.
        // (The client-portal concept was removed — no client emails anymore.)
        if (action === "approve") {
            try {
                await prisma.shareableLink.upsert({
                    where: { inspectionId: inspectionId },
                    create: { inspectionId, createdBy: session!.user.id },
                    update: {}
                })
            } catch (linkErr) {
                // Link failure should NOT fail the approval
                console.error("SHARE_LINK_ERROR", linkErr)
            }
        }

        return NextResponse.json({ message: `Inspection ${updatedStatus} successfully` })
    } catch (error) {
        console.error("PATCH_APPROVAL_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
