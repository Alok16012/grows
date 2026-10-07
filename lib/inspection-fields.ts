/**
 * Reading the report dimensions — part, location, shift and the quantities —
 * out of an inspection's form answers.
 *
 * The reports API used to do this twice, with two different rule sets: one for
 * the charts and one for the Inspection Report table. And the chart one matched
 * keywords as SUBSTRINGS of a squashed label, which went wrong in ways that
 * reached the screen:
 *
 *   - "part" matched "PART NUMBER", so a part number overwrote the part name
 *     and the Part-Wise chart showed 5040112454 beside BAJAJ 9.2 KWH TRAY.
 *   - "location" matched "DISLOCATION", so a defect count became a location
 *     and a site with no location field charted locations "1" and "2".
 *   - "ok" matched "BROKEN", so a defect count could land in Accepted.
 *
 * Keywords now match whole words, a field marked DEFECT is never read as a
 * part or a location, and a quantity is only taken from a value that is
 * actually a number. Both consumers call this, so the charts and the table
 * can't disagree about what an inspection was.
 */

export type FieldAnswer = {
    value: string | null
    field: {
        fieldLabel: string
        category?: string | null
        reportRole?: string | null
    }
}

export type InspectionDimensions = {
    partName: string | null
    partNumber: string | null
    location: string | null
    shift: string | null
    inspected: number
    accepted: number
    rework: number
    rejected: number
}

export function parseQty(val: string | null | undefined): number {
    if (!val) return 0
    const n = parseFloat(val.replace(/,/g, ""))
    return Number.isNaN(n) ? 0 : n
}

/** A value that really is a quantity — not a name typed into an "Inspected By" box. */
function isNumeric(val: string): boolean {
    return /^\s*-?[\d,]*\.?\d+\s*$/.test(val)
}

function words(label: string): string[] {
    return label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/**
 * True when one of the keywords appears in the label as whole words, in order.
 * "part no" matches "PART NO." and "Part-No"; "part" does NOT match inside
 * "PARTITION", and "location" does not match "DISLOCATION".
 */
export function labelHas(label: string, keywords: string[]): boolean {
    const hay = ` ${words(label).join(" ")} `
    return keywords.some(k => {
        const needle = words(k).join(" ")
        return needle !== "" && hay.includes(` ${needle} `)
    })
}

const PART_NUMBER = ["part number", "part no", "part num", "partnumber", "partno", "part code", "part id"]
const PART_MODEL  = ["part model", "model", "component model"]
const PART_NAME   = ["part name", "partname", "part description", "part"]
const LOCATION    = ["location", "shift location", "plant location"]
const INSPECTED   = ["total inspected", "inspected", "qty inspected", "quantity inspected", "inspected qty"]
const ACCEPTED    = ["total accepted", "accepted", "ok qty", "ok"]
const REWORK      = ["rework qty", "total rework"]
const REJECTED    = ["rejected qty", "rejection qty", "total rejected"]

/** Percent / PPM columns sit beside the counts and share their words. */
function isRatio(label: string): boolean {
    return label.includes("%") || labelHas(label, ["ppm", "percent", "percentage", "pct"])
}

export function isPartModelLabel(label: string): boolean {
    return labelHas(label, PART_MODEL)
}

export function extractInspectionDimensions(answers: FieldAnswer[]): InspectionDimensions {
    const out: InspectionDimensions = {
        partName: null, partNumber: null, location: null, shift: null,
        inspected: 0, accepted: 0, rework: 0, rejected: 0,
    }

    for (const a of answers) {
        const label = a.field.fieldLabel
        const val = a.value ?? ""
        const role = a.field.reportRole ?? null

        // An explicit mapping from the Form Builder wins outright, and a mapped
        // field never leaks into another dimension through its name.
        if (role) {
            if (role === "PART_NAME"   && val) out.partName   = val
            if (role === "PART_NUMBER" && val) out.partNumber = val
            if (role === "LOCATION"    && val) out.location   = val
            if (role === "SHIFT"       && val) out.shift      = val
            if (role === "INSPECTED") out.inspected = parseQty(val)
            if (role === "ACCEPTED")  out.accepted  = parseQty(val)
            if (role === "REWORK")    out.rework    = parseQty(val)
            if (role === "REJECTED")  out.rejected  = parseQty(val)
            continue
        }

        // A defect field is a count of one defect type. Its label is the defect
        // name, so it must never be read as a part, a location or a total.
        if (a.field.category === "DEFECT") continue

        // Part number first, then model, and only then the name — so the
        // catch-all "part" keyword can't swallow "Part No." or "Part Model".
        if (labelHas(label, PART_NUMBER)) {
            if (val) out.partNumber = val
        } else if (labelHas(label, PART_MODEL)) {
            // Collected separately by the caller; never a part name.
        } else if (labelHas(label, PART_NAME)) {
            if (val) out.partName = val
        }

        if (labelHas(label, LOCATION)) {
            if (val) out.location = val
        } else if (labelHas(label, ["shift"])) {
            if (val) out.shift = val
        }

        // Quantities: skip ratio columns, and only take a value that parses as
        // a number, so "Inspected By: Ravi" can't zero out the inspected count.
        if (!isRatio(label) && isNumeric(val)) {
            const n = parseQty(val)
            if (labelHas(label, INSPECTED)) out.inspected = n
            if (labelHas(label, ACCEPTED))  out.accepted  = n
            if (labelHas(label, REWORK))    out.rework    = n
            if (labelHas(label, REJECTED))  out.rejected  = n
        }
    }

    return out
}

export type FixedColumn = "part" | "location" | "inspected" | "accepted" | "rework" | "rejected"

/**
 * Which fixed report column a form field already feeds, if any — so the
 * Inspection Report table doesn't show the same answer twice (once as "Part",
 * once as "PART NAME").
 *
 * Decided by running the field through extractInspectionDimensions itself
 * rather than restating its rules here: a second copy of the rules is exactly
 * how the charts and the table drifted apart before. Part number and shift
 * deliberately map to nothing — they have no fixed column, so they appear as
 * form columns of their own.
 */
export function fixedColumnOf(field: FieldAnswer["field"]): FixedColumn | null {
    // A numeric probe, so quantity fields register as well as text ones.
    const d = extractInspectionDimensions([{ value: "1", field }])
    if (d.partName)  return "part"
    if (d.location)  return "location"
    if (d.inspected) return "inspected"
    if (d.accepted)  return "accepted"
    if (d.rework)    return "rework"
    if (d.rejected)  return "rejected"
    return null
}
