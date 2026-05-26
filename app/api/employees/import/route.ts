import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import prisma from "@/lib/prisma"
import crypto from "crypto"

type Sv = string | number | undefined

interface ImportRow {
    firstName?: Sv; lastName?: Sv; phone?: Sv; email?: Sv
    designation?: Sv; employmentType?: Sv; status?: Sv
    dateOfJoining?: Sv; dateOfLeaving?: Sv
    department?: Sv; site?: Sv
    basicSalary?: Sv; da?: Sv; hra?: Sv; washing?: Sv; conveyance?: Sv
    leaveWithWages?: Sv; otherAllowance?: Sv; bonus?: Sv
    otRatePerHour?: Sv; canteenRatePerDay?: Sv; complianceType?: Sv
    middleName?: Sv; nameAsPerAadhar?: Sv; fathersName?: Sv
    dateOfBirth?: Sv; gender?: Sv; bloodGroup?: Sv
    maritalStatus?: Sv; nationality?: Sv; religion?: Sv; caste?: Sv
    address?: Sv; city?: Sv; state?: Sv; pincode?: Sv
    permanentAddress?: Sv; permanentCity?: Sv; permanentState?: Sv; permanentPincode?: Sv
    aadharNumber?: Sv; panNumber?: Sv; uan?: Sv; pfNumber?: Sv; esiNumber?: Sv; labourCardNo?: Sv
    bankName?: Sv; bankBranch?: Sv; bankAccountNumber?: Sv; bankIFSC?: Sv
    alternatePhone?: Sv
    emergencyContact1Name?: Sv; emergencyContact1Phone?: Sv
    emergencyContact2Name?: Sv; emergencyContact2Phone?: Sv
    workSkill?: Sv; natureOfWork?: Sv; notes?: Sv
}

