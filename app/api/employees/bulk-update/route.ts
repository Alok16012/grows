import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import prisma from "@/lib/prisma"
import * as XLSX from "xlsx"
import { buildEmployeeWhere, employeeFiltersFromParams } from "@/lib/employee-filter"
import { findEmployeeDuplicates, duplicateMessage } from "@/lib/employee-dedupe"
import {
    validatePhone, validateEmail, validateAadhaar, validatePAN, validateIFSC,
    validateBankAccount, validatePincode, validateUAN, validateESIC, validatePFNumber,
    validateDateOfBirth, validateJoiningAge,
    digitsOnly, normalizePhone, normalizeUpper, normalizePFNumber,
    type FieldError,
} from "@/lib/validation"
import {
    BULK_FIELDS, BULK_FIELD_BY_KEY, BULK_ID_LABEL, BULK_PRESETS, BULK_REFERENCE_LABELS,
    parseSheetDate, toIsoDate,
    type BulkField, type BulkPreset, type BulkUpdateRow, type BulkUpdateError, type BulkUpdateResult,
} from "@/lib/employee-bulk-update"

// Same format checks as the single-employee PUT, keyed by field.
const VALIDATORS: Record<string, (v: string) => FieldError> = {
    phone: validatePhone,
    alternatePhone: validatePhone,
    emergencyContact1Phone: validatePhone,
    emergencyContact2Phone: validatePhone,
    email: validateEmail,
    aadharNumber: validateAadhaar,
    panNumber: validatePAN,
    bankIFSC: validateIFSC,
    bankAccountNumber: validateBankAccount,
    pincode: validatePincode,
    permanentPincode: validatePincode,
    uan: validateUAN,
    esiNumber: validateESIC,
    pfNumber: validatePFNumber,
    dateOfBirth: validateDateOfBirth,
}

const DUP_KEYS = ["aadharNumber", "panNumber", "phone", "email", "bankAccountNumber"] as const

/** One value in its stored form, so a sheet value and a DB value compare like for like. */
function normalize(field: BulkField, raw: string): string {
    switch (field.kind) {
        case "phone":  return normalizePhone(raw)
        case "digits": return digitsOnly(raw)
        case "upper":  return normalizeUpper(raw)
        case "pf":     return normalizePFNumber(raw)
        case "date": {
            const d = parseSheetDate(raw)
            return d ? toIsoDate(d) : ""
        }
        default:       return raw.trim()
    }
}

function storedAsString(field: BulkField, v: unknown): string {
    if (v === null || v === undefined) return ""
    if (v instanceof Date) return toIsoDate(v)
    return normalize(field, String(v))
}

const EMPLOYEE_SELECT = {
    id: true, employeeId: true,
    ...Object.fromEntries(BULK_FIELDS.map(f => [f.key, true])),
} as Record<string, true>

