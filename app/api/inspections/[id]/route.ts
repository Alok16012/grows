
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    try {
        const { responses, status } = await req.json()
        const inspectionId = params.id

        const inspection = await prisma.inspection.findUnique({
            where: { id: inspectionId },
            include: { assignment: true }
        })

        if (!inspection) {
            return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
        }

        // Only the assigned inspector can update
        if (inspection.submittedBy !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        // Cannot edit if not in draft, unless inspector is reverting pending back to draft
        const isRevertToDraft = status === "draft" && inspection.status === "pending"
        if (inspection.status !== "draft" && !isRevertToDraft) {
            return NextResponse.json({ error: "Inspection is already submitted and cannot be edited" }, { status: 400 })
        }

        // Update status and submittedAt if pending
        const updateData: any = {}
        if (status) {
            updateData.status = status
            if (status === "pending") {
                updateData.submittedAt = new Date()
            }
            if (isRevertToDraft) {
                updateData.submittedAt = null
            }
        }

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

        ops.push(prisma.inspectionData.deleteMany({ where: { inspectionId } }))

        for (const { fieldId, value } of filteredResponses) {
            ops.push(prisma.inspectionData.create({
                data: { inspectionId, fieldId, value: value || "" }
            }))
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
