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

    // ─── Section groupings for each report type ──────────────────────────────
    // Each entry: [Section Label, Number of columns it spans]
    type SectionMap = [string, number][]
    const REPORT_SECTIONS: Record<string, SectionMap> = {
        "pf-summary":    [["Site Info", 3], ["EPF / EPS / EDLI Wages", 3], ["Contribution Rates", 6], ["Total", 1], ["Exempted", 2]],
        "pf-deduction":  [["Employee Info", 4], ["Wages", 2], ["Contributions", 3], ["Period", 2]],
        "pf-ecr":        [["Employee Info", 2], ["Wages", 3], ["Contributions", 3], ["Other", 2]],
        "pf-challan":    [["Employee Info", 4], ["Wages", 2], ["Contributions", 3], ["Other", 3]],
        "pf-register":   [["Employee Info", 6], ["Wages", 2], ["Contributions", 3], ["Attendance", 2]],
        "esic-summary":  [["Site Info", 3], ["Wages", 1], ["Contributions", 3], ["Exempted", 2]],
        "esic-deduction":[["Employee Info", 4], ["Wages", 2], ["Contributions", 2]],
        "esic-challan":  [["Employee Info", 4], ["Wages", 1], ["Contributions", 3], ["Attendance", 2]],
        "pt-summary":    [["Site Info", 2], ["Slab-wise Count", 3], ["Total", 2]],
        "pt-deduction":  [["Employee Info", 3], ["Wages", 1], ["Contribution", 1], ["Period", 2]],
        "pt-challan":    [["Employee Info", 3], ["Period", 1], ["Wages", 1], ["Contribution", 1], ["Attendance", 2]],
    }

    /**
     * Build an XLSX worksheet with hierarchical headers:
     *   Row 1: Title (merged across all columns) — "Month Year" + report title
     *   Row 2: Section group labels (merged per section)
     *   Row 3: Column headers
     *   Row 4+: Data rows
     */
    const buildHierarchicalSheet = (
        data: Record<string, string | number>[],
        reportType: string,
        title: string,
        m: number, y: number
    ) => {
        const cols = Object.keys(data[0] || {})
        const nCols = cols.length
        const sections = REPORT_SECTIONS[reportType] ?? [["Data", nCols]]

        // Pad sections if total < nCols
        const totalSpan = sections.reduce((s, [, n]) => s + n, 0)
        if (totalSpan < nCols) sections.push(["", nCols - totalSpan])

        // ── Build aoa ──────────────────────────────────────────────────────────
        const titleRow:    (string | number)[] = [`${title} — ${MONTHS[m-1].toUpperCase()} ${y}`]
        const subTitleRow: (string | number)[] = [`Generated: ${new Date().toLocaleDateString("en-IN")}  |  PF: PUPUN2450654000  |  ESIC: 33000891430000999`]
        const sectionRow:  (string | number)[] = []
        for (const [label, span] of sections) {
            sectionRow.push(label)
            for (let i = 1; i < span; i++) sectionRow.push("")
        }
        const headerRow = cols
        const dataRows  = data.map(r => cols.map(c => r[c] ?? ""))

        const aoa: (string | number)[][] = [titleRow, subTitleRow, sectionRow, headerRow, ...dataRows]
        const ws = XLSX.utils.aoa_to_sheet(aoa)

        // ── Merges: title row + subtitle row + section row ────────────────────
        const merges: XLSX.Range[] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } },  // Title row
            { s: { r: 1, c: 0 }, e: { r: 1, c: nCols - 1 } },  // Subtitle row
        ]
        // Section row merges
        let cursor = 0
        for (const [, span] of sections) {
            if (span > 1) merges.push({ s: { r: 2, c: cursor }, e: { r: 2, c: cursor + span - 1 } })
            cursor += span
        }
        ws["!merges"] = merges

        // Column widths — compute from content
        ws["!cols"] = cols.map(k => {
            const maxLen = Math.max(k.length, ...data.map(r => String(r[k] ?? "").length))
            return { wch: Math.min(Math.max(maxLen + 2, 12), 30) }
        })

        // Row heights
        ws["!rows"] = [{ hpt: 24 }, { hpt: 16 }, { hpt: 20 }, { hpt: 22 }]

        return ws
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
                // Wage sheet has its own hierarchical format (Form II)
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
                // All other reports use new hierarchical 3-tier header (Title → Section → Column)
                const ws = buildHierarchicalSheet(data, item.type, item.label, month, year)
                XLSX.utils.book_append_sheet(wb, ws, item.label.substring(0, 31))
            }
            XLSX.writeFile(wb, `${item.label.replace(/[^a-zA-Z0-9 ]/g, "").replace(/ /g,"_")}_${MONTHS[month-1]}_${year}.xlsx`)
            toast.success(`Downloaded: ${item.label}`)
        } catch { toast.error("Download failed") }
        finally { setDlLoading(null) }
    }

    // ─── Master Combined Compliance Report ──────────────────────────────────
    // One Excel file with PF + ESIC + PT all in one hierarchical sheet
    const handleDownloadMaster = async () => {
        setDlLoading("master")
        try {
            const [pfR, esicR, ptR] = await Promise.all([
                fetch(`/api/payroll/reports/compliance?month=${month}&year=${year}&type=pf-deduction`),
                fetch(`/api/payroll/reports/compliance?month=${month}&year=${year}&type=esic-deduction`),
                fetch(`/api/payroll/reports/compliance?month=${month}&year=${year}&type=pt-deduction`),
            ])
            if (!pfR.ok && !esicR.ok && !ptR.ok) { toast.error("No data found"); return }
            const pf   = pfR.ok   ? await pfR.json()   : []
            const esic = esicR.ok ? await esicR.json() : []
            const pt   = ptR.ok   ? await ptR.json()   : []

            // Merge by Emp ID into one row per employee
            const empMap = new Map<string, Record<string, string | number>>()
            for (const r of pf) {
                empMap.set(r["Emp ID"], {
                    "Emp ID":           r["Emp ID"],
                    "Employee Name":    r["Employee Name"],
                    "UAN":              r["UAN"] ?? "",
                    "PF Number":        r["PF Number"] ?? "",
                    "PF Wages":         r["PF Wages"] ?? 0,
                    "PF Employee 12%":  r["PF Employee (12%)"] ?? 0,
                    "PF Employer 13%":  r["PF Employer (13%)"] ?? 0,
                    "Total PF":         r["Total PF"] ?? 0,
                    "ESI Number":       "",
                    "ESI Wages":        0,
                    "ESI Employee":     0,
                    "ESI Employer":     0,
                    "Total ESI":        0,
                    "PT State":         "",
                    "PT Gross":         0,
                    "PT Deducted":      0,
                    "Grand Total":      r["Total PF"] ?? 0,
                })
            }
            for (const r of esic) {
                const id = r["Employee Code"]
                const row: Record<string, string | number> = empMap.get(id) ?? { "Emp ID": id, "Employee Name": r["Employee Name"] }
                row["ESI Number"]   = r["ESI Number"] ?? ""
                row["ESI Wages"]    = r["Gross"] ?? 0
                row["ESI Employee"] = r["ESI Employee"] ?? 0
                row["ESI Employer"] = r["ESI Employer"] ?? 0
                row["Total ESI"]    = (Number(row["ESI Employee"]) || 0) + (Number(row["ESI Employer"]) || 0)
                row["Grand Total"]  = (Number(row["Grand Total"]) || 0) + (Number(row["Total ESI"]) || 0)
                empMap.set(id, row)
            }
            for (const r of pt) {
                const id = r["Emp ID"]
                const row: Record<string, string | number> = empMap.get(id) ?? { "Emp ID": id, "Employee Name": r["Employee Name"] }
                row["PT State"]    = r["State"] ?? ""
                row["PT Gross"]    = r["Gross Salary"] ?? 0
                row["PT Deducted"] = r["PT Deducted"] ?? 0
                row["Grand Total"] = (Number(row["Grand Total"]) || 0) + (Number(row["PT Deducted"]) || 0)
                empMap.set(id, row)
            }

            const data = [...empMap.values()]
            if (!data.length) { toast.error("No payroll data for this period"); return }

            // Build hierarchical sheet: Sr | EmpInfo (3) | PF (5) | ESIC (4) | PT (3) | Grand Total
            const cols = [
                "Sr.No", "Emp ID", "Employee Name",
                "UAN", "PF Number", "PF Wages", "PF Employee 12%", "PF Employer 13%", "Total PF",
                "ESI Number", "ESI Wages", "ESI Employee", "ESI Employer", "Total ESI",
                "PT State", "PT Gross", "PT Deducted",
                "Grand Total",
            ]
            const sectionRow = [
                "Identification", "", "",
                "PF / EPF Contribution", "", "", "", "", "",
                "ESIC Contribution", "", "", "", "",
                "Professional Tax", "", "",
                "Total",
            ]
            const titleRow = [`MASTER COMPLIANCE REPORT — ${MONTHS[month-1].toUpperCase()} ${year}`]
            const subRow   = [`Generated: ${new Date().toLocaleDateString("en-IN")}  |  PF: PUPUN2450654000  |  ESIC: 33000891430000999`]
            const dataRows = data.map((r, i) => [
                i + 1,
                r["Emp ID"], r["Employee Name"],
                r["UAN"], r["PF Number"], r["PF Wages"], r["PF Employee 12%"], r["PF Employer 13%"], r["Total PF"],
                r["ESI Number"], r["ESI Wages"], r["ESI Employee"], r["ESI Employer"], r["Total ESI"],
                r["PT State"], r["PT Gross"], r["PT Deducted"],
                r["Grand Total"],
            ])
            // Grand total row
            const sum = (key: string) => data.reduce((s, r) => s + (Number(r[key]) || 0), 0)
            const totalRow = [
                "", "", "TOTAL",
                "", "", sum("PF Wages"), sum("PF Employee 12%"), sum("PF Employer 13%"), sum("Total PF"),
                "", sum("ESI Wages"), sum("ESI Employee"), sum("ESI Employer"), sum("Total ESI"),
                "", sum("PT Gross"), sum("PT Deducted"),
                sum("Grand Total"),
            ]

            const aoa = [titleRow, subRow, sectionRow, cols, ...dataRows, totalRow]
            const ws  = XLSX.utils.aoa_to_sheet(aoa)
            const n   = cols.length
            ws["!merges"] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: n - 1 } },   // Title
                { s: { r: 1, c: 0 }, e: { r: 1, c: n - 1 } },   // Subtitle
                { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },       // Identification
                { s: { r: 2, c: 3 }, e: { r: 2, c: 8 } },       // PF
                { s: { r: 2, c: 9 }, e: { r: 2, c: 13 } },      // ESIC
                { s: { r: 2, c: 14}, e: { r: 2, c: 16 } },      // PT
            ]
            ws["!cols"] = [
                { wch: 5 },                                        // Sr
                { wch: 11 }, { wch: 22 },                          // Emp Info
                { wch: 14 }, { wch: 13 }, { wch: 11 }, { wch: 13 }, { wch: 13 }, { wch: 11 },  // PF
                { wch: 14 }, { wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 11 },               // ESIC
                { wch: 9 },  { wch: 11 }, { wch: 12 },                                          // PT
                { wch: 13 },                                                                     // Grand Total
            ]
            ws["!rows"] = [{ hpt: 24 }, { hpt: 16 }, { hpt: 20 }, { hpt: 22 }]
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "Master Compliance")
            XLSX.writeFile(wb, `Master_Compliance_${MONTHS[month-1]}_${year}.xlsx`)
            toast.success(`Master compliance report downloaded — ${data.length} employees`)
        } catch (e) {
            console.error(e)
            toast.error("Master download failed")
        } finally { setDlLoading(null) }
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
                    <button onClick={handleDownloadMaster} disabled={!dataLoaded || dlLoading === "master"}
                        title="Download all PF + ESIC + PT data in one hierarchical Excel sheet"
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none",
                                 background: dataLoaded ? "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" : "var(--border)",
                                 color: "#fff", fontSize: 12, fontWeight: 700, cursor: dataLoaded ? "pointer" : "not-allowed",
                                 opacity: (!dataLoaded || dlLoading === "master") ? 0.6 : 1, marginLeft: "auto" }}>
                        {dlLoading === "master" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                        {dlLoading === "master" ? "Generating…" : "📊 Master Compliance Report"}
                    </button>
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
