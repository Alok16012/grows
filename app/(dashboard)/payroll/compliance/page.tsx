"use client"
import { Suspense, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import { toast } from "sonner"
import {
    Loader2, Download, ChevronRight, ShieldCheck,
    FileSpreadsheet, TableProperties, RefreshCw
} from "lucide-react"

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

type ReportItem = { id: string; label: string; shortLabel: string; type: string }
type PayrollRun = { id: string; month: number; year: number; status: string; _count: { payrolls: number } }

const WAGE_ITEMS: ReportItem[] = [
    { id: "wage-sheet", label: "Wage Sheet — Form II (MW Rules)", shortLabel: "Wage Sheet", type: "wage-sheet" },
]
const PF_ITEMS: ReportItem[] = [
    { id: "pf-summary",   label: "PF Summary (Site-wise)",       shortLabel: "PF Summary",  type: "pf-summary"   },
    { id: "pf-deduction", label: "PF Deduction List (Form 12A)", shortLabel: "Form 12A",    type: "pf-deduction" },
    { id: "pf-ecr",       label: "PF ECR File (EPFO)",           shortLabel: "ECR File",    type: "pf-ecr"       },
    { id: "pf-challan",   label: "PF Challan",                   shortLabel: "PF Challan",  type: "pf-challan"   },
    { id: "pf-register",  label: "PF Register (UAN Wise)",       shortLabel: "PF Register", type: "pf-register"  },
]
const ESIC_ITEMS: ReportItem[] = [
    { id: "esic-summary",   label: "ESIC Summary (Site-wise)", shortLabel: "ESIC Summary", type: "esic-summary"   },
    { id: "esic-deduction", label: "ESIC Deduction (Form 7)",  shortLabel: "Form 7",       type: "esic-deduction" },
    { id: "esic-challan",   label: "ESIC Challan",             shortLabel: "ESIC Challan", type: "esic-challan"   },
]
const PT_ITEMS: ReportItem[] = [
    { id: "pt-summary",   label: "PT Summary (Site-wise)", shortLabel: "PT Summary",   type: "pt-summary"   },
    { id: "pt-deduction", label: "PT Deduction Report",    shortLabel: "PT Deduction", type: "pt-deduction" },
    { id: "pt-challan",   label: "PT Challan (MTR-6)",     shortLabel: "MTR-6",        type: "pt-challan"   },
]

// Section groupings for hierarchical Excel headers
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

function buildHierarchicalSheet(
    data: Record<string, string | number>[],
    reportType: string,
    title: string,
    m: number, y: number
) {
    const cols = Object.keys(data[0] || {})
    const nCols = cols.length
    const sections: SectionMap = REPORT_SECTIONS[reportType] ? [...REPORT_SECTIONS[reportType]] : [["Data", nCols]]

    const totalSpan = sections.reduce((s, [, n]) => s + n, 0)
    if (totalSpan < nCols) sections.push(["", nCols - totalSpan])

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

    const merges: XLSX.Range[] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: nCols - 1 } },
    ]
    let cursor = 0
    for (const [, span] of sections) {
        if (span > 1) merges.push({ s: { r: 2, c: cursor }, e: { r: 2, c: cursor + span - 1 } })
        cursor += span
    }
    ws["!merges"] = merges
    ws["!cols"] = cols.map(k => {
        const maxLen = Math.max(k.length, ...data.map(r => String(r[k] ?? "").length))
        return { wch: Math.min(Math.max(maxLen + 2, 12), 30) }
    })
    ws["!rows"] = [{ hpt: 24 }, { hpt: 16 }, { hpt: 20 }, { hpt: 22 }]
    return ws
}

