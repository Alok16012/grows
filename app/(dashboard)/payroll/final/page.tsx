"use client"
import { Suspense, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Lock, RefreshCw, ChevronRight, MapPin, Building2, CheckCircle2, AlertCircle, Download } from "lucide-react"
import * as XLSX from "xlsx"

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const fmt = (n: number) => n ? "₹" + Math.round(n).toLocaleString("en-IN") : "—"

type Site    = { id: string; name: string; code?: string }
type SiteStatus = { siteId: string | null; processedCount: number }
type Payroll = {
    id: string; status: string; grossSalary: number; netSalary: number; totalDeductions: number
    workingDays: number | null; presentDays: number | null
    employee: { employeeId: string; firstName: string; lastName: string; designation: string | null }
}

function FinalPayrollInner() {
    const router = useRouter()
    const [month,    setMonth]    = useState(String(new Date().getMonth() + 1))
    const [year,     setYear]     = useState(String(new Date().getFullYear()))
    const [sites,    setSites]    = useState<Site[]>([])
    const [status,   setStatus]   = useState<SiteStatus[]>([])
    const [selId,    setSelId]    = useState("")
    const [data,     setData]     = useState<Payroll[]>([])
    const [ldSites,  setLdSites]  = useState(true)
    const [ldData,   setLdData]   = useState(false)
    const [locking,  setLocking]  = useState(false)
    const [lockAll,  setLockAll]  = useState(false)
    const [confirm,  setConfirm]  = useState(false)

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
            const d = await r.json(); setData(Array.isArray(d) ? d : [])
        } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed") }
        finally { setLdData(false) }
    }, [month, year])

    const selectSite = (id: string) => {
        setSelId(id); setConfirm(false)
        if (id) fetchData(id); else setData([])
    }

    const handleLock = async (all: boolean) => {
        setLocking(true)
        try {
            const siteIds = all ? sites.map(s => s.id) : [selId]
            const res = await fetch("/api/payroll/final/lock", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month: parseInt(month), year: parseInt(year), siteIds })
            })
            if (!res.ok) throw new Error(await res.text())
            const result = await res.json()
            toast.success(result.message ?? "Payroll locked successfully")
            await fetchStatus()
            if (selId) fetchData(selId)
            setConfirm(false)
        } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Lock failed") }
        finally { setLocking(false) }
    }

    const handleExport = () => {
        if (!data.length) return
        const rows = data.map((p, i) => ({
            "SL": i+1,
            "Emp ID": p.employee.employeeId,
            "Name": `${p.employee.firstName} ${p.employee.lastName}`,
            "Gross (₹)": Math.round(p.grossSalary),
            "Deductions (₹)": Math.round(p.totalDeductions),
            "Net Pay (₹)": Math.round(p.netSalary),
            "Status": p.status,
        }))
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.json_to_sheet(rows)
        ws["!cols"] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 14) }))
        XLSX.utils.book_append_sheet(wb, ws, "Final Payroll")
        XLSX.writeFile(wb, `FinalPayroll_${sites.find(s=>s.id===selId)?.name ?? "All"}_${MONTHS[parseInt(month)-1]}_${year}.xlsx`)
    }

    const selSite  = sites.find(s => s.id === selId)
    const getSt    = (id: string) => status.find(s => s.siteId === id)
    const done     = status.filter(s => (s.processedCount ?? 0) > 0).length
    const siteData = { draft: data.filter(p => p.status === "DRAFT").length, processed: data.filter(p => p.status === "PROCESSED").length }
    const totGross = data.reduce((s, p) => s + p.grossSalary, 0)
    const totNet   = data.reduce((s, p) => s + p.netSalary, 0)

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)" }}>
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll")}>Payroll</span>
                <ChevronRight size={11} />
                <span style={{ fontWeight: 600, color: "var(--text2)" }}>Final Payroll & Lock</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>Final Payroll Review & Lock</h1>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>{done}/{sites.length} sites processed</span>
            </div>

            {/* Stepper */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, overflowX: "auto", whiteSpace: "nowrap", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
                {["Upload Attendance","Process Payroll","Wage Sheet","Compliance","Lock Payroll"].map((s, i) => (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7,
                            background: i === 4 ? "var(--accent-light)" : "transparent",
                            color: i === 4 ? "var(--accent)" : "var(--text3)", fontSize: 12, fontWeight: i === 4 ? 700 : 400 }}>
                            <div style={{ width: 18, height: 18, borderRadius: 4, background: i === 4 ? "var(--accent)" : "var(--border)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: i === 4 ? "#fff" : "var(--text3)", fontSize: 10, fontWeight: 700 }}>{i+1}</div>
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
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    {done === sites.length && sites.length > 0 && !confirm && (
                        <button onClick={() => { setConfirm(true); setLockAll(true) }}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#1d4ed8", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            <Lock size={13} /> Lock All Sites
                        </button>
                    )}
                    <button onClick={fetchStatus} style={{ display: "flex", padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "none", cursor: "pointer" }}>
                        <RefreshCw size={12} style={{ color: "var(--text3)" }} />
                    </button>
                </div>
            </div>

            {/* Two-panel */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {/* LEFT */}
                <div style={{ width: 256, flexShrink: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)" }}>Sites</span>
                        <span style={{ fontSize: 10, color: "var(--text3)", background: "var(--surface2)", borderRadius: 10, padding: "2px 7px" }}>{sites.length}</span>
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
                                        <span style={{ fontSize: 12, fontWeight: 700, color: !selId ? "var(--accent)" : "var(--text2)" }}>All Sites Overview</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2, marginLeft: 20 }}>{done}/{sites.length} processed</div>
                                </div>
                                {sites.map(site => {
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
                                                {isDone
                                                    ? <CheckCircle2 size={13} style={{ color: "#16a34a", flexShrink: 0 }} />
                                                    : <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#d1d5db", flexShrink: 0 }} />}
                                            </div>
                                            <div style={{ fontSize: 10, marginTop: 2, marginLeft: 18 }}>
                                                {isDone ? <span style={{ color: "#16a34a", fontWeight: 600 }}>{st!.processedCount} records</span>
                                                    : <span style={{ color: "#f59e0b", fontWeight: 600 }}>Not processed</span>}
                                            </div>
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
                                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 3px 0" }}>{MONTHS[parseInt(month)-1]} {year} — Final Payroll</p>
                                <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>Select a site to review and lock its payroll. All sites must be processed before locking.</p>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                                {sites.map(site => {
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
                                                    {isDone ? "Ready" : "Pending"}
                                                </span>
                                            </div>
                                            <div style={{ marginTop: 10, fontSize: 11, color: isDone ? "#15803d" : "var(--text3)", fontWeight: isDone ? 600 : 400 }}>
                                                {isDone ? `${st!.processedCount} employees` : "Process payroll first"}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Site header */}
                            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
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
                                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "none", fontSize: 12, color: "var(--text2)", cursor: "pointer", opacity: !data.length ? 0.5 : 1 }}>
                                        <Download size={12} /> Export
                                    </button>
                                    {!confirm ? (
                                        <button onClick={() => { setConfirm(true); setLockAll(false) }} disabled={!data.length || ldData}
                                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#1d4ed8", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: (!data.length || ldData) ? 0.5 : 1 }}>
                                            <Lock size={13} /> Lock This Site
                                        </button>
                                    ) : (
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ fontSize: 11, color: "#854d0e", fontWeight: 600 }}>Confirm lock?</span>
                                            <button onClick={() => handleLock(lockAll)} disabled={locking}
                                                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                                {locking ? <Loader2 size={12} className="animate-spin" /> : <Lock size={11} />}
                                                {locking ? "Locking…" : "Yes, Lock"}
                                            </button>
                                            <button onClick={() => setConfirm(false)}
                                                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "none", fontSize: 11, cursor: "pointer", color: "var(--text2)" }}>
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Stats */}
                            {data.length > 0 && (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                                    {[
                                        { label: "Employees",    value: String(data.length),  color: "#3b82f6" },
                                        { label: "Total Gross",  value: fmt(totGross),         color: "#0369a1" },
                                        { label: "Total Net",    value: fmt(totNet),           color: "#16a34a" },
                                        { label: "DRAFT / Ready",value: `${siteData.draft} / ${siteData.processed}`, color: siteData.draft > 0 ? "#f59e0b" : "#16a34a" },
                                    ].map(s => (
                                        <div key={s.label} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
                                            <p style={{ fontSize: 9, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", margin: 0 }}>{s.label}</p>
                                            <p style={{ fontSize: 14, fontWeight: 700, color: s.color, margin: "2px 0 0 0" }}>{s.value}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {confirm && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "#fef3c7", border: "1px solid #fcd34d" }}>
                                    <AlertCircle size={14} style={{ color: "#92400e", flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, color: "#92400e" }}>
                                        You are about to lock payroll for <b>{lockAll ? "ALL sites" : selSite?.name}</b> for {MONTHS[parseInt(month)-1]} {year}. This action marks {data.filter(p=>p.status==="DRAFT").length} DRAFT records as PROCESSED and cannot be undone.
                                    </span>
                                </div>
                            )}

                            {/* Table */}
                            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                                <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                                                <th style={th}>#</th>
                                                <th style={th}>Emp ID</th>
                                                <th style={{ ...th, textAlign: "left" }}>Name</th>
                                                <th style={th}>Designation</th>
                                                <th style={th}>Present Days</th>
                                                <th style={{ ...th, color: "#0369a1" }}>Gross (₹)</th>
                                                <th style={{ ...th, color: "#dc2626" }}>Deductions (₹)</th>
                                                <th style={{ ...th, color: "#16a34a" }}>Net Pay (₹)</th>
                                                <th style={th}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ldData ? (
                                                <tr><td colSpan={9} style={{ padding: "40px 0", textAlign: "center" }}>
                                                    <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} />
                                                </td></tr>
                                            ) : data.length === 0 ? (
                                                <tr><td colSpan={9} style={{ padding: "30px", textAlign: "center", color: "var(--text3)", fontSize: 12 }}>
                                                    No payroll records for this site and period. Process payroll first.
                                                </td></tr>
                                            ) : data.map((p, i) => (
                                                <tr key={p.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                                                    <td style={td}>{i+1}</td>
                                                    <td style={{ ...td, color: "var(--accent)", fontWeight: 700 }}>{p.employee.employeeId}</td>
                                                    <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{p.employee.firstName} {p.employee.lastName}</td>
                                                    <td style={{ ...td, fontSize: 10, color: "var(--text3)" }}>{p.employee.designation || "—"}</td>
                                                    <td style={td}>{p.presentDays ?? "—"}</td>
                                                    <td style={{ ...td, fontWeight: 700, color: "#0369a1" }}>₹{Math.round(p.grossSalary).toLocaleString("en-IN")}</td>
                                                    <td style={{ ...td, color: "#dc2626" }}>₹{Math.round(p.totalDeductions).toLocaleString("en-IN")}</td>
                                                    <td style={{ ...td, fontWeight: 700, color: "#16a34a" }}>₹{Math.round(p.netSalary).toLocaleString("en-IN")}</td>
                                                    <td style={td}>
                                                        <span style={{ padding: "2px 7px", borderRadius: 20, fontSize: 9, fontWeight: 700,
                                                            background: p.status === "PROCESSED" ? "#dcfce7" : p.status === "DRAFT" ? "#fef9c3" : "#dbeafe",
                                                            color: p.status === "PROCESSED" ? "#15803d" : p.status === "DRAFT" ? "#854d0e" : "#1d4ed8" }}>
                                                            {p.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {data.length > 0 && (
                                            <tfoot>
                                                <tr style={{ background: "var(--surface2)", borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                                                    <td colSpan={5} style={{ ...td, textAlign: "right", fontSize: 10, color: "var(--text3)", textTransform: "uppercase" }}>Total ({data.length})</td>
                                                    <td style={{ ...td, color: "#0369a1" }}>{fmt(totGross)}</td>
                                                    <td style={{ ...td, color: "#dc2626" }}>{fmt(data.reduce((s,p)=>s+p.totalDeductions,0))}</td>
                                                    <td style={{ ...td, color: "#16a34a" }}>{fmt(totNet)}</td>
                                                    <td />
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

export default function FinalPayrollPage() {
    return <Suspense><FinalPayrollInner /></Suspense>
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap" }
const sel: React.CSSProperties = { padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }
const th:  React.CSSProperties = { padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center", whiteSpace: "nowrap" }
const td:  React.CSSProperties = { padding: "6px 10px", textAlign: "center", color: "var(--text)", whiteSpace: "nowrap" }
