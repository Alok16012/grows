"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Calculator, Download, Loader2, Settings, CheckCircle2,
    IndianRupee, Users, ChevronDown, ChevronUp, Edit2, Save, X, FileSpreadsheet,
    Upload, FileDown
} from "lucide-react"
// xlsx is lazy-loaded — only needed when a sheet is actually read or written.
// Eager import adds ~430KB to this page's initial bundle.
const loadXLSX = () => import("xlsx")
import { can } from "@/lib/can"
import { calcFullMonthCosts, calcGrowusPayroll } from "@/lib/payroll-calc"
import { DEFAULT_PAYROLL_RULES, PayrollRules } from "@/lib/payroll-rules"

// ─── Types ────────────────────────────────────────────────────────────────────
type SalarySalary = {
    basic: number; da: number; hra: number; bonus: number; washing: number; conveyance: number
    leaveWithWages: number; otherAllowance: number
    otRatePerHour: number; canteenRatePerDay: number; status: string
    complianceType: string   // "CALL" | "OR"
}

type AttInput = {
    monthDays: number; workedDays: number; otDays: number; canteenDays: number
    penalty: number; advance: number; otherDeductions: number; productionIncentive: number; lwf: number
}

type CalcResult = {
    basicFull: number; daFull: number; hraFull: number; washingFull: number
    conveyanceFull: number; lwwFull: number; bonusFull: number; otherFull: number; grossFullMonth: number
    basicSalary: number; da: number; hra: number; washing: number; conveyance: number
    lwwEarned: number; bonus: number; allowances: number; otDays: number
    overtimePay: number; productionIncentive: number; grossSalary: number
    pfEmployee: number; esiEmployee: number; pfEmployer: number; esiEmployer: number
    pt: number; lwf: number; canteenDays: number; canteen: number
    penalty: number; advance: number; otherDeductions: number; totalDeductions: number
    netSalary: number; ctc: number
    // saved payroll fields
    workingDays?: number; presentDays?: number
}

