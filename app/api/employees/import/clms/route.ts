import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const yesNo = (v: unknown) => String(v ?? "").toLowerCase() === "yes"
const parseDate = (v: unknown): Date | null => {
    if (!v || String(v) === "NaN" || String(v).trim() === "") return null
    const d = new Date(String(v))
    return isNaN(d.getTime()) ? null : d
}
const parseNum = (v: unknown): number | null => {
    if (!v || isNaN(Number(v))) return null
    return parseInt(String(v))
}
const str = (v: unknown): string | null => {
    const s = String(v ?? "").trim()
    return s === "" || s === "undefined" || s === "null" ? null : s
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const rows: Record<string, unknown>[] = body.rows ?? []

    let imported = 0
    let skipped = 0
    const errors: { row: number; reason: string }[] = []

    // Fetch all branches once
    const allBranches = await prisma.branch.findMany({ select: { id: true, name: true } })

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowNum = i + 2

        const firstName = str(row["FirstName"])
        const lastName = str(row["LastName"])
        const phone = str(row["ContactNoPrimary"]) ?? str(row["ContactNoSecondary"])

        if (!firstName || !phone) {
            errors.push({ row: rowNum, reason: "Missing required fields (FirstName, ContactNoPrimary)" })
            skipped++
            continue
        }

        // Determine branch by ContractorCode or use first available
        const contractorCode = str(row["ContractorCode"])
        let branch = contractorCode
            ? allBranches.find(b => b.name.toLowerCase().includes(contractorCode.toLowerCase()))
            : null
        if (!branch) branch = allBranches[0] ?? null
        if (!branch) {
            errors.push({ row: rowNum, reason: "No branch available in the system" })
            skipped++
            continue
        }

        try {
            // Generate employee ID
            const empCodeRaw = str(row["EmployeeCode"])
            let finalId: string

            if (empCodeRaw) {
                const exists = await prisma.employee.findUnique({ where: { employeeId: empCodeRaw } })
                if (exists) {
                    // Auto-generate a new one
                    const lastEmployee = await prisma.employee.findFirst({
                        orderBy: { createdAt: "desc" },
                        select: { employeeId: true },
                    })
                    let nextNum = 1
                    if (lastEmployee?.employeeId) {
                        const match = lastEmployee.employeeId.match(/\d+$/)
                        if (match) nextNum = parseInt(match[0]) + 1
                    }
                    finalId = `EMP-${String(nextNum).padStart(4, "0")}`
                    const exists2 = await prisma.employee.findUnique({ where: { employeeId: finalId } })
                    if (exists2) finalId = `EMP-${String(nextNum + 1).padStart(4, "0")}`
                } else {
                    finalId = empCodeRaw
                }
            } else {
                const lastEmployee = await prisma.employee.findFirst({
                    orderBy: { createdAt: "desc" },
                    select: { employeeId: true },
                })
                let nextNum = 1
                if (lastEmployee?.employeeId) {
                    const match = lastEmployee.employeeId.match(/\d+$/)
                    if (match) nextNum = parseInt(match[0]) + 1
                }
                finalId = `EMP-${String(nextNum).padStart(4, "0")}`
                const exists = await prisma.employee.findUnique({ where: { employeeId: finalId } })
                if (exists) finalId = `EMP-${String(nextNum + 1).padStart(4, "0")}`
            }

            // Auto-create user
            const emailRaw = str(row["PersonalEmailID"]) ?? `${phone}@cims.local`
            const passwordHash = await bcrypt.hash(phone, 10)

            const existingUser = await prisma.user.findUnique({ where: { email: emailRaw } })
            let userId: string
            if (existingUser) {
                userId = existingUser.id
            } else {
                const newUser = await prisma.user.create({
                    data: {
                        name: [firstName, str(row["LastName"])].filter(Boolean).join(" "),
                        email: emailRaw,
                        password: passwordHash,
                        role: "INSPECTION_BOY",
                    },
                })
                userId = newUser.id
            }

            const contractFromDate = parseDate(row["ContractFrom"])

            const employee = await prisma.employee.create({
                data: {
                    employeeId: finalId,
                    firstName,
                    middleName: str(row["MiddleName"]),
                    lastName: str(row["LastName"]) ?? firstName,
                    nameAsPerAadhar: str(row["NameAsPerAadhar"]),
                    fathersName: str(row["FathersName"]),
                    email: str(row["PersonalEmailID"]),
                    phone,
                    alternatePhone: str(row["ContactNoSecondary"]),
                    dateOfBirth: parseDate(row["BirthDate"]),
                    gender: str(row["Gender"]),
                    bloodGroup: str(row["BloodGroup"]),
                    maritalStatus: str(row["MaritalStatus"]),
                    nationality: str(row["Nationality"]) ?? "Indian",
                    religion: str(row["Religion"]),
                    caste: str(row["Caste"]),
                    // Statutory
                    aadharNumber: str(row["AadharCardNo"]),
                    panNumber: str(row["PanNo"]),
                    uan: str(row["UAN"]),
                    pfNumber: str(row["PFNo"]),
                    esiNumber: str(row["ESINo"]),
                    labourCardNo: str(row["LabourCardNo"]),
                    labourCardExpDate: parseDate(row["LabourCardExpDate"]),
                    // Bank
                    bankName: str(row["BankName"]),
                    bankBranch: str(row["BankBranch"]),
                    bankIFSC: str(row["IFSC Code "]) ?? str(row["IFSCCode"]) ?? str(row["IFSC"]),
                    bankAccountNumber: str(row["Account No "]) ?? str(row["AccountNo"]) ?? str(row["AccountNumber"]),
                    // Contract
                    contractFrom: contractFromDate,
                    dateOfJoining: contractFromDate,
                    contractPeriodDays: parseNum(row["ContractPeriodInDays"]),
                    contractorCode: str(row["ContractorCode"]),
                    workOrderNumber: str(row["WorkOrderNumber"]),
                    workOrderFrom: parseDate(row["WorkOrderEffectiveFrom"]),
                    workOrderTo: parseDate(row["WorkOrderEffectiveTo"]),
                    workSkill: str(row["WorkSkill"]),
                    natureOfWork: str(row["NatureOfWork"]),
                    designation: str(row["DesignationCode"]),
                    categoryCode: str(row["CategoryCode"]),
                    employmentTypeCode: str(row["EmployementType"]),
                    // Emergency
                    emergencyContact1Name: str(row["EmergencyContactPerson1"]),
                    emergencyContact1Phone: str(row["EmergencyContactNo1"]),
                    emergencyContact2Name: str(row["EmergencyContactPerson2"]),
                    emergencyContact2Phone: str(row["EmergencyContactNo2"]),
                    // Permanent Address
                    permanentAddress: str(row["PAddressLine1"]),
                    permanentCity: str(row["PCityCode"]),
                    permanentState: str(row["PStateCode"]),
                    permanentPincode: str(row["PZipCode"]),
                    // Background & Medical
                    isBackgroundChecked: yesNo(row["IsBackgroundChecked"]),
                    backgroundCheckRemark: str(row["RemarkForBackgroundCheck"]),
                    isMedicalDone: yesNo(row["IsMedicalCheckUpDone"]),
                    medicalRemark: str(row["RemarkForMedicalCheckUp"]),
                    // Safety
                    safetyGoggles: yesNo(row["IsSafetyGogglesIssued"]),
                    safetyGogglesDate: parseDate(row["SafetyGogglesIssuedDate"]),
                    safetyGloves: yesNo(row["IsHandGlovesIssued"]),
                    safetyGlovesDate: parseDate(row["HandGlovesIssuedDate"]),
                    safetyHelmet: yesNo(row["IsHelmetsIssued"]),
                    safetyHelmetDate: parseDate(row["HelmetsIssuedDate"]),
                    safetyMask: yesNo(row["IsMaskIssued"]),
                    safetyMaskDate: parseDate(row["MaskIssuedDate"]),
                    safetyJacket: yesNo(row["IsJacketIssued"]),
                    safetyJacketDate: parseDate(row["JacketIssuedDate"]),
                    safetyEarMuffs: yesNo(row["IsEarMuffsIssued"]),
                    safetyEarMuffsDate: parseDate(row["EarMuffsIssuedDate"]),
                    safetyShoes: yesNo(row["IsSafetyShoesIssued"]),
                    safetyShoesDate: parseDate(row["SafetyShoesIssuedDate"]),
                    // System
                    branchId: branch.id,
                    status: "ACTIVE",
                    employmentType: str(row["EmployementType"]) ?? "Full-time",
                    userId,
                },
            })

            // Create OnboardingRecord
            await prisma.onboardingRecord.create({
                data: {
                    employeeId: employee.id,
                    status: "IN_PROGRESS",
                },
            })

            imported++
        } catch (err) {
            errors.push({ row: rowNum, reason: `DB error: ${(err as Error).message}` })
            skipped++
        }
    }

    return NextResponse.json({ imported, skipped, errors })
}
