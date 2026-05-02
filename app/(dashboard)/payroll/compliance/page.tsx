"use client"
import { Suspense, useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import * as XLSX from "xlsx"
import { toast } from "sonner"
import {
    Loader2, Download, RefreshCw, ChevronRight, ShieldCheck,
    Users, Lock, TableProperties, FileSpreadsheet, Search
} from "lucide-react"

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")

type StatsData  = { totalEmployees: number; grossPay: number; totalDeduction: number; netPay: number }
type ReportItem = { id: string; label: string; shortLabel: string; type: string }
type LockedEmp  = { id: string; netSalary: number; grossSalary: number; siteId: string | null; employee: { employeeId: string; firstName: string; lastName: string; designation: string | null } }

const SECTIONS: { key: string; title: string; shortTitle: string; badge: string; color: string; bg: string; border: string; items: ReportItem[] }[] = [
    {
        key: "wage",
        title: "Wage Sheet",
        shortTitle: "WAGE",
        badge: "WS",
        color: "#0f766e",
        bg: "#f0fdfa",
        border: "#99f6e4",
        items: [
            { id: "wage-sheet", label: "Wage Sheet — Form II (MW Rules)", shortLabel: "Wage Sheet", type: "wage-sheet" },
        ],
    },
    {
        key: "pf",
        title: "Provident Fund",
        shortTitle: "PF",
        badge: "PF",
        color: "#1d4ed8",
        bg: "#eff6ff",
        border: "#bfdbfe",
        items: [
            { id: "pf-summary",   label: "PF Summary (Site-wise)",         shortLabel: "PF Summary (Site)",    type: "pf-summary"   },
            { id: "pf-deduction", label: "PF Deduction List (Form 12A)",   shortLabel: "Form 12A",             type: "pf-deduction" },
            { id: "pf-ecr",       label: "PF ECR File (EPFO)",             shortLabel: "ECR File (EPFO)",      type: "pf-ecr"       },
            { id: "pf-challan",   label: "PF Challan",                     shortLabel: "PF Challan",           type: "pf-challan"   },
            { id: "pf-register",  label: "PF Register (UAN Wise)",         shortLabel: "PF Register (UAN)",    type: "pf-register"  },
        ],
    },
    {
        key: "esic",
        title: "ESIC",
        shortTitle: "ESIC",
        badge: "ESI",
        color: "#0369a1",
        bg: "#f0f9ff",
        border: "#bae6fd",
        items: [
            { id: "esic-summary",   label: "ESIC Summary (Site-wise)",    shortLabel: "ESIC Summary",       type: "esic-summary"   },
            { id: "esic-deduction", label: "ESIC Deduction (Form 7)",     shortLabel: "Form 7",             type: "esic-deduction" },
            { id: "esic-challan",   label: "ESIC Challan",                shortLabel: "ESIC Challan",       type: "esic-challan"   },
        ],
    },
    {
        key: "pt",
        title: "Professional Tax",
        shortTitle: "PT",
        badge: "PT",
        color: "#7c3aed",
        bg: "#f5f3ff",
        border: "#ddd6fe",
        items: [
            { id: "pt-summary",   label: "PT Summary (Site-wise)",  shortLabel: "PT Summary",   type: "pt-summary"   },
            { id: "pt-deduction", label: "PT Deduction Report",     shortLabel: "PT Deduction", type: "pt-deduction" },
            { id: "pt-challan",   label: "PT Challan (MTR-6)",      shortLabel: "MTR-6",        type: "pt-challan"   },
        ],
    },
]

function ComplianceInner() {
    const router  = useRouter()
    const params  = useSearchParams()
    const [month,      setMonth]      = useState(Number(params.get("month")) || new Date().getMonth() + 1)
    const [year,       setYear]       = useState(Number(params.get("year"))  || new Date().getFullYear())
    const [empSearch,  setEmpSearch]  = useState("")
    const [stats,      setStats]      = useState<StatsData | null>(null)
    const [loading,    setLoading]    = useState(false)
    const [dataLoaded, setDataLoaded] = useState(false)
    const [dlLoading,  setDlLoading]  = useState<string | null>(null)
    const [lockedEmps, setLockedEmps] = useState<LockedEmp[]>([])
    const [ldLocked,   setLdLocked]   = useState(false)

    const filteredEmps = empSearch.trim()
        ? lockedEmps.filter(e =>
            `${e.employee.firstName} ${e.employee.lastName}`.toLowerCase().includes(empSearch.toLowerCase()) ||
            e.employee.employeeId.toLowerCase().includes(empSearch.toLowerCase())
          )
        : lockedEmps

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
            const r  = await fetch(`/api/payroll/reports/compliance?month=${month}&year=${year}&type=pf-deduction`)
            if (!r.ok) { toast.error("No payroll data found for this period"); return }
            const data = await r.json()
            const r2   = await fetch(`/api/payroll/reports/compliance?month=${month}&year=${year}&type=wage-sheet`)
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
            if (!r.ok) { toast.error("No data found"); return }
            const data = await r.json()
            if (!data?.length) { toast.error("No data to download"); return }

            const wb = XLSX.utils.book_new()
            if (item.type === "wage-sheet") {
                const ws = XLSX.utils.json_to_sheet(data)
                const cols = Object.keys(data[0] || {})
                ws["!cols"] = cols.map(k => ({ wch: Math.max(k.length + 2, 14) }))
                XLSX.utils.sheet_add_aoa(ws, [
                    [`FORM (II) M.W. RULES Rule (27)(1)`],
                    [`SALARIES / WAGES REGISTER FOR THE MONTH OF ${MONTHS[month-1].toUpperCase()} ${year}`],
                    ["PF CODE: PUPUN2450654000", "", "ESIC CODE: 33000891430000999"],
                ], { origin: "A1" })
                XLSX.utils.book_append_sheet(wb, ws, "Wage Sheet")
            } else {
                const ws = XLSX.utils.json_to_sheet(data)
                ws["!cols"] = Object.keys(data[0] || {}).map(k => ({ wch: Math.max(k.length + 2, 14) }))
                XLSX.utils.book_append_sheet(wb, ws, item.label.substring(0, 31))
            }
            XLSX.writeFile(wb, `${item.label.replace(/[^a-zA-Z0-9 ]/g, "").replace(/ /g,"_")}_${MONTHS[month-1]}_${year}.xlsx`)
            toast.success(`Downloaded: ${item.label}`)
        } catch { toast.error("Download failed") }
        finally { setDlLoading(null) }
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 40 }}>

            {/* ── Breadcrumb ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)" }}>
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll")}>Payroll</span>
                <ChevronRight size={11} />
                <span style={{ fontWeight: 600, color: "var(--text2)" }}>Compliance</span>
            </div>

            {/* ── Top Header Bar ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ShieldCheck size={20} style={{ color: "var(--accent)" }} />
                    <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>Compliance Reports</h1>
                </div>
                <button
                    onClick={() => router.push(`/payroll/compliance/master?month=${month}&year=${year}`)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, fontWeight: 700, color: "var(--text2)", cursor: "pointer" }}>
                    <TableProperties size={13} /> Document Master
                </button>
            </div>

            {/* ── Controls + Stats Row ── */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={lbl}>Month</span>
                        <select value={month} onChange={e => { setMonth(Number(e.target.value)); setDataLoaded(false); setStats(null) }} style={sel}>
                            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                        </select>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={lbl}>Year</span>
                        <select value={year} onChange={e => { setYear(Number(e.target.value)); setDataLoaded(false); setStats(null) }} style={sel}>
                            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <button onClick={handleLoad} disabled={loading}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
                        {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                        {loading ? "Loading…" : "Load Data"}
                    </button>
                    {dataLoaded && (
                        <span style={{ fontSize: 11, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "4px 10px", borderRadius: 20, fontWeight: 700 }}>
                            ✓ Data loaded for {MONTHS[month-1]} {year}
                        </span>
                    )}
                </div>

                {stats && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 14 }}>
                        {[
                            { label: "Employees",       value: String(stats.totalEmployees), color: "#3b82f6" },
                            { label: "Gross Pay",        value: fmt(stats.grossPay),           color: "#0369a1" },
                            { label: "Total Deductions", value: fmt(stats.totalDeduction),     color: "#dc2626" },
                            { label: "Net Pay",          value: fmt(stats.netPay),             color: "#16a34a" },
                        ].map(s => (
                            <div key={s.label} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)" }}>
                                <p style={{ fontSize: 9, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>{s.label}</p>
                                <p style={{ fontSize: 16, fontWeight: 800, color: s.color, margin: "3px 0 0 0" }}>{s.value}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Main Body: Locked Employees + 4 Section Cards ── */}
            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>

                {/* LEFT: EMP ID panel */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", background: "#f8faff" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Lock size={12} style={{ color: "var(--accent)" }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>EMP ID</span>
                            </div>
                            <button onClick={fetchLockedEmps} style={{ display: "flex", padding: "3px", borderRadius: 5, border: "none", background: "none", cursor: "pointer" }}>
                                <RefreshCw size={11} style={{ color: "var(--text3)" }} />
                            </button>
                        </div>
                        {/* Search */}
                        <div style={{ position: "relative" }}>
                            <Search size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }} />
                            <input
                                value={empSearch}
                                onChange={e => setEmpSearch(e.target.value)}
                                placeholder="Search emp…"
                                style={{ width: "100%", padding: "5px 8px 5px 24px", fontSize: 11, border: "1px solid var(--border)", borderRadius: 6, outline: "none", background: "#fff", color: "var(--text)", boxSizing: "border-box" }}
                            />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                            <span style={{ fontSize: 10, color: "var(--text3)" }}>{MONTHS[month-1]} {year}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "2px 7px", borderRadius: 20 }}>
                                {lockedEmps.length} locked
                            </span>
                        </div>
                    </div>

                    <div style={{ overflowY: "auto", maxHeight: 480 }}>
                        {ldLocked ? (
                            <div style={{ padding: 20, textAlign: "center" }}>
                                <Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} />
                            </div>
                        ) : filteredEmps.length === 0 ? (
                            <div style={{ padding: "20px 14px", textAlign: "center" }}>
                                <Users size={18} style={{ color: "var(--text3)", margin: "0 auto 6px" }} />
                                <p style={{ fontSize: 11, color: "var(--text3)", margin: 0 }}>
                                    {empSearch ? "No match found" : "No locked employees"}
                                </p>
                            </div>
                        ) : (
                            filteredEmps.map(emp => (
                                <div key={emp.id} style={{ padding: "9px 14px", borderBottom: "1px solid var(--border)" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                                        <div style={{ minWidth: 0 }}>
                                            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {emp.employee.firstName} {emp.employee.lastName}
                                            </p>
                                            <p style={{ fontSize: 10, color: "var(--accent)", margin: "1px 0 0 0", fontWeight: 600 }}>{emp.employee.employeeId}</p>
                                        </div>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", whiteSpace: "nowrap", flexShrink: 0 }}>
                                            {fmt(emp.netSalary)}
                                        </span>
                                    </div>
                                    {emp.employee.designation && (
                                        <p style={{ fontSize: 9, color: "var(--text3)", margin: "2px 0 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {emp.employee.designation}
                                        </p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {lockedEmps.length > 0 && (
                        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                <span style={{ fontSize: 10, color: "var(--text3)" }}>Net Pay</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a" }}>{fmt(lockedEmps.reduce((s, e) => s + e.netSalary, 0))}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 10, color: "var(--text3)" }}>Gross Pay</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text2)" }}>{fmt(lockedEmps.reduce((s, e) => s + e.grossSalary, 0))}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT: 4 section cards in 2x2 grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {SECTIONS.map(section => (
                        <div key={section.key}
                            style={{ background: "var(--surface)", border: `1.5px solid ${dataLoaded ? section.border : "var(--border)"}`, borderRadius: 14, overflow: "hidden", transition: "border-color 0.2s" }}>

                            {/* Section Header */}
                            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${section.border}`, background: dataLoaded ? section.bg : "var(--surface2)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{
                                        width: 36, height: 36, borderRadius: 10,
                                        background: dataLoaded ? section.color : "var(--border)",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        transition: "background 0.2s",
                                    }}>
                                        <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", letterSpacing: "0.3px" }}>{section.badge}</span>
                                    </div>
                                    <div>
                                        <p style={{ fontSize: 14, fontWeight: 800, color: dataLoaded ? section.color : "var(--text3)", margin: 0 }}>{section.shortTitle}</p>
                                        <p style={{ fontSize: 10, color: "var(--text3)", margin: 0 }}>{section.items.length} reports</p>
                                    </div>
                                </div>
                                <p style={{ fontSize: 11, color: dataLoaded ? section.color : "var(--text3)", fontWeight: 600, margin: "6px 0 0 0", opacity: 0.8 }}>{section.title}</p>
                            </div>

                            {/* Report Items */}
                            <div style={{ padding: "6px 0" }}>
                                {section.items.map((item, idx) => (
                                    <div key={item.id}
                                        style={{
                                            display: "flex", alignItems: "center", justifyContent: "space-between",
                                            padding: "9px 16px", gap: 8,
                                            borderBottom: idx < section.items.length - 1 ? "1px solid var(--border)" : "none",
                                        }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                            <div style={{
                                                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                                                background: dataLoaded ? section.color : "var(--border)",
                                            }} />
                                            <div style={{ minWidth: 0 }}>
                                                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {item.shortLabel}
                                                </p>
                                                <p style={{ fontSize: 10, color: "var(--text3)", margin: "1px 0 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {item.label}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDownload(item)}
                                            disabled={!dataLoaded || dlLoading === item.id}
                                            title={dataLoaded ? `Download ${item.label}` : "Load data first"}
                                            style={{
                                                width: 32, height: 32, borderRadius: 8, border: "none", flexShrink: 0,
                                                background: dataLoaded ? section.color : "var(--border)",
                                                color: "#fff",
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                cursor: dataLoaded ? "pointer" : "not-allowed",
                                                opacity: !dataLoaded ? 0.45 : 1,
                                                transition: "all 0.15s",
                                            }}
                                            onMouseEnter={e => { if (dataLoaded) (e.currentTarget as HTMLButtonElement).style.opacity = "0.8" }}
                                            onMouseLeave={e => { if (dataLoaded) (e.currentTarget as HTMLButtonElement).style.opacity = "1" }}
                                        >
                                            {dlLoading === item.id
                                                ? <Loader2 size={13} className="animate-spin" />
                                                : <Download size={13} />
                                            }
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Footer note ── */}
            <p style={{ fontSize: 11, color: "var(--text3)", textAlign: "center" }}>
                Reports are generated from locked (processed) payroll data. Click &quot;Load Data&quot; to enable downloads.
            </p>
        </div>
    )
}

export default function CompliancePage() {
    return <Suspense><ComplianceInner /></Suspense>
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap" }
const sel: React.CSSProperties = { padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }
