"use client"
import { payrollYears, currentPayrollMonth, currentPayrollYear } from "./_components/payroll-years"
import type { PanelPeriod } from "./_components/WageSheetPanel"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import dynamic from "next/dynamic"
import {
    Loader2, RefreshCw, FileSpreadsheet, ShieldCheck, Upload, IndianRupee,
    Clock, Trash2, TrendingUp, Settings2, Lock, Unlock, CheckCircle2, ChevronRight,
    ChevronLeft, SlidersHorizontal, CalendarRange, Users, Wallet, Pencil, BadgeCheck,
} from "lucide-react"
import { can } from "@/lib/can"
import { StatCard, statGridClass } from "@/components/StatCard"

// Panels are lazy-loaded — each pulls xlsx (~430KB) so eager imports
// bloated the initial payroll bundle. Only one is open at a time.
const panelLoading = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48, gap: 8, color: "var(--text3)" }}>
        <Loader2 size={18} className="animate-spin" /> Loading…
    </div>
)
const ProcessPanel    = dynamic(() => import("./_components/ProcessPanel"),    { ssr: false, loading: () => panelLoading })
const AttendancePanel = dynamic(() => import("./_components/AttendancePanel"), { ssr: false, loading: () => panelLoading })
const WageSheetPanel  = dynamic(() => import("./_components/WageSheetPanel"),  { ssr: false, loading: () => panelLoading })
const CompliancePanel = dynamic(() => import("./_components/CompliancePanel"), { ssr: false, loading: () => panelLoading })
const PayslipsPanel   = dynamic(() => import("./_components/PayslipsPanel"),   { ssr: false, loading: () => panelLoading })

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

