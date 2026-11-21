// Communication Center — the events the ERP can tell people about. Safe to
// import on the client (plain data). Each event lists the values its
// templates can use ({name}, {project}…) with sample values for previews and
// test sends, the order those values fill a WhatsApp template's {{1}} {{2}}…,
// and the default email wording until someone changes it in settings.

export type Channel = "whatsapp" | "email" | "inapp"
export const CHANNELS: { key: Channel; label: string }[] = [
    { key: "whatsapp", label: "WhatsApp" },
    { key: "email", label: "Email" },
    { key: "inapp", label: "In-app" },
]

// "all" = sent to whoever a broadcast picks (employees or customers).
export type Audience = "employee" | "customer" | "all"
export type CommVar = { key: string; label: string; sample: string }
export type CommEvent = {
    key: string
    label: string
    audience: Audience
    description: string
    vars: CommVar[]
    /** Which vars fill WhatsApp {{1}}, {{2}}… in order. */
    waParams: string[]
    /** True when the WhatsApp template should carry a document header (PDF). */
    waDocument?: boolean
    /** Sent outside quiet hours only (WhatsApp). */
    respectQuietHours: boolean
    /** The module already puts this in the in-app bell, so the In-app switch is not offered. */
    inappBuiltIn?: boolean
    /** false = no feature raises this event yet. */
    connected?: boolean
    defaultSubject: string
    defaultBody: string
}

const NAME: CommVar = { key: "name", label: "Recipient name", sample: "Ravi" }
const COMPANY_VAR: CommVar = { key: "company", label: "Our company", sample: "Growus Auto India" }

