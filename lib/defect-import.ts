// The field settings a defect template row can carry, and how each is read and
// checked. Shared by the Form Builder import (preview) and the bulk-defects API
// (which checks again), so both accept exactly the same values the Form
// Builder's own field editor offers. Client-safe.

import { REPORT_ROLES, REPORT_ROLE_VALUES } from "./report-roles"

export const DEFECT_FIELD_TYPES = [
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "dropdown", label: "Dropdown" },
    { value: "checkbox", label: "Checkbox" },
    { value: "textarea", label: "Textarea" },
    { value: "file", label: "File Upload" },
] as const

export const AUTO_REPORT_ROLE = "Auto (match by field name)"

const up = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ")

/** "Number", "number", "File Upload", "file"… → the stored type; blank → number; unknown → null. */
export function parseFieldType(v: unknown): string | null {
    const s = up(v)
    if (!s) return "number"
    const t = DEFECT_FIELD_TYPES.find(x => up(x.label) === s || up(x.value) === s)
    return t ? t.value : null
}

/** "Part Name", "PART_NAME", "Auto…"/blank → the stored role (null = auto); unknown → undefined. */
export function parseReportRole(v: unknown): string | null | undefined {
    const s = up(v)
    if (!s || s === "AUTO" || s === up(AUTO_REPORT_ROLE)) return null
    const r = REPORT_ROLES.find(x => up(x.label) === s || up(x.value) === s || up(x.value).replace(/_/g, " ") === s)
    return r ? r.value : undefined
}

export const fieldTypeLabel = (v: string | null | undefined) => DEFECT_FIELD_TYPES.find(x => x.value === v)?.label ?? "Number"
export const reportRoleLabel = (v: string | null | undefined) => REPORT_ROLES.find(x => x.value === v)?.label ?? AUTO_REPORT_ROLE

/** "Yes"/"No" style cell → true/false; blank → false; anything else → null (invalid). */
export function parseYesNo(v: unknown): boolean | null {
    const s = up(v)
    if (s === "") return false
    if (["YES", "Y", "TRUE", "1"].includes(s)) return true
    if (["NO", "N", "FALSE", "0"].includes(s)) return false
    return null
}

/** Comma-separated options, tidied the way the editor stores them. */
export const tidyOptions = (v: unknown) => String(v ?? "").split(",").map(o => o.trim()).filter(Boolean).join(", ")

export type DefectSettings = {
    fieldType: string; options: string | null; reportRole: string | null
    defaultValue: string | null; isRequired: boolean; isHidden: boolean
}

/**
 * One row's settings from raw cells, or the problems with them. A blank cell
 * takes the editor's default for a defect: Number, Auto, 0, not required, shown.
 */
export function readDefectSettings(cells: {
    fieldType?: unknown; options?: unknown; reportRole?: unknown; defaultValue?: unknown; isRequired?: unknown; isHidden?: unknown
}): { settings: DefectSettings; problems: string[] } {
    const problems: string[] = []
    const fieldType = parseFieldType(cells.fieldType)
    if (fieldType === null) problems.push(`Field Type "${cells.fieldType}" isn't one of ${DEFECT_FIELD_TYPES.map(t => t.label).join(", ")}`)
    const type = fieldType ?? "number"
    const options = type === "dropdown" ? tidyOptions(cells.options) : ""
    if (type === "dropdown" && !options) problems.push("Dropdown needs Options (comma separated)")
    const role = parseReportRole(cells.reportRole)
    if (role === undefined) problems.push(`Use in reports as "${cells.reportRole}" isn't a report option`)
    const rawDefault = String(cells.defaultValue ?? "").trim()
    const defaultValue = rawDefault === "" ? (type === "number" ? "0" : null) : rawDefault
    if (type === "number" && defaultValue !== null && !Number.isFinite(Number(defaultValue))) problems.push(`Default Value "${rawDefault}" should be a number`)
    const isRequired = parseYesNo(cells.isRequired)
    if (isRequired === null) problems.push(`Required "${cells.isRequired}" should be Yes or No`)
    const isHidden = parseYesNo(cells.isHidden)
    if (isHidden === null) problems.push(`Hidden "${cells.isHidden}" should be Yes or No`)
    return {
        settings: {
            fieldType: type, options: options || null, reportRole: role ?? null, defaultValue,
            isRequired: !!isRequired, isHidden: !!isHidden,
        },
        problems,
    }
}

export type ExistingField = {
    fieldType?: string | null; options?: string | null; reportRole?: string | null
    defaultValue?: string | null; isRequired?: boolean | null; isHidden?: boolean | null
}

/**
 * What an import would change on a field already in the form, as readable
 * lines ("Hidden: No → Yes"). Empty = the sheet matches the field. A blank
 * and a 0 default count as the same for a Number field, and Options only
 * matter for a Dropdown.
 */
export function settingsChanges(f: ExistingField, s: DefectSettings): string[] {
    const out: string[] = []
    const curType = f.fieldType || "number"
    const curDefault = (v: string | null | undefined, type: string) => ((v ?? "") === "" && type === "number" ? "0" : (v ?? ""))
    if (curType !== s.fieldType) out.push(`Field Type: ${fieldTypeLabel(curType)} → ${fieldTypeLabel(s.fieldType)}`)
    if (s.fieldType === "dropdown" && tidyOptions(f.options) !== (s.options ?? ""))
        out.push(`Options: ${tidyOptions(f.options) || "none"} → ${s.options}`)
    if ((f.reportRole ?? null) !== s.reportRole) out.push(`Use in reports as: ${reportRoleLabel(f.reportRole)} → ${reportRoleLabel(s.reportRole)}`)
    const before = curDefault(f.defaultValue, curType), after = curDefault(s.defaultValue, s.fieldType)
    if (before !== after) out.push(`Default Value: ${before || "none"} → ${after || "none"}`)
    if (!!f.isRequired !== s.isRequired) out.push(`Required: ${f.isRequired ? "Yes" : "No"} → ${s.isRequired ? "Yes" : "No"}`)
    if (!!f.isHidden !== s.isHidden) out.push(`Hidden: ${f.isHidden ? "Yes" : "No"} → ${s.isHidden ? "Yes" : "No"}`)
    return out
}

export { REPORT_ROLE_VALUES }
