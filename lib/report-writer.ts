// Payroll → Report Writer: the columns a user can tick, shared by the API
// (which fills them) and the page (which lists them). "Actual" is what was
// earned after attendance; "TH" (theoretical) is the full-month structure the
// month was calculated on — both are stored on each Payroll row.

export type ReportGroup = "employee" | "attendance" | "actual" | "th" | "deduction" | "employer"
export type ReportColumn = {
    key: string
    label: string
    group: ReportGroup
    /** Money columns get a total row and number formatting. */
    money?: boolean
    /** Ticked when the page first opens. */
    preset?: boolean
}

export const REPORT_GROUPS: { id: ReportGroup; label: string }[] = [
    { id: "employee",   label: "Employee details" },
    { id: "attendance", label: "Attendance" },
    { id: "actual",     label: "Actual earnings (after attendance)" },
    { id: "th",         label: "Theoretical (TH) — full-month structure" },
    { id: "deduction",  label: "Deductions & net pay" },
    { id: "employer",   label: "Employer contributions" },
]

export const REPORT_COLUMNS: ReportColumn[] = [
    // Employee
    { key: "empCode",         label: "Emp Code",            group: "employee", preset: true },
    { key: "empName",         label: "Emp Name",            group: "employee", preset: true },
    { key: "surname",         label: "Surname",             group: "employee", preset: true },
    { key: "fatherName",      label: "Father Name",         group: "employee" },
    { key: "phone",           label: "Phone",               group: "employee" },
    { key: "email",           label: "Email",               group: "employee" },
    { key: "dob",             label: "DOB",                 group: "employee" },
    { key: "doj",             label: "DOJ",                 group: "employee" },
    { key: "designation",     label: "Designation",         group: "employee", preset: true },
    { key: "department",      label: "Department",          group: "employee" },
    { key: "site",            label: "Site",                group: "employee", preset: true },
    { key: "uan",             label: "UAN",                 group: "employee" },
    { key: "esicNo",          label: "ESIC No",             group: "employee" },
    { key: "accountNo",       label: "Account No",          group: "employee" },
    { key: "ifsc",            label: "IFSC",                group: "employee" },
    { key: "bankName",        label: "Bank Name",           group: "employee" },
    { key: "addressPresent",  label: "Address (Present)",   group: "employee" },
    { key: "addressPermanent",label: "Address (Permanent)", group: "employee" },
    // Attendance
    { key: "monthDays",       label: "Month Days",          group: "attendance", preset: true },
    { key: "paidDays",        label: "Paid Days",           group: "attendance", preset: true },
    { key: "otDays",          label: "OT Days",             group: "attendance" },
    // Actual
    { key: "basic",           label: "Basic",               group: "actual", money: true, preset: true },
    { key: "da",              label: "DA",                  group: "actual", money: true, preset: true },
    { key: "hra",             label: "HRA",                 group: "actual", money: true, preset: true },
    { key: "washing",         label: "Washing",             group: "actual", money: true, preset: true },
    { key: "conveyance",      label: "Conveyance",          group: "actual", money: true, preset: true },
    { key: "lww",             label: "LWW",                 group: "actual", money: true, preset: true },
    { key: "bonus",           label: "Bonus",               group: "actual", money: true, preset: true },
    { key: "otherAllow",      label: "Other Allow",         group: "actual", money: true, preset: true },
    { key: "ot",              label: "OT",                  group: "actual", money: true, preset: true },
    { key: "prodIncentive",   label: "Prod Incentive",      group: "actual", money: true, preset: true },
    { key: "gross",           label: "Total Gross",         group: "actual", money: true, preset: true },
    // Theoretical
    { key: "basicTh",         label: "Basic (TH)",          group: "th", money: true },
    { key: "daTh",            label: "DA (TH)",             group: "th", money: true },
    { key: "hraTh",           label: "HRA (TH)",            group: "th", money: true },
    { key: "washingTh",       label: "Washing (TH)",        group: "th", money: true },
    { key: "conveyanceTh",    label: "Conveyance (TH)",     group: "th", money: true },
    { key: "lwwTh",           label: "LWW (TH)",            group: "th", money: true },
    { key: "bonusTh",         label: "Bonus (TH)",          group: "th", money: true },
    { key: "otherAllowTh",    label: "Other Allow (TH)",    group: "th", money: true },
    { key: "grossTh",         label: "Total Gross (TH)",    group: "th", money: true },
    // Deductions
    { key: "pf",              label: "PF",                  group: "deduction", money: true, preset: true },
    { key: "esic",            label: "ESIC",                group: "deduction", money: true, preset: true },
    { key: "pt",              label: "PT",                  group: "deduction", money: true, preset: true },
    { key: "lwf",             label: "LWF",                 group: "deduction", money: true, preset: true },
    { key: "canteen",         label: "Canteen",             group: "deduction", money: true },
    { key: "penalty",         label: "Fine / Penalty",      group: "deduction", money: true },
    { key: "otherDed",        label: "Other Ded",           group: "deduction", money: true, preset: true },
    { key: "advanceDed",      label: "Advance Ded",         group: "deduction", money: true, preset: true },
    { key: "tds",             label: "TDS",                 group: "deduction", money: true },
    { key: "totalDed",        label: "Total Deductions",    group: "deduction", money: true, preset: true },
    { key: "net",             label: "Net Pay",             group: "deduction", money: true, preset: true },
    // Employer
    { key: "pfEr",            label: "PF (Employer)",       group: "employer", money: true },
    { key: "esicEr",          label: "ESIC (Employer)",     group: "employer", money: true },
    { key: "ctc",             label: "CTC",                 group: "employer", money: true },
]

export const REPORT_KEYS = new Set(REPORT_COLUMNS.map(c => c.key))
