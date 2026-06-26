import prisma from "@/lib/prisma"

// Duplicate detection for employees. A new (or edited) employee must not reuse
// an existing employee's Aadhaar, PAN, mobile number, or email. Values are
// normalized before comparison so trivial formatting differences (spaces in
// Aadhaar, +91 on the phone, email casing) still count as a match.

export type DupField = "aadhar" | "pan" | "phone" | "email" | "bankAccount"

export interface DuplicateConflict {
    field: DupField
    label: string
    value: string
    employee: { id: string; employeeId: string; name: string }
}

const onlyDigits = (s?: string | null) => (s || "").replace(/\D/g, "")
const last10 = (s?: string | null) => {
    const d = onlyDigits(s)
    return d.length >= 10 ? d.slice(-10) : d
}

interface DupInput {
    aadharNumber?: string | null
    panNumber?: string | null
    phone?: string | null
    email?: string | null
    bankAccountNumber?: string | null
}

const noSpace = (s?: string | null) => (s || "").replace(/\s+/g, "")

const fullName = (e: { firstName: string; lastName: string | null }) =>
    `${e.firstName} ${e.lastName ?? ""}`.trim()

/**
 * Returns the list of fields on `input` that collide with an existing employee.
 * Pass `excludeId` when editing so the employee doesn't match itself.
 * Empty array means no duplicates.
 */
export async function findEmployeeDuplicates(input: DupInput, excludeId?: string): Promise<DuplicateConflict[]> {
    const aadhar = onlyDigits(input.aadharNumber)
    const pan = (input.panNumber || "").trim().toUpperCase()
    const phone = last10(input.phone)
    const email = (input.email || "").trim().toLowerCase()
    const bankAccount = noSpace(input.bankAccountNumber)

    const notSelf = excludeId ? { NOT: { id: excludeId } } : {}
    const select = { id: true, employeeId: true, firstName: true, lastName: true } as const
    const conflicts: DuplicateConflict[] = []

    // Aadhaar — match the raw input or its digit-only form (covers stored spaces).
    if (aadhar.length >= 12) {
        const hit = await prisma.employee.findFirst({
            where: { ...notSelf, OR: [{ aadharNumber: input.aadharNumber ?? undefined }, { aadharNumber: aadhar }] },
            select,
        })
        if (hit) conflicts.push({ field: "aadhar", label: "Aadhaar number", value: aadhar, employee: { id: hit.id, employeeId: hit.employeeId, name: fullName(hit) } })
    }

    // PAN — case-insensitive exact.
    if (pan.length >= 10) {
        const hit = await prisma.employee.findFirst({
            where: { ...notSelf, panNumber: { equals: pan, mode: "insensitive" } },
            select,
        })
        if (hit) conflicts.push({ field: "pan", label: "PAN number", value: pan, employee: { id: hit.id, employeeId: hit.employeeId, name: fullName(hit) } })
    }

    // Phone — compare on the last 10 digits.
    if (phone.length === 10) {
        const hit = await prisma.employee.findFirst({
            where: { ...notSelf, phone: { endsWith: phone } },
            select,
        })
        if (hit) conflicts.push({ field: "phone", label: "mobile number", value: phone, employee: { id: hit.id, employeeId: hit.employeeId, name: fullName(hit) } })
    }

    // Email — case-insensitive exact (only if provided).
    if (email && email.includes("@")) {
        const hit = await prisma.employee.findFirst({
            where: { ...notSelf, email: { equals: email, mode: "insensitive" } },
            select,
        })
        if (hit) conflicts.push({ field: "email", label: "email", value: email, employee: { id: hit.id, employeeId: hit.employeeId, name: fullName(hit) } })
    }

    // Bank account number — exact (match the raw input or its space-stripped
    // form). Skip very short values to avoid false positives.
    if (bankAccount.length >= 5) {
        const hit = await prisma.employee.findFirst({
            where: { ...notSelf, OR: [{ bankAccountNumber: input.bankAccountNumber ?? undefined }, { bankAccountNumber: bankAccount }] },
            select,
        })
        if (hit) conflicts.push({ field: "bankAccount", label: "bank account number", value: bankAccount, employee: { id: hit.id, employeeId: hit.employeeId, name: fullName(hit) } })
    }

    return conflicts
}

// Build a human-readable message from conflicts, e.g.
// "An employee already exists with this Aadhaar number (Ramesh K · EMP-0012)."
export function duplicateMessage(conflicts: DuplicateConflict[]): string {
    if (conflicts.length === 0) return ""
    const parts = conflicts.map(
        (c) => `${c.label} — already used by ${c.employee.name} (${c.employee.employeeId})`
    )
    return `Duplicate employee. ${parts.join("; ")}.`
}