const str  = (v?: Sv): string       => v !== undefined && v !== null ? String(v).trim() : ""
const strN = (v?: Sv): string|null  => { const s = str(v); return s || null }
const num  = (v?: Sv, def = 0): number => { const n = parseFloat(String(v ?? "")); return isNaN(n) ? def : n }
const dt   = (v?: Sv): Date|null    => { if (!v) return null; const d = new Date(String(v)); return isNaN(d.getTime()) ? null : d }

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.edit")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const rows: ImportRow[] = body.rows ?? []
    if (rows.length === 0) return NextResponse.json({ imported: 0, skipped: 0, errors: [] })

    let imported = 0
    let skipped  = 0
    const errors: { row: number; reason: string }[] = []

    try {
        // ── Pre-load lookup tables once ───────────────────────────────────────
        const [allSites, allDepartments] = await Promise.all([
            prisma.site.findMany({ select: { id: true, name: true } }),
            prisma.department.findMany({ select: { id: true, name: true } }),
        ])

        // ── Pre-load ALL existing employee IDs to avoid per-row DB lookups ───
        const existingEmpIds = await prisma.employee.findMany({
            select: { employeeId: true }
        }).then(r => new Set(r.map(e => e.employeeId)))

        const lastEmployee = await prisma.employee.findFirst({
            orderBy: { createdAt: "desc" }, select: { employeeId: true },
        })
        let nextNum = 1
        if (lastEmployee?.employeeId) {
            const match = lastEmployee.employeeId.match(/\d+$/)
            if (match) nextNum = parseInt(match[0]) + 1
        }

        // Pre-generate all employee IDs in memory (no per-row DB queries)
        const assignedIds: string[] = []
        for (let i = 0; i < rows.length; i++) {
            let finalId = `EMP-${String(nextNum).padStart(4, "0")}`
            while (existingEmpIds.has(finalId)) {
                nextNum++
                finalId = `EMP-${String(nextNum).padStart(4, "0")}`
            }
            existingEmpIds.add(finalId) // reserve in-memory so next row doesn't collide
            assignedIds.push(finalId)
            nextNum++
        }

        // ── Pre-check duplicate phones ────────────────────────────────────────
        const allPhones = rows.map(r => str(r.phone)).filter(Boolean)
        const existingPhones = await prisma.employee.findMany({
            where: { phone: { in: allPhones } }, select: { phone: true }
        }).then(res => new Set(res.map(r => r.phone)))

        // ── Process all rows in parallel (parallel bcrypt + parallel DB) ──────
        const results = await Promise.allSettled(
            rows.map(async (row, i) => {
                const rowNum    = i + 2
                const firstName = str(row.firstName)
                const phone     = str(row.phone)
                const finalId   = assignedIds[i]

                if (!firstName) {
                    return { skip: true, rowNum, reason: "Missing required field (First Name)" }
                }
                if (phone && existingPhones.has(phone)) {
                    return { skip: true, rowNum, reason: `Duplicate: phone ${phone} already exists` }
                }

                // Lookups
                const siteName = str(row.site)
                const siteId   = siteName
                    ? (allSites.find(s => s.name.toLowerCase() === siteName.toLowerCase())?.id ?? null)
                    : null
                const deptName     = str(row.department)
                const departmentId = deptName
                    ? (allDepartments.find(d => d.name.toLowerCase() === deptName.toLowerCase())?.id ?? null)
                    : null

                const hasSalary = row.basicSalary || row.da || row.washing || row.conveyance
                const onboardingToken = crypto.randomBytes(20).toString("hex")

                await prisma.employee.create({
                    data: {
                        employeeId:    finalId,
                        firstName,
                        lastName:      str(row.lastName) || "",
                        phone:         phone || "",
                        email:         strN(row.email),
                        alternatePhone: strN(row.alternatePhone),
                        designation:   strN(row.designation),
                        employmentType: str(row.employmentType) || "Full-time",
                        status:        "ONBOARDING",
                        onboardingToken,
                        dateOfJoining: dt(row.dateOfJoining),
                        dateOfLeaving: dt(row.dateOfLeaving),
                        basicSalary:   num(row.basicSalary),
                        branchId:      null,
                        departmentId,
                        middleName:       strN(row.middleName),
                        nameAsPerAadhar:  strN(row.nameAsPerAadhar),
                        fathersName:      strN(row.fathersName),
                        dateOfBirth:      dt(row.dateOfBirth),
                        gender:           strN(row.gender),
                        bloodGroup:       strN(row.bloodGroup),
                        maritalStatus:    strN(row.maritalStatus),
                        nationality:      strN(row.nationality),
                        religion:         strN(row.religion),
                        caste:            strN(row.caste),
                        address:          strN(row.address),
                        city:             strN(row.city),
                        state:            strN(row.state),
                        pincode:          strN(row.pincode),
                        permanentAddress: strN(row.permanentAddress),
                        permanentCity:    strN(row.permanentCity),
                        permanentState:   strN(row.permanentState),
                        permanentPincode: strN(row.permanentPincode),
                        aadharNumber:  strN(row.aadharNumber),
                        panNumber:     strN(row.panNumber),
                        uan:           strN(row.uan),
                        pfNumber:      strN(row.pfNumber),
                        esiNumber:     strN(row.esiNumber),
                        labourCardNo:  strN(row.labourCardNo),
                        bankName:          strN(row.bankName),
                        bankBranch:        strN(row.bankBranch),
                        bankAccountNumber: strN(row.bankAccountNumber),
                        bankIFSC:          strN(row.bankIFSC),
                        emergencyContact1Name:  strN(row.emergencyContact1Name),
                        emergencyContact1Phone: strN(row.emergencyContact1Phone),
                        emergencyContact2Name:  strN(row.emergencyContact2Name),
                        emergencyContact2Phone: strN(row.emergencyContact2Phone),
                        workSkill:    strN(row.workSkill),
                        natureOfWork: strN(row.natureOfWork),
                        notes:        strN(row.notes),
                    },
                })

                // Fetch the UUID of the newly created employee
                const newEmp = await prisma.employee.findUnique({
                    where: { employeeId: finalId }, select: { id: true }
                })

                // Salary structure
                if (hasSalary && newEmp) {
                    const basic      = num(row.basicSalary)
                    const da         = num(row.da)
                    const hra        = num(row.hra)
                    const washing    = num(row.washing)
                    const conveyance = num(row.conveyance)
                    const lww        = num(row.leaveWithWages)
                    const other      = num(row.otherAllowance)
                    const bonus      = num(row.bonus)
                    const otRate     = num(row.otRatePerHour, 170)
                    const canteen    = num(row.canteenRatePerDay, 55)
                    const cType      = str(row.complianceType).toUpperCase() === "CALL" ? "CALL" : "OR"
                    const ctcM       = basic + da + hra + washing + conveyance + lww + bonus + other
                    await prisma.employeeSalary.create({
                        data: {
                            employeeId:       newEmp.id,
                            basic, da, washing, conveyance,
                            leaveWithWages:   lww,
                            otherAllowance:   other,
                            bonus,
                            otRatePerHour:    otRate,
                            canteenRatePerDay: canteen,
                            hra, ctcMonthly: ctcM, ctcAnnual: ctcM * 12,
                            complianceType:   cType,
                            status:           "APPROVED",
                            proposedBy:       session.user.id,
                            approvedBy:       session.user.id,
                        },
                    })
                }

                // Site deployment
                if (siteId && newEmp) {
                    await prisma.deployment.create({
                        data: {
                            employeeId: newEmp.id,
                            siteId,
                            startDate:  dt(row.dateOfJoining) ?? new Date(),
                            isActive:   true,
                        },
                    })
                } else if (siteName && !siteId && newEmp) {
                    return {
                        skip: false, rowNum,
                        warning: `Site "${siteName}" not found — employee created without site assignment`
                    }
                }

                // Create onboarding record so employee appears in onboarding pipeline
                if (newEmp) {
                    const existing = await prisma.onboardingRecord.findUnique({ where: { employeeId: newEmp.id } })
                    if (!existing) {
                        await prisma.onboardingRecord.create({
                            data: { employeeId: newEmp.id, status: "NOT_STARTED" }
                        })
                    }
                }

                if (phone) existingPhones.add(phone)
                return { skip: false, rowNum }
            })
        )

        for (const result of results) {
            if (result.status === "rejected") {
                skipped++
                errors.push({ row: 0, reason: `DB error: ${result.reason?.message ?? result.reason}` })
            } else {
                const val = result.value
                if (val.skip) {
                    skipped++
                    errors.push({ row: val.rowNum, reason: val.reason! })
                } else {
                    imported++
                    if ("warning" in val && val.warning) {
                        errors.push({ row: val.rowNum, reason: val.warning })
                    }
                }
            }
        }

    } catch {
        return NextResponse.json({ error: "Failed to process import" }, { status: 500 })
    }

    return NextResponse.json({ imported, skipped, errors })
}
