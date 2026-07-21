// Human-readable label for a user's role.
//
// INSPECTION_BOY is the system's catch-all default: anyone created without a
// specific role lands there. Labelling all of them "Inspector" is misleading —
// most are just staff who were never given a role. So prefer a custom role
// name, then the employee's designation, and only fall back to a neutral
// "Employee" (never a hard "Inspector") for base-role users.

const SYSTEM_LABELS: Record<string, string> = {
    ADMIN: "Admin",
    MANAGER: "Manager",
    HR_MANAGER: "HR Manager",
}

export function roleLabel(
    role?: string | null,
    opts?: { customRoleName?: string | null; designation?: string | null }
): string {
    const custom = opts?.customRoleName?.trim()
    if (custom) return custom

    if (role && SYSTEM_LABELS[role]) return SYSTEM_LABELS[role]

    // INSPECTION_BOY / CLIENT / unknown → show what they actually do, else a
    // neutral label. Never the raw "Inspector"/"INSPECTION_BOY" default.
    const designation = opts?.designation?.trim()
    return designation || "Employee"
}
