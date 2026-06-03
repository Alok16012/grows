"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { can } from "@/lib/can"
import {
    Plus, Search, Loader2, X, CreditCard,
    ChevronRight, CheckCircle2, Clock,
    XCircle, Wallet, Calendar, MoreVertical,
    Trash2, Edit2, Send, BadgeCheck, Ban, Banknote,
    Upload, FileText, Paperclip, Briefcase, Download,
    type LucideIcon
} from "lucide-react"
import { format } from "date-fns"
import * as XLSX from "xlsx"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts"

// ─── Types ─────────────────────────────────────────────────────────────────────

type ExpenseStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID"
type ExpenseCategory =
    // Travel
    | "TRAVEL" | "TRANSPORTATION" | "FUEL" | "ACCOMMODATION"
    // Daily Ops
    | "FOOD" | "HOTEL" | "MATERIAL" | "OFFICE_SUPPLIES" | "OFFICE_CONSUMABLES"
    | "STATIONERY_PRINTING" | "HOUSEKEEPING_CLEANING" | "UTILITY_ELECTRICAL" | "REPAIR_MAINTENANCE"
    // People & HR
    | "SALARY_WAGES" | "EMPLOYEE_ADVANCE" | "RECRUITMENT_EXPENSE" | "CANDIDATE_EXPENSE"
    | "HR_OPERATIONS" | "SAFETY_PPE"
    // Business / Client
    | "CLIENT_PROJECT" | "LABOUR" | "INSPECTION_QUALITY" | "COMPLIANCE_AUDIT" | "CELEBRATION"
    // Tech & Admin
    | "IT_ACCESSORIES" | "COURIER" | "DOCUMENTATION_LEGAL" | "MOBILE_RECHARGE"
    // Legacy / Catch-all
    | "COMMUNICATION" | "MEDICAL" | "UNIFORM" | "TRAINING" | "MISCELLANEOUS" | "OTHER"

type ExpenseUser = { id: string; name: string; email: string }

type ExpenseProject = { id: string; name: string; company?: { id: string; name: string } | null }

// A single leg of a travel journey
type TravelEntry = {
    date: string   // "yyyy-MM-dd"
    from: string
    to: string
    kms: number
    amount: number // kms × perKmRate at submission time
}

type Expense = {
    id: string
    expenseNo: string
    title: string
    category: ExpenseCategory
    amount: number
    date: string
    description: string | null
    receiptUrl: string | null
    submittedBy: string
    employeeId: string | null
    projectId: string | null
    project: ExpenseProject | null
    approvedBy: string | null
    approvedAt: string | null
    rejectedAt: string | null
    rejectionReason: string | null
    paidAt: string | null
    paymentDate: string | null
    paymentMode: string | null
    transactionId: string | null
    travelDays: number | null
    travelDailyRate: number | null
    travelEntries: TravelEntry[] | null
    status: ExpenseStatus
    createdAt: string
    updatedAt: string
    submittedByUser: ExpenseUser | null
    approvedByUser: ExpenseUser | null
}

// ─── Constants ─────────────────────────────────────────────────────────────────

// All 26 active categories — in display order.
const CATEGORIES: ExpenseCategory[] = [
    // Travel
    "TRAVEL", "TRANSPORTATION", "FUEL", "ACCOMMODATION",
    // Daily Ops
    "FOOD", "HOTEL", "MATERIAL", "OFFICE_SUPPLIES", "OFFICE_CONSUMABLES",
    "STATIONERY_PRINTING", "HOUSEKEEPING_CLEANING", "UTILITY_ELECTRICAL", "REPAIR_MAINTENANCE",
    // People & HR
    "SALARY_WAGES", "EMPLOYEE_ADVANCE", "RECRUITMENT_EXPENSE", "CANDIDATE_EXPENSE",
    "HR_OPERATIONS", "SAFETY_PPE",
    // Business / Client
    "CLIENT_PROJECT", "LABOUR", "INSPECTION_QUALITY", "COMPLIANCE_AUDIT", "CELEBRATION",
    // Tech & Admin
    "IT_ACCESSORIES", "COURIER", "DOCUMENTATION_LEGAL", "MOBILE_RECHARGE",
    // Catch-all
    "MISCELLANEOUS",
]

const PAYMENT_MODES = ["Cash", "NEFT", "RTGS", "UPI", "Cheque", "Bank Transfer"]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
    return "₹" + amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function categoryLabel(cat: ExpenseCategory): string {
    const map: Record<ExpenseCategory, string> = {
        // Travel
        TRAVEL:               "Travel",
        TRANSPORTATION:       "Transportation",
        FUEL:                 "Fuel",
        ACCOMMODATION:        "Accommodation / Room Rent",
        // Daily Ops
        FOOD:                 "Food & Refreshment",
        HOTEL:                "Hotel",
        MATERIAL:             "Material",
        OFFICE_SUPPLIES:      "Office Supplies",
        OFFICE_CONSUMABLES:   "Office Consumables",
        STATIONERY_PRINTING:  "Stationery & Printing",
        HOUSEKEEPING_CLEANING:"Housekeeping & Cleaning",
        UTILITY_ELECTRICAL:   "Office Utility & Electrical",
        REPAIR_MAINTENANCE:   "Repair & Maintenance",
        // People & HR
        SALARY_WAGES:         "Salary & Wages",
        EMPLOYEE_ADVANCE:     "Employee Advance",
        RECRUITMENT_EXPENSE:  "Recruitment Expense",
        CANDIDATE_EXPENSE:    "Candidate Expense",
        HR_OPERATIONS:        "Attendance & HR Operations",
        SAFETY_PPE:           "Safety Shoes & PPE",
        // Business / Client
        CLIENT_PROJECT:       "Client / Project Expense",
        LABOUR:               "Labour Expense",
        INSPECTION_QUALITY:   "Inspection & Quality Operations",
        COMPLIANCE_AUDIT:     "Compliance & Audit Expense",
        CELEBRATION:          "Celebration & Employee Engagement",
        // Tech & Admin
        IT_ACCESSORIES:       "IT Accessories",
        COURIER:              "Courier Charges",
        DOCUMENTATION_LEGAL:  "Documentation & Legal",
        MOBILE_RECHARGE:      "Mobile Recharge",
        // Legacy / Catch-all
        COMMUNICATION:        "Communication",
        MEDICAL:              "Medical",
        UNIFORM:              "Uniform",
        TRAINING:             "Training",
        MISCELLANEOUS:        "Miscellaneous Expense",
        OTHER:                "Other",
    }
    return map[cat] || cat
}

function categoryStyle(cat: ExpenseCategory): { bg: string; color: string } {
    const map: Record<ExpenseCategory, { bg: string; color: string }> = {
        // Travel
        TRAVEL:               { bg: "#eff6ff", color: "#3b82f6" },
        TRANSPORTATION:       { bg: "#eef2ff", color: "#6366f1" },
        FUEL:                 { bg: "#fefce8", color: "#ca8a04" },
        ACCOMMODATION:        { bg: "#fdf4ff", color: "#a855f7" },
        // Daily Ops
        FOOD:                 { bg: "#fff7ed", color: "#f97316" },
        HOTEL:                { bg: "#fdf4ff", color: "#a855f7" },
        MATERIAL:             { bg: "#fef3c7", color: "#b45309" },
        OFFICE_SUPPLIES:      { bg: "#f0fdfa", color: "#0d9488" },
        OFFICE_CONSUMABLES:   { bg: "#f0fdfa", color: "#0f766e" },
        STATIONERY_PRINTING:  { bg: "#f1f5f9", color: "#475569" },
        HOUSEKEEPING_CLEANING:{ bg: "#ecfeff", color: "#0891b2" },
        UTILITY_ELECTRICAL:   { bg: "#fffbeb", color: "#d97706" },
        REPAIR_MAINTENANCE:   { bg: "#fef3c7", color: "#92400e" },
        // People & HR
        SALARY_WAGES:         { bg: "#f0fdf4", color: "#16a34a" },
        EMPLOYEE_ADVANCE:     { bg: "#f0fdf4", color: "#15803d" },
        RECRUITMENT_EXPENSE:  { bg: "#f5f3ff", color: "#7c3aed" },
        CANDIDATE_EXPENSE:    { bg: "#fdf2f8", color: "#db2777" },
        HR_OPERATIONS:        { bg: "#ecfdf5", color: "#059669" },
        SAFETY_PPE:           { bg: "#fef2f2", color: "#dc2626" },
        // Business / Client
        CLIENT_PROJECT:       { bg: "#eff6ff", color: "#1d4ed8" },
        LABOUR:               { bg: "#f7fee7", color: "#65a30d" },
        INSPECTION_QUALITY:   { bg: "#f0f9ff", color: "#0284c7" },
        COMPLIANCE_AUDIT:     { bg: "#f4f4f5", color: "#52525b" },
        CELEBRATION:          { bg: "#fff1f2", color: "#f43f5e" },
        // Tech & Admin
        IT_ACCESSORIES:       { bg: "#eef2ff", color: "#4f46e5" },
        COURIER:              { bg: "#f0f9ff", color: "#0ea5e9" },
        DOCUMENTATION_LEGAL:  { bg: "#f8fafc", color: "#334155" },
        MOBILE_RECHARGE:      { bg: "#ecfeff", color: "#0891b2" },
        // Legacy
        COMMUNICATION:        { bg: "#ecfeff", color: "#0891b2" },
        MEDICAL:              { bg: "#fef2f2", color: "#ef4444" },
        UNIFORM:              { bg: "#eef2ff", color: "#6366f1" },
        TRAINING:             { bg: "#f0fdf4", color: "#22c55e" },
        MISCELLANEOUS:        { bg: "#f9fafb", color: "#6b7280" },
        OTHER:                { bg: "#f9fafb", color: "#6b7280" },
    }
    return map[cat] || { bg: "#f9fafb", color: "#6b7280" }
}

