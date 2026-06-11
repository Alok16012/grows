import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { buildLoginEmail, defaultPassword } from "@/lib/credentials"
import bcrypt from "bcryptjs"
import crypto from "crypto"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        
        const hasAccess = checkAccess(session, ["MANAGER", "HR_MANAGER", "ADMIN"], "employees.view")
        if (!hasAccess) {
            console.log("Access denied for employee GET. Session role:", session.user.role, "Permissions:", session.user.permissions)
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
        const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
        const pageSize = Math.min(1000, parseInt(searchParams.get("pageSize") ?? "50"))

        const where: Record<string, any> = {}
        if (branchId) where.branchId = branchId
        if (departmentId) where.departmentId = departmentId
        if (status) {
            where.status = status
        } else {
            // Exclude ONBOARDING employees from the default list — they only appear in Onboarding module
            where.status = { not: "ONBOARDING" }
        }
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

        const [employees, total] = await Promise.all([
            prisma.employee.findMany({
                where,
                include: {
                    department: { select: { id: true, name: true } },
                    employeeSalary: {
                        select: {
                            basic: true, da: true, washing: true, conveyance: true,
                            leaveWithWages: true, otherAllowance: true,
                            bonus: true,
                            otRatePerHour: true, canteenRatePerDay: true,
                            complianceType: true, status: true,
                            hra: true, ctcMonthly: true,
                        }
                    },
                    user: { select: { id: true, role: true, customRoleId: true, email: true, customRole: { select: { id: true, name: true, color: true } } } },
                    deployments: {
                        where: { isActive: true },
                        include: { site: { select: { id: true, name: true, code: true } } },
                        take: 1,
                        orderBy: { startDate: "desc" },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: pageSize,
                skip: (page - 1) * pageSize,
            }),
            prisma.employee.count({ where }),
        ])

        // Backfill profile photo from the latest PHOTO document for any
        // employee whose `photo` column is still empty (older records were
        // saved as documents only). Keeps avatars consistent everywhere.
        try {
            const missing = employees.filter(e => !e.photo).map(e => e.id)
            if (missing.length > 0) {
                const photos = await prisma.employeeDocument.findMany({
                    where: { employeeId: { in: missing }, type: "PHOTO" },
                    select: { employeeId: true, fileUrl: true },
                    orderBy: { uploadedAt: "desc" },
                })
                const photoMap = new Map<string, string>()
                for (const p of photos) {
                    if (!photoMap.has(p.employeeId)) photoMap.set(p.employeeId, p.fileUrl)
                }
                for (const e of employees) {
                    if (!e.photo && photoMap.has(e.id)) e.photo = photoMap.get(e.id)!
                }
            }
        } catch (e) {
            console.error("[EMPLOYEES_PHOTO_BACKFILL]", e)
        }

        return NextResponse.json({ employees, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }, {
            headers: {
                // Browser-cache for 10s — back-button / list re-renders within
                // 10s reuse the cached response instead of re-querying.
                "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
            },
        })
    } catch (error) {
        console.error("[EMPLOYEES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.create")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const {
            firstName, lastName, email, phone, alternatePhone,
            dateOfBirth, gender, address, city, state, pincode,
            aadharNumber, panNumber, bankAccountNumber, bankIFSC, bankName,
            photo, designation, departmentId, branchId,
            dateOfJoining, status, employmentType, basicSalary, notes,
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
            customRoleId,
        } = body

        if (!firstName) {
            return new NextResponse("firstName is required", { status: 400 })
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

        const onboardingToken = crypto.randomUUID().replace(/-/g, "")

        const employee = await prisma.employee.create({
            data: {
                employeeId: finalId,
                onboardingToken,
                firstName,
                lastName: lastName || "",
                email,
                phone: phone || "",
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
                branchId: branchId || null,
                dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : null,
                status: "ONBOARDING",
                employmentType: employmentType || "Full-time",
                basicSalary: basicSalary ? parseFloat(basicSalary) : 0,
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

        await prisma.onboardingRecord.create({
            data: { employeeId: employee.id, status: "NOT_STARTED" }
        })

        // Auto-provision a login (User account) so every employee gets an id/password
        // the moment they're created. Non-fatal: if it fails the employee still exists.
        let _login: { email: string; password: string } | null = null
        try {
            const loginEmail = buildLoginEmail({ email, phone, employeeId: finalId })
            // Custom role assigned → system role MANAGER (manager dashboard/sidebar);
            // no custom role → INSPECTION_BOY (field worker default). Mirrors fix-login.
            const systemRole = customRoleId ? "MANAGER" : "INSPECTION_BOY"
            const existingUser = await prisma.user.findUnique({
                where: { email: loginEmail },
                include: { employeeProfile: { select: { id: true } } },
            })
            if (existingUser) {
                // Link the existing account instead of creating a duplicate,
                // but only if it isn't already tied to another employee.
                if (!existingUser.employeeProfile) {
                    await prisma.employee.update({ where: { id: employee.id }, data: { userId: existingUser.id } })
                    await prisma.user.update({
                        where: { id: existingUser.id },
                        data: { customRoleId: customRoleId || null, role: systemRole as any },
                    })
                }
                _login = { email: loginEmail, password: existingUser.plainPassword || "(unchanged)" }
            } else {
                const plain = defaultPassword({ phone })
                const hashed = await bcrypt.hash(plain, 10)
                const user = await prisma.user.create({
                    data: {
                        name: `${firstName} ${lastName || ""}`.trim(),
                        email: loginEmail,
                        password: hashed,
                        plainPassword: plain,
                        phone: phone || null,
                        role: systemRole as any,
                        customRoleId: customRoleId || null,
                    },
                })
                await prisma.employee.update({ where: { id: employee.id }, data: { userId: user.id } })
                _login = { email: loginEmail, password: plain }
            }
        } catch (loginErr) {
            console.error("[EMPLOYEE_AUTO_LOGIN]", loginErr)
        }

        return NextResponse.json({
            ...employee,
            _onboardingLink: `/onboarding/${onboardingToken}`,
            _login,
        })
    } catch (error) {
        console.error("[EMPLOYEES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["ADMIN", "MANAGER", "HR_MANAGER"], "employees.delete")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { ids } = await req.json() as { ids: string[] }
        if (!Array.isArray(ids) || ids.length === 0) {
            return new NextResponse("ids array required", { status: 400 })
        }

        await prisma.$transaction([
            prisma.attendance.deleteMany({ where: { employeeId: { in: ids } } }),
            prisma.leave.deleteMany({ where: { employeeId: { in: ids } } }),
            prisma.payroll.deleteMany({ where: { employeeId: { in: ids } } }),
            prisma.advanceAndReimbursement.deleteMany({ where: { employeeId: { in: ids } } }),
            prisma.quizAttempt.deleteMany({ where: { employeeId: { in: ids } } }),
            prisma.employee.deleteMany({ where: { id: { in: ids } } }),
        ])

        return NextResponse.json({ success: true, deleted: ids.length })
    } catch (error) {
        console.error("[EMPLOYEES_BULK_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
