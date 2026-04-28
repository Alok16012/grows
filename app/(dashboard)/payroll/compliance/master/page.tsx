"use client"
import { Suspense, useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import * as XLSX from "xlsx"
import { toast } from "sonner"
import { Loader2, Download, Printer, RefreshCw, ChevronRight, ShieldCheck, FileSpreadsheet } from "lucide-react"
import { printHTML } from "@/lib/print-html"

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const fmtN = (n: number | null | undefined) => n == null ? "" : Math.round(n).toLocaleString("en-IN")
const fmtC = (n: number | null | undefined) => n == null ? "—" : "₹" + Math.round(n).toLocaleString("en-IN")

type Row = {
    id: string
    employeeId: string
    firstName: string
    lastName: string
    designation: string | null
    uan: string | null
    pfNumber: string | null
    esiNumber: string | null
    presentDays: number
    workingDays: number
    basicSalary: number
    da: number
    hra: number
    conveyance: number
    washing: number
    lwwEarned: number
    bonus: number
    overtimePay: number
    grossSalary: number
    pfEmployee: number
    pfEmployer: number
    esiEmployee: number
    esiEmployer: number
    pt: number
    lwf: number
    canteen: number
    penalty: number
    advance: number
    otherDeductions: number
    totalDeductions: number
    netSalary: number
    siteName: string | null
}

function masterPrintHTML(rows: Row[], month: number, year: number): string {
    const totals = {
        basic: rows.reduce((s, r) => s + r.basicSalary, 0),
        da: rows.reduce((s, r) => s + r.da, 0),
        hra: rows.reduce((s, r) => s + r.hra, 0),
        conv: rows.reduce((s, r) => s + r.conveyance, 0),
        wash: rows.reduce((s, r) => s + r.washing, 0),
        lww: rows.reduce((s, r) => s + r.lwwEarned, 0),
        bonus: rows.reduce((s, r) => s + r.bonus, 0),
        ot: rows.reduce((s, r) => s + r.overtimePay, 0),
        gross: rows.reduce((s, r) => s + r.grossSalary, 0),
        pfEE: rows.reduce((s, r) => s + r.pfEmployee, 0),
        pfER: rows.reduce((s, r) => s + r.pfEmployer, 0),
        esiEE: rows.reduce((s, r) => s + r.esiEmployee, 0),
        esiER: rows.reduce((s, r) => s + r.esiEmployer, 0),
        pt: rows.reduce((s, r) => s + r.pt, 0),
        lwf: rows.reduce((s, r) => s + r.lwf, 0),
        canteen: rows.reduce((s, r) => s + r.canteen, 0),
        penalty: rows.reduce((s, r) => s + r.penalty, 0),
        advance: rows.reduce((s, r) => s + r.advance, 0),
        other: rows.reduce((s, r) => s + r.otherDeductions, 0),
        totDed: rows.reduce((s, r) => s + r.totalDeductions, 0),
        net: rows.reduce((s, r) => s + r.netSalary, 0),
    }

    const tdStyle = `style="border:1px solid #ccc;padding:3px 5px;font-size:9px;white-space:nowrap;text-align:right;"`
    const tdStyleL = `style="border:1px solid #ccc;padding:3px 5px;font-size:9px;white-space:nowrap;text-align:left;"`
    const thStyle = `style="border:1px solid #999;padding:4px 5px;font-size:8.5px;text-align:center;background:#1e293b;color:#fff;white-space:nowrap;"`
    const thStyleE = `style="border:1px solid #999;padding:4px 5px;font-size:8.5px;text-align:center;background:#065f46;color:#fff;white-space:nowrap;"`
    const thStyleD = `style="border:1px solid #999;padding:4px 5px;font-size:8.5px;text-align:center;background:#7f1d1d;color:#fff;white-space:nowrap;"`
    const totStyle = `style="border:1px solid #999;padding:3px 5px;font-size:9px;font-weight:700;background:#f8fafc;text-align:right;white-space:nowrap;"`
    const totStyleL = `style="border:1px solid #999;padding:3px 5px;font-size:9px;font-weight:700;background:#f8fafc;text-align:left;white-space:nowrap;"`

    const bodyRows = rows.map((r, i) => `
        <tr style="background:${i % 2 === 0 ? "#fff" : "#f8fafc"}">
            <td ${tdStyle}>${i + 1}</td>
            <td ${tdStyleL}>${r.employeeId}</td>
            <td ${tdStyleL} style="border:1px solid #ccc;padding:3px 5px;font-size:9px;white-space:nowrap;min-width:120px">${r.firstName} ${r.lastName}</td>
            <td ${tdStyleL}>${r.uan ?? ""}</td>
            <td ${tdStyleL}>${r.pfNumber ?? ""}</td>
            <td ${tdStyleL}>${r.esiNumber ?? ""}</td>
            <td ${tdStyle}>${r.presentDays}</td>
            <td ${tdStyle}>${fmtN(r.basicSalary)}</td>
            <td ${tdStyle}>${fmtN(r.da)}</td>
            <td ${tdStyle}>${fmtN(r.hra)}</td>
            <td ${tdStyle}>${fmtN(r.conveyance)}</td>
            <td ${tdStyle}>${fmtN(r.washing)}</td>
            <td ${tdStyle}>${fmtN(r.lwwEarned)}</td>
            <td ${tdStyle}>${fmtN(r.bonus)}</td>
            <td ${tdStyle}>${fmtN(r.overtimePay)}</td>
            <td ${tdStyle} style="border:1px solid #ccc;padding:3px 5px;font-size:9px;white-space:nowrap;text-align:right;font-weight:700;color:#065f46">${fmtN(r.grossSalary)}</td>
            <td ${tdStyle}>${fmtN(r.pfEmployee)}</td>
            <td ${tdStyle}>${fmtN(r.pfEmployer)}</td>
            <td ${tdStyle}>${fmtN(r.esiEmployee)}</td>
            <td ${tdStyle}>${fmtN(r.esiEmployer)}</td>
            <td ${tdStyle}>${fmtN(r.pt)}</td>
            <td ${tdStyle}>${fmtN(r.lwf)}</td>
            <td ${tdStyle}>${fmtN(r.canteen)}</td>
            <td ${tdStyle}>${fmtN(r.penalty)}</td>
            <td ${tdStyle}>${fmtN(r.advance)}</td>
            <td ${tdStyle}>${fmtN(r.otherDeductions)}</td>
            <td ${tdStyle} style="border:1px solid #ccc;padding:3px 5px;font-size:9px;white-space:nowrap;text-align:right;font-weight:700;color:#7f1d1d">${fmtN(r.totalDeductions)}</td>
            <td ${tdStyle} style="border:1px solid #ccc;padding:3px 5px;font-size:9px;white-space:nowrap;text-align:right;font-weight:700;color:#1e40af">${fmtN(r.netSalary)}</td>
        </tr>`).join("")

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Compliance Master — ${MONTHS[month-1]} ${year}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 10px; font-size: 9px; }
        h2 { font-size: 13px; margin: 0 0 2px; text-align: center; }
        h3 { font-size: 10px; margin: 0 0 8px; text-align: center; color: #555; }
        table { border-collapse: collapse; width: 100%; }
        @page { size: A3 landscape; margin: 8mm; }
    </style>
    </head><body>
    <h2>COMPLIANCE DOCUMENT MASTER</h2>
    <h3>${MONTHS[month-1].toUpperCase()} ${year} &nbsp;|&nbsp; Total Employees: ${rows.length}</h3>
    <table>
        <thead>
            <tr>
                <th ${thStyle} rowspan="2">Sr</th>
                <th ${thStyle} rowspan="2">Emp ID</th>
                <th ${thStyle} rowspan="2">Name</th>
                <th ${thStyle} rowspan="2">UAN</th>
                <th ${thStyle} rowspan="2">PF No.</th>
                <th ${thStyle} rowspan="2">ESI No.</th>
                <th ${thStyle} rowspan="2">Days</th>
                <th ${thStyleE} colspan="9">EARNINGS</th>
                <th ${thStyleD} colspan="11">DEDUCTIONS</th>
                <th ${thStyle} rowspan="2">Net Pay</th>
            </tr>
            <tr>
                <th ${thStyleE}>Basic</th>
                <th ${thStyleE}>DA</th>
                <th ${thStyleE}>HRA</th>
                <th ${thStyleE}>Conv</th>
                <th ${thStyleE}>Washing</th>
                <th ${thStyleE}>LWW</th>
                <th ${thStyleE}>Bonus</th>
                <th ${thStyleE}>OT</th>
                <th ${thStyleE}>Gross</th>
                <th ${thStyleD}>PF (EE)</th>
                <th ${thStyleD}>PF (ER)</th>
                <th ${thStyleD}>ESI (EE)</th>
                <th ${thStyleD}>ESI (ER)</th>
                <th ${thStyleD}>PT</th>
                <th ${thStyleD}>LWF</th>
                <th ${thStyleD}>Canteen</th>
                <th ${thStyleD}>Penalty</th>
                <th ${thStyleD}>Advance</th>
                <th ${thStyleD}>Other</th>
                <th ${thStyleD}>Total Ded</th>
            </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
            <tr>
                <td ${totStyleL} colspan="7">TOTAL (${rows.length} employees)</td>
                <td ${totStyle}>${fmtN(totals.basic)}</td>
                <td ${totStyle}>${fmtN(totals.da)}</td>
                <td ${totStyle}>${fmtN(totals.hra)}</td>
                <td ${totStyle}>${fmtN(totals.conv)}</td>
                <td ${totStyle}>${fmtN(totals.wash)}</td>
                <td ${totStyle}>${fmtN(totals.lww)}</td>
                <td ${totStyle}>${fmtN(totals.bonus)}</td>
                <td ${totStyle}>${fmtN(totals.ot)}</td>
                <td ${totStyle} style="border:1px solid #999;padding:3px 5px;font-size:9px;font-weight:700;background:#f8fafc;text-align:right;white-space:nowrap;color:#065f46">${fmtN(totals.gross)}</td>
                <td ${totStyle}>${fmtN(totals.pfEE)}</td>
                <td ${totStyle}>${fmtN(totals.pfER)}</td>
                <td ${totStyle}>${fmtN(totals.esiEE)}</td>
                <td ${totStyle}>${fmtN(totals.esiER)}</td>
                <td ${totStyle}>${fmtN(totals.pt)}</td>
                <td ${totStyle}>${fmtN(totals.lwf)}</td>
                <td ${totStyle}>${fmtN(totals.canteen)}</td>
                <td ${totStyle}>${fmtN(totals.penalty)}</td>
                <td ${totStyle}>${fmtN(totals.advance)}</td>
                <td ${totStyle}>${fmtN(totals.other)}</td>
                <td ${totStyle} style="border:1px solid #999;padding:3px 5px;font-size:9px;font-weight:700;background:#f8fafc;text-align:right;white-space:nowrap;color:#7f1d1d">${fmtN(totals.totDed)}</td>
                <td ${totStyle} style="border:1px solid #999;padding:3px 5px;font-size:9px;font-weight:700;background:#f8fafc;text-align:right;white-space:nowrap;color:#1e40af">${fmtN(totals.net)}</td>
            </tr>
        </tfoot>
    </table>
    </body></html>`
}

function ComplianceMasterInner() {
    const router  = useRouter()
    const params  = useSearchParams()
    const tableRef = useRef<HTMLDivElement>(null)

    const [month,   setMonth]   = useState(Number(params.get("month")) || new Date().getMonth() + 1)
    const [year,    setYear]    = useState(Number(params.get("year"))  || new Date().getFullYear())
    const [rows,    setRows]    = useState<Row[]>([])
    const [loading, setLoading] = useState(false)
    const [search,  setSearch]  = useState("")

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/payroll?month=${month}&year=${year}`)
            if (!res.ok) { toast.error("No payroll data found for this period"); setRows([]); return }
            const raw = await res.json()
            if (!Array.isArray(raw) || raw.length === 0) { toast.error("No data found"); setRows([]); return }

            const mapped: Row[] = raw.map((p: Record<string, unknown>) => {
                const emp = p.employee as Record<string, unknown>
                const deps = (emp?.deployments as Array<{site:{name:string}}>) ?? []
                return {
                    id:              p.id as string,
                    employeeId:      emp?.employeeId as string ?? "",
                    firstName:       emp?.firstName as string ?? "",
                    lastName:        emp?.lastName as string ?? "",
                    designation:     emp?.designation as string | null,
                    uan:             emp?.uan as string | null,
                    pfNumber:        emp?.pfNumber as string | null,
                    esiNumber:       emp?.esiNumber as string | null,
                    presentDays:     Number(p.presentDays ?? p.workingDays ?? 0),
                    workingDays:     Number(p.workingDays ?? 26),
                    basicSalary:     Number(p.basicSalary ?? 0),
                    da:              Number(p.da ?? 0),
                    hra:             Number(p.hra ?? 0),
                    conveyance:      Number(p.conveyance ?? 0),
                    washing:         Number(p.washing ?? 0),
                    lwwEarned:       Number(p.lwwEarned ?? 0),
                    bonus:           Number(p.bonus ?? 0),
                    overtimePay:     Number(p.overtimePay ?? 0),
                    grossSalary:     Number(p.grossSalary ?? 0),
                    pfEmployee:      Number(p.pfEmployee ?? 0),
                    pfEmployer:      Number(p.pfEmployer ?? 0),
                    esiEmployee:     Number(p.esiEmployee ?? 0),
                    esiEmployer:     Number(p.esiEmployer ?? 0),
                    pt:              Number(p.pt ?? 0),
                    lwf:             Number(p.lwf ?? 0),
                    canteen:         Number(p.canteen ?? 0),
                    penalty:         Number(p.penalty ?? 0),
                    advance:         Number(p.advance ?? 0),
                    otherDeductions: Number(p.otherDeductions ?? 0),
                    totalDeductions: Number(p.totalDeductions ?? 0),
                    netSalary:       Number(p.netSalary ?? 0),
                    siteName:        deps[0]?.site?.name ?? null,
                }
            })
            setRows(mapped)
            toast.success(`Loaded ${mapped.length} employees`)
        } catch { toast.error("Failed to load data") }
        finally { setLoading(false) }
    }, [month, year])

    useEffect(() => { fetchData() }, [fetchData])

    const filtered = rows.filter(r => {
        if (!search) return true
        const q = search.toLowerCase()
        return (
            r.employeeId.toLowerCase().includes(q) ||
            `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
            (r.uan ?? "").toLowerCase().includes(q) ||
            (r.pfNumber ?? "").toLowerCase().includes(q) ||
            (r.esiNumber ?? "").toLowerCase().includes(q)
        )
    })

    const totals = {
        basic: filtered.reduce((s, r) => s + r.basicSalary, 0),
        da:    filtered.reduce((s, r) => s + r.da, 0),
        hra:   filtered.reduce((s, r) => s + r.hra, 0),
        conv:  filtered.reduce((s, r) => s + r.conveyance, 0),
        wash:  filtered.reduce((s, r) => s + r.washing, 0),
        lww:   filtered.reduce((s, r) => s + r.lwwEarned, 0),
        bonus: filtered.reduce((s, r) => s + r.bonus, 0),
        ot:    filtered.reduce((s, r) => s + r.overtimePay, 0),
        gross: filtered.reduce((s, r) => s + r.grossSalary, 0),
        pfEE:  filtered.reduce((s, r) => s + r.pfEmployee, 0),
        pfER:  filtered.reduce((s, r) => s + r.pfEmployer, 0),
        esiEE: filtered.reduce((s, r) => s + r.esiEmployee, 0),
        esiER: filtered.reduce((s, r) => s + r.esiEmployer, 0),
        pt:    filtered.reduce((s, r) => s + r.pt, 0),
        lwf:   filtered.reduce((s, r) => s + r.lwf, 0),
        cant:  filtered.reduce((s, r) => s + r.canteen, 0),
        pen:   filtered.reduce((s, r) => s + r.penalty, 0),
        adv:   filtered.reduce((s, r) => s + r.advance, 0),
        other: filtered.reduce((s, r) => s + r.otherDeductions, 0),
        totD:  filtered.reduce((s, r) => s + r.totalDeductions, 0),
        net:   filtered.reduce((s, r) => s + r.netSalary, 0),
    }

    const handleExcel = () => {
        if (!filtered.length) { toast.error("No data"); return }
        const xlRows = filtered.map((r, i) => ({
            "Sr": i + 1,
            "Emp ID": r.employeeId,
            "Name": `${r.firstName} ${r.lastName}`,
            "Designation": r.designation ?? "",
            "UAN": r.uan ?? "",
            "PF Number": r.pfNumber ?? "",
            "ESI Number": r.esiNumber ?? "",
            "Days Paid": r.presentDays,
            "Basic": r.basicSalary,
            "DA": r.da,
            "HRA": r.hra,
            "Conveyance": r.conveyance,
            "Washing": r.washing,
            "Leave With Wages": r.lwwEarned,
            "Bonus": r.bonus,
            "OT Pay": r.overtimePay,
            "Gross Salary": r.grossSalary,
            "PF Employee (12%)": r.pfEmployee,
            "PF Employer (13%)": r.pfEmployer,
            "Total PF": r.pfEmployee + r.pfEmployer,
            "ESI Employee (0.75%)": r.esiEmployee,
            "ESI Employer (3.25%)": r.esiEmployer,
            "Total ESI": r.esiEmployee + r.esiEmployer,
            "PT": r.pt,
            "LWF": r.lwf,
            "Canteen": r.canteen,
            "Penalty": r.penalty,
            "Advance": r.advance,
            "Other Deductions": r.otherDeductions,
            "Total Deductions": r.totalDeductions,
            "Net Salary": r.netSalary,
        }))

        const totRow = {
            "Sr": "",
            "Emp ID": "TOTAL",
            "Name": `${filtered.length} employees`,
            "Designation": "",
            "UAN": "", "PF Number": "", "ESI Number": "",
            "Days Paid": filtered.reduce((s, r) => s + r.presentDays, 0),
            "Basic": totals.basic, "DA": totals.da, "HRA": totals.hra,
            "Conveyance": totals.conv, "Washing": totals.wash,
            "Leave With Wages": totals.lww, "Bonus": totals.bonus,
            "OT Pay": totals.ot, "Gross Salary": totals.gross,
            "PF Employee (12%)": totals.pfEE, "PF Employer (13%)": totals.pfER,
            "Total PF": totals.pfEE + totals.pfER,
            "ESI Employee (0.75%)": totals.esiEE, "ESI Employer (3.25%)": totals.esiER,
            "Total ESI": totals.esiEE + totals.esiER,
            "PT": totals.pt, "LWF": totals.lwf, "Canteen": totals.cant,
            "Penalty": totals.pen, "Advance": totals.adv, "Other Deductions": totals.other,
            "Total Deductions": totals.totD, "Net Salary": totals.net,
        }

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.json_to_sheet([...xlRows, totRow])
        ws["!cols"] = Object.keys(xlRows[0]).map((k, i) => ({
            wch: i < 3 ? 20 : Math.max(k.length + 2, 10)
        }))
        XLSX.utils.sheet_add_aoa(ws, [
            [`COMPLIANCE DOCUMENT MASTER — ${MONTHS[month-1].toUpperCase()} ${year}`],
        ], { origin: "A1" })
        XLSX.utils.book_append_sheet(wb, ws, `Compliance Master`)
        XLSX.writeFile(wb, `Compliance_Master_${MONTHS_SHORT[month-1]}_${year}.xlsx`)
        toast.success("Excel downloaded")
    }

    const handlePrint = () => {
        if (!filtered.length) { toast.error("No data to print"); return }
        printHTML(masterPrintHTML(filtered, month, year))
    }

    const th0 = { background: "#1e293b", color: "#fff" }
    const thE  = { background: "#065f46", color: "#fff" }
    const thD  = { background: "#7f1d1d", color: "#fff" }

    const TH = ({ s, children, colSpan, rowSpan }: { s?: React.CSSProperties; children: React.ReactNode; colSpan?: number; rowSpan?: number }) => (
        <th colSpan={colSpan} rowSpan={rowSpan} style={{
            padding: "5px 7px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
            border: "1px solid rgba(255,255,255,0.15)", textAlign: "center",
            position: "sticky", top: 0, zIndex: 2, ...s
        }}>{children}</th>
    )

    const TD = ({ children, right, bold, color }: { children: React.ReactNode; right?: boolean; bold?: boolean; color?: string }) => (
        <td style={{
            padding: "4px 7px", fontSize: 11, whiteSpace: "nowrap",
            borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)",
            textAlign: right ? "right" : "left",
            fontWeight: bold ? 700 : 400,
            color: color ?? "var(--text2)",
        }}>{children}</td>
    )

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 32 }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)" }}>
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll")}>Payroll</span>
                <ChevronRight size={11} />
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll/compliance")}>Compliance</span>
                <ChevronRight size={11} />
                <span style={{ fontWeight: 600, color: "var(--text2)" }}>Document Master</span>
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ShieldCheck size={20} style={{ color: "var(--accent)" }} />
                    <div>
                        <h1 style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", margin: 0 }}>Compliance Document Master</h1>
                        <p style={{ fontSize: 11, color: "var(--text3)", margin: 0 }}>Full employee-wise PF, ESI, PT & salary detail</p>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>Month</span>
                    <select value={month} onChange={e => setMonth(Number(e.target.value))} style={selStyle}>
                        {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                    <select value={year} onChange={e => setYear(Number(e.target.value))} style={selStyle}>
                        {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button onClick={fetchData} disabled={loading} style={{ ...btnStyle, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text2)" }}>
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                    </button>
                    <button onClick={handleExcel} disabled={!filtered.length} style={{ ...btnStyle, background: "#16a34a", color: "#fff", opacity: filtered.length ? 1 : 0.4 }}>
                        <FileSpreadsheet size={13} /> Excel
                    </button>
                    <button onClick={handlePrint} disabled={!filtered.length} style={{ ...btnStyle, background: "var(--accent)", color: "#fff", opacity: filtered.length ? 1 : 0.4 }}>
                        <Printer size={13} /> PDF Print
                    </button>
                </div>
            </div>

            {/* Summary cards */}
            {rows.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                    {[
                        { label: "Employees",   value: String(filtered.length),  color: "#3b82f6" },
                        { label: "Gross Salary", value: fmtC(totals.gross),       color: "#0369a1" },
                        { label: "Total PF",     value: fmtC(totals.pfEE + totals.pfER), color: "#7c3aed" },
                        { label: "Total ESI",    value: fmtC(totals.esiEE + totals.esiER), color: "#0891b2" },
                        { label: "Total PT",     value: fmtC(totals.pt),           color: "#d97706" },
                        { label: "Total Deductions", value: fmtC(totals.totD),     color: "#dc2626" },
                        { label: "Net Salary",   value: fmtC(totals.net),          color: "#16a34a" },
                    ].map(s => (
                        <div key={s.label} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)" }}>
                            <p style={{ fontSize: 9, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px", margin: 0 }}>{s.label}</p>
                            <p style={{ fontSize: 14, fontWeight: 800, color: s.color, margin: "3px 0 0 0" }}>{s.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Search */}
            <input
                placeholder="Search by Employee ID, Name, UAN, PF No, ESI No…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none", maxWidth: 400 }}
            />

            {/* Table */}
            <div ref={tableRef} style={{ border: "1px solid var(--border)", borderRadius: 12, overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 320px)" }}>
                {loading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, gap: 10 }}>
                        <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent)" }} />
                        <span style={{ fontSize: 13, color: "var(--text3)" }}>Loading payroll data…</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: 48, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
                        No data. Select a period and ensure payroll is processed.
                    </div>
                ) : (
                    <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                        <thead>
                            <tr>
                                <TH s={{ ...th0, position: "sticky", left: 0, zIndex: 3 }} rowSpan={2}>Sr</TH>
                                <TH s={{ ...th0, position: "sticky", left: 34, zIndex: 3 }} rowSpan={2}>Emp ID</TH>
                                <TH s={{ ...th0, position: "sticky", left: 100, zIndex: 3, minWidth: 140 }} rowSpan={2}>Name</TH>
                                <TH s={th0} rowSpan={2}>UAN</TH>
                                <TH s={th0} rowSpan={2}>PF No.</TH>
                                <TH s={th0} rowSpan={2}>ESI No.</TH>
                                <TH s={th0} rowSpan={2}>Days</TH>
                                <TH s={thE} colSpan={9}>EARNINGS</TH>
                                <TH s={thD} colSpan={11}>DEDUCTIONS</TH>
                                <TH s={th0} rowSpan={2}>Net Pay</TH>
                            </tr>
                            <tr>
                                {["Basic","DA","HRA","Conv","Washing","LWW","Bonus","OT","Gross"].map(h => (
                                    <TH key={h} s={thE}>{h}</TH>
                                ))}
                                {["PF (EE)","PF (ER)","ESI (EE)","ESI (ER)","PT","LWF","Canteen","Penalty","Advance","Other","Tot Ded"].map(h => (
                                    <TH key={h} s={thD}>{h}</TH>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r, i) => (
                                <tr key={r.id} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                                    <TD color="var(--text3)">{i + 1}</TD>
                                    <TD bold color="var(--accent)">{r.employeeId}</TD>
                                    <TD bold color="var(--text)">
                                        <div>{r.firstName} {r.lastName}</div>
                                        {r.designation && <div style={{ fontSize: 9, color: "var(--text3)", fontWeight: 400 }}>{r.designation}</div>}
                                    </TD>
                                    <TD color="var(--text3)">{r.uan ?? "—"}</TD>
                                    <TD color="var(--text3)">{r.pfNumber ?? "—"}</TD>
                                    <TD color="var(--text3)">{r.esiNumber ?? "—"}</TD>
                                    <TD right color="#1e40af">{r.presentDays}</TD>
                                    <TD right>{fmtN(r.basicSalary)}</TD>
                                    <TD right>{fmtN(r.da)}</TD>
                                    <TD right>{fmtN(r.hra)}</TD>
                                    <TD right>{fmtN(r.conveyance)}</TD>
                                    <TD right>{fmtN(r.washing)}</TD>
                                    <TD right>{fmtN(r.lwwEarned)}</TD>
                                    <TD right>{fmtN(r.bonus)}</TD>
                                    <TD right>{fmtN(r.overtimePay)}</TD>
                                    <TD right bold color="#065f46">{fmtN(r.grossSalary)}</TD>
                                    <TD right>{fmtN(r.pfEmployee)}</TD>
                                    <TD right>{fmtN(r.pfEmployer)}</TD>
                                    <TD right>{fmtN(r.esiEmployee)}</TD>
                                    <TD right>{fmtN(r.esiEmployer)}</TD>
                                    <TD right>{fmtN(r.pt)}</TD>
                                    <TD right>{fmtN(r.lwf)}</TD>
                                    <TD right>{fmtN(r.canteen)}</TD>
                                    <TD right>{fmtN(r.penalty)}</TD>
                                    <TD right>{fmtN(r.advance)}</TD>
                                    <TD right>{fmtN(r.otherDeductions)}</TD>
                                    <TD right bold color="#dc2626">{fmtN(r.totalDeductions)}</TD>
                                    <TD right bold color="#1e40af">{fmtN(r.netSalary)}</TD>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ background: "#1e293b" }}>
                                <td colSpan={7} style={{ padding: "6px 10px", fontSize: 11, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", position: "sticky", left: 0, background: "#1e293b" }}>
                                    TOTAL ({filtered.length} emp)
                                </td>
                                {[totals.basic, totals.da, totals.hra, totals.conv, totals.wash, totals.lww, totals.bonus, totals.ot].map((v, i) => (
                                    <td key={i} style={{ padding: "6px 7px", fontSize: 11, fontWeight: 700, color: "#86efac", textAlign: "right", whiteSpace: "nowrap", background: "#1e293b", borderRight: "1px solid rgba(255,255,255,0.1)" }}>{fmtN(v)}</td>
                                ))}
                                <td style={{ padding: "6px 7px", fontSize: 11, fontWeight: 800, color: "#4ade80", textAlign: "right", whiteSpace: "nowrap", background: "#065f46", borderRight: "1px solid rgba(255,255,255,0.1)" }}>{fmtN(totals.gross)}</td>
                                {[totals.pfEE, totals.pfER, totals.esiEE, totals.esiER, totals.pt, totals.lwf, totals.cant, totals.pen, totals.adv, totals.other].map((v, i) => (
                                    <td key={i} style={{ padding: "6px 7px", fontSize: 11, fontWeight: 700, color: "#fca5a5", textAlign: "right", whiteSpace: "nowrap", background: "#1e293b", borderRight: "1px solid rgba(255,255,255,0.1)" }}>{fmtN(v)}</td>
                                ))}
                                <td style={{ padding: "6px 7px", fontSize: 11, fontWeight: 800, color: "#f87171", textAlign: "right", whiteSpace: "nowrap", background: "#7f1d1d", borderRight: "1px solid rgba(255,255,255,0.1)" }}>{fmtN(totals.totD)}</td>
                                <td style={{ padding: "6px 7px", fontSize: 11, fontWeight: 800, color: "#93c5fd", textAlign: "right", whiteSpace: "nowrap", background: "#1e3a8a", borderRight: "1px solid rgba(255,255,255,0.1)" }}>{fmtN(totals.net)}</td>
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>

            <p style={{ fontSize: 10, color: "var(--text3)", textAlign: "center" }}>
                Showing data from all processed payroll records for {MONTHS[month-1]} {year} &nbsp;·&nbsp; Use PDF Print for A3 landscape output
            </p>
        </div>
    )
}

export default function ComplianceMasterPage() {
    return <Suspense><ComplianceMasterInner /></Suspense>
}

const selStyle: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)",
    fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none"
}
const btnStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 5,
    padding: "6px 13px", borderRadius: 8, border: "none",
    fontSize: 12, fontWeight: 700, cursor: "pointer"
}
