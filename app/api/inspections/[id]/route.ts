
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== Role.ADMIN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const inspectionId = params.id
        await prisma.$transaction([
            prisma.inspectionData.deleteMany({ where: { inspectionId } }),
            prisma.inspection.delete({ where: { id: inspectionId } })
        ])
        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("DELETE_INSPECTION_ERROR:", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    try {
        const body = await req.json()
        const { responses, status, signature, gpsLocation, startedAt } = body
        const inspectionId = params.id

        const inspection = await prisma.inspection.findUnique({
            where: { id: inspectionId },
            include: { assignment: true }
        })

        if (!inspection) {
            return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
        }

        const isAdmin = session.user.role === "ADMIN"

        // Keyed on who the work is ASSIGNED to, not on who happened to create the
        // draft row. `submittedBy` was the wrong test in both directions: while
        // colleagues could still open each other's assignments, a draft created by
        // one of them locked the rightful inspector out of their own inspection
        // ("Save Failed: Forbidden" part-way through filling it in), and the
        // colleague who created it kept the ability to edit.
        // The reviewer's counter-signature is the one exception: it is applied from
        // the approvals screen, on a submitted inspection, by someone who is
        // deliberately NOT the inspector. Without this the signature silently
        // 403'd for every reviewer except ADMIN while the UI reported success.
        const bodyKeys = Object.keys(body).filter(k => body[k] !== undefined)
        const isSignatureOnly = bodyKeys.length === 1 && bodyKeys[0] === "signature"
        const isReviewer = checkAccess(session, [], "approvals.manage")

        if (!isAdmin && !(isSignatureOnly && isReviewer)
            && inspection.assignment.inspectionBoyId !== session.user.id) {
            return NextResponse.json(
                { error: "This inspection belongs to another inspector" },
                { status: 403 }
            )
        }

        // Cannot edit if not in draft, unless admin or reverting pending back to draft.
        // A reviewer signature is exempt — it is applied precisely once the
        // inspection has left draft.
        const isRevertToDraft = status === "draft" && inspection.status === "pending"
        if (!isAdmin && !(isSignatureOnly && isReviewer)
            && inspection.status !== "draft" && !isRevertToDraft) {
            return NextResponse.json({ error: "Inspection is already submitted and cannot be edited" }, { status: 400 })
        }

        // Update status and submittedAt if pending
        const updateData: any = {}
        // Correct the recorded author when the ASSIGNED INSPECTOR edits a draft a
        // colleague had started, so the report and the audit trail name the person
        // who actually did the work. Restricted to them on purpose: a reviewer
        // counter-signing must not become the recorded author.
        const isAssignedInspector = inspection.assignment.inspectionBoyId === session.user.id
        if (isAssignedInspector && inspection.submittedBy !== session.user.id) {
            updateData.submittedBy = session.user.id
        }
        if (status) {
            updateData.status = status
            if (status === "pending") {
                updateData.submittedAt = new Date()
            }
            if (isRevertToDraft) {
                updateData.submittedAt = null
            }
        }
        if (signature !== undefined) updateData.signature = signature
        if (gpsLocation !== undefined) updateData.gpsLocation = gpsLocation
        if (startedAt !== undefined) updateData.startedAt = new Date(startedAt)

        let validResponses = (responses || []).filter((r: any) => r.fieldId && r.fieldId !== "undefined")

        // Handle paperFormPhoto if sent inside responses
        const paperFormResponseIndex = validResponses.findIndex((r: any) => r.fieldId === "paperFormPhoto")
        if (paperFormResponseIndex !== -1) {
            updateData.paperFormPhoto = validResponses[paperFormResponseIndex].value
            validResponses.splice(paperFormResponseIndex, 1)
        }

        console.log(`Updating inspection ${inspectionId}, status: ${status}, responses: ${validResponses.length}`)

        // Filter to only valid field IDs in one query (avoids FK violations)
        const fieldIds = validResponses.map((r: any) => r.fieldId)
        const validFields = fieldIds.length > 0
            ? await prisma.formTemplate.findMany({
                where: { id: { in: fieldIds } },
                select: { id: true }
            })
            : []
        const validFieldIds = new Set(validFields.map((f: any) => f.id))
        const filteredResponses = validResponses.filter((r: any) => validFieldIds.has(r.fieldId))

        // Use batch transaction (array form) — works reliably with PgBouncer
        // and avoids N×2 sequential queries inside an interactive transaction
        const ops: any[] = []

        if (Object.keys(updateData).length > 0) {
            ops.push(prisma.inspection.update({
                where: { id: inspectionId },
                data: updateData
            }))
        }

        // Only rewrite the answers when this request actually carries them.
        // The delete used to run unconditionally, so ANY partial PATCH wiped the
        // whole inspection: the reviewer's signature save sends `{ signature }`
        // alone, which deleted every recorded answer and re-inserted none.
        // `responses === undefined` means "not part of this update"; an explicitly
        // empty array still means "clear them".
        if (responses !== undefined) {
            ops.push(prisma.inspectionData.deleteMany({ where: { inspectionId } }))

            for (const { fieldId, value } of filteredResponses) {
                ops.push(prisma.inspectionData.create({
                    data: { inspectionId, fieldId, value: value || "" }
                }))
            }
        }

        await prisma.$transaction(ops)

        const updatedInspection = await prisma.inspection.findUnique({
            where: { id: inspectionId },
            include: { responses: true }
        })

        return NextResponse.json(updatedInspection)
    } catch (error: any) {
        console.error("PATCH_INSPECTION_ERROR:", error)
        return NextResponse.json({
            error: "Internal Error",
            details: error.message,
            code: error.code
        }, { status: 500 })
    }
}
