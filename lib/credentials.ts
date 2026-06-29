// Helpers for deriving employee login credentials.
// Keep the login id + default password rules in one place so the auto-create
// flow (on employee creation), bulk-generate and import all stay consistent.
//
// Policy: an employee's default Login ID AND default Password are both their
// mobile number. They can change the password after first login. (Login also
// works by phone via the auth phone-lookup, so the mobile number is the single
// thing they need to remember.)

const tenDigitPhone = (phone?: string | null): string => {
    const d = (phone || "").replace(/\D/g, "")
    return d.length >= 10 ? d.slice(-10) : d
}

// Login ID (stored in User.email): the mobile number when available, else the
// real email, else an employee-id-based handle.
export function buildLoginEmail(opts: { email?: string | null; phone?: string | null; employeeId?: string | null }): string {
    const phone = tenDigitPhone(opts.phone)
    if (phone.length === 10) return phone
    const email = opts.email?.trim()
    if (email) return email.toLowerCase()
    const empId = (opts.employeeId || "user").toLowerCase().replace(/[^a-z0-9]/g, "")
    return `${empId}@cims.app`
}

// Default password: the mobile number. Falls back to a fixed string only when
// no phone is on file (rare — phone is required for employees).
export function defaultPassword(opts: { phone?: string | null }): string {
    const phone = tenDigitPhone(opts.phone)
    return phone.length === 10 ? phone : (phone || "changeme123")
}
