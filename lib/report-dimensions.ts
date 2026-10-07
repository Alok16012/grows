/**
 * Report breakdowns discovered from the inspection forms themselves.
 *
 * The Graphical tab used to chart a fixed list — part, location, shift,
 * inspector — whatever the site's form actually contained. A form with a
 * Line, Machine, Model or Customer field got no breakdown by it, and a form
 * with no location field still got a Location chart. Here every field that
 * can sensibly group inspections becomes a breakdown, so the report follows
 * the form.
 *
 * Pure on purpose — the reports route feeds it, and it is tested on its own.
 */

import { labelHas } from "@/lib/inspection-fields"

export type DimensionField = {
    fieldLabel: string
    fieldType?: string | null
    category?: string | null
    reportRole?: string | null
}

export type DimensionAnswer = { value: string | null; field: DimensionField }

export type Quantities = { inspected: number; accepted: number; rework: number; rejected: number }

export type DimensionBucket = {
    value: string
    inspections: number
    totalInspected: number
    totalAccepted: number
    totalRework: number
    totalRejected: number
}

export type Dimension = {
    key: string
    label: string
    fieldType: string
    /** Inspections that answered this field at all. */
    answered: number
    buckets: DimensionBucket[]
}

/** Fields with a fixed set of choices: always a grouping. */
const CHOICE_TYPES = new Set(["dropdown", "select", "radio"])
/** Free text: a grouping only if its answers repeat (see isUsefulText). */
const TEXT_TYPES = new Set(["text", "", "string"])

/** Most a chart can carry and stay readable; the rest fold into "Other". */
export const MAX_BUCKETS = 15
/** A text field with more distinct answers than this is free text, not a category. */
const MAX_TEXT_DISTINCT = 25

const QTY_ROLES = new Set(["INSPECTED", "ACCEPTED", "REWORK", "REJECTED"])
/** Part has its own chart (with part numbers), so it isn't repeated here. */
const PART_ROLES = new Set(["PART_NAME", "PART_NUMBER"])

/** Labels that describe the record rather than group it. */
const NOT_A_GROUPING = [
    "remark", "remarks", "comment", "comments", "note", "notes", "observation",
    "description", "signature", "photo", "image", "serial", "serial no", "sr no",
    "inspected by", "inspector", "name of inspector", "checked by", "approved by",
]

// Part NAME and NUMBER only. Not the bare word "part": "Part Model" or
// "Part Family" is a perfectly good grouping and must survive.
const PART_LABELS = ["part name", "partname", "part description", "part number", "part no", "part num", "partnumber", "partno", "part code"]

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase()

/** Can this form field ever be a breakdown? (Cardinality is checked later.) */
export function isCandidateField(f: DimensionField): boolean {
    const category = (f.category ?? "FIXED").toUpperCase()
    // DEFECT columns are counts of a defect type (they feed the Pareto);
    // AUTO columns are computed totals and ratios.
    if (category === "DEFECT" || category === "AUTO") return false

    const role = f.reportRole ?? null
    if (role && (QTY_ROLES.has(role) || PART_ROLES.has(role))) return false

    const type = (f.fieldType ?? "").toLowerCase()
    if (!CHOICE_TYPES.has(type) && !TEXT_TYPES.has(type)) return false

    // An explicitly mapped LOCATION / SHIFT is a grouping whatever its label.
    if (role === "LOCATION" || role === "SHIFT") return true

    if (labelHas(f.fieldLabel, PART_LABELS) || norm(f.fieldLabel) === "part") return false
    if (labelHas(f.fieldLabel, NOT_A_GROUPING)) return false
    return true
}

type Acc = {
    label: string
    labelVotes: Map<string, number>
    fieldType: string
    isChoice: boolean
    answered: number
    buckets: Map<string, DimensionBucket>
}

export function createDimensionAggregator() {
    const dims = new Map<string, Acc>()

    return {
        /** One inspection's answers, with that inspection's quantities. */
        add(answers: DimensionAnswer[], q: Quantities) {
            // An inspection counts once per field, even if a form repeats a label.
            const seen = new Set<string>()
            for (const a of answers) {
                if (!isCandidateField(a.field)) continue
                const raw = (a.value ?? "").trim()
                if (!raw) continue
                const key = norm(a.field.fieldLabel)
                if (seen.has(key)) continue
                seen.add(key)

                let d = dims.get(key)
                if (!d) {
                    const type = (a.field.fieldType ?? "").toLowerCase()
                    d = { label: a.field.fieldLabel.trim(), labelVotes: new Map(), fieldType: type,
                          isChoice: CHOICE_TYPES.has(type), answered: 0, buckets: new Map() }
                    dims.set(key, d)
                }
                const lbl = a.field.fieldLabel.trim()
                d.labelVotes.set(lbl, (d.labelVotes.get(lbl) ?? 0) + 1)
                if (CHOICE_TYPES.has((a.field.fieldType ?? "").toLowerCase())) d.isChoice = true
                d.answered++

                // "Line 1" and "LINE 1" are the same line.
                const vKey = norm(raw)
                let b = d.buckets.get(vKey)
                if (!b) {
                    b = { value: raw, inspections: 0, totalInspected: 0, totalAccepted: 0, totalRework: 0, totalRejected: 0 }
                    d.buckets.set(vKey, b)
                }
                b.inspections++
                b.totalInspected += q.inspected
                b.totalAccepted  += q.accepted
                b.totalRework    += q.rework
                b.totalRejected  += q.rejected
            }
        },

        result(): Dimension[] {
            const out: Dimension[] = []
            for (const [key, d] of dims) {
                const buckets = [...d.buckets.values()]
                // One value everywhere says nothing — a one-bar chart was
                // exactly the complaint about the old Shift chart.
                if (buckets.length < 2) continue
                if (!d.isChoice && !isUsefulText(buckets.length, d.answered)) continue

                buckets.sort((a, b) => b.totalInspected - a.totalInspected || b.inspections - a.inspections)
                const shown = buckets.length > MAX_BUCKETS ? foldOther(buckets) : buckets

                // Display the label as it's most often written across forms.
                const label = [...d.labelVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? d.label
                out.push({ key, label, fieldType: d.fieldType, answered: d.answered, buckets: shown })
            }
            // Most-answered first: the fields every inspection fills are the
            // ones worth looking at by default.
            return out.sort((a, b) => b.answered - a.answered || a.label.localeCompare(b.label))
        },
    }
}

/**
 * Free text is a category only if its answers repeat. Serial numbers, batch
 * codes and remarks are different on nearly every inspection; a "Line" typed
 * by hand takes a handful of values over and over.
 */
function isUsefulText(distinct: number, answered: number): boolean {
    if (distinct > MAX_TEXT_DISTINCT) return false
    return distinct <= Math.max(2, Math.floor(answered * 0.6))
}

function foldOther(sorted: DimensionBucket[]): DimensionBucket[] {
    const head = sorted.slice(0, MAX_BUCKETS - 1)
    const tail = sorted.slice(MAX_BUCKETS - 1)
    const other: DimensionBucket = { value: `Other (${tail.length})`, inspections: 0, totalInspected: 0, totalAccepted: 0, totalRework: 0, totalRejected: 0 }
    for (const b of tail) {
        other.inspections    += b.inspections
        other.totalInspected += b.totalInspected
        other.totalAccepted  += b.totalAccepted
        other.totalRework    += b.totalRework
        other.totalRejected  += b.totalRejected
    }
    return [...head, other]
}
