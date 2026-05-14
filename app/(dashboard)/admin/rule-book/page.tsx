"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import {
    BookOpen, ChevronRight, IndianRupee, Calculator, FileText,
    CheckCircle2, XCircle, Info, AlertCircle, Pencil, Lock
} from "lucide-react"

const SECTIONS = ["Earnings", "Attendance", "Calculated Earnings", "Employee Deductions", "Employer Contributions", "Summary", "Import Reference", "Compliance Types"] as const
type Section = typeof SECTIONS[number]

const tag = (label: string, color: string) => ({ label, color })

const EARNINGS_ROWS = [
    { col: "BASIC", rule: "Manually entered per employee in salary setup", call: "Same value", type: tag("MANUAL", "#2563eb"), notes: "Foundation for all proration and deduction calculations" },
    { col: "DA", rule: "Manually entered per employee", call: "₹0", type: tag("MANUAL", "#2563eb"), notes: "Dearness Allowance — applied only for OR compliance" },
    { col: "HRA", rule: "Manually entered — NO auto-calculation", call: "₹0", type: tag("MANUAL", "#2563eb"), notes: "House Rent Allowance — was (Basic+DA)×5% earlier, now fully manual" },
    { col: "Washing", rule: "Manually entered per employee", call: "₹0", type: tag("MANUAL", "#2563eb"), notes: "Excluded from ESIC wage base" },
    { col: "Conveyance", rule: "Manually entered per employee", call: "₹0", type: tag("MANUAL", "#2563eb"), notes: "Transport allowance" },
    { col: "LWW", rule: "Manually entered per employee", call: "₹0", type: tag("MANUAL", "#2563eb"), notes: "Leave With Wages" },
    { col: "Bonus", rule: "Manually entered — NO auto-calculation", call: "₹0", type: tag("MANUAL", "#2563eb"), notes: "Per Payment of Bonus Act. Was (Basic+DA)×8.33% earlier, now fully manual. Excluded from ESIC base." },
    { col: "Other Allowance", rule: "Manually entered per employee", call: "₹0", type: tag("MANUAL", "#2563eb"), notes: "Any additional allowance" },
]

const ATTENDANCE_ROWS = [
    { col: "Month Days", rule: "Calendar days in the payroll month (e.g. 31 for March)", notes: "Denominator for all proration calculations" },
    { col: "Worked Days", rule: "Actual days employee worked that month", notes: "Entered manually or imported via Excel" },
    { col: "OT Days", rule: "Number of overtime days — 1 OT Day = 4 hours", notes: "OT Pay = OT_Rate × 4 × OT_Days" },
    { col: "Canteen Days", rule: "Days employee used canteen facility", notes: "Used to calculate canteen deduction" },
    { col: "Penalty", rule: "Manual penalty amount (₹)", notes: "Deducted from net salary" },
    { col: "Advance", rule: "Salary advance already paid (₹)", notes: "Deducted from net salary" },
    { col: "Other Deductions", rule: "Any other manual deduction (₹)", notes: "Deducted from net salary" },
    { col: "Production Incentive", rule: "Incentive for production targets (₹)", notes: "Added to earned gross" },
    { col: "LWF", rule: "Labour Welfare Fund — Maharashtra: ₹6/month", notes: "Statutory deduction" },
]

const CALC_ROWS = [
    { col: "Prorated Basic", formula: "ROUND(Basic × WorkedDays / MonthDays)", notes: "Multiply first, then divide — Excel-exact" },
    { col: "Prorated DA", formula: "ROUND(DA × WorkedDays / MonthDays)", notes: "Same proration rule for all components" },
    { col: "Prorated HRA", formula: "ROUND(HRA × WorkedDays / MonthDays)", notes: "Uses stored HRA value — no auto-calc" },
    { col: "Prorated Washing", formula: "ROUND(Washing × WorkedDays / MonthDays)", notes: "" },
    { col: "Prorated Conveyance", formula: "ROUND(Conveyance × WorkedDays / MonthDays)", notes: "" },
    { col: "Prorated LWW", formula: "ROUND(LWW × WorkedDays / MonthDays)", notes: "" },
    { col: "Prorated Bonus", formula: "ROUND(Bonus × WorkedDays / MonthDays)", notes: "Uses stored Bonus value — no auto-calc" },
    { col: "Prorated Other", formula: "ROUND(OtherAllowance × WorkedDays / MonthDays)", notes: "" },
    { col: "OT Pay", formula: "ROUND(OT_Rate_Per_Hour × 4 × OT_Days)", notes: "1 OT Day = 4 hrs. e.g. ₹170/hr × 4 = ₹680/day" },
    { col: "Earned Gross", formula: "Sum of all prorated components + OT Pay + Production Incentive", notes: "Base for all deduction calculations" },
]

