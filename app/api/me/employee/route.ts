import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { pickPhotoUrl } from "@/lib/employee-photo"

// Fields employee can self-edit (safe list — no salary, no role, no IDs)
const EDITABLE_FIELDS = [
    // Personal
    "firstName", "middleName", "lastName", "nameAsPerAadhar", "fathersName",
    "dateOfBirth", "gender", "bloodGroup", "maritalStatus", "marriageDate",
    "nationality", "religion", "caste", "phone", "alternatePhone", "email",
    // Current address
    "address", "city", "state", "pincode",
    // Permanent address
    "permanentAddress", "permanentCity", "permanentState", "permanentPincode",
    // Identity / IDs
    "aadharNumber", "panNumber", "uan", "pfNumber", "esiNumber", "labourCardNo",
    // Bank
    "bankAccountNumber", "bankIFSC", "bankName", "bankBranch",
    // Emergency contacts
    "emergencyContact1Name", "emergencyContact1Phone",
    "emergencyContact2Name", "emergencyContact2Phone",
] as const

const DATE_FIELDS = new Set(["dateOfBirth", "marriageDate"])

export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const emp = await prisma.employee.findFirst({
        where: { userId: session.user.id },
    })
    if (!emp) return NextResponse.json(null)

    // If no explicit profile photo, fall back to an uploaded Photo document.
    if (!emp.photo) {
        const docs = await prisma.employeeDocument.findMany({
            where: { employeeId: emp.id },
            select: { type: true, fileName: true, fileUrl: true, uploadedAt: true },
        }).catch(() => [])
        const url = pickPhotoUrl(docs)
        if (url) (emp as any).photo = url
    }

    return NextResponse.json(emp)
}

export async function PATCH(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const emp = await prisma.employee.findFirst({ where: { userId: session.user.id } })
    if (!emp) return new NextResponse("Employee record not found", { status: 404 })

    const body = await req.json()
    const data: Record<string, unknown> = {}

    for (const key of EDITABLE_FIELDS) {
        if (key in body) {
            const val = body[key]
            if (DATE_FIELDS.has(key)) {
                data[key] = val ? new Date(val) : null
            } else {
                data[key] = val === "" ? null : val
            }
        }
    }

    const updated = await prisma.employee.update({
        where: { id: emp.id },
        data,
    })

    // Keep User name in sync if firstName/lastName changed
    if ("firstName" in body || "lastName" in body) {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { name: `${updated.firstName} ${updated.lastName}` },
        })
    }

    return NextResponse.json(updated)
}
