import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

// Public POST — no auth required
export async function POST(req: Request, { params }: { params: { slug: string } }) {
    try {
        const form = await prisma.leadForm.findUnique({ where: { slug: params.slug } })
        if (!form || !form.isActive) {
            return NextResponse.json({ error: "Form not found or inactive" }, { status: 404 })
        }

        const body = await req.json()
        const { candidateName, phone, email, city, position, experience,
                qualification, skills, gender, age, expectedSalary, notes } = body

        if (!candidateName || !phone) {
            return NextResponse.json({ error: "Name and phone are required" }, { status: 400 })
        }

        // Find the system user who created the form (use as createdBy)
        const systemUser = await prisma.user.findFirst({
            where: { role: "ADMIN" },
            select: { id: true },
        })
        if (!systemUser) return NextResponse.json({ error: "System error" }, { status: 500 })

        const lead = await prisma.lead.create({
            data: {
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
                source:        "Form Link",
                formSlug:      params.slug,
                siteId:        form.siteId || null,
                status:        "NEW_LEAD",
                priority:      "MEDIUM",
                score:         "WARM",
                createdBy:     systemUser.id,
            },
        })

        return NextResponse.json({ success: true, leadId: lead.id })
    } catch (err) {
        console.error("[LEAD_FORM_SUBMIT]", err)
        return NextResponse.json({ error: "Submission failed" }, { status: 500 })
    }
}
