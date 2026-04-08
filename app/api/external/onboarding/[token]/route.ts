import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

// GET external candidate data using secure token
export async function GET(req: Request, { params }: { params: { token: string } }) {
    try {
        const employee = await prisma.employee.findUnique({
            where: { onboardingToken: params.token },
            include: {
                documents: true,
                onboardingRecord: true
            }
        })

        if (!employee) return new NextResponse("Invalid or expired link", { status: 404 })

        return NextResponse.json(employee)
    } catch (error) {
        console.error("[ONBOARDING_EXTERNAL_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

// POST update candidate KYC and personal details
export async function POST(req: Request, { params }: { params: { token: string } }) {
    try {
        // Validate Token
        const existing = await prisma.employee.findUnique({
            where: { onboardingToken: params.token }
        })
        if (!existing) return new NextResponse("Invalid link", { status: 404 })
        
        // Prevent updates if finalized
        if (existing.status === "ACTIVE") {
            return new NextResponse("Onboarding is already finalized.", { status: 403 })
        }

        const body = await req.json()
        const {
            dateOfBirth, gender, address, city, state, pincode,
            aadharNumber, panNumber, bankAccountNumber, bankIFSC, bankName, photo,
            uploadedDocs // array of { type, fileName, fileUrl }
        } = body

        // 1. Update Employee Record
        const updatedEmployee = await prisma.employee.update({
            where: { id: existing.id },
            data: {
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : existing.dateOfBirth,
                gender: gender ?? existing.gender,
                address: address ?? existing.address,
                city: city ?? existing.city,
                state: state ?? existing.state,
                pincode: pincode ?? existing.pincode,
                aadharNumber: aadharNumber ?? existing.aadharNumber,
                panNumber: panNumber ?? existing.panNumber,
                bankAccountNumber: bankAccountNumber ?? existing.bankAccountNumber,
                bankIFSC: bankIFSC ?? existing.bankIFSC,
                bankName: bankName ?? existing.bankName,
                photo: photo ?? existing.photo,
                kycRejectionNote: null, // Clear any previous notes upon resubmission
            }
        })

        // 2. Process Initial Documents
        if (uploadedDocs && Array.isArray(uploadedDocs)) {
            for (const doc of uploadedDocs) {
                // Upsert or create mapping
                const existDoc = await prisma.employeeDocument.findFirst({
                    where: { employeeId: existing.id, type: doc.type }
                })
                if (existDoc) {
                    await prisma.employeeDocument.update({
                        where: { id: existDoc.id },
                        data: {
                            fileName: doc.fileName,
                            fileUrl: doc.fileUrl,
                            status: "PENDING", // Reset to pending if re-uploaded
                            rejectionReason: null
                        }
                    })
                } else {
                    await prisma.employeeDocument.create({
                        data: {
                            employeeId: existing.id,
                            type: doc.type,
                            fileName: doc.fileName,
                            fileUrl: doc.fileUrl,
                            status: "PENDING"
                        }
                    })
                }
            }
        }

        return NextResponse.json({ success: true, employee: updatedEmployee })
    } catch (error) {
        console.error("[ONBOARDING_EXTERNAL_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
