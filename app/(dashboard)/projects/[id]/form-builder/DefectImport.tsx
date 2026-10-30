"use client"
// Form Builder → Defect Columns → Template / Import Excel: add or update many
// defects at once from a sheet, each with the settings the field editor offers
// (Field Type, Options, Use in reports as, Default Value, Required) plus Hidden.
// New names are added; defects already in the form are updated to the sheet's
// settings, or skipped when nothing differs. Every row's outcome, and each
// change, is shown before anything is saved; the server
// (/api/form-templates/bulk-defects) applies the same rules again.

import { useRef, useState } from "react"
import { toast } from "sonner"
import { FileUp, Download, Loader2, X, CheckCircle2, MinusCircle, XCircle, AlertTriangle } from "lucide-react"
import { DEFAULT_DEFECTS } from "@/lib/default-defects"
import { REPORT_ROLES } from "@/lib/report-roles"
import {
    DEFECT_FIELD_TYPES, AUTO_REPORT_ROLE, readDefectSettings, settingsChanges, fieldTypeLabel, reportRoleLabel, type DefectSettings,
} from "@/lib/defect-import"

const MAX_DEFECTS = 300
const MAX_LENGTH = 100
const COLS = {
    label:        ["FIELD LABEL", "DEFECT", "DEFECTS", "DEFECT NAME", "DEFECT NAMES", "DEFECT COLUMN", "DEFECT COLUMNS", "DEFECT TYPE", "NAME"],
    fieldType:    ["FIELD TYPE", "TYPE"],
    options:      ["OPTIONS", "OPTIONS (COMMA SEPARATED)", "DROPDOWN OPTIONS"],
    reportRole:   ["USE IN REPORTS AS", "REPORT ROLE", "REPORTS"],
    defaultValue: ["DEFAULT VALUE", "DEFAULT", "DEFAULT VAL"],
    isRequired:   ["REQUIRED", "REQUIRED FIELD", "MANDATORY", "IS REQUIRED"],
    isHidden:     ["HIDDEN", "HIDE", "IS HIDDEN"],
}
const HEADER = ["Field Label", "Field Type", "Options", "Use in reports as", "Default Value", "Required", "Hidden", "Status"]

const clean = (s: string) => s.trim().replace(/\s+/g, " ")
const key = (s: string) => clean(s).toUpperCase()
const norm = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ")
const yn = (b: boolean | undefined) => (b ? "Yes" : "No")

type FieldLike = {
    fieldLabel: string; category?: string; fieldType?: string; options?: string | null; reportRole?: string | null
    isHidden?: boolean; isRequired?: boolean; defaultValue?: string | null; displayOrder?: number
}
// new: added · update: a defect already in the form whose settings change (listed
// in `changes`) · skip: left alone, with the reason · error: the file needs fixing.
type Row = { label: string; excelRow: number; settings: DefectSettings; status: "new" | "update" | "skip" | "error"; reason?: string; changes?: string[] }
type Raw = { label: string; excelRow: number; cells: Record<keyof typeof COLS, unknown> }

/**
 * Rows from the first sheet: the column headed "Field Label" (or "Defect
 * Name", "Defect"…) plus any of the settings columns present, else the first
 * column as names only. Empty names are ignored.
 */
function readSheet(rows: unknown[][]): Raw[] {
    let headerRow = -1
    const at: Record<keyof typeof COLS, number> = { label: 0, fieldType: -1, options: -1, reportRole: -1, defaultValue: -1, isRequired: -1, isHidden: -1 }
    for (let r = 0; r < Math.min(rows.length, 20) && headerRow < 0; r++) {
        const cells = (rows[r] ?? []).map(norm)
        const c = cells.findIndex(x => COLS.label.includes(x))
        if (c < 0) continue
        headerRow = r
        for (const k of Object.keys(COLS) as (keyof typeof COLS)[]) at[k] = cells.findIndex(x => COLS[k].includes(x))
        at.label = c
    }
    return rows
        .map((row, i) => {
            const r = row ?? []
            const cells = Object.fromEntries((Object.keys(COLS) as (keyof typeof COLS)[]).map(k => [k, at[k] >= 0 ? r[at[k]] : ""])) as Raw["cells"]
            return { label: clean(String(r[at.label] ?? "")), excelRow: i + 1, cells }
        })
        .filter((x, i) => i > headerRow && x.label !== "")
}