type SiteStatus = {
    siteId: string
    processedCount: number
    draft?: number
    locked?: number
    paid?: number
    totalGross: number
    totalNet: number
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")
const monthKey = (p: PanelPeriod) => p.year * 12 + p.month
const shiftMonth = (p: PanelPeriod, by: number): PanelPeriod => {
    const k = monthKey(p) - 1 + by
    return { year: Math.floor(k / 12), month: (k % 12) + 1 }
}

type Panel = "attendance" | "process" | "wagesheet" | "compliance" | "payslips"

// The month is done in four plain steps. Uploading the attendance sheet
// already calculates pay, so "upload" and "process" are one step, not two.
const STEPS = [
    {
        step: 1, label: "Attendance", icon: Upload, panel: "attendance" as Panel,
        desc: "Upload the attendance sheet. Pay is calculated right away.",
        cta: "Upload sheet",
        color: "#0b5cff", bg: "#e8effe", border: "#c7dbff", gradient: "linear-gradient(135deg, #0b5cff 0%, #0847c7 100%)",
    },
    {
        step: 2, label: "Check & lock", icon: FileSpreadsheet, panel: "wagesheet" as Panel,
        desc: "Go through the wage sheet, fix anything, then lock it.",
        cta: "Open wage sheet",
        color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", gradient: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
    },
    {
        step: 3, label: "PF / ESIC / PT", icon: ShieldCheck, panel: "compliance" as Panel,
        desc: "Download the challans and returns for filing.",
        cta: "Open reports",
        color: "#b45309", bg: "#fffbeb", border: "#fde68a", gradient: "linear-gradient(135deg, #b45309 0%, #d97706 100%)",
    },
    {
        step: 4, label: "Pay & slips", icon: IndianRupee, panel: "payslips" as Panel,
        desc: "Mark salaries as paid and share the payslips.",
        cta: "Open payslips",
        color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", gradient: "linear-gradient(135deg, #15803d 0%, #16a34a 100%)",
    },
]

export default function PayrollPage() {
    const { data: session } = useSession()
    const router = useRouter()

    // One month for the whole page. The stepper, the counts, every panel and
    // the history table all follow it — it used to be pinned to the calendar
    // month, so running September's payroll in October showed "Step 1" all
    // month long.
    const [period, setPeriod] = useState<PanelPeriod>({ month: currentPayrollMonth(), year: currentPayrollYear() })
    const [periodPicked, setPeriodPicked] = useState(false)

    const [runs,        setRuns]       = useState<PayrollRun[]>([])
    const [loading,     setLoading]    = useState(true)
    const [sites,       setSites]      = useState<SiteStatus[]>([])
    const [deleting,    setDeleting]   = useState<string | null>(null)
    const [markingPaid, setMarkingPaid]= useState(false)
    const [lockingMonth, setLockingMonth] = useState<"lock" | "unlock" | null>(null)
    const [activePanel, setActivePanel]= useState<Panel | null>(null)

    const fetchRuns = useCallback(async (year: number) => {
        setLoading(true)
        try {
            const res = await fetch(`/api/payroll/runs?year=${year}`)
            if (!res.ok) {
                setRuns([])
                const detail = await res.text().catch(() => "")
                if (res.status === 401) toast.error("Session expired — please sign in again")
                else if (res.status === 403) toast.error("You don't have permission to view payroll")
                else toast.error(detail.trim() || "Failed to load payroll runs")
                return []
            }
            const data = await res.json()
            const list: PayrollRun[] = Array.isArray(data) ? data : []
            setRuns(list)
            return list
        } catch { toast.error("Failed to load payroll runs — check your connection"); return [] }
        finally { setLoading(false) }
    }, [])

    const fetchSites = useCallback(async (p: PanelPeriod) => {
        try {
            const res = await fetch(`/api/payroll/sites-status?month=${p.month}&year=${p.year}`)
            const data = res.ok ? await res.json() : []
            setSites(Array.isArray(data) ? data : [])
        } catch { setSites([]) }
    }, [])

    const refresh = useCallback(() => { fetchRuns(period.year); fetchSites(period) }, [fetchRuns, fetchSites, period])

    // First load: land on the month that still needs work (the newest run
    // that isn't paid), else the newest run, else this month.
    useEffect(() => {
        if (periodPicked) return
        fetchRuns(period.year).then(list => {
            const open = list.find(r => r.status !== "PAID") ?? list[0]
            if (open) setPeriod({ month: open.month, year: open.year })
            setPeriodPicked(true)
        })
    }, [periodPicked, period.year, fetchRuns])

    useEffect(() => { if (periodPicked) { fetchRuns(period.year); fetchSites(period) } }, [period, periodPicked, fetchRuns, fetchSites])

    const choosePeriod = (p: PanelPeriod) => { setPeriod(p); setPeriodPicked(true); setActivePanel(null) }
    const openPanel = (panel: Panel) => setActivePanel(panel)
    const closePanel = () => { setActivePanel(null); refresh() }

    // ── Where the month stands, from the rows themselves ──
    const counts = useMemo(() => sites.reduce((c, s) => ({
        rows:   c.rows   + (s.processedCount ?? 0),
        draft:  c.draft  + (s.draft  ?? 0),
        locked: c.locked + (s.locked ?? 0),
        paid:   c.paid   + (s.paid   ?? 0),
        net:    c.net    + (s.totalNet ?? 0),
    }), { rows: 0, draft: 0, locked: 0, paid: 0, net: 0 }), [sites])

    const stepDone = (step: number) => {
        if (counts.rows === 0) return false
        if (step === 1) return true
        if (step === 2) return counts.draft === 0
        if (step === 3) return counts.draft === 0          // reports are ready once everything is locked
        return counts.paid === counts.rows                  // step 4
    }
    const activeStep = STEPS.find(s => !stepDone(s.step)) ?? null
    const doneCount  = STEPS.filter(s => stepDone(s.step)).length
    const monthDone  = counts.rows > 0 && doneCount === STEPS.length
    const openStep   = activePanel ? STEPS.find(s => s.panel === activePanel || (activePanel === "process" && s.step === 1)) ?? null : null

    const stepNote = (step: number) => {
        if (counts.rows === 0) return step === 1 ? "Nothing uploaded yet" : "After attendance"
        if (step === 1) return `${counts.rows} employees · ${sites.length} sites`
        if (step === 2) return counts.draft === 0 ? "All locked" : `${counts.locked + counts.paid} of ${counts.rows} locked`
        if (step === 3) return counts.draft === 0 ? "Ready to download" : "After locking"
        return counts.paid === counts.rows ? "All paid" : counts.draft > 0 ? "After locking" : `${counts.paid} of ${counts.rows} paid`
    }

    const thisRun = runs.find(r => r.month === period.month && r.year === period.year)
    const totalGrossYTD = runs.reduce((s, r) => s + r.totalGross, 0)
    const totalNetYTD   = runs.reduce((s, r) => s + r.totalNet, 0)
    const periodLabel   = `${MONTHS[period.month - 1]} ${period.year}`
    const canManage     = can(session, "payroll.manage")

    const deleteRun = async (run: PayrollRun) => {
        if (!confirm(`Delete the ${MONTHS_SHORT[run.month - 1]} ${run.year} draft payroll? Locked and paid rows are kept. This cannot be undone.`)) return
        setDeleting(run.id)
        try {
            const res = await fetch(`/api/payroll/reset?month=${run.month}&year=${run.year}&action=delete`, { method: "DELETE" })
            if (res.ok) {
                const d = await res.json().catch(() => ({}))
                toast.success(d.skippedLocked ? `Draft rows deleted · ${d.skippedLocked} locked row(s) kept` : "Payroll run deleted")
                refresh()
            } else toast.error(await res.text())
        } catch { toast.error("Delete failed") }
        finally { setDeleting(null) }
    }

    const markAllPaid = async () => {
        if (!confirm(`Mark all ${counts.locked} locked salaries for ${periodLabel} as paid?`)) return
        setMarkingPaid(true)
        try {
            const res = await fetch("/api/payroll/final/paid", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month: period.month, year: period.year }),
            })
            if (!res.ok) { toast.error(await res.text()); return }
            const d = await res.json()
            toast.success(d.paid ? `${d.paid} salaries marked paid` : "Nothing to mark — no locked rows")
            refresh()
        } catch { toast.error("Could not mark as paid") }
        finally { setMarkingPaid(false) }
    }

    // Month-level lock/unlock. The wage sheet's per-site and per-row locks stay
    // for partial months, but the normal case is "September is done — lock it",
    // and that must not mean ticking 40 site checkboxes first. The lock API
    // with only month/year covers every DRAFT row of the month; unlock without
    // a site reopens every PROCESSED row (PAID stays PAID).
    const lockMonth = async () => {
        if (!confirm(`Lock all ${counts.draft} open payroll rows for ${periodLabel}?\n\nAmounts can't be edited after locking. You can unlock the month later if something must change.`)) return
        setLockingMonth("lock")
        try {
            const res = await fetch("/api/payroll/final/lock", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month: period.month, year: period.year }),
            })
            if (!res.ok) { toast.error(await res.text()); return }
            const d = await res.json()
            toast.success(d.count ? `${periodLabel} locked — ${d.count} rows` : "Nothing to lock")
            refresh()
        } catch { toast.error("Could not lock the month") }
        finally { setLockingMonth(null) }
    }

    const unlockMonth = async () => {
        if (!confirm(`Unlock ${periodLabel}?\n\nAll ${counts.locked} locked rows go back to draft so days and amounts can be edited and re-processed. Paid rows stay paid.`)) return
        setLockingMonth("unlock")
        try {
            const res = await fetch(`/api/payroll/reset?month=${period.month}&year=${period.year}&action=unlock`, { method: "DELETE" })
            if (!res.ok) { toast.error(await res.text()); return }
            const d = await res.json()
            toast.success(d.unlocked ? `${periodLabel} unlocked — ${d.unlocked} rows editable again` : "Nothing to unlock")
            refresh()
        } catch { toast.error("Could not unlock the month") }
        finally { setLockingMonth(null) }
    }

    const role = session?.user?.role
    if (role && !can(session, "payroll.view")) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text3)", fontSize: 13 }}>
                Access denied
            </div>
        )
    }

    const quietBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, fontWeight: 600, color: "var(--text2)", cursor: "pointer" }

    return (
        <div className="p-4 lg:p-0" style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 48 }}>

            {/* ── Header: the month picker IS the control for this page ── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.5px" }}>Payroll</h1>
                    <p style={{ fontSize: 13.5, color: "var(--text3)", margin: "4px 0 0 0" }}>Pick a month, then follow the four steps.</p>
                </div>
                <div className="page-actions" style={{ flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", height: 40, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
                        <button aria-label="Previous month" onClick={() => choosePeriod(shiftMonth(period, -1))}
                            style={{ width: 36, height: "100%", border: "none", background: "none", cursor: "pointer", color: "var(--text2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <ChevronLeft size={16} />
                        </button>
                        <select value={period.month} onChange={e => choosePeriod({ ...period, month: Number(e.target.value) })}
                            style={{ height: "100%", border: "none", borderLeft: "1px solid var(--border)", background: "none", fontSize: 13.5, fontWeight: 700, color: "var(--text)", padding: "0 6px 0 10px", outline: "none", cursor: "pointer" }}>
                            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                        <select value={period.year} onChange={e => choosePeriod({ ...period, year: Number(e.target.value) })}
                            style={{ height: "100%", border: "none", background: "none", fontSize: 13.5, fontWeight: 700, color: "var(--text)", padding: "0 10px 0 4px", outline: "none", cursor: "pointer" }}>
                            {payrollYears().map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <button aria-label="Next month" onClick={() => choosePeriod(shiftMonth(period, 1))}
                            style={{ width: 36, height: "100%", border: "none", borderLeft: "1px solid var(--border)", background: "none", cursor: "pointer", color: "var(--text2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                    <button onClick={refresh} disabled={loading} style={quietBtn} title="Refresh">
                        <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                    </button>
                    <button onClick={() => router.push("/payroll/salary-master")} style={quietBtn} title="Each employee's salary structure">
                        <Settings2 size={15} /> Salary structure
                    </button>
                    {canManage && (
                        <button onClick={() => router.push("/payroll/settings")} style={quietBtn} title="PF / ESIC / PT rates, slabs and defaults">
                            <SlidersHorizontal size={15} /> Rules
                        </button>
                    )}
                </div>
            </div>

            {/* ── The four steps for the chosen month ── */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: "var(--surface2)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <TrendingUp size={15} style={{ color: "var(--accent)" }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{periodLabel}</span>
                        <span style={{ fontSize: 12, color: "var(--text3)" }}>
                            {counts.rows === 0 ? "· not started" : `· ${counts.rows} employees · ${sites.length} sites · net ${fmt(counts.net)}`}
                        </span>
                    </div>
                    {monthDone ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#15803d", background: "#dcfce7", padding: "3px 10px", borderRadius: 20, display: "flex", alignItems: "center", gap: 5 }}>
                            <CheckCircle2 size={12} /> Month complete
                        </span>
                    ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)" }}>{doneCount} of {STEPS.length} steps done</span>
                    )}
                </div>

                {/* Progress */}
                <div style={{ height: 3, background: "var(--border)" }}>
                    <div style={{ height: "100%", width: `${(doneCount / STEPS.length) * 100}%`, background: "linear-gradient(90deg, #16a34a, #22c55e)", transition: "width 0.4s ease" }} />
                </div>

                {/* Step cards: one row on a laptop, two by two on a phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" style={{ gap: 12, padding: 16 }}>
                    {STEPS.map(s => {
                        const done   = stepDone(s.step)
                        const isNow  = activeStep?.step === s.step
                        const isOpen = openStep?.step === s.step
                        const locked = !done && !isNow            // a later step: nothing to do yet
                        const Icon   = s.icon
                        return (
                            <div key={s.step} style={{
                                borderRadius: 12, padding: 14,
                                background: isOpen ? s.bg : isNow ? s.bg : "var(--surface)",
                                border: `1px solid ${isOpen || isNow ? s.border : "var(--border)"}`,
                                boxShadow: isOpen ? `0 0 0 2px ${s.color}33` : "none",
                                opacity: locked ? 0.6 : 1,
                                display: "flex", flexDirection: "column", gap: 10,
                            }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{
                                        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                                        background: done ? "#16a34a" : isNow ? s.gradient : "var(--surface2)",
                                        color: done || isNow ? "#fff" : "var(--text3)",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 13, fontWeight: 800,
                                    }}>
                                        {done ? <CheckCircle2 size={18} /> : isNow ? <Icon size={17} /> : s.step}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
                                            <span style={{ color: "var(--text3)", fontWeight: 600 }}>{s.step}. </span>{s.label}
                                        </p>
                                        <p style={{ margin: "1px 0 0", fontSize: 11.5, fontWeight: 600, color: done ? "#15803d" : isNow ? s.color : "var(--text3)" }}>
                                            {done ? "Done" : isNow ? "Do this now" : "Later"} · {stepNote(s.step)}
                                        </p>
                                    </div>
                                </div>
                                <p style={{ margin: 0, fontSize: 12.5, color: "var(--text2)", lineHeight: 1.45, flex: 1 }}>{s.desc}</p>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    <button onClick={() => openPanel(s.panel)} disabled={locked && s.step > 2}
                                        style={{
                                            display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 12px", borderRadius: 8, border: "none",
                                            background: isNow ? s.gradient : "var(--surface2)", color: isNow ? "#fff" : "var(--text)",
                                            fontSize: 12.5, fontWeight: 700, cursor: locked && s.step > 2 ? "not-allowed" : "pointer",
                                        }}>
                                        {done && s.step !== 3 ? "View" : s.cta} <ChevronRight size={13} />
                                    </button>
                                    {s.step === 1 && (
                                        // Sites that don't keep an Excel sheet type the days in here instead,
                                        // so this is a way to START the month too, not only to correct it.
                                        <button onClick={() => openPanel("process")} title="Enter or correct days site by site, then calculate"
                                            style={{ display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                            <Pencil size={12} /> {counts.rows > 0 ? "Fix days by site" : "Enter days by site"}
                                        </button>
                                    )}
                                    {s.step === 2 && canManage && counts.draft > 0 && (
                                        <button onClick={lockMonth} disabled={lockingMonth !== null} title="Lock every open row of this month, all sites at once"
                                            style={{ display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 10px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                            {lockingMonth === "lock" ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />} Lock whole month ({counts.draft})
                                        </button>
                                    )}
                                    {s.step === 2 && canManage && counts.locked > 0 && (
                                        <button onClick={unlockMonth} disabled={lockingMonth !== null} title="Reopen every locked row of this month for editing (paid rows stay paid)"
                                            style={{ display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid #fde68a", background: "#fffbeb", color: "#b45309", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                            {lockingMonth === "unlock" ? <Loader2 size={12} className="animate-spin" /> : <Unlock size={12} />} Unlock month ({counts.locked})
                                        </button>
                                    )}
                                    {s.step === 4 && canManage && counts.locked > 0 && counts.draft === 0 && (
                                        <button onClick={markAllPaid} disabled={markingPaid}
                                            style={{ display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#15803d", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                            {markingPaid ? <Loader2 size={12} className="animate-spin" /> : <BadgeCheck size={13} />} Mark all {counts.locked} paid
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div style={{ padding: "10px 20px 12px", borderTop: "1px solid var(--border)", background: "var(--surface2)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Lock size={11} style={{ color: "var(--text3)", flexShrink: 0 }} />
                    <p style={{ fontSize: 11.5, color: "var(--text3)", margin: 0 }}>
                        Lock the whole month from Step 2 once the sheet is checked; reports and payslips open after that. Locked rows can&apos;t be edited — <b>Unlock month</b> reopens them (paid rows stay paid).
                    </p>
                </div>
            </div>

            {/* ── The open step ── */}
            {activePanel === "attendance" && (
                <AttendancePanel key={`att-${period.month}-${period.year}`}
                    initialMonth={period.month} initialYear={period.year}
                    onClose={closePanel}
                    onDone={(p) => { if (p) choosePeriod(p); openPanel("wagesheet"); refresh() }}
                />
            )}
            {activePanel === "process" && (
                <ProcessPanel key={`proc-${period.month}-${period.year}`}
                    initialMonth={period.month} initialYear={period.year}
                    onClose={closePanel}
                    onDone={(p) => { if (p) choosePeriod(p); openPanel("wagesheet"); refresh() }}
                />
            )}
            {activePanel === "wagesheet" && (
                <WageSheetPanel key={`ws-${period.month}-${period.year}`}
                    initialMonth={period.month} initialYear={period.year}
                    onClose={closePanel}
                    onDone={(next, p) => { if (p) choosePeriod(p); if (next === "compliance") openPanel("compliance"); else setActivePanel(null); refresh() }}
                />
            )}
            {activePanel === "compliance" && (
                <CompliancePanel key={`comp-${period.month}-${period.year}`}
                    initialMonth={period.month} initialYear={period.year}
                    onClose={closePanel}
                />
            )}
            {activePanel === "payslips" && (
                <PayslipsPanel key={`slips-${period.month}-${period.year}`}
                    initialMonth={period.month} initialYear={period.year}
                    onClose={closePanel}
                />
            )}

            {/* ── Numbers for the chosen month and the year ── */}
            <div className={statGridClass(6)}>
                {[
                    { label: "Employees",      value: String(thisRun?._count.payrolls ?? counts.rows ?? "—"), tone: "violet" as const, sub: periodLabel,     icon: Users },
                    { label: "Gross Pay",      value: thisRun ? fmt(thisRun.totalGross) : "—",               tone: "sky" as const,    sub: periodLabel,     icon: IndianRupee },
                    { label: "Net Pay",        value: thisRun ? fmt(thisRun.totalNet) : "—",                 tone: "teal" as const,   sub: periodLabel,     icon: Wallet },
                    { label: "Runs This Year", value: String(runs.length),                                   tone: "blue" as const,   sub: String(period.year), icon: CalendarRange },
                    { label: "Gross YTD",      value: totalGrossYTD > 0 ? fmt(totalGrossYTD) : "—",          tone: "slate" as const,  sub: String(period.year), icon: TrendingUp },
                    { label: "Net YTD",        value: totalNetYTD > 0 ? fmt(totalNetYTD) : "—",              tone: "green" as const,  sub: String(period.year), icon: TrendingUp },
                ].map((s, i) => (
                    <StatCard key={s.label} label={s.label} value={s.value} tone={s.tone} icon={<s.icon size={20} />} sub={s.sub} seed={i} />
                ))}
            </div>

            {/* ── History: every month of the year, open one to work on it ── */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>Payroll months — {period.year}</p>
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
                        <p style={{ fontSize: 13, color: "var(--text3)", margin: 0 }}>No payroll yet for {period.year}</p>
                        <button onClick={() => openPanel("attendance")}
                            style={{ marginTop: 6, padding: "7px 18px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            Upload attendance for {periodLabel}
                        </button>
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                    {["Month", "Employees", "Gross Pay", "Net Pay", "PF (Co.)", "ESI (Co.)", "Status", ""].map((h, i) => (
                                        <th key={i} style={{ padding: "13px 16px", textAlign: ["Month","Status",""].includes(h) ? "left" : "right", fontSize: 11.5, fontWeight: 600, color: "var(--text3)", whiteSpace: "nowrap" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {runs.map((run, i) => {
                                    const statusMap: Record<string, { bg: string; color: string; label: string }> = {
                                        DRAFT:     { bg: "#fef9c3", color: "#854d0e", label: "In progress" },
                                        PROCESSED: { bg: "#dcfce7", color: "#15803d", label: "Locked" },
                                        PAID:      { bg: "#dbeafe", color: "#1d4ed8", label: "Paid" },
                                    }
                                    const ss = statusMap[run.status] ?? { bg: "#f3f4f6", color: "#6b7280", label: run.status }
                                    const isCurrent = run.month === period.month && run.year === period.year
                                    return (
                                        <tr key={run.id} style={{
                                            borderBottom: i < runs.length - 1 ? "1px solid var(--border)" : "none",
                                            background: isCurrent ? "var(--accent-light, #eef4ff)" : i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
                                        }}>
                                            <td style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text)" }}>
                                                {MONTHS_SHORT[run.month - 1]} {run.year}
                                                {isCurrent && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>● selected</span>}
                                            </td>
                                            <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--text2)", fontWeight: 600 }}>{run._count.payrolls}</td>
                                            <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#0b5cff" }}>{fmt(run.totalGross)}</td>
                                            <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#16a34a" }}>{fmt(run.totalNet)}</td>
                                            <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--text2)" }}>{fmt(run.totalPfEmployer)}</td>
                                            <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--text2)" }}>{fmt(run.totalEsiEmployer)}</td>
                                            <td style={{ padding: "12px 16px" }}>
                                                <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: ss.bg, color: ss.color, whiteSpace: "nowrap" }}>{ss.label}</span>
                                            </td>
                                            <td style={{ padding: "12px 16px" }}>
                                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                                    <button onClick={() => { choosePeriod({ month: run.month, year: run.year }); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                                                        style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", background: isCurrent ? "var(--surface2)" : "none", fontSize: 11.5, fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>
                                                        {isCurrent ? "Selected" : "Open"}
                                                    </button>
                                                    {canManage && run.status === "DRAFT" && (
                                                        <button onClick={() => deleteRun(run)} disabled={deleting === run.id} title="Delete the draft rows of this month"
                                                            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #fca5a5", background: "none", fontSize: 11, color: "#dc2626", cursor: "pointer", display: "flex", alignItems: "center" }}>
                                                            {deleting === run.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                                        </button>
                                                    )}
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
