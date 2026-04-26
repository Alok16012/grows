"use client"
import { Suspense, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Search, Printer, CheckCircle2, RefreshCw, ChevronRight, MapPin, Building2, Clock, FileText, IndianRupee } from "lucide-react"

const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"]

function numToWords(n: number): string {
    if (n === 0) return "Zero Only"
    const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"]
    const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"]
    const toW = (num: number): string => {
        if (num === 0) return ""
        if (num < 20) return ones[num] + " "
        if (num < 100) return tens[Math.floor(num/10)] + (num%10 ? " " + ones[num%10] : "") + " "
        if (num < 1000) return ones[Math.floor(num/100)] + " Hundred " + toW(num%100)
        if (num < 100000) return toW(Math.floor(num/1000)) + "Thousand " + toW(num%1000)
        if (num < 10000000) return toW(Math.floor(num/100000)) + "Lakh " + toW(num%100000)
        return toW(Math.floor(num/10000000)) + "Crore " + toW(num%10000000)
    }
    return "Rupees " + toW(n).trim().replace(/\s+/g," ") + " Only"
}

type Site = { id: string; name: string; code?: string }
type SiteStatus = { siteId: string | null; processedCount: number }
type PayrollRecord = {
    id: string; month: number; year: number; status: string
    basicSalary: number; da: number; hra: number; washing: number; conveyance: number
    lwwEarned: number; bonus: number; overtimePay: number; grossSalary: number
    pfEmployee: number; esiEmployee: number; pt: number; lwf: number
    canteen: number; penalty: number; advance: number; otherDeductions: number
    totalDeductions: number; netSalary: number
    workingDays: number | null; presentDays: number | null; overtimeHrs?: number
    pfEmployer: number; esiEmployer: number; ctc?: number
    employee: {
        id: string; employeeId: string; firstName: string; lastName: string
        designation: string | null
        deployments?: { site: { name: string } }[]
    }
}

