import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getHrContacts } from "@/lib/hr-contacts"

// GET external candidate data using secure token.
// Also returns the active site + HR user lists so the public onboarding form
// can render dropdowns without needing an authenticated session.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
    try {
        const employee = await prisma.employee.findUnique({
            where: { onboardingToken: params.token },
            include: {
                documents: true,
                onboardingRecord: true,
                deployments: {
                    where: { isActive: true },
                    select: { siteId: true },
                    take: 1,
                    orderBy: { startDate: "desc" },
                },
            },
        })

        if (!employee) return new NextResponse("Invalid or expired link", { status: 404 })

        // Active sites + HR users in parallel — both small lists, fine to bundle
        // into the onboarding GET response.
        const [sites, hrUsers] = await Promise.all([
            prisma.site.findMany({
                where: { isActive: true },
                select: { id: true, name: true, code: true },
                orderBy: { name: "asc" },
            }),
            getHrContacts(),
        ])

        return NextResponse.json({
            ...employee,
            // Convenience fields for the form
            currentSiteId: employee.deployments?.[0]?.siteId ?? null,
            sites,
            hrUsers,
        })
    } catch (error) {
        console.error("[ONBOARDING_EXTERNAL_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

// POST update candidate KYC and personal details
export async function POST(req: Request, { params }: { params: { token: string } }) {
    try {
        const existing = await prisma.employee.findUnique({
            where: { onboardingToken: params.token }
        })
        if (!existing) return new NextResponse("Invalid link", { status: 404 })

        if (existing.status === "ACTIVE") {
            return new NextResponse("Onboarding is already finalized.", { status: 403 })
        }

        const body = await req.json()
        const {
            dateOfBirth, gender, bloodGroup, fathersName, maritalStatus, photo,
            address, city, state, pincode,
            permanentAddress, permanentCity, permanentState, permanentPincode,
            emergencyContact1Name, emergencyContact1Phone,
            emergencyContact2Name, emergencyContact2Phone,
            aadharNumber, panNumber,
            bankAccountNumber, bankIFSC, bankName, bankBranch,
            uploadedDocs, // array of { type, fileName, fileUrl }
            siteId,       // NEW — selected site from dropdown
            hrId,         // NEW — selected HR user (stored as managerId)
            designation,  // job role — feeds document templates ({{designation}})
            uan,          // previous PF / UAN number
            pfNumber,
            esiNumber,    // previous ESIC number
        } = body

        // 1. Update Employee Record
        const updatedEmployee = await prisma.employee.update({
            where: { id: existing.id },
            data: {
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : existing.dateOfBirth,
                gender: gender ?? existing.gender,
                bloodGroup: bloodGroup || existing.bloodGroup,
                fathersName: fathersName || existing.fathersName,
                maritalStatus: maritalStatus || existing.maritalStatus,
                photo: photo || existing.photo,
                address: address ?? existing.address,
                city: city ?? existing.city,
                state: state ?? existing.state,
                pincode: pincode ?? existing.pincode,
                permanentAddress: permanentAddress || existing.permanentAddress,
                permanentCity: permanentCity || existing.permanentCity,
                permanentState: permanentState || existing.permanentState,
                permanentPincode: permanentPincode || existing.permanentPincode,
                emergencyContact1Name: emergencyContact1Name || existing.emergencyContact1Name,
                emergencyContact1Phone: emergencyContact1Phone || existing.emergencyContact1Phone,
                emergencyContact2Name: emergencyContact2Name || existing.emergencyContact2Name,
                emergencyContact2Phone: emergencyContact2Phone || existing.emergencyContact2Phone,
                aadharNumber: aadharNumber ?? existing.aadharNumber,
                panNumber: panNumber ?? existing.panNumber,
                bankAccountNumber: bankAccountNumber ?? existing.bankAccountNumber,
                bankIFSC: bankIFSC ?? existing.bankIFSC,
                bankName: bankName ?? existing.bankName,
                bankBranch: bankBranch || existing.bankBranch,
                designation: designation || existing.designation,
                uan: uan || existing.uan,
                pfNumber: pfNumber || existing.pfNumber,
                esiNumber: esiNumber || existing.esiNumber,
                // NEW: HR assignment goes on managerId
                managerId: hrId || existing.managerId,
                kycRejectionNote: null,
            }
        })

        // 2. NEW: If a site was selected, upsert active Deployment for this employee.
        // Deactivate any prior active deployments first so only one is active.
        if (siteId) {
            await prisma.deployment.updateMany({
                where: { employeeId: existing.id, isActive: true, NOT: { siteId } },
                data: { isActive: false, endDate: new Date() },
            })
            const activeMatching = await prisma.deployment.findFirst({
                where: { employeeId: existing.id, siteId, isActive: true },
                select: { id: true },
            })
            if (!activeMatching) {
                await prisma.deployment.create({
                    data: {
                        employeeId: existing.id,
                        siteId,
                        startDate: new Date(),
                        isActive: true,
                    },
                })
            }
        }

        // 3. Process Initial Documents
        if (uploadedDocs && Array.isArray(uploadedDocs)) {
            for (const doc of uploadedDocs) {
                const existDoc = await prisma.employeeDocument.findFirst({
                    where: { employeeId: existing.id, type: doc.type }
                })
                if (existDoc) {
                    await prisma.employeeDocument.update({
                        where: { id: existDoc.id },
                        data: {
                            fileName: doc.fileName,
                            fileUrl: doc.fileUrl,
                            status: "PENDING",
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
