import { NextResponse } from "next/server"
import { normalizeEmploymentType } from "@/lib/employment-type"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import prisma from "@/lib/prisma"
import { buildLoginEmail, NO_PASSWORD } from "@/lib/credentials"
import {
    validatePhone, validateAadhaar, validatePAN, validateIFSC,
    validateBankAccount, validateEmail, validatePincode, validateUAN,
    validateDateOfBirth, validateJoiningAge,
    normalizePhone, digitsOnly, normalizeUpper,
} from "@/lib/validation"
import { generateEmployeeCode } from "@/lib/employee-code"
import crypto from "crypto"

type Sv = string | number | undefined

interface ImportRow {
    firstName?: Sv; lastName?: Sv; phone?: Sv; email?: Sv
    designation?: Sv; role?: Sv; employmentType?: Sv; status?: Sv
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

// Convert Excel serial numbers (e.g. 45166) or date strings to JS Date.
// Excel serials: day 1 = 1900-01-01; Unix epoch offset = 25569 days.
// Node.js parses bare numeric strings as years (+045166-01-01) — this function avoids that.
const dt = (v?: Sv): Date | null => {
    if (v === undefined || v === null || v === "") return null

    // Numeric value (from xlsx parser) — treat as Excel serial
    if (typeof v === "number") {
        if (v < 1 || v > 2958465) return null          // outside 1900–9999 range
        const d = new Date(Math.round((v - 25569) * 86400000))
        return isNaN(d.getTime()) ? null : d
    }

    const s = String(v).trim()
    if (!s) return null

    // Pure numeric string like "45166" → also an Excel serial
    if (/^\d{4,6}$/.test(s)) {
        const n = parseInt(s, 10)
        if (n >= 1 && n <= 2958465) {
            const d = new Date(Math.round((n - 25569) * 86400000))
            if (!isNaN(d.getTime())) return d
        }
    }

    // DD/MM/YYYY or DD-MM-YYYY (common Indian format in spreadsheets)
    const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
    if (dmy) {
        const d = new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]))
        if (!isNaN(d.getTime())) return d
    }

    // ISO / other formats
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
}

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
        const [allSites, allDepartments, allRoles] = await Promise.all([
            prisma.site.findMany({ select: { id: true, name: true } }),
            prisma.department.findMany({ select: { id: true, name: true } }),
            prisma.customRole.findMany({ select: { id: true, name: true } }),
        ])
        const roleByName = new Map(allRoles.map(r => [r.name.toLowerCase(), r.id]))

        // ── Employee codes ───────────────────────────────────────────────────
        // The shared generator is the single source of EMP-NNNN numbering (it
        // ignores PENDING-/EXT- placeholders, which the old createdAt-based scan
        // here did not). Rows in a chunk are created concurrently, so code
        // generation is serialised through a promise chain and codes handed out
        // but not yet in the DB are kept in `reserved`.
        const reserved = new Set<string>()
        let codeQueue: Promise<unknown> = Promise.resolve()
        const nextCode = (): Promise<string> => {
            const p = codeQueue.then(async () => {
                const code = await generateEmployeeCode({ reserved })
                reserved.add(code)
                return code
            })
            codeQueue = p.catch(() => {})
            return p
        }

        // For rows without phone: check name+site duplicates
        const existingNameSite = await prisma.employee.findMany({
            select: { firstName: true, lastName: true, deployments: { where: { isActive: true }, select: { siteId: true }, take: 1 } }
        }).then(res => new Set(res.map(e => {
            const sId = e.deployments?.[0]?.siteId || ""
            return `${e.firstName.toLowerCase()}|${(e.lastName || "").toLowerCase()}|${sId}`
        })))

        // ── Pre-load existing phone / Aadhaar / PAN / email for system-wide dedupe ──
        // Everything is compared through the same normalisers the row is stored
        // with, so "+91 98765 43210" matches "9876543210" and "abcde1234f"
        // matches "ABCDE1234F". Legacy rows may still hold unnormalised values,
        // which is why the whole table is normalised here instead of queried.
        const idDocs = await prisma.employee.findMany({
            select: { phone: true, aadharNumber: true, panNumber: true, email: true, bankAccountNumber: true },
        })
        const existingPhones = new Set(idDocs.map(e => normalizePhone(e.phone)).filter(Boolean))
        const existingAadhar = new Set(idDocs.map(e => digitsOnly(e.aadharNumber)).filter(v => v.length >= 12))
        const existingPan    = new Set(idDocs.map(e => normalizeUpper(e.panNumber)).filter(v => v.length >= 10))
        const existingEmail  = new Set(idDocs.map(e => (e.email || "").trim().toLowerCase()).filter(Boolean))
        const existingBank   = new Set(idDocs.map(e => (e.bankAccountNumber || "").replace(/\s+/g, "")).filter(v => v.length >= 5))

        type RowResult = { skip: boolean; rowNum: number; reason?: string; warning?: string }

        // One row: validate, dedupe, create. Only ever called through the
        // chunked loop below.
        const processRow = async (row: ImportRow, i: number): Promise<RowResult> => {
            const rowNum    = i + 2
            const firstName = str(row.firstName)
            const phone     = normalizePhone(row.phone as string)

            if (!firstName) {
                return { skip: true, rowNum, reason: "Missing required field (First Name)" }
            }
            // Format checks before anything else. Import was the one bulk path
            // with no validation at all, so a spreadsheet could load hundreds
            // of rows with unusable Aadhaar / PAN / IFSC values in one go.
            // Blank stays acceptable — these columns are optional.
            const formatError =
                validatePhone(row.phone as string)
                ?? validateAadhaar(row.aadharNumber as string)
                ?? validatePAN(row.panNumber as string)
                ?? validateIFSC(row.bankIFSC as string)
                ?? validateBankAccount(row.bankAccountNumber as string)
                ?? validateEmail(row.email as string)
                ?? validatePincode(row.pincode as string)
                ?? validateUAN(row.uan as string)
                // Both dates go through dt() first: the sheet may carry
                // Excel serials, which new Date() reads as year numbers.
                ?? validateDateOfBirth(dt(row.dateOfBirth))
                ?? validateJoiningAge(dt(row.dateOfBirth), dt(row.dateOfJoining))
            if (formatError) {
                return { skip: true, rowNum, reason: formatError }
            }

            // Duplicate check: phone first, then name+site
            if (phone && existingPhones.has(phone)) {
                return { skip: true, rowNum, reason: `Duplicate: phone ${phone} already exists` }
            }
            // System-wide dedupe: Aadhaar / PAN / email (also reserves
            // in-memory so two rows in the same file can't both import).
            const aadharN = digitsOnly(str(row.aadharNumber))
            if (aadharN.length >= 12) {
                if (existingAadhar.has(aadharN)) return { skip: true, rowNum, reason: `Duplicate: Aadhaar ${aadharN} already exists` }
                existingAadhar.add(aadharN)
            }
            const panN = normalizeUpper(str(row.panNumber))
            if (panN.length >= 10) {
                if (existingPan.has(panN)) return { skip: true, rowNum, reason: `Duplicate: PAN ${panN} already exists` }
                existingPan.add(panN)
            }
            const emailN = str(row.email).trim().toLowerCase()
            if (emailN.includes("@")) {
                if (existingEmail.has(emailN)) return { skip: true, rowNum, reason: `Duplicate: email ${emailN} already exists` }
                existingEmail.add(emailN)
            }
            const bankN = str(row.bankAccountNumber).replace(/\s+/g, "")
            if (bankN.length >= 5) {
                if (existingBank.has(bankN)) return { skip: true, rowNum, reason: `Duplicate: bank account ${bankN} already exists` }
                existingBank.add(bankN)
            }
            if (phone) existingPhones.add(phone) // reserve to catch in-file phone dupes
            if (!phone) {
                const siteName = str(row.site)
                const siteId = siteName ? (allSites.find(s => s.name.toLowerCase() === siteName.toLowerCase())?.id ?? "") : ""
                const nameKey = `${firstName.toLowerCase()}|${str(row.lastName).toLowerCase()}|${siteId}`
                if (existingNameSite.has(nameKey)) {
                    return { skip: true, rowNum, reason: `Duplicate: ${firstName} ${str(row.lastName)} already at site ${siteName || "none"}` }
                }
                existingNameSite.add(nameKey)
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

            // Assigned only once the row has passed every check, so skipped
            // rows don't burn a number in the sequence.
            const finalId = await nextCode()

            const newEmp = await prisma.employee.create({
                select: { id: true },
                data: {
                    employeeId:    finalId,
                    createdBy:     session!.user.id,
                    firstName,
                    lastName:      str(row.lastName) || "",
                    phone:         phone || "",
                    email:         strN(row.email),
                    alternatePhone: strN(row.alternatePhone),
                    designation:   strN(row.designation),
                    employmentType: normalizeEmploymentType(str(row.employmentType)) || "Full-time",
                    status:        "ACTIVE",
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
                    // Stored normalised, same as the single-employee routes.
                    aadharNumber:  aadharN || null,
                    panNumber:     panN || null,
                    uan:           strN(row.uan),
                    pfNumber:      strN(row.pfNumber),
                    esiNumber:     strN(row.esiNumber),
                    labourCardNo:  strN(row.labourCardNo),
                    bankName:          strN(row.bankName),
                    bankBranch:        strN(row.bankBranch),
                    bankAccountNumber: strN(row.bankAccountNumber),
                    bankIFSC:          normalizeUpper(str(row.bankIFSC)) || null,
                    emergencyContact1Name:  strN(row.emergencyContact1Name),
                    emergencyContact1Phone: strN(row.emergencyContact1Phone),
                    emergencyContact2Name:  strN(row.emergencyContact2Name),
                    emergencyContact2Phone: strN(row.emergencyContact2Phone),
                    workSkill:    strN(row.workSkill),
                    natureOfWork: strN(row.natureOfWork),
                    notes:        strN(row.notes),
                },
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
                        proposedBy:       session!.user.id,
                        approvedBy:       session!.user.id,
                    },
                })
            }

            let warning: string | undefined

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
                warning = `Site "${siteName}" not found — employee created without site assignment`
            }

            // ── Auto-create a login for the imported employee ──
            // Mirrors single-employee creation: every employee gets an account
            // they can log in with. The optional "Role" column maps to a custom
            // role (access is driven purely by that role's permissions).
            if (newEmp) {
                try {
                    const roleName = str(row.role)
                    const customRoleId = roleName ? (roleByName.get(roleName.toLowerCase()) ?? null) : null
                    if (roleName && !customRoleId) {
                        warning = `Role "${roleName}" not found — employee created without a role`
                    }

                    const loginEmail = buildLoginEmail({ email: strN(row.email), phone, employeeId: finalId })
                    const existingUser = await prisma.user.findUnique({
                        where: { email: loginEmail },
                        select: { id: true, employeeProfile: { select: { id: true } } },
                    })
                    if (existingUser) {
                        // Only adopt an account that isn't already tied to someone else.
                        if (!existingUser.employeeProfile) {
                            await prisma.employee.update({ where: { id: newEmp.id }, data: { userId: existingUser.id } })
                        }
                    } else {
                        // No password: the employee signs in with an OTP and sets an MPIN.
                        const user = await prisma.user.create({
                            data: {
                                name: `${firstName} ${str(row.lastName)}`.trim(),
                                email: loginEmail,
                                password: NO_PASSWORD,
                                plainPassword: null,
                                phone: phone || null,
                                // Base role is vestigial; access comes from the custom role.
                                role: "MANAGER",
                                customRoleId,
                            },
                        })
                        await prisma.employee.update({ where: { id: newEmp.id }, data: { userId: user.id } })
                    }
                } catch (loginErr) {
                    // Non-fatal: employee is imported; login can be generated later
                    // from the Employee Logins page.
                    console.error("[EMPLOYEE_IMPORT] login creation failed", finalId, loginErr)
                }
            }

            if (phone) existingPhones.add(phone)
            return { skip: false, rowNum, ...(warning ? { warning } : {}) }
        }

        // ── Process rows in sequential chunks ──────────────────────────────────
        // Running every row at once meant hundreds of concurrent creates plus
        // bcrypt hashes in one burst, which blew through the 30s function limit
        // and exhausted the connection pool. 20 at a time keeps each request
        // well inside the budget; the client already batches the sheet into
        // 50-row requests.
        const CHUNK = 20
        for (let start = 0; start < rows.length; start += CHUNK) {
            const chunk = rows.slice(start, start + CHUNK)
            const results = await Promise.allSettled(chunk.map((row, j) => processRow(row, start + j)))

            results.forEach((result, j) => {
                // Same arithmetic as processRow: +2 for the header row and
                // Excel's 1-based numbering. A thrown error has no return value,
                // so the row number comes from the index, not from `row: 0`.
                const rowNum = start + j + 2
                if (result.status === "rejected") {
                    skipped++
                    errors.push({ row: rowNum, reason: `DB error: ${result.reason?.message ?? result.reason}` })
                    return
                }
                const val = result.value
                if (val.skip) {
                    skipped++
                    errors.push({ row: val.rowNum, reason: val.reason! })
                } else {
                    imported++
                    if (val.warning) errors.push({ row: val.rowNum, reason: val.warning })
                }
            })
        }

    } catch {
        return NextResponse.json({ error: "Failed to process import" }, { status: 500 })
    }

    return NextResponse.json({ imported, skipped, errors })
}
