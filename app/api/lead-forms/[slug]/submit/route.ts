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

        // ON_SITE_JOIN forms → candidate is physically joining, mark as JOINED directly
        const isOnSiteJoin = (form as any).formType === "ON_SITE_JOIN"
        const leadStatus = isOnSiteJoin ? "JOINED" : "NEW_LEAD"
        const leadSource = isOnSiteJoin ? "On-site Join" : "Form Link"
        const joinedAt   = isOnSiteJoin ? new Date() : null

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
                source:        leadSource,
                formSlug:      params.slug,
                siteId:        form.siteId || null,
                status:        leadStatus,
                priority:      "MEDIUM",
                score:         "WARM",
                createdBy:     systemUser.id,
            },
        })

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
    } catch (err) {
        console.error("[LEAD_FORM_SUBMIT]", err)
        return NextResponse.json({ error: "Submission failed" }, { status: 500 })
    }
}
