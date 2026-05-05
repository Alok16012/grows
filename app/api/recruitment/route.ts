import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER && session.user.role !== Role.HR_MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const priority = searchParams.get("priority")
    const score = searchParams.get("score")
    const assignedTo = searchParams.get("assignedTo")
    const search = searchParams.get("search")

    const where: any = {}
    if (status && status !== "ALL") where.status = status
    if (priority && priority !== "ALL") where.priority = priority
    if (score && score !== "ALL") where.score = score
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
            _count: { select: { activities: true, documents: true, followUps: true } }
        },
        orderBy: { createdAt: "desc" }
    })

    return NextResponse.json(leads)
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER && session.user.role !== Role.HR_MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const {
            candidateName, phone, email, city, position,
            experience, currentCompany, qualification, skills,
            expectedSalary, currentSalary, interviewDate, interviewMode,
            source, priority, score, assignedTo, notes, nextFollowUp,
            locality, gender, languages, age, course, specialization, collegeName,
            courseStartYear, courseEndYear, previousDesignation, previousCompany,
            resumeUrl, profileUrl, englishLevel, levelOfExperience
        } = body

        if (!candidateName || !phone || !position || !source) {
            return NextResponse.json({ error: "Candidate name, phone, position and source are required" }, { status: 400 })
        }

        // Resolve real user ID from DB (session.user.id may be a demo-xxx string)
        const realUser = await prisma.user.findUnique({ where: { id: session.user.id } })
            ?? await prisma.user.findUnique({ where: { email: session.user.email ?? "" } })
        if (!realUser) {
            return NextResponse.json({ error: "Your account is not found in the database. Please log in again." }, { status: 403 })
        }
        const creatorId = realUser.id

        // Duplicate check on phone
        const existing = await prisma.lead.findFirst({ where: { phone } })
        if (existing) {
            return NextResponse.json({
                error: `Duplicate: ${existing.candidateName} already exists with this phone`,
                duplicate: true,
                existingLead: { id: existing.id, candidateName: existing.candidateName, status: existing.status }
            }, { status: 409 })
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
                score: score || "WARM",
                assignedTo: assignedTo || null,
                notes: notes || null,
                nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : null,
                createdBy: creatorId,
                locality: locality || null,
                gender: gender || null,
                languages: languages || null,
                age: age ? parseInt(age) : null,
                course: course || null,
                specialization: specialization || null,
                collegeName: collegeName || null,
                courseStartYear: courseStartYear || null,
                courseEndYear: courseEndYear || null,
                previousDesignation: previousDesignation || null,
                previousCompany: previousCompany || null,
                resumeUrl: resumeUrl || null,
                profileUrl: profileUrl || null,
                englishLevel: englishLevel || null,
                levelOfExperience: levelOfExperience || null,
            },
            include: {
                assignee: { select: { id: true, name: true } },
                creator: { select: { id: true, name: true } },
                _count: { select: { activities: true, documents: true, followUps: true } }
            }
        })

        await prisma.leadActivity.create({
            data: {
                leadId: lead.id,
                userId: creatorId,
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