export const COMM_EVENTS: CommEvent[] = [
    // ── Employees ─────────────────────────────────────────────
    {
        key: "leave_decision", inappBuiltIn: true, label: "Leave approved / rejected", audience: "employee",
        description: "When a manager approves or rejects a leave request.",
        vars: [NAME, { key: "leaveType", label: "Leave type", sample: "Casual Leave" }, { key: "dates", label: "Dates", sample: "12–14 Dec 2026" }, { key: "decision", label: "Approved / Rejected", sample: "Approved" }, { key: "remarks", label: "Manager's remarks", sample: "Enjoy your break" }, COMPANY_VAR],
        waParams: ["name", "leaveType", "dates", "decision"],
        respectQuietHours: true,
        defaultSubject: "Your leave is {decision}",
        defaultBody: "Hi {name},\n\nYour {leaveType} request for {dates} has been {decision}.\n{remarks}\n\n— {company}",
    },
    {
        key: "salary_credited", label: "Salary credited", audience: "employee",
        description: "When salaries for a month are marked paid. Amount only — no slip attached.",
        vars: [NAME, { key: "month", label: "Month", sample: "October 2026" }, { key: "amount", label: "Net amount", sample: "₹18,128" }, COMPANY_VAR],
        waParams: ["name", "month", "amount"],
        respectQuietHours: true,
        defaultSubject: "Salary for {month} credited",
        defaultBody: "Hi {name},\n\nYour salary for {month} ({amount}) has been credited. You can view your payslip in the Growus app.\n\n— {company}",
    },
    {
        key: "announcement", label: "New announcement", audience: "employee",
        description: "When an announcement is published to employees.",
        vars: [NAME, { key: "title", label: "Announcement title", sample: "Diwali holiday schedule" }, { key: "summary", label: "Short summary", sample: "Offices stay closed 1–3 Nov." }, COMPANY_VAR],
        waParams: ["name", "title"],
        respectQuietHours: true,
        defaultSubject: "{title}",
        defaultBody: "Hi {name},\n\n{title}\n{summary}\n\nOpen the Growus app for details.\n\n— {company}",
    },
    {
        key: "document_request", label: "Document / KYC requested", audience: "employee",
        description: "When HR asks an employee to upload a document or fix KYC.",
        vars: [NAME, { key: "document", label: "Document", sample: "Aadhaar card" }, { key: "note", label: "HR note", sample: "The photo was not clear." }, COMPANY_VAR],
        waParams: ["name", "document"],
        respectQuietHours: true,
        defaultSubject: "Please upload your {document}",
        defaultBody: "Hi {name},\n\nPlease upload your {document} in the Growus app.\n{note}\n\n— {company}",
    },
    {
        key: "policy_to_sign", inappBuiltIn: true, label: "Policy to sign", audience: "employee",
        description: "When a policy is published that employees must accept.",
        vars: [NAME, { key: "policy", label: "Policy", sample: "Code of Conduct" }, COMPANY_VAR],
        waParams: ["name", "policy"],
        respectQuietHours: true,
        defaultSubject: "Please read and accept: {policy}",
        defaultBody: "Hi {name},\n\nA new policy, {policy}, needs your acceptance. Please open the Growus app to read and accept it.\n\n— {company}",
    },
    {
        key: "expense_update", inappBuiltIn: true, label: "Expense approved / paid", audience: "employee",
        description: "When an expense claim is approved, rejected or paid.",
        vars: [NAME, { key: "amount", label: "Amount", sample: "₹1,250" }, { key: "status", label: "Status", sample: "Approved" }, { key: "claim", label: "Claim", sample: "Travel – Chakan site visit" }, COMPANY_VAR],
        waParams: ["name", "claim", "amount", "status"],
        respectQuietHours: true,
        defaultSubject: "Expense {status}: {amount}",
        defaultBody: "Hi {name},\n\nYour expense claim \"{claim}\" for {amount} is {status}.\n\n— {company}",
    },
    {
        key: "asset_issued", inappBuiltIn: true, label: "Asset issued", audience: "employee",
        description: "When an asset (laptop, uniform, tools…) is handed to an employee.",
        vars: [NAME, { key: "asset", label: "Asset", sample: "Safety shoes (size 8)" }, COMPANY_VAR],
        waParams: ["name", "asset"],
        respectQuietHours: true,
        defaultSubject: "Asset issued: {asset}",
        defaultBody: "Hi {name},\n\n{asset} has been issued to you. Please take care of it and return it when asked.\n\n— {company}",
    },
    {
        key: "training_due", inappBuiltIn: true, label: "Training due / overdue", audience: "employee",
        description: "Reminder before a course's due date and while it's overdue (LMS → Settings → Reminders). The bell notification is always sent; this adds WhatsApp / email.",
        vars: [NAME, { key: "course", label: "Course", sample: "Inspector induction" }, { key: "dueDate", label: "Due date", sample: "28 Nov 2026" }, { key: "status", label: "Status", sample: "due in 3 days" }, COMPANY_VAR],
        waParams: ["name", "course", "dueDate", "status"],
        respectQuietHours: true,
        defaultSubject: "Training {status}: {course}",
        defaultBody: "Hi {name},\n\nYour training \"{course}\" is {status} (due {dueDate}). Please complete it in the Growus app → My Learning.\n\n— {company}",
    },
    {
        key: "attendance_missing", connected: false, label: "Missing attendance", audience: "employee",
        description: "Reminder when attendance for a day is missing. Not connected yet: attendance here is uploaded monthly by sheet, so there is no daily gap to detect.",
        vars: [NAME, { key: "date", label: "Date", sample: "19 Nov 2026" }, COMPANY_VAR],
        waParams: ["name", "date"],
        respectQuietHours: true,
        defaultSubject: "Attendance missing for {date}",
        defaultBody: "Hi {name},\n\nWe don't have your attendance for {date}. Please mark it or contact your supervisor.\n\n— {company}",
    },
    // ── Customers ─────────────────────────────────────────────
    {
        key: "inspection_report", label: "Inspection report to customer", audience: "customer",
        description: "Sent with the Send to customer button on an approved inspection. Report PDF attached.",
        vars: [NAME, { key: "project", label: "Project", sample: "Bumper inspection – Line 2" }, { key: "date", label: "Inspection date", sample: "19 Nov 2026" }, { key: "link", label: "Online report link", sample: "https://www.growuserp.com/share/…" }, COMPANY_VAR],
        waParams: ["name", "project", "date"],
        waDocument: true,
        respectQuietHours: false,
        defaultSubject: "Inspection report – {project} ({date})",
        defaultBody: "Dear {name},\n\nPlease find attached the approved inspection report for {project}, inspected on {date}.\nYou can also view it online: {link}\n\nRegards,\n{company}",
    },
    {
        key: "inspection_rework", label: "Rework / rejection alert", audience: "customer",
        description: "Sent automatically when an approved report crosses the rework / rejection limits set in Approvals → Settings.",
        vars: [NAME, { key: "project", label: "Project", sample: "Bumper inspection – Line 2" }, { key: "date", label: "Date", sample: "19 Nov 2026" }, { key: "summary", label: "Summary", sample: "12 rework, 3 rejected of 1,200 inspected" }, COMPANY_VAR],
        waParams: ["name", "project", "summary"],
        respectQuietHours: false,
        defaultSubject: "Alert: rework / rejection on {project}",
        defaultBody: "Dear {name},\n\nToday's inspection of {project} ({date}) found: {summary}.\nWe will share the full report after approval.\n\nRegards,\n{company}",
    },
    {
        key: "visit_scheduled", label: "Inspection visit scheduled", audience: "customer",
        description: "When an inspection assignment is created for a customer's project.",
        vars: [NAME, { key: "project", label: "Project", sample: "Bumper inspection – Line 2" }, { key: "date", label: "Start date", sample: "21 Nov 2026" }, { key: "inspector", label: "Inspector", sample: "Amit Patil" }, COMPANY_VAR],
        waParams: ["name", "project", "date", "inspector"],
        respectQuietHours: false,
        defaultSubject: "Inspection scheduled – {project}",
        defaultBody: "Dear {name},\n\nAn inspection for {project} is scheduled from {date}. Inspector: {inspector}.\n\nRegards,\n{company}",
    },
]