// ── GET: template pre-filled with the employees the page is showing ─────────
export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.edit")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const { searchParams } = new URL(req.url)
    const presetName = (searchParams.get("preset") ?? "statutory") as BulkPreset
    const preset = BULK_PRESETS[presetName] ?? BULK_PRESETS.statutory
    const fields = preset.keys.map(k => BULK_FIELD_BY_KEY.get(k)!)

    const employees = await prisma.employee.findMany({
        where: buildEmployeeWhere(employeeFiltersFromParams(searchParams)),
        select: {
            ...EMPLOYEE_SELECT,
            deployments: { where: { isActive: true }, select: { site: { select: { name: true } } }, take: 1 },
        },
        orderBy: { employeeId: "asc" },
    }) as unknown as (Record<string, unknown> & { deployments: { site: { name: string } }[] })[]

    const headers = [BULK_ID_LABEL, ...BULK_REFERENCE_LABELS, ...fields.map(f => f.label)]
    const rows = employees.map(e => [
        String(e.employeeId),
        `${e.firstName ?? ""} ${e.middleName ?? ""} ${e.lastName ?? ""}`.replace(/\s+/g, " ").trim(),
        e.deployments[0]?.site.name ?? "",
        ...fields.map(f => {
            const v = e[f.key]
            if (v === null || v === undefined) return ""
            return v instanceof Date ? toIsoDate(v) : String(v)
        }),
    ])

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    // Every cell as Text, so a 12-digit UAN or an 18-digit account number typed
    // into the sheet isn't turned into 1.23E+17 by Excel.
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1")
    const lastRow = Math.max(range.e.r, rows.length + 50)
    for (let r = 1; r <= lastRow; r++) {
        for (let c = 0; c < headers.length; c++) {
            const ref = XLSX.utils.encode_cell({ r, c })
            if (!ws[ref]) ws[ref] = { t: "s", v: "" }
            ws[ref].t = "s"
            ws[ref].z = "@"
        }
    }
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: headers.length - 1 } })
    ws["!cols"] = headers.map((h, i) => ({ wch: i === 1 ? 28 : Math.max(16, h.length + 2) }))

    const instructions = [
        ["How to use this sheet"],
        [""],
        ["1. Each row is an existing employee, matched on the Employee ID column. Do not change Employee IDs."],
        ["2. Fill or correct only the columns you want to change. A BLANK cell leaves that field as it is."],
        ["3. Name and Current Site columns are for reference only — edits there are ignored."],
        ["4. You can delete rows you are not updating, and delete columns you don't need."],
        ["5. Upload the file from Employees → Bulk Update. Invalid rows are skipped and listed; the rest are saved."],
        [""],
        ["Field", "Format"],
        ["UAN", "12 digits"],
        ["PF Number", "5 letters + 17 digits, e.g. PUPUN24506540000012118 (slashes allowed)"],
        ["ESIC Number", "10 digits"],
        ["Aadhar Number", "12 digits"],
        ["PAN Number", "ABCDE1234F"],
        ["Bank IFSC", "SBIN0001234"],
        ["Bank Account Number", "9–18 digits"],
        ["Phone", "10-digit mobile"],
        ["Dates", "DD/MM/YYYY or YYYY-MM-DD"],
        [""],
        ["Status, site, salary and role are not changed from this sheet — use the employee's own page for those."],
    ]
    const wi = XLSX.utils.aoa_to_sheet(instructions)
    wi["!cols"] = [{ wch: 26 }, { wch: 70 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Employees")
    XLSX.utils.book_append_sheet(wb, wi, "Instructions")
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer

    const today = new Date().toISOString().split("T")[0]
    return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="employee_bulk_update_${presetName}_${today}.xlsx"`,
        },
    })
}

// ── POST: apply a chunk of rows ──────────────────────────────────────────────
// Rows are processed one after another, not in parallel: a later row's
// duplicate check (Aadhaar, PAN, phone …) must see what an earlier row in the
// same file just wrote.
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.edit")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const rows: BulkUpdateRow[] = Array.isArray(body?.rows) ? body.rows : []
    if (rows.length > 200) {
        return NextResponse.json({ error: "Send at most 200 rows per request" }, { status: 400 })
    }

    const result: BulkUpdateResult = { updated: 0, unchanged: 0, failed: 0, errors: [] }
    const fail = (r: BulkUpdateRow, reason: string) => {
        result.failed++
        result.errors.push({ row: r.row, employeeId: r.employeeId, reason } satisfies BulkUpdateError)
    }

    const ids = Array.from(new Set(rows.map(r => String(r.employeeId ?? "").trim()).filter(Boolean)))
    const employees = await prisma.employee.findMany({
        where: { employeeId: { in: ids, mode: "insensitive" } },
        select: EMPLOYEE_SELECT,
    }) as unknown as (Record<string, unknown> & { id: string; employeeId: string })[]
    const byEmpId = new Map(employees.map(e => [e.employeeId.toUpperCase(), e]))

    for (const r of rows) {
        const emp = byEmpId.get(String(r.employeeId ?? "").trim().toUpperCase())
        if (!emp) { fail(r, "Employee ID not found"); continue }

        // Only fields whose value actually differs from what's stored. The
        // template comes pre-filled, so most cells equal the stored value; old
        // records with a legacy-format value must not fail on a column the
        // user never touched.
        const changes: Record<string, string> = {}
        const labels: string[] = []
        let rowError: string | null = null
        for (const [key, raw] of Object.entries(r.values ?? {})) {
            const field = BULK_FIELD_BY_KEY.get(key)
            if (!field || typeof raw !== "string" || !raw.trim()) continue
            const next = normalize(field, raw)
            if (field.kind === "date" && !next) { rowError = `${field.label}: "${raw}" is not a valid date`; break }
            if (next === storedAsString(field, emp[key])) continue
            const err = VALIDATORS[key]?.(next)
            if (err) { rowError = `${field.label}: ${err}`; break }
            changes[key] = next
            labels.push(field.label)
        }
        if (rowError) { fail(r, rowError); continue }
        if (labels.length === 0) { result.unchanged++; continue }

        if (changes.dateOfBirth || changes.dateOfJoining) {
            const dob = changes.dateOfBirth ?? (emp.dateOfBirth as Date | null)
            const doj = changes.dateOfJoining ?? (emp.dateOfJoining as Date | null)
            const ageError = validateJoiningAge(dob, doj)
            if (ageError) { fail(r, ageError); continue }
        }

        if (DUP_KEYS.some(k => changes[k])) {
            const conflicts = await findEmployeeDuplicates({
                aadharNumber: changes.aadharNumber,
                panNumber: changes.panNumber,
                phone: changes.phone,
                email: changes.email,
                bankAccountNumber: changes.bankAccountNumber,
            }, emp.id)
            if (conflicts.length > 0) { fail(r, duplicateMessage(conflicts)); continue }
        }

        const data: Record<string, unknown> = {}
        for (const [key, v] of Object.entries(changes)) {
            data[key] = BULK_FIELD_BY_KEY.get(key)!.kind === "date" ? new Date(`${v}T00:00:00.000Z`) : v
        }
        try {
            await prisma.employee.update({ where: { id: emp.id }, data })
            result.updated++
        } catch (e) {
            console.error("[EMPLOYEE_BULK_UPDATE]", emp.employeeId, e)
            fail(r, "Could not save this row")
        }
    }

    return NextResponse.json(result)
}