type EmpRow = {
    id: string; employeeId: string; name: string; designation: string; site: string
    salary: SalarySalary | null; payroll: CalcResult | null; payrollId: string | null
    gender: string; isHandicap: boolean
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function fmt(n: number) {
    return "₹" + Math.round(n).toLocaleString("en-IN")
}

// ─── Preview ─────────────────────────────────────────────────────────────────
// Delegates to the same engine the server runs on Process (lib/payroll-calc.ts).
// This used to be a second, hand-written copy of the formula, and the two had
// drifted apart on PF (prorated ₹15,000 base vs 12% of capped basic+DA), PT
// (flat ₹200 vs the Maharashtra slab, including February's ₹300), employer PF
// (flat ₹1,950 vs four components), and ESIC eligibility (earned gross vs
// structure gross) — so the Net shown before Process differed from the Net saved
// after it. Keep this a thin adapter; the rules belong in payroll-calc.
function calcPreview(
    sal: SalarySalary,
    att: AttInput,
    gender = "Male",
    isHandicap = false,
    month?: number,
    rules: PayrollRules = DEFAULT_PAYROLL_RULES,
): CalcResult {
    return calcGrowusPayroll(
        {
            basic: sal.basic, da: sal.da, washing: sal.washing, conveyance: sal.conveyance,
            leaveWithWages: sal.leaveWithWages, otherAllowance: sal.otherAllowance,
            otRatePerHour: sal.otRatePerHour, canteenRatePerDay: sal.canteenRatePerDay,
            hra: sal.hra, bonus: sal.bonus, complianceType: sal.complianceType,
            isHandicap,
        },
        { ...att, gender, month },
        rules,
    )
}

// ─── Salary Setup Modal ───────────────────────────────────────────────────────
function SalaryModal({ emp, rules, onClose, onSaved }: {
    emp: EmpRow; rules: PayrollRules; onClose: () => void; onSaved: (s: SalarySalary) => void
}) {
    const [form, setForm] = useState<SalarySalary>(emp.salary ?? {
        basic: 0, da: 0, hra: 0, bonus: 0, washing: 0, conveyance: 0, leaveWithWages: 0,
        otherAllowance: 0,
        otRatePerHour: rules.defaults.otRatePerHour,
        canteenRatePerDay: rules.defaults.canteenRatePerDay,
        status: "APPROVED", complianceType: "OR"
    })
    const [saving, setSaving] = useState(false)

    // Preview through the shared engine with the company's configured rules —
    // the same figures Process will save (the old panel hardcoded ₹1,800 PF
    // and ₹200 PT regardless of the numbers being typed).
    const costs = calcFullMonthCosts({
        basic: form.basic, da: form.da, washing: form.washing, conveyance: form.conveyance,
        leaveWithWages: form.leaveWithWages, otherAllowance: form.otherAllowance,
        hra: form.hra ?? 0, bonus: form.bonus ?? 0,
        complianceType: form.complianceType, isHandicap: emp.isHandicap,
    }, { gender: emp.gender }, rules)
    const gross = costs.grossFullMonth

    const save = async () => {
        setSaving(true)
        try {
            const res = await fetch(`/api/payroll/salary-structure/${emp.id}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form)
            })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            toast.success("Salary structure saved!")
            onSaved(data)
            onClose()
        } catch {
            toast.error("Failed to save salary structure")
        } finally { setSaving(false) }
    }

    const n = (field: keyof SalarySalary) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [field]: parseFloat(e.target.value) || 0 }))

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                    <div>
                        <h2 className="text-[16px] font-semibold">{emp.name}</h2>
                        <p className="text-[12px] text-[var(--text3)]">Set Salary Components</p>
                    </div>
                    <button onClick={onClose}><X size={18} /></button>
                </div>
                <div className="p-6 space-y-4">

                    {/* Compliance Type Selector */}
                    <div>
                        <label className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide block mb-2">
                            Compliance Type <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            {([
                                { value: "OR", label: "OR — With Compliance", desc: "PF + ESIC + PT", color: "#1a9e6e", bg: "#e8f7f1", border: "#86efac" },
                                { value: "CALL", label: "CALL — Without Compliance", desc: "PT only (No PF / ESIC)", color: "#d97706", bg: "#fffbeb", border: "#fcd34d" },
                            ] as const).map(opt => (
                                <button key={opt.value} type="button"
                                    onClick={() => setForm(f => ({ ...f, complianceType: opt.value }))}
                                    className="text-left p-3 rounded-xl border-2 transition-all"
                                    style={{
                                        borderColor: form.complianceType === opt.value ? opt.border : "var(--border)",
                                        background: form.complianceType === opt.value ? opt.bg : "white",
                                    }}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0"
                                            style={{ borderColor: opt.color }}>
                                            {form.complianceType === opt.value && (
                                                <div className="w-2 h-2 rounded-full" style={{ background: opt.color }} />
                                            )}
                                        </div>
                                        <span className="text-[12px] font-semibold" style={{ color: opt.color }}>{opt.label}</span>
                                    </div>
                                    <p className="text-[11px] text-[var(--text3)] ml-5">{opt.desc}</p>
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-[var(--text3)] mt-1.5 px-1">
                            PT is auto-applied per the configured slabs (female exemption applies) in both modes
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {([
                            ["basic","BASIC",true],["da","DA (Dearness Allowance)",true],
                            ["hra","HRA (₹)",false],["bonus","Bonus (₹)",false],
                            ["washing","Washing Allowance",false],["conveyance","Conveyance",false],
                            ["leaveWithWages","Leave With Wages",false],["otherAllowance","Other Allowance",false],
                            ["otRatePerHour","OT Rate/Hour (₹)",false],["canteenRatePerDay","Canteen Rate/Day (₹)",false],
                        ] as [keyof SalarySalary, string, boolean][]).map(([key, label, required]) => (
                            <div key={key}>
                                <label className="text-[11px] font-medium text-[var(--text3)] block mb-1">
                                    {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                                </label>
                                <input type="number" value={form[key] as number}
                                    onChange={n(key)}
                                    className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]" />
                            </div>
                        ))}
                    </div>
                    {/* Auto-calculated preview — shared engine + configured rules */}
                    <div className="bg-[var(--surface)] rounded-xl p-4 text-[12px] space-y-1">
                        <div className="font-semibold text-[var(--text)] mb-2">Auto-calculated (full month)</div>
                        <div className="flex justify-between"><span className="text-[var(--text3)]">HRA (manual entry)</span><span className="font-medium">₹{Math.round(costs.hraFull).toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-[var(--text3)]">Bonus (manual entry)</span><span className="font-medium">₹{Math.round(costs.bonusFull).toLocaleString()}</span></div>
                        <div className="flex justify-between border-t border-[var(--border)] pt-1 mt-1">
                            <span className="font-semibold">Full Month GROSS</span>
                            <span className="font-bold text-[var(--accent)]">₹{Math.round(gross).toLocaleString()}</span>
                        </div>
                        {/* Compliance preview */}
                        <div className="border-t border-[var(--border)] pt-2 mt-1 space-y-1">
                            <div className="text-[10.5px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Deductions ({emp.gender || "Male"})</div>
                            {form.complianceType === "OR" ? (
                                <>
                                    <div className="flex justify-between"><span className="text-[var(--text3)]">PF (Employee {rules.pf.employeePct}%)</span><span className="text-red-600">-₹{costs.pfEmployee.toLocaleString()}</span></div>
                                    <div className="flex justify-between"><span className="text-[var(--text3)]">ESIC {costs.esiEmployee === 0 ? `(gross > ₹${Math.round(rules.esic.eligibilityLimit / 1000)}k, N/A)` : `(${rules.esic.employeePct}%)`}</span><span className="text-red-600">{costs.esiEmployee === 0 ? "₹0" : `-₹${costs.esiEmployee.toLocaleString()}`}</span></div>
                                </>
                            ) : (
                                <div className="flex justify-between text-amber-700"><span>PF & ESIC</span><span className="font-semibold">Not Applicable</span></div>
                            )}
                            <div className="flex justify-between"><span className="text-[var(--text3)]">PT</span><span className="text-red-600">{costs.pt ? `-₹${costs.pt.toLocaleString()}` : "₹0"}</span></div>
                            <div className="flex justify-between border-t border-[var(--border)] pt-1 mt-1">
                                <span className="font-semibold">Net (full month)</span>
                                <span className="font-bold text-emerald-700">₹{Math.round(costs.netSalary).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-[13px] border border-[var(--border)] rounded-lg">Cancel</button>
                    <button onClick={save} disabled={saving}
                        className="px-4 py-2 text-[13px] bg-[var(--accent)] text-white rounded-lg flex items-center gap-2 disabled:opacity-60">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PayrollPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [month, setMonth] = useState(new Date().getMonth() + 1)
    const [year, setYear]   = useState(new Date().getFullYear())
    const [employees, setEmployees] = useState<EmpRow[]>([])
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState(false)
    const [salaryModal, setSalaryModal] = useState<EmpRow | null>(null)
    // Company calculation rules — previews must match what Process will save
    const [rules, setRules] = useState<PayrollRules>(DEFAULT_PAYROLL_RULES)
    useEffect(() => {
        fetch("/api/payroll/rules")
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.rules) setRules(d.rules) })
            .catch(() => { /* previews fall back to defaults */ })
    }, [])
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [tab, setTab] = useState<"payroll"|"setup">("payroll")
    // Attendance inputs per employee
    const [attInputs, setAttInputs] = useState<Record<string, AttInput>>({})
    // Bulk upload salary state
    const [bulkUploading, setBulkUploading] = useState(false)

    const defaultAtt = useCallback((): AttInput => ({
        monthDays: new Date(year, month, 0).getDate(),
        workedDays: new Date(year, month, 0).getDate(),
        otDays: 0, canteenDays: 0, penalty: 0, advance: 0,
        otherDeductions: 0, productionIncentive: 0, lwf: 0
    }), [month, year])

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [empRes, payRes] = await Promise.all([
                // Only current staff. The default list also returns TERMINATED /
                // RESIGNED / INACTIVE people, and processing posts every loaded
                // row, so leavers were still being given payroll rows.
                fetch("/api/employees?pageSize=1000&status=ACTIVE"),
                fetch(`/api/payroll?month=${month}&year=${year}&limit=1000`)
            ])
            const emps = empRes.ok ? await empRes.json() : []
            const paysRaw = payRes.ok ? await payRes.json() : []
            const empList: any[] = Array.isArray(emps) ? emps : (emps.employees ?? [])
            const pays: any[] = Array.isArray(paysRaw) ? paysRaw : (paysRaw.payrolls ?? [])

            const rows: EmpRow[] = empList.map((e: any) => {
                const pay = pays.find((p: any) => p.employeeId === e.id)
                return {
                    id: e.id, employeeId: e.employeeId,
                    name: `${e.firstName} ${e.lastName}`,
                    designation: e.designation ?? "-",
                    site: e.deployments?.[0]?.site?.name ?? "-",
                    salary: e.employeeSalary ?? null,
                    payroll: pay ?? null,
                    payrollId: pay?.id ?? null,
                    // Both feed statutory rules (PT female exemption, ESIC limit),
                    // so the preview must know them to match what Process saves.
                    gender: e.gender ?? "Male",
                    isHandicap: !!e.isHandicap,
                }
            })
            setEmployees(rows)

            // Init attendance inputs from saved payroll or defaults
            const init: Record<string, AttInput> = {}
            rows.forEach(r => {
                if (r.payroll) {
                    init[r.id] = {
                        monthDays:           r.payroll.workingDays ?? new Date(year, month, 0).getDate(),
                        workedDays:          r.payroll.presentDays ?? new Date(year, month, 0).getDate(),
                        otDays:              r.payroll.otDays ?? 0,
                        canteenDays:         r.payroll.canteenDays ?? 0,
                        penalty:             r.payroll.penalty ?? 0,
                        advance:             r.payroll.advance ?? 0,
                        otherDeductions:     r.payroll.otherDeductions ?? 0,
                        productionIncentive: r.payroll.productionIncentive ?? 0,
                        lwf:                 r.payroll.lwf ?? 0,
                    } as AttInput
                } else {
                    init[r.id] = defaultAtt()
                }
            })
            setAttInputs(init)
        } catch (e) {
            console.error(e)
        } finally { setLoading(false) }
    }, [month, year, defaultAtt])

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        else if (status === "authenticated") loadData()
    }, [status, router, loadData])

    const setAtt = (empId: string, field: keyof AttInput, val: number) => {
        setAttInputs(prev => ({
            ...prev,
            [empId]: { ...(prev[empId] ?? defaultAtt()), [field]: val }
        }))
    }

    const processPayroll = async () => {
        setProcessing(true)
        try {
            const attendance = Object.entries(attInputs).map(([employeeId, att]) => ({ employeeId, ...att }))
            const res = await fetch("/api/payroll/calculate", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month, year, attendance })
            })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            toast.success(`Payroll processed for ${data.processedCount} employees!`)
            await loadData()
        } catch (e: any) {
            toast.error(e.message || "Failed to process payroll")
        } finally { setProcessing(false) }
    }

    const exportExcel = async () => {
        try {
            const XLSX = await loadXLSX()
            const res = await fetch(`/api/payroll/export?month=${month}&year=${year}`)
            if (!res.ok) throw new Error("No payroll data found. Process payroll first.")
            const rows = await res.json()
            const ws = XLSX.utils.json_to_sheet(rows)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "STRUCTURE")
            XLSX.writeFile(wb, `Growus_Payroll_${MONTHS[month-1]}_${year}.xlsx`)
            toast.success("Excel downloaded!")
        } catch (e: any) { toast.error(e.message) }
    }

    const downloadSalaryTemplate = async () => {
        const XLSX = await loadXLSX()
        const headers = [["Employee ID", "Basic", "DA", "HRA", "Bonus", "Washing", "Conveyance", "Leave With Wages", "Other Allowance", "OT Rate/Hour", "Canteen Rate/Day", "Compliance Type (OR/CALL)"]]
        const sampleRows = employees.slice(0, 3).map(e => [
            e.employeeId,
            e.salary?.basic ?? 0,
            e.salary?.da ?? 0,
            (e.salary as { hra?: number } | null)?.hra ?? 0,
            (e.salary as { bonus?: number } | null)?.bonus ?? 0,
            e.salary?.washing ?? 0,
            e.salary?.conveyance ?? 0,
            e.salary?.leaveWithWages ?? 0,
            e.salary?.otherAllowance ?? 0,
            e.salary?.otRatePerHour ?? 170,
            e.salary?.canteenRatePerDay ?? 55,
            e.salary?.complianceType ?? "OR",
        ])
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet([...headers, ...sampleRows])
        ws["!cols"] = headers[0].map(h => ({ wch: Math.max(h.length + 2, 14) }))
        XLSX.utils.book_append_sheet(wb, ws, "Salary Template")
        XLSX.writeFile(wb, "Salary_Structure_Template.xlsx")
        toast.success("Template downloaded! Fill and re-upload.")
    }

    const handleBulkSalaryUpload = async (ev: React.ChangeEvent<HTMLInputElement>) => {
        const file = ev.target.files?.[0]
        if (!file) return
        setBulkUploading(true)
        try {
            const XLSX = await loadXLSX()
            const ab = await file.arrayBuffer()
            const wb = XLSX.read(ab)
            const ws = wb.Sheets[wb.SheetNames[0]]
            const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws)
            if (!rows.length) { toast.error("No data found in the file."); return }

            // Process all rows in parallel (faster than sequential)
            const results = await Promise.allSettled(
                rows.map(async (row) => {
                    const empId = String(row["Employee ID"] ?? "").trim()
                    if (!empId) throw new Error("No Employee ID")
                    const emp = employees.find(e => e.employeeId === empId)
                    if (!emp) throw new Error(`Employee not found: ${empId}`)
                    const res = await fetch(`/api/payroll/salary-structure/${emp.id}`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            basic: Number(row["Basic"]) || 0,
                            da: Number(row["DA"]) || 0,
                            hra: Number(row["HRA"]) || 0,
                            bonus: Number(row["Bonus"]) || 0,
                            washing: Number(row["Washing"]) || 0,
                            conveyance: Number(row["Conveyance"]) || 0,
                            leaveWithWages: Number(row["Leave With Wages"]) || 0,
                            otherAllowance: Number(row["Other Allowance"]) || 0,
                            otRatePerHour: Number(row["OT Rate/Hour"]) || 170,
                            canteenRatePerDay: Number(row["Canteen Rate/Day"]) || 55,
                            complianceType: String(row["Compliance Type (OR/CALL)"] ?? "OR").trim() === "CALL" ? "CALL" : "OR",
                            status: "APPROVED",
                        }),
                    })
                    if (!res.ok) throw new Error(`API error: ${res.status}`)
                })
            )
            const success = results.filter(r => r.status === "fulfilled").length
            const failed  = results.filter(r => r.status === "rejected").length
            if (success > 0) toast.success(`Salary set for ${success} employee(s)${failed > 0 ? `, ${failed} failed` : ""}.`)
            else toast.error(`All ${failed} rows failed — check the Employee ID column.`)
            await loadData()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "File read karne mein error.")
        } finally {
            setBulkUploading(false)
            ev.target.value = ""
        }
    }

    if (status === "loading" || loading) {
        return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-[var(--accent)]" /></div>
    }
    if (!can(session, "payroll.view")) {
        return <div className="p-8 text-center text-red-500">Access Denied</div>
    }

    const withSalary  = employees.filter(e => e.salary)
    const noSalary    = employees.filter(e => !e.salary)
    const processed   = employees.filter(e => e.payroll)

    // Summary totals
    const totalGross = processed.reduce((s, e) => s + (e.payroll?.grossSalary ?? 0), 0)
    const totalNet   = processed.reduce((s, e) => s + (e.payroll?.netSalary ?? 0), 0)
    const totalPF    = processed.reduce((s, e) => s + (e.payroll?.pfEmployee ?? 0), 0)
    const totalESIC  = processed.reduce((s, e) => s + (e.payroll?.esiEmployee ?? 0), 0)
    const totalCTC   = processed.reduce((s, e) => s + (e.payroll?.ctc ?? 0), 0)

    return (
        <div className="space-y-5 max-w-screen-2xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[22px] font-semibold text-[var(--text)]">Payroll</h1>
                    <p className="text-[13px] text-[var(--text3)]">Growus salary structure — net salary calculator</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Month/Year selector */}
                    <div className="flex items-center gap-2 bg-white border border-[var(--border)] rounded-xl px-3 py-2">
                        <select value={month} onChange={e => setMonth(+e.target.value)}
                            className="bg-transparent text-[13px] font-medium outline-none">
                            {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                        </select>
                        <input type="number" value={year} onChange={e => setYear(+e.target.value)}
                            className="bg-transparent text-[13px] font-medium w-16 outline-none" />
                    </div>
                    <button onClick={exportExcel}
                        className="flex items-center gap-2 border border-[var(--border)] bg-white rounded-xl text-[13px] font-medium px-4 py-2 hover:bg-[var(--surface)] transition-colors">
                        <FileSpreadsheet size={15} className="text-green-600" /> Export Excel
                    </button>
                    <button onClick={processPayroll} disabled={processing}
                        className="flex items-center gap-2 bg-[var(--accent)] text-white rounded-xl text-[13px] font-medium px-4 py-2 hover:opacity-90 disabled:opacity-60">
                        {processing ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
                        {processing ? "Processing…" : "Process Payroll"}
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                    { label: "Gross Salary", value: fmt(totalGross), color: "text-[var(--accent)]" },
                    { label: "Net Salary", value: fmt(totalNet), color: "text-green-600" },
                    { label: "PF (Employee)", value: fmt(totalPF), color: "text-blue-600" },
                    { label: "ESIC (Employee)", value: fmt(totalESIC), color: "text-orange-600" },
                    { label: "Total CTC", value: fmt(totalCTC), color: "text-purple-600" },
                ].map(card => (
                    <div key={card.label} className="bg-white border border-[var(--border)] rounded-xl p-4">
                        <p className="text-[11px] text-[var(--text3)] mb-1">{card.label}</p>
                        <p className={`text-[18px] font-bold ${card.color}`}>{card.value}</p>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-[var(--surface)] rounded-xl p-1 w-fit">
                {[["payroll","Calculate Payroll"],["setup","Salary Setup"]] .map(([t, label]) => (
                    <button key={t} onClick={() => setTab(t as any)}
                        className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${tab === t ? "bg-white text-[var(--text)] shadow-sm" : "text-[var(--text3)] hover:text-[var(--text)]"}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* ── TAB: PAYROLL CALCULATOR ── */}
            {tab === "payroll" && (
                <div className="space-y-3">
                    {noSalary.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[13px] text-amber-800">
                            ⚠️ {noSalary.length} employees have no salary structure set. Go to <b>Salary Setup</b> tab.
                        </div>
                    )}

                    {/* Table */}
                    <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12px]">
                                <thead>
                                    <tr className="bg-[var(--surface)] border-b border-[var(--border)]">
                                        <th className="px-3 py-3 text-left font-semibold text-[var(--text3)] w-8">#</th>
                                        <th className="px-3 py-3 text-left font-semibold text-[var(--text3)]">Employee</th>
                                        <th className="px-3 py-3 text-center font-semibold text-[var(--text3)]">Month Days</th>
                                        <th className="px-3 py-3 text-center font-semibold text-[var(--text3)]">LOP</th>
                                        <th className="px-3 py-3 text-center font-semibold text-[var(--text3)]">Worked</th>
                                        <th className="px-3 py-3 text-center font-semibold text-[var(--text3)]">OT Days</th>
                                        <th className="px-3 py-3 text-center font-semibold text-[var(--text3)]">Canteen Days</th>
                                        <th className="px-3 py-3 text-right font-semibold text-[var(--text3)]">Gross</th>
                                        <th className="px-3 py-3 text-right font-semibold text-[var(--text3)]">Deductions</th>
                                        <th className="px-3 py-3 text-right font-semibold text-green-700">NET</th>
                                        <th className="px-3 py-3 text-right font-semibold text-purple-700">CTC</th>
                                        <th className="px-3 py-3 text-center font-semibold text-[var(--text3)]">Detail</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {employees.map((emp, idx) => {
                                        const att = attInputs[emp.id] ?? defaultAtt()
                                        const lop = att.monthDays - att.workedDays
                                        {/* Process only applies an APPROVED structure — anything
                                            else falls back to bare basic. Preview must do the same,
                                            or a pending structure shows full allowances here and
                                            saves basic-only. */}
                                        const preview = emp.salary && emp.salary.status === "APPROVED"
                                            ? calcPreview(emp.salary, att, emp.gender, emp.isHandicap, month, rules)
                                            : null
                                        const isExpanded = expandedId === emp.id

                                        return (
                                            <>
                                                <tr key={emp.id} className="hover:bg-[var(--surface)]">
                                                    <td className="px-3 py-2 text-[var(--text3)]">{idx+1}</td>
                                                    <td className="px-3 py-2">
                                                        <div className="font-medium text-[var(--text)]">{emp.name}</div>
                                                        <div className="text-[10px] text-[var(--text3)]">{emp.employeeId} · {emp.designation}</div>
                                                    </td>
                                                    {/* Attendance inputs */}
                                                    <td className="px-2 py-2">
                                                        <input type="number" value={att.monthDays}
                                                            onChange={e => setAtt(emp.id, "monthDays", +e.target.value)}
                                                            className="w-14 border border-[var(--border)] rounded px-2 py-1 text-center text-[12px] outline-none focus:border-[var(--accent)]" />
                                                    </td>
                                                    <td className="px-2 py-2 text-center font-medium text-red-600">{lop}</td>
                                                    <td className="px-2 py-2">
                                                        <input type="number" value={att.workedDays}
                                                            onChange={e => setAtt(emp.id, "workedDays", +e.target.value)}
                                                            className="w-14 border border-[var(--border)] rounded px-2 py-1 text-center text-[12px] outline-none focus:border-[var(--accent)]" />
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        <input type="number" step="0.25" value={att.otDays}
                                                            onChange={e => setAtt(emp.id, "otDays", +e.target.value)}
                                                            className="w-14 border border-[var(--border)] rounded px-2 py-1 text-center text-[12px] outline-none focus:border-[var(--accent)]" />
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        <input type="number" value={att.canteenDays}
                                                            onChange={e => setAtt(emp.id, "canteenDays", +e.target.value)}
                                                            className="w-14 border border-[var(--border)] rounded px-2 py-1 text-center text-[12px] outline-none focus:border-[var(--accent)]" />
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-medium">
                                                        {preview ? fmt(preview.grossSalary) : <span className="text-[var(--text3)]">—</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-red-600">
                                                        {preview ? fmt(preview.totalDeductions) : "—"}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-bold text-green-700">
                                                        {preview ? fmt(preview.netSalary) : "—"}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-medium text-purple-700">
                                                        {preview ? fmt(preview.ctc) : "—"}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <button onClick={() => setExpandedId(isExpanded ? null : emp.id)}
                                                            className="text-[var(--text3)] hover:text-[var(--accent)]">
                                                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                                        </button>
                                                    </td>
                                                </tr>
                                                {/* Expanded detail row */}
                                                {isExpanded && preview && (
                                                    <tr key={`${emp.id}-detail`}>
                                                        <td colSpan={12} className="bg-[var(--surface)] px-6 py-4">
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[12px]">
                                                                {/* Earnings */}
                                                                <div>
                                                                    <div className="font-semibold text-[var(--text)] mb-2">Full Month Earnings</div>
                                                                    {[
                                                                        ["BASIC", preview.basicFull],["DA", preview.daFull],
                                                                        ["HRA (5%)", preview.hraFull],["Washing", preview.washingFull],
                                                                        ["Conveyance", preview.conveyanceFull],["Bonus", preview.bonusFull],
                                                                    ].map(([k, v]) => (
                                                                        <div key={k as string} className="flex justify-between py-0.5">
                                                                            <span className="text-[var(--text3)]">{k}</span>
                                                                            <span>₹{Math.round(v as number).toLocaleString()}</span>
                                                                        </div>
                                                                    ))}
                                                                    <div className="flex justify-between border-t border-[var(--border)] pt-1 mt-1 font-semibold">
                                                                        <span>GROSS Full</span><span>₹{Math.round(preview.grossFullMonth).toLocaleString()}</span>
                                                                    </div>
                                                                </div>
                                                                {/* Earned */}
                                                                <div>
                                                                    <div className="font-semibold text-[var(--text)] mb-2">Earned ({att.workedDays}/{att.monthDays} days)</div>
                                                                    {[
                                                                        ["BASIC", preview.basicSalary],["DA", preview.da],
                                                                        ["HRA", preview.hra],["Washing", preview.washing],
                                                                        ["Bonus", preview.bonus],["OT Pay", preview.overtimePay],
                                                                    ].map(([k, v]) => (
                                                                        <div key={k as string} className="flex justify-between py-0.5">
                                                                            <span className="text-[var(--text3)]">{k}</span>
                                                                            <span>₹{Math.round(v as number).toLocaleString()}</span>
                                                                        </div>
                                                                    ))}
                                                                    <div className="flex justify-between border-t border-[var(--border)] pt-1 mt-1 font-semibold text-[var(--accent)]">
                                                                        <span>GROSS Earned</span><span>₹{preview.grossSalary.toLocaleString()}</span>
                                                                    </div>
                                                                </div>
                                                                {/* Deductions + Net */}
                                                                <div>
                                                                    <div className="font-semibold text-[var(--text)] mb-2">Deductions & Net</div>
                                                                    {[
                                                                        ["PF (Employee)", preview.pfEmployee],
                                                                        ["ESIC (0.75%)", preview.esiEmployee],
                                                                        ["PT", preview.pt],
                                                                        ["Canteen", preview.canteen],
                                                                    ].map(([k, v]) => (
                                                                        <div key={k as string} className="flex justify-between py-0.5">
                                                                            <span className="text-[var(--text3)]">{k}</span>
                                                                            <span className="text-red-600">-₹{Math.round(v as number).toLocaleString()}</span>
                                                                        </div>
                                                                    ))}
                                                                    <div className="flex justify-between border-t border-[var(--border)] pt-1 mt-1 font-bold text-green-700">
                                                                        <span>NET SALARY</span><span>₹{preview.netSalary.toLocaleString()}</span>
                                                                    </div>
                                                                    <div className="flex justify-between mt-1 text-[var(--text3)]">
                                                                        <span>Employer PF</span><span>₹{preview.pfEmployer.toLocaleString()}</span>
                                                                    </div>
                                                                    <div className="flex justify-between text-[var(--text3)]">
                                                                        <span>Employer ESIC</span><span>₹{preview.esiEmployer.toLocaleString()}</span>
                                                                    </div>
                                                                    <div className="flex justify-between border-t border-[var(--border)] pt-1 mt-1 font-semibold text-purple-700">
                                                                        <span>CTC</span><span>₹{Math.round(preview.ctc).toLocaleString()}</span>
                                                                    </div>
                                                                    {/* Extra deductions inputs */}
                                                                    <div className="mt-3 space-y-1.5">
                                                                        {(["penalty","advance","otherDeductions","lwf","productionIncentive"] as (keyof AttInput)[]).map(f => (
                                                                            <div key={f} className="flex items-center justify-between gap-2">
                                                                                <span className="text-[var(--text3)] capitalize">{f === "productionIncentive" ? "Prod. Incentive (+)" : f}</span>
                                                                                <input type="number" value={att[f] as number}
                                                                                    onChange={e => setAtt(emp.id, f, +e.target.value)}
                                                                                    className="w-20 border border-[var(--border)] rounded px-2 py-0.5 text-right text-[12px] outline-none focus:border-[var(--accent)]" />
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB: SALARY SETUP ── */}
            {tab === "setup" && (
                <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <h2 className="text-[14px] font-semibold">Salary Structure Setup</h2>
                            <p className="text-[12px] text-[var(--text3)]">Set BASIC, DA, allowances per employee. HRA & Bonus auto-calculated.</p>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2 text-[12px] text-[var(--text3)]">
                                <CheckCircle2 size={14} className="text-green-500" />{withSalary.length} set
                                <Users size={14} className="text-amber-500 ml-2" />{noSalary.length} pending
                            </div>
                            <button onClick={downloadSalaryTemplate}
                                className="flex items-center gap-1.5 text-[12px] font-medium border border-[var(--border)] px-3 py-1.5 rounded-lg hover:bg-[var(--surface)] transition-colors">
                                <FileDown size={13} /> Download Template
                            </button>
                            <label className={`flex items-center gap-1.5 text-[12px] font-medium border border-[var(--accent)] text-[var(--accent)] px-3 py-1.5 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors ${bulkUploading ? "opacity-60 pointer-events-none" : ""}`}>
                                {bulkUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                {bulkUploading ? "Uploading..." : "Bulk Upload (.xlsx)"}
                                <input type="file" accept=".xlsx,.csv" className="hidden" onChange={handleBulkSalaryUpload} disabled={bulkUploading} />
                            </label>
                        </div>
                    </div>
                    {/* The card is overflow-hidden, so without this scroller the
                        right-hand salary columns are clipped off-screen on mobile
                        with no way to reach them. */}
                    <div className="overflow-x-auto">
                    <table className="w-full text-[12px] min-w-[820px]">
                        <thead>
                            <tr className="bg-[var(--surface)] border-b border-[var(--border)]">
                                <th className="px-4 py-3 text-left text-[var(--text3)] font-semibold">Employee</th>
                                <th className="px-4 py-3 text-right text-[var(--text3)] font-semibold">BASIC</th>
                                <th className="px-4 py-3 text-right text-[var(--text3)] font-semibold">DA</th>
                                <th className="px-4 py-3 text-right text-[var(--text3)] font-semibold">HRA</th>
                                <th className="px-4 py-3 text-right text-[var(--text3)] font-semibold">Bonus</th>
                                <th className="px-4 py-3 text-right text-[var(--text3)] font-semibold">Washing</th>
                                <th className="px-4 py-3 text-right text-[var(--text3)] font-semibold">Full Gross</th>
                                <th className="px-4 py-3 text-right text-[var(--text3)] font-semibold">CTC/Month</th>
                                <th className="px-4 py-3 text-center text-[var(--text3)] font-semibold">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {employees.map(emp => {
                                const s = emp.salary
                                const isCALL = s?.complianceType === "CALL"
                                // Shared engine + configured rules — no local statutory math
                                const costs = s ? calcFullMonthCosts({
                                    basic: s.basic, da: s.da, washing: s.washing, conveyance: s.conveyance,
                                    leaveWithWages: s.leaveWithWages, otherAllowance: s.otherAllowance,
                                    hra: s.hra ?? 0, bonus: s.bonus ?? 0,
                                    complianceType: s.complianceType, isHandicap: emp.isHandicap,
                                }, { gender: emp.gender }, rules) : null
                                const hra   = costs?.hraFull ?? 0
                                const bonus = costs?.bonusFull ?? 0
                                const gross = costs?.grossFullMonth ?? 0
                                const ctc   = costs?.ctc ?? 0
                                return (
                                    <tr key={emp.id} className="hover:bg-[var(--surface)]">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-[var(--text)]">{emp.name}</span>
                                                {s && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isCALL ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{s.complianceType || "OR"}</span>}
                                            </div>
                                            <div className="text-[10px] text-[var(--text3)]">{emp.employeeId} · {emp.site}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right">{s ? fmt(s.basic) : <span className="text-[var(--text3)]">—</span>}</td>
                                        <td className="px-4 py-3 text-right">{s ? fmt(s.da) : "—"}</td>
                                        <td className="px-4 py-3 text-right">{s ? fmt(hra) : "—"}</td>
                                        <td className="px-4 py-3 text-right">{s ? fmt(bonus) : "—"}</td>
                                        <td className="px-4 py-3 text-right">{s ? fmt(s.washing) : "—"}</td>
                                        <td className="px-4 py-3 text-right font-medium">{s ? fmt(gross) : "—"}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-purple-700">{s ? fmt(ctc) : "—"}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button onClick={() => setSalaryModal(emp)}
                                                className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline font-medium">
                                                <Edit2 size={12} /> {s ? "Edit" : "Setup"}
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}

            {/* Salary Setup Modal */}
            {salaryModal && (
                <SalaryModal
                    emp={salaryModal}
                    rules={rules}
                    onClose={() => setSalaryModal(null)}
                    onSaved={(sal) => {
                        setEmployees(prev => prev.map(e => e.id === salaryModal.id ? { ...e, salary: sal } : e))
                        setSalaryModal(null)
                    }}
                />
            )}
        </div>
    )
}
