// The order the inspector sees the Basic Info (FIXED) fields in:
//
//   1. Inspection Date   2. Shift   3. Location   4. Part Name   5. Part Number
//   …every other basic field (incl. ones added later in the Form Builder)…
//   last: Inspected Qty, then Rework Qty, then Rejected Qty
//
// Rejected Qty is typed by the inspector (client request, Nov 2026 — it used to
// be worked out as defects minus rework, which confused people), so it is a
// Basic Info field wherever the Form Builder filed it.
//
// A field is recognised by its report role when it has one (Form Builder →
// "Report role"), otherwise by its exact label ("INSP. DATE", "PART NO."…).
// Exact labels, not keywords: a new "Shift Incharge" or "Inspected By" field
// must stay with the other new fields rather than jump into a fixed slot.
// Inside each slot, and among the other fields, the Form Builder's own
// displayOrder is kept. Isomorphic — used by the inspection form and the
// Form Builder preview.

type OrderableField = {
    fieldLabel: string
    reportRole?: string | null
    displayOrder?: number | null
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim()

type Slot = "DATE" | "SHIFT" | "LOCATION" | "PART_NAME" | "PART_NUMBER" | "OTHER" | "INSPECTED" | "REWORK" | "REJECTED"

const RANK: Record<Slot, number> = {
    DATE: 0, SHIFT: 1, LOCATION: 2, PART_NAME: 3, PART_NUMBER: 4, OTHER: 5, INSPECTED: 6, REWORK: 7, REJECTED: 8,
}

const LABELS: [Slot, string[]][] = [
    ["DATE", ["insp date", "inspection date", "insp dt", "date"]],
    ["SHIFT", ["shift"]],
    ["LOCATION", ["location"]],
    ["PART_NAME", ["part name", "partname"]],
    ["PART_NUMBER", ["part number", "part no", "part num", "partnumber", "partno", "part code"]],
    ["INSPECTED", ["inspected qty", "inspected quantity", "total inspected", "qty inspected", "quantity inspected", "inspected"]],
    ["REWORK", ["rework qty", "rework quantity", "total rework", "rework"]],
    ["REJECTED", ["rejected qty", "rejection qty", "rejected quantity", "rejection quantity", "total rejected", "rejected", "rejection", "reject qty"]],
]

const ROLE_SLOT: Record<string, Slot> = {
    SHIFT: "SHIFT", LOCATION: "LOCATION", PART_NAME: "PART_NAME", PART_NUMBER: "PART_NUMBER",
    INSPECTED: "INSPECTED", REWORK: "REWORK", REJECTED: "REJECTED",
}

export function basicFieldSlot(f: OrderableField): Slot {
    // An explicit role decides; a field with some other role (e.g. ACCEPTED)
    // is an ordinary field, whatever its label says.
    if (f.reportRole) return ROLE_SLOT[f.reportRole] ?? "OTHER"
    const label = norm(f.fieldLabel ?? "")
    for (const [slot, names] of LABELS) if (names.includes(label)) return slot
    return "OTHER"
}

/** The Rejected Qty field (typed by the inspector, shown after Rework Qty). */
export function isRejectedQtyField(f: OrderableField): boolean {
    return basicFieldSlot(f) === "REJECTED"
}

/** A sorted copy of the Basic Info fields in inspector order; the input is untouched. */
export function orderBasicFields<T extends OrderableField>(fields: T[]): T[] {
    return fields
        .map((f, i) => ({ f, i, rank: RANK[basicFieldSlot(f)] }))
        .sort((a, b) =>
            a.rank - b.rank
            || (a.f.displayOrder ?? 0) - (b.f.displayOrder ?? 0)
            || a.i - b.i)
        .map(x => x.f)
}
