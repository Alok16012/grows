"use client"
import { Suspense, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Search, Printer, CheckCircle2, RefreshCw, ChevronRight, MapPin, Building2, Clock, FileText, IndianRupee } from "lucide-react"

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"]

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

    const printSlip = (p: PayrollRecord) => {
        const w = window.open("", "_blank")
        if (!w) return
        const siteName = p.employee.deployments?.[0]?.site?.name ?? ""
        w.document.write(`<!DOCTYPE html><html><head>
<title>Salary Slip - ${p.employee.firstName} ${p.employee.lastName} - ${MONTHS[p.month-1]} ${p.year}</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1a1a18;font-size:13px;}
  .hdr{background:#1a9e6e;color:white;padding:18px 22px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;}
  .hdr h1{margin:0;font-size:18px;} .hdr p{margin:2px 0;font-size:11px;opacity:.85;}
  .net{text-align:center;padding:14px;background:#e8f7f1;border-bottom:1px solid #c6e8da;}
  .net span{font-size:26px;font-weight:800;color:#1a9e6e;}
  .body{border:1px solid #e8e6e1;border-top:none;padding:18px;border-radius:0 0 10px 10px;}
  .g2{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
  h3{font-size:10px;font-weight:700;color:#6b6860;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px 0;}
  .row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f3f4f6;}
  .tot{font-weight:700;border-top:2px solid #e8e6e1!important;border-bottom:none!important;margin-top:4px;padding-top:6px;}
  .att{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#f9f8f5;padding:12px;border-radius:8px;text-align:center;margin-top:14px;}
  .att .v{font-size:18px;font-weight:800;margin:0;} .att .l{font-size:10px;color:#6b6860;margin:2px 0 0 0;}
  .foot{margin-top:10px;padding-top:8px;border-top:1px solid #e8e6e1;display:flex;justify-content:space-between;font-size:11px;color:#6b6860;}
  @media print{body{padding:8px;}}
</style></head><body>
<div class="hdr">
  <div><h1>${p.employee.firstName} ${p.employee.lastName}</h1>
  <p>${p.employee.employeeId} · ${p.employee.designation ?? ""}</p>
  <p>${siteName}</p></div>
  <div style="text-align:right"><p style="font-size:12px;font-weight:700">Pay Period</p>
  <p style="font-size:16px;font-weight:800">${MONTHS_LONG[p.month-1]} ${p.year}</p>
  <p style="font-size:10px;margin-top:3px">Status: ${p.status}</p></div>
</div>
<div class="net"><p style="margin:0;font-size:11px;color:#666">Net Salary</p><span>₹${Math.round(p.netSalary).toLocaleString("en-IN")}</span></div>
<div class="body">
<div class="g2">
  <div><h3>Earnings</h3>
    ${[["Basic",p.basicSalary],["DA",p.da],["Washing",p.washing],["Conveyance",p.conveyance],["LWW",p.lwwEarned],["OT Pay",p.overtimePay],["Bonus",p.bonus]]
        .filter(([,v])=>Number(v)>0).map(([l,v])=>`<div class="row"><span>${l}</span><span>₹${Math.round(Number(v)).toLocaleString("en-IN")}</span></div>`).join("")}
    <div class="row tot"><span>Gross</span><span style="color:#1a9e6e">₹${Math.round(p.grossSalary).toLocaleString("en-IN")}</span></div>
  </div>
  <div><h3>Deductions</h3>
    ${[["PF (Employee)",p.pfEmployee],["ESIC",p.esiEmployee],["PT",p.pt],["LWF",p.lwf],["Canteen",p.canteen],["Penalty",p.penalty],["Advance",p.advance],["Other",p.otherDeductions]]
        .filter(([,v])=>Number(v)>0).map(([l,v])=>`<div class="row"><span>${l}</span><span style="color:#dc2626">-₹${Math.round(Number(v)).toLocaleString("en-IN")}</span></div>`).join("")}
    <div class="row tot"><span>Total Deductions</span><span style="color:#dc2626">-₹${Math.round(p.totalDeductions).toLocaleString("en-IN")}</span></div>
  </div>
</div>
<div class="att">
  <div><p class="v">${p.workingDays ?? 0}</p><p class="l">Work Days</p></div>
  <div><p class="v">${p.presentDays ?? 0}</p><p class="l">Present</p></div>
  <div><p class="v">${(p.workingDays ?? 0) - (p.presentDays ?? 0)}</p><p class="l">LOP Days</p></div>
  <div><p class="v">${p.overtimeHrs ?? 0}</p><p class="l">OT Hrs</p></div>
</div>
<div class="foot">
  <span>Employer PF: ₹${Math.round(p.pfEmployer).toLocaleString("en-IN")} | Employer ESI: ₹${Math.round(p.esiEmployer).toLocaleString("en-IN")}</span>
  ${p.ctc ? `<span>CTC: ₹${Math.round(p.ctc).toLocaleString("en-IN")}</span>` : ""}
</div>
</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`)
        w.document.close()
    }

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
