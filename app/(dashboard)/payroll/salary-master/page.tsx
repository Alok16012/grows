"use client"
import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import {
    Loader2, Search, ChevronRight, Download, Upload,
    Edit2, Check, X, RefreshCw, IndianRupee
} from "lucide-react"

const fmt  = (n: number) => n ? "₹" + Math.round(n).toLocaleString("en-IN") : "—"
const fmtN = (n: number) => Math.round(n).toLocaleString("en-IN")

// PT slab — Maharashtra (standard month, not February)
function calcPT(gross: number): number {
    if (gross > 10000) return 200
    if (gross >= 7500) return 175
    return 0
}

// Derived calculations (full-month preview — no proration)
function calc(s: SalaryRow) {
    const basic  = s.basic || 0
    const da     = s.da || 0
    const wash   = s.washing || 0
    const conv   = s.conveyance || 0
    const lww    = s.leaveWithWages || 0
    const other  = s.otherAllowance || 0
    const isCALL = s.complianceType === "CALL"
    // Bonus: use stored per-employee value (min-wage-based per Bonus Act), else formula
    const bonus  = isCALL ? 0 : (s.bonus != null && s.bonus > 0 ? s.bonus : Math.round((basic + da) * 0.0833))
    const hra    = isCALL ? 0 : Math.round((basic + da) * 0.05)
    const gross  = basic + (isCALL ? 0 : da + hra + wash + conv + lww + bonus + other)
    const empPF  = isCALL ? 0 : 1950
    // ESIC eligibility: (gross − washing) ≤ ₹21,000 (washing excluded from threshold)
    const esicEligible = !isCALL && (gross - wash) <= 21000
    // Employer ESIC: (gross − washing) × 3.25%
    const empESI = esicEligible ? Math.ceil((gross - wash) * 0.0325) : 0
    // Employee deductions
    const empPFDed  = isCALL ? 0 : Math.min(Math.round((basic + da) * 0.12), 1800)
    // Employee ESIC = ₹0 (Growus absorbs employee share per company policy)
    const empESIDed = 0
    const pt     = isCALL ? 0 : calcPT(gross)
    const totalDed = empPFDed + empESIDed + pt
    const netSalary = gross - totalDed
    const ctc    = gross + empPF + empESI
    return { hra, bonus, gross, empPF, empESI, empPFDed, empESIDed, pt, totalDed, netSalary, ctc }
}

type SalaryRow = {
    basic: number; da: number; washing: number; conveyance: number
    leaveWithWages: number; otherAllowance: number; bonus: number
    otRatePerHour: number; canteenRatePerDay: number; complianceType: string
}
type EmpSalary = {
    id: string; employeeId: string; firstName: string; lastName: string
    designation: string | null; basicSalary: number
    department: { name: string } | null
    deployments: { site: { name: string } }[]
    employeeSalary: (SalaryRow & { id: string; bonus: number }) | null
}
type EditForm = SalaryRow

const EMPTY_SALARY: SalaryRow = {
    basic: 0, da: 2511, washing: 0, conveyance: 0,
    leaveWithWages: 0, otherAllowance: 0, bonus: 583,
    otRatePerHour: 170, canteenRatePerDay: 55, complianceType: "OR",
}

