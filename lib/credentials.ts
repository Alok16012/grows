// Helpers for deriving employee login credentials.
// Keep the login id rule in one place so the auto-create flow (on employee
// creation), bulk-generate and import all stay consistent.
//
// Policy: an employee's Login ID is their mobile number. There is NO default
// password — a new account carries the NO_PASSWORD marker and the employee
// signs in with an OTP to that mobile, sets an MPIN, and may then choose a
// password of their own.

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

// User.password is NOT nullable, so "no password" is this literal marker. It is
// not a bcrypt hash, so bcrypt.compare can never match it.
export const NO_PASSWORD = "!unset"

// True only for a real bcrypt hash — i.e. a password the user set themselves.
// The NO_PASSWORD marker and the `disabled-…` marker written on soft-delete
// both fail this test.
export const hasOwnPassword = (hash: string | null | undefined): boolean =>
    typeof hash === "string" && /^\$2[aby]\$/.test(hash)