// Excel dropdown lists for the settings columns (B Field Type, D Use in reports
// as, F Required, G Hidden), rows 2–1000. SheetJS can't write data validation,
// so the workbook is written to bytes, each sheet's XML gets a
// <dataValidations> block, and the zip is written back out.
const DROPDOWN_ROWS = 1000
const DROPDOWNS: { col: string; values: string[]; prompt: string }[] = [
    { col: "B", values: DEFECT_FIELD_TYPES.map(t => t.label), prompt: "Pick a field type" },
    { col: "D", values: [AUTO_REPORT_ROLE, ...REPORT_ROLES.map(r => r.label)], prompt: "Pick how reports use this field" },
    { col: "F", values: ["Yes", "No"], prompt: "Yes or No" },
    { col: "G", values: ["Yes", "No"], prompt: "Yes or No" },
]
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function withDropdowns(sheetXml: string): string {
    const block = `<dataValidations count="${DROPDOWNS.length}">` + DROPDOWNS.map(d =>
        `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Not in the list" error="${xmlEsc(`Choose one of: ${d.values.join(", ")}`)}" prompt="${xmlEsc(d.prompt)}" sqref="${d.col}2:${d.col}${DROPDOWN_ROWS}">`
        + `<formula1>${xmlEsc(`"${d.values.join(",")}"`)}</formula1></dataValidation>`).join("") + `</dataValidations>`
    // Schema order: dataValidations comes after sheetData / autoFilter / mergeCells and
    // before all of these — Excel "repairs" a file that has it out of place.
    const before = ["<hyperlinks", "<printOptions", "<pageMargins", "<pageSetup", "<headerFooter", "<rowBreaks", "<colBreaks",
        "<customProperties", "<cellWatches", "<ignoredErrors", "<smartTags", "<drawing", "<legacyDrawing", "<tableParts", "<extLst"]
    const at = before.map(t => sheetXml.indexOf(t)).filter(i => i >= 0).sort((a, b) => a - b)[0] ?? sheetXml.lastIndexOf("</worksheet>")
    return sheetXml.slice(0, at) + block + sheetXml.slice(at)
}

const fieldRow = (f: FieldLike, status: string) => [
    f.fieldLabel, fieldTypeLabel(f.fieldType ?? "number"), f.fieldType === "dropdown" ? (f.options ?? "") : "",
    reportRoleLabel(f.reportRole), f.defaultValue ?? "", yn(f.isRequired), yn(f.isHidden), status,
]

