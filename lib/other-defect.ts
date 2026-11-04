// "Other" defect descriptions. Client-safe: no imports.
//
// An inspector who books pieces under the OTHER defect column says what those
// defects actually were, as rows of "description × quantity" that add up to
// the OTHER count ("Clip broken × 2" + "Foam torn × 1" for OTHER 3). The rows
// travel in the form's answers under a special key (like paperFormPhoto) and
// are stored as one readable answer — "2 × Clip broken; 1 × Foam torn" — on a
// companion field the server adds to the project's form the first time it is
// needed (app/api/inspections/[id]). Category NOTE keeps it out of the defect
// totals, the Form Builder sections and the report groupings; its label
// contains "description", which reports already treat as free text. The
// review page, the Inspection Report table and exports show the text as is.

/** Key in the form's answers map and in the PATCH body's responses. */
export const OTHER_DEFECT_KEY = "otherDefectDetails"
export const OTHER_DEFECT_NOTE_LABEL = "OTHER DEFECT DESCRIPTION"
export const OTHER_DEFECT_NOTE_CATEGORY = "NOTE"
/** Characters per row, and rows per inspection. */
export const OTHER_DEFECT_ROW_MAX = 150
export const OTHER_DEFECT_MAX_ROWS = 10

export type OtherDefectRow = { text: string; qty: number }

/** Length as people count it (an emoji is one). */
export const otherDefectTextLength = (text: string) => Array.from(text).length

/**
 * One row's description as stored: no ";" or line breaks (they separate rows),
 * single spaces, at most OTHER_DEFECT_ROW_MAX characters cut between whole
 * characters. A plain .slice counts UTF-16 units, so an emoji at the limit was
 * split in half and the save failed with "Internal Error".
 */
export function cleanRowText(text: string): string {
    const t = text.replace(/[;\r\n]+/g, ",").replace(/\s+/g, " ")
    const chars = Array.from(t)
    return chars.length > OTHER_DEFECT_ROW_MAX ? chars.slice(0, OTHER_DEFECT_ROW_MAX).join("") : t
}

/** "2 × Clip broken; 1 × Foam torn". Rows with neither text nor quantity are dropped. */
export function serializeOtherDefects(rows: OtherDefectRow[]): string {
    return rows
        .slice(0, OTHER_DEFECT_MAX_ROWS)
        .map(r => ({ text: cleanRowText(r.text).trim(), qty: Math.max(0, Math.floor(r.qty || 0)) }))
        .filter(r => r.text || r.qty)
        .map(r => `${r.qty} × ${r.text}`)
        .join("; ")
}

/**
 * Rows from a stored value. A part without a "<n> ×" prefix has no quantity
 * (0): quantities are always typed by the inspector, never assumed.
 */
export function parseOtherDefects(value: string | null | undefined): OtherDefectRow[] {
    if (!value || !value.trim()) return []
    const parts = value.split(";").map(p => p.trim()).filter(Boolean)
    return parts.slice(0, OTHER_DEFECT_MAX_ROWS).map(p => {
        const m = /^(\d+)\s*[×xX*]\s*(.*)$/.exec(p)
        if (m) return { qty: Number(m[1]), text: m[2].trim() }
        return { qty: 0, text: p }
    })
}

/** Why these rows can't be submitted for `otherQty` pieces under OTHER, or null. */
export function otherDefectProblem(rows: OtherDefectRow[], otherQty: number, label = "OTHER"): string | null {
    if (otherQty <= 0) return null
    const filled = rows.filter(r => r.text.trim() || r.qty)
    if (filled.length === 0) return `Describe the ${otherQty} piece${otherQty === 1 ? "" : "s"} booked under ${label}`
    const one = filled.length === 1
    if (filled.some(r => !r.text.trim())) return one ? "Describe what the defect is" : "Describe every row, or remove the empty one"
    if (filled.some(r => !(r.qty >= 1))) return one ? "Enter how many pieces have this defect" : "Give every row a quantity of at least 1"
    const sum = filled.reduce((s, r) => s + r.qty, 0)
    if (sum < otherQty) return `The rows cover ${sum} of ${otherQty} pieces under ${label}. Add ${otherQty - sum} more`
    if (sum > otherQty) return `The rows add up to ${sum}, more than the ${otherQty} under ${label}`
    return null
}

/** The catch-all defect column: "OTHER", "Others", "Other defect(s)". */
export function isOtherDefectLabel(label: string): boolean {
    return /^\s*others?(\s+defects?)?\s*$/i.test(label)
}

/** The companion field that stores the descriptions. */
export function isOtherDefectNoteField(t: { fieldLabel: string; category?: string | null }): boolean {
    return t.category === OTHER_DEFECT_NOTE_CATEGORY && t.fieldLabel.trim().toUpperCase() === OTHER_DEFECT_NOTE_LABEL
}
