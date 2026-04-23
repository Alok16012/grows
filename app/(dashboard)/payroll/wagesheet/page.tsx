"use client"
import { Suspense, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, RefreshCw, ChevronRight, MapPin, Building2, Search, FileSpreadsheet } from "lucide-react"
import * as XLSX from "xlsx"

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const fmt  = (n: number) => n ? "₹" + Math.round(n).toLocaleString("en-IN") : "—"
const fmtN = (n: number) => Math.round(n).toLocaleString("en-IN")

type Site    = { id: string; name: string; code?: string }
type SiteStatus = { siteId: string | null; processedCount: number }
type Payroll = {
    id: string; month: number; year: number; status: string
    basicSalary: number; da: number; washing: number; conveyance: number
    lwwEarned: number; overtimePay: number; grossSalary: number
    pfEmployee: number; esiEmployee: number; pt: number; lwf: number
    canteen: number; penalty: number; advance: number; otherDeductions: number
    totalDeductions: number; netSalary: number
    workingDays: number | null; presentDays: number | null
    employee: { employeeId: string; firstName: string; lastName: string; designation: string | null }
}

function WageSheetInner() {
    const router = useRouter()
    const [month,   setMonth]   = useState(String(new Date().getMonth() + 1))
    const [year,    setYear]    = useState(String(new Date().getFullYear()))
    const [sites,   setSites]   = useState<Site[]>([])
    const [status,  setStatus]  = useState<SiteStatus[]>([])
    const [selId,   setSelId]   = useState("")
    const [data,    setData]    = useState<Payroll[]>([])
    const [search,  setSearch]  = useState("")
    const [ldSites, setLdSites] = useState(true)
    const [ldData,  setLdData]  = useState(false)

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

    const fetchData = useCallback(async (siteId: string) => {
        setLdData(true); setData([])
        try {
            const r = await fetch(`/api/payroll?siteId=${siteId}&month=${month}&year=${year}`)
            if (!r.ok) throw new Error(await r.text())
            const d = await r.json()
            setData(Array.isArray(d) ? d : [])
        } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed") }
        finally { setLdData(false) }
    }, [month, year])

    const selectSite = (id: string) => {
        setSelId(id); setSearch("")
        if (id) fetchData(id); else setData([])
    }

    const handleExport = () => {
        if (!data.length) return
        const rows = data.map((p, i) => ({
            "SL": i + 1,
            "Emp ID": p.employee.employeeId,
            "Name": `${p.employee.firstName} ${p.employee.lastName}`,
            "Designation": p.employee.designation ?? "",
            "Work Days": p.workingDays ?? 0,
            "Present Days": p.presentDays ?? 0,
            "Basic (₹)": Math.round(p.basicSalary),
            "DA (₹)": Math.round(p.da),
            "Washing (₹)": Math.round(p.washing),
            "Conveyance (₹)": Math.round(p.conveyance),
            "OT Pay (₹)": Math.round(p.overtimePay),
            "Gross (₹)": Math.round(p.grossSalary),
            "PF Employee (₹)": Math.round(p.pfEmployee),
            "ESI Employee (₹)": Math.round(p.esiEmployee),
            "PT (₹)": Math.round(p.pt),
            "LWF (₹)": Math.round(p.lwf),
            "Canteen (₹)": Math.round(p.canteen),
            "Penalty (₹)": Math.round(p.penalty),
            "Advance (₹)": Math.round(p.advance),
            "Other Deductions (₹)": Math.round(p.otherDeductions),
            "Total Deductions (₹)": Math.round(p.totalDeductions),
            "Net Pay (₹)": Math.round(p.netSalary),
            "Status": p.status,
        }))
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.json_to_sheet(rows)
        ws["!cols"] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 14) }))
        const site = sites.find(s => s.id === selId)
        XLSX.utils.book_append_sheet(wb, ws, "Wage Sheet")
        XLSX.writeFile(wb, `WageSheet_${site?.name ?? "Site"}_${MONTHS[parseInt(month)-1]}_${year}.xlsx`)
    }

    const filtered      = data.filter(p => !search ||
        `${p.employee.firstName} ${p.employee.lastName} ${p.employee.employeeId}`.toLowerCase().includes(search.toLowerCase()))
    const selSite       = sites.find(s => s.id === selId)
    const getSt         = (id: string) => status.find(s => s.siteId === id)
    const done          = status.filter(s => (s.processedCount ?? 0) > 0).length
    const processedSites = sites.filter(s => (getSt(s.id)?.processedCount ?? 0) > 0)

    const totals = {
        gross: data.reduce((s, p) => s + p.grossSalary, 0),
        net:   data.reduce((s, p) => s + p.netSalary,   0),
        ded:   data.reduce((s, p) => s + p.totalDeductions, 0),
        pf:    data.reduce((s, p) => s + p.pfEmployee,  0),
        esi:   data.reduce((s, p) => s + p.esiEmployee, 0),
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 32 }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)" }}>
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll")}>Payroll</span>
                <ChevronRight size={11} />
                <span style={{ fontWeight: 600, color: "var(--text2)" }}>Wage Sheet</span>
            </div>

            {/* Title */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>Site Wise Wage Sheet</h1>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>{done}/{sites.length} sites processed</span>
            </div>

            {/* Stepper */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, overflowX: "auto", whiteSpace: "nowrap", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
                {["Upload Attendance","Process Payroll","Wage Sheet","Compliance","Lock Payroll"].map((s, i) => (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7,
                            background: i === 2 ? "var(--accent-light)" : "transparent",
                            color: i === 2 ? "var(--accent)" : "var(--text3)", fontSize: 12, fontWeight: i === 2 ? 700 : 400 }}>
                            <div style={{ width: 18, height: 18, borderRadius: 4, background: i === 2 ? "var(--accent)" : "var(--border)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: i === 2 ? "#fff" : "var(--text3)", fontSize: 10, fontWeight: 700 }}>{i+1}</div>
                            {s}
                        </div>
                        {i < 4 && <ChevronRight size={11} style={{ color: "var(--text3)", opacity: 0.3 }} />}
                    </div>
                ))}
            </div>

            {/* Month/Year */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 16px" }}>
                <span style={lbl}>Month</span>
                <select value={month} onChange={e => { setMonth(e.target.value); setSelId(""); setData([]) }} style={sel}>
                    {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
                <span style={lbl}>Year</span>
                <select value={year} onChange={e => { setYear(e.target.value); setSelId(""); setData([]) }} style={sel}>
                    {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={fetchStatus} style={{ marginLeft: "auto", display: "flex", padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "none", cursor: "pointer" }}>
                    <RefreshCw size={12} style={{ color: "var(--text3)" }} />
                </button>
            </div>

            {/* Two-panel */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {/* LEFT */}
                <div style={{ width: 256, flexShrink: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)" }}>Sites</span>
                        <span style={{ fontSize: 10, color: "var(--text3)", background: "var(--surface2)", borderRadius: 10, padding: "2px 7px" }}>{processedSites.length}</span>
                    </div>
                    <div style={{ overflowY: "auto", maxHeight: 520 }}>
                        {ldSites ? <div style={{ padding: 24, textAlign: "center" }}><Loader2 size={16} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} /></div> : (
                            <>
                                <div onClick={() => selectSite("")}
                                    style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                                        background: !selId ? "var(--accent-light)" : "transparent",
                                        borderLeft: !selId ? "3px solid var(--accent)" : "3px solid transparent" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                        <Building2 size={13} style={{ color: !selId ? "var(--accent)" : "var(--text3)" }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: !selId ? "var(--accent)" : "var(--text2)" }}>All Sites</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2, marginLeft: 20 }}>{done}/{processedSites.length} processed</div>
                                </div>
                                {processedSites.map(site => {
                                    const st = getSt(site.id); const isDone = (st?.processedCount ?? 0) > 0; const isSel = selId === site.id
                                    return (
                                        <div key={site.id} onClick={() => selectSite(site.id)}
                                            style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                                                background: isSel ? "var(--accent-light)" : "transparent",
                                                borderLeft: isSel ? "3px solid var(--accent)" : "3px solid transparent" }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                                    <MapPin size={12} style={{ color: isSel ? "var(--accent)" : "var(--text3)", flexShrink: 0 }} />
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: isSel ? "var(--accent)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{site.name}</span>
                                                </div>
                                                <span style={{ padding: "1px 6px", borderRadius: 20, fontSize: 9, fontWeight: 700, whiteSpace: "nowrap",
                                                    background: isDone ? "#dcfce7" : "#fef9c3", color: isDone ? "#15803d" : "#854d0e" }}>
                                                    {isDone ? "✓" : "—"}
                                                </span>
                                            </div>
                                            {site.code && <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2, marginLeft: 18 }}>{site.code}</div>}
                                        </div>
                                    )
                                })}
                            </>
                        )}
                    </div>
                </div>

                {/* RIGHT */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {!selId ? (
                        <>
                            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
                                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 3px 0" }}>{MONTHS[parseInt(month)-1]} {year} — Wage Sheet Overview</p>
                                <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>Select a site to view its wage sheet and export to Excel.</p>
                            </div>
                            {processedSites.length === 0 ? (
                                <div style={{ padding: 40, textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
                                    <MapPin size={28} style={{ color: "var(--text3)", opacity: 0.3, margin: "0 auto 8px" }} />
                                    <p style={{ fontSize: 13, color: "var(--text3)", margin: 0 }}>No payroll processed for this period yet</p>
                                </div>
                            ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                                {processedSites.map(site => {
                                    const st = getSt(site.id); const isDone = (st?.processedCount ?? 0) > 0
                                    return (
                                        <div key={site.id} onClick={() => selectSite(site.id)}
                                            style={{ padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                                                border: `1px solid ${isDone ? "#86efac" : "var(--border)"}`,
                                                background: isDone ? "#f0fdf4" : "var(--surface)" }}
                                            onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.07)")}
                                            onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <MapPin size={13} style={{ color: isDone ? "#16a34a" : "var(--accent)", flexShrink: 0 }} />
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{site.name}</span>
                                                </div>
                                                <span style={{ padding: "2px 7px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: isDone ? "#dcfce7" : "#fef9c3", color: isDone ? "#15803d" : "#854d0e", whiteSpace: "nowrap" }}>
                                                    {isDone ? "✓ Done" : "No Data"}
                                                </span>
                                            </div>
                                            <div style={{ marginTop: 10, fontSize: 11, color: isDone ? "#15803d" : "var(--text3)", fontWeight: isDone ? 600 : 400 }}>
                                                {isDone ? `${st!.processedCount} employees` : "Not yet processed"}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Site header */}
                            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <MapPin size={15} style={{ color: "var(--accent)" }} />
                                    <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{selSite?.name}</span>
                                    {selSite?.code && <span style={{ fontSize: 11, color: "var(--text3)" }}>{selSite.code}</span>}
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => fetchData(selId)} disabled={ldData}
                                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "none", fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                                        <RefreshCw size={12} className={ldData ? "animate-spin" : ""} /> Refresh
                                    </button>
                                    <button onClick={handleExport} disabled={!data.length}
                                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: !data.length ? 0.5 : 1 }}>
                                        <FileSpreadsheet size={13} /> Export Excel
                                    </button>
                                </div>
                            </div>

                            {/* Stat cards */}
                            {data.length > 0 && (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                                    {[
                                        { label: "Employees",    value: String(data.length),  color: "#3b82f6" },
                                        { label: "Total Gross",  value: fmt(totals.gross),    color: "#0369a1" },
                                        { label: "Deductions",   value: fmt(totals.ded),      color: "#dc2626" },
                                        { label: "Net Payable",  value: fmt(totals.net),      color: "#16a34a" },
                                    ].map(s => (
                                        <div key={s.label} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
                                            <p style={{ fontSize: 9, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", margin: 0 }}>{s.label}</p>
                                            <p style={{ fontSize: 14, fontWeight: 700, color: s.color, margin: "2px 0 0 0" }}>{s.value}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Table */}
                            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                                <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                                    <Search size={13} style={{ color: "var(--text3)", flexShrink: 0 }} />
                                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…"
                                        style={{ flex: 1, border: "none", outline: "none", fontSize: 12, background: "transparent", color: "var(--text)" }} />
                                    <span style={{ fontSize: 11, color: "var(--text3)", whiteSpace: "nowrap" }}>{filtered.length}/{data.length}</span>
                                </div>
                                <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                                                <th style={th} rowSpan={2}>#</th>
                                                <th style={th} rowSpan={2}>Emp ID</th>
                                                <th style={{ ...th, textAlign: "left" }} rowSpan={2}>Name</th>
                                                <th style={th} rowSpan={2}>Desig.</th>
                                                <th style={th} rowSpan={2}>P.Days</th>
                                                <th style={{ ...th, background: "#eff6ff", color: "#1d4ed8" }} colSpan={6}>Earnings (₹)</th>
                                                <th style={{ ...th, background: "#fef2f2", color: "#dc2626" }} colSpan={7}>Deductions (₹)</th>
                                                <th style={{ ...th, background: "#f0fdf4", color: "#16a34a" }} rowSpan={2}>Net Pay</th>
                                            </tr>
                                            <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                                                {["Basic","DA","Wash","Conv.","OT","Gross"].map(h => <th key={h} style={{ ...th, background: "#eff6ff" }}>{h}</th>)}
                                                {["PF","ESI","PT","LWF","Canteen","Penalty","Adv."].map(h => <th key={h} style={{ ...th, background: "#fef2f2" }}>{h}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ldData ? (
                                                <tr><td colSpan={19} style={{ padding: "40px 0", textAlign: "center" }}>
                                                    <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} />
                                                </td></tr>
                                            ) : filtered.length === 0 ? (
                                                <tr><td colSpan={19} style={{ padding: "30px", textAlign: "center", color: "var(--text3)", fontSize: 12 }}>
                                                    {data.length === 0 ? "No processed payroll records found for this site and period" : "No results match your search"}
                                                </td></tr>
                                            ) : filtered.map((p, i) => (
                                                <tr key={p.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                                                    <td style={td}>{i+1}</td>
                                                    <td style={{ ...td, color: "var(--accent)", fontWeight: 700 }}>{p.employee.employeeId}</td>
                                                    <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{p.employee.firstName} {p.employee.lastName}</td>
                                                    <td style={{ ...td, fontSize: 10, color: "var(--text3)" }}>{p.employee.designation || "—"}</td>
                                                    <td style={td}>{p.presentDays ?? "—"}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmtN(p.basicSalary)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmtN(p.da)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmtN(p.washing)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmtN(p.conveyance)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmtN(p.overtimePay)}</td>
                                                    <td style={{ ...td, background: "#eff6ff", fontWeight: 700, color: "#1d4ed8" }}>{fmtN(p.grossSalary)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.pfEmployee)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.esiEmployee)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.pt)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.lwf)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.canteen)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.penalty)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.advance)}</td>
                                                    <td style={{ ...td, background: "#f0fdf4", fontWeight: 700, color: "#16a34a" }}>{fmtN(p.netSalary)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {data.length > 0 && (
                                            <tfoot>
                                                <tr style={{ background: "var(--surface2)", borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                                                    <td colSpan={5} style={{ ...td, textAlign: "right", fontSize: 10, color: "var(--text3)", textTransform: "uppercase" }}>Total ({data.length})</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmt(data.reduce((s,p)=>s+p.basicSalary,0))}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmt(data.reduce((s,p)=>s+p.da,0))}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmt(data.reduce((s,p)=>s+p.washing,0))}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmt(data.reduce((s,p)=>s+p.conveyance,0))}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmt(data.reduce((s,p)=>s+p.overtimePay,0))}</td>
                                                    <td style={{ ...td, background: "#eff6ff", color: "#1d4ed8" }}>{fmt(totals.gross)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(totals.pf)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(totals.esi)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(data.reduce((s,p)=>s+p.pt,0))}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(data.reduce((s,p)=>s+p.lwf,0))}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(data.reduce((s,p)=>s+p.canteen,0))}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(data.reduce((s,p)=>s+p.penalty,0))}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(data.reduce((s,p)=>s+p.advance,0))}</td>
                                                    <td style={{ ...td, background: "#f0fdf4", color: "#16a34a" }}>{fmt(totals.net)}</td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function WageSheetPage() {
    return <Suspense><WageSheetInner /></Suspense>
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap" }
const sel: React.CSSProperties = { padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }
const th:  React.CSSProperties = { padding: "7px 9px", fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px", textAlign: "center", whiteSpace: "nowrap" }
const td:  React.CSSProperties = { padding: "5px 9px", textAlign: "center", color: "var(--text)", whiteSpace: "nowrap" }
