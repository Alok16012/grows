"use client"
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    ChevronRight, Loader2, Plus, RotateCcw, Save,
    Settings2, Trash2, FlaskConical, Info,
} from "lucide-react"
import { can } from "@/lib/can"
import { calcGrowusPayroll } from "@/lib/payroll-calc"
import { DEFAULT_PAYROLL_RULES, PayrollRules, PtSlab, sanitizePayrollRules } from "@/lib/payroll-rules"

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

    // Live-preview sample employee (fully editable)
    const [sample, setSample] = useState({
        basic: 12000, da: 2511, hra: 0, washing: 200, conveyance: 0,
        leaveWithWages: 0, otherAllowance: 0, bonus: 583,
        otRatePerHour: 170, canteenRatePerDay: 55,
        complianceType: "OR", isHandicap: false, gender: "Male",
        monthDays: 26, workedDays: 26, otDays: 0, canteenDays: 0, lwf: 0,
        month: 1,
    })

    useEffect(() => {
        fetch("/api/payroll/rules")
            .then(r => r.ok ? r.json() : Promise.reject(new Error("Failed to load rules")))
            .then(d => { if (d?.rules) { setRules(d.rules); setCustomized(!!d.customized) } })
            .catch(() => toast.error("Could not load saved rules — showing defaults"))
            .finally(() => setLoading(false))
    }, [])

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
            const res = await fetch("/api/payroll/rules", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rules }),
            })
            if (!res.ok) throw new Error(await res.text())
            const d = await res.json()
            setRules(d.rules)
            setCustomized(true)
            setDirty(false)
            toast.success("Calculation rules saved. They apply from the next payroll processing run.")
        } catch (e) { toast.error((e as Error).message || "Save failed") }
        finally { setSaving(false) }
    }

    const handleReset = async () => {
        if (!confirm("Reset all calculation rules to the verified Growus defaults? Your customizations will be removed.")) return
        setResetting(true)
        try {
            const res = await fetch("/api/payroll/rules", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reset: true }),
            })
            if (!res.ok) throw new Error(await res.text())
            const d = await res.json()
            setRules(d.rules)
            setCustomized(false)
            setDirty(false)
            toast.success("Rules reset to defaults")
        } catch (e) { toast.error((e as Error).message || "Reset failed") }
        finally { setResetting(false) }
    }

    // Live preview — computed with the CURRENT edits (sanitized like the server will)
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
        sanitizePayrollRules(rules)
    )
    const upSample = (patch: Partial<typeof sample>) => setSample(prev => ({ ...prev, ...patch }))

    const role = session?.user?.role
    if (role && !can(session, "payroll.manage")) {
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
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Settings2 size={22} style={{ color: "var(--accent)" }} />
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Payroll Calculation Settings</h1>
                        <p style={{ fontSize: 12.5, color: "var(--text3)", margin: "3px 0 0 0" }}>
                            Every rate, ceiling and slab the wage engine uses — editable here, no code changes needed.
                        </p>
                    </div>
                    <span style={{
                        padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: customized ? "#fef3c7" : "#dcfce7",
                        color: customized ? "#92400e" : "#15803d",
                    }}>
                        {customized ? "Customized" : "Growus defaults"}
                    </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={handleReset} disabled={resetting || saving} style={btnGhost}>
                        {resetting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Reset to defaults
                    </button>
                    <button onClick={handleSave} disabled={saving || resetting || !dirty}
                        style={{ ...btnPrimary, opacity: saving || !dirty ? 0.6 : 1 }}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save rules
                    </button>
                </div>
            </div>

            {/* Scope note */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 14px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: 12, color: "#1e40af", lineHeight: 1.55 }}>
                <Info size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>
                    Saved rules apply the <b>next time payroll is processed</b>. Months that are already processed or locked keep the
                    figures they were calculated with. CALL (contract) employees always skip PF and ESIC regardless of these settings.
                </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>

                {/* ── PF ── */}
                <div style={cardStyle}>
                    <div>
                        <h2 style={cardTitle}>Provident Fund (PF)</h2>
                        <p style={cardHint}>
                            <b>Formula:</b> PF = 12% of (Basic + DA), capped at wage ceiling.
                            If Basic + DA &gt; ₹15,000 → PF = ₹1,800 (fixed). If Basic + DA &le; ₹15,000 → PF = 12% of actual (Basic + DA).
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
                        <p style={cardHint}>Eligibility is checked on the full-month structure gross. Contribution base = earned gross minus the excluded components (OT stays included).</p>
                    </div>
                    <Toggle label="ESIC enabled" checked={rules.esic.enabled} onChange={b => up("esic", { enabled: b })} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <NumField label="Eligibility limit" suffix="₹" value={rules.esic.eligibilityLimit} onChange={n => up("esic", { eligibilityLimit: n })} />
                        <NumField label="Handicap limit" suffix="₹" value={rules.esic.handicapLimit} onChange={n => up("esic", { handicapLimit: n })} />
                        <NumField label="Employee rate" suffix="%" value={rules.esic.employeePct} onChange={n => up("esic", { employeePct: n })} />
                        <NumField label="Employer rate" suffix="%" value={rules.esic.employerPct} onChange={n => up("esic", { employerPct: n })} />
                    </div>
                    <Toggle label="Exclude Washing from ESIC wages" checked={rules.esic.excludeWashing} onChange={b => up("esic", { excludeWashing: b })} />
                    <Toggle label="Exclude Bonus from ESIC wages" checked={rules.esic.excludeBonus} onChange={b => up("esic", { excludeBonus: b })} />
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
                    <Toggle label="Charge PT to CALL (contract) employees" checked={rules.pt.appliesToCall}
                        onChange={b => up("pt", { appliesToCall: b })}
                        hint="The wage rule book exempts CALL from PT; the system has historically charged it. Untick to follow the rule book." />
                </div>

                {/* ── OT, LWF & Defaults ── */}
                <div style={cardStyle}>
                    <div>
                        <h2 style={cardTitle}>Overtime, LWF &amp; Defaults</h2>
                        <p style={cardHint}>OT pay = OT rate/hour × hours per OT day × OT days. Defaults are used when a value is missing from a salary structure or attendance sheet.</p>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        <NumField label="Hours per OT day" value={rules.ot.hoursPerDay} onChange={n => up("ot", { hoursPerDay: n })} />
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
                                    const pfBase = Math.min(sample.basic + sample.da, rules.pf.wageCeiling)
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
