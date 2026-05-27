import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

// Public POST — no auth required
export async function POST(req: Request, { params }: { params: { slug: string } }) {
    try {
        const form = await prisma.leadForm.findUnique({
            where: { slug: params.slug },
            select: { id: true, isActive: true, siteId: true },
        })
        if (!form || !form.isActive) {
            return NextResponse.json({ error: "Form not found or inactive" }, { status: 404 })
        }

        const body = await req.json()
        const { candidateName, phone, email, city, position, experience,
                qualification, skills, gender, age, expectedSalary, notes, profileUrl,
                // Candidate Personal Information Form fields
                tshirtSize, bloodGroup, altPhone, dateOfBirth,
                fatherName, fatherOccupation, motherName, motherOccupation,
                maritalStatus, nationality, aadharNumber,
                presentAddress, permanentAddress,
                currentCompany, currentDesignation, currentSalary,
                pfEsicNumber, previousCompany, reasonForLeaving,
                hasBike, declarationDate, declarationPlace,
                documentsSubmitted, educationDetails } = body

        if (!candidateName || !phone) {
            return NextResponse.json({ error: "Name and phone are required" }, { status: 400 })
        }

        // Find the system user who created the form (use as createdBy)
        const systemUser = await prisma.user.findFirst({
            where: { role: "ADMIN" },
            select: { id: true },
        })
        if (!systemUser) return NextResponse.json({ error: "System error" }, { status: 500 })

        // ON_SITE_JOIN forms → candidate is physically joining, mark as JOINED directly
        const isOnSiteJoin = (form as any).formType === "ON_SITE_JOIN"
        const leadStatus = isOnSiteJoin ? "JOINED" : "NEW_LEAD"
        const leadSource = isOnSiteJoin ? "On-site Join" : "Form Link"
        const joinedAt   = isOnSiteJoin ? new Date() : null

        const leadData: any = {
            candidateName: String(candidateName).trim(),
            phone:         String(phone).trim(),
            email:         email ? String(email).trim() : null,
            city:          city  ? String(city).trim()  : null,
            position:      position ? String(position).trim() : "Not Specified",
            experience:    experience ? parseFloat(String(experience)) : null,
            qualification: qualification || null,
            skills:        skills || null,
            gender:        gender || null,
            age:           age ? parseInt(String(age)) : null,
            expectedSalary: expectedSalary ? parseFloat(String(expectedSalary)) : null,
            notes:         notes || null,
            profileUrl:    profileUrl || null,
            source:        leadSource,
            formSlug:      params.slug,
            siteId:        form.siteId || null,
            status:        leadStatus,
            priority:      "MEDIUM",
            score:         "WARM",
            createdBy:     systemUser.id,
            // ─── New candidate-form fields ───
            tshirtSize:         tshirtSize || null,
            bloodGroup:         bloodGroup || null,
            altPhone:           altPhone || null,
            dateOfBirth:        dateOfBirth ? new Date(dateOfBirth) : null,
            fatherName:         fatherName || null,
            fatherOccupation:   fatherOccupation || null,
            motherName:         motherName || null,
            motherOccupation:   motherOccupation || null,
            maritalStatus:      maritalStatus || null,
            nationality:        nationality || null,
            aadharNumber:       aadharNumber || null,
            presentAddress:     presentAddress || null,
            permanentAddress:   permanentAddress || null,
            currentCompany:     currentCompany || null,
            currentDesignation: currentDesignation || null,
            currentSalary:      currentSalary ? parseFloat(String(currentSalary)) : null,
            pfEsicNumber:       pfEsicNumber || null,
            previousCompany:    previousCompany || null,
            reasonForLeaving:   reasonForLeaving || null,
            hasBike:            hasBike === "Yes" ? true : hasBike === "No" ? false : null,
            declarationDate:    declarationDate ? new Date(declarationDate) : null,
            declarationPlace:   declarationPlace || null,
            documentsSubmitted: Array.isArray(documentsSubmitted) ? documentsSubmitted : [],
            educationDetails:   educationDetails && Array.isArray(educationDetails) && educationDetails.length ? educationDetails : undefined,
        }

        // Prisma auto-includes the required `documentsSubmitted` String[] column
        // in INSERT regardless of whether we pass it. If the migration hasn't run
        // yet, that triggers a P2022 error. So we try Prisma first, and on column-
        // missing error we fall back to a raw INSERT with only known-existing
        // pre-migration columns.
        const newFieldKeys = [
            "tshirtSize", "bloodGroup", "altPhone", "dateOfBirth", "fatherName",
            "fatherOccupation", "motherName", "motherOccupation", "maritalStatus",
            "nationality", "aadharNumber", "presentAddress", "permanentAddress",
            "currentDesignation", "pfEsicNumber",
            "reasonForLeaving", "hasBike", "declarationDate",
            "declarationPlace", "documentsSubmitted", "educationDetails",
        ]
        let lead: any
        try {
            lead = await prisma.lead.create({ data: leadData })
        } catch (err: any) {
            const msg = String(err?.message || "").toLowerCase()
            const missingColumn = msg.includes("does not exist") || msg.includes("unknown arg") || msg.includes("unknown field") || err?.code === "P2022" || err?.code === "P2009"
            if (!missingColumn) throw err
            console.warn("[LEAD_FORM_SUBMIT] fallback to raw INSERT, reason:", err?.code, msg.slice(0, 150))

            // Raw SQL INSERT with only pre-migration columns
            const id = (await import("crypto")).randomUUID()
            await prisma.$executeRaw`
                INSERT INTO "Lead" (
                    "id", "candidateName", "phone", "email", "city", "position",
                    "experience", "qualification", "skills", "gender", "age",
                    "expectedSalary", "notes", "profileUrl",
                    "source", "formSlug", "siteId", "status", "priority", "score",
                    "createdBy", "createdAt", "updatedAt"
                ) VALUES (
                    ${id},
                    ${leadData.candidateName}, ${leadData.phone}, ${leadData.email}, ${leadData.city}, ${leadData.position},
                    ${leadData.experience}::float8, ${leadData.qualification}, ${leadData.skills}, ${leadData.gender}, ${leadData.age}::int,
                    ${leadData.expectedSalary}::float8, ${leadData.notes}, ${leadData.profileUrl},
                    ${leadData.source}, ${leadData.formSlug}, ${leadData.siteId},
                    ${leadData.status}::"LeadStatus", ${leadData.priority}::"LeadPriority", ${leadData.score}::"LeadScore",
                    ${leadData.createdBy}, NOW(), NOW()
                )
            `
            lead = { id, status: leadData.status }
        }

        // Log an activity for on-site joins so HR can see when they walked in
        if (isOnSiteJoin) {
            await prisma.leadActivity.create({
                data: {
                    leadId:  lead.id,
                    userId:  systemUser.id,
                    type:    "note",
                    content: `Candidate ${String(candidateName).trim()} joined on-site via walk-in form`,
                },
            })
        }

        return NextResponse.json({ success: true, leadId: lead.id, status: leadStatus })
    } catch (err: any) {
        console.error("[LEAD_FORM_SUBMIT]", err)
        const detail = String(err?.message || "")
        const code = err?.code
        return NextResponse.json({
            error: `Submission failed${code ? " [" + code + "]" : ""}: ${detail.slice(0, 200)}`
        }, { status: 500 })
    }
}
