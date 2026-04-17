import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import bcrypt from "bcryptjs"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const branchId = searchParams.get("branchId")
        const departmentId = searchParams.get("departmentId")
        const siteId = searchParams.get("siteId")
        const status = searchParams.get("status")
        const search = searchParams.get("search")
        const employmentType = searchParams.get("employmentType")
        const companyId = searchParams.get("companyId")

        const where: Record<string, any> = {}
        if (branchId) where.branchId = branchId
        if (departmentId) where.departmentId = departmentId
        if (status) where.status = status
        if (employmentType) where.employmentType = employmentType
        if (companyId) {
            // filter via branch -> company
            where.branch = { companyId }
        }
        if (siteId) {
            where.deployments = {
                some: {
                    siteId,
                    isActive: true
                }
            }
        }

        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { employeeId: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
                { designation: { contains: search, mode: "insensitive" } },
            ]
        }

        const employees = await prisma.employee.findMany({
            where,
            include: {
                department: { select: { id: true, name: true } },
                _count: { select: { attendances: true, leaves: true } },
                employeeSalary: true,
                user: { select: { role: true, customRole: { select: { name: true } } } },
                deployments: {
                    where: { isActive: true },
                    include: { site: { select: { id: true, name: true, code: true } } },
                    take: 1,
                    orderBy: { startDate: "desc" },
                },
            },
            orderBy: { createdAt: "desc" },
        })

        return NextResponse.json(employees)
    } catch (error) {
        console.error("[EMPLOYEES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const {
            firstName, lastName, email, phone, alternatePhone,
            dateOfBirth, gender, address, city, state, pincode,
            aadharNumber, panNumber, bankAccountNumber, bankIFSC, bankName,
            photo, designation, departmentId, branchId,
            dateOfJoining, status, employmentType, basicSalary, notes,
            customRoleId, systemRole,
            // New fields
            middleName, nameAsPerAadhar, fathersName, bloodGroup, maritalStatus, marriageDate, nationality, religion, caste,
            uan, pfNumber, esiNumber, labourCardNo, labourCardExpDate,
            contractFrom, contractPeriodDays, contractorCode, workOrderNumber, workOrderFrom, workOrderTo, workSkill, natureOfWork, categoryCode, employmentTypeCode,
            emergencyContact1Name, emergencyContact1Phone, emergencyContact2Name, emergencyContact2Phone,
            permanentAddress, permanentCity, permanentState, permanentPincode,
            isBackgroundChecked, backgroundCheckRemark, isMedicalDone, medicalRemark,
            safetyGoggles, safetyGogglesDate, safetyGloves, safetyGlovesDate,
            safetyHelmet, safetyHelmetDate, safetyMask, safetyMaskDate,
            safetyJacket, safetyJacketDate, safetyEarMuffs, safetyEarMuffsDate,
            safetyShoes, safetyShoesDate, bankBranch,
        } = body

        let finalBranchId = branchId
        if (!finalBranchId) {
            const firstBranch = await prisma.branch.findFirst({ select: { id: true } })
            finalBranchId = firstBranch?.id
        }

        if (!firstName || !lastName || !phone) {
            return new NextResponse("firstName, lastName and phone are required", { status: 400 })
        }

        // Auto-generate employeeId as EMP-NNNN
        const lastEmployee = await prisma.employee.findFirst({
            orderBy: { createdAt: "desc" },
            select: { employeeId: true },
        })
        let nextNum = 1
        if (lastEmployee?.employeeId) {
            const match = lastEmployee.employeeId.match(/\d+$/)
            if (match) nextNum = parseInt(match[0]) + 1
        }
        const employeeId = `EMP-${String(nextNum).padStart(4, "0")}`

        // Check uniqueness (race condition safety)
        const existing = await prisma.employee.findUnique({ where: { employeeId } })
        const finalId = existing
            ? `EMP-${String(nextNum + 1).padStart(4, "0")}`
            : employeeId

        // ── Auto-create User account ──────────────────────────────────────────
        // Email: use provided email, else phone@cims.local
        // Password: phone number (employee can change later)
        // Role: INSPECTION_BOY by default
        const userEmail = email || `${phone}@cims.local`
        const passwordHash = await bcrypt.hash(phone, 10)

        // Check if user already exists with this email
        const existingUser = await prisma.user.findUnique({ where: { email: userEmail } })

        // Validate system role — only allow valid role values
        const VALID_ROLES = ["ADMIN", "MANAGER", "HR_MANAGER", "INSPECTION_BOY", "CLIENT"]
        const assignedRole = (systemRole && VALID_ROLES.includes(systemRole)) ? systemRole : "INSPECTION_BOY"

        let userId: string
        if (existingUser) {
            userId = existingUser.id
            // Update role and customRoleId if provided
            const updatePayload: Record<string, unknown> = {}
            if (systemRole && VALID_ROLES.includes(systemRole)) updatePayload.role = assignedRole
            if (customRoleId) updatePayload.customRoleId = customRoleId
            if (Object.keys(updatePayload).length > 0) {
                await prisma.user.update({ where: { id: existingUser.id }, data: updatePayload })
            }
        } else {
            const newUser = await prisma.user.create({
                data: {
                    name: `${firstName} ${lastName}`,
                    email: userEmail,
                    password: passwordHash,
                    role: assignedRole,
                    customRoleId: customRoleId || null,
                },
            })
            userId = newUser.id
        }

        const employee = await prisma.employee.create({
            data: {
                employeeId: finalId,
                firstName,
                lastName,
                email,
                phone,
                alternatePhone,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                gender,
                address,
                city,
                state,
                pincode,
                aadharNumber,
                panNumber,
                bankAccountNumber,
                bankIFSC,
                bankName,
                photo,
                designation,
                departmentId: departmentId || null,
                branchId: finalBranchId,
                dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : null,
                status: status || "ACTIVE",
                employmentType: employmentType || "Full-time",
                basicSalary: basicSalary ? parseFloat(basicSalary) : 0,
                userId,
                // New fields
                middleName: middleName || null,
                nameAsPerAadhar: nameAsPerAadhar || null,
                fathersName: fathersName || null,
                bloodGroup: bloodGroup || null,
                maritalStatus: maritalStatus || null,
                marriageDate: marriageDate ? new Date(marriageDate) : null,
                nationality: nationality || "Indian",
                religion: religion || null,
                caste: caste || null,
                uan: uan || null,
                pfNumber: pfNumber || null,
                esiNumber: esiNumber || null,
                labourCardNo: labourCardNo || null,
                labourCardExpDate: labourCardExpDate ? new Date(labourCardExpDate) : null,
                contractFrom: contractFrom ? new Date(contractFrom) : null,
                contractPeriodDays: contractPeriodDays ? parseInt(String(contractPeriodDays)) : null,
                contractorCode: contractorCode || null,
                workOrderNumber: workOrderNumber || null,
                workOrderFrom: workOrderFrom ? new Date(workOrderFrom) : null,
                workOrderTo: workOrderTo ? new Date(workOrderTo) : null,
                workSkill: workSkill || null,
                natureOfWork: natureOfWork || null,
                categoryCode: categoryCode || null,
                employmentTypeCode: employmentTypeCode || null,
                emergencyContact1Name: emergencyContact1Name || null,
                emergencyContact1Phone: emergencyContact1Phone || null,
                emergencyContact2Name: emergencyContact2Name || null,
                emergencyContact2Phone: emergencyContact2Phone || null,
                permanentAddress: permanentAddress || null,
                permanentCity: permanentCity || null,
                permanentState: permanentState || null,
                permanentPincode: permanentPincode || null,
                isBackgroundChecked: isBackgroundChecked ?? false,
                backgroundCheckRemark: backgroundCheckRemark || null,
                isMedicalDone: isMedicalDone ?? false,
                medicalRemark: medicalRemark || null,
                safetyGoggles: safetyGoggles ?? false,
                safetyGogglesDate: safetyGogglesDate ? new Date(safetyGogglesDate) : null,
                safetyGloves: safetyGloves ?? false,
                safetyGlovesDate: safetyGlovesDate ? new Date(safetyGlovesDate) : null,
                safetyHelmet: safetyHelmet ?? false,
                safetyHelmetDate: safetyHelmetDate ? new Date(safetyHelmetDate) : null,
                safetyMask: safetyMask ?? false,
                safetyMaskDate: safetyMaskDate ? new Date(safetyMaskDate) : null,
                safetyJacket: safetyJacket ?? false,
                safetyJacketDate: safetyJacketDate ? new Date(safetyJacketDate) : null,
                safetyEarMuffs: safetyEarMuffs ?? false,
                safetyEarMuffsDate: safetyEarMuffsDate ? new Date(safetyEarMuffsDate) : null,
                safetyShoes: safetyShoes ?? false,
                safetyShoesDate: safetyShoesDate ? new Date(safetyShoesDate) : null,
                bankBranch: bankBranch || null,
            },
        })

        return NextResponse.json({
            ...employee,
            _userCreated: !existingUser,
            _loginEmail: userEmail,
            _loginPassword: phone,
        })
    } catch (error) {
        console.error("[EMPLOYEES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