// Column config
const COLS = [
    { key: "wage", title: "Wage Sheet",       color: "#0f766e", bg: "#f0fdfa", border: "#99f6e4", items: WAGE_ITEMS },
    { key: "pf",   title: "Provident Fund",   color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe", items: PF_ITEMS   },
    { key: "esic", title: "ESIC",             color: "#0369a1", bg: "#f0f9ff", border: "#bae6fd", items: ESIC_ITEMS },
    { key: "pt",   title: "Professional Tax", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", items: PT_ITEMS   },
]

function ComplianceInner() {
    const router = useRouter()
    const [runs,      setRuns]      = useState<PayrollRun[]>([])
    const [loading,   setLoading]   = useState(true)
    const [dlLoading, setDlLoading] = useState<string | null>(null)

    const fetchRuns = async () => {
        setLoading(true)
        try {
            const r = await fetch("/api/payroll/runs")
            if (!r.ok) throw new Error("Failed")
            const data: PayrollRun[] = await r.json()
            setRuns(data)
        } catch {
            toast.error("Failed to load payroll months")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchRuns() }, [])

    const handleDownload = async (item: ReportItem, month: number, year: number) => {
        const key = `${item.id}-${month}-${year}`
        setDlLoading(key)
        try {
            const r = await fetch(`/api/payroll/reports/compliance?month=${month}&year=${year}&type=${item.type}`)
            if (!r.ok) { toast.error("No data found for this period"); return }
            const data = await r.json()
            if (!data?.length) { toast.error("No data to download"); return }

            const wb = XLSX.utils.book_new()
            if (item.type === "wage-sheet") {
                const ws = XLSX.utils.json_to_sheet(data)
                const cols = Object.keys(data[0] || {})
                ws["!cols"] = cols.map((k: string) => ({ wch: Math.max(k.length + 2, 14) }))
                XLSX.utils.sheet_add_aoa(ws, [
                    [`FORM (II) M.W. RULES Rule (27)(1)`],
                    [`SALARIES / WAGES REGISTER FOR THE MONTH OF ${MONTHS[month-1].toUpperCase()} ${year}`],
                    ["PF CODE: PUPUN2450654000", "", "ESIC CODE: 33000891430000999"],
                ], { origin: "A1" })
                XLSX.utils.book_append_sheet(wb, ws, "Wage Sheet")
            } else {
                const ws = buildHierarchicalSheet(data, item.type, item.label, month, year)
                XLSX.utils.book_append_sheet(wb, ws, item.label.substring(0, 31))
            }
            XLSX.writeFile(wb, `${item.label.replace(/[^a-zA-Z0-9 ]/g, "").replace(/ /g,"_")}_${MONTHS[month-1]}_${year}.xlsx`)
            toast.success(`Downloaded: ${item.label}`)
        } catch {
            toast.error("Download failed")
        } finally {
            setDlLoading(null)
        }
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 40 }}>

            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)" }}>
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll")}>Payroll</span>
                <ChevronRight size={11} />
                <span style={{ fontWeight: 600, color: "var(--text2)" }}>Compliance</span>
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ShieldCheck size={20} style={{ color: "var(--accent)" }} />
                    <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>Compliance Reports</h1>
                    {!loading && (
                        <span style={{ fontSize: 11, color: "var(--text3)", background: "var(--surface2)", border: "1px solid var(--border)", padding: "3px 10px", borderRadius: 20 }}>
                            {runs.length} month{runs.length !== 1 ? "s" : ""}
                        </span>
                    )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={fetchRuns} disabled={loading}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, fontWeight: 600, color: "var(--text2)", cursor: "pointer" }}>
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                    <button
                        onClick={() => router.push("/payroll/compliance/master")}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, fontWeight: 700, color: "var(--text2)", cursor: "pointer" }}>
                        <TableProperties size={13} /> Document Master
                    </button>
                </div>
            </div>

            {/* Table */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 2fr 1.5fr 1.5fr", borderBottom: "2px solid var(--border)", background: "var(--surface2)" }}>
                    <div style={thStyle}>Month</div>
                    {COLS.map(col => (
                        <div key={col.key} style={{ ...thStyle, color: col.color, borderLeft: "1px solid var(--border)" }}>
                            <FileSpreadsheet size={13} style={{ flexShrink: 0 }} />
                            {col.title}
                        </div>
                    ))}
                </div>

                {/* Rows */}
                {loading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "48px 0", color: "var(--text3)" }}>
                        <Loader2 size={18} className="animate-spin" />
                        <span style={{ fontSize: 13 }}>Loading payroll months…</span>
                    </div>
                ) : runs.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text3)", fontSize: 13 }}>
                        No payroll runs found. Process payroll first to see compliance reports here.
                    </div>
                ) : (
                    runs.map((run, idx) => (
                        <div key={run.id}
                            style={{
                                display: "grid",
                                gridTemplateColumns: "160px 1fr 2fr 1.5fr 1.5fr",
                                borderBottom: idx < runs.length - 1 ? "1px solid var(--border)" : "none",
                                background: idx % 2 === 0 ? "var(--surface)" : "var(--surface2)",
                                alignItems: "stretch",
                            }}>

                            {/* Month label */}
                            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>
                                    {MONTHS[run.month - 1]}
                                </span>
                                <span style={{ fontSize: 11, color: "var(--text3)" }}>{run.year}</span>
                                <span style={{ fontSize: 10, color: run.status === "COMPLETED" ? "#16a34a" : "#d97706", fontWeight: 600, marginTop: 2 }}>
                                    {run._count.payrolls} emp
                                </span>
                            </div>

                            {/* Wage Sheet */}
                            <PillCell items={WAGE_ITEMS} run={run} color="#0f766e" dlLoading={dlLoading} onDownload={handleDownload} />

                            {/* PF */}
                            <PillCell items={PF_ITEMS} run={run} color="#1d4ed8" dlLoading={dlLoading} onDownload={handleDownload} />

                            {/* ESIC */}
                            <PillCell items={ESIC_ITEMS} run={run} color="#0369a1" dlLoading={dlLoading} onDownload={handleDownload} />

                            {/* PT */}
                            <PillCell items={PT_ITEMS} run={run} color="#7c3aed" dlLoading={dlLoading} onDownload={handleDownload} />
                        </div>
                    ))
                )}
            </div>

            {!loading && runs.length > 0 && (
                <p style={{ fontSize: 11, color: "var(--text3)", textAlign: "center" }}>
                    Click any pill to instantly download that report. Latest month shown first.
                </p>
            )}
        </div>
    )
}

