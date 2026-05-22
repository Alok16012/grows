"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Loader2, RefreshCw, Play, FileSpreadsheet,
    ShieldCheck, Upload, IndianRupee,
    Clock, Trash2, TrendingUp, Settings2, Lock,
    CheckCircle2, ArrowRight, ChevronRight
} from "lucide-react"
import ProcessPanel    from "./_components/ProcessPanel"
import AttendancePanel from "./_components/AttendancePanel"
import WageSheetPanel  from "./_components/WageSheetPanel"
import CompliancePanel from "./_components/CompliancePanel"
import PayslipsPanel   from "./_components/PayslipsPanel"

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

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")

const STEPS = [
    {
        step: 1,
        label: "Upload Attendance",
        href: "/attendance/upload",
        icon: Upload,
        desc: "Upload site-wise attendance Excel file",
        doneDesc: "Attendance data uploaded",
        ctaLabel: "Upload Now",
        color: "#0369a1",
        bg: "#eff6ff",
        border: "#bfdbfe",
        gradient: "linear-gradient(135deg, #0369a1 0%, #0284c7 100%)",
    },
    {
        step: 2,
        label: "Process Payroll",
        href: "/payroll/process",
        icon: Play,
        desc: "Calculate wages, deductions & net pay for all employees",
        doneDesc: "Wages computed successfully",
        ctaLabel: "Process Now",
        color: "#7c3aed",
        bg: "#f5f3ff",
        border: "#ddd6fe",
        gradient: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
    },
    {
        step: 3,
        label: "Wage Sheet",
        href: "/payroll/wagesheet",
        icon: FileSpreadsheet,
        desc: "Review & download the wage sheet before locking",
        doneDesc: "Wage sheet reviewed",
        ctaLabel: "Review Sheet",
        color: "#0f766e",
        bg: "#f0fdfa",
        border: "#99f6e4",
        gradient: "linear-gradient(135deg, #0f766e 0%, #0d9488 100%)",
    },
    {
        step: 4,
        label: "Compliance",
        href: "/payroll/compliance",
        icon: ShieldCheck,
        desc: "PF, ESIC & PT reports and challans",
        doneDesc: "Statutory compliance done",
        ctaLabel: "Go to Compliance",
        color: "#b45309",
        bg: "#fffbeb",
        border: "#fde68a",
        gradient: "linear-gradient(135deg, #b45309 0%, #d97706 100%)",
    },
    {
        step: 5,
        label: "Payslips",
        href: "/payroll/salary-slips",
        icon: IndianRupee,
        desc: "Generate & distribute payslips to all employees",
        doneDesc: "Payslips distributed",
        ctaLabel: "Generate Slips",
        color: "#15803d",
        bg: "#f0fdf4",
        border: "#bbf7d0",
        gradient: "linear-gradient(135deg, #15803d 0%, #16a34a 100%)",
    },
]

