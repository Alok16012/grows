import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role, LeadStatus } from "@prisma/client"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
        // Resolve real DB user ID (session.user.id may be a demo-xxx string)
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })


    const lead = await prisma.lead.findUnique({
        where: { id: params.id },
        include: {
            assignee: { select: { id: true, name: true, email: true } },
            creator: { select: { id: true, name: true } },
            activities: {
                include: { user: { select: { id: true, name: true } } },
                orderBy: { createdAt: "desc" }
            }
        }
    })

    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(lead)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const actorId = await resolveUserId(session)
    if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })

    try {
        const body = await req.json()
        const prev = await prisma.lead.findUnique({ where: { id: params.id } })
        if (!prev) return NextResponse.json({ error: "Not found" }, { status: 404 })

        const updateData: any = {}
        const allowedFields = [
            "candidateName", "phone", "email", "city", "position",
            "currentCompany", "qualification", "skills", "interviewMode",
            "source", "priority", "assignedTo", "notes", "nextFollowUp",
        ]
        allowedFields.forEach(f => {
            if (f in body) updateData[f] = body[f] ?? null
        })

        if (body.experience !== undefined) updateData.experience = body.experience ? parseFloat(body.experience) : null
        if (body.expectedSalary !== undefined) updateData.expectedSalary = body.expectedSalary ? parseFloat(body.expectedSalary) : null
        if (body.currentSalary !== undefined) updateData.currentSalary = body.currentSalary ? parseFloat(body.currentSalary) : null
        if (body.interviewDate !== undefined) updateData.interviewDate = body.interviewDate ? new Date(body.interviewDate) : null
        if (body.nextFollowUp !== undefined) updateData.nextFollowUp = body.nextFollowUp ? new Date(body.nextFollowUp) : null

        // Status change
        if (body.status && body.status !== prev.status) {
            updateData.status = body.status as LeadStatus

            const statusLabels: Record<string, string> = {
                APPLIED: "Applied",
                SCREENING: "Screening",
                INTERVIEW_SCHEDULED: "Interview Scheduled",
                INTERVIEW_DONE: "Interview Done",
                SELECTED: "Selected",
                ONBOARDED: "Onboarded",
                REJECTED: "Rejected",
            }

            await prisma.leadActivity.create({
                data: {
                    leadId: params.id,
                    userId: actorId!,
                    type: "status_change",
                    content: `Status changed: ${statusLabels[prev.status] ?? prev.status} → ${statusLabels[body.status] ?? body.status}`
                }
            })
        }

        const lead = await prisma.lead.update({
            where: { id: params.id },
            data: updateData,
            include: {
                assignee: { select: { id: true, name: true } },
                creator: { select: { id: true, name: true } },
                activities: {
                    include: { user: { select: { id: true, name: true } } },
                    orderBy: { createdAt: "desc" }
                }
            }
        })

        return NextResponse.json(lead)
    } catch (err) {
        console.error("PATCH_LEAD_ERROR", err)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== Role.ADMIN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await prisma.lead.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
}
