"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Search, Download, Loader2, RefreshCw, FileSpreadsheet, Filter } from "lucide-react"
import * as XLSX from "xlsx"

// ─── Types ────────────────────────────────────────────────────────────────────
type Employee = {
    id: string
    employeeId: string
    firstName: string
    middleName?: string
    lastName: string
    email?: string
    phone: string
    alternatePhone?: string
    dateOfBirth?: string
    gender?: string
    address?: string
    city?: string
    state?: string
    pincode?: string
    permanentAddress?: string
    permanentCity?: string
    permanentState?: string
    permanentPincode?: string
    aadharNumber?: string
    panNumber?: string
    bankAccountNumber?: string
    bankIFSC?: string
    bankName?: string
    bankBranch?: string
    designation?: string
    status: string
    employmentType: string
    salaryType?: string
    basicSalary: number
    dateOfJoining?: string
    dateOfLeaving?: string
    nameAsPerAadhar?: string
    fathersName?: string
    bloodGroup?: string
    maritalStatus?: string
    nationality?: string
    religion?: string
    caste?: string
    uan?: string
    pfNumber?: string
    esiNumber?: string
    labourCardNo?: string
    labourCardExpDate?: string
    contractFrom?: string
    contractPeriodDays?: number
    contractorCode?: string
    workOrderNumber?: string
    workOrderFrom?: string
    workOrderTo?: string
    workSkill?: string
    natureOfWork?: string
    emergencyContact1Name?: string
    emergencyContact1Phone?: string
    emergencyContact2Name?: string
    emergencyContact2Phone?: string
    isBackgroundChecked?: boolean
    backgroundCheckRemark?: string
    isMedicalDone?: boolean
    medicalRemark?: string
    safetyGoggles?: boolean
    safetyGloves?: boolean
    safetyHelmet?: boolean
    safetyMask?: boolean
    safetyJacket?: boolean
    safetyEarMuffs?: boolean
    safetyShoes?: boolean
    notes?: string
    createdAt: string
    branch: { id: string; name: string }
    department?: { id: string; name: string } | null
    employeeSalary?: { ctcAnnual?: number; basicSalary?: number } | null
    user?: { role: string; customRole?: { name: string } | null } | null
    deployments?: { site: { name: string }; role?: string | null }[]
}

// ─── Column groups ────────────────────────────────────────────────────────────
type ColDef = { key: string; label: string; get: (e: Employee) => string }

