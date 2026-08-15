// What a form field MEANS to the report charts, independent of what it is
// named. Reports historically recognised fields by keywords in their label
// ("location", "part name", "inspected"...), so renaming a field in the Form
// Builder silently unmapped it and the charts collapsed into their fallback
// buckets ("Main" / "General"). A field with an explicit role keeps feeding the
// right chart whatever its label says; a field without one still falls back to
// the label keywords, so untouched templates behave exactly as before.
//
// Isomorphic — imported by the Form Builder UI and the API routes alike.

export const REPORT_ROLES = [
    { value: "PART_NAME",   label: "Part Name" },
    { value: "PART_NUMBER", label: "Part Number" },
    { value: "LOCATION",    label: "Location" },
    { value: "SHIFT",       label: "Shift" },
    { value: "INSPECTED",   label: "Inspected Qty" },
    { value: "ACCEPTED",    label: "Accepted Qty" },
    { value: "REWORK",      label: "Rework Qty" },
    { value: "REJECTED",    label: "Rejected Qty" },
] as const

export type ReportRole = (typeof REPORT_ROLES)[number]["value"]

export const REPORT_ROLE_VALUES: string[] = REPORT_ROLES.map(r => r.value)