function SalarySlipsInner() {
    const router = useRouter()
    const [month,    setMonth]    = useState(new Date().getMonth() + 1)
    const [year,     setYear]     = useState(new Date().getFullYear())
    const [sites,    setSites]    = useState<Site[]>([])
    const [status,   setStatus]   = useState<SiteStatus[]>([])
    const [selSiteId,setSelSiteId] = useState("")
    const [records,  setRecords]  = useState<PayrollRecord[]>([])
    const [search,   setSearch]   = useState("")
    const [selected, setSelected] = useState<PayrollRecord | null>(null)
    const [ldSites,  setLdSites]  = useState(true)
    const [loading,  setLoading]  = useState(false)
    const [actLoad,  setActLoad]  = useState<string | null>(null)

    useEffect(() => {
        fetch("/api/sites?isActive=true").then(r => r.json())
            .then(d => { if (Array.isArray(d)) setSites(d) })
            .finally(() => setLdSites(false))
    }, [])

    const fetchStatus = useCallback(async () => {
        try {
            const r = await fetch(`/api/payroll/sites-status?month=${month}&year=${year}`)
            if (r.ok) { const d = await r.json(); if (Array.isArray(d)) setStatus(d) }
        } catch {}
    }, [month, year])

    useEffect(() => { fetchStatus() }, [fetchStatus])

    const fetchSlips = useCallback(async (siteId: string) => {
        setLoading(true); setRecords([]); setSelected(null)
        try {
            const url = siteId
                ? `/api/payroll?siteId=${siteId}&month=${month}&year=${year}`
                : `/api/payroll?month=${month}&year=${year}`
            const r = await fetch(url)
            if (!r.ok) throw new Error(await r.text())
            const d = await r.json(); setRecords(Array.isArray(d) ? d : [])
        } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed") }
        finally { setLoading(false) }
    }, [month, year])

    const selectSite = (id: string) => {
        setSelSiteId(id); setSearch(""); setSelected(null)
        fetchSlips(id)
    }

    useEffect(() => { fetchSlips(selSiteId) }, [month, year])

    const handleMarkPaid = async (id: string) => {
        setActLoad(id)
        try {
            const r = await fetch(`/api/payroll/${id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "PAID" })
            })
            if (!r.ok) throw new Error(await r.text())
            toast.success("Marked as credited")
            fetchSlips(selSiteId)
            setSelected(null)
        } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed") }
        finally { setActLoad(null) }
    }

    const buildSlipHTML = (p: PayrollRecord) => {
        const site = p.employee.deployments?.[0]?.site?.name ?? ""
        const wDays = p.workingDays ?? 26
        const pDays = p.presentDays ?? wDays
        // Full-month rate = back-calculate from earned amounts
        const rate = (amt: number) => pDays > 0 ? Math.round(amt * wDays / pDays) : amt
        const r = (n: number) => Math.round(n).toLocaleString("en-IN")
        const earnings = [
            { label: "Basic",                  fullRate: rate(p.basicSalary), amt: p.basicSalary },
            { label: "DA",                      fullRate: rate(p.da),          amt: p.da },
            { label: "HRA",                     fullRate: 0,                   amt: 0 },
            { label: "Educational Allowance",   fullRate: 0,                   amt: 0 },
            { label: "Conveyance Allow.",       fullRate: rate(p.conveyance),  amt: p.conveyance },
            { label: "Medical Allowance",       fullRate: 0,                   amt: 0 },
            { label: "Other Allowance",         fullRate: 0,                   amt: 0 },
            { label: "Washing Allowance",       fullRate: rate(p.washing),     amt: p.washing },
            { label: "Leave with Wages",        fullRate: rate(p.lwwEarned),   amt: p.lwwEarned },
            { label: "Bonus",                   fullRate: rate(p.bonus),       amt: p.bonus },
            { label: "O.T.",                    fullRate: 0,                   amt: p.overtimePay },
            { label: "Performance Allow.",      fullRate: 0,                   amt: 0 },
            { label: "COVID All + Incentives",  fullRate: 0,                   amt: 0 },
        ]
        const deductions = [
            { label: "PF",               amt: p.pfEmployee },
            { label: "VPF",              amt: 0 },
            { label: "P.Tax",            amt: p.pt },
            { label: "ESI",              amt: p.esiEmployee },
            { label: "Salary Advance",   amt: p.advance },
            { label: "TDS",              amt: 0 },
            { label: "Other Deduction",  amt: p.otherDeductions },
            { label: "Canteen Ded",      amt: p.canteen },
            { label: "MLWF",             amt: p.lwf },
            { label: "Loan Deduction",   amt: 0 },
        ]
        return `
<div class="slip">
  <div class="co-header">
    <h1>GROWUS AUTO INDIA PRIVATE LIMITED</h1>
    <p>BR1, 3<sup>rd</sup> FLOOR, B WING, JAI GANESH VISION, 336, Near, Akurdi Chowk, AKURDI, PUNE, 411035.</p>
  </div>
  <div class="site-row"><b>SITE: ${site.toUpperCase()}</b><br/><b>ADDRESS:</b></div>
  <table class="main">
    <thead><tr><th colspan="5" class="month-hdr">PAYSLIPS FOR THE MONTH ${MONTHS_LONG[p.month-1].toUpperCase()} ${p.year}</th></tr></thead>
    <tbody>
      <tr class="info-row">
        <td colspan="3" class="info-cell">
          <table class="info"><tbody>
            <tr><td class="il">Employee Name</td><td class="iv"><b>${p.employee.firstName} ${p.employee.lastName}</b></td><td class="il">Designation</td><td class="iv">${p.employee.designation ?? "."}</td></tr>
            <tr><td class="il">Employee Number</td><td class="iv">${p.employee.employeeId}</td><td class="il">Date Of Joining</td><td class="iv"></td></tr>
            <tr><td class="il">Date of Birth</td><td class="iv"></td><td class="il">Days Paid</td><td class="iv"><b>${pDays}</b></td></tr>
            <tr><td class="il">UAN No.</td><td class="iv"></td><td class="il">OT Hrs</td><td class="iv">${p.overtimeHrs ?? 0}</td></tr>
            <tr><td class="il">PF No.</td><td class="iv"></td><td class="il">Location</td><td class="iv">PUNE</td></tr>
            <tr><td class="il">ESIC No.</td><td class="iv"></td><td class="il"></td><td class="iv"></td></tr>
          </tbody></table>
        </td>
      </tr>
      <tr class="col-hdr">
        <th class="e-col">Earnings</th><th colspan="2" class="e-col" style="border-right:2px solid #888"></th>
        <th colspan="2" class="d-col">Deductions</th>
      </tr>
      <tr class="sub-hdr">
        <th>Particulars</th><th class="num">Salary Rate</th><th class="num" style="border-right:2px solid #888">Salary Amt (Rs.)</th>
        <th></th><th class="num">Amount (Rs.)</th>
      </tr>
      ${earnings.map((e, i) => {
          const d = deductions[i]
          return `<tr>
            <td>${e.label}</td><td class="num it">${e.fullRate > 0 ? r(e.fullRate) : ""}</td><td class="num it" style="border-right:2px solid #888">${e.amt > 0 ? r(e.amt) : "0"}</td>
            <td class="dlabel">${d?.label ?? ""}</td><td class="num">${d && d.amt > 0 ? r(d.amt) : "0"}</td>
          </tr>`
      }).join("")}
      <tr class="total-row">
        <td><b>Gross Earnings (A)</b></td><td></td><td class="num" style="border-right:2px solid #888"><b>${r(p.grossSalary)}</b></td>
        <td><b>Total Deduction</b></td><td class="num"><b>${r(p.totalDeductions)}</b></td>
      </tr>
      <tr class="net-row">
        <td colspan="2"><b>Net Pay (A) - (B)</b></td><td class="num" style="border-right:2px solid #888"><b>${r(p.netSalary)}</b></td>
        <td><b>(B)</b></td><td></td>
      </tr>
      <tr><td colspan="5" class="words">Amount in words: <b><i>${numToWords(Math.round(p.netSalary))}</i></b></td></tr>
    </tbody>
  </table>
  <div class="footer-row">
    <span>Place: Pune</span>
  </div>
  <div class="comp-gen">This is a Computer Generated Slip and does not require signature</div>
</div>`
    }

    const printSlip = (p: PayrollRecord) => {
        const w = window.open("", "_blank")
        if (!w) return
        w.document.write(slipPageHTML([p]))
        w.document.close()
    }

    const printAllSlips = () => {
        if (!filtered.length) return
        const w = window.open("", "_blank")
        if (!w) return
        w.document.write(slipPageHTML(filtered))
        w.document.close()
    }

    const slipPageHTML = (records: PayrollRecord[]) => `<!DOCTYPE html><html><head>
<meta charset="UTF-8"/>
<title>Salary Slips</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;font-size:11px;color:#111;background:#fff;}
  .slip{width:720px;margin:20px auto;padding:0 0 24px 0;page-break-after:always;}
  .slip:last-child{page-break-after:avoid;}
  .co-header{text-align:center;padding:10px 4px 6px;border-bottom:1px solid #333;}
  .co-header h1{font-size:15px;font-style:italic;font-weight:900;letter-spacing:.3px;}
  .co-header p{font-size:10px;font-style:italic;margin-top:3px;}
  .site-row{padding:6px 4px;font-size:11px;}
  .main{width:100%;border-collapse:collapse;border:1px solid #555;}
  .main td,.main th{border:1px solid #aaa;padding:3px 6px;font-size:10.5px;}
  .month-hdr{text-align:center;font-size:12px;font-weight:900;background:#f0f0f0;padding:5px;}
  .info-cell{padding:0!important;border:none!important;}
  .info{width:100%;border-collapse:collapse;}
  .info td{border:1px solid #aaa;padding:3px 6px;font-size:10px;}
  .il{color:#333;width:20%;font-weight:600;} .iv{width:30%;font-style:italic;}
  .col-hdr th{background:#e8e8e8;font-weight:700;font-size:11px;text-align:center;}
  .sub-hdr th{background:#f5f5f5;font-weight:700;font-size:10px;}
  .e-col{background:#e8f0fe;} .d-col{background:#fce8e8;}
  .num{text-align:right;} .it{font-style:italic;}
  .dlabel{padding-left:8px;}
  .total-row td{font-weight:700;background:#f0f0f0;border-top:2px solid #555!important;}
  .net-row td{font-weight:700;background:#e8f5e9;}
  .words{font-size:10.5px;padding:5px 6px!important;border-top:1px solid #555!important;}
  .footer-row{padding:8px 4px 2px;font-size:10.5px;}
  .comp-gen{text-align:center;padding:8px;font-size:10px;color:#555;}
  @media print{
    body{margin:0;}
    .slip{width:100%;margin:0;padding:0 12px 20px;}
    @page{margin:10mm;size:A4;}
  }
</style></head><body>
${records.map(p => buildSlipHTML(p)).join("")}
<script>window.onload=()=>window.print()</script>
</body></html>`

    const filtered   = records.filter(r => !search ||
        `${r.employee.firstName} ${r.employee.lastName} ${r.employee.employeeId}`.toLowerCase().includes(search.toLowerCase()))
    const getSt      = (id: string) => status.find(s => s.siteId === id)
    const paid       = records.filter(r => r.status === "PAID").length
    const processed  = records.filter(r => r.status === "PROCESSED").length
    const draft      = records.filter(r => r.status === "DRAFT").length
    const done       = status.filter(s => (s.processedCount ?? 0) > 0).length

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 32 }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)" }}>
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll")}>Payroll</span>
                <ChevronRight size={11} />
                <span style={{ fontWeight: 600, color: "var(--text2)" }}>Salary Slips</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>Payslip Generation</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#15803d" }}><CheckCircle2 size={12} /> {paid} Credited</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#1d4ed8" }}><Clock size={12} /> {processed} Ready</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text3)" }}><FileText size={12} /> {draft} Draft</span>
                </div>
            </div>

            {/* Month/Year */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 16px" }}>
                <span style={lbl}>Month</span>
                <select value={month} onChange={e => setMonth(Number(e.target.value))} style={sel}>
                    {MONTHS_LONG.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
                <span style={lbl}>Year</span>
                <select value={year} onChange={e => setYear(Number(e.target.value))} style={sel}>
                    {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={() => fetchSlips(selSiteId)} style={{ marginLeft: "auto", display: "flex", padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "none", cursor: "pointer" }}>
                    <RefreshCw size={12} style={{ color: "var(--text3)" }} />
                </button>
            </div>

            {/* Two-panel */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {/* LEFT: Site list */}
                <div style={{ width: 220, flexShrink: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)" }}>Filter by Site</span>
                    </div>
                    <div style={{ overflowY: "auto", maxHeight: 480 }}>
                        {ldSites ? <div style={{ padding: 20, textAlign: "center" }}><Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} /></div> : (
                            <>
                                <div onClick={() => selectSite("")}
                                    style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                                        background: !selSiteId ? "var(--accent-light)" : "transparent",
                                        borderLeft: !selSiteId ? "3px solid var(--accent)" : "3px solid transparent" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <Building2 size={12} style={{ color: !selSiteId ? "var(--accent)" : "var(--text3)" }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: !selSiteId ? "var(--accent)" : "var(--text2)" }}>All Sites</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2, marginLeft: 18 }}>{done}/{sites.length} processed</div>
                                </div>
                                {sites.map(site => {
                                    const st = getSt(site.id); const isDone = (st?.processedCount ?? 0) > 0; const isSel = selSiteId === site.id
                                    return (
                                        <div key={site.id} onClick={() => selectSite(site.id)}
                                            style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                                                background: isSel ? "var(--accent-light)" : "transparent",
                                                borderLeft: isSel ? "3px solid var(--accent)" : "3px solid transparent" }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                                    <MapPin size={11} style={{ color: isSel ? "var(--accent)" : "var(--text3)", flexShrink: 0 }} />
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: isSel ? "var(--accent)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{site.name}</span>
                                                </div>
                                                {isDone && <span style={{ fontSize: 9, color: "#16a34a", fontWeight: 700, flexShrink: 0 }}>✓</span>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </>
                        )}
                    </div>
                </div>

                {/* RIGHT: Employee list + slip preview */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 12 }}>
                    {/* Employee list */}
                    <div style={{ flex: 1, minWidth: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                        {/* Search bar */}
                        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                            <Search size={13} style={{ color: "var(--text3)", flexShrink: 0 }} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…"
                                style={{ flex: 1, border: "none", outline: "none", fontSize: 12, background: "transparent", color: "var(--text)" }} />
                            <span style={{ fontSize: 11, color: "var(--text3)", whiteSpace: "nowrap" }}>{filtered.length}</span>
                            {filtered.length > 0 && (
                                <button onClick={printAllSlips}
                                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, border: "none", background: "#7c3aed", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                                    <Printer size={11} /> Print All ({filtered.length})
                                </button>
                            )}
                        </div>
                        {/* Column headers */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 60px", padding: "8px 16px", background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Employee</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Net Salary</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Print</span>
                        </div>
                        <div style={{ overflowY: "auto", maxHeight: 500 }}>
                            {loading ? (
                                <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                                    <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent)" }} />
                                </div>
                            ) : filtered.length === 0 ? (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px", gap: 8, color: "var(--text3)" }}>
                                    <IndianRupee size={32} style={{ opacity: 0.2 }} />
                                    <p style={{ fontSize: 13, margin: 0 }}>No payroll records for {MONTHS_LONG[month-1]} {year}</p>
                                    <p style={{ fontSize: 11, margin: 0 }}>Process payroll first</p>
                                </div>
                            ) : filtered.map((r, idx) => {
                                const statusColor = r.status === "PAID" ? "#15803d" : r.status === "PROCESSED" ? "#1d4ed8" : "#6b7280"
                                const statusBg    = r.status === "PAID" ? "#dcfce7" : r.status === "PROCESSED" ? "#dbeafe" : "#f3f4f6"
                                return (
                                    <div key={r.id} onClick={() => setSelected(r)}
                                        style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 60px", alignItems: "center", padding: "10px 16px", cursor: "pointer",
                                            background: selected?.id === r.id ? "#f0fdf4" : idx % 2 === 0 ? "var(--surface)" : "var(--surface2)",
                                            borderBottom: "1px solid var(--border)" }}>
                                        <div>
                                            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: 0 }}>{r.employee.firstName} {r.employee.lastName}</p>
                                            <p style={{ fontSize: 10, color: "var(--text3)", margin: "1px 0 0 0" }}>{r.employee.employeeId} · {r.employee.deployments?.[0]?.site?.name || "—"}</p>
                                        </div>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>₹{Math.round(r.netSalary).toLocaleString("en-IN")}</span>
                                        <span style={{ padding: "2px 7px", borderRadius: 20, fontSize: 9, fontWeight: 700, width: "fit-content",
                                            color: statusColor, background: statusBg }}>{r.status}</span>
                                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                            <button onClick={e => { e.stopPropagation(); printSlip(r) }}
                                                style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text3)" }}>
                                                <Printer size={12} />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Slip Preview Panel */}
                    {selected && (
                        <div style={{ width: 310, flexShrink: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", alignSelf: "flex-start", position: "sticky", top: 16 }}>
                            <div style={{ background: "#1a9e6e", color: "#fff", padding: "14px 16px" }}>
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                                    <div>
                                        <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{selected.employee.firstName} {selected.employee.lastName}</p>
                                        <p style={{ fontSize: 11, opacity: 0.8, margin: "2px 0 0 0" }}>{selected.employee.employeeId} · {selected.employee.designation}</p>
                                    </div>
                                    <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 16 }}>✕</button>
                                </div>
                                <div style={{ textAlign: "center", marginTop: 12 }}>
                                    <p style={{ fontSize: 11, opacity: 0.8, margin: 0 }}>Net Salary — {MONTHS_LONG[selected.month-1]} {selected.year}</p>
                                    <p style={{ fontSize: 26, fontWeight: 800, margin: "2px 0 0 0" }}>₹{Math.round(selected.netSalary).toLocaleString("en-IN")}</p>
                                </div>
                            </div>
                            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, fontSize: 12 }}>
                                <div>
                                    <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px 0" }}>Earnings</p>
                                    {[["Basic", selected.basicSalary],["DA", selected.da],["Washing", selected.washing],["Conveyance",selected.conveyance],["OT Pay", selected.overtimePay]]
                                        .filter(([,v]) => Number(v) > 0).map(([l, v]) => (
                                        <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
                                            <span style={{ color: "var(--text3)" }}>{l}</span>
                                            <span style={{ fontWeight: 600 }}>₹{Math.round(Number(v)).toLocaleString("en-IN")}</span>
                                        </div>
                                    ))}
                                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, fontWeight: 700 }}>
                                        <span>Gross</span><span style={{ color: "#1a9e6e" }}>₹{Math.round(selected.grossSalary).toLocaleString("en-IN")}</span>
                                    </div>
                                </div>
                                <div>
                                    <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px 0" }}>Deductions</p>
                                    {[["PF", selected.pfEmployee],["ESIC", selected.esiEmployee],["PT", selected.pt],["Canteen", selected.canteen],["Penalty", selected.penalty],["Advance", selected.advance]]
                                        .filter(([,v]) => Number(v) > 0).map(([l, v]) => (
                                        <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
                                            <span style={{ color: "var(--text3)" }}>{l}</span>
                                            <span style={{ color: "#dc2626" }}>-₹{Math.round(Number(v)).toLocaleString("en-IN")}</span>
                                        </div>
                                    ))}
                                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, fontWeight: 700 }}>
                                        <span>Total Deductions</span><span style={{ color: "#dc2626" }}>-₹{Math.round(selected.totalDeductions).toLocaleString("en-IN")}</span>
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, background: "var(--surface2)", borderRadius: 8, padding: "10px", textAlign: "center" }}>
                                    {[["Days",selected.workingDays ?? 0],["Present",selected.presentDays ?? 0],["LOP",(selected.workingDays??0)-(selected.presentDays??0)],["OT Hrs",selected.overtimeHrs ?? 0]]
                                        .map(([l,v]) => (
                                        <div key={l as string}>
                                            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", margin: 0 }}>{v}</p>
                                            <p style={{ fontSize: 9, color: "var(--text3)", margin: "2px 0 0 0" }}>{l}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ padding: "0 16px 14px", display: "flex", gap: 8 }}>
                                <button onClick={() => printSlip(selected)}
                                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "var(--text2)", cursor: "pointer", background: "none" }}>
                                    <Printer size={13} /> Print
                                </button>
                                {selected.status !== "PAID" && (
                                    <button onClick={() => handleMarkPaid(selected.id)} disabled={!!actLoad}
                                        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer", background: "#1a9e6e", opacity: actLoad ? 0.6 : 1 }}>
                                        {actLoad === selected.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                        Mark Credited
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function SalarySlipsPage() {
    return <Suspense><SalarySlipsInner /></Suspense>
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap" }
const sel: React.CSSProperties = { padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }
