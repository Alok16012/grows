// People → Data quality: the fields we check, how, and which are required.
// Client-safe (the page and the server use the same rules).
import {
    validateAadhaar, validatePAN, validatePhone, validateIFSC, validateBankAccount, validateUAN, validateESIC,
    validatePFNumber, validateEmail, validatePincode, type FieldError,
} from "@/lib/validation"
import { normalizeEmploymentType, EMPLOYMENT_TYPES } from "@/lib/employment-type"

export type QField = {
    key: string
    label: string
    group: "Personal" | "Contact" | "KYC" | "Statutory" | "Bank" | "Employment" | "Documents"
    type?: "text" | "date" | "select" | "manager" | "department"
    options?: string[]
    validate?: (v: string) => FieldError
    /** Duplicates across employees are flagged for this field. */
    unique?: boolean
}

export const Q_FIELDS: QField[] = [
    { key: "dateOfBirth", label: "Date of birth", group: "Personal", type: "date" },
    { key: "gender", label: "Gender", group: "Personal", type: "select", options: ["Male", "Female", "Other"] },
    { key: "fathersName", label: "Father's name", group: "Personal" },
    { key: "bloodGroup", label: "Blood group", group: "Personal", type: "select", options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
    { key: "maritalStatus", label: "Marital status", group: "Personal", type: "select", options: ["Single", "Married", "Divorced", "Widowed"] },
    { key: "photo", label: "Photo", group: "Personal" },
    { key: "phone", label: "Mobile", group: "Contact", validate: validatePhone, unique: true },
    { key: "email", label: "Email", group: "Contact", validate: validateEmail },
    { key: "address", label: "Current address", group: "Contact" },
    { key: "pincode", label: "Pincode", group: "Contact", validate: validatePincode },
    { key: "permanentAddress", label: "Permanent address", group: "Contact" },
    { key: "emergencyContact1Name", label: "Emergency contact name", group: "Contact" },
    { key: "emergencyContact1Phone", label: "Emergency contact phone", group: "Contact", validate: validatePhone },
    { key: "aadharNumber", label: "Aadhaar", group: "KYC", validate: validateAadhaar, unique: true },
    { key: "panNumber", label: "PAN", group: "KYC", validate: validatePAN, unique: true },
    { key: "nameAsPerAadhar", label: "Name as per Aadhaar", group: "KYC" },
    { key: "uan", label: "UAN", group: "Statutory", validate: validateUAN, unique: true },
    { key: "pfNumber", label: "PF number", group: "Statutory", validate: validatePFNumber, unique: true },
    { key: "esiNumber", label: "ESIC number", group: "Statutory", validate: validateESIC, unique: true },
    { key: "bankAccountNumber", label: "Bank account", group: "Bank", validate: validateBankAccount, unique: true },
    { key: "bankIFSC", label: "IFSC", group: "Bank", validate: validateIFSC },
    { key: "bankName", label: "Bank name", group: "Bank" },
    { key: "designation", label: "Designation", group: "Employment" },
    { key: "departmentId", label: "Department", group: "Employment", type: "department" },
    { key: "managerId", label: "Reporting manager", group: "Employment", type: "manager" },
    { key: "dateOfJoining", label: "Date of joining", group: "Employment", type: "date" },
    { key: "employmentType", label: "Employment type", group: "Employment", type: "select", options: [...EMPLOYMENT_TYPES] },
    // Set in Payroll → Salary master; required when settings.requireSalary is on.
    { key: "salaryStructure", label: "Salary structure", group: "Employment" },
    // Uploaded KYC documents (EmployeeDocument); required per settings.requiredDocs.
    { key: "doc_AADHAAR", label: "Aadhaar card (upload)", group: "Documents" },
    { key: "doc_PAN", label: "PAN card (upload)", group: "Documents" },
    { key: "doc_PHOTO", label: "Photo (upload)", group: "Documents" },
    { key: "doc_BANK_DETAILS", label: "Bank passbook / cheque (upload)", group: "Documents" },
]
/** Documents every employee should have on file (keys of settings.requiredDocs). */
export const DOC_FIELDS = { AADHAAR: "Aadhaar card", PAN: "PAN card", PHOTO: "Photo", BANK_DETAILS: "Bank passbook / cheque" } as const
export type DocField = keyof typeof DOC_FIELDS
/** Computed by the server, not employee columns. */
export const VIRTUAL_FIELDS = new Set(["salaryStructure", ...Object.keys(DOC_FIELDS).map(k => `doc_${k}`)])
export const Q_FIELD = new Map(Q_FIELDS.map(f => [f.key, f]))
/** Fields set somewhere else: the photo on the profile, the salary in the salary master. */
export const NOT_FIXABLE_HERE = new Set(["photo", ...VIRTUAL_FIELDS])
/** Fields the data-quality fix may write. */
export const FIXABLE = new Set(Q_FIELDS.filter(f => !NOT_FIXABLE_HERE.has(f.key)).map(f => f.key))
/** Fields the employee can fill in My Profile (a reminder can ask them to). */
export const SELF_SERVICE_FIELDS = ["doc_AADHAAR", "doc_PAN", "doc_PHOTO", "doc_BANK_DETAILS", "photo", "address", "pincode", "permanentAddress", "emergencyContact1Name", "emergencyContact1Phone", "bloodGroup", "maritalStatus", "email"]

export type PeopleSettings = {
    /** Required fields per employment type; "default" for any type not listed. */
    required: Record<string, string[]>
    /** Flag duplicates of these fields across employees (active only, or everyone ever). */
    duplicatesAmong: "active" | "all"
    /** ESIC number only required when payroll would deduct ESIC (same limit and per-employee switch). */
    esicOnlyEligible: boolean
    /** Every employee needs a salary structure (basic above zero). */
    requireSalary: boolean
    /** Documents every employee must have uploaded. */
    requiredDocs: DocField[]
    /** Hours before the same employee can be reminded again to complete their profile. */
    reminderCooldownHours: number
    approval: {
        /** Fields whose changes need approval by someone else (People → Change requests). */
        fields: string[]
        /** The employee changing them in My Profile needs approval. */
        selfService: boolean
        /** HR changing them in the employee form needs a second person. */
        hrChanges: boolean
        /** Admins change them directly. */
        adminBypass: boolean
    }
}

const BASE_REQUIRED = ["dateOfBirth", "gender", "phone", "address", "aadharNumber", "panNumber", "bankAccountNumber", "bankIFSC", "designation", "departmentId", "managerId", "dateOfJoining", "emergencyContact1Phone", "photo"]
export const DEFAULT_PEOPLE_SETTINGS: PeopleSettings = {
    required: {
        default: BASE_REQUIRED,
        "Full-time": [...BASE_REQUIRED, "uan", "esiNumber"],
        "Contract": [...BASE_REQUIRED, "uan", "esiNumber"],
    },
    duplicatesAmong: "active",
    esicOnlyEligible: true,
    requireSalary: true,
    requiredDocs: ["AADHAAR", "PAN", "PHOTO", "BANK_DETAILS"],
    reminderCooldownHours: 24,
    approval: {
        fields: ["bankAccountNumber", "bankIFSC", "bankName", "panNumber", "aadharNumber", "nameAsPerAadhar", "uan", "pfNumber", "esiNumber", "firstName", "lastName", "dateOfBirth"],
        selfService: true, hrChanges: false, adminBypass: true,
    },
}

export function sanitizePeopleSettings(v: any): PeopleSettings {
    const d = DEFAULT_PEOPLE_SETTINGS
    const required: Record<string, string[]> = {}
    const src = v?.required && typeof v.required === "object" ? v.required : d.required
    for (const [type, list] of Object.entries(src as Record<string, unknown>)) {
        if (type !== "default" && !(EMPLOYMENT_TYPES as readonly string[]).includes(type)) continue
        if (Array.isArray(list)) required[type] = Array.from(new Set(list.filter((k): k is string => typeof k === "string" && Q_FIELD.has(k) && !VIRTUAL_FIELDS.has(k))))
    }
    if (!required.default) required.default = d.required.default
    const ap = v?.approval ?? {}
    const okField = (k: unknown): k is string => typeof k === "string" && /^[a-zA-Z]{2,40}$/.test(k)
    return {
        required, duplicatesAmong: v?.duplicatesAmong === "all" ? "all" : "active",
        esicOnlyEligible: typeof v?.esicOnlyEligible === "boolean" ? v.esicOnlyEligible : d.esicOnlyEligible,
        requireSalary: typeof v?.requireSalary === "boolean" ? v.requireSalary : d.requireSalary,
        requiredDocs: Array.isArray(v?.requiredDocs) ? Array.from(new Set<DocField>(v.requiredDocs.filter((x: unknown): x is DocField => typeof x === "string" && x in DOC_FIELDS))) : d.requiredDocs,
        reminderCooldownHours: Number.isFinite(Number(v?.reminderCooldownHours)) && v?.reminderCooldownHours !== null && v?.reminderCooldownHours !== "" ? Math.min(720, Math.max(0, Math.round(Number(v.reminderCooldownHours)))) : d.reminderCooldownHours,
        approval: {
            fields: Array.isArray(ap.fields) ? Array.from(new Set(ap.fields.filter(okField))) : d.approval.fields,
            selfService: typeof ap.selfService === "boolean" ? ap.selfService : d.approval.selfService,
            hrChanges: typeof ap.hrChanges === "boolean" ? ap.hrChanges : d.approval.hrChanges,
            adminBypass: typeof ap.adminBypass === "boolean" ? ap.adminBypass : d.approval.adminBypass,
        },
    }
}

export function requiredFor(s: PeopleSettings, employmentType: string | null | undefined): string[] {
    const t = normalizeEmploymentType(employmentType)
    const list = s.required[t] ?? s.required.default
    return [...list, ...(s.requireSalary ? ["salaryStructure"] : []), ...s.requiredDocs.map(k => `doc_${k}`)]
}

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "")

