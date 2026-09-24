// Bulk update of EXISTING employees from a spreadsheet.
//
// Shared by the template route, the update route and the Employees page, so the
// column a template writes is the column the upload reads back. Nothing here
// touches the database — this file is imported client-side too.
//
// Rows are matched on Employee ID. A blank cell means "leave as it is", which
// is what lets HR send a sheet with only UAN / PF / ESIC filled in for 700
// people without wiping everything else. Status, site, salary and role are
// deliberately not here: changing those has side effects (deployments, login
// access, salary approval) that belong to the single-employee screens.

export type BulkFieldKind = "text" | "phone" | "email" | "digits" | "upper" | "pf" | "date"

export interface BulkField {
    key: string
    label: string
    kind: BulkFieldKind
}

export const BULK_ID_LABEL = "Employee ID*"

// Reference columns: written into the template so HR can tell rows apart,
// ignored on upload.
export const BULK_REFERENCE_LABELS = ["Employee Name (reference)", "Current Site (reference)"] as const

export const BULK_FIELDS: BulkField[] = [
    // Statutory
    { key: "uan",               label: "UAN",                 kind: "digits" },
    { key: "pfNumber",          label: "PF Number",           kind: "pf" },
    { key: "esiNumber",         label: "ESIC Number",         kind: "digits" },
    { key: "aadharNumber",      label: "Aadhar Number",       kind: "digits" },
    { key: "panNumber",         label: "PAN Number",          kind: "upper" },
    { key: "labourCardNo",      label: "Labour Card No",      kind: "text" },
    // Bank
    { key: "bankName",          label: "Bank Name",           kind: "text" },
    { key: "bankBranch",        label: "Bank Branch",         kind: "text" },
    { key: "bankAccountNumber", label: "Bank Account Number", kind: "digits" },
    { key: "bankIFSC",          label: "Bank IFSC",           kind: "upper" },
    // Personal
    { key: "firstName",         label: "First Name",          kind: "text" },
    { key: "middleName",        label: "Middle Name",         kind: "text" },
    { key: "lastName",          label: "Last Name",           kind: "text" },
    { key: "nameAsPerAadhar",   label: "Name As Per Aadhar",  kind: "text" },
    { key: "fathersName",       label: "Fathers Name",        kind: "text" },
    { key: "dateOfBirth",       label: "Date Of Birth",       kind: "date" },
    { key: "gender",            label: "Gender",              kind: "text" },
    { key: "bloodGroup",        label: "Blood Group",         kind: "text" },
    { key: "maritalStatus",     label: "Marital Status",      kind: "text" },
    { key: "nationality",       label: "Nationality",         kind: "text" },
    { key: "religion",          label: "Religion",            kind: "text" },
    { key: "caste",             label: "Caste",               kind: "text" },
    // Contact
    { key: "phone",             label: "Phone",               kind: "phone" },
    { key: "alternatePhone",    label: "Alternate Phone",     kind: "phone" },
    { key: "email",             label: "Email",               kind: "email" },
    { key: "address",           label: "Address",             kind: "text" },
    { key: "city",              label: "City",                kind: "text" },
    { key: "state",             label: "State",               kind: "text" },
    { key: "pincode",           label: "Pincode",             kind: "digits" },
    { key: "permanentAddress",  label: "Permanent Address",   kind: "text" },
    { key: "permanentCity",     label: "Permanent City",      kind: "text" },
    { key: "permanentState",    label: "Permanent State",     kind: "text" },
    { key: "permanentPincode",  label: "Permanent Pincode",   kind: "digits" },
    { key: "emergencyContact1Name",  label: "Emergency Contact 1 Name",  kind: "text" },
    { key: "emergencyContact1Phone", label: "Emergency Contact 1 Phone", kind: "phone" },
    { key: "emergencyContact2Name",  label: "Emergency Contact 2 Name",  kind: "text" },
    { key: "emergencyContact2Phone", label: "Emergency Contact 2 Phone", kind: "phone" },
    // Work
    { key: "designation",       label: "Designation",         kind: "text" },
    { key: "dateOfJoining",     label: "Date Of Joining",     kind: "date" },
    { key: "workSkill",         label: "Work Skill",          kind: "text" },
    { key: "natureOfWork",      label: "Nature Of Work",      kind: "text" },
    { key: "contractorCode",    label: "Contractor Code",     kind: "text" },
    { key: "workOrderNumber",   label: "Work Order Number",   kind: "text" },
    { key: "notes",             label: "Notes",               kind: "text" },
]

