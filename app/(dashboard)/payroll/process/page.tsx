"use client"
import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
    Loader2, Search, Play, RefreshCw, ChevronRight,
    AlertCircle, CheckCircle2, Users
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
type Site = { id: string; name: string; code?: string; city?: string; _count?: { deployments: number } }

type Employee = {
    id: string; employeeId: string; firstName: string; lastName: string; designation?: string; gender?: string
    employeeSalary?: {
        basic: number; da: number; washing: number; conveyance: number
        leaveWithWages: number; otherAllowance: number; complianceType?: string; status?: string
    } | null
}

type AttRow = {
    employeeId: string; monthDays: number; workedDays: number; otDays: number
    canteenDays: number; penalty: number; advance: number; otherDeductions: number
    productionIncentive: number; lwf: number
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const fmt = (n: number) => n ? "₹" + Math.round(n).toLocaleString("en-IN") : "—"

export default function ProcessPayrollPage() {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [month, setMonth] = useState(String(searchParams.get("month") ?? new Date().getMonth() + 1))
    const [year,  setYear]  = useState(String(searchParams.get("year")  ?? new Date().getFullYear()))
    const [siteId, setSiteId] = useState("")
    const [sites, setSites] = useState<Site[]>([])
    const [employees, setEmployees] = useState<Employee[]>([])
    const [attRows, setAttRows] = useState<Record<string, Partial<AttRow>>>({})
    const [loading, setLoading] = useState(false)
    const [processing, setProcessing] = useState(false)
    const [search, setSearch] = useState("")
    const [fetched, setFetched] = useState(false)

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
    }, [])

    const fetchData = useCallback(async () => {
        if (!siteId) { toast.error("Select a site first"); return }
        setLoading(true)
        setFetched(false)
        try {
            const res = await fetch(`/api/employees?siteId=${siteId}&status=ACTIVE`)
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            setEmployees(Array.isArray(data) ? data : [])
            setFetched(true)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to fetch employees")
        } finally {
            setLoading(false)
        }
    }, [siteId])

    const setAtt = (empId: string, field: keyof AttRow, value: string) => {
        setAttRows(prev => ({
            ...prev,
            [empId]: { ...prev[empId], [field]: parseFloat(value) || 0 }
        }))
    }

    const defaultDays = new Date(parseInt(year), parseInt(month), 0).getDate()

    const handleProcess = async () => {
        if (!siteId) { toast.error("Select a site"); return }
        if (employees.length === 0) { toast.error("No employees loaded — click Fetch first"); return }

        const eligibleEmps = employees.filter(e => e.employeeSalary?.status === "APPROVED")
        if (eligibleEmps.length === 0) {
            toast.error("No employees have approved salary structures")
            return
        }

        setProcessing(true)
        try {
            const attendance = eligibleEmps.map(emp => {
                const att = attRows[emp.id] ?? {}
                return {
                    employeeId: emp.id,
                    monthDays:   att.monthDays  ?? defaultDays,
                    workedDays:  att.workedDays ?? defaultDays,
                    otDays:              att.otDays              ?? 0,
                    canteenDays:         att.canteenDays         ?? 0,
                    penalty:             att.penalty             ?? 0,
                    advance:             att.advance             ?? 0,
                    otherDeductions:     att.otherDeductions     ?? 0,
                    productionIncentive: att.productionIncentive ?? 0,
                    lwf:                 att.lwf                 ?? 0,
                }
            })

            const res = await fetch("/api/payroll/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ siteId, month: parseInt(month), year: parseInt(year), attendance })
            })

            if (!res.ok) throw new Error(await res.text())
            const result = await res.json()
            toast.success(`Processed ${result.processedCount} employees${result.failedCount > 0 ? ` (${result.failedCount} failed)` : ""}`)
            router.push("/payroll")
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Process failed")
        } finally {
            setProcessing(false)
        }
    }

    const filtered = employees.filter(e =>
        !search || `${e.firstName} ${e.lastName} ${e.employeeId}`.toLowerCase().includes(search.toLowerCase())
    )

    const selectedSite = sites.find(s => s.id === siteId)

    // Compute totals from salary structures
    const totalBasic = employees.reduce((s, e) => s + (e.employeeSalary?.basic ?? 0), 0)
    const totalGrossEst = employees.reduce((s, e) => {
        const sal = e.employeeSalary
        if (!sal) return s
        return s + sal.basic + sal.da + sal.washing + sal.conveyance + sal.leaveWithWages + sal.otherAllowance
    }, 0)
    const approvedCount = employees.filter(e => e.employeeSalary?.status === "APPROVED").length

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingBottom: 32 }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)" }}>
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll")}>Payroll</span>
                <ChevronRight size={11} />
                <span style={{ fontWeight: 600, color: "var(--text2)" }}>Process Payroll</span>
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>Process Payroll — Site Wise</h1>
                    <p style={{ fontSize: 12, color: "var(--text3)", margin: "3px 0 0 0" }}>
                        Calculate wages for employees deployed at a site
                    </p>
                </div>
            </div>

            {/* Stepper */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", overflowX: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                    {["Upload Attendance","Process Payroll","Wage Sheet","Compliance Reports","Lock Payroll"].map((s, i) => (
                        <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8,
                                background: i === 1 ? "var(--accent-light)" : "transparent",
                                border: i === 1 ? "1px solid var(--accent)30" : "transparent",
                                color: i === 1 ? "var(--accent)" : "var(--text3)", fontSize: 12, fontWeight: i === 1 ? 700 : 500 }}>
                                <div style={{ width: 20, height: 20, borderRadius: 5, background: i === 1 ? "var(--accent)" : "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: i === 1 ? "#fff" : "var(--text3)", fontSize: 10, fontWeight: 700 }}>
                                    {i + 1}
                                </div>
                                {s}
                            </div>
                            {i < 4 && <ChevronRight size={12} style={{ color: "var(--text3)", opacity: 0.3 }} />}
                        </div>
                    ))}
                </div>
            </div>

            {/* Controls */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px" }}>
                <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 5 }}>Month *</label>
                    <select value={month} onChange={e => { setMonth(e.target.value); setFetched(false) }}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text)", outline: "none" }}>
                        {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 5 }}>Year *</label>
                    <select value={year} onChange={e => { setYear(e.target.value); setFetched(false) }}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text)", outline: "none" }}>
                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 5 }}>Site *</label>
                    <select value={siteId} onChange={e => { setSiteId(e.target.value); setFetched(false) }}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text)", outline: "none", fontWeight: 600 }}>
                        <option value="">— Select Site —</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>)}
                    </select>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <button onClick={fetchData} disabled={loading || !siteId}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: (!siteId || loading) ? 0.6 : 1, whiteSpace: "nowrap" }}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                        Fetch Employees
                    </button>
                </div>
            </div>

            {/* Stats cards (shown after fetch) */}
            {fetched && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                    {[
                        { label: "Site",              value: selectedSite?.name ?? "—",   color: "#6b7280" },
                        { label: "Deployed Staff",    value: String(employees.length),    color: "#3b82f6" },
                        { label: "Salary Approved",   value: `${approvedCount} / ${employees.length}`, color: approvedCount < employees.length ? "#f59e0b" : "#16a34a" },
                        { label: "Est. Gross (Full)", value: fmt(totalGrossEst),           color: "#0369a1" },
                        { label: "Total Basic",       value: fmt(totalBasic),              color: "#7c3aed" },
                    ].map(s => (
                        <div key={s.label} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)" }}>
                            <p style={{ fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", margin: 0 }}>{s.label}</p>
                            <p style={{ fontSize: 15, fontWeight: 700, color: s.color, margin: "3px 0 0 0" }}>{s.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Employee table */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>
                            {fetched ? `${employees.length} Employee${employees.length !== 1 ? "s" : ""} at ${selectedSite?.name ?? "site"}` : "Employees"}
                        </p>
                        {fetched && approvedCount < employees.length && (
                            <span style={{ fontSize: 10, background: "#fef9c3", color: "#a16207", border: "1px solid #fde047", borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>
                                {employees.length - approvedCount} without approved salary
                            </span>
                        )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ position: "relative" }}>
                            <Search size={13} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                                style={{ padding: "6px 10px 6px 26px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, outline: "none", background: "var(--surface)", color: "var(--text)", width: 180 }} />
                        </div>
                        <button onClick={fetchData} disabled={loading}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "none", fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button onClick={handleProcess} disabled={processing || employees.length === 0}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: (processing || employees.length === 0) ? 0.6 : 1 }}>
                            {processing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                            {processing ? "Processing…" : "Process Payroll"}
                        </button>
                    </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                                <th style={th}>SL</th>
                                <th style={th}>Emp ID</th>
                                <th style={{ ...th, textAlign: "left" }}>Name / Designation</th>
                                <th style={th}>Basic</th>
                                <th style={th}>DA</th>
                                <th style={th}>Washing</th>
                                <th style={th}>Conv.</th>
                                <th style={th}>Other</th>
                                <th style={{ ...th, color: "#0369a1" }}>Gross (Full)</th>
                                <th style={{ ...th, background: "#eff6ff" }}>Work Days</th>
                                <th style={{ ...th, background: "#eff6ff" }}>Present</th>
                                <th style={th}>OT Days</th>
                                <th style={th}>Canteen</th>
                                <th style={th}>Advance</th>
                                <th style={th}>Penalty</th>
                                <th style={th}>Salary Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!fetched ? (
                                <tr>
                                    <td colSpan={16} style={{ padding: "40px 16px", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                                            <Users size={28} style={{ opacity: 0.2 }} />
                                            Select a site and click "Fetch Employees" to load data
                                        </div>
                                    </td>
                                </tr>
                            ) : loading ? (
                                <tr>
                                    <td colSpan={16} style={{ padding: "40px 16px", textAlign: "center" }}>
                                        <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} />
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={16} style={{ padding: "40px 16px", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
                                        {employees.length === 0 ? "No active employees found at this site" : "No results match your search"}
                                    </td>
                                </tr>
                            ) : filtered.map((emp, i) => {
                                const sal = emp.employeeSalary
                                const att = attRows[emp.id] ?? {}
                                const fullGross = sal ? sal.basic + sal.da + sal.washing + sal.conveyance + sal.leaveWithWages + sal.otherAllowance : 0
                                const approved = sal?.status === "APPROVED"
                                return (
                                    <tr key={emp.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                                        <td style={td}>{i + 1}</td>
                                        <td style={{ ...td, color: "var(--accent)", fontWeight: 700 }}>{emp.employeeId}</td>
                                        <td style={{ ...td, textAlign: "left" }}>
                                            <div style={{ fontWeight: 600, color: "var(--text)" }}>{emp.firstName} {emp.lastName}</div>
                                            <div style={{ fontSize: 10, color: "var(--text3)" }}>{emp.designation || "—"}</div>
                                        </td>
                                        <td style={td}>{sal ? fmt(sal.basic) : "—"}</td>
                                        <td style={td}>{sal ? fmt(sal.da) : "—"}</td>
                                        <td style={td}>{sal ? fmt(sal.washing) : "—"}</td>
                                        <td style={td}>{sal ? fmt(sal.conveyance) : "—"}</td>
                                        <td style={td}>{sal ? fmt(sal.otherAllowance) : "—"}</td>
                                        <td style={{ ...td, fontWeight: 700, color: "#0369a1" }}>{fmt(fullGross)}</td>
                                        {/* Editable attendance fields */}
                                        <td style={{ ...td, background: "#eff6ff" }}>
                                            <input type="number" min={1} max={31} value={att.monthDays ?? defaultDays}
                                                onChange={e => setAtt(emp.id, "monthDays", e.target.value)}
                                                style={attInput} />
                                        </td>
                                        <td style={{ ...td, background: "#eff6ff" }}>
                                            <input type="number" min={0} max={31} value={att.workedDays ?? defaultDays}
                                                onChange={e => setAtt(emp.id, "workedDays", e.target.value)}
                                                style={attInput} />
                                        </td>
                                        <td style={td}>
                                            <input type="number" min={0} value={att.otDays ?? 0}
                                                onChange={e => setAtt(emp.id, "otDays", e.target.value)}
                                                style={attInput} />
                                        </td>
                                        <td style={td}>
                                            <input type="number" min={0} value={att.canteenDays ?? 0}
                                                onChange={e => setAtt(emp.id, "canteenDays", e.target.value)}
                                                style={attInput} />
                                        </td>
                                        <td style={td}>
                                            <input type="number" min={0} value={att.advance ?? 0}
                                                onChange={e => setAtt(emp.id, "advance", e.target.value)}
                                                style={attInput} />
                                        </td>
                                        <td style={td}>
                                            <input type="number" min={0} value={att.penalty ?? 0}
                                                onChange={e => setAtt(emp.id, "penalty", e.target.value)}
                                                style={attInput} />
                                        </td>
                                        <td style={td}>
                                            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                                                background: approved ? "#dcfce7" : "#fef9c3",
                                                color: approved ? "#15803d" : "#854d0e" }}>
                                                {approved ? "Approved" : (sal ? "Pending" : "No Salary")}
                                            </span>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        {fetched && employees.length > 0 && (
                            <tfoot>
                                <tr style={{ background: "var(--surface2)", borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                                    <td colSpan={3} style={{ ...td, textAlign: "right", fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                        Site Total ({employees.length} staff)
                                    </td>
                                    <td style={td}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.basic ?? 0), 0))}</td>
                                    <td style={td}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.da ?? 0), 0))}</td>
                                    <td style={td}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.washing ?? 0), 0))}</td>
                                    <td style={td}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.conveyance ?? 0), 0))}</td>
                                    <td style={td}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.otherAllowance ?? 0), 0))}</td>
                                    <td style={{ ...td, color: "#0369a1" }}>{fmt(totalGrossEst)}</td>
                                    <td colSpan={7} />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* Warning if some have no salary */}
            {fetched && employees.some(e => !e.employeeSalary || e.employeeSalary.status !== "APPROVED") && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde047" }}>
                    <AlertCircle size={14} style={{ color: "#a16207", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#a16207" }}>
                        {employees.filter(e => !e.employeeSalary || e.employeeSalary.status !== "APPROVED").length} employee(s) have no approved salary structure and will be skipped during processing.
                    </span>
                </div>
            )}
            {fetched && approvedCount > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "#dcfce7", border: "1px solid #86efac" }}>
                    <CheckCircle2 size={14} style={{ color: "#15803d", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#15803d" }}>
                        {approvedCount} employees ready. Attendance defaults to {defaultDays} days — edit inline above if needed, then click <b>Process Payroll</b>.
                    </span>
                </div>
            )}
        </div>
    )
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const th: React.CSSProperties = {
    padding: "9px 10px", fontSize: 10, fontWeight: 700, color: "var(--text3)",
    textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center", whiteSpace: "nowrap"
}
const td: React.CSSProperties = {
    padding: "7px 10px", textAlign: "center", color: "var(--text)", whiteSpace: "nowrap"
}
const attInput: React.CSSProperties = {
    width: 54, padding: "3px 5px", borderRadius: 5, border: "1px solid var(--border)",
    textAlign: "center", fontSize: 12, outline: "none", background: "var(--surface)", color: "var(--text)"
}
