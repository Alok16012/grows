"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Loader2, RefreshCw, Play, FileSpreadsheet,
    ShieldCheck, Lock, Upload, IndianRupee,
    ChevronRight, AlertCircle, CheckCircle2, Clock, TableProperties, Trash2
} from "lucide-react"

type PayrollRun = {
    id: string
    month: number
    year: number
    status: string
    totalGross: number
    totalNet: number
    totalPfEmployer: number
    totalEsiEmployer: number
    createdAt: string
    _count: { payrolls: number }
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    DRAFT:     { bg: "#fef9c3", color: "#854d0e", label: "Draft" },
    PROCESSED: { bg: "#dcfce7", color: "#15803d", label: "Processed" },
    PAID:      { bg: "#dbeafe", color: "#1d4ed8", label: "Paid" },
}

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")

export default function PayrollPage() {
    const { data: session } = useSession()
    const router = useRouter()

    const [runs, setRuns] = useState<PayrollRun[]>([])
    const [loading, setLoading] = useState(true)
    const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()))
    const [deleting, setDeleting] = useState<string | null>(null)

    const deleteRun = async (run: PayrollRun) => {
        if (!confirm(`Delete ${MONTHS[run.month - 1]} ${run.year} payroll run? This cannot be undone.`)) return
        setDeleting(run.id)
        try {
            const res = await fetch(`/api/payroll/reset?month=${run.month}&year=${run.year}&action=delete`, { method: "DELETE" })
            if (res.ok) { toast.success("Payroll run deleted"); fetchRuns() }
            else toast.error(await res.text())
        } catch { toast.error("Delete failed") }
        finally { setDeleting(null) }
    }

    const fetchRuns = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/payroll/runs?year=${yearFilter}`)
            if (res.ok) setRuns(await res.json())
        } catch { toast.error("Failed to load payroll runs") }
        finally { setLoading(false) }
    }, [yearFilter])

    useEffect(() => { fetchRuns() }, [fetchRuns])

    const currentMonth = new Date().getMonth() + 1
    const currentYear  = new Date().getFullYear()
    const thisMonthRun = runs.find(r => r.month === currentMonth && r.year === currentYear)

    const totalGrossYTD  = runs.reduce((s, r) => s + r.totalGross, 0)
    const totalNetYTD    = runs.reduce((s, r) => s + r.totalNet, 0)

    const WORKFLOW = [
        { step: 1, label: "Salary Structure",         href: "/payroll/salary-master", icon: TableProperties, desc: "Setup employee salary components" },
        { step: 2, label: "Upload Attendance",        href: "/attendance/upload", icon: Upload,          desc: "Import monthly attendance Excel" },
        { step: 3, label: "Process Payroll",          href: "/payroll/process",  icon: Play,            desc: "Calculate wages site-wise" },
        { step: 4, label: "Wage Sheet",               href: "/payroll/wagesheet",icon: FileSpreadsheet, desc: "Download site wage sheets" },
        { step: 5, label: "Compliance Reports",       href: "/payroll/compliance",icon: ShieldCheck,    desc: "PF, ESI, PT challans" },
        { step: 6, label: "Salary Slips",             href: "/payroll/salary-slips", icon: IndianRupee, desc: "Generate & distribute slips" },
        { step: 7, label: "Lock Payroll",             href: "/payroll/final",    icon: Lock,            desc: "Finalize and lock the run" },
    ]

    const role = session?.user?.role
    if (role && role !== "ADMIN" && role !== "MANAGER") {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text3)", fontSize: 13 }}>
                Access denied
            </div>
        )
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 32 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Payroll</h1>
                    <p style={{ fontSize: 12, color: "var(--text3)", margin: "3px 0 0 0" }}>Site-wise monthly payroll processing</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
                        style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }}>
                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button onClick={fetchRuns} disabled={loading}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                    <button onClick={() => router.push("/payroll/process")}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        <Play size={13} /> Process Payroll
                    </button>
                </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                {[
                    { label: "This Month Status", value: thisMonthRun ? (STATUS_STYLE[thisMonthRun.status]?.label ?? thisMonthRun.status) : "Not Run", color: thisMonthRun ? STATUS_STYLE[thisMonthRun.status]?.color : "#6b7280" },
                    { label: "Runs This Year",    value: String(runs.length), color: "#3b82f6" },
                    { label: "Employees Processed (YTD)", value: String(thisMonthRun?._count.payrolls ?? 0), color: "#8b5cf6" },
                    { label: "Total Gross (YTD)", value: fmt(totalGrossYTD), color: "#16a34a" },
                    { label: "Total Net (YTD)",   value: fmt(totalNetYTD),   color: "#0369a1" },
                ].map(s => (
                    <div key={s.label} style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)" }}>
                        <p style={{ fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>{s.label}</p>
                        <p style={{ fontSize: 18, fontWeight: 800, color: s.color, margin: "4px 0 0 0" }}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Workflow steps */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 14px 0" }}>Monthly Workflow</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {WORKFLOW.map((w, i) => {
                        const Icon = w.icon
                        return (
                            <div key={w.step} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <button onClick={() => router.push(w.href)}
                                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", transition: "all 0.15s" }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-light)" }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--surface2)" }}>
                                    <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <Icon size={12} color="#fff" />
                                    </div>
                                    <div style={{ textAlign: "left" }}>
                                        <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", margin: 0, whiteSpace: "nowrap" }}>{w.step}. {w.label}</p>
                                        <p style={{ fontSize: 10, color: "var(--text3)", margin: 0 }}>{w.desc}</p>
                                    </div>
                                </button>
                                {i < WORKFLOW.length - 1 && <ChevronRight size={12} style={{ color: "var(--text3)", opacity: 0.4, flexShrink: 0 }} />}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Payroll Runs table */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>Payroll Runs — {yearFilter}</p>
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>{runs.length} run{runs.length !== 1 ? "s" : ""}</span>
                </div>

                {loading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48, gap: 10 }}>
                        <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent)" }} />
                        <span style={{ fontSize: 13, color: "var(--text3)" }}>Loading…</span>
                    </div>
                ) : runs.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48, gap: 8 }}>
                        <Clock size={32} style={{ color: "var(--text3)", opacity: 0.3 }} />
                        <p style={{ fontSize: 13, color: "var(--text3)", margin: 0 }}>No payroll runs for {yearFilter}</p>
                        <button onClick={() => router.push("/payroll/process")}
                            style={{ marginTop: 6, padding: "6px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            Start First Run
                        </button>
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                                {["Month", "Employees", "Total Gross", "Total Net", "PF (Employer)", "ESI (Employer)", "Status", "Actions"].map(h => (
                                    <th key={h} style={{ padding: "10px 14px", textAlign: h === "Month" || h === "Status" || h === "Actions" ? "left" : "right", fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {runs.map((run, i) => {
                                const ss = STATUS_STYLE[run.status] ?? { bg: "#f3f4f6", color: "#6b7280", label: run.status }
                                return (
                                    <tr key={run.id} style={{ borderBottom: i < runs.length - 1 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                                        <td style={{ padding: "12px 14px", fontWeight: 700, color: "var(--text)" }}>
                                            {MONTHS[run.month - 1]} {run.year}
                                        </td>
                                        <td style={{ padding: "12px 14px", textAlign: "right", color: "var(--text2)", fontWeight: 600 }}>
                                            {run._count.payrolls}
                                        </td>
                                        <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, color: "#0369a1" }}>
                                            {fmt(run.totalGross)}
                                        </td>
                                        <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, color: "#16a34a" }}>
                                            {fmt(run.totalNet)}
                                        </td>
                                        <td style={{ padding: "12px 14px", textAlign: "right", color: "var(--text2)" }}>
                                            {fmt(run.totalPfEmployer)}
                                        </td>
                                        <td style={{ padding: "12px 14px", textAlign: "right", color: "var(--text2)" }}>
                                            {fmt(run.totalEsiEmployer)}
                                        </td>
                                        <td style={{ padding: "12px 14px" }}>
                                            <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: ss.bg, color: ss.color }}>
                                                {ss.label}
                                            </span>
                                        </td>
                                        <td style={{ padding: "12px 14px" }}>
                                            <div style={{ display: "flex", gap: 6 }}>
                                                <button onClick={() => router.push(`/payroll/process?month=${run.month}&year=${run.year}`)}
                                                    style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "none", fontSize: 11, color: "var(--text2)", cursor: "pointer" }}>
                                                    View
                                                </button>
                                                {run.status === "DRAFT" && (
                                                    <button onClick={() => router.push(`/payroll/process?month=${run.month}&year=${run.year}`)}
                                                        style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--accent)", fontSize: 11, color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                                                        Process
                                                    </button>
                                                )}
                                                <button onClick={() => router.push(`/payroll/salary-slips?month=${run.month}&year=${run.year}`)}
                                                    style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "none", fontSize: 11, color: "var(--text2)", cursor: "pointer" }}>
                                                    Slips
                                                </button>
                                                <button onClick={() => deleteRun(run)} disabled={deleting === run.id}
                                                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #fca5a5", background: "none", fontSize: 11, color: "#dc2626", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                                                    {deleting === run.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Alert for this month */}
            {!thisMonthRun && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: "#fef9c3", border: "1px solid #fde047" }}>
                    <AlertCircle size={16} style={{ color: "#a16207", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#a16207" }}>
                        Payroll for <b>{MONTHS[currentMonth - 1]} {currentYear}</b> has not been processed yet.
                        <button onClick={() => router.push("/payroll/process")} style={{ marginLeft: 8, color: "#7c3aed", fontWeight: 700, background: "none", border: "none", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>
                            Process now →
                        </button>
                    </span>
                </div>
            )}
            {thisMonthRun?.status === "PROCESSED" && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: "#dcfce7", border: "1px solid #86efac" }}>
                    <CheckCircle2 size={16} style={{ color: "#15803d", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#15803d" }}>
                        <b>{MONTHS[currentMonth - 1]} {currentYear}</b> payroll is processed for {thisMonthRun._count.payrolls} employees.
                        Ready to lock.
                    </span>
                </div>
            )}
        </div>
    )
}
