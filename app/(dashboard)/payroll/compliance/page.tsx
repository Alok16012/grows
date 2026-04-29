"use client"
import { Suspense, useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import * as XLSX from "xlsx"
import { toast } from "sonner"
import { Loader2, Download, RefreshCw, ChevronRight, ShieldCheck, AlertCircle, Users, Lock, TableProperties } from "lucide-react"

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")

type StatsData  = { totalEmployees: number; grossPay: number; totalDeduction: number; netPay: number }
type ReportItem = { id: string; label: string; type: string }
type LockedEmp  = { id: string; netSalary: number; grossSalary: number; siteId: string | null; employee: { employeeId: string; firstName: string; lastName: string; designation: string | null } }

const PF_REPORTS: ReportItem[]   = [
    { id: "pf-summary",   label: "PF Summary (Site-wise)",  type: "pf-summary"   },
    { id: "pf-deduction", label: "PF Deduction List (Form 12A)", type: "pf-deduction" },
    { id: "pf-ecr",       label: "PF ECR File (EPFO)",      type: "pf-ecr"       },
    { id: "pf-challan",   label: "PF Challan",              type: "pf-challan"   },
    { id: "pf-register",  label: "PF Register (UAN Wise)",  type: "pf-register"  },
]
const ESIC_REPORTS: ReportItem[] = [
    { id: "esic-summary",   label: "ESIC Summary (Site-wise)",    type: "esic-summary"   },
    { id: "esic-deduction", label: "ESIC Deduction List (Form 7)", type: "esic-deduction" },
    { id: "esic-challan",   label: "ESIC Challan",                type: "esic-challan"   },
]
const PT_REPORTS: ReportItem[]   = [
    { id: "pt-summary",   label: "PT Summary (Site-wise)",  type: "pt-summary"   },
    { id: "pt-deduction", label: "PT Deduction Report",     type: "pt-deduction" },
    { id: "pt-challan",   label: "PT Challan (MTR-6)",      type: "pt-challan"   },
]
const WAGE_REPORTS: ReportItem[] = [
    { id: "wage-sheet", label: "Wage Sheet — Form II (MW Rules)", type: "wage-sheet" },
]

function ComplianceInner() {
    const router     = useRouter()
    const params     = useSearchParams()
    const [month,      setMonth]      = useState(Number(params.get("month")) || new Date().getMonth() + 1)
    const [year,       setYear]       = useState(Number(params.get("year"))  || new Date().getFullYear())
    const [stats,      setStats]      = useState<StatsData | null>(null)
    const [loading,    setLoading]    = useState(false)
    const [dataLoaded, setDataLoaded] = useState(false)
    const [dlLoading,  setDlLoading]  = useState<string | null>(null)
    const [lockedEmps, setLockedEmps] = useState<LockedEmp[]>([])
    const [ldLocked,   setLdLocked]   = useState(false)

    const fetchLockedEmps = useCallback(async () => {
        setLdLocked(true)
        try {
            const r = await fetch(`/api/payroll?month=${month}&year=${year}&status=PROCESSED`)
            if (r.ok) { const d = await r.json(); setLockedEmps(Array.isArray(d) ? d : []) }
        } catch {}
        finally { setLdLocked(false) }
    }, [month, year])

    useEffect(() => { fetchLockedEmps() }, [fetchLockedEmps])

    const handleLoad = async () => {
        setLoading(true); setDataLoaded(false); setStats(null)
        try {
            // Use pf-deduction (employee-level) to compute stats
            const r = await fetch(`/api/payroll/reports/compliance?month=${month}&year=${year}&type=pf-deduction`)
            if (!r.ok) { toast.error(await r.text() || "No payroll data found"); return }
            const data = await r.json()
            const r2 = await fetch(`/api/payroll/reports/compliance?month=${month}&year=${year}&type=wage-sheet`)
            const wsData = r2.ok ? await r2.json() : []
            setStats({
                totalEmployees: data.length,
                grossPay:       wsData.reduce((a: number, row: Record<string,number>) => a + (row["Gross Earning"] || 0), 0),
                totalDeduction: wsData.reduce((a: number, row: Record<string,number>) => a + (row["Tot Ded"] || 0), 0),
                netPay:         wsData.reduce((a: number, row: Record<string,number>) => a + (row["Net Pay"] || 0), 0),
            })
            setDataLoaded(true)
            toast.success(`Loaded ${data.length} employees for ${MONTHS[month-1]} ${year}`)
        } catch { toast.error("Failed to load compliance data") }
        finally { setLoading(false) }
    }

    const handleDownload = async (item: ReportItem) => {
        setDlLoading(item.id)
        try {
            const r = await fetch(`/api/payroll/reports/compliance?month=${month}&year=${year}&type=${item.type}`)
            if (!r.ok) { toast.error(await r.text() || "No data found"); return }
            const data = await r.json()
            if (!data?.length) { toast.error("No data to download"); return }

            const wb = XLSX.utils.book_new()

            if (item.type === "wage-sheet") {
                // Group by siteId — use Sr.No reset per sheet
                // Since API returns flat data without siteId, we do a separate call per site
                // Fallback: one sheet with all employees labelled "All Sites"
                const ws = XLSX.utils.json_to_sheet(data)
                const cols = Object.keys(data[0] || {})
                ws["!cols"] = cols.map(k => ({ wch: Math.max(k.length + 2, 14) }))
                // Add header rows for Form II format
                XLSX.utils.sheet_add_aoa(ws, [
                    [`FORM (II) M.W. RULES Rule (27)(1)`],
                    [`SALARIES / WAGES REGISTER FOR THE MONTH OF ${MONTHS[month-1].toUpperCase()} ${year}`],
                    ["PF CODE: PUPUN2450654000", "", "ESIC CODE: 33000891430000999"],
                ], { origin: "A1" })
                XLSX.utils.book_append_sheet(wb, ws, "Wage Sheet")
            } else {
                const ws = XLSX.utils.json_to_sheet(data)
                const cols = Object.keys(data[0] || {})
                ws["!cols"] = cols.map(k => ({ wch: Math.max(k.length + 2, 14) }))
                XLSX.utils.book_append_sheet(wb, ws, item.label.substring(0, 31))
            }

            XLSX.writeFile(wb, `${item.label.replace(/[^a-zA-Z0-9 ]/g, "").replace(/ /g,"_")}_${MONTHS[month-1]}_${year}.xlsx`)
            toast.success(`Downloaded: ${item.label}`)
        } catch { toast.error("Download failed") }
        finally { setDlLoading(null) }
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 32 }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)" }}>
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll")}>Payroll</span>
                <ChevronRight size={11} />
                <span style={{ fontWeight: 600, color: "var(--text2)" }}>Compliance Reports</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ShieldCheck size={20} style={{ color: "var(--accent)" }} />
                    <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>Compliance Reports</h1>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>{lockedEmps.length} employees locked</span>
                    <button onClick={() => router.push(`/payroll/compliance/master?month=${month}&year=${year}`)}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, fontWeight: 700, color: "var(--text2)", cursor: "pointer" }}>
                        <TableProperties size={13} /> Document Master
                    </button>
                </div>
            </div>

            {/* Stepper */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, overflowX: "auto", whiteSpace: "nowrap", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
                {["Upload Attendance","Process Payroll","Wage Sheet","Lock Wage Sheet","Compliance","Payslip"].map((s, i) => (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7,
                            background: i === 4 ? "var(--accent-light)" : "transparent",
                            color: i === 4 ? "var(--accent)" : "var(--text3)", fontSize: 12, fontWeight: i === 4 ? 700 : 400 }}>
                            <div style={{ width: 18, height: 18, borderRadius: 4, background: i === 4 ? "var(--accent)" : "var(--border)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: i === 4 ? "#fff" : "var(--text3)", fontSize: 10, fontWeight: 700 }}>{i+1}</div>
                            {s}
                        </div>
                        {i < 5 && <ChevronRight size={11} style={{ color: "var(--text3)", opacity: 0.3 }} />}
                    </div>
                ))}
            </div>

            {/* Two-panel */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {/* LEFT: Locked Employees */}
                <div style={{ width: 240, flexShrink: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Lock size={12} style={{ color: "var(--accent)" }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)" }}>Locked Employees</span>
                        </div>
                        <button onClick={fetchLockedEmps} style={{ display: "flex", padding: "3px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "none", cursor: "pointer" }}>
                            <RefreshCw size={11} style={{ color: "var(--text3)" }} />
                        </button>
                    </div>

                    {/* Summary badge */}
                    <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Users size={11} style={{ color: "var(--text3)" }} />
                            <span style={{ fontSize: 11, color: "var(--text3)" }}>{MONTHS[month-1]} {year}</span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "2px 8px", borderRadius: 20 }}>
                            {lockedEmps.length} locked
                        </span>
                    </div>

                    <div style={{ overflowY: "auto", maxHeight: 460 }}>
                        {ldLocked ? (
                            <div style={{ padding: 20, textAlign: "center" }}>
                                <Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} />
                            </div>
                        ) : lockedEmps.length === 0 ? (
                            <div style={{ padding: "24px 14px", textAlign: "center" }}>
                                <Lock size={20} style={{ color: "var(--text3)", margin: "0 auto 8px" }} />
                                <p style={{ fontSize: 11, color: "var(--text3)", margin: 0 }}>No locked employees</p>
                                <p style={{ fontSize: 10, color: "var(--text3)", margin: "4px 0 0 0", opacity: 0.7 }}>Lock employees from wage sheet first</p>
                            </div>
                        ) : (
                            lockedEmps.map(emp => (
                                <div key={emp.id} style={{ padding: "9px 14px", borderBottom: "1px solid var(--border)" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                                        <div style={{ minWidth: 0 }}>
                                            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {emp.employee.firstName} {emp.employee.lastName}
                                            </p>
                                            <p style={{ fontSize: 10, color: "var(--text3)", margin: "1px 0 0 0" }}>{emp.employee.employeeId}</p>
                                        </div>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", whiteSpace: "nowrap" }}>
                                            {fmt(emp.netSalary)}
                                        </span>
                                    </div>
                                    {emp.employee.designation && (
                                        <p style={{ fontSize: 9, color: "var(--text3)", margin: "3px 0 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {emp.employee.designation}
                                        </p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {lockedEmps.length > 0 && (
                        <div style={{ padding: "9px 14px", borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                <span style={{ fontSize: 10, color: "var(--text3)" }}>Total Net Pay</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a" }}>
                                    {fmt(lockedEmps.reduce((s, e) => s + e.netSalary, 0))}
                                </span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 10, color: "var(--text3)" }}>Total Gross Pay</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text2)" }}>
                                    {fmt(lockedEmps.reduce((s, e) => s + e.grossSalary, 0))}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT: Compliance downloads */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Controls */}
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={lbl}>Month</span>
                            <select value={month} onChange={e => { setMonth(Number(e.target.value)); setDataLoaded(false); setStats(null) }} style={sel}>
                                {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                            </select>
                            <span style={lbl}>Year</span>
                            <select value={year} onChange={e => { setYear(Number(e.target.value)); setDataLoaded(false); setStats(null) }} style={sel}>
                                {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <button onClick={handleLoad} disabled={loading}
                                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
                                {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                                {loading ? "Loading…" : "Load Data"}
                            </button>
                        </div>

                        {/* Stats row */}
                        {stats && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 12 }}>
                                {[
                                    { label: "Employees",       value: String(stats.totalEmployees), color: "#3b82f6" },
                                    { label: "Gross Pay",       value: fmt(stats.grossPay),           color: "#0369a1" },
                                    { label: "Total Deduction", value: fmt(stats.totalDeduction),     color: "#dc2626" },
                                    { label: "Net Pay",         value: fmt(stats.netPay),             color: "#16a34a" },
                                ].map(s => (
                                    <div key={s.label} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)" }}>
                                        <p style={{ fontSize: 9, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", margin: 0 }}>{s.label}</p>
                                        <p style={{ fontSize: 14, fontWeight: 700, color: s.color, margin: "2px 0 0 0" }}>{s.value}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {!dataLoaded && !loading && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde047", fontSize: 12, color: "#854d0e" }}>
                                <AlertCircle size={13} style={{ flexShrink: 0 }} />
                                Select a period then click &quot;Load Data&quot; to enable downloads.
                            </div>
                        )}
                    </div>

                    {/* Report sections */}
                    {[
                        { title: "Wage Sheet (Form II — MW Rules)", badge: "WS",  items: WAGE_REPORTS,  color: "#0f766e" },
                        { title: "Provident Fund (PF)",             badge: "PF",  items: PF_REPORTS,    color: "#1d4ed8" },
                        { title: "ESIC",                            badge: "ESI", items: ESIC_REPORTS,  color: "#0369a1" },
                        { title: "Professional Tax (PT)",           badge: "PT",  items: PT_REPORTS,    color: "#7c3aed" },
                    ].map(section => (
                        <div key={section.title} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <span style={{ fontSize: 9, fontWeight: 800, color: "var(--accent)" }}>{section.badge}</span>
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{section.title}</span>
                                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "var(--accent-light)", padding: "2px 8px", borderRadius: 20 }}>
                                    {section.items.length} reports
                                </span>
                            </div>
                            <div style={{ padding: "4px 8px" }}>
                                {section.items.map(item => (
                                    <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 8px", borderRadius: 8 }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                        <span style={{ fontSize: 13, color: "var(--text2)" }}>{item.label}</span>
                                        <button onClick={() => handleDownload(item)} disabled={!dataLoaded || dlLoading === item.id}
                                            style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: dataLoaded ? "pointer" : "not-allowed", opacity: !dataLoaded ? 0.4 : 1, color: "var(--text3)", transition: "all 0.15s" }}
                                            onMouseEnter={e => { if (dataLoaded) { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)" } }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text3)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)" }}>
                                            {dlLoading === item.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    <p style={{ fontSize: 11, color: "var(--text3)", textAlign: "center" }}>
                        Reports are generated from all locked (processed) payroll data.
                    </p>
                </div>
            </div>
        </div>
    )
}

export default function CompliancePage() {
    return <Suspense><ComplianceInner /></Suspense>
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap" }
const sel: React.CSSProperties = { padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }
