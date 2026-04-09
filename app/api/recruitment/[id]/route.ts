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

    const lead = await prisma.lead.findUnique({
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

    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(lead)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const prev = await prisma.lead.findUnique({ where: { id: params.id } })
        if (!prev) return NextResponse.json({ error: "Not found" }, { status: 404 })

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

        // Status change
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

            // TRIGGER ONBOARDING if JOINED
            if (body.status === "JOINED") {
                // Determine a safe branch to attach to
                const branch = await prisma.branch.findFirst({ select: { id: true } })
                
                if (branch) {
                    // Generate EMP-XXXX ID
                    const lastEmployee = await prisma.employee.findFirst({
                        orderBy: { createdAt: "desc" },
                        select: { employeeId: true },
                    })
                    let nextNum = 1
                    if (lastEmployee?.employeeId) {
                        const match = lastEmployee.employeeId.match(/\d+$/)
                        if (match) nextNum = parseInt(match[0]) + 1
                    }
                    const newEmployeeId = `EMP-${String(nextNum).padStart(4, "0")}`
                    
                    // Split name
                    const nameParts = (body.candidateName || prev.candidateName || "Candidate").split(" ")
                    const firstName = nameParts[0]
                    const lastName = nameParts.slice(1).join(" ") || " "

                    const token = crypto.randomUUID()

                    const employee = await prisma.employee.create({
                        data: {
                            employeeId: newEmployeeId,
                            firstName,
                            lastName,
                            phone: body.phone || prev.phone || "0000000000",
                            email: body.email || prev.email || null,
                            city: body.city || prev.city || null,
                            designation: body.position || prev.position || null,
                            branchId: branch.id,
                            status: "INACTIVE", // Wait until onboarding verified
                            onboardingToken: token,
                        }
                    })

                    await prisma.onboardingRecord.create({
                        data: {
                            employeeId: employee.id,
                            status: "IN_PROGRESS",
                            notes: "Auto-generated from Recruitment"
                        }
                    })
                    
                    console.log(`[ONBOARDING TRIGGER] Link generated: /onboarding/${token}`)
                    // NOTE: In production, trigger WhatsApp / Email API here using 'token' and candidate 'phone'
                }
            }
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
