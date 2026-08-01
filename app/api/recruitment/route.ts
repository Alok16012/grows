import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"
import {
    collectErrors, validationResponse,
    validatePhone, validateEmail, validateAadhaar,
    validateDateOfBirth, validateAmount, normalizePhone, digitsOnly,
} from "@/lib/validation"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, [Role.MANAGER, Role.HR_MANAGER], "recruitment.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const priority = searchParams.get("priority")
    const score = searchParams.get("score")
    const assignedTo = searchParams.get("assignedTo")
    const search = searchParams.get("search")

    const where: any = {}
    // Simple scalar filters
    if (status     && status     !== "ALL") where.status     = status
    if (priority   && priority   !== "ALL") where.priority   = priority
    if (score      && score      !== "ALL") where.score      = score
    if (assignedTo && assignedTo !== "ALL") where.assignedTo = assignedTo

    // AND conditions — ownership + search stacked cleanly
    const andClauses: any[] = []

    // ADMIN sees all leads.
    // MANAGER / HR_MANAGER see leads they created, are assigned to, OR that
    // arrived through one of THEIR own recruitment form links.
    if (session.user.role !== Role.ADMIN) {
        // Resolve real user id — session.user.id may be a demo-xxx string in
        // some setups, while the stored createdBy is always the DB uuid.
        const realUser = await prisma.user.findUnique({ where: { id: session.user.id } })
            ?? await prisma.user.findUnique({ where: { email: session.user.email ?? "" } })
        const uid = realUser?.id ?? session.user.id

        // Slugs of form links this user created. Any candidate who applied
        // through their link belongs in their portal, even for legacy leads
        // that were historically stamped with a different owner (e.g. admin
        // — leads captured before the 1-Jun ownership fix).
        const myForms = await prisma.leadForm.findMany({
            where: { createdBy: uid },
            select: { slug: true },
        })
        const mySlugs = myForms.map((f) => f.slug)

        const ownership: any[] = [
            { createdBy:  uid },
            { assignedTo: uid },
        ]
        if (mySlugs.length) ownership.push({ formSlug: { in: mySlugs } })

        andClauses.push({ OR: ownership })
    }

    if (search) {
        andClauses.push({
            OR: [
                { candidateName:  { contains: search, mode: "insensitive" } },
                { position:       { contains: search, mode: "insensitive" } },
                { phone:          { contains: search, mode: "insensitive" } },
                { city:           { contains: search, mode: "insensitive" } },
                { currentCompany: { contains: search, mode: "insensitive" } },
                { skills:         { contains: search, mode: "insensitive" } },
            ]
        })
    }

    if (andClauses.length > 0) where.AND = andClauses

    // Try full select first; fall back to "original columns only" if the
    // new candidate-form columns don't exist yet in the deployed DB.
    try {
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
    } catch (err: any) {
        const msg = String(err?.message || "")
        const missingColumn = msg.includes("does not exist") || err?.code === "P2022"
        if (!missingColumn) {
            console.error("[RECRUITMENT_GET]", err)
            return NextResponse.json({ error: "Failed to load candidates" }, { status: 500 })
        }
        // Fallback — DB migration not yet applied. Select only pre-migration columns.
        const leads = await prisma.lead.findMany({
            where,
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
                _count: { select: { activities: true, documents: true, followUps: true } }
            },
            orderBy: { createdAt: "desc" }
        })
        return NextResponse.json(leads)
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, [Role.MANAGER, Role.HR_MANAGER], "recruitment.manage")) {
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
            resumeUrl, profileUrl, englishLevel, levelOfExperience,
            // Candidate Personal Information Form fields
            tshirtSize, bloodGroup, altPhone, dateOfBirth,
            fatherName, fatherOccupation, motherName, motherOccupation,
            maritalStatus, nationality, aadharNumber,
            presentAddress, permanentAddress,
            currentDesignation, pfEsicNumber, reasonForLeaving,
            hasBike, declarationDate, declarationPlace,
            documentsSubmitted, educationDetails,
        } = body

        if (!candidateName || !phone || !position || !source) {
            return NextResponse.json({ error: "Candidate name, phone, position and source are required" }, { status: 400 })
        }

        const errors = collectErrors({
            phone: validatePhone(phone),
            altPhone: validatePhone(altPhone),
            email: validateEmail(email),
            aadharNumber: validateAadhaar(aadharNumber),
            dateOfBirth: validateDateOfBirth(dateOfBirth),
            expectedSalary: validateAmount(expectedSalary, "Expected salary"),
            currentSalary: validateAmount(currentSalary, "Current salary"),
        })
        // The recruitment form reads this body with res.json() and toasts `error`.
        if (errors) return NextResponse.json(validationResponse(errors), { status: 400 })

        // Store the phone in one canonical form, and dedupe against that same
        // form — checking the raw input while storing a normalised value would
        // let the identical number through twice.
        const normalizedPhone = normalizePhone(phone)

        // Resolve real user ID from DB (session.user.id may be a demo-xxx string)
        const realUser = await prisma.user.findUnique({ where: { id: session.user.id } })
            ?? await prisma.user.findUnique({ where: { email: session.user.email ?? "" } })
        if (!realUser) {
            return NextResponse.json({ error: "Your account is not found in the database. Please log in again." }, { status: 403 })
        }
        const creatorId = realUser.id

        // Duplicate check on phone
        const existing = await prisma.lead.findFirst({ where: { phone: normalizedPhone } })
        if (existing) {
            return NextResponse.json({
                error: `Duplicate: ${existing.candidateName} already exists with this phone`,
                duplicate: true,
                existingLead: { id: existing.id, candidateName: existing.candidateName, status: existing.status }
            }, { status: 409 })
        }

        const coreData: any = {
            candidateName, phone: normalizedPhone, position, source,
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
        }
        const newFieldsData = {
            tshirtSize: tshirtSize || null,
            bloodGroup: bloodGroup || null,
            altPhone: altPhone ? normalizePhone(altPhone) : null,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            fatherName: fatherName || null,
            fatherOccupation: fatherOccupation || null,
            motherName: motherName || null,
            motherOccupation: motherOccupation || null,
            maritalStatus: maritalStatus || null,
            nationality: nationality || null,
            aadharNumber: aadharNumber ? digitsOnly(aadharNumber) : null,
            presentAddress: presentAddress || null,
            permanentAddress: permanentAddress || null,
            currentDesignation: currentDesignation || null,
            pfEsicNumber: pfEsicNumber || null,
            reasonForLeaving: reasonForLeaving || null,
            hasBike: hasBike === "Yes" || hasBike === true ? true : hasBike === "No" || hasBike === false ? false : null,
            declarationDate: declarationDate ? new Date(declarationDate) : null,
            declarationPlace: declarationPlace || null,
            documentsSubmitted: Array.isArray(documentsSubmitted) ? documentsSubmitted : [],
            educationDetails: educationDetails && Array.isArray(educationDetails) && educationDetails.length ? educationDetails : undefined,
        }
        let lead
        try {
            lead = await prisma.lead.create({
                data: { ...coreData, ...newFieldsData },
                include: {
                    assignee: { select: { id: true, name: true } },
                    creator: { select: { id: true, name: true } },
                    _count: { select: { activities: true, documents: true, followUps: true } }
                }
            })
        } catch (err: any) {
            const msg = String(err?.message || "")
            const missingColumn = msg.includes("does not exist") || err?.code === "P2022"
            if (!missingColumn) throw err
            // Migration not applied yet — create without the new fields
            lead = await prisma.lead.create({
                data: coreData,
                include: {
                    assignee: { select: { id: true, name: true } },
                    creator: { select: { id: true, name: true } },
                    _count: { select: { activities: true, documents: true, followUps: true } }
                }
            })
        }

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
