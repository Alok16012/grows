"use client"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { X, Upload, Download, Loader2 } from "lucide-react"
import { employeeFiltersToParams, type EmployeeFilters } from "@/lib/employee-filter"
import {
    BULK_PRESETS, BULK_FIELD_BY_KEY, resolveBulkHeader, cellToString,
    type BulkPreset, type BulkUpdateRow, type BulkUpdateError, type BulkUpdateResult,
} from "@/lib/employee-bulk-update"

const loadXLSX = () => import("xlsx")

const CHUNK = 100

const btn: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", border: "1px solid var(--border)",
    borderRadius: 8, cursor: "pointer", fontSize: 13, color: "var(--text)", background: "var(--surface)",
}

/**
 * Bulk Update: download the employees on screen as a pre-filled sheet, fill in
 * the missing values (UAN / PF / ESIC for the whole workforce, typically) and
 * upload it back. Rows match on Employee ID; blank cells leave data alone.
 */
export function BulkUpdateEmployees({ filters, onClose, onDone }: {
    filters: EmployeeFilters
    onClose: () => void
    onDone: () => void
}) {
    const [preset, setPreset] = useState<BulkPreset>("statutory")
    const [downloading, setDownloading] = useState(false)
    const [rows, setRows] = useState<BulkUpdateRow[]>([])
    const [columns, setColumns] = useState<string[]>([])
    const [fileErrors, setFileErrors] = useState<BulkUpdateError[]>([])
    const [fileName, setFileName] = useState("")
    const [running, setRunning] = useState(false)
    const [progress, setProgress] = useState({ done: 0, total: 0 })
    const [result, setResult] = useState<BulkUpdateResult | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    async function downloadTemplate() {
        setDownloading(true)
        try {
            const params = employeeFiltersToParams(filters)
            params.set("preset", preset)
            const res = await fetch(`/api/employees/bulk-update?${params}`)
            if (!res.ok) { toast.error("Could not download the template"); return }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `employee_bulk_update_${preset}_${new Date().toISOString().split("T")[0]}.xlsx`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
            toast.success("Template downloaded — fill it in and upload it here")
        } catch {
            toast.error("Could not download the template")
        } finally {
            setDownloading(false)
        }
    }

    function readFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setFileName(file.name)
        setResult(null)
        const reader = new FileReader()
        reader.onload = async ev => {
            const XLSX = await loadXLSX()
            const wb = XLSX.read(ev.target?.result as ArrayBuffer, { type: "array" })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false })
            const header = (grid[0] ?? []).map(h => String(h ?? ""))
            const keys = header.map(resolveBulkHeader)
            const idCol = keys.indexOf("employeeId")
            if (idCol === -1) {
                toast.error("No Employee ID column found — use the downloaded template")
                setRows([]); setColumns([]); setFileErrors([])
                return
            }
            const fieldCols = keys
                .map((k, i) => ({ k, i }))
                .filter((c): c is { k: string; i: number } => !!c.k && c.k !== "employeeId")

            const parsed: BulkUpdateRow[] = []
            const errs: BulkUpdateError[] = []
            const seen = new Map<string, number>()
            grid.slice(1).forEach((line, idx) => {
                const rowNum = idx + 2
                const employeeId = cellToString(line[idCol]).value
                const values: Record<string, string> = {}
                let cellError: string | null = null
                for (const { k, i } of fieldCols) {
                    const cell = cellToString(line[i])
                    if (cell.error) { cellError = `${BULK_FIELD_BY_KEY.get(k)?.label}: ${cell.error}`; break }
                    if (cell.value) values[k] = cell.value
                }
                if (!employeeId && Object.keys(values).length === 0) return
                if (!employeeId) { errs.push({ row: rowNum, employeeId: "", reason: "Employee ID is blank" }); return }
                if (cellError) { errs.push({ row: rowNum, employeeId, reason: cellError }); return }
                const dup = seen.get(employeeId.toUpperCase())
                if (dup) { errs.push({ row: rowNum, employeeId, reason: `Same Employee ID as row ${dup}` }); return }
                seen.set(employeeId.toUpperCase(), rowNum)
                parsed.push({ row: rowNum, employeeId, values })
            })
            setRows(parsed)
            setFileErrors(errs)
            setColumns(fieldCols.map(c => BULK_FIELD_BY_KEY.get(c.k)!.label))
        }
        reader.readAsArrayBuffer(file)
    }

    async function apply() {
        if (rows.length === 0) return
        setRunning(true)
        setProgress({ done: 0, total: rows.length })
        const total: BulkUpdateResult = { updated: 0, unchanged: 0, failed: fileErrors.length, errors: [...fileErrors] }
        try {
            for (let start = 0; start < rows.length; start += CHUNK) {
                const chunk = rows.slice(start, start + CHUNK)
                const res = await fetch("/api/employees/bulk-update", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rows: chunk }),
                })
                const data = await res.json().catch(() => null)
                if (!res.ok || !data) {
                    for (const r of chunk) total.errors.push({ row: r.row, employeeId: r.employeeId, reason: data?.error ?? "Request failed" })
                    total.failed += chunk.length
                } else {
                    total.updated += data.updated
                    total.unchanged += data.unchanged
                    total.failed += data.failed
                    total.errors.push(...data.errors)
                }
                setProgress({ done: Math.min(start + CHUNK, rows.length), total: rows.length })
            }
            total.errors.sort((a, b) => a.row - b.row)
            setResult(total)
            if (total.updated > 0) {
                toast.success(`${total.updated} employee(s) updated`)
                onDone()
            } else if (total.failed > 0) {
                toast.error("Nothing updated — see the errors below")
            } else {
                toast.info("No changes found in the file")
            }
        } finally {
            setRunning(false)
        }
    }

    async function downloadErrors() {
        if (!result) return
        const XLSX = await loadXLSX()
        const ws = XLSX.utils.aoa_to_sheet([
            ["Row", "Employee ID", "Reason"],
            ...result.errors.map(e => [e.row, e.employeeId, e.reason]),
        ])
        ws["!cols"] = [{ wch: 8 }, { wch: 16 }, { wch: 90 }]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Errors")
        XLSX.writeFile(wb, "employee_bulk_update_errors.xlsx")
    }

    const pct = progress.total ? Math.round(progress.done / progress.total * 100) : 0

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)" }}>
            <div style={{ background: "var(--surface)", borderRadius: 14, width: "min(680px, 96vw)", maxHeight: "88vh", overflowY: "auto", padding: 24, position: "relative" }}>
                <button onClick={onClose} disabled={running} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}><X size={18} /></button>
                <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>Bulk Update Employees</h2>
                <p style={{ fontSize: 12.5, color: "var(--text3)", marginBottom: 18 }}>
                    Update existing employees from Excel. Rows are matched on Employee ID; blank cells are left unchanged.
                </p>

                {/* Step 1 */}
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>1. Download the template (pre-filled with the employees in the current list)</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {(Object.keys(BULK_PRESETS) as BulkPreset[]).map(p => (
                        <label key={p} style={{ ...btn, padding: "6px 12px", fontSize: 12.5, borderColor: preset === p ? "var(--accent)" : "var(--border)" }}>
                            <input type="radio" name="bulk-preset" checked={preset === p} onChange={() => setPreset(p)} style={{ accentColor: "var(--accent)" }} />
                            {BULK_PRESETS[p].label}
                        </label>
                    ))}
                </div>
                <button onClick={downloadTemplate} disabled={downloading} style={{ ...btn, marginBottom: 20, opacity: downloading ? 0.6 : 1 }}>
                    {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Download Template
                </button>

                {/* Step 2 */}
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>2. Upload the filled file</p>
                <label style={{ ...btn, display: "inline-flex", marginBottom: 14 }}>
                    <Upload size={14} /> {fileName || "Choose File (.xlsx / .csv)"}
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={readFile} disabled={running} style={{ display: "none" }} />
                </label>

                {(rows.length > 0 || fileErrors.length > 0) && !result && (
                    <div style={{ marginBottom: 14 }}>
                        <p style={{ fontSize: 13, color: "var(--text)", marginBottom: 6 }}>
                            <b>{rows.length}</b> row(s) ready{fileErrors.length > 0 && <>, <span style={{ color: "#dc2626" }}>{fileErrors.length} with problems</span></>}
                        </p>
                        <p style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12 }}>
                            Columns that will be updated: {columns.length ? columns.join(", ") : "none recognised"}
                        </p>
                        {running && (
                            <div style={{ marginBottom: 10 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>
                                    <span>Updating… {progress.done} / {progress.total}</span><span>{pct}%</span>
                                </div>
                                <div style={{ height: 6, borderRadius: 4, background: "var(--border)" }}>
                                    <div style={{ height: 6, borderRadius: 4, background: "var(--accent)", width: `${pct}%`, transition: "width 0.3s" }} />
                                </div>
                            </div>
                        )}
                        <button
                            onClick={apply}
                            disabled={running || rows.length === 0 || columns.length === 0}
                            style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: running ? "not-allowed" : "pointer", opacity: running || rows.length === 0 || columns.length === 0 ? 0.7 : 1 }}
                        >
                            {running && <Loader2 size={14} className="animate-spin" />}
                            {running ? `Updating ${progress.done}/${progress.total}…` : `Update ${rows.length} employee(s)`}
                        </button>
                    </div>
                )}

                {result && (
                    <div style={{ padding: "14px 16px", borderRadius: 10, background: result.updated > 0 ? "#e8f7f1" : "#fef2f2", border: `1px solid ${result.updated > 0 ? "#6ee7b7" : "#fecaca"}` }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: result.updated > 0 ? "#047857" : "#dc2626", marginBottom: 4 }}>
                            ✓ {result.updated} updated · {result.unchanged} unchanged · {result.failed} failed
                        </p>
                        {result.errors.length > 0 && (
                            <>
                                <ul style={{ margin: "8px 0 10px", padding: "0 0 0 16px", fontSize: 12, color: "#6b7280" }}>
                                    {result.errors.slice(0, 8).map((e, i) => <li key={i}>Row {e.row}{e.employeeId && ` (${e.employeeId})`}: {e.reason}</li>)}
                                    {result.errors.length > 8 && <li>…and {result.errors.length - 8} more</li>}
                                </ul>
                                <button onClick={downloadErrors} style={{ ...btn, padding: "6px 12px", fontSize: 12.5 }}>
                                    <Download size={13} /> Download error list
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
