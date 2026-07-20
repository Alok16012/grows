import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { findEmployeeDuplicates, duplicateMessage } from "@/lib/employee-dedupe"
import { deleteEmployeesAndLogins } from "@/lib/employee-delete"
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
        const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
        const pageSize = Math.min(1000, parseInt(searchParams.get("pageSize") ?? "50"))
        // `lite=1` strips the base64 `photo` blob from each row. Profile photos
        // are stored as data URLs, so a 500-row list shipped tens of MB and took
        // ~15s. Callers that don't render avatars (e.g. Employee Master) opt in;
        // a `hasPhoto` boolean is kept so presence is still known.
        const lite = searchParams.get("lite") === "1"

        const where: Record<string, any> = {}
        if (branchId) where.branchId = branchId
        if (departmentId) where.departmentId = departmentId
        if (status) {
            where.status = status
        } else {
            // Exclude ONBOARDING employees from the default list — they only appear in Onboarding module
            where.status = { not: "ONBOARDING" }
        }

        // Hide anyone still pending onboarding (placeholder EMP code / not yet
        // approved) regardless of employee.status — covers legacy records whose
        // status may be ACTIVE but whose onboarding was never completed. They only
        // live in the Onboarding module until approved.
        where.NOT = { onboardingRecord: { is: { status: { not: "COMPLETED" } } } }
        if (employmentType) where.employmentType = employmentType
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
            const missing = lite ? [] : employees.filter(e => !e.photo).map(e => e.id)
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

        // Salary is sensitive — strip it for anyone without the dedicated
        // `employees.viewSalary` permission (ADMIN always passes). Defense in
        // depth: the UI also hides these columns, but the server must never ship
        // salary data to a client that isn't allowed to see it.
        const canViewSalary = checkAccess(session, [], "employees.viewSalary")
        if (!canViewSalary) {
            for (const e of employees as any[]) {
                e.basicSalary = null
                e.salaryType = null
                e.employeeSalary = null
            }
        }

        // Drop the heavy base64 photo payload for lite callers, but expose a
        // boolean so the UI can still tell whether a photo exists.
        if (lite) {
            for (const e of employees as any[]) {
                e.hasPhoto = !!e.photo
                e.photo = null
            }
        }

        return NextResponse.json({ employees, total, page, pageSize, totalPages: Math.ceil(total / pageSize), canViewSalary }, {
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
        // Creatable by HR/employee managers, OR by recruiters converting a joined
        // candidate into an employee (Recruitment → Joined flow saves here).
        const canCreateEmployee = checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.create")
        const canCreateViaRecruitment = checkAccess(session, [], "recruitment.manage")
        if (!canCreateEmployee && !canCreateViaRecruitment) {
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
        } = body

        if (!firstName) {
            return new NextResponse("firstName is required", { status: 400 })
        }

        // Block duplicates — same Aadhaar / PAN / mobile / email as an existing
        // employee. Returns 409 with the conflicting fields so the UI can flag it.
        const conflicts = await findEmployeeDuplicates({ aadharNumber, panNumber, phone, email, bankAccountNumber })
        if (conflicts.length > 0) {
            return NextResponse.json(
                { error: duplicateMessage(conflicts), conflicts },
                { status: 409 }
            )
        }

        // Onboarding employees are PENDING approval. They DON'T consume a real
        // EMP-NNNN code and DON'T get a login until an admin approves their
        // onboarding. Until then they carry a temporary placeholder id (which is
        // swapped for the real EMP-NNNN code at approval time) and stay out of
        // the Employee Master and Employee Logins lists.
        const onboardingToken = crypto.randomUUID().replace(/-/g, "")
        const finalId = `PENDING-${onboardingToken.slice(0, 10).toUpperCase()}`

        const employee = await prisma.employee.create({
            data: {
                employeeId: finalId,
                onboardingToken,
                createdBy: session.user.id,
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

        // NOTE: No login is provisioned at creation time anymore. A login (User
        // account) with a real password is only created once the employee's
        // onboarding is APPROVED (see PUT /api/onboarding/[id] action="approve").
        // This keeps pending candidates out of the Employee Logins screen until
        // they're cleared.
        const _login: { email: string; password: string } | null = null

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

        // Delete every selected employee with all dependent records + logins.
        const { deleted, loginsRemoved } = await deleteEmployeesAndLogins(ids)

        return NextResponse.json({ success: true, deleted, loginsRemoved })
    } catch (error) {
        console.error("[EMPLOYEES_BULK_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