export type Issue = { field: string; label: string; kind: "missing" | "invalid"; message: string }

/** Missing required fields and wrong formats for one employee.
 *  `e.esicNotNeeded` (set by the server from payroll rules) drops the ESIC number
 *  from the required list when settings.esicOnlyEligible is on. */
export function checkEmployee(e: Record<string, any>, s: PeopleSettings): { issues: Issue[]; requiredCount: number; filled: number } {
    const req = requiredFor(s, e.employmentType).filter(k => !(k === "esiNumber" && s.esicOnlyEligible && e.esicNotNeeded === true))
    const issues: Issue[] = []
    let filled = 0
    for (const key of req) {
        const f = Q_FIELD.get(key)!
        if (isBlank(e[key])) issues.push({ field: key, label: f.label, kind: "missing", message: `${f.label} missing` })
        else filled++
    }
    for (const f of Q_FIELDS) {
        if (!f.validate || isBlank(e[f.key])) continue
        const err = f.validate(String(e[f.key]))
        if (err) issues.push({ field: f.key, label: f.label, kind: "invalid", message: err })
    }
    return { issues, requiredCount: req.length, filled }
}

/** Comparable form of a value for duplicate checks. */
export function dupKey(field: string, v: unknown): string {
    const s = String(v ?? "").trim()
    if (!s) return ""
    if (field === "phone") { const d = s.replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : d }
    if (["aadharNumber", "uan", "esiNumber", "bankAccountNumber"].includes(field)) return s.replace(/\D/g, "")
    return s.replace(/[\s/-]+/g, "").toUpperCase()
}
