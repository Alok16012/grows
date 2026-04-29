"use client"
import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import {
    Upload, Download, CheckCircle2, XCircle, Loader2,
    FileSpreadsheet, AlertCircle, Users, MapPin, ChevronRight, RefreshCw
} from "lucide-react"
import { toast } from "sonner"

// ─── Types ────────────────────────────────────────────────────────────────────
type Site = { id: string; name: string; code?: string; city?: string }

type ParsedRow = {
    rowIndex: number
    rawEmployeeId: string
    rawName: string
    monthDays: number  // total working days in the month (standard = 26)
    days: number; otDays: number; otherDeduction: number; lwf: number
    canteenDays: number; penalty: number; advance: number
    productionIncentive: number
}
type MatchedRow = ParsedRow & {
    matched: boolean; employeeId?: string; dbName?: string; designation?: string
}
type Employee = {
    id: string; employeeId: string; firstName: string; lastName: string; designation?: string
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

const TEMPLATE_COLS = [
    "Employee ID","Employee Name","MONTH DAYS","DAYS","OT DAYS","OTHER DEDUCTION",
    "LWF","CANTEEN DAYS","PENALTY","ADVANCE","PRODUCTION INCENTIVE"
]
const TEMPLATE_SAMPLE = [
    ["EMP-0001","Rahul Kumar",   26, 26, 2, 150, 10, 24, 50,  1000, 0],
    ["EMP-0002","Priya Sharma",  26, 25, 0, 0,   10, 20, 0,   0,    500],
    ["EMP-0003","Amit Singh",    26, 26, 1, 200, 10, 26, 100, 500,  0],
]

function downloadTemplate(siteName: string, employees: Employee[]) {
    const wb = XLSX.utils.book_new()
    const sheetName = `${siteName.slice(0, 20)} Attendance`
    const header = [`SITE: ${siteName}`, "", "", "", "", "", "", "", "", ""]
    const empRows = employees.length > 0
        ? employees.map(e => [e.employeeId, `${e.firstName} ${e.lastName}`, 26, 26, 0, 0, 10, 0, 0, 0, 0])
        : TEMPLATE_SAMPLE
    const wsData = [header, TEMPLATE_COLS, ...empRows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws["!cols"] = TEMPLATE_COLS.map((_, i) => ({ wch: i <= 1 ? 22 : 16 }))
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, `Attendance_${siteName.replace(/\s+/g, "_")}.xlsx`)
}

// ─── Shared Styles ────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
    background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: 12, padding: "18px 20px"
}
const stepBadge: React.CSSProperties = {
    width: 24, height: 24, borderRadius: "50%", background: "var(--accent)",
    color: "#fff", fontSize: 11, fontWeight: 700, display: "flex",
    alignItems: "center", justifyContent: "center", flexShrink: 0
}
const inputSt: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)",
    fontSize: 13, background: "var(--surface)", color: "var(--text)",
    outline: "none", fontWeight: 600
}
const btnPrimary: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
    borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff",
    fontSize: 13, fontWeight: 600, cursor: "pointer"
}
const btnOutline: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
    borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)",
    color: "var(--text2)", fontSize: 13, fontWeight: 500, cursor: "pointer"
}