// ── Broadcasts (Settings → Communication → Broadcasts) ─────────
COMM_EVENTS.push({
    key: "broadcast", label: "Broadcast message", audience: "all", connected: true,
    description: "A message written on the Broadcasts tab and sent to chosen employees or customers. WhatsApp uses one general template that carries the text.",
    vars: [NAME, { key: "title", label: "Title", sample: "Plant closed on Saturday" }, { key: "message", label: "Message", sample: "Due to maintenance the plant stays closed this Saturday. Regular shifts resume Monday." }, COMPANY_VAR],
    waParams: ["name", "message"],
    respectQuietHours: true,
    defaultSubject: "{title}",
    defaultBody: "Hi {name},\n\n{message}\n\n— {company}",
})

// ── Customer report summary (daily / weekly, Approvals → Settings) ──
COMM_EVENTS.push({
    key: "customer_summary", label: "Inspection summary (daily / weekly)", audience: "customer",
    description: "A summary of approved inspections for the period, to each customer's contacts. How often is set in Approvals → Settings.",
    vars: [NAME, { key: "site", label: "Customer / site", sample: "TTRC" }, { key: "period", label: "Period", sample: "19 Nov 2026" },
        { key: "reports", label: "Reports approved", sample: "12" }, { key: "inspected", label: "Inspected", sample: "4,250" },
        { key: "rework", label: "Rework", sample: "61" }, { key: "rejected", label: "Rejected", sample: "3" },
        { key: "ppm", label: "Rejection PPM", sample: "706" }, { key: "topDefects", label: "Top defects", sample: "Wrinkles 22, Torn stitch 14, Beading open 9" },
        { key: "summary", label: "One-line summary", sample: "4,250 inspected · 61 rework · 3 rejected" }, COMPANY_VAR],
    waParams: ["name", "period", "summary"],
    respectQuietHours: false,
    defaultSubject: "Inspection summary – {site} – {period}",
    defaultBody: "Dear {name},\n\nInspection summary for {site}, {period}:\n\nReports approved: {reports}\nInspected: {inspected}\nRework: {rework}\nRejected: {rejected} ({ppm} PPM)\nTop defects: {topDefects}\n\nRegards,\n{company}",
})

export const COMM_EVENT_MAP = new Map(COMM_EVENTS.map(e => [e.key, e]))

/** Fills {placeholders}; unknown ones are left as they are. */
export function fillTemplate(text: string, data: Record<string, string | number | null | undefined>): string {
    return String(text ?? "").replace(/\{(\w+)\}/g, (m, k) => (data[k] === undefined || data[k] === null ? m : String(data[k])))
}

export function sampleData(ev: CommEvent): Record<string, string> {
    return Object.fromEntries(ev.vars.map(v => [v.key, v.sample]))
}