export default function SalaryMasterPage() {
    const router  = useRouter()
    const [data,       setData]       = useState<EmpSalary[]>([])
    const [loading,    setLoading]    = useState(true)
    const [search,     setSearch]     = useState("")
    const [editId,     setEditId]     = useState<string | null>(null)
    const [editForm,   setEditForm]   = useState<EditForm>(EMPTY_SALARY)
    const [saving,     setSaving]     = useState(false)
    const [uploading,  setUploading]  = useState(false)
    const [filterNone, setFilterNone] = useState(false)
    const [filterSite, setFilterSite] = useState("")
    // Quick-change compliance type without entering full edit mode
    const [typeOverride, setTypeOverride] = useState<Record<string, string>>({})
    const [savingType,   setSavingType]   = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const r = await fetch("/api/payroll/salary-structure")
            if (r.ok) setData(await r.json())
        } catch { toast.error("Failed to load") }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    const startEdit = (emp: EmpSalary) => {
        const s = emp.employeeSalary
        const compType = s?.complianceType ?? "OR"
        setEditForm(s ? {
            basic: s.basic, da: s.da, washing: s.washing, conveyance: s.conveyance,
            leaveWithWages: s.leaveWithWages, otherAllowance: s.otherAllowance,
            bonus: 0, // bonus auto-calculated from basic+da at payroll time
            otRatePerHour: s.otRatePerHour, canteenRatePerDay: s.canteenRatePerDay,
            complianceType: compType,
        } : { ...EMPTY_SALARY, basic: emp.basicSalary || 0 })
        setEditId(emp.id)
    }

    const handleQuickTypeChange = async (emp: EmpSalary, newType: string) => {
        if (!emp.employeeSalary) return
        setTypeOverride(prev => ({ ...prev, [emp.id]: newType }))
        setSavingType(emp.id)
        const s = emp.employeeSalary
        try {
            const res = await fetch("/api/payroll/salary-structure", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: [{
                    employeeId: emp.id,
                    basic: s.basic, da: s.da, washing: s.washing, conveyance: s.conveyance,
                    leaveWithWages: s.leaveWithWages, otherAllowance: s.otherAllowance,
                    bonus: 0, // auto-calculated from basic+da at payroll time
                    otRatePerHour: s.otRatePerHour, canteenRatePerDay: s.canteenRatePerDay,
                    complianceType: newType,
                }] }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(`Compliance type updated to ${newType}`)
            await load()
        } catch (e) {
            toast.error((e as Error).message)
            setTypeOverride(prev => { const n = { ...prev }; delete n[emp.id]; return n })
        } finally {
            setSavingType(null)
            setTypeOverride(prev => { const n = { ...prev }; delete n[emp.id]; return n })
        }
    }

    const saveEdit = async (emp: EmpSalary) => {
        setSaving(true)
        try {
            const res = await fetch("/api/payroll/salary-structure", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: [{ employeeId: emp.id, ...editForm, bonus: 0 }] }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(`Salary structure saved for ${emp.firstName} ${emp.lastName}`)
            setEditId(null)
            await load()
        } catch (e) { toast.error((e as Error).message) }
        finally { setSaving(false) }
    }

    // Download Excel template with current data pre-filled
    const handleDownloadTemplate = () => {
        const headers = [
            "EMP Code", "Employee Name", "Designation", "Site",
            "Basic", "DA", "Washing", "Conveyance",
            "Leave With Wages", "Other Allowance",
            "Bonus (Auto - Do Not Edit)", // reference column: (Basic+DA)×8.33%
            "OT Rate Per Hour", "Canteen Rate Per Day", "Compliance Type",
        ]
        const rows = filtered.map(emp => {
            const s = emp.employeeSalary
            const basic = s?.basic ?? emp.basicSalary ?? 0
            const da    = s?.da ?? 2511
            const compType = s?.complianceType ?? "OR"
            const autoBonus = compType === "CALL" ? 0 : Math.round((basic + da) * 0.0833)
            return [
                emp.employeeId,
                `${emp.firstName} ${emp.lastName}`,
                emp.designation || "",
                emp.deployments?.[0]?.site?.name || "",
                basic,
                da,
                s?.washing ?? 0,
                s?.conveyance ?? 0,
                s?.leaveWithWages ?? 0,
                s?.otherAllowance ?? 0,
                autoBonus,           // auto-calculated, ignored on upload
                s?.otRatePerHour ?? 170,
                s?.canteenRatePerDay ?? 55,
                compType,
            ]
        })
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
        ws["!cols"] = [14, 22, 18, 18, 10, 10, 10, 12, 16, 14, 18, 16, 18, 14].map(w => ({ wch: w }))
        // Grey out the Bonus column header to signal it's read-only
        const bonusHeaderCell = "K1"
        if (ws[bonusHeaderCell]) {
            ws[bonusHeaderCell].s = { fill: { fgColor: { rgb: "F3F4F6" } }, font: { italic: true, color: { rgb: "6B7280" } } }
        }
        XLSX.utils.book_append_sheet(wb, ws, "Salary Structure")
        XLSX.writeFile(wb, `salary_structure_master.xlsx`)
        toast.success("Template downloaded — Bonus column is auto-calculated, no need to edit")
    }

    // Upload Excel and bulk-save
    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ""
        const reader = new FileReader()
        reader.onload = async (ev) => {
            setUploading(true)
            try {
                const wb   = XLSX.read(ev.target?.result as ArrayBuffer, { type: "array" })
                const ws   = wb.Sheets[wb.SheetNames[0]]
                const raw  = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]

                // Build a map: employeeId string → UUID
                const codeToId = new Map(data.map(e => [e.employeeId.toLowerCase(), e.id]))

                const rows: (SalaryRow & { employeeId: string })[] = []
                const skipped: string[] = []

                for (const r of raw) {
                    const lk  = (k: string) => Object.keys(r).find(kk => kk.toLowerCase().replace(/[\s_/]/g,"") === k.toLowerCase().replace(/[\s_/]/g,""))
                    const get = (k: string) => { const found = lk(k); return found ? r[found] : undefined }
                    const empCode = String(get("EMPCode") ?? get("empcode") ?? "").trim()
                    const uuid    = codeToId.get(empCode.toLowerCase())
                    if (!uuid) { skipped.push(empCode || "(blank)"); continue }

                    const compType = String(get("ComplianceType") ?? get("Compliance Type") ?? "OR").toUpperCase()
                    rows.push({
                        employeeId:       uuid,
                        basic:            Number(get("Basic") ?? 0),
                        da:               Number(get("DA") ?? 2511),
                        washing:          Number(get("Washing") ?? 0),
                        conveyance:       Number(get("Conveyance") ?? 0),
                        leaveWithWages:   Number(get("LeaveWithWages") ?? get("Leave With Wages") ?? 0),
                        otherAllowance:   Number(get("OtherAllowance") ?? get("Other Allowance") ?? 0),
                        bonus:            0, // auto-calculated from basic+da at payroll time
                        otRatePerHour:    Number(get("OTRatePerHour") ?? get("OT Rate Per Hour") ?? 170),
                        canteenRatePerDay: Number(get("CanteenRatePerDay") ?? get("Canteen Rate Per Day") ?? 55),
                        complianceType:   compType || "OR",
                    })
                }

                if (!rows.length) { toast.error("No matching employees found. Check EMP Code column."); return }

                const res = await fetch("/api/payroll/salary-structure", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rows }),
                })
                const d = await res.json()
                toast.success(`${d.updated} records updated${skipped.length ? ` | ${skipped.length} skipped (not found)` : ""}`)
                if (skipped.length) console.warn("Skipped EMP Codes:", skipped)
                await load()
            } catch (e) { toast.error((e as Error).message) }
            finally { setUploading(false) }
        }
        reader.readAsArrayBuffer(file)
    }

    // All unique site names across all employees for the filter dropdown
    const allSites = Array.from(new Set(
        data.flatMap(e => e.deployments?.map(d => d.site?.name).filter(Boolean) ?? [])
    )).sort() as string[]

    const filtered = data.filter(emp => {
        if (filterNone && emp.employeeSalary) return false
        if (filterSite) {
            const empSites = emp.deployments?.map(d => d.site?.name) ?? []
            if (!empSites.includes(filterSite)) return false
        }
        if (!search) return true
        const q = search.toLowerCase()
        return `${emp.firstName} ${emp.lastName} ${emp.employeeId} ${emp.designation || ""}`.toLowerCase().includes(q)
    })

    const withSal  = data.filter(e => e.employeeSalary).length
    const noSal    = data.length - withSal

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 40 }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)" }}>
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll")}>Payroll</span>
                <ChevronRight size={11} />
                <span style={{ fontWeight: 600, color: "var(--text2)" }}>Salary Structure Master</span>
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <IndianRupee size={20} style={{ color: "var(--accent)" }} />
                    <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>Salary Structure Master</h1>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={load} style={btnGhost}>
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                    </button>
                    <button onClick={handleDownloadTemplate} style={btnGhost}>
                        <Download size={13} /> Download Template
                    </button>
                    <label style={{ ...btnPrimary, background: uploading ? "#a78bfa" : "#7c3aed", cursor: uploading ? "not-allowed" : "pointer" }}>
                        {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                        {uploading ? "Uploading…" : "Bulk Upload Excel"}
                        <input type="file" accept=".xlsx,.csv" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
                    </label>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                {[
                    { label: "Total Employees", value: data.length, color: "#3b82f6" },
                    { label: "Structure Set",   value: withSal,     color: "#16a34a" },
                    { label: "Not Set",          value: noSal,       color: noSal > 0 ? "#dc2626" : "#6b7280" },
                ].map(s => (
                    <div key={s.label} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)" }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px", margin: 0 }}>{s.label}</p>
                        <p style={{ fontSize: 20, fontWeight: 800, color: s.color, margin: "3px 0 0 0" }}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", flexWrap: "wrap" }}>
                <Search size={13} style={{ color: "var(--text3)" }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee name or code…"
                    style={{ flex: 1, minWidth: 180, border: "none", outline: "none", fontSize: 13, background: "transparent", color: "var(--text)" }} />
                {allSites.length > 0 && (
                    <select value={filterSite} onChange={e => setFilterSite(e.target.value)}
                        style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: filterSite ? "var(--text)" : "var(--text3)", outline: "none" }}>
                        <option value="">All Sites</option>
                        {allSites.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text3)", cursor: "pointer" }}>
                    <input type="checkbox" checked={filterNone} onChange={e => setFilterNone(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                    Show only not-set
                </label>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>{filtered.length}/{data.length}</span>
            </div>

            {/* Table */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                                <th style={th}>Emp Code</th>
                                <th style={{ ...th, textAlign: "left" }}>Employee</th>
                                <th style={{ ...th, background: "#eff6ff", color: "#1d4ed8" }}>Basic</th>
                                <th style={{ ...th, background: "#eff6ff", color: "#1d4ed8" }}>DA</th>
                                <th style={{ ...th, background: "#eff6ff", color: "#1d4ed8" }}>HRA<span style={calcTag}>auto</span></th>
                                <th style={{ ...th, background: "#eff6ff", color: "#1d4ed8" }}>Washing</th>
                                <th style={{ ...th, background: "#eff6ff", color: "#1d4ed8" }}>Conv.</th>
                                <th style={{ ...th, background: "#eff6ff", color: "#1d4ed8" }}>LWW</th>
                                <th style={{ ...th, background: "#eff6ff", color: "#1d4ed8" }}>Bonus<span style={calcTag}>auto</span></th>
                                <th style={{ ...th, background: "#eff6ff", color: "#1d4ed8" }}>Other</th>
                                <th style={{ ...th, background: "#dcfce7", color: "#15803d" }}>Gross<span style={calcTag}>auto</span></th>
                                <th style={{ ...th, background: "#fef2f2", color: "#dc2626" }}>Co.PF<span style={calcTag}>auto</span></th>
                                <th style={{ ...th, background: "#fef2f2", color: "#dc2626" }}>Co.ESIC<span style={calcTag}>auto</span></th>
                                <th style={{ ...th, background: "#f0fdf4", color: "#15803d" }}>CTC<span style={calcTag}>auto</span></th>
                                <th style={{ ...th, background: "#fef9c3", color: "#92400e" }}>Emp.PF<span style={calcTag}>ded</span></th>
                                <th style={{ ...th, background: "#fef9c3", color: "#92400e" }}>Emp.ESI<span style={calcTag}>ded</span></th>
                                <th style={{ ...th, background: "#fef9c3", color: "#92400e" }}>PT<span style={calcTag}>ded</span></th>
                                <th style={{ ...th, background: "#fef9c3", color: "#b91c1c" }}>Tot.Ded<span style={calcTag}>auto</span></th>
                                <th style={{ ...th, background: "#ecfdf5", color: "#065f46" }}>Net/Mo<span style={calcTag}>auto</span></th>
                                <th style={{ ...th, background: "#fafafa" }}>OT/Hr</th>
                                <th style={{ ...th, background: "#fafafa" }}>Canteen/Day</th>
                                <th style={{ ...th, background: "#fafafa" }}>Type</th>
                                <th style={th}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={23} style={{ padding: 48, textAlign: "center" }}>
                                    <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} />
                                </td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={23} style={{ padding: 32, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
                                    No employees found
                                </td></tr>
                            ) : filtered.map((emp, idx) => {
                                const isEditing = editId === emp.id
                                const s = emp.employeeSalary
                                const row: SalaryRow = isEditing ? editForm : (s ? {
                                    basic: s.basic, da: s.da, washing: s.washing, conveyance: s.conveyance,
                                    leaveWithWages: s.leaveWithWages, otherAllowance: s.otherAllowance, bonus: s.bonus ?? 583,
                                    otRatePerHour: s.otRatePerHour, canteenRatePerDay: s.canteenRatePerDay,
                                    complianceType: s.complianceType,
                                } : { ...EMPTY_SALARY, basic: emp.basicSalary || 0 })
                                const effectiveType = typeOverride[emp.id] ?? row.complianceType
                                const displayRow = { ...row, complianceType: effectiveType }
                                const { hra, bonus, gross, empPF, empESI, empPFDed, empESIDed, pt, totalDed, netSalary, ctc } = calc(displayRow)

                                const numIn = (field: keyof EditForm, bg = "transparent") => (
                                    <input
                                        type="number" min={0}
                                        value={isEditing ? String((editForm as Record<string,unknown>)[field] ?? "") : ""}
                                        onChange={e => setEditForm(f => ({ ...f, [field]: Number(e.target.value) || 0 }))}
                                        style={{ width: 72, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--accent)", fontSize: 12,
                                            background: bg || "#fff", color: "var(--text)", outline: "none", textAlign: "right" }}
                                    />
                                )

                                return (
                                    <tr key={emp.id}
                                        style={{ borderBottom: "1px solid var(--border)", background: isEditing ? "#faf5ff" : idx % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                                        <td style={{ ...td, color: "var(--accent)", fontWeight: 700 }}>{emp.employeeId}</td>
                                        <td style={{ ...td, textAlign: "left" }}>
                                            <div style={{ fontWeight: 600, color: "var(--text)" }}>{emp.firstName} {emp.lastName}</div>
                                            <div style={{ fontSize: 10, color: "var(--text3)" }}>{emp.designation || emp.deployments?.[0]?.site?.name || "—"}</div>
                                        </td>
                                        {/* Earnings */}
                                        <td style={{ ...td, background: "#eff6ff" }}>
                                            {isEditing ? numIn("basic", "#eff6ff") : s ? fmtN(s.basic) : <span style={{ color: "#f59e0b" }}>—</span>}
                                        </td>
                                        <td style={{ ...td, background: "#eff6ff" }}>
                                            {isEditing ? numIn("da", "#eff6ff") : s ? fmtN(s.da) : "—"}
                                        </td>
                                        <td style={{ ...td, background: "#eff6ff", color: "#6b7280" }}>{s || isEditing ? fmtN(hra) : "—"}</td>
                                        <td style={{ ...td, background: "#eff6ff" }}>
                                            {isEditing ? numIn("washing", "#eff6ff") : s ? fmtN(s.washing) : "—"}
                                        </td>
                                        <td style={{ ...td, background: "#eff6ff" }}>
                                            {isEditing ? numIn("conveyance", "#eff6ff") : s ? fmtN(s.conveyance) : "—"}
                                        </td>
                                        <td style={{ ...td, background: "#eff6ff" }}>
                                            {isEditing ? numIn("leaveWithWages", "#eff6ff") : s ? fmtN(s.leaveWithWages) : "—"}
                                        </td>
                                        <td style={{ ...td, background: "#eff6ff", color: "#6b7280", fontStyle: "italic" }}>
                                            {(s || isEditing) ? fmtN(bonus) : "—"}
                                        </td>
                                        <td style={{ ...td, background: "#eff6ff" }}>
                                            {isEditing ? numIn("otherAllowance", "#eff6ff") : s ? fmtN(s.otherAllowance) : "—"}
                                        </td>
                                        {/* Gross */}
                                        <td style={{ ...td, background: "#dcfce7", fontWeight: 700, color: "#15803d" }}>{s || isEditing ? fmt(gross) : "—"}</td>
                                        {/* Employer contributions */}
                                        <td style={{ ...td, background: "#fef2f2", color: "#dc2626" }}>{s || isEditing ? fmtN(empPF) : "—"}</td>
                                        <td style={{ ...td, background: "#fef2f2", color: "#dc2626" }}>{s || isEditing ? fmtN(empESI) : "—"}</td>
                                        {/* CTC */}
                                        <td style={{ ...td, background: "#f0fdf4", fontWeight: 700, color: "#15803d" }}>{s || isEditing ? fmt(ctc) : "—"}</td>
                                        {/* Employee deductions */}
                                        <td style={{ ...td, background: "#fef9c3", color: "#92400e" }}>{s || isEditing ? fmtN(empPFDed) : "—"}</td>
                                        <td style={{ ...td, background: "#fef9c3", color: "#92400e" }}>{s || isEditing ? fmtN(empESIDed) : "—"}</td>
                                        <td style={{ ...td, background: "#fef9c3", color: "#92400e", fontWeight: 700 }}>{s || isEditing ? fmtN(pt) : "—"}</td>
                                        <td style={{ ...td, background: "#fef9c3", color: "#b91c1c", fontWeight: 700 }}>{s || isEditing ? fmtN(totalDed) : "—"}</td>
                                        <td style={{ ...td, background: "#ecfdf5", color: "#065f46", fontWeight: 700 }}>{s || isEditing ? fmt(netSalary) : "—"}</td>
                                        {/* Config */}
                                        <td style={{ ...td, background: "#fafafa" }}>
                                            {isEditing ? numIn("otRatePerHour", "#fafafa") : s ? fmtN(s.otRatePerHour) : "170"}
                                        </td>
                                        <td style={{ ...td, background: "#fafafa" }}>
                                            {isEditing ? numIn("canteenRatePerDay", "#fafafa") : s ? fmtN(s.canteenRatePerDay) : "55"}
                                        </td>
                                        <td style={{ ...td, background: "#fafafa" }}>
                                            {isEditing ? (
                                                <select value={editForm.complianceType} onChange={e => setEditForm(f => ({ ...f, complianceType: e.target.value }))}
                                                    style={{ padding: "3px 6px", borderRadius: 6, border: "1px solid var(--accent)", fontSize: 11, background: "#fff" }}>
                                                    <option value="OR">OR</option>
                                                    <option value="CALL">CALL</option>
                                                </select>
                                            ) : s ? (
                                                <select
                                                    value={effectiveType}
                                                    disabled={savingType === emp.id}
                                                    onChange={e => handleQuickTypeChange(emp, e.target.value)}
                                                    style={{
                                                        padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                                                        border: "none", cursor: "pointer", outline: "none",
                                                        background: effectiveType === "CALL" ? "#fef3c7" : "#eff6ff",
                                                        color: effectiveType === "CALL" ? "#b45309" : "#1d4ed8",
                                                        appearance: "auto",
                                                        opacity: savingType === emp.id ? 0.5 : 1,
                                                    }}>
                                                    <option value="OR">OR</option>
                                                    <option value="CALL">CALL</option>
                                                </select>
                                            ) : (
                                                <span style={{ color: "var(--text3)", fontSize: 11 }}>—</span>
                                            )}
                                        </td>
                                        {/* Action */}
                                        <td style={td}>
                                            {isEditing ? (
                                                <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                                                    <button onClick={() => saveEdit(emp)} disabled={saving}
                                                        style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "#16a34a", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                                        {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
                                                    </button>
                                                    <button onClick={() => setEditId(null)}
                                                        style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "none", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                                        <X size={11} /> Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => startEdit(emp)}
                                                    style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "none", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "var(--text2)" }}>
                                                    <Edit2 size={11} /> Edit
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        {/* Totals footer */}
                        {!loading && filtered.length > 0 && (
                            <tfoot>
                                <tr style={{ background: "var(--surface2)", borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                                    <td colSpan={2} style={{ ...td, textAlign: "right", fontSize: 10, color: "var(--text3)", textTransform: "uppercase" }}>
                                        Total ({filtered.filter(e => e.employeeSalary).length} with structure)
                                    </td>
                                    {[
                                        filtered.reduce((s,e) => s + (e.employeeSalary?.basic || 0), 0),
                                        filtered.reduce((s,e) => s + (e.employeeSalary?.da || 0), 0),
                                        filtered.reduce((s,e) => s + (e.employeeSalary ? Math.round((e.employeeSalary.basic + e.employeeSalary.da)*0.05) : 0), 0),
                                        filtered.reduce((s,e) => s + (e.employeeSalary?.washing || 0), 0),
                                        filtered.reduce((s,e) => s + (e.employeeSalary?.conveyance || 0), 0),
                                        filtered.reduce((s,e) => s + (e.employeeSalary?.leaveWithWages || 0), 0),
                                        filtered.reduce((s,e) => s + (e.employeeSalary ? calc(e.employeeSalary).bonus : 0), 0),
                                        filtered.reduce((s,e) => s + (e.employeeSalary?.otherAllowance || 0), 0),
                                    ].map((v, i) => (
                                        <td key={i} style={{ ...td, background: "#eff6ff", fontWeight: 700 }}>{fmtN(v)}</td>
                                    ))}
                                    <td style={{ ...td, background: "#dcfce7", fontWeight: 700, color: "#15803d" }}>
                                        {fmt(filtered.reduce((s,e) => s + (e.employeeSalary ? calc(e.employeeSalary!).gross : 0), 0))}
                                    </td>
                                    <td style={{ ...td, background: "#fef2f2" }}>
                                        {fmtN(filtered.reduce((s,e) => s + (e.employeeSalary ? calc(e.employeeSalary!).empPF : 0), 0))}
                                    </td>
                                    <td style={{ ...td, background: "#fef2f2" }}>
                                        {fmtN(filtered.reduce((s,e) => s + (e.employeeSalary ? calc(e.employeeSalary!).empESI : 0), 0))}
                                    </td>
                                    <td style={{ ...td, background: "#f0fdf4", color: "#15803d" }}>
                                        {fmt(filtered.reduce((s,e) => s + (e.employeeSalary ? calc(e.employeeSalary!).ctc : 0), 0))}
                                    </td>
                                    <td style={{ ...td, background: "#fef9c3", color: "#92400e" }}>
                                        {fmtN(filtered.reduce((s,e) => s + (e.employeeSalary ? calc(e.employeeSalary!).empPFDed : 0), 0))}
                                    </td>
                                    <td style={{ ...td, background: "#fef9c3", color: "#92400e" }}>
                                        {fmtN(filtered.reduce((s,e) => s + (e.employeeSalary ? calc(e.employeeSalary!).empESIDed : 0), 0))}
                                    </td>
                                    <td style={{ ...td, background: "#fef9c3", color: "#92400e", fontWeight: 700 }}>
                                        {fmtN(filtered.reduce((s,e) => s + (e.employeeSalary ? calc(e.employeeSalary!).pt : 0), 0))}
                                    </td>
                                    <td style={{ ...td, background: "#fef9c3", color: "#b91c1c", fontWeight: 700 }}>
                                        {fmtN(filtered.reduce((s,e) => s + (e.employeeSalary ? calc(e.employeeSalary!).totalDed : 0), 0))}
                                    </td>
                                    <td style={{ ...td, background: "#ecfdf5", color: "#065f46", fontWeight: 700 }}>
                                        {fmt(filtered.reduce((s,e) => s + (e.employeeSalary ? calc(e.employeeSalary!).netSalary : 0), 0))}
                                    </td>
                                    <td colSpan={4} />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            <p style={{ fontSize: 11, color: "var(--text3)", textAlign: "center" }}>
                HRA = (Basic+DA)×5% · Bonus = (Basic+DA)×8.33% auto · Emp.PF = 12% of min(Basic+DA, ₹15k) · Emp.ESI = 0.75% · PT = ₹200 (above ₹10k) / ₹175 (₹7.5k-₹10k) / ₹0 · Co.PF = ₹1,950 · Co.ESIC = 3.25% (gross ≤ ₹21k)
            </p>
        </div>
    )
}

const th: React.CSSProperties = { padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px", textAlign: "center", whiteSpace: "nowrap" }
const td: React.CSSProperties = { padding: "6px 10px", textAlign: "center", color: "var(--text)", whiteSpace: "nowrap" }
const calcTag: React.CSSProperties = { marginLeft: 3, fontSize: 8, background: "#dbeafe", color: "#1d4ed8", borderRadius: 3, padding: "1px 3px", fontWeight: 400, letterSpacing: 0, textTransform: "none" }
const btnGhost: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "none", fontSize: 12, color: "var(--text2)", cursor: "pointer", fontWeight: 600 }
const btnPrimary: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", color: "#fff", fontSize: 12, fontWeight: 700 }