const DEDUCTION_ROWS = [
    { col: "PF Employee", formula: "WorkedDays ≥ 26 → ₹1,800   |   else ROUND(15000/26 × WorkedDays × 12%)", eligibility: "OR compliance only", call: "₹0" },
    { col: "ESIC Employee", formula: "CEIL(ESIC_Wages × 0.75%)   where ESIC_Wages = Earned Gross − Washing − Bonus", eligibility: "Structure Gross ≤ ₹21,000 (₹25,000 Handicap)", call: "₹0" },
    { col: "PT (Prof. Tax)", formula: "≤₹7,500 → ₹0 | ₹7,501–₹10,000 → ₹175 | >₹10,000 → ₹200 | Feb >₹10,000 → ₹300", eligibility: "All OR employees (Maharashtra slab)", call: "₹0" },
    { col: "LWF Employee", formula: "Maharashtra: ₹6 / month", eligibility: "All employees", call: "varies" },
    { col: "Canteen", formula: "Canteen_Days × Canteen_Rate_Per_Day", eligibility: "All employees", call: "same" },
    { col: "Penalty", formula: "As entered manually", eligibility: "—", call: "—" },
    { col: "Advance", formula: "As entered manually", eligibility: "—", call: "—" },
    { col: "Other Deductions", formula: "As entered manually", eligibility: "—", call: "—" },
]

const EMPLOYER_ROWS = [
    { col: "PF Employer", formula: "ROUND(15000 × 13%) = ₹1,950", breakdown: "12% EPF + 0.5% EDLI + 0.5% admin on ₹15,000 ceiling", call: "₹0" },
    { col: "ESIC Employer", formula: "CEIL(ESIC_Wages × 3.25%)", breakdown: "Same ESIC_Wages base as employee contribution", call: "₹0" },
]

const SUMMARY_ROWS = [
    { col: "Net Salary", formula: "Earned Gross − Total Deductions" },
    { col: "Total Deductions", formula: "PF_Emp + ESIC_Emp + PT + LWF + Canteen + Penalty + Advance + Other_Ded" },
    { col: "Structure Gross", formula: "Basic + DA + HRA + Washing + Conv + LWW + Bonus + Other  (full month, no proration)" },
    { col: "CTC Monthly", formula: "Structure Gross + PF_Employer + ESIC_Employer" },
    { col: "CTC Annual", formula: "CTC_Monthly × 12" },
]

const IMPORT_SAL = [
    { col: "EMP Code", field: "employeeId", type: "Text", notes: "Must match system exactly (case-insensitive)" },
    { col: "Basic", field: "basic", type: "Number", notes: "Manual entry required" },
    { col: "DA", field: "da", type: "Number", notes: "Manual entry required" },
    { col: "HRA ✦", field: "hra", type: "Number", notes: "Manual entry — NO auto-calculation" },
    { col: "Washing", field: "washing", type: "Number", notes: "" },
    { col: "Conveyance", field: "conveyance", type: "Number", notes: "" },
    { col: "Leave With Wages", field: "leaveWithWages", type: "Number", notes: "" },
    { col: "Other Allowance", field: "otherAllowance", type: "Number", notes: "" },
    { col: "Bonus ✦", field: "bonus", type: "Number", notes: "Manual entry — NO auto-calculation" },
    { col: "OT Rate Per Hour", field: "otRatePerHour", type: "Number", notes: "Default: 170" },
    { col: "Canteen Rate Per Day", field: "canteenRatePerDay", type: "Number", notes: "Default: 55" },
    { col: "Compliance Type", field: "complianceType", type: "OR / CALL", notes: "Default: OR" },
]