function statusStyle(status: ExpenseStatus): { bg: string; color: string; label: string } {
    const map: Record<ExpenseStatus, { bg: string; color: string; label: string }> = {
        DRAFT: { bg: "#f9fafb", color: "#6b7280", label: "Draft" },
        SUBMITTED: { bg: "#eff6ff", color: "#3b82f6", label: "Submitted" },
        APPROVED: { bg: "#e8f7f1", color: "#1a9e6e", label: "Approved" },
        REJECTED: { bg: "#fef2f2", color: "#ef4444", label: "Rejected" },
        PAID: { bg: "#fdf4ff", color: "#a855f7", label: "Paid" },
    }
    return map[status]
}

function avatarColor(name: string): string {
    const colors = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#0ea5e9"]
    return name ? colors[name.charCodeAt(0) % colors.length] : colors[0]
}

function UserAvatar({ name, size = 28 }: { name: string; size?: number }) {
    const initials = name
        ? name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)
        : "?"
    return (
        <div
            style={{ width: size, height: size, background: avatarColor(name), fontSize: size * 0.35 }}
            className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
        >
            {initials}
        </div>
    )
}

// ─── Add Expense Modal ─────────────────────────────────────────────────────────

// ─── Travel entry row type used only inside AddExpenseModal ──────────────────
type TravelRow = { _id: string; date: string; from: string; to: string; kms: string }

function mkRow(date: string): TravelRow {
    return { _id: Math.random().toString(36).slice(2), date, from: "", to: "", kms: "" }
}