export default function PayrollPage() {
    const { data: session } = useSession()
    const router = useRouter()

    const [runs,        setRuns]       = useState<PayrollRun[]>([])
    const [loading,     setLoading]    = useState(true)
    const [yearFilter,  setYearFilter] = useState(String(new Date().getFullYear()))
    const [deleting,    setDeleting]   = useState<string | null>(null)
    const [activePanel, setActivePanel]= useState<"attendance" | "process" | "wagesheet" | "compliance" | "payslips" | null>(null)

    const fetchRuns = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/payroll/runs?year=${yearFilter}`)
            if (res.ok) setRuns(await res.json())
        } catch { toast.error("Failed to load payroll runs") }
        finally { setLoading(false) }
    }, [yearFilter])

    useEffect(() => { fetchRuns() }, [fetchRuns])

    const deleteRun = async (run: PayrollRun) => {
        if (!confirm(`Delete ${MONTHS_SHORT[run.month - 1]} ${run.year} payroll run? This cannot be undone.`)) return
        setDeleting(run.id)
        try {
            const res = await fetch(`/api/payroll/reset?month=${run.month}&year=${run.year}&action=delete`, { method: "DELETE" })
            if (res.ok) { toast.success("Payroll run deleted"); fetchRuns() }
            else toast.error(await res.text())
        } catch { toast.error("Delete failed") }
        finally { setDeleting(null) }
    }

    const role = session?.user?.role
    if (role && role !== "ADMIN" && role !== "MANAGER") {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text3)", fontSize: 13 }}>
                Access denied
            </div>
        )
    }

    const currentMonth = new Date().getMonth() + 1
    const currentYear  = new Date().getFullYear()
    const thisMonthRun = runs.find(r => r.month === currentMonth && r.year === currentYear)
    const totalGrossYTD = runs.reduce((s, r) => s + r.totalGross, 0)
    const totalNetYTD   = runs.reduce((s, r) => s + r.totalNet, 0)

    const getStepStatus = (stepNum: number): "done" | "active" | "pending" => {
        if (!thisMonthRun) return stepNum === 1 ? "active" : "pending"
        if (thisMonthRun.status === "PAID") return "done"
        if (thisMonthRun.status === "PROCESSED") {
            if (stepNum <= 2) return "done"
            if (stepNum === 3) return "active"
            return "pending"
        }
        if (thisMonthRun.status === "DRAFT") {
            if (stepNum <= 1) return "done"
            if (stepNum === 2) return "active"
            return "pending"
        }
        return "pending"
    }

    const activeStep = STEPS.find(s => getStepStatus(s.step) === "active")
    const doneCount  = STEPS.filter(s => getStepStatus(s.step) === "done").length
    const progressPct = Math.round((doneCount / STEPS.length) * 100)

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 48, maxWidth: 1200 }}>

            {/* ── Page Header ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0, letterSpacing: "-0.4px" }}>Payroll</h1>
                    <p style={{ fontSize: 12, color: "var(--text3)", margin: "3px 0 0 0" }}>
                        {MONTHS[currentMonth - 1]} {currentYear} · Monthly payroll workflow
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
                        style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }}>
                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button onClick={fetchRuns} disabled={loading}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                    <button onClick={() => router.push("/payroll/salary-master")}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, color: "var(--text2)", cursor: "pointer", fontWeight: 600 }}>
                        <Settings2 size={13} /> Salary Structure
                    </button>
                </div>
            </div>

            {/* ── Workflow Panel ── */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>

                {/* Panel Header */}
                <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface2)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <TrendingUp size={15} style={{ color: "var(--accent)" }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Monthly Payroll Workflow</span>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>· {MONTHS[currentMonth - 1]} {currentYear}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)" }}>
                        {doneCount}/{STEPS.length} steps done
                    </span>
                </div>

                {/* Thin Progress Bar */}
                <div style={{ height: 3, background: "var(--border)" }}>
                    <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(90deg, #16a34a, #22c55e)", transition: "width 0.6s ease" }} />
                </div>

                {/* Stepper Rail */}
                <div style={{ padding: "24px 24px 0" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", position: "relative" }}>
                        {/* Connecting line behind circles */}
                        <div style={{
                            position: "absolute",
                            top: 18,
                            left: "calc(10% - 0px)",
                            right: "calc(10% - 0px)",
                            height: 2,
                            background: "var(--border)",
                            zIndex: 0,
                        }} />
                        {/* Done portion of line */}
                        {doneCount > 0 && (
                            <div style={{
                                position: "absolute",
                                top: 18,
                                left: "calc(10% - 0px)",
                                width: `calc(${(doneCount / (STEPS.length - 1)) * 80}% - 0px)`,
                                height: 2,
                                background: "#22c55e",
                                zIndex: 0,
                                transition: "width 0.6s ease",
                            }} />
                        )}

                        {STEPS.map((s) => {
                            const status = getStepStatus(s.step)
                            const isDone    = status === "done"
                            const isActive  = status === "active"
                            const Icon = s.icon
                            // All steps open inline panels
                            const handleStepClick = () => {
                                if (s.step === 1) setActivePanel("attendance")
                                else if (s.step === 2) setActivePanel("process")
                                else if (s.step === 3) setActivePanel("wagesheet")
                                else if (s.step === 4) setActivePanel("compliance")
                                else if (s.step === 5) setActivePanel("payslips")
                            }

                            return (
                                <button
                                    key={s.step}
                                    onClick={handleStepClick}
                                    style={{
                                        flex: 1,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: 8,
                                        padding: "0 4px 20px",
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        position: "relative",
                                        zIndex: 1,
                                    }}
                                >
                                    {/* Circle */}
                                    <div style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: "50%",
                                        background: isDone ? "#16a34a" : isActive ? s.color : "var(--surface)",
                                        border: `2px solid ${isDone ? "#16a34a" : isActive ? s.color : "var(--border)"}`,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        boxShadow: isActive ? `0 0 0 4px ${s.color}22` : isDone ? "0 0 0 3px #16a34a18" : "none",
                                        transition: "all 0.3s",
                                        flexShrink: 0,
                                    }}>
                                        {isDone
                                            ? <CheckCircle2 size={18} style={{ color: "#fff" }} />
                                            : <Icon size={16} style={{ color: isActive ? "#fff" : "var(--text3)" }} />
                                        }
                                    </div>

                                    {/* Label */}
                                    <div style={{ textAlign: "center" }}>
                                        <p style={{
                                            fontSize: 11,
                                            fontWeight: isDone || isActive ? 700 : 500,
                                            color: isDone ? "#16a34a" : isActive ? s.color : "var(--text3)",
                                            margin: 0,
                                            lineHeight: 1.3,
                                            whiteSpace: "nowrap",
                                        }}>
                                            {s.label}
                                        </p>
                                        <p style={{
                                            fontSize: 10,
                                            color: isDone ? "#16a34a" : isActive ? s.color : "var(--text3)",
                                            margin: "2px 0 0 0",
                                            opacity: isDone || isActive ? 0.7 : 0.5,
                                        }}>
                                            {isDone ? "Done" : isActive ? "In Progress" : "Pending"}
                                        </p>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Active Step Call-to-Action */}
                {activeStep && (() => {
                    const Icon = activeStep.icon
                    return (
                        <div style={{
                            margin: "0 20px 20px",
                            padding: "16px 20px",
                            borderRadius: 12,
                            background: activeStep.bg,
                            border: `1px solid ${activeStep.border}`,
                            display: "flex",
                            alignItems: "center",
                            gap: 16,
                        }}>
                            <div style={{
                                width: 44,
                                height: 44,
                                borderRadius: 12,
                                background: activeStep.gradient,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                boxShadow: `0 4px 12px ${activeStep.color}35`,
                            }}>
                                <Icon size={20} style={{ color: "#fff" }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, color: activeStep.color, margin: 0 }}>
                                    Step {activeStep.step}: {activeStep.label}
                                </p>
                                <p style={{ fontSize: 12, color: activeStep.color, margin: "2px 0 0 0", opacity: 0.75 }}>
                                    {activeStep.desc}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    if (activeStep.step === 1) setActivePanel("attendance")
                                    else if (activeStep.step === 2) setActivePanel("process")
                                    else if (activeStep.step === 3) setActivePanel("wagesheet")
                                    else if (activeStep.step === 4) setActivePanel("compliance")
                                    else if (activeStep.step === 5) setActivePanel("payslips")
                                }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "9px 18px",
                                    borderRadius: 10,
                                    border: "none",
                                    background: activeStep.gradient,
                                    color: "#fff",
                                    fontSize: 13,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                    boxShadow: `0 3px 10px ${activeStep.color}40`,
                                }}
                            >
                                {activeStep.ctaLabel}
                                <ChevronRight size={15} />
                            </button>
                        </div>
                    )
                })()}

                {/* All done state */}
                {!activeStep && doneCount === STEPS.length && (
                    <div style={{
                        margin: "0 20px 20px",
                        padding: "16px 20px",
                        borderRadius: 12,
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                    }}>
                        <CheckCircle2 size={22} style={{ color: "#16a34a", flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "#15803d", margin: 0 }}>
                                {MONTHS[currentMonth - 1]} {currentYear} Payroll Complete
                            </p>
                            <p style={{ fontSize: 12, color: "#15803d", margin: "2px 0 0 0", opacity: 0.75 }}>
                                All steps finished · {thisMonthRun ? fmt(thisMonthRun.totalNet) : ""} net pay distributed
                            </p>
                        </div>
                    </div>
                )}

                {/* Lock hint */}
                <div style={{ padding: "10px 20px 14px", borderTop: "1px solid var(--border)", background: "var(--surface2)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Lock size={11} style={{ color: "var(--text3)", flexShrink: 0 }} />
                    <p style={{ fontSize: 11, color: "var(--text3)", margin: 0 }}>
                        Lock payroll via <b>Compliance</b> before generating payslips. Locked payrolls cannot be edited.
                    </p>
                </div>
            </div>

            {/* ── Inline Panels ── */}
            {activePanel === "attendance" && (
                <AttendancePanel
                    onClose={() => setActivePanel(null)}
                    onDone={() => { setActivePanel("process"); fetchRuns() }}
                />
            )}
            {activePanel === "process" && (
                <ProcessPanel
                    onClose={() => setActivePanel(null)}
                    onDone={() => { setActivePanel("wagesheet"); fetchRuns() }}
                />
            )}
            {activePanel === "wagesheet" && (
                <WageSheetPanel
                    onClose={() => setActivePanel(null)}
                    onDone={(next) => { setActivePanel(next === "compliance" ? "compliance" : null); fetchRuns() }}
                />
            )}
            {activePanel === "compliance" && (
                <CompliancePanel
                    onClose={() => setActivePanel(null)}
                />
            )}
            {activePanel === "payslips" && (
                <PayslipsPanel
                    onClose={() => setActivePanel(null)}
                />
            )}

            {/* ── Stats Row ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
                {[
                    { label: "Runs This Year",       value: String(runs.length),                                color: "#3b82f6", sub: "payroll runs" },
                    { label: "Employees",             value: String(thisMonthRun?._count.payrolls ?? "—"),       color: "#8b5cf6", sub: "this month" },
                    { label: "Gross Pay",             value: thisMonthRun ? fmt(thisMonthRun.totalGross) : "—", color: "#0369a1", sub: "this month" },
                    { label: "Net Pay",               value: thisMonthRun ? fmt(thisMonthRun.totalNet) : "—",   color: "#16a34a", sub: "this month" },
                    { label: "Gross YTD",             value: totalGrossYTD > 0 ? fmt(totalGrossYTD) : "—",      color: "#0369a1", sub: "year to date" },
                    { label: "Net YTD",               value: totalNetYTD > 0 ? fmt(totalNetYTD) : "—",          color: "#15803d", sub: "year to date" },
                ].map(s => (
                    <div key={s.label} style={{
                        padding: "14px 16px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                    }}>
                        <p style={{ fontSize: 10, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>{s.label}</p>
                        <p style={{ fontSize: 17, fontWeight: 800, color: s.color, margin: "5px 0 2px" }}>{s.value}</p>
                        <p style={{ fontSize: 10, color: "var(--text3)", margin: 0 }}>{s.sub}</p>
                    </div>
                ))}
            </div>

            {/* ── Payroll History ── */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>
                        Payroll History — {yearFilter}
                    </p>
                    <span style={{ fontSize: 11, color: "var(--text3)", background: "var(--surface2)", padding: "3px 10px", borderRadius: 20, border: "1px solid var(--border)" }}>
                        {runs.length} run{runs.length !== 1 ? "s" : ""}
                    </span>
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
                        <button onClick={() => setActivePanel("attendance")}
                            style={{ marginTop: 6, padding: "7px 18px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            Start First Payroll
                        </button>
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                                    {["Month", "Employees", "Gross Pay", "Net Pay", "PF (Co.)", "ESI (Co.)", "Status", "Actions"].map(h => (
                                        <th key={h} style={{
                                            padding: "10px 16px",
                                            textAlign: ["Month","Status","Actions"].includes(h) ? "left" : "right",
                                            fontSize: 10,
                                            fontWeight: 700,
                                            color: "var(--text3)",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.5px",
                                            whiteSpace: "nowrap"
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {runs.map((run, i) => {
                                    const statusMap: Record<string, { bg: string; color: string; label: string }> = {
                                        DRAFT:     { bg: "#fef9c3", color: "#854d0e", label: "Draft" },
                                        PROCESSED: { bg: "#dcfce7", color: "#15803d", label: "Processed" },
                                        PAID:      { bg: "#dbeafe", color: "#1d4ed8", label: "Paid" },
                                    }
                                    const ss = statusMap[run.status] ?? { bg: "#f3f4f6", color: "#6b7280", label: run.status }
                                    return (
                                        <tr key={run.id} style={{
                                            borderBottom: i < runs.length - 1 ? "1px solid var(--border)" : "none",
                                            background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
                                        }}>
                                            <td style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text)" }}>
                                                {MONTHS_SHORT[run.month - 1]} {run.year}
                                            </td>
                                            <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--text2)", fontWeight: 600 }}>{run._count.payrolls}</td>
                                            <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#0369a1" }}>{fmt(run.totalGross)}</td>
                                            <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#16a34a" }}>{fmt(run.totalNet)}</td>
                                            <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--text2)" }}>{fmt(run.totalPfEmployer)}</td>
                                            <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--text2)" }}>{fmt(run.totalEsiEmployer)}</td>
                                            <td style={{ padding: "12px 16px" }}>
                                                <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: ss.bg, color: ss.color, whiteSpace: "nowrap" }}>
                                                    {ss.label}
                                                </span>
                                            </td>
                                            <td style={{ padding: "12px 16px" }}>
                                                <div style={{ display: "flex", gap: 6 }}>
                                                    <button onClick={() => setActivePanel("process")}
                                                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "none", fontSize: 11, color: "var(--text2)", cursor: "pointer" }}>
                                                        View
                                                    </button>
                                                    <button onClick={() => setActivePanel("wagesheet")}
                                                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "none", fontSize: 11, color: "var(--text2)", cursor: "pointer" }}>
                                                        Wage Sheet
                                                    </button>
                                                    <button onClick={() => setActivePanel("payslips")}
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
                    </div>
                )}
            </div>
        </div>
    )
}
