// Helpers for deriving employee login credentials.
// Keep the login email + default password rules in one place so the auto-create
// flow (on employee creation) and the admin credentials page stay consistent.

export function buildLoginEmail(opts: { email?: string | null; phone?: string | null; employeeId?: string | null }): string {
    const email = opts.email?.trim()
    if (email) return email.toLowerCase()
    const phoneDigits = (opts.phone || "").replace(/\D/g, "")
    if (phoneDigits) return `${phoneDigits}@cims.app`
    const empId = (opts.employeeId || "user").toLowerCase().replace(/[^a-z0-9]/g, "")
    return `${empId}@cims.app`
}

export function defaultPassword(opts: { phone?: string | null }): string {
    const phoneDigits = (opts.phone || "").replace(/\D/g, "")
    const suffix = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : (phoneDigits || "1234")
    return `Grow@${suffix}`
}