function AddExpenseModal({
    open, onClose, onSaved, editExpense
}: {
    open: boolean
    onClose: () => void
    onSaved: () => void
    editExpense?: Expense | null
}) {
    const [loading, setLoading] = useState(false)
    const [receiptUrl, setReceiptUrl] = useState("")
    const [receiptUploading, setReceiptUploading] = useState(false)
    const receiptInputRef = useRef<HTMLInputElement>(null)
    const [projects, setProjects] = useState<ExpenseProject[]>([])
    const [perKmRate, setPerKmRate] = useState(0)
    const [form, setForm] = useState({
        title: "",
        category: "TRAVEL" as ExpenseCategory,
        amount: "",
        date: format(new Date(), "yyyy-MM-dd"),
        description: "",
        projectId: "",
    })
    // Travel journey rows
    const today = format(new Date(), "yyyy-MM-dd")
    const [travelRows, setTravelRows] = useState<TravelRow[]>([mkRow(today)])

    useEffect(() => {
        if (!open) return
        fetch("/api/projects")
            .then(r => r.ok ? r.json() : [])
            .then((data: any) => {
                const list = Array.isArray(data) ? data : (data.projects ?? [])
                setProjects(list.map((p: any) => ({ id: p.id, name: p.name, company: p.company ?? null })))
            })
            .catch(() => setProjects([]))
        fetch("/api/settings?key=TRAVEL_PER_KM_RATE")
            .then(r => r.ok ? r.json() : { value: "0" })
            .then(d => setPerKmRate(parseFloat(d.value || "0")))
            .catch(() => {})
    }, [open])

    useEffect(() => {
        if (!open) return
        if (editExpense) {
            setForm({
                title: editExpense.title,
                category: editExpense.category,
                amount: String(editExpense.amount),
                date: format(new Date(editExpense.date), "yyyy-MM-dd"),
                description: editExpense.description || "",
                projectId: editExpense.projectId || "",
            })
            setReceiptUrl(editExpense.receiptUrl || "")
            // Restore travel rows from saved entries
            if (editExpense.category === "TRAVEL" && editExpense.travelEntries?.length) {
                setTravelRows(editExpense.travelEntries.map(e => ({
                    _id: Math.random().toString(36).slice(2),
                    date: e.date,
                    from: e.from,
                    to: e.to,
                    kms: String(e.kms),
                })))
            } else {
                setTravelRows([mkRow(format(new Date(editExpense.date), "yyyy-MM-dd"))])
            }
        } else {
            setForm({ title: "", category: "TRAVEL", amount: "", date: today, description: "", projectId: "" })
            setReceiptUrl("")
            setTravelRows([mkRow(today)])
        }
    }, [open, editExpense])

    const uploadReceipt = async (file: File) => {
        if (file.size > 5 * 1024 * 1024) { toast.error("Receipt must be under 5MB"); return }
        setReceiptUploading(true)
        try {
            const fd = new FormData()
            fd.append("file", file)
            const res = await fetch("/api/upload", { method: "POST", body: fd })
            const data = await res.json()
            if (data.url) setReceiptUrl(data.url)
            else toast.error("Receipt upload failed")
        } catch { toast.error("Receipt upload error") }
        finally { setReceiptUploading(false) }
    }

    const updateRow = (id: string, field: keyof TravelRow, val: string) =>
        setTravelRows(rows => rows.map(r => r._id === id ? { ...r, [field]: val } : r))

    // Derived totals for TRAVEL
    const travelTotals = travelRows.reduce((acc, r) => {
        const k = parseFloat(r.kms) || 0
        acc.kms += k
        acc.amount += k * perKmRate
        return acc
    }, { kms: 0, amount: 0 })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        // Validate travel rows
        if (form.category === "TRAVEL") {
            if (perKmRate === 0) {
                toast.error("Travel per-km rate is not configured. Ask your admin to set it via Employee Summary → ⚙️ Travel rate.")
                return
            }
            const incomplete = travelRows.some(r => !r.from.trim() || !r.to.trim() || !parseFloat(r.kms))
            if (incomplete) { toast.error("Fill From, To, and KMs for every journey row"); return }
        }
        setLoading(true)
        try {
            const url = editExpense ? `/api/expenses/${editExpense.id}` : "/api/expenses"
            const method = editExpense ? "PUT" : "POST"

            let payload: any = { ...form, receiptUrl: receiptUrl || null, projectId: form.projectId || null }

            if (form.category === "TRAVEL") {
                const entries: TravelEntry[] = travelRows.map(r => ({
                    date: r.date,
                    from: r.from.trim(),
                    to: r.to.trim(),
                    kms: parseFloat(r.kms) || 0,
                    amount: (parseFloat(r.kms) || 0) * perKmRate,
                }))
                // Use date of first entry as the expense date
                payload.date = entries[0].date
                payload.amount = travelTotals.amount
                payload.travelEntries = entries
            } else {
                payload.amount = parseFloat(form.amount)
            }

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(editExpense ? "Expense updated!" : "Expense created!")
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to save expense")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-xl shadow-xl max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-white rounded-t-[16px]">
                    <h2 className="text-[15px] font-semibold text-[var(--text)]">
                        {editExpense ? "Edit Expense" : "Add Expense"}
                    </h2>
                    <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Title *</label>
                        <input
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="e.g. Client visit — Delhi"
                            className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                            required
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Category *</label>
                            <select
                                value={form.category}
                                onChange={e => setForm(f => ({ ...f, category: e.target.value as ExpenseCategory }))}
                                className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                                required
                            >
                                {CATEGORIES.map(c => (
                                    <option key={c} value={c}>{categoryLabel(c)}</option>
                                ))}
                            </select>
                        </div>
                        {form.category !== "TRAVEL" && (
                            <div>
                                <label className="block text-[12px] text-[var(--text2)] mb-1">Amount (₹) *</label>
                                <input
                                    type="number"
                                    value={form.amount}
                                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                    placeholder="0.00"
                                    min="0" step="0.01"
                                    className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                                    required
                                />
                            </div>
                        )}
                    </div>

                    {/* ── TRAVEL section ──────────────────────────── */}
                    {form.category === "TRAVEL" && (
                        <div style={{ border: `1.5px solid ${perKmRate > 0 ? "#bfdbfe" : "#fecaca"}`, borderRadius: 12, overflow: "hidden" }}>
                            {/* Header */}
                            <div style={{ background: perKmRate > 0 ? "#eff6ff" : "#fef2f2", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: perKmRate > 0 ? "#1d4ed8" : "#dc2626", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    🚗 Travel Journeys
                                </p>
                                <span style={{ fontSize: 12, color: perKmRate > 0 ? "#3b82f6" : "#dc2626", fontWeight: 600 }}>
                                    {perKmRate > 0 ? `₹${perKmRate}/km` : "⚠️ Rate not set — ask admin"}
                                </span>
                            </div>

                            {/* Rows */}
                            <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                                {/* Column headers */}
                                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 70px 80px 28px", gap: 6, padding: "0 2px" }}>
                                    {["Date", "From", "To", "KMs", "Amount", ""].map(h => (
                                        <span key={h} style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase" }}>{h}</span>
                                    ))}
                                </div>

                                {travelRows.map((row, idx) => {
                                    const amt = (parseFloat(row.kms) || 0) * perKmRate
                                    return (
                                        <div key={row._id} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 70px 80px 28px", gap: 6, alignItems: "center" }}>
                                            <input type="date" value={row.date}
                                                onChange={e => updateRow(row._id, "date", e.target.value)}
                                                style={{ height: 32, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 6px", fontSize: 12, outline: "none", width: "100%" }} />
                                            <input value={row.from} onChange={e => updateRow(row._id, "from", e.target.value)}
                                                placeholder="From" required
                                                style={{ height: 32, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", fontSize: 12, outline: "none", width: "100%" }} />
                                            <input value={row.to} onChange={e => updateRow(row._id, "to", e.target.value)}
                                                placeholder="To" required
                                                style={{ height: 32, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", fontSize: 12, outline: "none", width: "100%" }} />
                                            <input type="number" value={row.kms} onChange={e => updateRow(row._id, "kms", e.target.value)}
                                                placeholder="0" min="0" step="0.1" required
                                                style={{ height: 32, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 6px", fontSize: 12, outline: "none", width: "100%", textAlign: "right" }} />
                                            <span style={{ fontSize: 12, fontWeight: 700, color: amt > 0 ? "#1d4ed8" : "#9ca3af", textAlign: "right" }}>
                                                {amt > 0 ? `₹${amt.toLocaleString("en-IN")}` : "—"}
                                            </span>
                                            <button type="button" onClick={() => setTravelRows(r => r.filter(x => x._id !== row._id))}
                                                disabled={travelRows.length === 1}
                                                style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: travelRows.length === 1 ? "not-allowed" : "pointer", color: travelRows.length === 1 ? "#d1d5db" : "#ef4444", borderRadius: 5 }}>
                                                <X size={13} />
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Add row */}
                            <div style={{ padding: "4px 12px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <button type="button"
                                    onClick={() => setTravelRows(r => [...r, mkRow(r[r.length - 1]?.date || today)])}
                                    style={{ display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 12px", background: "#eff6ff", color: "#1d4ed8", border: "1px dashed #93c5fd", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                    <Plus size={13} /> Add Journey
                                </button>
                                {travelTotals.kms > 0 && (
                                    <div style={{ textAlign: "right" }}>
                                        <span style={{ fontSize: 11, color: "#6b7280" }}>{travelTotals.kms.toFixed(1)} km  </span>
                                        <span style={{ fontSize: 14, fontWeight: 800, color: "#1d4ed8" }}>₹{travelTotals.amount.toLocaleString("en-IN")}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        {/* For TRAVEL the date comes from the first journey row; hide standalone date */}
                        {form.category !== "TRAVEL" && (
                            <div>
                                <label className="block text-[12px] text-[var(--text2)] mb-1">Date *</label>
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                    className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                                    required
                                />
                            </div>
                        )}
                        <div className={form.category === "TRAVEL" ? "col-span-2" : ""}>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Project / Client</label>
                            <select
                                value={form.projectId}
                                onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                                className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                            >
                                <option value="">— None —</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}{p.company?.name ? ` · ${p.company.name}` : ""}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Description</label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Additional details about this expense..."
                            className="w-full rounded-[8px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
                            rows={3}
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Receipt / Bill</label>
                        <div className="rounded-[8px] bg-[var(--surface2)] border border-[var(--border)] p-3 flex items-center gap-3">
                            {receiptUrl ? (
                                /\.(jpe?g|png|gif|webp)$/i.test(receiptUrl) ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={receiptUrl} alt="Receipt" className="w-14 h-14 rounded-[6px] object-cover border border-[var(--border)]" />
                                ) : (
                                    <div className="w-14 h-14 rounded-[6px] bg-white border border-[var(--border)] flex items-center justify-center">
                                        <FileText size={20} className="text-[var(--accent)]" />
                                    </div>
                                )
                            ) : (
                                <div className="w-14 h-14 rounded-[6px] bg-white border border-dashed border-[var(--border)] flex items-center justify-center">
                                    <Upload size={18} className="text-[var(--text3)]" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                {receiptUrl ? (
                                    <a href={receiptUrl} target="_blank" rel="noopener noreferrer"
                                        className="text-[12px] font-medium text-[var(--accent)] hover:underline block truncate">
                                        View attached receipt
                                    </a>
                                ) : (
                                    <p className="text-[12px] text-[var(--text2)]">JPG / PNG / PDF • max 5MB</p>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                    <button type="button" onClick={() => receiptInputRef.current?.click()} disabled={receiptUploading}
                                        className="h-7 px-3 text-[11px] font-semibold bg-white border border-[var(--border)] rounded-[6px] hover:bg-[var(--surface)] disabled:opacity-60 inline-flex items-center gap-1.5">
                                        {receiptUploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                                        {receiptUploading ? "Uploading…" : receiptUrl ? "Change" : "Upload"}
                                    </button>
                                    {receiptUrl && (
                                        <button type="button" onClick={() => setReceiptUrl("")}
                                            className="h-7 px-3 text-[11px] font-semibold text-red-500 border border-red-200 rounded-[6px] hover:bg-red-50 inline-flex items-center gap-1.5">
                                            <Trash2 size={11} /> Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                            <input ref={receiptInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadReceipt(f); e.target.value = "" }} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-9 px-4 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="h-9 px-4 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2"
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            {editExpense ? "Save Changes" : "Create Expense"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Expense Detail Drawer ─────────────────────────────────────────────────────

function ExpenseDrawer({
    expense,
    onClose,
    onRefresh,
    isPrivileged,
    currentUserId,
}: {
    expense: Expense | null
    onClose: () => void
    onRefresh: () => void
    isPrivileged: boolean
    currentUserId: string
}) {
    const [actionLoading, setActionLoading] = useState(false)
    const [showRejectBox, setShowRejectBox] = useState(false)
    const [showPayBox, setShowPayBox] = useState(false)
    const [rejectionReason, setRejectionReason] = useState("")
    const [paymentMode, setPaymentMode] = useState("NEFT")
    const [transactionId, setTransactionId] = useState("")
    const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"))
    const [showEditModal, setShowEditModal] = useState(false)

    useEffect(() => {
        setShowRejectBox(false)
        setShowPayBox(false)
        setRejectionReason("")
        setPaymentMode("NEFT")
        setTransactionId("")
        setPaymentDate(format(new Date(), "yyyy-MM-dd"))
    }, [expense?.id])

    if (!expense) return null

    const isOwner = expense.submittedBy === currentUserId

    const doAction = async (action: string, extra?: Record<string, string>) => {
        setActionLoading(true)
        try {
            const res = await fetch(`/api/expenses/${expense.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...extra }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(
                action === "SUBMIT" ? "Submitted for approval!" :
                    action === "APPROVE" ? "Expense approved!" :
                        action === "REJECT" ? "Expense rejected." :
                            "Marked as paid!"
            )
            onRefresh()
            setShowRejectBox(false)
            setShowPayBox(false)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Action failed")
        } finally {
            setActionLoading(false)
        }
    }

    const doDelete = async () => {
        if (!confirm("Delete this expense? This cannot be undone.")) return
        setActionLoading(true)
        try {
            const res = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Expense deleted.")
            onClose()
            onRefresh()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Delete failed")
        } finally {
            setActionLoading(false)
        }
    }

    const catStyle = categoryStyle(expense.category)
    const stStyle = statusStyle(expense.status)

    // Timeline steps
    const timelineSteps: { label: string; done: boolean; active: boolean; date?: string | null; failed?: boolean }[] = [
        { label: "Draft", done: true, active: expense.status === "DRAFT", date: expense.createdAt },
        {
            label: "Submitted",
            done: ["SUBMITTED", "APPROVED", "REJECTED", "PAID"].includes(expense.status),
            active: expense.status === "SUBMITTED",
            date: expense.status !== "DRAFT" ? expense.updatedAt : null,
        },
        {
            label: expense.status === "REJECTED" ? "Rejected" : "Approved",
            done: ["APPROVED", "REJECTED", "PAID"].includes(expense.status),
            active: expense.status === "APPROVED" || expense.status === "REJECTED",
            date: expense.approvedAt || expense.rejectedAt,
            failed: expense.status === "REJECTED",
        },
        {
            label: "Paid",
            done: expense.status === "PAID",
            active: expense.status === "PAID",
            date: expense.paidAt,
        },
    ]

    return (
        <>
            {showEditModal && (
                <AddExpenseModal
                    open={showEditModal}
                    onClose={() => setShowEditModal(false)}
                    onSaved={() => { onRefresh(); setShowEditModal(false) }}
                    editExpense={expense}
                />
            )}
            <div className="fixed inset-0 z-40 flex">
                <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
                <div className="w-full max-w-md bg-white border-l border-[var(--border)] h-full overflow-y-auto flex flex-col shadow-xl">
                    {/* Header */}
                    <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-white z-10">
                        <div>
                            <p className="font-mono text-[12px] text-[var(--accent)] font-semibold">{expense.expenseNo}</p>
                            <h2 className="text-[15px] font-semibold text-[var(--text)] mt-0.5 leading-tight">{expense.title}</h2>
                            <div className="mt-1.5">
                                <span
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                                    style={{ background: stStyle.bg, color: stStyle.color }}
                                >
                                    {stStyle.label}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors shrink-0 mt-0.5"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flex-1 p-5 space-y-5">
                        {/* Meta Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-[var(--surface2)] rounded-[10px] p-3">
                                <p className="text-[11px] text-[var(--text3)] mb-1">Category</p>
                                <span
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                                    style={{ background: catStyle.bg, color: catStyle.color }}
                                >
                                    {categoryLabel(expense.category)}
                                </span>
                            </div>
                            <div className="bg-[var(--surface2)] rounded-[10px] p-3">
                                <p className="text-[11px] text-[var(--text3)] mb-1">Amount</p>
                                <p className="text-[16px] font-bold text-[var(--text)]">{formatINR(expense.amount)}</p>
                            </div>
                            <div className="bg-[var(--surface2)] rounded-[10px] p-3">
                                <p className="text-[11px] text-[var(--text3)] mb-1">Date</p>
                                <p className="text-[13px] font-medium text-[var(--text)]">
                                    {format(new Date(expense.date), "dd MMM yyyy")}
                                </p>
                            </div>
                            <div className="bg-[var(--surface2)] rounded-[10px] p-3">
                                <p className="text-[11px] text-[var(--text3)] mb-1">Submitted by</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <UserAvatar name={expense.submittedByUser?.name || "?"} size={20} />
                                    <p className="text-[13px] font-medium text-[var(--text)] truncate">
                                        {expense.submittedByUser?.name || "Unknown"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Project / Client */}
                        {expense.project && (
                            <div>
                                <p className="text-[12px] font-medium text-[var(--text2)] mb-1.5">Project / Client</p>
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#eef2ff] text-[#4338ca] text-[12px] font-medium">
                                    <Briefcase size={12} />
                                    {expense.project.name}
                                    {expense.project.company?.name ? <span className="opacity-70">· {expense.project.company.name}</span> : null}
                                </div>
                            </div>
                        )}

                        {/* Description */}
                        {expense.description && (
                            <div>
                                <p className="text-[12px] font-medium text-[var(--text2)] mb-1.5">Description</p>
                                <p className="text-[13px] text-[var(--text)] bg-[var(--surface2)] rounded-[10px] p-3 leading-relaxed">
                                    {expense.description}
                                </p>
                            </div>
                        )}

                        {/* Receipt */}
                        {expense.receiptUrl && (
                            <div>
                                <p className="text-[12px] font-medium text-[var(--text2)] mb-1.5">Receipt / Bill</p>
                                {/\.(jpe?g|png|gif|webp)$/i.test(expense.receiptUrl) ? (
                                    <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="block">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={expense.receiptUrl} alt="Receipt" className="w-full max-h-72 object-contain rounded-[10px] border border-[var(--border)] bg-[var(--surface2)]" />
                                    </a>
                                ) : (
                                    <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-[8px] border border-[var(--border)] bg-white text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--surface2)]">
                                        <FileText size={14} /> View attached file
                                    </a>
                                )}
                            </div>
                        )}

                        {/* Rejection reason */}
                        {expense.status === "REJECTED" && expense.rejectionReason && (
                            <div className="rounded-[10px] bg-[#fef2f2] border border-[#fecaca] p-3">
                                <p className="text-[12px] font-semibold text-[#ef4444] mb-1 flex items-center gap-1.5">
                                    <XCircle size={14} /> Rejection Reason
                                </p>
                                <p className="text-[13px] text-[#b91c1c]">{expense.rejectionReason}</p>
                            </div>
                        )}

                        {/* Payment info */}
                        {expense.status === "PAID" && (
                            <div className="rounded-[10px] bg-[#fdf4ff] border border-[#e9d5ff] p-3">
                                <p className="text-[12px] font-semibold text-[#a855f7] mb-2 flex items-center gap-1.5">
                                    <BadgeCheck size={14} /> Payment Details
                                </p>
                                <div className="grid grid-cols-2 gap-2 text-[12px]">
                                    <div>
                                        <span className="text-[var(--text3)]">Mode: </span>
                                        <span className="font-medium text-[var(--text)]">{expense.paymentMode}</span>
                                    </div>
                                    <div>
                                        <span className="text-[var(--text3)]">Payment date: </span>
                                        <span className="font-medium text-[var(--text)]">
                                            {expense.paymentDate
                                                ? format(new Date(expense.paymentDate), "dd MMM yyyy")
                                                : expense.paidAt ? format(new Date(expense.paidAt), "dd MMM yyyy") : "-"}
                                        </span>
                                    </div>
                                    {expense.transactionId && (
                                        <div className="col-span-2">
                                            <span className="text-[var(--text3)]">UTR / Txn ID: </span>
                                            <span className="font-mono font-medium text-[var(--text)]">{expense.transactionId}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Status Timeline */}
                        <div>
                            <p className="text-[12px] font-medium text-[var(--text2)] mb-3">Status Timeline</p>
                            <div className="relative">
                                {timelineSteps.map((step, idx) => (
                                    <div key={idx} className="flex items-start gap-3 relative">
                                        {/* Connector line */}
                                        {idx < timelineSteps.length - 1 && (
                                            <div
                                                className="absolute left-[9px] top-[18px] w-[2px] h-[28px]"
                                                style={{ background: step.done ? "var(--accent)" : "var(--border)" }}
                                            />
                                        )}
                                        {/* Dot */}
                                        <div
                                            className="w-[20px] h-[20px] rounded-full flex items-center justify-center shrink-0 mt-0.5 border-2"
                                            style={{
                                                background: step.failed ? "#fef2f2" : step.done ? "#e8f7f1" : "var(--surface2)",
                                                borderColor: step.failed ? "#ef4444" : step.done ? "var(--accent)" : "var(--border)",
                                            }}
                                        >
                                            {step.done && !step.failed && (
                                                <CheckCircle2 size={10} color="#1a9e6e" />
                                            )}
                                            {step.failed && <XCircle size={10} color="#ef4444" />}
                                        </div>
                                        {/* Label */}
                                        <div className="pb-6">
                                            <p
                                                className="text-[13px] font-medium"
                                                style={{
                                                    color: step.failed ? "#ef4444" : step.done ? "var(--text)" : "var(--text3)",
                                                }}
                                            >
                                                {step.label}
                                            </p>
                                            {step.date && (
                                                <p className="text-[11px] text-[var(--text3)]">
                                                    {format(new Date(step.date), "dd MMM yyyy, hh:mm a")}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-3 pt-1">
                            {/* Owner + DRAFT */}
                            {isOwner && expense.status === "DRAFT" && (
                                <>
                                    <button
                                        onClick={() => setShowEditModal(true)}
                                        className="w-full h-9 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)] flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <Edit2 size={14} /> Edit Expense
                                    </button>
                                    <button
                                        onClick={() => doAction("SUBMIT")}
                                        disabled={actionLoading}
                                        className="w-full h-9 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
                                    >
                                        {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                        Submit for Approval
                                    </button>
                                    <button
                                        onClick={doDelete}
                                        disabled={actionLoading}
                                        className="w-full h-9 rounded-[8px] border border-[#fecaca] text-[#ef4444] text-[13px] hover:bg-[#fef2f2] flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                                    >
                                        <Trash2 size={14} /> Delete Expense
                                    </button>
                                </>
                            )}

                            {/* Admin/Manager + SUBMITTED */}
                            {isPrivileged && expense.status === "SUBMITTED" && (
                                <>
                                    <button
                                        onClick={() => doAction("APPROVE")}
                                        disabled={actionLoading}
                                        className="w-full h-9 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
                                    >
                                        {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                        Approve
                                    </button>
                                    {!showRejectBox ? (
                                        <button
                                            onClick={() => setShowRejectBox(true)}
                                            className="w-full h-9 rounded-[8px] border border-[#fecaca] text-[#ef4444] text-[13px] hover:bg-[#fef2f2] flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <Ban size={14} /> Reject
                                        </button>
                                    ) : (
                                        <div className="space-y-2">
                                            <textarea
                                                value={rejectionReason}
                                                onChange={e => setRejectionReason(e.target.value)}
                                                placeholder="Reason for rejection..."
                                                className="w-full rounded-[8px] border border-[#fecaca] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#ef4444] transition-colors resize-none"
                                                rows={3}
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setShowRejectBox(false)}
                                                    className="flex-1 h-9 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => doAction("REJECT", { rejectionReason })}
                                                    disabled={!rejectionReason || actionLoading}
                                                    className="flex-1 h-9 rounded-[8px] bg-[#ef4444] text-white text-[13px] font-medium hover:opacity-90 flex items-center justify-center gap-1 transition-opacity disabled:opacity-60"
                                                >
                                                    {actionLoading && <Loader2 size={13} className="animate-spin" />}
                                                    Confirm Reject
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Admin/Manager + APPROVED */}
                            {isPrivileged && expense.status === "APPROVED" && (
                                <>
                                    {!showPayBox ? (
                                        <button
                                            onClick={() => setShowPayBox(true)}
                                            className="w-full h-9 rounded-[8px] bg-[#8b5cf6] text-white text-[13px] font-medium hover:opacity-90 flex items-center justify-center gap-2 transition-opacity"
                                        >
                                            <Banknote size={14} /> Mark as Paid
                                        </button>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-[12px] text-[var(--text2)] mb-1">Payment Mode</label>
                                                    <select
                                                        value={paymentMode}
                                                        onChange={e => setPaymentMode(e.target.value)}
                                                        className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                                                    >
                                                        {PAYMENT_MODES.map(m => (
                                                            <option key={m} value={m}>{m}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[12px] text-[var(--text2)] mb-1">Payment Date</label>
                                                    <input
                                                        type="date"
                                                        value={paymentDate}
                                                        onChange={e => setPaymentDate(e.target.value)}
                                                        className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[12px] text-[var(--text2)] mb-1">UTR / Transaction ID</label>
                                                <input
                                                    value={transactionId}
                                                    onChange={e => setTransactionId(e.target.value)}
                                                    placeholder="e.g. NEFT reference / UTR number"
                                                    className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setShowPayBox(false)}
                                                    className="flex-1 h-9 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => doAction("PAID", { paymentMode, transactionId, paymentDate })}
                                                    disabled={actionLoading}
                                                    className="flex-1 h-9 rounded-[8px] bg-[#8b5cf6] text-white text-[13px] font-medium hover:opacity-90 flex items-center justify-center gap-1 transition-opacity disabled:opacity-60"
                                                >
                                                    {actionLoading && <Loader2 size={13} className="animate-spin" />}
                                                    Confirm Paid
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

// ─── Expense Row ───────────────────────────────────────────────────────────────

function ExpenseRow({
    expense,
    onSelect,
    isPrivileged,
    currentUserId,
    onRefresh,
}: {
    expense: Expense
    onSelect: (e: Expense) => void
    isPrivileged: boolean
    currentUserId: string
    onRefresh: () => void
}) {
    const [menuOpen, setMenuOpen] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const catStyle = categoryStyle(expense.category)
    const stStyle = statusStyle(expense.status)
    const isOwner = expense.submittedBy === currentUserId

    const doDelete = async () => {
        if (!confirm("Delete this expense?")) return
        try {
            const res = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Expense deleted.")
            onRefresh()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Delete failed")
        }
    }

    return (
        <>
            {editOpen && (
                <AddExpenseModal
                    open={editOpen}
                    onClose={() => setEditOpen(false)}
                    onSaved={() => { onRefresh(); setEditOpen(false) }}
                    editExpense={expense}
                />
            )}
            <div
                className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--surface2)] transition-colors cursor-pointer group"
                onClick={() => onSelect(expense)}
            >
                {/* Expense No */}
                <div className="w-[90px] shrink-0">
                    <span className="font-mono text-[12px] font-semibold text-[var(--accent)]">{expense.expenseNo}</span>
                </div>

                {/* Title + Category */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <p className="text-[13px] font-medium text-[var(--text)] truncate">{expense.title}</p>
                        {expense.receiptUrl && (
                            <Paperclip size={11} className="text-[var(--accent)] shrink-0" />
                        )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ background: catStyle.bg, color: catStyle.color }}
                        >
                            {categoryLabel(expense.category)}
                        </span>
                        {expense.project?.name && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#eef2ff] text-[#4338ca]">
                                <Briefcase size={9} />
                                <span className="truncate max-w-[100px]">{expense.project.name}</span>
                            </span>
                        )}
                    </div>
                </div>

                {/* Date */}
                <div className="w-[85px] shrink-0 hidden md:block">
                    <p className="text-[12px] text-[var(--text2)]">{format(new Date(expense.date), "dd MMM yyyy")}</p>
                </div>

                {/* Amount */}
                <div className="w-[90px] shrink-0 text-right">
                    <p className="text-[13px] font-bold text-[var(--text)]">{formatINR(expense.amount)}</p>
                </div>

                {/* Submitted by */}
                <div className="w-[130px] shrink-0 hidden lg:flex items-center gap-1.5">
                    <UserAvatar name={expense.submittedByUser?.name || "?"} size={24} />
                    <span className="text-[12px] text-[var(--text2)] truncate">
                        {expense.submittedByUser?.name || "Unknown"}
                    </span>
                </div>

                {/* Status */}
                <div className="w-[90px] shrink-0">
                    <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ background: stStyle.bg, color: stStyle.color }}
                    >
                        {stStyle.label}
                    </span>
                </div>

                {/* Actions */}
                <div
                    className="relative shrink-0"
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        onClick={() => setMenuOpen(v => !v)}
                        className="p-1.5 rounded-[6px] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors opacity-0 group-hover:opacity-100"
                    >
                        <MoreVertical size={16} />
                    </button>
                    {menuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                            <div className="absolute right-0 top-8 z-20 w-40 bg-white border border-[var(--border)] rounded-[10px] shadow-lg py-1 overflow-hidden">
                                <button
                                    onClick={() => { onSelect(expense); setMenuOpen(false) }}
                                    className="w-full text-left px-3 py-2 text-[13px] text-[var(--text)] hover:bg-[var(--surface2)] flex items-center gap-2"
                                >
                                    <ChevronRight size={14} /> View Details
                                </button>
                                {isOwner && expense.status === "DRAFT" && (
                                    <>
                                        <button
                                            onClick={() => { setEditOpen(true); setMenuOpen(false) }}
                                            className="w-full text-left px-3 py-2 text-[13px] text-[var(--text)] hover:bg-[var(--surface2)] flex items-center gap-2"
                                        >
                                            <Edit2 size={14} /> Edit
                                        </button>
                                        <button
                                            onClick={() => { doDelete(); setMenuOpen(false) }}
                                            className="w-full text-left px-3 py-2 text-[13px] text-[#ef4444] hover:bg-[#fef2f2] flex items-center gap-2"
                                        >
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    </>
                                )}
                                {(isPrivileged || (isOwner && expense.status === "DRAFT")) && isOwner && expense.status === "DRAFT" && null}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    )
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
    label,
    value,
    sub,
    color,
    icon: Icon,
}: {
    label: string
    value: string
    sub?: string
    color: string
    icon: LucideIcon
}) {
    return (
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 flex items-start gap-3">
            <div
                className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
                style={{ background: color + "22" }}
            >
                <Icon size={20} color={color} />
            </div>
            <div>
                <p className="text-[12px] text-[var(--text3)] mb-0.5">{label}</p>
                <p className="text-[20px] font-bold text-[var(--text)] leading-tight">{value}</p>
                {sub && <p className="text-[11px] text-[var(--text3)] mt-0.5">{sub}</p>}
            </div>
        </div>
    )
}

// ─── Employee Summary Tab ──────────────────────────────────────────────────────

// Column config for the team summary table — top categories shown as columns.
// All other categories contribute to the row total but aren't shown individually.
const TEAM_COLS = [
    { key: "TRAVEL",               label: "Travel",         color: "#3b82f6", bg: "#eff6ff" },
    { key: "TRANSPORTATION",       label: "Transport",      color: "#6366f1", bg: "#eef2ff" },
    { key: "FUEL",                 label: "Fuel",           color: "#ca8a04", bg: "#fefce8" },
    { key: "FOOD",                 label: "Food",           color: "#f97316", bg: "#fff7ed" },
    { key: "ACCOMMODATION",        label: "Stay",           color: "#a855f7", bg: "#fdf4ff" },
    { key: "SALARY_WAGES",         label: "Salary",         color: "#16a34a", bg: "#f0fdf4" },
    { key: "LABOUR",               label: "Labour",         color: "#65a30d", bg: "#f7fee7" },
    { key: "CLIENT_PROJECT",       label: "Client/Proj",   color: "#1d4ed8", bg: "#eff6ff" },
    { key: "SAFETY_PPE",           label: "Safety/PPE",    color: "#dc2626", bg: "#fef2f2" },
    { key: "REPAIR_MAINTENANCE",   label: "Repair",         color: "#92400e", bg: "#fef3c7" },
    { key: "MISCELLANEOUS",        label: "Misc",           color: "#6b7280", bg: "#f9fafb" },
]

// ─── Detail modal (shared) ────────────────────────────────────────────────────
function ExpenseDetailModal({ title, subtitle, items, onClose }: {
    title: string; subtitle: string; items: any[]; onClose: () => void
}) {
    const total = items.reduce((s: number, i: any) => s + (i.amount || 0), 0)
    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 600, maxHeight: "84vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                    <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{title}</p>
                        <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>{subtitle}</p>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 4 }}><X size={17} /></button>
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                    {items.length === 0 ? (
                        <p style={{ textAlign: "center", padding: 32, color: "var(--text3)", fontSize: 13 }}>No expenses found</p>
                    ) : items.map((item: any) => {
                        const journeys: TravelEntry[] = Array.isArray(item.travelEntries) ? item.travelEntries : []
                        return (
                            <div key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                {/* Expense header row */}
                                <div style={{ display: "flex", gap: 12, padding: "11px 20px 8px" }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{item.title}</p>
                                        <p style={{ fontSize: 11, color: "var(--text3)" }}>
                                            {format(new Date(item.date), "dd MMM yyyy")}
                                            {item.description ? ` · ${item.description}` : ""}
                                        </p>
                                    </div>
                                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                                        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{formatINR(item.amount)}</p>
                                        <span style={{ background: statusStyle(item.status).bg, color: statusStyle(item.status).color, fontSize: 10, padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>
                                            {statusStyle(item.status).label}
                                        </span>
                                    </div>
                                </div>
                                {/* Journey breakdown for travel expenses */}
                                {journeys.length > 0 && (
                                    <div style={{ margin: "0 20px 10px", background: "#eff6ff", borderRadius: 8, overflow: "hidden", border: "1px solid #bfdbfe" }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 60px 80px", padding: "5px 10px", background: "#dbeafe", gap: 8 }}>
                                            {["Date", "From", "To", "KMs", "Amount"].map(h => (
                                                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "#1e40af", textTransform: "uppercase" }}>{h}</span>
                                            ))}
                                        </div>
                                        {journeys.map((j, ji) => (
                                            <div key={ji} style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 60px 80px", padding: "5px 10px", gap: 8, borderTop: ji > 0 ? "1px solid #bfdbfe" : "none" }}>
                                                <span style={{ fontSize: 12, color: "#374151" }}>{format(new Date(j.date), "dd MMM")}</span>
                                                <span style={{ fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.from}</span>
                                                <span style={{ fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.to}</span>
                                                <span style={{ fontSize: 12, color: "#374151", textAlign: "right" }}>{j.kms}</span>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8", textAlign: "right" }}>{formatINR(j.amount)}</span>
                                            </div>
                                        ))}
                                        {journeys.length > 1 && (
                                            <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 60px 80px", padding: "5px 10px", gap: 8, borderTop: "1px solid #93c5fd", background: "#dbeafe" }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: "#1e40af" }}>Total</span>
                                                <span /><span />
                                                <span style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", textAlign: "right" }}>{journeys.reduce((s, j) => s + j.kms, 0)}</span>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", textAlign: "right" }}>{formatINR(journeys.reduce((s, j) => s + j.amount, 0))}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
                <div style={{ padding: "10px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)" }}>
                    <span style={{ fontSize: 12, color: "var(--text3)" }}>{items.length} expense{items.length !== 1 ? "s" : ""}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>{formatINR(total)}</span>
                </div>
            </div>
        </div>
    )
}

// ─── Employee Summary Tab (team-wide table + per-employee drill-down) ─────────
function EmployeeSummaryTab({ isPrivileged }: { isPrivileged: boolean }) {
    const now = new Date()
    const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
    const [teamData, setTeamData] = useState<any>(null)
    const [teamLoading, setTeamLoading] = useState(true)

    // Per-employee drill-down state
    const [drillEmpId, setDrillEmpId]   = useState<string | null>(null)
    const [drillYear, setDrillYear]     = useState(now.getFullYear())
    const [drillData, setDrillData]     = useState<any>(null)
    const [drillLoading, setDrillLoading] = useState(false)

    // Detail item modal
    const [modal, setModal] = useState<{ title: string; subtitle: string; items: any[] } | null>(null)

    // Travel rate setting
    const [travelRate, setTravelRate]     = useState(0)
    const [rateInput, setRateInput]       = useState("")
    const [showRateSetting, setShowRateSetting] = useState(false)
    const [savingRate, setSavingRate]     = useState(false)

    // Load team data & travel rate
    useEffect(() => {
        setTeamLoading(true)
        fetch(`/api/expenses/team-summary?month=${month}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { setTeamData(d); setTeamLoading(false) })
            .catch(() => setTeamLoading(false))
    }, [month])

    useEffect(() => {
        fetch("/api/settings?key=TRAVEL_PER_KM_RATE")
            .then(r => r.ok ? r.json() : { value: "0" })
            .then(d => { const v = parseFloat(d.value || "0"); setTravelRate(v); setRateInput(String(v)) })
            .catch(() => {})
    }, [])

    // Per-employee drill-down
    useEffect(() => {
        if (!drillEmpId) { setDrillData(null); return }
        setDrillLoading(true)
        fetch(`/api/expenses/employee-summary?employeeId=${drillEmpId}&year=${drillYear}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { setDrillData(d); setDrillLoading(false) })
            .catch(() => setDrillLoading(false))
    }, [drillEmpId, drillYear])

    const saveRate = async () => {
        setSavingRate(true)
        try {
            await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: "TRAVEL_PER_KM_RATE", value: rateInput }),
            })
            setTravelRate(parseFloat(rateInput) || 0)
            setShowRateSetting(false)
            toast.success("Travel daily rate updated!")
        } catch { toast.error("Failed to save rate") }
        finally { setSavingRate(false) }
    }

    const monthOptions = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        return { val, label: d.toLocaleString("en-IN", { month: "short", year: "numeric" }) }
    })
    const drillYears = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]

    const drillEmployee = drillEmpId && teamData?.rows?.find((r: any) => r.id === drillEmpId)

    return (
        <div>
            {/* ── Toolbar ─────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                <select value={month} onChange={e => { setMonth(e.target.value); setDrillEmpId(null) }}
                    style={{ height: 34, borderRadius: 8, border: "1px solid var(--border)", background: "white", padding: "0 10px", fontSize: 13, color: "var(--text)", outline: "none" }}>
                    {monthOptions.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                </select>

                {isPrivileged && (
                    <>
                        <button onClick={() => setShowRateSetting(s => !s)}
                            style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border)", background: showRateSetting ? "var(--accent)" : "white", color: showRateSetting ? "white" : "var(--text2)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                            ⚙️ Travel: ₹{travelRate}/km
                        </button>
                        {showRateSetting && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "white", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 10px" }}>
                                <span style={{ fontSize: 12, color: "var(--text3)" }}>₹/km</span>
                                <input type="number" value={rateInput} onChange={e => setRateInput(e.target.value)}
                                    style={{ width: 72, height: 26, border: "1px solid var(--border)", borderRadius: 6, padding: "0 8px", fontSize: 13, outline: "none" }} />
                                <button onClick={saveRate} disabled={savingRate}
                                    style={{ height: 26, padding: "0 10px", background: "var(--accent)", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                    {savingRate ? "…" : "Save"}
                                </button>
                            </div>
                        )}
                    </>
                )}

                {drillEmpId && (
                    <button onClick={() => { setDrillEmpId(null); setDrillData(null) }}
                        style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border)", background: "#fef2f2", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                        <X size={13} /> Close drill-down
                    </button>
                )}
            </div>

            {/* ── Team Table ──────────────────────────── */}
            {!drillEmpId && (
                <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-hidden">
                    {teamLoading ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                            <Loader2 size={20} className="animate-spin" style={{ color: "var(--text3)" }} />
                        </div>
                    ) : !teamData || teamData.rows.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text3)" }}>
                            <CreditCard size={28} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
                            <p style={{ fontSize: 13 }}>No expenses submitted for {teamData?.monthLabel ?? "this month"}.</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                                <thead>
                                    <tr style={{ borderBottom: "2px solid var(--border)", background: "var(--surface2)" }}>
                                        <th style={{ textAlign: "left", padding: "9px 16px", fontWeight: 700, color: "var(--text2)", whiteSpace: "nowrap" }}>Employee</th>
                                        <th style={{ textAlign: "left", padding: "9px 10px", fontWeight: 600, color: "var(--text2)", whiteSpace: "nowrap" }}>Dept</th>
                                        {TEAM_COLS.map(c => (
                                            <th key={c.key} style={{ textAlign: "right", padding: "9px 10px", fontWeight: 600, color: c.color, whiteSpace: "nowrap" }}>{c.label}</th>
                                        ))}
                                        <th style={{ textAlign: "right", padding: "9px 16px", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {teamData.rows.map((row: any) => (
                                        <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}
                                            className="hover:bg-[var(--surface2)] transition-colors">
                                            <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                                                <button onClick={() => setDrillEmpId(row.id)}
                                                    style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                                                    <p style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>{row.name}</p>
                                                    <p style={{ fontSize: 11, color: "var(--text3)" }}>{row.employeeId} · {row.designation}</p>
                                                </button>
                                            </td>
                                            <td style={{ padding: "10px 10px", color: "var(--text2)", whiteSpace: "nowrap" }}>{row.department}</td>
                                            {TEAM_COLS.map(c => {
                                                const amt: number = row[c.key] || 0
                                                return (
                                                    <td key={c.key} style={{ textAlign: "right", padding: "10px 10px" }}>
                                                        {amt > 0 ? (
                                                            <button
                                                                onClick={() => {
                                                                    // Fetch individual expenses for this employee + category + month
                                                                    const [y, m2] = month.split("-").map(Number)
                                                                    const mStart = new Date(y, m2 - 1, 1).toISOString()
                                                                    const mEnd   = new Date(y, m2, 0, 23, 59, 59).toISOString()
                                                                    // row.userId is the linked user account ID (used by submittedBy filter)
                                                                    const uid = row.userId || row.id
                                                                    fetch(`/api/expenses?submittedBy=${uid}&category=${c.key}&dateFrom=${mStart.slice(0,10)}&dateTo=${mEnd.slice(0,10)}`)
                                                                        .then(r => r.ok ? r.json() : [])
                                                                        .then((items: any[]) => setModal({ title: `${row.name} — ${c.label}`, subtitle: teamData.monthLabel, items }))
                                                                        .catch(() => {})
                                                                }}
                                                                style={{ background: c.bg, color: c.color, border: "none", borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                                                {formatINR(amt)}
                                                            </button>
                                                        ) : (
                                                            <span style={{ color: "var(--text3)", fontSize: 12 }}>—</span>
                                                        )}
                                                    </td>
                                                )
                                            })}
                                            <td style={{ textAlign: "right", padding: "10px 16px", fontWeight: 800, color: "var(--text)", fontSize: 13, whiteSpace: "nowrap" }}>
                                                {formatINR(row.total)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface2)" }}>
                                        <td style={{ padding: "9px 16px", fontWeight: 700, color: "var(--text)" }} colSpan={2}>Grand Total</td>
                                        {TEAM_COLS.map(c => (
                                            <td key={c.key} style={{ textAlign: "right", padding: "9px 10px", fontWeight: 700, color: teamData.totals[c.key] > 0 ? c.color : "var(--text3)" }}>
                                                {teamData.totals[c.key] > 0 ? formatINR(teamData.totals[c.key]) : "—"}
                                            </td>
                                        ))}
                                        <td style={{ textAlign: "right", padding: "9px 16px", fontWeight: 800, color: "var(--text)", fontSize: 14 }}>
                                            {formatINR(teamData.totals.total)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Per-employee drill-down (monthly breakdown) ── */}
            {drillEmpId && (
                <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-hidden">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface2)", flexWrap: "wrap" }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", flex: 1 }}>
                            {drillEmployee?.name ?? "Employee"} — Monthly Breakdown
                        </p>
                        <select value={drillYear} onChange={e => setDrillYear(parseInt(e.target.value))}
                            style={{ height: 30, borderRadius: 7, border: "1px solid var(--border)", background: "white", padding: "0 8px", fontSize: 12, outline: "none" }}>
                            {drillYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    {drillLoading ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: 36 }}>
                            <Loader2 size={18} className="animate-spin" style={{ color: "var(--text3)" }} />
                        </div>
                    ) : drillData && (
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                                <thead>
                                    <tr style={{ borderBottom: "2px solid var(--border)", background: "var(--surface2)" }}>
                                        <th style={{ textAlign: "left", padding: "8px 16px", fontWeight: 700, color: "var(--text2)", whiteSpace: "nowrap" }}>Month</th>
                                        {TEAM_COLS.map(c => (
                                            <th key={c.key} style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: c.color, whiteSpace: "nowrap" }}>{c.label}</th>
                                        ))}
                                        <th style={{ textAlign: "right", padding: "8px 16px", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {drillData.rows.map((row: any) => (
                                        <tr key={row.month} style={{ borderBottom: "1px solid var(--border)", background: row.total > 0 ? "white" : "var(--surface2)" }}>
                                            <td style={{ padding: "9px 16px", fontWeight: row.total > 0 ? 600 : 400, color: row.total > 0 ? "var(--text)" : "var(--text3)", whiteSpace: "nowrap" }}>
                                                {row.label}
                                            </td>
                                            {TEAM_COLS.map(c => {
                                                const amt: number = row[c.key] || 0
                                                const items = row.items?.[c.key] || []
                                                return (
                                                    <td key={c.key} style={{ textAlign: "right", padding: "9px 10px" }}>
                                                        {amt > 0 ? (
                                                            <button onClick={() => setModal({ title: `${c.label} — ${row.label}`, subtitle: drillData.employee.name, items })}
                                                                style={{ background: c.bg, color: c.color, border: "none", borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                                                {formatINR(amt)}
                                                            </button>
                                                        ) : <span style={{ color: "var(--text3)" }}>—</span>}
                                                    </td>
                                                )
                                            })}
                                            <td style={{ textAlign: "right", padding: "9px 16px", fontWeight: 700, color: row.total > 0 ? "var(--text)" : "var(--text3)" }}>
                                                {row.total > 0 ? formatINR(row.total) : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface2)" }}>
                                        <td style={{ padding: "9px 16px", fontWeight: 700, color: "var(--text)" }}>Total</td>
                                        {TEAM_COLS.map(c => (
                                            <td key={c.key} style={{ textAlign: "right", padding: "9px 10px", fontWeight: 700, color: drillData.totals[c.key] > 0 ? c.color : "var(--text3)" }}>
                                                {drillData.totals[c.key] > 0 ? formatINR(drillData.totals[c.key]) : "—"}
                                            </td>
                                        ))}
                                        <td style={{ textAlign: "right", padding: "9px 16px", fontWeight: 800, color: "var(--text)", fontSize: 14 }}>
                                            {formatINR(drillData.totals.total)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Detail Modal ─────────────────────────── */}
            {modal && (
                <ExpenseDetailModal
                    title={modal.title}
                    subtitle={modal.subtitle}
                    items={modal.items}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ActiveTab = "mine" | "all" | "accounts" | "analytics" | "employee"
type StatusFilter = "ALL" | ExpenseStatus

export default function ExpensesPage() {
    const { data: session, status: sessionStatus } = useSession()
    const role = session?.user?.role
    const userId = session?.user?.id || ""
    const isPrivileged = can(session, "expenses.view")

    // sessionReady flips true exactly once — after the first non-loading session status.
    // This prevents fetchExpenses from firing before we know the user's role and have
    // set the correct starting tab (privileged → "employee", others → "mine").
    const [sessionReady, setSessionReady] = useState(false)

    const [expenses, setExpenses] = useState<Expense[]>([])
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState<ActiveTab>("mine")
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
    const [categoryFilter, setCategoryFilter] = useState<string>("ALL")
    const [projectFilter, setProjectFilter] = useState<string>("ALL")
    const [monthFilter, setMonthFilter] = useState<string>("")  // YYYY-MM
    const [dateFrom, setDateFrom] = useState("")
    const [dateTo, setDateTo] = useState("")
    const [search, setSearch] = useState("")
    const [addOpen, setAddOpen] = useState(false)
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
    const [projectsList, setProjectsList] = useState<ExpenseProject[]>([])
    const [pendingCount, setPendingCount] = useState(0)

    // Load projects once for the filter dropdown
    useEffect(() => {
        fetch("/api/projects")
            .then(r => r.ok ? r.json() : [])
            .then((data: any) => {
                const list = Array.isArray(data) ? data : (data.projects ?? [])
                setProjectsList(list.map((p: any) => ({ id: p.id, name: p.name, company: p.company ?? null })))
            })
            .catch(() => setProjectsList([]))
    }, [])

    // Load pending-approval count for admin badge
    const refreshPendingCount = useCallback(() => {
        if (!isPrivileged) return
        fetch("/api/expenses?status=SUBMITTED")
            .then(r => r.ok ? r.json() : [])
            .then((data: Expense[]) => setPendingCount(Array.isArray(data) ? data.length : 0))
            .catch(() => {})
    }, [isPrivileged])

    useEffect(() => { refreshPendingCount() }, [refreshPendingCount])

    // Once session is known, flip sessionReady and set the correct starting tab.
    // Must run BEFORE the fetch effect (defined below) so that when sessionReady becomes
    // true on the NEXT render, activeTab is already "employee" for privileged users.
    useEffect(() => {
        if (sessionStatus === "loading" || sessionReady) return
        setSessionReady(true)
        if (isPrivileged) setActiveTab("employee")
    }, [sessionStatus, isPrivileged, sessionReady])

    const fetchExpenses = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (activeTab === "accounts") params.set("accountsView", "true")
            if (statusFilter !== "ALL") params.set("status", statusFilter)
            if (categoryFilter !== "ALL") params.set("category", categoryFilter)
            if (projectFilter !== "ALL") params.set("projectId", projectFilter)
            if (monthFilter) params.set("month", monthFilter)
            if (!monthFilter && dateFrom) params.set("dateFrom", dateFrom)
            if (!monthFilter && dateTo) params.set("dateTo", dateTo)
            if (search) params.set("search", search)
            if (activeTab === "mine") params.set("submittedBy", userId)

            const res = await fetch(`/api/expenses?${params.toString()}`)
            if (!res.ok) throw new Error("Failed to fetch")
            const data: Expense[] = await res.json()
            setExpenses(data)

            // Update selected expense if drawer is open
            if (selectedExpense) {
                const updated = data.find(e => e.id === selectedExpense.id)
                if (updated) setSelectedExpense(updated)
                else setSelectedExpense(null)
            }
        } catch {
            toast.error("Failed to load expenses")
        } finally {
            setLoading(false)
        }
    }, [statusFilter, categoryFilter, projectFilter, monthFilter, dateFrom, dateTo, search, activeTab, userId, selectedExpense])

    useEffect(() => {
        // Wait until we know the session (avoids the "mine" flash for privileged users
        // that would otherwise trigger a spurious fetch before the tab is corrected).
        if (!sessionReady || !userId || activeTab === "employee") return
        fetchExpenses()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter, categoryFilter, projectFilter, monthFilter, dateFrom, dateTo, search, activeTab, userId, sessionReady])

    // Stats computed from all "mine" data (independent call)
    const [stats, setStats] = useState({
        myPending: 0,
        approvedThisMonth: 0,
        claimedThisMonth: 0,
        rejected: 0,
    })

    useEffect(() => {
        if (!sessionReady || !userId) return
        const fetchStats = async () => {
            try {
                const res = await fetch(`/api/expenses?submittedBy=${userId}`)
                if (!res.ok) return
                const data: Expense[] = await res.json()
                const now = new Date()
                const month = now.getMonth()
                const year = now.getFullYear()

                const isThisMonth = (d: string) => {
                    const dt = new Date(d)
                    return dt.getMonth() === month && dt.getFullYear() === year
                }

                setStats({
                    myPending: data.filter(e => e.status === "SUBMITTED").length,
                    approvedThisMonth: data
                        .filter(e => e.status === "APPROVED" || e.status === "PAID")
                        .filter(e => isThisMonth(e.date))
                        .reduce((s, e) => s + e.amount, 0),
                    claimedThisMonth: data
                        .filter(e => isThisMonth(e.date))
                        .reduce((s, e) => s + e.amount, 0),
                    rejected: data.filter(e => e.status === "REJECTED").length,
                })
            } catch {
                // silent
            }
        }
        fetchStats()
    }, [userId, expenses, sessionReady])

    const STATUS_FILTERS: StatusFilter[] = ["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"]

    function exportExpenses(fmt: "xlsx" | "csv") {
        if (expenses.length === 0) { toast.error("No expenses to export"); return }
        const rows = expenses.map(e => ({
            "Expense No": e.expenseNo,
            "Title": e.title,
            "Category": categoryLabel(e.category),
            "Amount (₹)": e.amount,
            "Date": format(new Date(e.date), "dd-MM-yyyy"),
            "Project": e.project?.name || "",
            "Client": e.project?.company?.name || "",
            "Status": e.status,
            "Submitted By": e.submittedByUser?.name || "",
            "Description": e.description || "",
            "Receipt": e.receiptUrl ? "Yes" : "No",
            "Payment Mode": e.paymentMode || "",
            "Payment Date": e.paymentDate ? format(new Date(e.paymentDate), "dd-MM-yyyy") : e.paidAt ? format(new Date(e.paidAt), "dd-MM-yyyy") : "",
            "UTR / Txn ID": e.transactionId || "",
            "Approved By": e.approvedByUser?.name || "",
            "Rejection Reason": e.rejectionReason || "",
        }))
        const ws = XLSX.utils.json_to_sheet(rows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Expenses")
        const fileName = `Expenses_${monthFilter || format(new Date(), "yyyy-MM")}.${fmt}`
        if (fmt === "csv") {
            const csv = XLSX.utils.sheet_to_csv(ws)
            const blob = new Blob([csv], { type: "text/csv" })
            const a = document.createElement("a")
            a.href = URL.createObjectURL(blob)
            a.download = fileName
            a.click()
        } else {
            XLSX.writeFile(wb, fileName)
        }
        toast.success(`Exported ${rows.length} expenses`)
    }

    return (
        <div className="min-h-screen bg-[var(--surface)] p-4 md:p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-[20px] font-bold text-[var(--text)] flex items-center gap-2">
                        <CreditCard size={22} className="text-[var(--accent)]" />
                        Expense Management
                    </h1>
                    <p className="text-[13px] text-[var(--text2)] mt-0.5">Track and manage employee expense claims</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => exportExpenses("xlsx")}
                        className="h-9 px-3 border border-[var(--border)] text-[var(--text2)] text-[12px] font-medium rounded-[8px] hover:bg-[var(--surface2)] flex items-center gap-1.5 transition-colors"
                    >
                        <Download size={13} /> Excel
                    </button>
                    <button
                        onClick={() => exportExpenses("csv")}
                        className="h-9 px-3 border border-[var(--border)] text-[var(--text2)] text-[12px] font-medium rounded-[8px] hover:bg-[var(--surface2)] flex items-center gap-1.5 transition-colors"
                    >
                        <Download size={13} /> CSV
                    </button>
                    <button
                        onClick={() => setAddOpen(true)}
                        className="h-9 px-4 bg-[var(--accent)] text-white text-[13px] font-medium rounded-[8px] hover:opacity-90 flex items-center gap-2 transition-opacity"
                    >
                        <Plus size={16} /> Add Expense
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <StatCard
                    label="My Pending"
                    value={String(stats.myPending)}
                    sub="Awaiting approval"
                    color="#f59e0b"
                    icon={Clock}
                />
                <StatCard
                    label="Approved This Month"
                    value={formatINR(stats.approvedThisMonth)}
                    sub="Approved + Paid"
                    color="#1a9e6e"
                    icon={CheckCircle2}
                />
                <StatCard
                    label="Total Claimed"
                    value={formatINR(stats.claimedThisMonth)}
                    sub="This month"
                    color="#3b82f6"
                    icon={Wallet}
                />
                <StatCard
                    label="Rejected"
                    value={String(stats.rejected)}
                    sub="All time"
                    color="#ef4444"
                    icon={XCircle}
                />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b border-[var(--border)]">
                {isPrivileged ? (
                    /* ── Admin / Manager tabs ── */
                    <>
                        {([
                            { id: "employee", label: "👥 Employee Summary" },
                            { id: "all",      label: "📋 All Expenses" },
                            { id: "accounts", label: "💰 Accounts" },
                            { id: "analytics", label: "📊 Analytics" },
                            { id: "mine",     label: "My Claims" },
                        ] as { id: ActiveTab; label: string }[]).map(({ id, label }) => (
                            <button
                                key={id}
                                onClick={() => {
                                    setActiveTab(id)
                                    if (id === "all") {
                                        setStatusFilter("SUBMITTED")
                                        setMonthFilter("")
                                    }
                                    if (id === "accounts" && !monthFilter) {
                                        setMonthFilter(format(new Date(), "yyyy-MM"))
                                        setStatusFilter("ALL")
                                    }
                                }}
                                className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                                    activeTab === id
                                        ? "border-[var(--accent)] text-[var(--accent)]"
                                        : "border-transparent text-[var(--text2)] hover:text-[var(--text)]"
                                }`}
                            >
                                {label}
                                {id === "all" && pendingCount > 0 && (
                                    <span style={{ background: "#ef4444", color: "white", borderRadius: 20, fontSize: 10, fontWeight: 700, padding: "1px 6px", lineHeight: "16px" }}>
                                        {pendingCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </>
                ) : (
                    /* ── Regular employee: single tab ── */
                    <button className="px-4 py-2 text-[13px] font-medium border-b-2 border-[var(--accent)] text-[var(--accent)] -mb-px">
                        My Expenses
                    </button>
                )}
            </div>

            {/* Analytics Tab */}
            {activeTab === "analytics" && (
                <ExpenseAnalytics expenses={expenses} loading={loading} />
            )}

            {/* By Employee Tab */}
            {activeTab === "employee" && (
                <EmployeeSummaryTab isPrivileged={isPrivileged} />
            )}

            {/* Filters — hidden on analytics and employee tabs */}
            {activeTab !== "analytics" && activeTab !== "employee" && <div className="bg-white border border-[var(--border)] rounded-[12px] p-3 mb-4 space-y-3">
                {/* Status pills */}
                <div className="flex flex-wrap gap-1.5">
                    {(activeTab === "accounts" ? ["ALL", "APPROVED", "PAID"] as StatusFilter[] : STATUS_FILTERS).map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${statusFilter === s
                                ? "bg-[var(--accent)] text-white"
                                : "bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--border)]"
                                }`}
                        >
                            {s === "ALL" ? "All" : s === "APPROVED" ? "To Pay" : s.charAt(0) + s.slice(1).toLowerCase()}
                        </button>
                    ))}
                </div>
                {/* Second row: Category + Project + Month + Date range + Search */}
                <div className="flex flex-wrap gap-2">
                    <select
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value)}
                        className="h-8 rounded-[8px] border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                    >
                        <option value="ALL">All Categories</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                    </select>
                    <select
                        value={projectFilter}
                        onChange={e => setProjectFilter(e.target.value)}
                        className="h-8 rounded-[8px] border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors max-w-[180px]"
                    >
                        <option value="ALL">All Projects</option>
                        {projectsList.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    <input
                        type="month"
                        value={monthFilter}
                        onChange={e => setMonthFilter(e.target.value)}
                        title="Filter by month"
                        className="h-8 rounded-[8px] border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                    />
                    <div className={`flex items-center gap-1 ${monthFilter ? "opacity-50 pointer-events-none" : ""}`}>
                        <Calendar size={13} className="text-[var(--text3)] shrink-0" />
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            disabled={!!monthFilter}
                            className="h-8 rounded-[8px] border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                            placeholder="From"
                        />
                        <span className="text-[var(--text3)] text-[12px]">–</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            disabled={!!monthFilter}
                            className="h-8 rounded-[8px] border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                            placeholder="To"
                        />
                    </div>
                    <div className="flex items-center gap-1.5 flex-1 min-w-[180px] h-8 rounded-[8px] border border-[var(--border)] bg-white px-2">
                        <Search size={13} className="text-[var(--text3)] shrink-0" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search title or EXP number..."
                            className="flex-1 text-[12px] text-[var(--text)] bg-transparent outline-none placeholder:text-[var(--text3)]"
                        />
                        {search && (
                            <button onClick={() => setSearch("")} className="text-[var(--text3)] hover:text-[var(--text)]">
                                <X size={13} />
                            </button>
                        )}
                    </div>
                </div>
            </div>}

            {activeTab !== "analytics" && activeTab !== "employee" && <>
            {/* Accounts Summary Banner */}
            {activeTab === "accounts" && (
                <div className="bg-gradient-to-r from-[#8b5cf6] to-[#6d28d9] rounded-[12px] p-4 mb-4 text-white">
                    <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70 mb-3">
                        Monthly Payment Sheet {monthFilter ? `— ${format(new Date(monthFilter + "-01"), "MMMM yyyy")}` : ""}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {(() => {
                            const approved = expenses.filter(e => e.status === "APPROVED")
                            const paid = expenses.filter(e => e.status === "PAID")
                            const toPayAmt = approved.reduce((s, e) => s + e.amount, 0)
                            const paidAmt = paid.reduce((s, e) => s + e.amount, 0)
                            return (
                                <>
                                    <div>
                                        <p className="text-[22px] font-bold">{formatINR(toPayAmt)}</p>
                                        <p className="text-[11px] opacity-80">Pending Payment ({approved.length})</p>
                                    </div>
                                    <div>
                                        <p className="text-[22px] font-bold">{formatINR(paidAmt)}</p>
                                        <p className="text-[11px] opacity-80">Paid ({paid.length})</p>
                                    </div>
                                    <div>
                                        <p className="text-[22px] font-bold">{formatINR(toPayAmt + paidAmt)}</p>
                                        <p className="text-[11px] opacity-80">Total ({approved.length + paid.length})</p>
                                    </div>
                                    <div>
                                        <p className="text-[22px] font-bold">{approved.length}</p>
                                        <p className="text-[11px] opacity-80">To Process</p>
                                    </div>
                                </>
                            )
                        })()}
                    </div>
                </div>
            )}

            {/* Expense List */}
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-hidden">
                {/* Column headers */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface2)]">
                    <div className="w-[90px] shrink-0 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Exp No</div>
                    <div className="flex-1 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Title</div>
                    <div className="w-[85px] shrink-0 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide hidden md:block">Date</div>
                    <div className="w-[90px] shrink-0 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide text-right">Amount</div>
                    <div className="w-[130px] shrink-0 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide hidden lg:block">Submitted by</div>
                    <div className="w-[90px] shrink-0 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Status</div>
                    <div className="w-[32px] shrink-0" />
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={24} className="animate-spin text-[var(--text3)]" />
                    </div>
                ) : expenses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-12 h-12 rounded-full bg-[var(--surface2)] flex items-center justify-center mb-3">
                            <CreditCard size={22} className="text-[var(--text3)]" />
                        </div>
                        <p className="text-[14px] font-medium text-[var(--text)]">No expenses found</p>
                        <p className="text-[13px] text-[var(--text3)] mt-1">
                            {statusFilter !== "ALL" || search ? "Try adjusting your filters" : "Click \"Add Expense\" to submit your first claim"}
                        </p>
                    </div>
                ) : (
                    expenses.map(expense => (
                        <ExpenseRow
                            key={expense.id}
                            expense={expense}
                            onSelect={setSelectedExpense}
                            isPrivileged={isPrivileged}
                            currentUserId={userId}
                            onRefresh={fetchExpenses}
                        />
                    ))
                )}
            </div>

            {/* Count */}
            {!loading && expenses.length > 0 && (
                <p className="text-[12px] text-[var(--text3)] mt-2 text-right">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</p>
            )}
            </>}

            {/* Modals / Drawers */}
            <AddExpenseModal
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onSaved={() => { fetchExpenses(); refreshPendingCount() }}
            />
            <ExpenseDrawer
                expense={selectedExpense}
                onClose={() => setSelectedExpense(null)}
                onRefresh={() => { fetchExpenses(); refreshPendingCount() }}
                isPrivileged={isPrivileged}
                currentUserId={userId}
            />
        </div>
    )
}

// ─── Analytics Panel ──────────────────────────────────────────────────────────

const CHART_COLORS = ["#6366f1", "#06b6d4", "#f59e0b", "#ef4444", "#22c55e", "#a855f7", "#f97316", "#0891b2", "#8b5cf6", "#ec4899"]

function ExpenseAnalytics({ expenses, loading }: { expenses: Expense[]; loading: boolean }) {
    if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--text3)]" /></div>

    const now = new Date()
    const monthlyMap = new Map<string, { approved: number; paid: number; total: number }>()
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        monthlyMap.set(format(d, "yyyy-MM"), { approved: 0, paid: 0, total: 0 })
    }
    expenses.forEach(e => {
        const key = format(new Date(e.date), "yyyy-MM")
        const entry = monthlyMap.get(key)
        if (entry) {
            entry.total += e.amount
            if (e.status === "APPROVED") entry.approved += e.amount
            if (e.status === "PAID") entry.paid += e.amount
        }
    })
    const monthlyData = Array.from(monthlyMap.entries()).map(([m, v]) => ({
        month: format(new Date(m + "-01"), "MMM yy"),
        Approved: Math.round(v.approved), Paid: Math.round(v.paid), Total: Math.round(v.total),
    }))

    const catMap = new Map<string, number>()
    expenses.forEach(e => { const lbl = categoryLabel(e.category); catMap.set(lbl, (catMap.get(lbl) || 0) + e.amount) })
    const catData = Array.from(catMap.entries()).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value)

    const empMap = new Map<string, number>()
    expenses.forEach(e => { const name = e.submittedByUser?.name || "Unknown"; empMap.set(name, (empMap.get(name) || 0) + e.amount) })
    const empData = Array.from(empMap.entries()).map(([name, amount]) => ({ name, amount: Math.round(amount) })).sort((a, b) => b.amount - a.amount).slice(0, 10)

    const card = "bg-white border border-[var(--border)] rounded-[12px] p-4"
    return (
        <div className="space-y-4">
            <div className={card}>
                <h3 className="text-[14px] font-semibold text-[var(--text)] mb-4">Monthly Expense Trend (Last 6 Months)</h3>
                <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={monthlyData}>
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString("en-IN")}`, ""]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Total" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Approved" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Paid" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={card}>
                    <h3 className="text-[14px] font-semibold text-[var(--text)] mb-4">Category-wise Breakdown</h3>
                    {catData.length === 0 ? <p className="text-[13px] text-[var(--text3)] text-center py-8">No data</p> : (
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                                    {catData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                </Pie>
                                <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString("en-IN")}`, ""]} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
                <div className={card}>
                    <h3 className="text-[14px] font-semibold text-[var(--text)] mb-4">Top Employees by Expense</h3>
                    {empData.length === 0 ? <p className="text-[13px] text-[var(--text3)] text-center py-8">No data</p> : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={empData} layout="vertical">
                                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={90} />
                                <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString("en-IN")}`, "Amount"]} />
                                <Bar dataKey="amount" fill="#6366f1" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
        </div>
    )
}