export const BULK_FIELD_BY_KEY = new Map(BULK_FIELDS.map(f => [f.key, f]))

export const BULK_PRESETS = {
    statutory: { label: "PF / ESIC / UAN", keys: ["uan", "pfNumber", "esiNumber", "aadharNumber", "panNumber"] },
    bank:      { label: "Bank details",    keys: ["bankName", "bankBranch", "bankAccountNumber", "bankIFSC"] },
    all:       { label: "All fields",      keys: BULK_FIELDS.map(f => f.key) },
} as const

export type BulkPreset = keyof typeof BULK_PRESETS

/** Header text → comparable form: "ESIC Number" / "esic_number" / "ESI No." all line up. */
const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "")

const HEADER_ALIASES: Record<string, string> = {
    employeeid: "employeeId", empid: "employeeId", empcode: "employeeId", employeecode: "employeeId",
    uanno: "uan", uannumber: "uan",
    pfno: "pfNumber",
    esicno: "esiNumber", esino: "esiNumber", esinumber: "esiNumber", esic: "esiNumber",
    aadharno: "aadharNumber", aadhaarno: "aadharNumber", aadhaarnumber: "aadharNumber",
    panno: "panNumber",
    bankaccount: "bankAccountNumber", accountnumber: "bankAccountNumber", ifsc: "bankIFSC",
    mobile: "phone", mobilenumber: "phone",
}
for (const f of BULK_FIELDS) HEADER_ALIASES[headerKey(f.label)] = f.key

/** Maps a sheet header to a field key, "employeeId", or null for columns to ignore. */
export function resolveBulkHeader(header: string): string | null {
    return HEADER_ALIASES[headerKey(header)] ?? null
}

/**
 * A cell as text. Long ids typed into a General-format cell come back from
 * Excel as numbers; anything past 15 digits has already lost its tail by then,
 * so it is refused rather than saved wrong.
 */
export function cellToString(v: unknown): { value: string; error?: string } {
    if (v === null || v === undefined) return { value: "" }
    if (typeof v === "number") {
        if (Number.isInteger(v) && !Number.isSafeInteger(v)) {
            return { value: "", error: "number is too long for Excel — format the column as Text and re-type it" }
        }
        return { value: String(v) }
    }
    if (v instanceof Date) return { value: toIsoDate(v) }
    return { value: String(v).trim() }
}

export const toIsoDate = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Spreadsheet date → Date at UTC midnight. Accepts Excel serials (45166),
 * DD/MM/YYYY, DD-MM-YYYY and YYYY-MM-DD. Everything lands on UTC midnight so a
 * date compares equal to the stored one regardless of the server's timezone.
 */
export function parseSheetDate(s: string): Date | null {
    const v = s.trim()
    if (!v) return null
    if (/^\d{4,6}(\.\d+)?$/.test(v)) {
        const n = Math.floor(parseFloat(v))
        if (n < 1 || n > 2958465) return null
        const d = new Date((n - 25569) * 86400000)
        return isNaN(d.getTime()) ? null : d
    }
    const dmy = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
    if (dmy) return safeUtc(+dmy[3], +dmy[2], +dmy[1])
    const ymd = v.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
    if (ymd) return safeUtc(+ymd[1], +ymd[2], +ymd[3])
    return null
}

function safeUtc(y: number, m: number, d: number): Date | null {
    const dt = new Date(Date.UTC(y, m - 1, d))
    // Rejects 31/02/2024 rather than rolling it into March.
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
    return dt
}

export interface BulkUpdateRow {
    /** 1-based sheet row, for error messages. */
    row: number
    employeeId: string
    values: Record<string, string>
}

export interface BulkUpdateError {
    row: number
    employeeId: string
    reason: string
}

export interface BulkUpdateResult {
    updated: number
    unchanged: number
    failed: number
    errors: BulkUpdateError[]
}