// The template: this form's defects with all their settings (edit a row to
// update that defect; unchanged rows are skipped), room for new ones, the
// standard defects not in the form on their own sheet (copied across to be
// added, so importing the template as-is changes nothing), and how to fill it in.
async function downloadTemplate(fields: FieldLike[]) {
    const XLSX = await import("xlsx")
    const current = fields
        .filter(f => f.category === "DEFECT")
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    const inForm = new Set(fields.map(f => key(f.fieldLabel)))
    const widths = [{ wch: 30 }, { wch: 12 }, { wch: 24 }, { wch: 26 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 22 }]

    const ws = XLSX.utils.aoa_to_sheet([HEADER, ...current.map(f => fieldRow(f, f.isHidden ? "In this form (hidden)" : "In this form"))])
    ws["!cols"] = widths

    const standard = DEFAULT_DEFECTS.filter(d => !inForm.has(key(d)))
    const ws2 = XLSX.utils.aoa_to_sheet([HEADER.slice(0, 7), ...standard.map(d => fieldRow({ fieldLabel: d, fieldType: "number", defaultValue: "0" }, "").slice(0, 7))])
    ws2["!cols"] = widths.slice(0, 7)

    const ws3 = XLSX.utils.aoa_to_sheet([
        ["How to fill the Defects sheet"],
        [""],
        ["Column", "What to enter", "Allowed values"],
        ["Field Label", "The defect column's name. Required. Up to 100 characters.", ""],
        ["Field Type", "Blank = Number.", DEFECT_FIELD_TYPES.map(t => t.label).join(", ")],
        ["Options", "Only for Dropdown: the choices, separated by commas. Required for Dropdown.", "e.g. Minor, Major, Critical"],
        ["Use in reports as", "Which report chart this field feeds. Blank = Auto.", [AUTO_REPORT_ROLE, ...REPORT_ROLES.map(r => r.label)].join(", ")],
        ["Default Value", "Shown before the inspector types. Blank = 0 for Number, empty otherwise. Must be a number for Number fields.", ""],
        ["Required", "Must the inspector fill it in? Blank = No.", "Yes, No"],
        ["Hidden", "Hidden columns aren't shown to inspectors. Blank = No.", "Yes, No"],
        ["Status", "For information only; ignored when importing.", ""],
        [""],
        ["Rows already in this form are updated to the settings in the sheet (the name never changes); unchanged rows are skipped."],
        ["The import lists every change before anything is saved."],
        ["Add new defects as new rows. Copy rows from the Standard defects sheet to add those."],
        ["Only the first sheet (Defects) is imported."],
    ])
    ws3["!cols"] = [{ wch: 18 }, { wch: 70 }, { wch: 60 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Defects")
    XLSX.utils.book_append_sheet(wb, ws2, "Standard defects")
    XLSX.utils.book_append_sheet(wb, ws3, "How to fill")

    // Add the dropdown lists to the two defect sheets (see withDropdowns).
    let bytes: Uint8Array = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer)
    try {
        const zip = XLSX.CFB.read(bytes, { type: "array" })
        for (const n of [1, 2]) {
            // The leading "/" makes CFB match the full path inside the zip.
            const entry = XLSX.CFB.find(zip, `/xl/worksheets/sheet${n}.xml`)
            if (!entry?.content) throw new Error(`sheet${n}.xml not found in the workbook`)
            const xml = withDropdowns(new TextDecoder().decode(new Uint8Array(entry.content as ArrayLike<number>)))
            const content = new TextEncoder().encode(xml)
            entry.content = content
            entry.size = content.length
        }
        bytes = new Uint8Array(XLSX.CFB.write(zip, { fileType: "zip", type: "array", compression: true }) as ArrayLike<number>)
    } catch (err) {
        // The template still works without dropdowns; the allowed values are on "How to fill".
        console.error("[DEFECT_TEMPLATE_DROPDOWNS]", err)
    }
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "Defects_Template.xlsx"
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function DefectImport({ projectId, fields, onImported }: {
    projectId: string
    fields: FieldLike[]
    onImported: () => Promise<void> | void
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [fileName, setFileName] = useState("")
    const [rows, setRows] = useState<Row[] | null>(null)
    const [reading, setReading] = useState(false)
    const [saving, setSaving] = useState(false)

    const close = () => { setRows(null); setFileName(""); if (inputRef.current) inputRef.current.value = "" }

    const onFile = async (file: File | undefined) => {
        if (!file) return
        setReading(true)
        try {
            const XLSX = await import("xlsx")
            const wb = XLSX.read(await file.arrayBuffer(), { type: "array" })
            const raw = readSheet(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }))
            if (!raw.length) { toast.error("No defect names found — put them in a column headed \"Field Label\""); close(); return }
            // A form can hold the same name twice (e.g. once visible, once hidden),
            // so each name maps to every field that has it.
            const byKey = new Map<string, FieldLike[]>()
            for (const f of fields) byKey.set(key(f.fieldLabel), [...(byKey.get(key(f.fieldLabel)) ?? []), f])
            const seen = new Set<string>()
            setRows(raw.map(({ label, excelRow, cells }) => {
                // The same checks the server makes, so the preview says what will happen.
                const { settings, problems } = readDefectSettings(cells)
                const base = { label, excelRow, settings }
                if (problems.length) return { ...base, status: "error", reason: problems.join("; ") }
                if (label.length > MAX_LENGTH) return { ...base, status: "skip", reason: `Longer than ${MAX_LENGTH} characters` }
                const k = key(label)
                if (seen.has(k)) return { ...base, status: "skip", reason: "Repeated in the file" }
                seen.add(k)
                const cur = byKey.get(k) ?? []
                if (cur.length === 0) return { ...base, status: "new" }
                // A defect already in the form is updated to the sheet's settings,
                // or left alone when nothing differs. The name itself never changes.
                if (cur.length > 1) return { ...base, status: "skip", reason: `${cur.length} fields in the form have this name — change them in the editor` }
                if (cur[0].category && cur[0].category !== "DEFECT") return { ...base, status: "skip", reason: "Not a defect column — change it in the editor" }
                const changes = settingsChanges(cur[0], settings)
                return changes.length
                    ? { ...base, status: "update", changes }
                    : { ...base, status: "skip", reason: "No change" }
            }))
            setFileName(file.name)
        } catch (err) {
            console.error(err)
            toast.error("Couldn't read that file — use an Excel (.xlsx / .xls) or CSV file")
            close()
        } finally {
            setReading(false)
        }
    }

    const newOnes = rows?.filter(r => r.status === "new") ?? []
    const updates = rows?.filter(r => r.status === "update") ?? []
    const errorCount = rows?.filter(r => r.status === "error").length ?? 0
    const skipCount = rows?.filter(r => r.status === "skip").length ?? 0
    const tooMany = newOnes.length + updates.length > MAX_DEFECTS
    const blocked = (!newOnes.length && !updates.length) || tooMany || errorCount > 0
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

    const add = async () => {
        if (blocked) return
        setSaving(true)
        try {
            const res = await fetch("/api/form-templates/bulk-defects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, items: [...newOnes, ...updates].map(r => ({ label: r.label, ...r.settings })) }),
            })
            if (!res.ok) throw new Error((await res.text()) || "Import failed")
            const data: { added: string[]; updated?: { label: string }[]; skipped: { label: string }[] } = await res.json()
            await onImported()
            const done = [
                data.added.length && `Added ${plural(data.added.length, "defect", "defects")}`,
                data.updated?.length && `Updated ${plural(data.updated.length, "defect", "defects")}`,
            ].filter(Boolean).join(" · ")
            toast.success(done || "Nothing changed")
            close()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Import failed")
        } finally {
            setSaving(false)
        }
    }

    // Settings that differ from a plain Number defect, as a short line under the name.
    const summary = (s: DefectSettings) => [
        s.fieldType !== "number" && fieldTypeLabel(s.fieldType) + (s.options ? ` (${s.options})` : ""),
        s.reportRole && `Reports: ${reportRoleLabel(s.reportRole)}`,
        s.defaultValue && !(s.fieldType === "number" && s.defaultValue === "0") && `Default ${s.defaultValue}`,
        s.isRequired && "Required",
        s.isHidden && "Hidden",
    ].filter(Boolean).join(" · ")

    return (
        <>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
            {/* Reachable before a file is chosen: download, fill in, then import. */}
            <button
                onClick={() => downloadTemplate(fields)}
                title="Download an Excel template: this form's defects with all their settings, plus the standard defects"
                className="h-[26px] px-[10px] bg-white border border-[var(--border)] text-[var(--text)] rounded-[8px] text-[12px] font-[500] hover:bg-[var(--surface2)] flex items-center gap-1 transition-colors"
            >
                <Download className="h-[13px] w-[13px]" /> Template
            </button>
            <button
                onClick={() => inputRef.current?.click()}
                disabled={reading}
                title="Add or update defects from an Excel sheet"
                className="h-[26px] px-[10px] bg-white border border-[var(--border)] text-[var(--text)] rounded-[8px] text-[12px] font-[500] hover:bg-[var(--surface2)] flex items-center gap-1 transition-colors disabled:opacity-50"
            >
                {reading ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <FileUp className="h-[13px] w-[13px]" />} Import Excel
            </button>

            {rows && (
                <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="defect-import-title">
                    <div className="bg-white rounded-[14px] w-full max-w-[640px] max-h-[86vh] flex flex-col shadow-xl overflow-hidden">
                        <div className="flex items-start justify-between gap-3 p-[16px_20px] border-b border-[var(--border)]">
                            <div className="min-w-0">
                                <h2 id="defect-import-title" className="text-[15px] font-[600] text-[var(--text)]">Import defects</h2>
                                <p className="text-[12px] text-[var(--text3)] mt-[2px] truncate">{fileName}</p>
                            </div>
                            <button onClick={close} aria-label="Close" className="p-1 text-[var(--text3)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
                        </div>

                        <div className="flex flex-wrap gap-2 p-[12px_20px] border-b border-[var(--border)] text-[12px]">
                            <span className="px-[10px] py-[4px] rounded-full bg-[#dcfce7] text-[#15803d] font-[600]">{newOnes.length} new</span>
                            <span className="px-[10px] py-[4px] rounded-full bg-[#fef3c7] text-[#b45309] font-[600]">{updates.length} to update</span>
                            <span className="px-[10px] py-[4px] rounded-full bg-[var(--surface2)] text-[var(--text2)] font-[600]">{skipCount} skipped</span>
                            {errorCount > 0 && (
                                <span className="px-[10px] py-[4px] rounded-full bg-[#fef2f2] text-[#dc2626] font-[600]">{errorCount} to fix</span>
                            )}
                            {tooMany && (
                                <span className="px-[10px] py-[4px] rounded-full bg-[#fef2f2] text-[#dc2626] font-[600]">At most {MAX_DEFECTS} per import</span>
                            )}
                        </div>
                        {errorCount > 0 && (
                            <p role="alert" className="px-[20px] pt-[10px] text-[12px] text-[#b91c1c]">
                                Fix the {errorCount} row{errorCount === 1 ? "" : "s"} marked in red in the file and import it again — nothing is added or updated until then.
                            </p>
                        )}
                        {updates.length > 0 && errorCount === 0 && (
                            <p className="mx-[20px] mt-[10px] px-[12px] py-[8px] rounded-[8px] bg-[#fffbeb] border border-[#fde68a] text-[12px] text-[#92400e] flex items-start gap-1.5">
                                <AlertTriangle className="h-[14px] w-[14px] shrink-0 mt-[1px]" />
                                <span>{plural(updates.length, "defect already in the form", "defects already in the form")} will be changed as listed below. Check them before importing.</span>
                            </p>
                        )}

                        <div className="overflow-y-auto flex-1">
                            {/* Fixed layout so a long name wraps instead of pushing Result off-screen. */}
                            <table className="w-full table-fixed text-[12.5px]">
                                <thead className="sticky top-0 bg-[var(--surface2)]">
                                    <tr>
                                        <th className="text-left pl-[20px] pr-[8px] py-[7px] text-[10.5px] font-[600] text-[var(--text3)] uppercase tracking-[0.6px] w-[64px]">Row</th>
                                        <th className="text-left px-[8px] py-[7px] text-[10.5px] font-[600] text-[var(--text3)] uppercase tracking-[0.6px]">Defect</th>
                                        <th className="text-left px-[20px] py-[7px] text-[10.5px] font-[600] text-[var(--text3)] uppercase tracking-[0.6px] w-[44%]">Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r, i) => (
                                        <tr key={i} className={`border-t border-[var(--border)] ${r.status === "error" ? "bg-[#fff5f5]" : r.status === "update" ? "bg-[#fffbeb]" : ""}`}>
                                            <td className="pl-[20px] pr-[8px] py-[7px] text-[var(--text3)] tabular-nums align-top">{r.excelRow}</td>
                                            <td className="px-[8px] py-[7px] align-top">
                                                <div className="text-[var(--text)] [overflow-wrap:anywhere]">{r.label}</div>
                                                {r.status !== "error" && summary(r.settings) && <div className="text-[11px] text-[var(--text3)] mt-[1px] [overflow-wrap:anywhere]">{summary(r.settings)}</div>}
                                            </td>
                                            <td className="px-[20px] py-[7px] align-top">
                                                {r.status === "new"
                                                    ? <span className="inline-flex items-center gap-1 text-[#15803d]"><CheckCircle2 className="h-[13px] w-[13px] shrink-0" /> Will be added</span>
                                                    : r.status === "update"
                                                    ? <div className="text-[#b45309]">
                                                        <span className="inline-flex items-center gap-1 font-[500]"><AlertTriangle className="h-[13px] w-[13px] shrink-0" /> Will be updated</span>
                                                        <ul className="mt-[2px] ml-[18px] text-[11.5px] list-disc">
                                                            {r.changes?.map(c => <li key={c} className="[overflow-wrap:anywhere]">{c}</li>)}
                                                        </ul>
                                                    </div>
                                                    : r.status === "error"
                                                    ? <span className="inline-flex items-start gap-1 text-[#dc2626]"><XCircle className="h-[13px] w-[13px] shrink-0 mt-[2px]" /> {r.reason}</span>
                                                    : <span className="inline-flex items-start gap-1 text-[var(--text3)]"><MinusCircle className="h-[13px] w-[13px] shrink-0 mt-[2px]" /> {r.reason}</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 p-[12px_20px] border-t border-[var(--border)]">
                            <div className="flex gap-2">
                                <button onClick={close} disabled={saving} className="h-[32px] px-[14px] rounded-[8px] border border-[var(--border)] bg-white text-[12.5px] text-[var(--text2)]">Cancel</button>
                                <button onClick={add} disabled={saving || blocked}
                                    className="h-[32px] px-[14px] rounded-[8px] bg-[var(--accent)] text-white text-[12.5px] font-[500] inline-flex items-center gap-1.5 disabled:opacity-50">
                                    {saving && <Loader2 className="h-[13px] w-[13px] animate-spin" />}
                                    {newOnes.length && updates.length
                                        ? `Import: ${newOnes.length} new, ${plural(updates.length, "update", "updates")}`
                                        : newOnes.length ? `Add ${plural(newOnes.length, "defect", "defects")}`
                                        : updates.length ? `Update ${plural(updates.length, "defect", "defects")}`
                                        : "Nothing to import"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