const IMPORT_ATT = [
    { col: "Employee ID", field: "employeeId", type: "Text", notes: "Must match system" },
    { col: "Month Days", field: "monthDays", type: "Number", notes: "Calendar days in month" },
    { col: "Worked Days", field: "workedDays", type: "Number", notes: "Actual days worked" },
    { col: "OT Days", field: "otDays", type: "Number", notes: "1 OT Day = 4 hrs" },
    { col: "Canteen Days", field: "canteenDays", type: "Number", notes: "Days canteen used" },
    { col: "Penalty", field: "penalty", type: "Number", notes: "Default: 0" },
    { col: "Advance", field: "advance", type: "Number", notes: "Default: 0" },
    { col: "Other Deductions", field: "otherDeductions", type: "Number", notes: "Default: 0" },
    { col: "Production Incentive", field: "productionIncentive", type: "Number", notes: "Default: 0" },
    { col: "LWF", field: "lwf", type: "Number", notes: "Maharashtra: 6" },
]

const th = "px-3 py-2 text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider border-b border-[var(--border)]"
const td = "px-3 py-2.5 text-[12px] text-[var(--text)] border-b border-[var(--border)]"
const tdMono = "px-3 py-2.5 text-[11.5px] font-mono text-[#1e40af] border-b border-[var(--border)] bg-[#f8faff]"

