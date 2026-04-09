import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
        // Resolve real DB user ID (session.user.id may be a demo-xxx string)
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })


    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const priority = searchParams.get("priority")
    const assignedTo = searchParams.get("assignedTo")
    const search = searchParams.get("search")

    const where: any = {}
    if (status && status !== "ALL") where.status = status
    if (priority && priority !== "ALL") where.priority = priority
    if (assignedTo && assignedTo !== "ALL") where.assignedTo = assignedTo
    if (search) {
        where.OR = [
            { candidateName: { contains: search, mode: "insensitive" } },
            { position: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
            { currentCompany: { contains: search, mode: "insensitive" } },
            { skills: { contains: search, mode: "insensitive" } },
        ]
    }

    const leads = await prisma.lead.findMany({
        where,
        include: {
            assignee: { select: { id: true, name: true, email: true } },
            creator: { select: { id: true, name: true } },
            _count: { select: { activities: true } }
        },
        orderBy: { createdAt: "desc" }
    })

    return NextResponse.json(leads)
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const actorId = await resolveUserId(session)
    if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })

    try {
        const body = await req.json()
        const {
            candidateName, phone, email, city, position,
            experience, currentCompany, qualification, skills,
            expectedSalary, currentSalary, interviewDate, interviewMode,
            source, priority, assignedTo, notes, nextFollowUp
        } = body

        if (!candidateName || !phone || !position || !source) {
            return NextResponse.json({ error: "Candidate name, phone, position and source are required" }, { status: 400 })
        }

        const lead = await prisma.lead.create({
            data: {
                candidateName, phone, position, source,
                email: email || null,
                city: city || null,
                experience: experience ? parseFloat(experience) : null,
                currentCompany: currentCompany || null,
                qualification: qualification || null,
                skills: skills || null,
                expectedSalary: expectedSalary ? parseFloat(expectedSalary) : null,
                currentSalary: currentSalary ? parseFloat(currentSalary) : null,
                interviewDate: interviewDate ? new Date(interviewDate) : null,
                interviewMode: interviewMode || null,
                priority: priority || "MEDIUM",
                assignedTo: assignedTo || null,
                notes: notes || null,
                nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : null,
                createdBy: actorId!,
            },
            include: {
                assignee: { select: { id: true, name: true } },
                creator: { select: { id: true, name: true } },
            }
        })

        await prisma.leadActivity.create({
            data: {
                leadId: lead.id,
                userId: actorId!,
                type: "note",
                content: `Candidate ${candidateName} added for ${position} position`
            }
        })

        return NextResponse.json(lead)
    } catch (err) {
        console.error("CREATE_LEAD_ERROR", err)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
