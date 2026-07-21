import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { isPhotoDoc } from "@/lib/employee-photo"

// Public route — authenticated via onboardingToken only
// POST /api/join/documents — saves uploaded document record for an onboarding employee

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { onboardingToken, type, fileName, fileUrl } = body

        if (!onboardingToken || !type || !fileName || !fileUrl) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
        }

        // Validate the token
        const employee = await prisma.employee.findUnique({
            where: { onboardingToken },
            select: { id: true, status: true },
        })

        if (!employee) {
            return NextResponse.json({ error: "Invalid onboarding token" }, { status: 401 })
        }

        if (employee.status !== "ONBOARDING") {
            return NextResponse.json({ error: "Onboarding already completed" }, { status: 403 })
        }

        const doc = await prisma.employeeDocument.create({
            data: {
                employeeId: employee.id,
                type,
                fileName,
                fileUrl,
                status: "PENDING",
            },
        })

        // Keep the employee's profile photo in sync so the avatar shows up
        // everywhere (list view, board view, detail page, HR logins, etc.)
        if (isPhotoDoc(type, fileName)) {
            try {
                await prisma.employee.update({
                    where: { id: employee.id },
                    data: { photo: fileUrl },
                })
            } catch (e) {
                console.error("[JOIN_DOCS_PHOTO_SYNC]", e)
            }
        }

        return NextResponse.json({ success: true, docId: doc.id })
    } catch (error: any) {
        console.error("[JOIN_DOCUMENTS_POST]", error)
        return NextResponse.json({ error: "Internal Error", message: error.message }, { status: 500 })
    }
}