export default function RuleBookPage() {
    const router = useRouter()
    const [active, setActive] = useState<Section>("Earnings")

    return (
        <div className="min-h-screen bg-[var(--background)]" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {/* Top Bar */}
            <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text3)", cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/admin")}>Admin</span>
                <ChevronRight size={11} style={{ color: "var(--text3)" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text2)" }}>Wage Sheet Rule Book</span>
            </div>

            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
                {/* Left Sidebar — Section Nav */}
                <div style={{ width: 220, background: "var(--surface)", borderRight: "1px solid var(--border)", padding: "20px 12px", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingLeft: 8 }}>
                        <BookOpen size={16} style={{ color: "var(--accent)" }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Rule Book</span>
                    </div>
                    {SECTIONS.map(s => (
                        <button key={s} onClick={() => setActive(s)}
                            style={{
                                textAlign: "left", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: active === s ? 600 : 400,
                                background: active === s ? "var(--accent-light)" : "transparent",
                                color: active === s ? "var(--accent-text)" : "var(--text2)",
                                border: "none", cursor: "pointer", width: "100%", transition: "all 0.15s",
                            }}>
                            {s}
                        </button>
                    ))}
                    <div style={{ marginTop: "auto", paddingTop: 20, paddingLeft: 8 }}>
                        <div style={{ fontSize: 10, color: "var(--text3)", lineHeight: 1.6 }}>
                            ✦ Manual entry only<br />
                            Verified: VARROC PUNE MAR CAL
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>

                    {active === "Earnings" && (
                        <Section title="Earnings — Salary Structure (Manual Input)" icon={<Pencil size={16} />}
                            desc="All earning components are stored manually per employee in the Salary Structure. None of these are auto-calculated from a formula.">
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr style={{ background: "var(--surface2)" }}>
                                    <th className={th} style={{ width: 130 }}>Column</th>
                                    <th className={th}>Rule / Source</th>
                                    <th className={th} style={{ width: 80 }}>CALL</th>
                                    <th className={th} style={{ width: 70 }}>Type</th>
                                    <th className={th}>Notes</th>
                                </tr></thead>
                                <tbody>
                                    {EARNINGS_ROWS.map(r => (
                                        <tr key={r.col} style={{ background: "var(--surface)" }}>
                                            <td className={td}><span style={{ fontWeight: 700 }}>{r.col}</span></td>
                                            <td className={td}>{r.rule}</td>
                                            <td className={td} style={{ color: r.call === "₹0" ? "#dc2626" : "var(--text2)", fontWeight: 600 }}>{r.call}</td>
                                            <td className={td}>
                                                <span style={{ background: r.type.color + "18", color: r.type.color, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>
                                                    {r.type.label}
                                                </span>
                                            </td>
                                            <td className={td} style={{ color: "var(--text3)", fontSize: 11 }}>{r.notes}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>
                    )}

                    {active === "Attendance" && (
                        <Section title="Attendance Variables (Per Payroll Run)" icon={<FileText size={16} />}
                            desc="These values are entered manually or uploaded via Excel for each payroll run. They drive proration and deduction calculations.">
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr style={{ background: "var(--surface2)" }}>
                                    <th className={th} style={{ width: 160 }}>Column</th>
                                    <th className={th}>Rule</th>
                                    <th className={th}>Notes</th>
                                </tr></thead>
                                <tbody>
                                    {ATTENDANCE_ROWS.map(r => (
                                        <tr key={r.col} style={{ background: "var(--surface)" }}>
                                            <td className={td}><span style={{ fontWeight: 700 }}>{r.col}</span></td>
                                            <td className={td}>{r.rule}</td>
                                            <td className={td} style={{ color: "var(--text3)", fontSize: 11 }}>{r.notes}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>
                    )}

                    {active === "Calculated Earnings" && (
                        <Section title="Calculated Earnings (Auto — Prorated)" icon={<Calculator size={16} />}
                            desc="These are calculated automatically when payroll is processed. The proration formula multiplies first then divides — this matches Excel exactly and avoids floating-point drift.">
                            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-start" }}>
                                <Info size={14} style={{ color: "#2563eb", marginTop: 1, flexShrink: 0 }} />
                                <div style={{ fontSize: 12, color: "#1e40af" }}>
                                    <strong>Proration Rule:</strong> <code style={{ background: "#dbeafe", padding: "1px 6px", borderRadius: 4 }}>ROUND(component × WorkedDays / MonthDays)</code>
                                    &nbsp;— multiply FIRST, then divide. This is the Excel-exact formula verified against VARROC PUNE wage sheet.
                                </div>
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr style={{ background: "var(--surface2)" }}>
                                    <th className={th} style={{ width: 160 }}>Column</th>
                                    <th className={th}>Formula</th>
                                    <th className={th}>Notes</th>
                                </tr></thead>
                                <tbody>
                                    {CALC_ROWS.map(r => (
                                        <tr key={r.col} style={{ background: "var(--surface)" }}>
                                            <td className={td}><span style={{ fontWeight: 700 }}>{r.col}</span></td>
                                            <td className={tdMono}>{r.formula}</td>
                                            <td className={td} style={{ color: "var(--text3)", fontSize: 11 }}>{r.notes}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>
                    )}

                    {active === "Employee Deductions" && (
                        <Section title="Employee Deductions (Auto — deducted from salary)" icon={<IndianRupee size={16} />}
                            desc="These are calculated automatically and deducted from the employee's gross to arrive at net salary.">
                            <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-start" }}>
                                <AlertCircle size={14} style={{ color: "#92400e", marginTop: 1, flexShrink: 0 }} />
                                <div style={{ fontSize: 12, color: "#78350f" }}>
                                    <strong>ESIC Wage Base:</strong> <code style={{ background: "#fef08a", padding: "1px 6px", borderRadius: 4 }}>Earned Gross − Washing − Bonus</code>
                                    &nbsp;(OT included; Washing and Bonus excluded per ESIC rules)
                                </div>
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr style={{ background: "var(--surface2)" }}>
                                    <th className={th} style={{ width: 130 }}>Column</th>
                                    <th className={th}>Formula</th>
                                    <th className={th}>Eligibility</th>
                                    <th className={th} style={{ width: 70 }}>CALL</th>
                                </tr></thead>
                                <tbody>
                                    {DEDUCTION_ROWS.map(r => (
                                        <tr key={r.col} style={{ background: "var(--surface)" }}>
                                            <td className={td}><span style={{ fontWeight: 700 }}>{r.col}</span></td>
                                            <td className={tdMono} style={{ fontSize: 11 }}>{r.formula}</td>
                                            <td className={td} style={{ color: "var(--text3)", fontSize: 11 }}>{r.eligibility}</td>
                                            <td className={td} style={{ color: r.call === "₹0" ? "#dc2626" : "var(--text2)", fontWeight: 600 }}>{r.call}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* PT Slab */}
                            <div style={{ marginTop: 20 }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>PT Slab — Maharashtra</h3>
                                <table style={{ width: 400, borderCollapse: "collapse", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                                    <thead><tr style={{ background: "var(--surface2)" }}>
                                        <th className={th}>Earned Gross</th>
                                        <th className={th}>PT Amount</th>
                                    </tr></thead>
                                    <tbody>
                                        {[
                                            ["≤ ₹7,500", "₹0"],
                                            ["₹7,501 – ₹10,000", "₹175"],
                                            ["> ₹10,000 (standard month)", "₹200"],
                                            ["> ₹10,000 (February only)", "₹300 ← annual ₹100 adjustment"],
                                        ].map(([g, p]) => (
                                            <tr key={g} style={{ background: "var(--surface)" }}>
                                                <td className={td} style={{ fontFamily: "mono" }}>{g}</td>
                                                <td className={td} style={{ fontWeight: 700, color: "#dc2626" }}>{p}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>
                    )}

                    {active === "Employer Contributions" && (
                        <Section title="Employer Contributions (Cost to Company — NOT deducted from employee)" icon={<IndianRupee size={16} />}
                            desc="These are borne by the employer and added to the employee's CTC. They do NOT appear as deductions in the employee's salary slip.">
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr style={{ background: "var(--surface2)" }}>
                                    <th className={th} style={{ width: 130 }}>Column</th>
                                    <th className={th}>Formula</th>
                                    <th className={th}>Breakdown</th>
                                    <th className={th} style={{ width: 70 }}>CALL</th>
                                </tr></thead>
                                <tbody>
                                    {EMPLOYER_ROWS.map(r => (
                                        <tr key={r.col} style={{ background: "var(--surface)" }}>
                                            <td className={td}><span style={{ fontWeight: 700 }}>{r.col}</span></td>
                                            <td className={tdMono}>{r.formula}</td>
                                            <td className={td} style={{ color: "var(--text3)", fontSize: 11 }}>{r.breakdown}</td>
                                            <td className={td} style={{ color: "#dc2626", fontWeight: 600 }}>{r.call}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>
                    )}

                    {active === "Summary" && (
                        <Section title="Summary Columns" icon={<Calculator size={16} />}
                            desc="Final computed columns that summarise the payroll for each employee.">
                            <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-start" }}>
                                <Info size={14} style={{ color: "#15803d", marginTop: 1, flexShrink: 0 }} />
                                <div style={{ fontSize: 12, color: "#166534" }}>
                                    <strong>Structure Gross</strong> is full-month (no proration) — used for ESIC eligibility check and CTC.
                                    &nbsp;<strong>Earned Gross</strong> is prorated — used for actual payment and deduction calculations.
                                </div>
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr style={{ background: "var(--surface2)" }}>
                                    <th className={th} style={{ width: 160 }}>Column</th>
                                    <th className={th}>Formula</th>
                                </tr></thead>
                                <tbody>
                                    {SUMMARY_ROWS.map(r => (
                                        <tr key={r.col} style={{ background: "var(--surface)" }}>
                                            <td className={td}><span style={{ fontWeight: 700 }}>{r.col}</span></td>
                                            <td className={tdMono}>{r.formula}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>
                    )}

                    {active === "Import Reference" && (
                        <Section title="Excel Import — Column Reference" icon={<FileText size={16} />}
                            desc="Reference for all columns in both import Excel templates. HRA and Bonus are manual — they must be filled in the Excel sheet; they will not be auto-calculated.">
                            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8, marginTop: 4 }}>Salary Structure Template (salary_structure_master.xlsx)</h3>
                            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 28 }}>
                                <thead><tr style={{ background: "var(--surface2)" }}>
                                    <th className={th}>Excel Column</th>
                                    <th className={th}>DB Field</th>
                                    <th className={th} style={{ width: 90 }}>Data Type</th>
                                    <th className={th}>Notes</th>
                                </tr></thead>
                                <tbody>
                                    {IMPORT_SAL.map(r => (
                                        <tr key={r.col} style={{ background: "var(--surface)" }}>
                                            <td className={td}>
                                                <span style={{ fontWeight: r.col.includes("✦") ? 700 : 400, color: r.col.includes("✦") ? "#2563eb" : "inherit" }}>{r.col}</span>
                                            </td>
                                            <td className={tdMono}>{r.field}</td>
                                            <td className={td} style={{ color: "var(--text3)", fontSize: 11 }}>{r.type}</td>
                                            <td className={td} style={{ color: r.notes.includes("Manual") ? "#2563eb" : "var(--text3)", fontSize: 11, fontWeight: r.notes.includes("Manual") ? 600 : 400 }}>{r.notes}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Payroll Process Template (Growus_Payroll_MONTH_YEAR.xlsx)</h3>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr style={{ background: "var(--surface2)" }}>
                                    <th className={th}>Excel Column</th>
                                    <th className={th}>DB Field</th>
                                    <th className={th} style={{ width: 90 }}>Data Type</th>
                                    <th className={th}>Notes</th>
                                </tr></thead>
                                <tbody>
                                    {IMPORT_ATT.map(r => (
                                        <tr key={r.col} style={{ background: "var(--surface)" }}>
                                            <td className={td}><span style={{ fontWeight: 700 }}>{r.col}</span></td>
                                            <td className={tdMono}>{r.field}</td>
                                            <td className={td} style={{ color: "var(--text3)", fontSize: 11 }}>{r.type}</td>
                                            <td className={td} style={{ color: "var(--text3)", fontSize: 11 }}>{r.notes}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>
                    )}

                    {active === "Compliance Types" && (
                        <Section title="Compliance Types — OR vs CALL" icon={<ShieldCheck size={16} />}
                            desc="Every employee is assigned a compliance type in their salary structure. This determines which statutory deductions and allowances apply.">
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: 20 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                        <CheckCircle2 size={18} style={{ color: "#15803d" }} />
                                        <span style={{ fontSize: 16, fontWeight: 800, color: "#15803d" }}>OR — Full Compliance</span>
                                    </div>
                                    <p style={{ fontSize: 12, color: "#166534", marginBottom: 12 }}>Full-time / regular employees with all statutory benefits.</p>
                                    {[
                                        "PF Employee deducted",
                                        "PF Employer contributed (₹1,950)",
                                        "ESIC Employee deducted (if gross ≤ ₹21k)",
                                        "ESIC Employer contributed",
                                        "HRA from salary structure",
                                        "Bonus from salary structure",
                                        "DA, Washing, Conv, LWW apply",
                                        "Professional Tax deducted",
                                    ].map(i => (
                                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#166534", marginBottom: 4 }}>
                                            <CheckCircle2 size={12} style={{ flexShrink: 0 }} /> {i}
                                        </div>
                                    ))}
                                </div>
                                <div style={{ background: "#fffbeb", border: "1px solid #fde047", borderRadius: 12, padding: 20 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                        <XCircle size={18} style={{ color: "#b45309" }} />
                                        <span style={{ fontSize: 16, fontWeight: 800, color: "#b45309" }}>CALL — Contract (No Compliance)</span>
                                    </div>
                                    <p style={{ fontSize: 12, color: "#78350f", marginBottom: 12 }}>Temporary / contract employees — Basic salary only.</p>
                                    {[
                                        "PF: ₹0 (no PF deducted or contributed)",
                                        "ESIC: ₹0 (no ESIC)",
                                        "HRA: ₹0 (forced to zero)",
                                        "Bonus: ₹0 (forced to zero)",
                                        "DA: ₹0",
                                        "Washing, Conv, LWW, Other: ₹0",
                                        "PT: ₹0",
                                        "Only Basic salary applies",
                                    ].map(i => (
                                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#78350f", marginBottom: 4 }}>
                                            <XCircle size={12} style={{ flexShrink: 0 }} /> {i}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                                <Lock size={14} style={{ color: "var(--text3)", marginTop: 1 }} />
                                <div style={{ fontSize: 12, color: "var(--text2)" }}>
                                    The compliance type is set per employee in <strong>Payroll → Salary Structure Master</strong> or <strong>Payroll → Setup</strong>.
                                    It can also be updated via the Excel import template (Compliance Type column = OR or CALL).
                                </div>
                            </div>
                        </Section>
                    )}

                </div>
            </div>
        </div>
    )
}

function ShieldCheck({ size, style }: { size: number; style?: React.CSSProperties }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>
}

function Section({ title, icon, desc, children }: { title: string; icon: React.ReactNode; desc: string; children: React.ReactNode }) {
    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ color: "var(--accent)" }}>{icon}</div>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", margin: 0 }}>{title}</h2>
            </div>
            <p style={{ fontSize: 12, color: "var(--text3)", marginBottom: 16, lineHeight: 1.6 }}>{desc}</p>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                {children}
            </div>
        </div>
    )
}
