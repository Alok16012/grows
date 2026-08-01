import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import {
    collectErrors, validationResponse,
    validatePhone, validateEmail, validateAadhaar, validatePAN,
    validateIFSC, validateBankAccount, validatePincode, validateUAN,
    validateESIC, validatePFNumber, validateDateOfBirth,
    normalizePhone, normalizeUpper, digitsOnly,
} from "@/lib/validation"

const ALLOWED_FIELDS = [
    "firstName", "middleName", "lastName", "nameAsPerAadhar", "fathersName",
    "dateOfBirth", "gender", "bloodGroup", "maritalStatus", "nationality",
    "religion", "caste", "phone", "alternatePhone", "email",
    "address", "city", "state", "pincode",
    "permanentAddress", "permanentCity", "permanentState", "permanentPincode",
    "aadharNumber", "panNumber", "uan", "pfNumber", "esiNumber", "labourCardNo",
    "bankAccountNumber", "bankIFSC", "bankName", "bankBranch",
    "emergencyContact1Name", "emergencyContact1Phone",
    "emergencyContact2Name", "emergencyContact2Phone",
]

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const employee = await prisma.employee.findFirst({
            where: { userId: session.user.id },
            select: {
                id: true, employeeId: true, firstName: true, middleName: true, lastName: true,
                nameAsPerAadhar: true, fathersName: true, dateOfBirth: true,
                gender: true, bloodGroup: true, maritalStatus: true, nationality: true,
                religion: true, caste: true, phone: true, alternatePhone: true, email: true,
                address: true, city: true, state: true, pincode: true,
                permanentAddress: true, permanentCity: true, permanentState: true, permanentPincode: true,
                aadharNumber: true, panNumber: true, uan: true, pfNumber: true, esiNumber: true,
                labourCardNo: true, bankAccountNumber: true, bankIFSC: true, bankName: true, bankBranch: true,
                emergencyContact1Name: true, emergencyContact1Phone: true,
                emergencyContact2Name: true, emergencyContact2Phone: true,
                status: true, designation: true, dateOfJoining: true,
                isKycVerified: true, kycRejectionNote: true,
                department: { select: { name: true } },
            }
        })

        if (!employee) return NextResponse.json({ error: "No employee profile linked" }, { status: 404 })
        return NextResponse.json(employee)
    } catch (e) {
        console.error("self-profile GET error:", e)
        return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 })
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const employee = await prisma.employee.findFirst({ where: { userId: session.user.id }, select: { id: true } })
        if (!employee) return NextResponse.json({ error: "No employee profile found" }, { status: 404 })

        const body = await req.json()

        // Employees edit their own KYC here, so the same format rules apply as on
        // the HR-facing routes — otherwise this is the one way to get a malformed
        // Aadhaar or IFSC into the record.
        const errors = collectErrors({
            phone: validatePhone(body.phone),
            alternatePhone: validatePhone(body.alternatePhone),
            email: validateEmail(body.email),
            dateOfBirth: validateDateOfBirth(body.dateOfBirth),
            pincode: validatePincode(body.pincode),
            permanentPincode: validatePincode(body.permanentPincode),
            aadharNumber: validateAadhaar(body.aadharNumber),
            panNumber: validatePAN(body.panNumber),
            bankAccountNumber: validateBankAccount(body.bankAccountNumber),
            bankIFSC: validateIFSC(body.bankIFSC),
            uan: validateUAN(body.uan),
            pfNumber: validatePFNumber(body.pfNumber),
            esiNumber: validateESIC(body.esiNumber),
            emergencyContact1Phone: validatePhone(body.emergencyContact1Phone),
            emergencyContact2Phone: validatePhone(body.emergencyContact2Phone),
        })
        if (errors) return NextResponse.json(validationResponse(errors), { status: 400 })

        const data: Record<string, unknown> = {}

        for (const key of ALLOWED_FIELDS) {
            if (key in body) {
                if (key === "dateOfBirth") {
                    data[key] = body[key] ? new Date(body[key]) : null
                } else if (key === "phone" || key === "alternatePhone"
                    || key === "emergencyContact1Phone" || key === "emergencyContact2Phone") {
                    // Stored normalised so the same number typed two ways matches.
                    data[key] = body[key] ? normalizePhone(body[key]) : null
                } else if (key === "panNumber" || key === "bankIFSC") {
                    data[key] = body[key] ? normalizeUpper(body[key]) : null
                } else if (key === "aadharNumber") {
                    data[key] = body[key] ? digitsOnly(body[key]) : null
                } else {
                    data[key] = body[key] || null
                }
            }
        }

        const updated = await prisma.employee.update({ where: { id: employee.id }, data })
        return NextResponse.json({ success: true, id: updated.id })
    } catch (e) {
        console.error("self-profile PATCH error:", e)
        return NextResponse.json({ error: "Save failed. Please try again." }, { status: 500 })
    }
}
