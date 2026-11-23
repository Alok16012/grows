import { waPhone } from "@/lib/whatsapp"

// Validation shared by the customer-contact routes.
export const CONTACT_READ = ["sites.view", "projects.edit", "approvals.view", "approvals.manage", "assignments.edit"]
export const CONTACT_WRITE = ["projects.edit", "approvals.manage", "assignments.edit"]
export const CONTACT_MISSING = "Customer contacts aren't set up on the database yet (scripts/customer-contacts.sql)."

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseContact(b: any): { ok: true; data: { name: string; designation: string | null; phone: string | null; email: string | null; projectIds: string[]; receiveReports: boolean; active: boolean } } | { ok: false; error: string } {
    const name = String(b?.name ?? "").trim().slice(0, 100)
    if (!name) return { ok: false, error: "Enter the contact's name." }
    const phoneRaw = String(b?.phone ?? "").trim()
    const phone = phoneRaw ? waPhone(phoneRaw) : null
    if (phoneRaw && !phone) return { ok: false, error: "Enter a valid 10-digit Indian mobile number." }
    const emailRaw = String(b?.email ?? "").trim().toLowerCase()
    if (emailRaw && !EMAIL_RE.test(emailRaw)) return { ok: false, error: "Enter a valid email address." }
    if (!phone && !emailRaw) return { ok: false, error: "Add a mobile number or an email." }
    return {
        ok: true,
        data: {
            name,
            designation: String(b?.designation ?? "").trim().slice(0, 80) || null,
            // Stored as 10 digits, shown as entered elsewhere.
            phone: phone ? phone.slice(2) : null,
            email: emailRaw || null,
            projectIds: Array.isArray(b?.projectIds) ? b.projectIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 200) : [],
            receiveReports: b?.receiveReports !== false,
            active: b?.active !== false,
        },
    }
}