function PillCell({
    items, run, color, dlLoading, onDownload
}: {
    items: ReportItem[]
    run: PayrollRun
    color: string
    dlLoading: string | null
    onDownload: (item: ReportItem, month: number, year: number) => void
}) {
    return (
        <div style={{
            padding: "10px 12px",
            borderLeft: "1px solid var(--border)",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            alignContent: "center",
            alignItems: "center",
        }}>
            {items.map(item => {
                const key = `${item.id}-${run.month}-${run.year}`
                const isLoading = dlLoading === key
                return (
                    <button
                        key={item.id}
                        onClick={() => onDownload(item, run.month, run.year)}
                        disabled={isLoading}
                        title={item.label}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "4px 10px",
                            borderRadius: 20,
                            border: `1px solid ${color}22`,
                            background: `${color}11`,
                            color: color,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: isLoading ? "not-allowed" : "pointer",
                            opacity: isLoading ? 0.6 : 1,
                            whiteSpace: "nowrap",
                            transition: "all 0.15s",
                        }}
                        onMouseEnter={e => {
                            if (!isLoading) {
                                ;(e.currentTarget as HTMLButtonElement).style.background = `${color}22`
                                ;(e.currentTarget as HTMLButtonElement).style.borderColor = `${color}55`
                            }
                        }}
                        onMouseLeave={e => {
                            ;(e.currentTarget as HTMLButtonElement).style.background = `${color}11`
                            ;(e.currentTarget as HTMLButtonElement).style.borderColor = `${color}22`
                        }}
                    >
                        {isLoading
                            ? <Loader2 size={10} className="animate-spin" />
                            : <Download size={10} />}
                        {item.shortLabel}
                    </button>
                )
            })}
        </div>
    )
}

export default function CompliancePage() {
    return <Suspense><ComplianceInner /></Suspense>
}

const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text3)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    display: "flex",
    alignItems: "center",
    gap: 6,
}