export default function AttendanceUploadPage() {
    const router = useRouter()

    const now = new Date()
    const [month, setMonth] = useState(now.getMonth() + 1)
    const [year,  setYear]  = useState(now.getFullYear())
    const [siteId, setSiteId] = useState("")
    const [sites,  setSites]  = useState<Site[]>([])
    const [sitesLoading, setSitesLoading] = useState(true)

    const [file, setFile] = useState<File | null>(null)
    const [parsing, setParsing] = useState(false)
    const [matched, setMatched] = useState<MatchedRow[] | null>(null)
    const [processing, setProcessing] = useState(false)
    const [siteEmployees, setSiteEmployees] = useState<Employee[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!siteId) { setSiteEmployees([]); return }
        fetch(`/api/employees?siteId=${siteId}&status=ACTIVE`)
            .then(r => r.json())
            .then(d => setSiteEmployees(Array.isArray(d) ? d : []))
            .catch(() => setSiteEmployees([]))
    }, [siteId])

    useEffect(() => {
        fetch("/api/sites?isActive=true")
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setSites(data)
                    if (data.length > 0) setSiteId(data[0].id)
                }
            })
            .catch(() => toast.error("Failed to load sites"))
            .finally(() => setSitesLoading(false))
    }, [])

    const selectedSite = sites.find(s => s.id === siteId)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFile(e.target.files?.[0] ?? null)
        setMatched(null)
    }

    const handleValidate = useCallback(async () => {
        if (!siteId) { toast.error("Select a site first"); return }
        if (!file)   { toast.error("Choose an Excel file first"); return }
        setParsing(true)
        setMatched(null)
        try {
            const buf = await file.arrayBuffer()
            const wb  = XLSX.read(buf, { type: "array" })
            const ws  = wb.Sheets[wb.SheetNames[0]]

            // Get raw rows as arrays to find the actual header row
            const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" })

            // Find the row that contains "Employee ID" — that's the real header
            const headerIdx = rawRows.findIndex(row =>
                Array.isArray(row) && row.some(cell => String(cell).trim() === "Employee ID")
            )
            if (headerIdx === -1) {
                toast.error("Could not find header row with 'Employee ID' column")
                setParsing(false)
                return
            }
            const headers = (rawRows[headerIdx] as unknown[]).map(h => String(h).trim())
            const dataRows = rawRows.slice(headerIdx + 1).filter(row =>
                Array.isArray(row) && row.some(cell => String(cell).trim() !== "")
            )

            const rows: Record<string, unknown>[] = dataRows.map(row => {
                const obj: Record<string, unknown> = {}
                headers.forEach((h, i) => { obj[h] = (row as unknown[])[i] ?? "" })
                return obj
            })

            if (rows.length === 0) { toast.error("No data rows found in file"); setParsing(false); return }

            const parsed: ParsedRow[] = rows.map((row, i) => ({
                rowIndex: i + 2,
                rawEmployeeId: String(row["Employee ID"] ?? row["EMP ID"] ?? row["employee id"] ?? "").trim(),
                rawName: String(row["Employee Name"] ?? row["Name"] ?? row["employee name"] ?? "").trim(),
                // MONTH DAYS = total working days in the month (standard 26); DAYS = days employee actually worked
                monthDays:           Number(row["MONTH DAYS"] ?? row["Month Days"] ?? row["MonthDays"] ?? 26) || 26,
                days:                Number(row["DAYS"]                 ?? row["Days"]                 ?? 26),
                otDays:              Number(row["OT DAYS"]              ?? row["OT Days"]              ?? 0),
                otherDeduction:      Number(row["OTHER DEDUCTION"]      ?? row["Other Deduction"]      ?? 0),
                lwf:                 Number(row["LWF"]                  ?? row["lwf"]                  ?? 0),
                canteenDays:         Number(row["CANTEEN DAYS"]         ?? row["Canteen Days"]         ?? 0),
                penalty:             Number(row["PENALTY"]              ?? row["Penalty"]              ?? 0),
                advance:             Number(row["ADVANCE"]              ?? row["Advance"]              ?? 0),
                productionIncentive: Number(row["PRODUCTION INCENTIVE"] ?? row["Production Incentive"] ?? 0),
            })).filter(r => r.rawEmployeeId)

            if (!parsed.length) { toast.error("No valid Employee ID rows found"); setParsing(false); return }

            // Fetch employees for this site
            const empRes = await fetch(`/api/employees?siteId=${siteId}&status=ACTIVE`)
            const empData = await empRes.json()
            const employees: Employee[] = Array.isArray(empData) ? empData : (empData.employees ?? [])

            const empMap = new Map(employees.map(e => [e.employeeId.toUpperCase(), e]))

            const matchedRows: MatchedRow[] = parsed.map(r => {
                const emp = empMap.get(r.rawEmployeeId.toUpperCase())
                return {
                    ...r, matched: !!emp,
                    employeeId:  emp?.id,
                    dbName:      emp ? `${emp.firstName} ${emp.lastName}` : undefined,
                    designation: emp?.designation,
                }
            })

            setMatched(matchedRows)
            const found = matchedRows.filter(r => r.matched).length
            toast.success(`${found} of ${matchedRows.length} employees matched at ${selectedSite?.name}`)
        } catch (err) {
            console.error(err)
            toast.error("Failed to parse file")
        } finally {
            setParsing(false)
        }
    }, [file, siteId, selectedSite])

    const handleProcess = async () => {
        if (!matched || !siteId) return
        const valid = matched.filter(r => r.matched && r.employeeId)
        if (!valid.length) { toast.error("No matched employees to process"); return }
        setProcessing(true)
        try {
            const attendance = valid.map(r => ({
                employeeId:          r.employeeId!,
                monthDays:           r.monthDays,   // total working days in month (standard 26)
                workedDays:          r.days,         // actual days employee worked
                otDays:              r.otDays,
                otherDeductions:     r.otherDeduction,
                lwf:                 r.lwf,
                canteenDays:         r.canteenDays,
                penalty:             r.penalty,
                advance:             r.advance,
                productionIncentive: r.productionIncentive,
            }))
            const res = await fetch("/api/payroll/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ siteId, month, year, attendance }),
            })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            toast.success(`Payroll processed for ${data.processedCount} employees at ${selectedSite?.name}`)
            router.push("/payroll")
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Processing failed")
        } finally {
            setProcessing(false)
        }
    }

    const matchedCount   = matched?.filter(r => r.matched).length  ?? 0
    const unmatchedCount = matched?.filter(r => !r.matched).length  ?? 0

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1100, paddingBottom: 32 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>
                        <span style={{ cursor: "pointer" }} onClick={() => router.push("/payroll")}>Payroll</span>
                        <ChevronRight size={10} />
                        <span style={{ fontWeight: 600, color: "var(--text2)" }}>Upload Attendance</span>
                    </div>
                    <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>Upload Attendance</h1>
                    <p style={{ fontSize: 12, color: "var(--text3)", margin: "3px 0 0 0" }}>
                        Site-wise bulk attendance upload for payroll processing
                    </p>
                </div>
            </div>

            {/* Step 0: Select Site + Month/Year */}
            <div style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <div style={stepBadge}>1</div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>Select Site & Month</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
                    <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 5 }}>Site *</label>
                        {sitesLoading ? (
                            <div style={{ height: 36, display: "flex", alignItems: "center", gap: 6, color: "var(--text3)", fontSize: 12 }}>
                                <Loader2 size={14} className="animate-spin" /> Loading sites…
                            </div>
                        ) : (
                            <select value={siteId} onChange={e => { setSiteId(e.target.value); setMatched(null) }}
                                style={{ ...inputSt, width: "100%" }}>
                                <option value="">— Select Site —</option>
                                {sites.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}{s.city ? ` — ${s.city}` : ""}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 5 }}>Month *</label>
                        <select value={month} onChange={e => setMonth(Number(e.target.value))}
                            style={{ ...inputSt, width: "100%" }}>
                            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 5 }}>Year *</label>
                        <select value={year} onChange={e => setYear(Number(e.target.value))}
                            style={{ ...inputSt, width: "100%" }}>
                            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
                {selectedSite && (
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, background: "var(--accent-light)", border: "1px solid var(--accent)30" }}>
                        <MapPin size={13} style={{ color: "var(--accent)" }} />
                        <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                            {selectedSite.name}{selectedSite.city ? ` · ${selectedSite.city}` : ""} — {MONTHS[month - 1]} {year}
                        </span>
                    </div>
                )}
            </div>

            {/* Step 2: Download Template */}
            <div style={card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={stepBadge}>2</div>
                        <div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>Download Template</p>
                            <p style={{ fontSize: 12, color: "var(--text3)", margin: "2px 0 0 0" }}>
                                Fill in the Excel template with attendance data for this site and month
                            </p>
                        </div>
                    </div>
                    <button onClick={() => downloadTemplate(selectedSite!.name, siteEmployees)} disabled={!siteId}
                        style={{ ...btnPrimary, background: "#16a34a", opacity: !siteId ? 0.5 : 1 }}>
                        <Download size={14} /> Download Template{selectedSite ? ` — ${selectedSite.name}` : ""}
                    </button>
                </div>

                {/* Column guide */}
                <div style={{ marginTop: 14, overflowX: "auto", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead>
                            <tr style={{ background: "var(--surface2)" }}>
                                {TEMPLATE_COLS.map(c => (
                                    <th key={c} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 700, color: "var(--text3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{c}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(siteEmployees.length > 0
                                ? siteEmployees.map(e => [e.employeeId, `${e.firstName} ${e.lastName}`, 26, 0, 0, 10, 0, 0, 0, 0])
                                : TEMPLATE_SAMPLE
                            ).map((row, i, arr) => (
                                <tr key={i} style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                                    {row.map((cell, j) => (
                                        <td key={j} style={{ padding: "6px 10px", color: "var(--text2)", whiteSpace: "nowrap" }}>{String(cell)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Step 3: Upload */}
            <div style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <div style={stepBadge}>3</div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>Upload & Validate Excel</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} style={{ display: "none" }} />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button onClick={() => fileInputRef.current?.click()} style={btnOutline}>
                        <FileSpreadsheet size={14} style={{ color: "#16a34a" }} />
                        {file ? file.name : "Choose Excel File"}
                    </button>
                    {file && (
                        <button onClick={handleValidate} disabled={parsing || !siteId}
                            style={{ ...btnPrimary, opacity: (!siteId || parsing) ? 0.6 : 1 }}>
                            {parsing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                            {parsing ? "Validating…" : "Upload & Validate"}
                        </button>
                    )}
                    {matched && (
                        <button onClick={() => { setFile(null); setMatched(null); if (fileInputRef.current) fileInputRef.current.value = "" }}
                            style={btnOutline}>
                            <RefreshCw size={13} /> Clear
                        </button>
                    )}
                </div>
                {file && (
                    <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
                        {file.name} — {(file.size / 1024).toFixed(1)} KB
                    </p>
                )}
            </div>

            {/* Step 4: Validation Results */}
            {matched && (
                <div style={card}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <div style={stepBadge}>4</div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>
                            Validation Results — {selectedSite?.name}
                        </p>
                    </div>

                    {/* Stats */}
                    <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                        {[
                            { label: "Total Rows",  value: matched.length,   color: "#6b7280", bg: "var(--surface2)", border: "var(--border)" },
                            { label: "Matched",     value: matchedCount,     color: "#15803d", bg: "#dcfce7",         border: "#86efac" },
                            { label: "Not Found",   value: unmatchedCount,   color: "#dc2626", bg: "#fee2e2",         border: "#fca5a5" },
                        ].map(s => (
                            <div key={s.label} style={{ padding: "8px 16px", borderRadius: 8, background: s.bg, border: `1px solid ${s.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                                <Users size={14} style={{ color: s.color }} />
                                <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.value} {s.label}</span>
                            </div>
                        ))}
                    </div>

                    {unmatchedCount > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde047", marginBottom: 12, fontSize: 12, color: "#a16207" }}>
                            <AlertCircle size={14} style={{ flexShrink: 0 }} />
                            {unmatchedCount} employee ID(s) not found in the system or not deployed to {selectedSite?.name}. They will be skipped.
                        </div>
                    )}

                    {/* Table */}
                    <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                                    {["","Emp ID","Name (File)","Name (DB)","Designation","Days","OT Days","Other Ded.","LWF","Canteen Days","Penalty","Advance","Prod. Inc."].map(h => (
                                        <th key={h} style={{ padding: "8px 10px", textAlign: h === "" ? "center" : "left", fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px", whiteSpace: "nowrap" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {matched.map((r, i) => (
                                    <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: r.matched ? (i % 2 === 0 ? "var(--surface)" : "var(--surface2)") : "#fff5f5" }}>
                                        <td style={{ padding: "7px 10px", textAlign: "center" }}>
                                            {r.matched
                                                ? <CheckCircle2 size={14} style={{ color: "#16a34a" }} />
                                                : <XCircle     size={14} style={{ color: "#dc2626" }} />}
                                        </td>
                                        <td style={{ padding: "7px 10px", fontFamily: "monospace", color: "var(--accent)", fontWeight: 700 }}>{r.rawEmployeeId}</td>
                                        <td style={{ padding: "7px 10px", color: "var(--text2)" }}>{r.rawName || "—"}</td>
                                        <td style={{ padding: "7px 10px", color: r.matched ? "var(--text)" : "#dc2626", fontWeight: r.matched ? 600 : 400, fontStyle: r.matched ? "normal" : "italic" }}>
                                            {r.dbName ?? "not found"}
                                        </td>
                                        <td style={{ padding: "7px 10px", color: "var(--text3)" }}>{r.designation || "—"}</td>
                                        <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700 }}>{r.days}</td>
                                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{r.otDays}</td>
                                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{r.otherDeduction || "—"}</td>
                                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{r.lwf || "—"}</td>
                                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{r.canteenDays || "—"}</td>
                                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{r.penalty || "—"}</td>
                                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{r.advance || "—"}</td>
                                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{r.productionIncentive || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {matchedCount > 0 && (
                                <tfoot>
                                    <tr style={{ background: "var(--surface2)", borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                                        <td colSpan={5} style={{ padding: "8px 10px", fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                                            Total ({matchedCount} employees)
                                        </td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text)" }}>{matched.filter(r=>r.matched).reduce((s,r)=>s+r.days,0)}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text)" }}>{matched.filter(r=>r.matched).reduce((s,r)=>s+r.otDays,0)}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{matched.filter(r=>r.matched).reduce((s,r)=>s+r.otherDeduction,0) || "—"}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{matched.filter(r=>r.matched).reduce((s,r)=>s+r.lwf,0) || "—"}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{matched.filter(r=>r.matched).reduce((s,r)=>s+r.canteenDays,0) || "—"}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{matched.filter(r=>r.matched).reduce((s,r)=>s+r.penalty,0) || "—"}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{matched.filter(r=>r.matched).reduce((s,r)=>s+r.advance,0) || "—"}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{matched.filter(r=>r.matched).reduce((s,r)=>s+r.productionIncentive,0) || "—"}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    {/* Process Button */}
                    {matchedCount > 0 && (
                        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                            <button onClick={() => { setFile(null); setMatched(null) }} style={btnOutline}>
                                Upload Another Site
                            </button>
                            <button onClick={handleProcess} disabled={processing}
                                style={{ ...btnPrimary, background: "#16a34a", opacity: processing ? 0.7 : 1, fontSize: 13, padding: "9px 20px" }}>
                                {processing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                {processing ? "Processing…" : `Process Payroll — ${matchedCount} Employees at ${selectedSite?.name}`}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
