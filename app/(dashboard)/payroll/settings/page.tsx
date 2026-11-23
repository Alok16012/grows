"use client"
import { useEffect, useState } from "react"
import EffectiveMonthPicker, { type EffectiveChoice } from "@/components/payroll/EffectiveMonthPicker"
import ChangeControlPanel from "./ChangeControlPanel"
import OtSiteRules from "./OtSiteRules"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    ChevronRight, Loader2, Plus, RotateCcw, Save,
    Settings2, Trash2, FlaskConical, Info,
} from "lucide-react"
import { can } from "@/lib/can"
import { calcGrowusPayroll } from "@/lib/payroll-calc"
import { DEFAULT_PAYROLL_RULES, PayrollRules, PtSlab, rulesForPeriod, sanitizePayrollRules } from "@/lib/payroll-rules"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")

// ─── Small styled controls (match payroll module look) ──────────────────────
const cardStyle: React.CSSProperties = {
    background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12,
}
const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: "var(--text)", margin: 0 }
const cardHint: React.CSSProperties = { fontSize: 11, color: "var(--text3)", margin: 0, lineHeight: 1.5 }
const fieldLabel: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, color: "var(--text3)",
    textTransform: "uppercase", letterSpacing: "0.4px",
}
const inputStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)",
    fontSize: 13, background: "var(--surface)", color: "var(--text)", outline: "none",
}
const btnPrimary: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10,
    border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
}
const btnGhost: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10,
    border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text2)",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
}

function NumField({ label, value, onChange, step, suffix, width }: {
    label: string; value: number; onChange: (n: number) => void
    step?: number; suffix?: string; width?: number
}) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, width: width ?? "auto", minWidth: 0 }}>
            <span style={fieldLabel}>{label}{suffix ? ` (${suffix})` : ""}</span>
            <input
                type="number"
                step={step ?? "any"}
                value={Number.isFinite(value) ? value : 0}
                onChange={e => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                style={inputStyle}
            />
        </label>
    )
}

function Toggle({ label, checked, onChange, hint }: {
    label: string; checked: boolean; onChange: (b: boolean) => void; hint?: string
}) {
    return (
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: 12.5, color: "var(--text2)" }}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
                style={{ accentColor: "var(--accent)", marginTop: 2 }} />
            <span>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{label}</span>
                {hint && <span style={{ display: "block", fontSize: 11, color: "var(--text3)" }}>{hint}</span>}
            </span>
        </label>
    )
}

