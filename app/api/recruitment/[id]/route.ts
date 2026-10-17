import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role, LeadStatus } from "@prisma/client"
import { resolveUserId } from "@/lib/resolveUserId"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, [Role.MANAGER, Role.HR_MANAGER], "recruitment.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let lead
    try {
        lead = await prisma.lead.findUnique({
            where: { id: params.id },
            include: {
                assignee: { select: { id: true, name: true, email: true } },
                creator: { select: { id: true, name: true } },
                activities: {
                    include: { user: { select: { id: true, name: true } } },
                    orderBy: { createdAt: "desc" }
                },
                documents: {
                    include: { uploader: { select: { id: true, name: true } } },
                    orderBy: { createdAt: "desc" }
                },
                followUps: {
                    include: { creator: { select: { id: true, name: true } } },
                    orderBy: { scheduledAt: "asc" }
                }
            }
        })
    } catch (err: any) {
        const msg = String(err?.message || "")
        const missingColumn = msg.includes("does not exist") || err?.code === "P2022"
        if (!missingColumn) throw err
        // Fallback — fetch with only pre-migration columns
        lead = await prisma.lead.findUnique({
            where: { id: params.id },
            select: {
                id: true, candidateName: true, phone: true, email: true, city: true,
                position: true, experience: true, currentCompany: true, qualification: true,
                skills: true, expectedSalary: true, currentSalary: true, interviewDate: true,
                interviewMode: true, source: true, status: true, priority: true, score: true,
                interviewerId: true, interviewFeedback: true, interviewResult: true,
                assignedTo: true, notes: true, nextFollowUp: true, locality: true,
                gender: true, languages: true, age: true, course: true, specialization: true,
                collegeName: true, courseStartYear: true, courseEndYear: true,
                previousDesignation: true, previousCompany: true, resumeUrl: true,
                profileUrl: true, englishLevel: true, levelOfExperience: true,
                convertedEmployeeId: true, formSlug: true, siteId: true,
                createdBy: true, createdAt: true, updatedAt: true,
                assignee: { select: { id: true, name: true, email: true } },
                creator: { select: { id: true, name: true } },
                activities: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
                documents: { include: { uploader: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
                followUps: { include: { creator: { select: { id: true, name: true } } }, orderBy: { scheduledAt: "asc" } },
            } as any
        }) as any
    }

    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Non-admins can only view their own created or assigned leads.
    if (session!.user.role !== Role.ADMIN
        && lead.createdBy !== session!.user.id
        && lead.assignedTo !== session!.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json(lead)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, [Role.MANAGER, Role.HR_MANAGER], "recruitment.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const prev = await prisma.lead.findUnique({ where: { id: params.id } })
        if (!prev) return NextResponse.json({ error: "Not found" }, { status: 404 })

        // Non-admins can only modify leads they created or are assigned to.
        if (session!.user.role !== Role.ADMIN
            && prev.createdBy !== session!.user.id
            && prev.assignedTo !== session!.user.id) {
            return NextResponse.json({ error: "Not found" }, { status: 404 })
        }

        // Resolve real DB user ID (session.user.id may be a demo-xxx string)
        const actorId = await resolveUserId(session)

        const updateData: any = {}
        const allowedFields = [
            "candidateName", "phone", "email", "city", "position",
            "currentCompany", "qualification", "skills", "interviewMode",
            "source", "priority", "score", "assignedTo", "notes", "nextFollowUp",
            "interviewerId", "interviewFeedback", "interviewResult",
            "locality", "gender", "languages", "course", "specialization",
            "collegeName", "courseStartYear", "courseEndYear", "previousDesignation",
            "previousCompany", "resumeUrl", "profileUrl", "englishLevel", "levelOfExperience",
            // Candidate Personal Information Form
            "tshirtSize", "bloodGroup", "altPhone", "fatherName", "fatherOccupation",
            "motherName", "motherOccupation", "maritalStatus", "nationality", "aadharNumber",
            "presentAddress", "permanentAddress", "currentDesignation", "pfEsicNumber",
            "reasonForLeaving", "declarationPlace",
        ]
        allowedFields.forEach(f => {
            if (f in body) updateData[f] = body[f] ?? null
        })

        if (body.experience !== undefined) updateData.experience = body.experience ? parseFloat(body.experience) : null
        if (body.age !== undefined) updateData.age = body.age ? parseInt(body.age) : null
        if (body.expectedSalary !== undefined) updateData.expectedSalary = body.expectedSalary ? parseFloat(body.expectedSalary) : null
        if (body.currentSalary !== undefined) updateData.currentSalary = body.currentSalary ? parseFloat(body.currentSalary) : null
        if (body.interviewDate !== undefined) updateData.interviewDate = body.interviewDate ? new Date(body.interviewDate) : null
        if (body.nextFollowUp !== undefined) updateData.nextFollowUp = body.nextFollowUp ? new Date(body.nextFollowUp) : null
        if (body.dateOfBirth !== undefined) updateData.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null
        if (body.declarationDate !== undefined) updateData.declarationDate = body.declarationDate ? new Date(body.declarationDate) : null
        if (body.hasBike !== undefined) updateData.hasBike = body.hasBike === "Yes" || body.hasBike === true ? true : body.hasBike === "No" || body.hasBike === false ? false : null
        if (body.documentsSubmitted !== undefined) updateData.documentsSubmitted = Array.isArray(body.documentsSubmitted) ? body.documentsSubmitted : []
        if (body.educationDetails !== undefined) updateData.educationDetails = body.educationDetails || null

        // Status change. Anything outside the enum used to reach Prisma as-is
        // and come back as a 500.
        if (body.status !== undefined && body.status !== null
            && !Object.values(LeadStatus).includes(body.status)) {
            return NextResponse.json({
                error: `Invalid status "${body.status}". Expected one of: ${Object.values(LeadStatus).join(", ")}`,
            }, { status: 400 })
        }
        if (body.status && body.status !== prev.status) {
            updateData.status = body.status as LeadStatus

            const statusLabels: Record<string, string> = {
                NEW_LEAD: "New Lead",
                CONTACTED: "Contacted",
                INTERESTED: "Interested",
                INTERVIEW_SCHEDULED: "Interview Scheduled",
                INTERVIEW_DONE: "Interview Done",
                SELECTED: "Selected",
                OFFERED: "Offered",
                JOINED: "Joined",
                ON_SITE_JOINED: "On-site Joined",
                REJECTED: "Rejected",
                DROPPED: "Dropped",
            }

            if (actorId) {
                await prisma.leadActivity.create({
                    data: {
                        leadId: params.id,
                        userId: actorId,
                        type: "status_change",
                        content: `Status changed: ${statusLabels[prev.status] ?? prev.status} → ${statusLabels[body.status] ?? body.status}`
                    }
                })
            }
            // Moving a lead to JOINED is just a status change. Creating the
            // employee record (with salary, deployment, onboarding tasks and a
            // login) is POST /api/recruitment/[id]/convert; the auto-create that
            // used to live here produced bare INACTIVE employees with a
            // 0000000000 phone and an EMP code that collided with the import.
        }

        // Try update with all fields. If a new column doesn't exist yet,
        // strip new fields from updateData and retry.
        const newFieldKeys = [
            "tshirtSize", "bloodGroup", "altPhone", "dateOfBirth", "fatherName",
            "fatherOccupation", "motherName", "motherOccupation", "maritalStatus",
            "nationality", "aadharNumber", "presentAddress", "permanentAddress",
            "currentDesignation", "pfEsicNumber", "reasonForLeaving", "hasBike",
            "declarationDate", "declarationPlace", "documentsSubmitted", "educationDetails",
        ]
        let lead
        try {
            lead = await prisma.lead.update({
                where: { id: params.id },
                data: updateData,
                include: {
                    assignee: { select: { id: true, name: true } },
                    creator: { select: { id: true, name: true } },
                    activities: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
                    documents: { include: { uploader: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
                    followUps: { include: { creator: { select: { id: true, name: true } } }, orderBy: { scheduledAt: "asc" } },
                }
            })
        } catch (err: any) {
            const msg = String(err?.message || "")
            const missingColumn = msg.includes("does not exist") || err?.code === "P2022"
            if (!missingColumn) throw err
            const coreUpdate: any = {}
            for (const k of Object.keys(updateData)) {
                if (!newFieldKeys.includes(k)) coreUpdate[k] = updateData[k]
            }
            lead = await prisma.lead.update({
                where: { id: params.id },
                data: coreUpdate,
                include: {
                    assignee: { select: { id: true, name: true } },
                    creator: { select: { id: true, name: true } },
                    activities: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
                    documents: { include: { uploader: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
                    followUps: { include: { creator: { select: { id: true, name: true } } }, orderBy: { scheduledAt: "asc" } },
                }
            })
        }

        return NextResponse.json(lead)
    } catch (err) {
        console.error("PATCH_LEAD_ERROR", err)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    // Same gate as the update handler above — ADMIN passes implicitly via
    // checkAccess, so custom roles that manage recruitment can delete too.
    if (!session || !checkAccess(session, [Role.MANAGER, Role.HR_MANAGER], "recruitment.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await prisma.lead.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
}
