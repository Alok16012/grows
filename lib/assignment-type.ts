// One "Assignment type" choice instead of a Recurrence dropdown plus a
// Multi-part checkbox (client correction, Nov 2026: "no need of double option").
// The two overlapped: a multi-part assignment never recurs on approval (it stays
// open until a manager closes it), so ticking both did nothing extra.
// Client-safe: used by the assignment pages and the project "Also assign work" section.

export type AssignmentKind = "ongoing" | "none" | "daily" | "weekly"

export const ASSIGNMENT_TYPES: { value: AssignmentKind; label: string; hint: string }[] = [
    { value: "ongoing", label: "Ongoing (multi-part)", hint: "Covers many visits. Stays on the inspector's list, and approving an inspection won't close it. You close it when the work is finished." },
    { value: "none", label: "One-time", hint: "A single inspection. Closes when it is approved." },
    { value: "daily", label: "Recurring — Daily", hint: "Closes when approved, and a fresh assignment is issued for the next one." },
    { value: "weekly", label: "Recurring — Weekly", hint: "Closes when approved, and a fresh assignment is issued for the next one." },
]

/** The type an assignment is, from what is stored on it. */
export function assignmentKind(a: { recurrenceType?: string | null; isMultiPart?: boolean | null }): AssignmentKind {
    if (a.isMultiPart) return "ongoing"
    return a.recurrenceType === "daily" || a.recurrenceType === "weekly" ? a.recurrenceType : "none"
}

/** What to store for a type. */
export function assignmentFields(kind: string): { recurrenceType: "none" | "daily" | "weekly"; isMultiPart: boolean } {
    if (kind === "ongoing") return { recurrenceType: "none", isMultiPart: true }
    return { recurrenceType: kind === "daily" || kind === "weekly" ? kind : "none", isMultiPart: false }
}

export function assignmentKindLabel(kind: AssignmentKind): string {
    return ASSIGNMENT_TYPES.find(t => t.value === kind)?.label ?? "One-time"
}
