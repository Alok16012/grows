// Shared field validation for Indian identity, bank and contact data.
//
// One copy, used by BOTH the forms and the API routes. Client-side checks are
// for feedback only — anything that reaches the database must be re-checked on
// the server, because a form is trivially bypassed with a direct request.
//
// Every validator treats an empty value as VALID. Whether a field is required is
// a separate question from whether its format is right, and most of these fields
// are optional in the schema. Use `required()` for presence.

export type FieldError = string | null

// ─── Normalisers ─────────────────────────────────────────────────────────────

export const digitsOnly = (v: string | null | undefined): string =>
    (v ?? "").replace(/\D/g, "")

/** Last 10 digits, so "+91 98765 43210" and "9876543210" compare equal. */
export const normalizePhone = (v: string | null | undefined): string => {
    const d = digitsOnly(v)
    return d.length > 10 ? d.slice(-10) : d
}

export const normalizeUpper = (v: string | null | undefined): string =>
    (v ?? "").trim().toUpperCase()

// ─── Aadhaar ─────────────────────────────────────────────────────────────────

// UIDAI numbers carry a Verhoeff check digit. A length check alone accepts
// 123456789012, which is the value people type to get past a form.
const VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

function verhoeffValid(num: string): boolean {
    let c = 0
    const reversed = num.split("").reverse()
    for (let i = 0; i < reversed.length; i++) {
        c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(reversed[i])]]
    }
    return c === 0
}

export function validateAadhaar(value: string | null | undefined): FieldError {
    const d = digitsOnly(value)
    if (!d) return null
    if (d.length !== 12) return "Aadhaar must be 12 digits"
    // UIDAI never issues a number starting 0 or 1.
    if (d[0] === "0" || d[0] === "1") return "Aadhaar cannot start with 0 or 1"
    if (!verhoeffValid(d)) return "Aadhaar number is not valid (checksum failed)"
    return null
}

// ─── PAN ─────────────────────────────────────────────────────────────────────

// AAAAA9999A. The 4th character encodes the holder type — P for an individual,
// C company, H HUF, F firm, and so on. A plain [A-Z]{5} accepts ABCDE1234F-style
// values with an impossible holder type.
const PAN_HOLDER_TYPES = "ABCFGHJLPTK"

export function validatePAN(value: string | null | undefined): FieldError {
    const v = normalizeUpper(value)
    if (!v) return null
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)) return "PAN must look like ABCDE1234F"
    if (!PAN_HOLDER_TYPES.includes(v[3])) return `PAN's 4th character '${v[3]}' is not a valid holder type`
    return null
}

/**
 * Individuals only (4th character must be P).
 *
 * Deliberately NOT the default for employee and candidate forms. Those forms
 * re-validate every field on save, so requiring P would block edits to any
 * legacy record whose PAN was entered with a different holder type — even when
 * the person is only changing their phone number. `validatePAN` still rejects
 * an invalid holder character, which catches the common typo. Use this where a
 * form is known to collect fresh data for a person.
 */
export function validatePersonalPAN(value: string | null | undefined): FieldError {
    const base = validatePAN(value)
    if (base) return base
    const v = normalizeUpper(value)
    if (v && v[3] !== "P") return "PAN's 4th character must be P for an individual"
    return null
}

// ─── Phone ───────────────────────────────────────────────────────────────────

export function validatePhone(value: string | null | undefined): FieldError {
    const d = normalizePhone(value)
    if (!d) return null
    if (d.length !== 10) return "Mobile number must be 10 digits"
    if (!/^[6-9]/.test(d)) return "Indian mobile numbers start with 6, 7, 8 or 9"
    // 9999999999 and friends are placeholders, not numbers.
    if (/^(\d)\1{9}$/.test(d)) return "Enter a real mobile number"
    return null
}

// ─── Bank ────────────────────────────────────────────────────────────────────

export function validateIFSC(value: string | null | undefined): FieldError {
    const v = normalizeUpper(value)
    if (!v) return null
    // 4-letter bank code, a reserved 0, then a 6-character branch code.
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v)) return "IFSC must look like SBIN0001234"
    return null
}

export function validateBankAccount(value: string | null | undefined): FieldError {
    const d = digitsOnly(value)
    if (!d) return null
    if (d.length < 9 || d.length > 18) return "Bank account number must be 9–18 digits"
    if (/^0+$/.test(d)) return "Enter a real account number"
    return null
}

// ─── Statutory ids ───────────────────────────────────────────────────────────

export function validateUAN(value: string | null | undefined): FieldError {
    const d = digitsOnly(value)
    if (!d) return null
    if (d.length !== 12) return "UAN must be 12 digits"
    return null
}

export function validateESIC(value: string | null | undefined): FieldError {
    const d = digitsOnly(value)
    if (!d) return null
    if (d.length !== 10) return "ESIC number must be 10 digits"
    return null
}

export function validatePFNumber(value: string | null | undefined): FieldError {
    const d = digitsOnly(value)
    if (!d) return null
    if (d.length !== 12) return "PF number must be 12 digits"
    return null
}

// ─── Contact / address ───────────────────────────────────────────────────────

export function validateEmail(value: string | null | undefined): FieldError {
    const v = (value ?? "").trim()
    if (!v) return null
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "Enter a valid email address"
    return null
}

export function validatePincode(value: string | null | undefined): FieldError {
    const d = digitsOnly(value)
    if (!d) return null
    if (d.length !== 6) return "PIN code must be 6 digits"
    if (d[0] === "0") return "PIN code cannot start with 0"
    return null
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

export function required(value: unknown, label: string): FieldError {
    if (value === null || value === undefined) return `${label} is required`
    if (typeof value === "string" && !value.trim()) return `${label} is required`
    return null
}

/** A non-negative amount. Rejects NaN and the strings that coerce to it. */
export function validateAmount(value: unknown, label = "Amount"): FieldError {
    if (value === null || value === undefined || value === "") return null
    const n = Number(value)
    if (!Number.isFinite(n)) return `${label} must be a number`
    if (n < 0) return `${label} cannot be negative`
    return null
}

/** Date of birth: a real past date, and an age that could plausibly work. */
export function validateDateOfBirth(value: string | Date | null | undefined): FieldError {
    if (!value) return null
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return "Enter a valid date"
    const now = new Date()
    if (d > now) return "Date of birth cannot be in the future"
    const age = (now.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    if (age < 14) return "Employee must be at least 14 years old"
    if (age > 100) return "Check the date of birth"
    return null
}

// ─── Batch runner ────────────────────────────────────────────────────────────

export type ValidationMap = Record<string, FieldError>

/**
 * Collect the failing fields from a set of checks.
 * Returns null when everything passes, so callers can do:
 *   const errors = collectErrors({...}); if (errors) return 400
 */
export function collectErrors(checks: ValidationMap): ValidationMap | null {
    const errors: ValidationMap = {}
    for (const [field, error] of Object.entries(checks)) {
        if (error) errors[field] = error
    }
    return Object.keys(errors).length ? errors : null
}

/**
 * The standard shape API routes return on a validation failure.
 *
 * `error` carries the readable sentence rather than a generic label: most
 * callers toast `data.error`, and telling someone "Validation failed" without
 * saying which field is worse than useless. `fields` keeps the per-field detail
 * for callers that highlight inputs.
 */
export function validationResponse(errors: ValidationMap) {
    const message = Object.values(errors).join("; ")
    return {
        error: message,
        message,
        fields: errors,
    }
}