export default function PayrollSettingsPage() {
    const router = useRouter()
    const { data: session } = useSession()

    const [rules, setRules] = useState<PayrollRules>(DEFAULT_PAYROLL_RULES)
    const [customized, setCustomized] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [dirty, setDirty] = useState(false)
    // Dated versions + change control (lib/payroll-rules-server, lib/payroll-change-control).
    const [versions, setVersions] = useState<any[]>([])
    const [window_, setWindow] = useState<any>(null)
    const [viewing, setViewing] = useState<{ month: number; year: number } | null>(null)
    const [applyFrom, setApplyFrom] = useState<EffectiveChoice | null>(null)
    const isAdmin = (session?.user as any)?.role === "ADMIN"

    // Live-preview sample employee (fully editable)
    const [sample, setSample] = useState({
        basic: 12000, da: 2511, hra: 0, washing: 200, conveyance: 0,
        leaveWithWages: 0, otherAllowance: 0, bonus: 583,
        otRatePerHour: 170, canteenRatePerDay: 55,
        complianceType: "OR", isHandicap: false, gender: "Male",
        monthDays: 26, workedDays: 26, otDays: 0, canteenDays: 0, lwf: 0,
        month: 1,
        // Preview with the dated PF/ESIC revision applied (true) or the rules before it.
        newRule: true,
    })

    // Load the version in force for the open payroll month (or the one being viewed).
    const loadRules = (p: { month: number; year: number } | null = viewing) => {
        setLoading(true)
        fetch(`/api/payroll/rules${p ? `?month=${p.month}&year=${p.year}` : ""}`)
            .then(r => r.ok ? r.json() : Promise.reject(new Error("Failed to load rules")))
            .then(d => { if (d?.rules) { setRules(d.rules); setCustomized(!!d.customized); setVersions(d.versions ?? []); setWindow(d.window ?? null); setDirty(false) } })
            .catch(() => toast.error("Could not load saved rules — showing defaults"))
            .finally(() => setLoading(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { loadRules(null) }, [])
    const viewVersion = (p: { month: number; year: number } | null) => {
        if (dirty && !confirm("Discard your unsaved edits?")) return
        // "Before the first version" = any month earlier than it.
        const first = versions[0]
        const target = p ?? (first ? { month: first.fromMonth === 1 ? 12 : first.fromMonth - 1, year: first.fromMonth === 1 ? first.fromYear - 1 : first.fromYear } : null)
        setViewing(p); loadRules(target)
    }

    // Section updaters
    const up = <K extends keyof PayrollRules>(key: K, patch: Partial<PayrollRules[K]>) => {
        setDirty(true)
        setRules(prev => ({ ...prev, [key]: { ...(prev[key] as object), ...patch } as PayrollRules[K] }))
    }
    const upPfEmployer = (patch: Partial<PayrollRules["pf"]["employer"]>) => {
        setDirty(true)
        setRules(prev => ({ ...prev, pf: { ...prev.pf, employer: { ...prev.pf.employer, ...patch } } }))
    }

    // PT slabs: bounded rows edited in place; the unbounded top slab is edited separately
    const boundedSlabs = rules.pt.slabs.filter(s => s.upTo !== null)
    const topSlab = rules.pt.slabs.find(s => s.upTo === null) ?? { upTo: null, amount: 200 }
    const setSlabs = (bounded: PtSlab[], top: PtSlab) => {
        setDirty(true)
        const sorted = [...bounded].sort((a, b) => (a.upTo! - b.upTo!))
        setRules(prev => ({ ...prev, pt: { ...prev.pt, slabs: [...sorted, top] } }))
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            if (!applyFrom) throw new Error("Pick the month these settings apply from.")
            const res = await fetch("/api/payroll/rules", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rules, effectiveMonth: applyFrom.effectiveMonth, effectiveYear: applyFrom.effectiveYear, reason: applyFrom.backdateReason }),
            })
            if (!res.ok) { const d = await res.json().catch(() => null); throw new Error(d?.error || "Save failed") }
            const d = await res.json()
            setRules(d.rules)
            setCustomized(true)
            setDirty(false)
            setViewing({ month: applyFrom.effectiveMonth, year: applyFrom.effectiveYear })
            loadRules({ month: applyFrom.effectiveMonth, year: applyFrom.effectiveYear })
            const rc = d.recalculated
            toast.success(`Calculation settings saved — they apply from ${MONTHS[applyFrom.effectiveMonth - 1]} ${applyFrom.effectiveYear}.${rc?.rows ? ` ${rc.rows} draft payroll row${rc.rows === 1 ? "" : "s"} recalculated (${rc.months.join(", ")}).` : " No draft payroll to update."}${rc?.otRates ? ` OT rate updated in ${rc.otRates} salary structure${rc.otRates === 1 ? "" : "s"}.` : ""}`)
        } catch (e) { toast.error((e as Error).message || "Save failed") }
        finally { setSaving(false) }
    }

    const handleReset = async () => {
        if (!applyFrom) { toast.error("Pick the month the defaults apply from."); return }
        if (!confirm(`Put the verified Growus defaults in from ${MONTHS[applyFrom.effectiveMonth - 1]} ${applyFrom.effectiveYear}? Earlier months keep their settings.`)) return
        setResetting(true)
        try {
            const res = await fetch("/api/payroll/rules", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reset: true, effectiveMonth: applyFrom.effectiveMonth, effectiveYear: applyFrom.effectiveYear, reason: applyFrom.backdateReason }),
            })
            if (!res.ok) { const d = await res.json().catch(() => null); throw new Error(d?.error || "Reset failed") }
            const d = await res.json()
            setRules(d.rules)
            setDirty(false)
            loadRules({ month: applyFrom.effectiveMonth, year: applyFrom.effectiveYear })
            toast.success("Defaults saved as a new version")
        } catch (e) { toast.error((e as Error).message || "Reset failed") }
        finally { setResetting(false) }
    }

    // Live preview — computed with the CURRENT edits (sanitized like the server will),
    // for a month before or after the revision's effective date.
    const sanitized = sanitizePayrollRules(rules)
    const previewRules = sample.newRule
        ? rulesForPeriod(sanitized, sanitized.revision.effectiveMonth, sanitized.revision.effectiveYear)
        : sanitized
    const preview = calcGrowusPayroll(
        {
            basic: sample.basic, da: sample.da, washing: sample.washing,
            conveyance: sample.conveyance, leaveWithWages: sample.leaveWithWages,
            otherAllowance: sample.otherAllowance, hra: sample.hra, bonus: sample.bonus,
            otRatePerHour: sample.otRatePerHour, canteenRatePerDay: sample.canteenRatePerDay,
            complianceType: sample.complianceType, isHandicap: sample.isHandicap,
        },
        {
            monthDays: sample.monthDays || 1, workedDays: sample.workedDays,
            otDays: sample.otDays, canteenDays: sample.canteenDays,
            penalty: 0, advance: 0, otherDeductions: 0, productionIncentive: 0,
            lwf: sample.lwf, gender: sample.gender, month: sample.month,
        },
        previewRules
    )
    const upSample = (patch: Partial<typeof sample>) => setSample(prev => ({ ...prev, ...patch }))

    const role = session?.user?.role
    if (role && !can(session, "payroll.edit")) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text3)", fontSize: 13 }}>
                Access denied
            </div>
        )
    }

    if (loading) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, gap: 8, color: "var(--text3)" }}>
                <Loader2 size={18} className="animate-spin" /> Loading calculation settings…
            </div>
        )
    }

    return (
        <div className="p-4 lg:p-0" style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 48, maxWidth: 1200 }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)" }}>
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll")}>Payroll</span>
                <ChevronRight size={11} />
                <span style={{ fontWeight: 600, color: "var(--text2)" }}>Calculation Settings</span>
            </div>

            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
                    <Settings2 size={22} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 3 }} />
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Payroll Calculation Settings</h1>
                            <span style={{
                                padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                                background: customized ? "#fef3c7" : "#dcfce7",
                                color: customized ? "#92400e" : "#15803d",
                            }}>
                                {customized ? "Customized" : "Growus defaults"}
                            </span>
                        </div>
                        <p style={{ fontSize: 12.5, color: "var(--text3)", margin: "3px 0 0 0" }}>
                            Every rate, ceiling and slab the wage engine uses — editable here, no code changes needed.
                        </p>
                    </div>
                </div>
                <div className="page-actions">
                    <EffectiveMonthPicker compact prefix="Apply from" onChange={setApplyFrom} />
                    <button onClick={handleReset} disabled={resetting || saving} style={btnGhost}>
                        {resetting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Reset to defaults
                    </button>
                    <button onClick={handleSave} disabled={saving || resetting || !dirty}
                        style={{ ...btnPrimary, opacity: saving || !dirty ? 0.6 : 1 }}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save rules
                    </button>
                </div>
            </div>

            {/* Dated versions + change control */}
            <ChangeControlPanel versions={versions} window={window_} viewing={viewing} onView={viewVersion} onChanged={() => loadRules(viewing)} isAdmin={isAdmin} />

            {/* Scope note */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 14px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: 12, color: "#1e40af", lineHeight: 1.55 }}>
                <Info size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>
                    Saved settings apply <b>from the month you pick next to Save</b> (the open payroll month or the next). Months before it keep
                    the settings that were in force then, even if re-processed; locked months are never recalculated. CALL (contract) employees always skip PF and ESIC regardless of these settings.
                </span>
            </div>

            {/* ── Dated statutory revision (govt. rule from 1 Oct 2026) ── */}
            <div style={{ ...cardStyle, borderColor: "#bfdbfe" }}>
                <div>
                    <h2 style={cardTitle}>
                        New PF &amp; ESIC rule — from {MONTHS[rules.revision.effectiveMonth - 1]} {rules.revision.effectiveYear}
                    </h2>
                    <p style={cardHint}>
                        From the effective month onward these figures replace the PF wage ceiling and ESIC limit below.
                        Earlier months keep the old rule, so re-processing or re-filing them gives the same figures.
                    </p>
                </div>
                <Toggle label="Apply this rule" checked={rules.revision.enabled} onChange={b => up("revision", { enabled: b })}
                    hint="Off = every month uses the PF / ESIC settings below." />
                {rules.revision.enabled && (
                    <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <span style={fieldLabel}>Effective month</span>
                                <select value={rules.revision.effectiveMonth} onChange={e => up("revision", { effectiveMonth: Number(e.target.value) })} style={inputStyle}>
                                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                </select>
                            </label>
                            <NumField label="Effective year" value={rules.revision.effectiveYear} onChange={n => up("revision", { effectiveYear: n })} />
                            <NumField label="PF wage ceiling" suffix="₹" value={rules.revision.pfWageCeiling} onChange={n => up("revision", { pfWageCeiling: n })} />
                            <NumField label="ESIC limit" suffix="₹" value={rules.revision.esicEligibilityLimit} onChange={n => up("revision", { esicEligibilityLimit: n })} />
                            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <span style={fieldLabel}>ESIC limit checked on</span>
                                <select value={rules.revision.esicEligibilityBasis} onChange={e => up("revision", { esicEligibilityBasis: e.target.value as PayrollRules["revision"]["esicEligibilityBasis"] })} style={inputStyle}>
                                    <option value="basicDa">Basic + DA</option>
                                    <option value="structureGross">Structure gross</option>
                                </select>
                            </label>
                            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <span style={fieldLabel}>Employer PF capped at</span>
                                <select id="rev-employer-pf"
                                    value={rules.revision.employerPfWageCeiling === null ? "same" : String(rules.revision.employerPfWageCeiling)}
                                    onChange={e => up("revision", { employerPfWageCeiling: e.target.value === "same" ? null : Number(e.target.value) })}
                                    style={inputStyle}>
                                    <option value="same">Same as employee (₹{Math.round(rules.revision.pfWageCeiling).toLocaleString("en-IN")})</option>
                                    <option value="15000">₹15,000 (old ceiling)</option>
                                    {![null, 15000].includes(rules.revision.employerPfWageCeiling) && (
                                        <option value={String(rules.revision.employerPfWageCeiling)}>₹{Math.round(rules.revision.employerPfWageCeiling ?? 0).toLocaleString("en-IN")}</option>
                                    )}
                                </select>
                            </label>
                            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <span style={fieldLabel}>ESIC % charged on</span>
                                <select id="rev-esic-charge" value={rules.revision.esicChargeBase}
                                    onChange={e => up("revision", { esicChargeBase: e.target.value as PayrollRules["revision"]["esicChargeBase"] })} style={inputStyle}>
                                    <option value="esicWages">ESIC wages (gross − exclusions)</option>
                                    <option value="basicDa">Earned Basic + DA</option>
                                </select>
                            </label>
                            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <span style={fieldLabel}>ESIC eligibility uses</span>
                                <select id="rev-esic-period" value={rules.revision.esicEligibilityPeriod}
                                    onChange={e => up("revision", { esicEligibilityPeriod: e.target.value as PayrollRules["revision"]["esicEligibilityPeriod"] })} style={inputStyle}>
                                    <option value="fullMonth">Full-month salary structure</option>
                                    <option value="earned">Amount earned that month</option>
                                </select>
                            </label>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>
                            <div>
                                <b>PF:</b> Basic + DA ≥ ₹{Math.round(rules.revision.pfWageCeiling).toLocaleString("en-IN")} → ₹{Math.round(rules.revision.pfWageCeiling * rules.pf.employeePct / 100).toLocaleString("en-IN")} ({rules.pf.employeePct}%);
                                {" "}below that → {rules.pf.employeePct}% of actual Basic + DA.
                                {" "}Employer PF on Basic + DA up to ₹{Math.round(rules.revision.employerPfWageCeiling ?? rules.revision.pfWageCeiling).toLocaleString("en-IN")}.
                            </div>
                            <div>
                                <b>ESIC:</b> {rules.revision.esicEligibilityPeriod === "earned" ? "earned" : "full-month"} {rules.revision.esicEligibilityBasis === "basicDa" ? "Basic + DA" : "gross"} ≤ ₹{Math.round(rules.revision.esicEligibilityLimit).toLocaleString("en-IN")} → {rules.esic.employeePct}% of {rules.revision.esicChargeBase === "basicDa" ? "earned Basic + DA" : "ESIC wages"};
                                {" "}₹{Math.round(rules.revision.esicEligibilityLimit + 1).toLocaleString("en-IN")} and above → no ESIC.
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>

                {/* ── PF ── */}
                <div style={cardStyle}>
                    <div>
                        <h2 style={cardTitle}>Provident Fund (PF)</h2>
                        <p style={cardHint}>
                            <b>Formula:</b> PF = employeePct% of (Basic + DA), capped at wage ceiling.
                            If Basic + DA &gt; ₹{Math.round(rules.pf.wageCeiling).toLocaleString("en-IN")} → PF = ₹{Math.round(rules.pf.wageCeiling * rules.pf.employeePct / 100).toLocaleString("en-IN")} (fixed). If Basic + DA &le; ₹{Math.round(rules.pf.wageCeiling).toLocaleString("en-IN")} → PF = {rules.pf.employeePct}% of actual (Basic + DA).
                        </p>
                    </div>
                    <Toggle label="PF enabled" checked={rules.pf.enabled} onChange={b => up("pf", { enabled: b })}
                        hint="Off = no employee PF deduction and no employer PF cost for anyone." />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <NumField label="Wage ceiling (cap)" suffix="₹" value={rules.pf.wageCeiling} onChange={n => up("pf", { wageCeiling: n })} />
                        <NumField label="Employee PF rate" suffix="%" value={rules.pf.employeePct} onChange={n => up("pf", { employeePct: n })} />
                    </div>
                    <Toggle label="Prorate employee PF for short months" checked={rules.pf.prorateEmployee}
                        onChange={b => up("pf", { prorateEmployee: b })}
                        hint={`If on: below ${rules.pf.prorationThresholdDays} worked days, PF = (base ÷ ${rules.pf.prorationThresholdDays} × worked days) × rate. Default off — full PF regardless of attendance.`} />
                    {rules.pf.prorateEmployee && (
                        <NumField label="Proration threshold" suffix="days" value={rules.pf.prorationThresholdDays}
                            onChange={n => up("pf", { prorationThresholdDays: n })} />
                    )}
                    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={fieldLabel}>NCP days in PF ECR file</span>
                        <select value={rules.pf.ecrNcpDays} onChange={e => up("pf", { ecrNcpDays: e.target.value as "zero" | "actual" })} style={inputStyle}>
                            <option value="zero">Always 0</option>
                            <option value="actual">Actual — month days − days worked</option>
                        </select>
                    </label>
                    <div>
                        <p style={{ ...fieldLabel, marginBottom: 6 }}>Employer contribution split (%)</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                            <NumField label="EPS" value={rules.pf.employer.epsPct} onChange={n => upPfEmployer({ epsPct: n })} />
                            <NumField label="EPF" value={rules.pf.employer.epfPct} onChange={n => upPfEmployer({ epfPct: n })} />
                            <NumField label="EDLI" value={rules.pf.employer.edliPct} onChange={n => upPfEmployer({ edliPct: n })} />
                            <NumField label="Admin" value={rules.pf.employer.adminPct} onChange={n => upPfEmployer({ adminPct: n })} />
                        </div>
                        <p style={{ ...cardHint, marginTop: 6 }}>
                            Employer total: <b>{parseFloat((rules.pf.employer.epsPct + rules.pf.employer.epfPct + rules.pf.employer.edliPct + rules.pf.employer.adminPct).toFixed(2))}%</b>
                            {" "}of PF base (₹{Math.round(rules.pf.wageCeiling).toLocaleString("en-IN")} cap)
                        </p>
                    </div>
                </div>

                {/* ── ESIC ── */}
                <div style={cardStyle}>
                    <div>
                        <h2 style={cardTitle}>ESIC</h2>
                        <p style={cardHint}>Before the new rule above, eligibility is checked on the full-month structure gross. Contribution base = earned gross minus the components excluded below.</p>
                    </div>
                    <Toggle label="ESIC enabled" checked={rules.esic.enabled} onChange={b => up("esic", { enabled: b })} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <NumField label="Eligibility limit" suffix="₹" value={rules.esic.eligibilityLimit} onChange={n => up("esic", { eligibilityLimit: n })} />
                        <NumField label="Handicap limit" suffix="₹" value={rules.esic.handicapLimit} onChange={n => up("esic", { handicapLimit: n })} />
                        <NumField label="Employee rate" suffix="%" value={rules.esic.employeePct} onChange={n => up("esic", { employeePct: n })} />
                        <NumField label="Employer rate" suffix="%" value={rules.esic.employerPct} onChange={n => up("esic", { employerPct: n })} />
                    </div>
                    <Toggle label="Exclude Washing from ESIC wages" checked={rules.esic.excludeWashing} onChange={b => up("esic", { excludeWashing: b })} />
                    <Toggle label="Exclude Conveyance from ESIC wages" checked={rules.esic.excludeConveyance} onChange={b => up("esic", { excludeConveyance: b })} />
                    <Toggle label="Exclude Bonus from ESIC wages" checked={rules.esic.excludeBonus} onChange={b => up("esic", { excludeBonus: b })} />
                    <Toggle label="Exclude OT from ESIC wages" checked={rules.esic.excludeOt} onChange={b => up("esic", { excludeOt: b })} />
                    <Toggle label="Exclude production incentive from ESIC wages" checked={rules.esic.excludeIncentive} onChange={b => up("esic", { excludeIncentive: b })} />
                </div>

                {/* ── PT ── */}
                <div style={cardStyle}>
                    <div>
                        <h2 style={cardTitle}>Professional Tax (PT)</h2>
                        <p style={cardHint}>Slab on earned gross. The top slab (no upper limit) can charge a different amount in February — the annual adjustment.</p>
                    </div>
                    <Toggle label="PT enabled" checked={rules.pt.enabled} onChange={b => up("pt", { enabled: b })} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <p style={{ ...fieldLabel, margin: 0 }}>Slabs</p>
                        {boundedSlabs.map((slab, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={{ fontSize: 12, color: "var(--text3)", width: 68 }}>Gross up to</span>
                                <input type="number" value={slab.upTo ?? 0} style={{ ...inputStyle, width: 110 }}
                                    onChange={e => {
                                        const next = boundedSlabs.map((s, j) => j === i ? { ...s, upTo: Number(e.target.value) || 0 } : s)
                                        setSlabs(next, topSlab)
                                    }} />
                                <span style={{ fontSize: 12, color: "var(--text3)" }}>pays ₹</span>
                                <input type="number" value={slab.amount} style={{ ...inputStyle, width: 90 }}
                                    onChange={e => {
                                        const next = boundedSlabs.map((s, j) => j === i ? { ...s, amount: Number(e.target.value) || 0 } : s)
                                        setSlabs(next, topSlab)
                                    }} />
                                <button title="Remove slab" onClick={() => setSlabs(boundedSlabs.filter((_, j) => j !== i), topSlab)}
                                    style={{ ...btnGhost, padding: "6px 8px", color: "#dc2626" }}>
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))}
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "var(--text3)", width: 68 }}>Above that</span>
                            <span style={{ fontSize: 12, color: "var(--text3)" }}>pays ₹</span>
                            <input type="number" value={topSlab.amount} style={{ ...inputStyle, width: 90 }}
                                onChange={e => setSlabs(boundedSlabs, { upTo: null, amount: Number(e.target.value) || 0 })} />
                            <button onClick={() => setSlabs([...boundedSlabs, { upTo: (boundedSlabs[boundedSlabs.length - 1]?.upTo ?? 0) + 2500, amount: 0 }], topSlab)}
                                style={{ ...btnGhost, padding: "6px 10px" }}>
                                <Plus size={13} /> Add slab
                            </button>
                        </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={fieldLabel}>February amount (₹)</span>
                            <input type="number" placeholder="blank = no special"
                                value={rules.pt.februaryAmount ?? ""}
                                onChange={e => up("pt", { februaryAmount: e.target.value === "" ? null : Number(e.target.value) || 0 })}
                                style={inputStyle} />
                        </label>
                        <NumField label="Female exempt up to" suffix="₹" value={rules.pt.femaleExemptUpTo}
                            onChange={n => up("pt", { femaleExemptUpTo: n })} />
                    </div>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={fieldLabel}>Female exemption checked on</span>
                        <select value={rules.pt.femaleExemptOn} onChange={e => up("pt", { femaleExemptOn: e.target.value as PayrollRules["pt"]["femaleExemptOn"] })} style={inputStyle}>
                            <option value="structure">Full-month salary structure</option>
                            <option value="earned">Amount earned that month</option>
                        </select>
                    </label>
                    <Toggle label="Charge PT to CALL (contract) employees" checked={rules.pt.appliesToCall}
                        onChange={b => up("pt", { appliesToCall: b })}
                        hint="The wage rule book exempts CALL from PT; the system has historically charged it. Untick to follow the rule book." />
                </div>

                {/* ── OT, LWF & Defaults ── */}
                <div style={cardStyle}>
                    <div>
                        <h2 style={cardTitle}>Overtime, LWF &amp; Defaults</h2>
                        <p style={cardHint}>OT pay = OT rate/hour × OT hours. OT hours are the attendance OT figure when it is entered in hours, or OT days × hours per OT day. The rate/hour follows each site&apos;s OT rule (below). Defaults are used when a value is missing from a salary structure or attendance sheet.</p>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                            <span style={fieldLabel}>OT in attendance is</span>
                            <select value={rules.ot.inputUnit} onChange={e => up("ot", { inputUnit: e.target.value as "hours" | "days" })} style={inputStyle}>
                                <option value="hours">Hours — pay = rate × OT hours</option>
                                <option value="days">Days — hours = days × hours per day</option>
                            </select>
                        </label>
                        {rules.ot.inputUnit === "days"
                            ? <NumField label="Hours per OT day" value={rules.ot.hoursPerDay} onChange={n => up("ot", { hoursPerDay: n })} />
                            : <div />}
                        <NumField label="LWF employee" suffix="₹" value={rules.lwf.employeeDefault} onChange={n => up("lwf", { employeeDefault: n })} />
                        <NumField label="LWF employer" suffix="₹" value={rules.lwf.employerDefault} onChange={n => up("lwf", { employerDefault: n })} />
                    </div>
                    <p style={{ ...cardHint }}>LWF stays a manual per-month entry; these amounts only prefill the attendance template (Maharashtra: ₹6 / ₹12).</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                        <NumField label="Month days" value={rules.defaults.monthDays} onChange={n => up("defaults", { monthDays: n })} />
                        <NumField label="OT rate/hour" suffix="₹" value={rules.defaults.otRatePerHour} onChange={n => up("defaults", { otRatePerHour: n })} />
                        <NumField label="Canteen/day" suffix="₹" value={rules.defaults.canteenRatePerDay} onChange={n => up("defaults", { canteenRatePerDay: n })} />
                        <NumField label="Default DA" suffix="₹" value={rules.defaults.da} onChange={n => up("defaults", { da: n })} />
                        <NumField label="Default Bonus" suffix="₹" value={rules.defaults.bonus} onChange={n => up("defaults", { bonus: n })} />
                    </div>
                </div>

                {/* ── OT rule by site ── */}
                <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
                    <div>
                        <h2 style={cardTitle}>OT Rule by Site</h2>
                        <p style={cardHint}>One rule per site; sites not listed use the default. The rules themselves are editable: click Edit OT rules (or the ⚙) to add or change them.</p>
                    </div>
                    <OtSiteRules ot={rules.ot} onChange={p => up("ot", p)} />
                </div>

                {/* ── Pay & proration ── */}
                <div style={cardStyle}>
                    <div>
                        <h2 style={cardTitle}>Pay &amp; Proration</h2>
                        <p style={cardHint}>Earned pay = structure amount × days worked ÷ month days. Basic and DA are always cut by attendance; tick an allowance to pay it in full every month instead.</p>
                    </div>
                    {([["hra", "HRA"], ["washing", "Washing allowance"], ["conveyance", "Conveyance"], ["leaveWithWages", "Leave with wages"], ["bonus", "Bonus"], ["otherAllowance", "Other allowance"]] as const).map(([k, l]) => (
                        <Toggle key={k} label={`Pay ${l} in full (not by days worked)`} checked={rules.pay.fullMonth[k]}
                            onChange={b => up("pay", { fullMonth: { ...rules.pay.fullMonth, [k]: b } })} />
                    ))}
                    <Toggle label="Round each earned amount to the rupee" checked={rules.pay.roundEarned}
                        onChange={b => up("pay", { roundEarned: b })} hint="Off = kept to the paise (net pay is still a whole rupee on the bank sheet)." />
                </div>

                {/* ── Contract (CALL) employees ── */}
                <div style={cardStyle}>
                    <div>
                        <h2 style={cardTitle}>Contract (CALL) Employees</h2>
                        <p style={cardHint}>Employees whose salary structure is marked CALL. By default they get none of these; PT for CALL is set in the PT card.</p>
                    </div>
                    <Toggle label="Deduct PF for CALL employees" checked={rules.call.pf} onChange={b => up("call", { pf: b })} />
                    <Toggle label="Deduct ESIC for CALL employees" checked={rules.call.esic} onChange={b => up("call", { esic: b })} />
                    <Toggle label="Pay HRA to CALL employees" checked={rules.call.hra} onChange={b => up("call", { hra: b })} />
                    <Toggle label="Pay Bonus to CALL employees" checked={rules.call.bonus} onChange={b => up("call", { bonus: b })} />
                </div>

                {/* ── Rounding ── */}
                <div style={cardStyle}>
                    <div>
                        <h2 style={cardTitle}>Rounding</h2>
                        <p style={cardHint}>How statutory amounts are rounded to the rupee. ESIC rules say round up; PF is normally the nearest rupee. Employer PF parts always use the nearest rupee (EPFO).</p>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        {([["pf", "Employee PF"], ["esic", "ESIC (employee & employer)"]] as const).map(([k, l]) => (
                            <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <span style={fieldLabel}>{l}</span>
                                <select value={rules.rounding[k]} onChange={e => up("rounding", { [k]: e.target.value } as Partial<PayrollRules["rounding"]>)} style={inputStyle}>
                                    <option value="nearest">Nearest rupee</option>
                                    <option value="up">Round up</option>
                                </select>
                            </label>
                        ))}
                    </div>
                </div>

                {/* ── Full & final settlement ── */}
                <div style={cardStyle}>
                    <div>
                        <h2 style={cardTitle}>Full &amp; Final Settlement</h2>
                        <p style={cardHint}>Used for exit F&amp;F and the FNF report. Gratuity = (Basic + DA) × days ÷ divisor × years of service.</p>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <NumField label="Gratuity days per year" value={rules.fnf.gratuityDays} onChange={n => up("fnf", { gratuityDays: n })} />
                        <NumField label="Gratuity divisor (days in month)" value={rules.fnf.gratuityDivisor} onChange={n => up("fnf", { gratuityDivisor: n })} />
                        <NumField label="Service needed for gratuity (days)" value={rules.fnf.gratuityMinDays} onChange={n => up("fnf", { gratuityMinDays: n })} />
                        <NumField label="Gratuity cap" suffix="₹" value={rules.fnf.gratuityCap} onChange={n => up("fnf", { gratuityCap: n })} />
                        <NumField label="Count part-year as a year from (months)" value={rules.fnf.roundUpMonthsFrom} onChange={n => up("fnf", { roundUpMonthsFrom: n })} />
                        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={fieldLabel}>Leave encashment on</span>
                            <select value={rules.fnf.encashOn} onChange={e => up("fnf", { encashOn: e.target.value as PayrollRules["fnf"]["encashOn"] })} style={inputStyle}>
                                <option value="basicDa">Basic + DA</option>
                                <option value="gross">Gross salary</option>
                            </select>
                        </label>
                        <NumField label="Encashment divisor (days)" value={rules.fnf.encashDivisor} onChange={n => up("fnf", { encashDivisor: n })} />
                        <NumField label="Notice pay divisor (days)" value={rules.fnf.noticeDivisor} onChange={n => up("fnf", { noticeDivisor: n })} />
                    </div>
                    <p style={cardHint}>Default service rule: 4 years 240 days = 1,700 days (Payment of Gratuity Act, as courts read 5 years).</p>
                </div>

                {/* ── Establishment codes ── */}
                <div style={cardStyle}>
                    <div>
                        <h2 style={cardTitle}>Establishment Codes</h2>
                        <p style={cardHint}>Printed on the headers of PF / ESIC compliance reports.</p>
                    </div>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={fieldLabel}>PF establishment code</span>
                        <input value={rules.codes.pfEstablishment} style={inputStyle}
                            onChange={e => up("codes", { pfEstablishment: e.target.value })} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={fieldLabel}>ESIC establishment code</span>
                        <input value={rules.codes.esicEstablishment} style={inputStyle}
                            onChange={e => up("codes", { esicEstablishment: e.target.value })} />
                    </label>
                </div>

                {/* ── Live preview ── */}
                <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <FlaskConical size={16} style={{ color: "var(--accent)" }} />
                        <h2 style={cardTitle}>Live Preview</h2>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>— sample employee computed with the rules as edited above (unsaved edits included)</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
                        <NumField label="Basic" value={sample.basic} onChange={n => upSample({ basic: n })} />
                        <NumField label="DA" value={sample.da} onChange={n => upSample({ da: n })} />
                        <NumField label="HRA" value={sample.hra} onChange={n => upSample({ hra: n })} />
                        <NumField label="Washing" value={sample.washing} onChange={n => upSample({ washing: n })} />
                        <NumField label="Bonus" value={sample.bonus} onChange={n => upSample({ bonus: n })} />
                        <NumField label="Other Allow." value={sample.otherAllowance} onChange={n => upSample({ otherAllowance: n })} />
                        <NumField label="Month days" value={sample.monthDays} onChange={n => upSample({ monthDays: n })} />
                        <NumField label="Worked days" value={sample.workedDays} onChange={n => upSample({ workedDays: n })} />
                        <NumField label="OT days" value={sample.otDays} onChange={n => upSample({ otDays: n })} />
                        <NumField label="LWF" value={sample.lwf} onChange={n => upSample({ lwf: n })} />
                        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={fieldLabel}>Gender</span>
                            <select value={sample.gender} onChange={e => upSample({ gender: e.target.value })} style={inputStyle}>
                                <option>Male</option>
                                <option>Female</option>
                            </select>
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={fieldLabel}>Type</span>
                            <select value={sample.complianceType} onChange={e => upSample({ complianceType: e.target.value })} style={inputStyle}>
                                <option value="OR">OR (full compliance)</option>
                                <option value="CALL">CALL (contract)</option>
                            </select>
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={fieldLabel}>Month</span>
                            <select value={sample.month} onChange={e => upSample({ month: Number(e.target.value) })} style={inputStyle}>
                                <option value={1}>Standard</option>
                                <option value={2}>February</option>
                            </select>
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={fieldLabel}>PF / ESIC rule</span>
                            <select value={sample.newRule ? "new" : "old"} onChange={e => upSample({ newRule: e.target.value === "new" })} style={inputStyle}>
                                <option value="new">From {MONTHS[rules.revision.effectiveMonth - 1]} {rules.revision.effectiveYear}</option>
                                <option value="old">Before {MONTHS[rules.revision.effectiveMonth - 1]} {rules.revision.effectiveYear}</option>
                            </select>
                        </label>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                            <thead>
                                <tr style={{ background: "var(--surface2)" }}>
                                    {["Basic + DA", "PF Base (capped)", "PF (Emp)", "ESIC (Emp)", "PT", "LWF", "Total Ded.", "Net Pay", "PF (Emplr)", "ESIC (Emplr)", "CTC"].map(h => (
                                        <th key={h} style={{ padding: "8px 10px", textAlign: "right", fontSize: 10.5, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.3px", borderBottom: "2px solid var(--border)" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const pfBase = Math.min(sample.basic + sample.da, previewRules.pf.wageCeiling)
                                    return (
                                        <tr>
                                            {[sample.basic + sample.da, pfBase, preview.pfEmployee, preview.esiEmployee, preview.pt, preview.lwf,
                                              preview.totalDeductions, preview.netSalary, preview.pfEmployer, preview.esiEmployer, preview.ctc,
                                            ].map((v, i) => (
                                                <td key={i} style={{
                                                    padding: "9px 10px", textAlign: "right", fontWeight: i === 7 || i === 10 ? 800 : 600,
                                                    color: i === 7 ? "#15803d" : i === 10 ? "#7c3aed" : i === 1 ? "#d97706" : "var(--text)",
                                                    borderBottom: "1px solid var(--border)",
                                                }}>{fmt(v)}</td>
                                            ))}
                                        </tr>
                                    )
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