const COLUMN_GROUPS: { group: string; color: string; cols: ColDef[] }[] = [
    {
        group: "Basic Info", color: "#3b82f6",
        cols: [
            { key: "employeeId",    label: "Emp ID",        get: e => e.employeeId },
            { key: "fullName",      label: "Full Name",     get: e => [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ") },
            { key: "status",        label: "Status",        get: e => e.status },
            { key: "employmentType",label: "Emp Type",      get: e => e.employmentType },
            { key: "designation",   label: "Designation",   get: e => e.designation || "" },
            { key: "branch",        label: "Branch",        get: e => e.branch?.name || "" },
            { key: "department",    label: "Department",    get: e => e.department?.name || "" },
            { key: "role",          label: "Role",          get: e => e.user?.customRole?.name || e.user?.role || "" },
            { key: "assignment",    label: "Assignment",    get: e => e.deployments?.[0]?.site?.name || "" },
            { key: "dateOfJoining", label: "Joining Date",  get: e => e.dateOfJoining ? new Date(e.dateOfJoining).toLocaleDateString("en-IN") : "" },
            { key: "dateOfLeaving", label: "Leaving Date",  get: e => e.dateOfLeaving ? new Date(e.dateOfLeaving).toLocaleDateString("en-IN") : "" },
        ]
    },
    {
        group: "Personal", color: "#8b5cf6",
        cols: [
            { key: "dob",           label: "Date of Birth",    get: e => e.dateOfBirth ? new Date(e.dateOfBirth).toLocaleDateString("en-IN") : "" },
            { key: "gender",        label: "Gender",           get: e => e.gender || "" },
            { key: "bloodGroup",    label: "Blood Group",      get: e => e.bloodGroup || "" },
            { key: "maritalStatus", label: "Marital Status",   get: e => e.maritalStatus || "" },
            { key: "nationality",   label: "Nationality",      get: e => e.nationality || "" },
            { key: "religion",      label: "Religion",         get: e => e.religion || "" },
            { key: "caste",         label: "Caste",            get: e => e.caste || "" },
            { key: "fathersName",   label: "Father's Name",    get: e => e.fathersName || "" },
            { key: "nameAsPerAadhar",label:"Name on Aadhaar",  get: e => e.nameAsPerAadhar || "" },
        ]
    },
    {
        group: "Contact", color: "#0891b2",
        cols: [
            { key: "phone",         label: "Phone",            get: e => e.phone },
            { key: "altPhone",      label: "Alt Phone",        get: e => e.alternatePhone || "" },
            { key: "email",         label: "Email",            get: e => e.email || "" },
            { key: "ec1",           label: "Emergency 1",      get: e => e.emergencyContact1Name ? `${e.emergencyContact1Name} (${e.emergencyContact1Phone})` : "" },
            { key: "ec2",           label: "Emergency 2",      get: e => e.emergencyContact2Name ? `${e.emergencyContact2Name} (${e.emergencyContact2Phone})` : "" },
        ]
    },
    {
        group: "Current Address", color: "#059669",
        cols: [
            { key: "address",       label: "Address",          get: e => e.address || "" },
            { key: "city",          label: "City",             get: e => e.city || "" },
            { key: "state",         label: "State",            get: e => e.state || "" },
            { key: "pincode",       label: "Pincode",          get: e => e.pincode || "" },
        ]
    },
    {
        group: "Permanent Address", color: "#d97706",
        cols: [
            { key: "permAddress",   label: "P. Address",       get: e => e.permanentAddress || "" },
            { key: "permCity",      label: "P. City",          get: e => e.permanentCity || "" },
            { key: "permState",     label: "P. State",         get: e => e.permanentState || "" },
            { key: "permPincode",   label: "P. Pincode",       get: e => e.permanentPincode || "" },
        ]
    },
    {
        group: "Statutory / KYC", color: "#dc2626",
        cols: [
            { key: "aadhar",        label: "Aadhaar No.",      get: e => e.aadharNumber || "" },
            { key: "pan",           label: "PAN No.",          get: e => e.panNumber || "" },
            { key: "uan",           label: "UAN",              get: e => e.uan || "" },
            { key: "pf",            label: "PF Number",        get: e => e.pfNumber || "" },
            { key: "esi",           label: "ESIC Number",      get: e => e.esiNumber || "" },
            { key: "labourCard",    label: "Labour Card No.",  get: e => e.labourCardNo || "" },
            { key: "labourExp",     label: "Labour Card Exp",  get: e => e.labourCardExpDate ? new Date(e.labourCardExpDate).toLocaleDateString("en-IN") : "" },
        ]
    },
    {
        group: "Bank Details", color: "#0369a1",
        cols: [
            { key: "bankAccount",   label: "Account No.",      get: e => e.bankAccountNumber || "" },
            { key: "bankIFSC",      label: "IFSC",             get: e => e.bankIFSC || "" },
            { key: "bankName",      label: "Bank Name",        get: e => e.bankName || "" },
            { key: "bankBranch",    label: "Bank Branch",      get: e => e.bankBranch || "" },
        ]
    },
    {
        group: "Salary", color: "#65a30d",
        cols: [
            { key: "basicSalary",   label: "Basic Salary",     get: e => e.basicSalary ? String(e.basicSalary) : "" },
            { key: "ctc",           label: "CTC Annual",       get: e => e.employeeSalary?.ctcAnnual ? String(e.employeeSalary.ctcAnnual) : "" },
            { key: "salaryType",    label: "Salary Type",      get: e => e.salaryType || "" },
        ]
    },
    {
        group: "Contract", color: "#7c3aed",
        cols: [
            { key: "workSkill",     label: "Work Skill",       get: e => e.workSkill || "" },
            { key: "natureOfWork",  label: "Nature of Work",   get: e => e.natureOfWork || "" },
            { key: "contractorCode",label: "Contractor Code",  get: e => e.contractorCode || "" },
            { key: "workOrder",     label: "Work Order No.",   get: e => e.workOrderNumber || "" },
            { key: "workFrom",      label: "Work Order From",  get: e => e.workOrderFrom ? new Date(e.workOrderFrom).toLocaleDateString("en-IN") : "" },
            { key: "workTo",        label: "Work Order To",    get: e => e.workOrderTo ? new Date(e.workOrderTo).toLocaleDateString("en-IN") : "" },
            { key: "contractFrom",  label: "Contract From",    get: e => e.contractFrom ? new Date(e.contractFrom).toLocaleDateString("en-IN") : "" },
            { key: "contractDays",  label: "Contract Days",    get: e => e.contractPeriodDays ? String(e.contractPeriodDays) : "" },
        ]
    },
    {
        group: "Safety", color: "#f59e0b",
        cols: [
            { key: "sGoggles",      label: "Goggles",          get: e => e.safetyGoggles ? "Yes" : "No" },
            { key: "sGloves",       label: "Gloves",           get: e => e.safetyGloves ? "Yes" : "No" },
            { key: "sHelmet",       label: "Helmet",           get: e => e.safetyHelmet ? "Yes" : "No" },
            { key: "sMask",         label: "Mask",             get: e => e.safetyMask ? "Yes" : "No" },
            { key: "sJacket",       label: "Jacket",           get: e => e.safetyJacket ? "Yes" : "No" },
            { key: "sEarMuffs",     label: "Ear Muffs",        get: e => e.safetyEarMuffs ? "Yes" : "No" },
            { key: "sShoes",        label: "Shoes",            get: e => e.safetyShoes ? "Yes" : "No" },
        ]
    },
    {
        group: "Background / Medical", color: "#6b7280",
        cols: [
            { key: "bgCheck",       label: "BG Checked",       get: e => e.isBackgroundChecked ? "Yes" : "No" },
            { key: "bgRemark",      label: "BG Remark",        get: e => e.backgroundCheckRemark || "" },
            { key: "medical",       label: "Medical Done",     get: e => e.isMedicalDone ? "Yes" : "No" },
            { key: "medRemark",     label: "Medical Remark",   get: e => e.medicalRemark || "" },
        ]
    },
]

const ALL_COLS = COLUMN_GROUPS.flatMap(g => g.cols)

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
    ACTIVE:     { bg: "#dcfce7", color: "#16a34a" },
    INACTIVE:   { bg: "#f3f4f6", color: "#6b7280" },
    ON_LEAVE:   { bg: "#fef9c3", color: "#ca8a04" },
    TERMINATED: { bg: "#fee2e2", color: "#dc2626" },
    RESIGNED:   { bg: "#ede9fe", color: "#7c3aed" },
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EmployeeMasterPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [employees, setEmployees] = useState<Employee[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [branchFilter, setBranchFilter] = useState("")
    const [statusFilter, setStatusFilter] = useState("")
    const [exporting, setExporting] = useState(false)
    const [visibleGroups, setVisibleGroups] = useState<Set<string>>(
        new Set(COLUMN_GROUPS.map(g => g.group))
    )

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
    }, [status, router])

    const fetchEmployees = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (branchFilter) params.set("branchId", branchFilter)
            if (statusFilter) params.set("status", statusFilter)
            if (search) params.set("search", search)
            const res = await fetch(`/api/employees?${params.toString()}`)
            const data = await res.json()
            setEmployees(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load employees")
        } finally {
            setLoading(false)
        }
    }, [branchFilter, statusFilter, search])

    useEffect(() => {
        if (status !== "unauthenticated") fetchEmployees()
    }, [status, fetchEmployees])

    // Unique branches for filter
    const branches = Array.from(new Map(employees.map(e => [e.branch.id, e.branch])).values())

    const toggleGroup = (group: string) => {
        setVisibleGroups(prev => {
            const next = new Set(prev)
            next.has(group) ? next.delete(group) : next.add(group)
            return next
        })
    }

    // ── Excel export ──────────────────────────────────────────────────────────
    const handleExport = () => {
        setExporting(true)
        try {
            const headers = ALL_COLS.map(c => c.label)
            const rows = employees.map(emp => ALL_COLS.map(c => c.get(emp)))

            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

            // Column widths
            ws["!cols"] = headers.map((h, i) => ({
                wch: Math.max(h.length, ...rows.map(r => String(r[i] || "").length), 10)
            }))

            // Header style (bold)
            headers.forEach((_, i) => {
                const cellRef = XLSX.utils.encode_cell({ r: 0, c: i })
                if (ws[cellRef]) {
                    ws[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: "E2E8F0" } } }
                }
            })

            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "Employee Master")

            // Second sheet: group-wise summary
            const summaryData: string[][] = [["Category", "Total", "Active", "Inactive", "Terminated"]]
            const byBranch = new Map<string, Employee[]>()
            employees.forEach(e => {
                const key = e.branch.name
                if (!byBranch.has(key)) byBranch.set(key, [])
                byBranch.get(key)!.push(e)
            })
            byBranch.forEach((emps, branch) => {
                summaryData.push([
                    branch,
                    String(emps.length),
                    String(emps.filter(e => e.status === "ACTIVE").length),
                    String(emps.filter(e => e.status === "INACTIVE").length),
                    String(emps.filter(e => e.status === "TERMINATED").length),
                ])
            })
            summaryData.push(["TOTAL", String(employees.length),
                String(employees.filter(e => e.status === "ACTIVE").length),
                String(employees.filter(e => e.status === "INACTIVE").length),
                String(employees.filter(e => e.status === "TERMINATED").length),
            ])
            const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
            wsSummary["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }]
            XLSX.utils.book_append_sheet(wb, wsSummary, "Branch Summary")

            const date = new Date().toISOString().slice(0, 10)
            XLSX.writeFile(wb, `Employee_Master_${date}.xlsx`)
            toast.success(`Exported ${employees.length} employees`)
        } catch {
            toast.error("Export failed")
        } finally {
            setExporting(false)
        }
    }

    // Visible cols based on toggled groups
    const visibleCols = COLUMN_GROUPS
        .filter(g => visibleGroups.has(g.group))
        .flatMap(g => g.cols.map(c => ({ ...c, groupColor: g.color, groupName: g.group })))

    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER" || session?.user?.role === "HR_MANAGER"

    if (!isAdmin) return (
        <div className="flex items-center justify-center h-64 text-[var(--text3)] text-[13px]">
            Access denied
        </div>
    )

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", minHeight: 0 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: 0 }}>Employee Master</h1>
                    <p style={{ fontSize: 12, color: "var(--text3)", margin: "2px 0 0 0" }}>
                        Complete employee data — all fields, all employees
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={fetchEmployees} disabled={loading}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                    <button onClick={handleExport} disabled={exporting || employees.length === 0}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: (exporting || employees.length === 0) ? 0.6 : 1 }}>
                        {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
                        {exporting ? "Exporting…" : `Download Excel (${employees.length})`}
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                    { label: "Total", value: employees.length, color: "#3b82f6" },
                    { label: "Active", value: employees.filter(e => e.status === "ACTIVE").length, color: "#16a34a" },
                    { label: "Inactive", value: employees.filter(e => e.status === "INACTIVE").length, color: "#6b7280" },
                    { label: "On Leave", value: employees.filter(e => e.status === "ON_LEAVE").length, color: "#f59e0b" },
                    { label: "Terminated", value: employees.filter(e => e.status === "TERMINATED").length, color: "#dc2626" },
                ].map(s => (
                    <div key={s.label} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", minWidth: 90 }}>
                        <p style={{ fontSize: 10, color: "var(--text3)", margin: 0, fontWeight: 600, textTransform: "uppercase" }}>{s.label}</p>
                        <p style={{ fontSize: 20, fontWeight: 700, color: s.color, margin: 0, lineHeight: 1.2 }}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters + Column toggles */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
                    <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, ID, phone…"
                        style={{ width: "100%", padding: "6px 10px 6px 28px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, outline: "none", background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" }} />
                </div>
                <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }}>
                    <option value="">All Branches</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }}>
                    <option value="">All Status</option>
                    {["ACTIVE","INACTIVE","ON_LEAVE","TERMINATED","RESIGNED"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                {/* Column group toggles */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <Filter size={12} style={{ color: "var(--text3)" }} />
                    {COLUMN_GROUPS.map(g => (
                        <button key={g.group} onClick={() => toggleGroup(g.group)}
                            style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `1px solid ${g.color}40`,
                                background: visibleGroups.has(g.group) ? g.color + "22" : "transparent",
                                color: visibleGroups.has(g.group) ? g.color : "var(--text3)",
                                transition: "all 0.15s" }}>
                            {g.group}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
                {loading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, gap: 10 }}>
                        <Loader2 size={22} className="animate-spin" style={{ color: "var(--accent)" }} />
                        <span style={{ fontSize: 13, color: "var(--text3)" }}>Loading employees…</span>
                    </div>
                ) : employees.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, gap: 8 }}>
                        <span style={{ fontSize: 13, color: "var(--text3)" }}>No employees found</span>
                    </div>
                ) : (
                    <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%", fontSize: 12 }}>
                        <thead>
                            {/* Group header row */}
                            <tr style={{ background: "#f8fafc" }}>
                                <th style={{ position: "sticky", left: 0, zIndex: 3, background: "#f8fafc", padding: "6px 12px", borderBottom: "2px solid var(--border)", borderRight: "2px solid var(--border)", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap" }}>
                                    #
                                </th>
                                {COLUMN_GROUPS.filter(g => visibleGroups.has(g.group)).map(g => (
                                    <th key={g.group} colSpan={g.cols.length}
                                        style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", borderRight: "1px solid " + g.color + "40",
                                            background: g.color + "12", color: g.color, fontSize: 10, fontWeight: 700,
                                            textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center", whiteSpace: "nowrap" }}>
                                        {g.group}
                                    </th>
                                ))}
                            </tr>
                            {/* Column labels row */}
                            <tr style={{ background: "#f1f5f9" }}>
                                <th style={{ position: "sticky", left: 0, zIndex: 3, background: "#f1f5f9", padding: "5px 10px", borderBottom: "2px solid var(--border)", borderRight: "2px solid var(--border)", textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap" }}>
                                    SL
                                </th>
                                {visibleCols.map(col => (
                                    <th key={col.key} style={{ padding: "5px 10px", borderBottom: "2px solid var(--border)", borderRight: "1px solid var(--border)", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap", minWidth: 90 }}>
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {employees.map((emp, idx) => {
                                const sc = STATUS_COLOR[emp.status] || { bg: "#f3f4f6", color: "#6b7280" }
                                return (
                                    <tr key={emp.id} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid var(--border)" }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "#eff6ff")}
                                        onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#f8fafc")}>
                                        <td style={{ position: "sticky", left: 0, zIndex: 2, background: "inherit", padding: "6px 10px", borderRight: "2px solid var(--border)", textAlign: "center", fontSize: 11, color: "var(--text3)", fontWeight: 600, whiteSpace: "nowrap" }}>
                                            {idx + 1}
                                        </td>
                                        {visibleCols.map(col => {
                                            const val = col.get(emp)
                                            const isStatus = col.key === "status"
                                            return (
                                                <td key={col.key} style={{ padding: "6px 10px", borderRight: "1px solid #e2e8f0", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)" }}
                                                    title={val}>
                                                    {isStatus ? (
                                                        <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: sc.bg, color: sc.color }}>
                                                            {val}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: 12, color: val ? "var(--text)" : "var(--text3)" }}>
                                                            {val || "—"}
                                                        </span>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "var(--text3)" }}>
                <span>Showing {employees.length} employee{employees.length !== 1 ? "s" : ""}</span>
                <span>{visibleCols.length} columns visible</span>
            </div>
        </div>
    )
}
