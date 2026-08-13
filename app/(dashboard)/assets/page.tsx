"use client"
import { useState, useEffect, useCallback } from "react"
import { fetchAllEmployees } from "@/lib/fetch-all-employees"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, Search, Loader2, X, Package, Shirt, CreditCard,
    Wrench, Shield, Box, Edit2, Trash2, RotateCcw, Users,
    ChevronRight, AlertTriangle, CheckCircle, Smartphone,
    Car, Sofa, Tag, MapPin, Calendar, IndianRupee, Hash,
    BarChart3, ArrowLeft
} from "lucide-react"
import { format } from "date-fns"
import { can } from "@/lib/can"

// ─── Types ────────────────────────────────────────────────────────────────────

type AssetCondition = "NEW" | "GOOD" | "FAIR" | "DAMAGED" | "LOST"

type Asset = {
    id: string
    assetCode: string
    name: string
    category: string
    description?: string | null
    serialNo?: string | null
    quantity: number
    available: number
    condition: AssetCondition
    purchaseDate?: string | null
    purchaseCost?: number | null
    vendor?: string | null
    location?: string | null
    isActive: boolean
    createdAt: string
    updatedAt: string
    _count: { assignments: number }
}

type Employee = {
    id: string
    firstName: string
    lastName: string
    employeeId: string
    designation?: string | null
    photo?: string | null
}

type Assignment = {
    id: string
    employeeId: string
    assetId: string
    issuedAt: string
    returnedAt?: string | null
    condition: AssetCondition
    returnCondition?: AssetCondition | null
    notes?: string | null
    isActive: boolean
    employee: {
        id: string
        firstName: string
        lastName: string
        employeeId: string
        designation?: string | null
        photo?: string | null
    }
    asset: {
        id: string
        assetCode: string
        name: string
        category: string
        serialNo?: string | null
    }
}

type AssetWithAssignments = Asset & {
    assignments: (Omit<Assignment, "asset"> & {
        employee: {
            id: string
            firstName: string
            lastName: string
            employeeId: string
            designation?: string | null
            photo?: string | null
        }
    })[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = ["All", "Uniform", "ID Card", "Tool", "Safety Equipment", "Electronics", "Vehicle", "Furniture", "Other"]

const CONDITION_CONFIG: Record<AssetCondition, { label: string; color: string; bg: string }> = {
    NEW: { label: "New", color: "#1a9e6e", bg: "#e8f7f1" },
    GOOD: { label: "Good", color: "#0891b2", bg: "#e0f2fe" },
    FAIR: { label: "Fair", color: "#d97706", bg: "#fffbeb" },
    DAMAGED: { label: "Damaged", color: "#dc2626", bg: "#fef2f2" },
    LOST: { label: "Lost", color: "#6b7280", bg: "#f3f4f6" },
}

const CATEGORY_COLOR: Record<string, { bg: string; color: string }> = {
    "Uniform": { bg: "#eff6ff", color: "#3b82f6" },
    "ID Card": { bg: "#fdf4ff", color: "#a855f7" },
    "Tool": { bg: "#fff7ed", color: "#f97316" },
    "Safety Equipment": { bg: "#fef2f2", color: "#ef4444" },
    "Electronics": { bg: "#ecfdf5", color: "#10b981" },
    "Vehicle": { bg: "#f0f9ff", color: "#0ea5e9" },
    "Furniture": { bg: "#fefce8", color: "#ca8a04" },
    "Other": { bg: "#f9fafb", color: "#6b7280" },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRupee(n?: number | null) {
    if (n === undefined || n === null) return "—"
    return `₹${n.toLocaleString("en-IN")}`
}

function getCategoryIcon(category: string, size = 16) {
    switch (category) {
        case "Uniform": return <Shirt size={size} />
        case "ID Card": return <CreditCard size={size} />
        case "Tool": return <Wrench size={size} />
        case "Safety Equipment": return <Shield size={size} />
        case "Electronics": return <Smartphone size={size} />
        case "Vehicle": return <Car size={size} />
        case "Furniture": return <Sofa size={size} />
        default: return <Box size={size} />
    }
}

function Avatar({ firstName, lastName, photo, size = 36 }: {
    firstName: string; lastName: string; photo?: string | null; size?: number
}) {
    const [imgErr, setImgErr] = useState(false)
    const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase()
    const colors = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#0891b2", "#f97316"]
    const bg = colors[(firstName.charCodeAt(0) + lastName.charCodeAt(0)) % colors.length]
    if (photo && !imgErr) return <img src={photo} alt="" style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" onError={() => setImgErr(true)} />
    return (
        <div style={{ width: size, height: size, background: bg, fontSize: size * 0.33 }}
            className="rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none">
            {initials}
        </div>
    )
}

function ConditionBadge({ condition }: { condition: AssetCondition }) {
    const cfg = CONDITION_CONFIG[condition] || CONDITION_CONFIG.GOOD
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: cfg.bg, color: cfg.color }}>
            {cfg.label}
        </span>
    )
}

function CategoryBadge({ category }: { category: string }) {
    const cfg = CATEGORY_COLOR[category] || CATEGORY_COLOR["Other"]
    return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
            style={{ background: cfg.bg, color: cfg.color }}>
            {getCategoryIcon(category, 11)}
            {category}
        </span>
    )
}

// ─── Modal Backdrop ───────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <div className="bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--border)] w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {children}
            </div>
        </div>
    )
}

function inputCls(extra = "") {
    return `w-full px-3 py-2 text-[13px] border border-[var(--border)] rounded-xl bg-[var(--surface2)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text3)] ${extra}`
}

function selectCls() {
    return `w-full px-3 py-2 text-[13px] border border-[var(--border)] rounded-xl bg-[var(--surface2)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors`
}

// ─── Add/Edit Asset Modal ─────────────────────────────────────────────────────

type AssetForm = {
    name: string; category: string; description: string; serialNo: string
    quantity: string; condition: AssetCondition; purchaseDate: string
    purchaseCost: string; vendor: string; location: string
}

const defaultAssetForm: AssetForm = {
    name: "", category: "Uniform", description: "", serialNo: "",
    quantity: "1", condition: "NEW", purchaseDate: "",
    purchaseCost: "", vendor: "", location: ""
}

function AssetModal({ asset, onClose, onSave }: {
    asset?: Asset | null
    onClose: () => void
    onSave: () => void
}) {
    const [form, setForm] = useState<AssetForm>(
        asset ? {
            name: asset.name,
            category: asset.category,
            description: asset.description || "",
            serialNo: asset.serialNo || "",
            quantity: String(asset.quantity),
            condition: asset.condition,
            purchaseDate: asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : "",
            purchaseCost: asset.purchaseCost != null ? String(asset.purchaseCost) : "",
            vendor: asset.vendor || "",
            location: asset.location || "",
        } : defaultAssetForm
    )
    const [saving, setSaving] = useState(false)

    const set = (k: keyof AssetForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [k]: e.target.value }))

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!form.name.trim() || !form.category) { toast.error("Name and category are required"); return }
        setSaving(true)
        try {
            const url = asset ? `/api/assets/${asset.id}` : "/api/assets"
            const method = asset ? "PUT" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, quantity: parseInt(form.quantity) || 1, purchaseCost: form.purchaseCost ? parseFloat(form.purchaseCost) : null })
            })
            if (!res.ok) { toast.error(await res.text()); return }
            toast.success(asset ? "Asset updated" : "Asset created")
            onSave()
        } finally { setSaving(false) }
    }

    return (
        <Modal onClose={onClose}>
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-[var(--text)]">
                    {asset ? "Edit Asset" : "Add New Asset"}
                </h2>
                <button onClick={onClose} className="p-1.5 hover:bg-[var(--surface2)] rounded-lg transition-colors text-[var(--text3)]"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Asset Name *</label>
                        <input value={form.name} onChange={set("name")} required placeholder="e.g. Safety Helmet" className={inputCls()} />
                    </div>
                    <div>
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Category *</label>
                        <select value={form.category} onChange={set("category")} className={selectCls()}>
                            {CATEGORIES.filter(c => c !== "All").map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Condition</label>
                        <select value={form.condition} onChange={set("condition")} className={selectCls()}>
                            {(["NEW", "GOOD", "FAIR", "DAMAGED", "LOST"] as AssetCondition[]).map(c => (
                                <option key={c} value={c}>{CONDITION_CONFIG[c].label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-span-2">
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Description</label>
                        <textarea value={form.description} onChange={set("description")} rows={2} placeholder="Optional description..." className={inputCls()} />
                    </div>
                    <div>
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Serial / Model No.</label>
                        <input value={form.serialNo} onChange={set("serialNo")} placeholder="SN-001" className={inputCls()} />
                    </div>
                    <div>
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Quantity</label>
                        <input type="number" min={1} value={form.quantity} onChange={set("quantity")} className={inputCls()} />
                    </div>
                    <div>
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Purchase Date</label>
                        <input type="date" value={form.purchaseDate} onChange={set("purchaseDate")} className={inputCls()} />
                    </div>
                    <div>
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Purchase Cost (₹)</label>
                        <input type="number" min={0} step="0.01" value={form.purchaseCost} onChange={set("purchaseCost")} placeholder="0.00" className={inputCls()} />
                    </div>
                    <div>
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Vendor</label>
                        <input value={form.vendor} onChange={set("vendor")} placeholder="Vendor name" className={inputCls()} />
                    </div>
                    <div>
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Storage Location</label>
                        <input value={form.location} onChange={set("location")} placeholder="Warehouse A" className={inputCls()} />
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] border border-[var(--border)] rounded-xl hover:bg-[var(--surface2)] text-[var(--text2)] transition-colors">
                        Cancel
                    </button>
                    <button type="submit" disabled={saving} className="px-4 py-2 text-[13px] bg-[var(--accent)] text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
                        {saving && <Loader2 size={14} className="animate-spin" />}
                        {asset ? "Save Changes" : "Create Asset"}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

// ─── Issue Asset Modal ────────────────────────────────────────────────────────

function IssueModal({ asset, employees, onClose, onSave }: {
    asset: Asset
    employees: Employee[]
    onClose: () => void
    onSave: () => void
}) {
    const [employeeId, setEmployeeId] = useState("")
    const [condition, setCondition] = useState<AssetCondition>("GOOD")
    const [notes, setNotes] = useState("")
    const [issuedAt, setIssuedAt] = useState(format(new Date(), "yyyy-MM-dd"))
    const [saving, setSaving] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!employeeId) { toast.error("Please select an employee"); return }
        setSaving(true)
        try {
            const res = await fetch(`/api/assets/${asset.id}/assign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId, condition, notes, issuedAt })
            })
            if (!res.ok) { toast.error(await res.text()); return }
            toast.success(`${asset.name} issued successfully`)
            onSave()
        } finally { setSaving(false) }
    }

    return (
        <Modal onClose={onClose}>
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
                <div>
                    <h2 className="text-[16px] font-semibold text-[var(--text)]">Issue Asset to Employee</h2>
                    <p className="text-[12px] text-[var(--text3)] mt-0.5">{asset.assetCode} — {asset.name}</p>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-[var(--surface2)] rounded-lg transition-colors text-[var(--text3)]"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div>
                    <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Employee *</label>
                    <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className={selectCls()} required>
                        <option value="">Select employee...</option>
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>
                                {emp.firstName} {emp.lastName} — {emp.employeeId}{emp.designation ? ` (${emp.designation})` : ""}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Condition at Issue</label>
                        <select value={condition} onChange={e => setCondition(e.target.value as AssetCondition)} className={selectCls()}>
                            {(["NEW", "GOOD", "FAIR"] as AssetCondition[]).map(c => (
                                <option key={c} value={c}>{CONDITION_CONFIG[c].label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Issue Date</label>
                        <input type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)} className={inputCls()} />
                    </div>
                </div>
                <div>
                    <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Notes</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." className={inputCls()} />
                </div>
                <div className="flex items-center justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] border border-[var(--border)] rounded-xl hover:bg-[var(--surface2)] text-[var(--text2)] transition-colors">Cancel</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 text-[13px] bg-[var(--accent)] text-white rounded-xl hover:opacity-90 disabled:opacity-60 flex items-center gap-2">
                        {saving && <Loader2 size={14} className="animate-spin" />}
                        Issue Asset
                    </button>
                </div>
            </form>
        </Modal>
    )
}

// ─── Return Asset Modal ───────────────────────────────────────────────────────

function ReturnModal({ assignment, onClose, onSave }: {
    assignment: Assignment
    onClose: () => void
    onSave: () => void
}) {
    const [returnCondition, setReturnCondition] = useState<AssetCondition>("GOOD")
    const [notes, setNotes] = useState(assignment.notes || "")
    const [returnedAt, setReturnedAt] = useState(format(new Date(), "yyyy-MM-dd"))
    const [saving, setSaving] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        try {
            const res = await fetch(`/api/assets/${assignment.assetId}/return`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeAssetId: assignment.id, returnCondition, notes, returnedAt })
            })
            if (!res.ok) { toast.error(await res.text()); return }
            toast.success("Asset returned successfully")
            onSave()
        } finally { setSaving(false) }
    }

    return (
        <Modal onClose={onClose}>
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
                <div>
                    <h2 className="text-[16px] font-semibold text-[var(--text)]">Return Asset</h2>
                    <p className="text-[12px] text-[var(--text3)] mt-0.5">
                        {assignment.asset.name} — {assignment.employee.firstName} {assignment.employee.lastName}
                    </p>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-[var(--surface2)] rounded-lg transition-colors text-[var(--text3)]"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Return Condition</label>
                        <select value={returnCondition} onChange={e => setReturnCondition(e.target.value as AssetCondition)} className={selectCls()}>
                            {(["NEW", "GOOD", "FAIR", "DAMAGED", "LOST"] as AssetCondition[]).map(c => (
                                <option key={c} value={c}>{CONDITION_CONFIG[c].label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Return Date</label>
                        <input type="date" value={returnedAt} onChange={e => setReturnedAt(e.target.value)} className={inputCls()} />
                    </div>
                </div>
                <div>
                    <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">Notes</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." className={inputCls()} />
                </div>
                <div className="flex items-center justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] border border-[var(--border)] rounded-xl hover:bg-[var(--surface2)] text-[var(--text2)] transition-colors">Cancel</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 text-[13px] bg-[var(--accent)] text-white rounded-xl hover:opacity-90 disabled:opacity-60 flex items-center gap-2">
                        {saving && <Loader2 size={14} className="animate-spin" />}
                        Confirm Return
                    </button>
                </div>
            </form>
        </Modal>
    )
}

// ─── Asset Detail Drawer ──────────────────────────────────────────────────────

function AssetDrawer({ assetId, employees, onClose, onRefresh }: {
    assetId: string
    employees: Employee[]
    onClose: () => void
    onRefresh: () => void
}) {
    const [asset, setAsset] = useState<AssetWithAssignments | null>(null)
    const [loading, setLoading] = useState(true)
    const [returnTarget, setReturnTarget] = useState<Assignment | null>(null)

    const fetchAsset = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/assets/${assetId}`)
            if (res.ok) setAsset(await res.json())
        } finally { setLoading(false) }
    }, [assetId])

    useEffect(() => { fetchAsset() }, [fetchAsset])

    const activeAssignments = asset?.assignments.filter(a => a.isActive) ?? []
    const pastAssignments = asset?.assignments.filter(a => !a.isActive) ?? []

    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
            <div className="fixed right-0 top-0 h-full w-full max-w-[440px] z-50 bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 p-5 border-b border-[var(--border)] shrink-0">
                    <button onClick={onClose} className="p-1.5 hover:bg-[var(--surface2)] rounded-lg transition-colors text-[var(--text3)]">
                        <ArrowLeft size={18} />
                    </button>
                    {asset ? (
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-[var(--accent)] font-semibold">{asset.assetCode}</span>
                                <CategoryBadge category={asset.category} />
                                <ConditionBadge condition={asset.condition} />
                            </div>
                            <h2 className="text-[15px] font-semibold text-[var(--text)] mt-0.5 truncate">{asset.name}</h2>
                        </div>
                    ) : <div className="flex-1" />}
                </div>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
                    </div>
                ) : asset ? (
                    <div className="flex-1 overflow-y-auto p-5 space-y-5">
                        {/* Info Grid */}
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { label: "Serial No.", value: asset.serialNo || "—", icon: <Hash size={13} /> },
                                { label: "Quantity", value: String(asset.quantity), icon: <Package size={13} /> },
                                { label: "Available", value: String(asset.available), icon: <CheckCircle size={13} /> },
                                { label: "Location", value: asset.location || "—", icon: <MapPin size={13} /> },
                                { label: "Purchase Date", value: asset.purchaseDate ? format(new Date(asset.purchaseDate), "dd MMM yyyy") : "—", icon: <Calendar size={13} /> },
                                { label: "Cost", value: fmtRupee(asset.purchaseCost), icon: <IndianRupee size={13} /> },
                                { label: "Vendor", value: asset.vendor || "—", icon: <Tag size={13} /> },
                            ].map(item => (
                                <div key={item.label} className="bg-[var(--surface2)] rounded-xl p-3 border border-[var(--border)]">
                                    <div className="flex items-center gap-1.5 text-[var(--text3)] mb-1">
                                        {item.icon}
                                        <span className="text-[10px] font-medium uppercase tracking-[0.4px]">{item.label}</span>
                                    </div>
                                    <p className="text-[13px] font-medium text-[var(--text)]">{item.value}</p>
                                </div>
                            ))}
                            {asset.description && (
                                <div className="col-span-2 bg-[var(--surface2)] rounded-xl p-3 border border-[var(--border)]">
                                    <p className="text-[10px] font-medium uppercase tracking-[0.4px] text-[var(--text3)] mb-1">Description</p>
                                    <p className="text-[13px] text-[var(--text)]">{asset.description}</p>
                                </div>
                            )}
                        </div>

                        {/* Stock Progress Bar */}
                        <div className="bg-[var(--surface2)] rounded-xl p-4 border border-[var(--border)]">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5 text-[var(--text2)]">
                                    <BarChart3 size={14} />
                                    <span className="text-[12px] font-medium">Stock Availability</span>
                                </div>
                                <span className="text-[12px] font-semibold text-[var(--text)]">
                                    {asset.available} / {asset.quantity}
                                </span>
                            </div>
                            <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all"
                                    style={{
                                        width: `${asset.quantity > 0 ? (asset.available / asset.quantity) * 100 : 0}%`,
                                        background: asset.available === 0 ? "var(--red)" : asset.available < asset.quantity * 0.2 ? "var(--amber)" : "var(--accent)"
                                    }} />
                            </div>
                            <p className="text-[11px] text-[var(--text3)] mt-1.5">
                                {asset.quantity - asset.available} issued out of {asset.quantity} total
                            </p>
                        </div>

                        {/* Active Assignments */}
                        {activeAssignments.length > 0 && (
                            <div>
                                <h3 className="text-[12px] font-semibold text-[var(--text2)] uppercase tracking-[0.5px] mb-3 flex items-center gap-1.5">
                                    <Users size={13} />
                                    Active Assignments ({activeAssignments.length})
                                </h3>
                                <div className="space-y-2">
                                    {activeAssignments.map(a => (
                                        <div key={a.id} className="flex items-center gap-3 p-3 bg-[var(--surface2)] rounded-xl border border-[var(--border)]">
                                            <Avatar firstName={a.employee.firstName} lastName={a.employee.lastName} photo={a.employee.photo} size={34} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-medium text-[var(--text)] truncate">{a.employee.firstName} {a.employee.lastName}</p>
                                                <p className="text-[11px] text-[var(--text3)]">{a.employee.employeeId} · {format(new Date(a.issuedAt), "dd MMM yyyy")}</p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <ConditionBadge condition={a.condition} />
                                                <button
                                                    onClick={() => setReturnTarget({ ...a, asset: { id: asset.id, assetCode: asset.assetCode, name: asset.name, category: asset.category, serialNo: asset.serialNo ?? null } })}
                                                    className="px-2.5 py-1 text-[11px] bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors font-medium">
                                                    Return
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Past Assignments */}
                        {pastAssignments.length > 0 && (
                            <div>
                                <h3 className="text-[12px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] mb-3 flex items-center gap-1.5">
                                    <RotateCcw size={13} />
                                    Return History ({pastAssignments.length})
                                </h3>
                                <div className="space-y-2">
                                    {pastAssignments.map(a => (
                                        <div key={a.id} className="flex items-center gap-3 p-3 bg-[var(--surface2)]/50 rounded-xl border border-[var(--border)] opacity-60">
                                            <Avatar firstName={a.employee.firstName} lastName={a.employee.lastName} photo={a.employee.photo} size={30} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[12px] font-medium text-[var(--text)] truncate">{a.employee.firstName} {a.employee.lastName}</p>
                                                <p className="text-[10.5px] text-[var(--text3)]">
                                                    {format(new Date(a.issuedAt), "dd MMM yy")} → {a.returnedAt ? format(new Date(a.returnedAt), "dd MMM yy") : "—"}
                                                </p>
                                            </div>
                                            {a.returnCondition && <ConditionBadge condition={a.returnCondition} />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeAssignments.length === 0 && pastAssignments.length === 0 && (
                            <div className="flex flex-col items-center py-8 text-[var(--text3)]">
                                <Package size={32} className="mb-2 opacity-40" />
                                <p className="text-[13px]">No assignments yet</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-[var(--text3)]">
                        <p className="text-[13px]">Asset not found</p>
                    </div>
                )}
            </div>

            {returnTarget && (
                <ReturnModal
                    assignment={returnTarget}
                    onClose={() => setReturnTarget(null)}
                    onSave={() => { setReturnTarget(null); fetchAsset(); onRefresh() }}
                />
            )}
        </>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AssetsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    // Assets tab state
    const [assets, setAssets] = useState<Asset[]>([])
    const [loadingAssets, setLoadingAssets] = useState(true)
    const [categoryFilter, setCategoryFilter] = useState("All")
    const [search, setSearch] = useState("")
    const [showInactive, setShowInactive] = useState(false)

    // Assignments tab state
    const [assignments, setAssignments] = useState<Assignment[]>([])
    const [loadingAssignments, setLoadingAssignments] = useState(true)
    const [assignSearch, setAssignSearch] = useState("")
    const [activeOnly, setActiveOnly] = useState(true)

    // Employees for modals
    const [employees, setEmployees] = useState<Employee[]>([])

    // Modals & drawer
    const [addModal, setAddModal] = useState(false)
    const [editAsset, setEditAsset] = useState<Asset | null>(null)
    const [issueAsset, setIssueAsset] = useState<Asset | null>(null)
    const [returnAssignment, setReturnAssignment] = useState<Assignment | null>(null)
    const [drawerAssetId, setDrawerAssetId] = useState<string | null>(null)
    const [tab, setTab] = useState<"assets" | "issued">("assets")

    // Auth guard
    useEffect(() => {
        if (status !== "unauthenticated") return
        router.push("/login")
    }, [status, router])

    useEffect(() => {
        if (status === "authenticated" && !can(session, "assets.view")) router.push("/")
    }, [status, session, router])

    // Fetch employees (for modals)
    const fetchEmployees = useCallback(async () => {
        try {
            const { employees } = await fetchAllEmployees({ status: "ACTIVE" })
            setEmployees(employees as any)
        } catch { /* ignore */ }
    }, [])

    useEffect(() => { fetchEmployees() }, [fetchEmployees])

    // Fetch assets
    const fetchAssets = useCallback(async () => {
        setLoadingAssets(true)
        try {
            const params = new URLSearchParams()
            if (categoryFilter !== "All") params.set("category", categoryFilter)
            if (search) params.set("search", search)
            if (!showInactive) params.set("isActive", "true")
            const res = await fetch(`/api/assets?${params}`)
            if (res.ok) setAssets(await res.json())
        } finally { setLoadingAssets(false) }
    }, [categoryFilter, search, showInactive])

    useEffect(() => { if (status !== "unauthenticated") fetchAssets() }, [fetchAssets, status])

    // Fetch assignments
    const fetchAssignments = useCallback(async () => {
        setLoadingAssignments(true)
        try {
            const params = new URLSearchParams()
            if (activeOnly) params.set("isActive", "true")
            if (assignSearch) params.set("search", assignSearch)
            const res = await fetch(`/api/assets/assignments?${params}`)
            if (res.ok) setAssignments(await res.json())
        } finally { setLoadingAssignments(false) }
    }, [activeOnly, assignSearch])

    useEffect(() => { if (status !== "unauthenticated") fetchAssignments() }, [fetchAssignments, status])

    // Stats
    const totalAssets = assets.length
    const totalItems = assets.reduce((s, a) => s + a.quantity, 0)
    const currentlyIssued = assets.reduce((s, a) => s + a._count.assignments, 0)
    const damagedLost = assets.filter(a => a.condition === "DAMAGED" || a.condition === "LOST").length

    async function handleDelete(asset: Asset) {
        if (!confirm(`Delete "${asset.name}"? This cannot be undone.`)) return
        const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" })
        if (!res.ok) { toast.error(await res.text()); return }
        toast.success("Asset deleted")
        fetchAssets()
    }


    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-2 shrink-0 flex-wrap gap-3">
                <div>
                    <h1 className="text-[26px] font-bold text-[var(--text)] tracking-[-0.5px]">Assets</h1>
                    <p className="text-[13.5px] text-[var(--text3)] mt-1">Manage and track physical assets issued to employees.</p>
                </div>
                <button
                    onClick={() => setAddModal(true)}
                    className="flex items-center gap-2 h-[42px] px-5 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-semibold hover:opacity-90 transition-opacity"
                    style={{ boxShadow: "0 1px 3px rgba(26,158,110,0.35)" }}>
                    <Plus size={16} /> Add Asset
                </button>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 px-6 py-4 shrink-0">
                {[
                    { label: "Total Assets", value: totalAssets, sub: `${totalItems} items`, icon: Package, color: "#3b82f6", bg: "#eff6ff" },
                    { label: "Total Items", value: totalItems, sub: "across all assets", icon: BarChart3, color: "#1a9e6e", bg: "#e8f7f1" },
                    { label: "Currently Issued", value: currentlyIssued, sub: "in use", icon: Users, color: "#d97706", bg: "#fef3c7" },
                    { label: "Damaged / Lost", value: damagedLost, sub: "need attention", icon: AlertTriangle, color: "#dc2626", bg: "#fef2f2" },
                ].map(stat => (
                    <div key={stat.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px] flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0" style={{ background: stat.bg }}>
                            <stat.icon size={20} style={{ color: stat.color }} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[12px] text-[var(--text3)]">{stat.label}</p>
                            <p className="text-[24px] font-bold leading-tight tabular-nums" style={{ color: stat.color }}>{stat.value}</p>
                            <p className="text-[11px] text-[var(--text3)]">{stat.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 px-6 pb-3 shrink-0">
                {(["assets", "issued"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-all ${tab === t ? "bg-[var(--accent)] text-white" : "text-[var(--text2)] hover:bg-[var(--surface2)]"}`}>
                        {t === "assets" ? "Assets" : "Issued Items"}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
                {tab === "assets" && (
                    <>
                        {/* Filters */}
                        <div className="flex items-center gap-3 mb-4 flex-wrap">
                            {/* Category Pills */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {CATEGORIES.map(cat => (
                                    <button key={cat} onClick={() => setCategoryFilter(cat)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border ${categoryFilter === cat
                                            ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                            : "bg-[var(--surface)] text-[var(--text2)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}>
                                        {cat !== "All" && getCategoryIcon(cat, 12)}
                                        {cat}
                                    </button>
                                ))}
                            </div>

                            {/* Search */}
                            <div className="relative ml-auto">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search by name or code..."
                                    className="pl-8 pr-4 py-2 text-[12.5px] border border-[var(--border)] rounded-xl bg-[var(--surface2)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] w-60"
                                />
                                {search && (
                                    <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)]">
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            {/* Active/All Toggle */}
                            <button onClick={() => setShowInactive(v => !v)}
                                className={`px-3 py-1.5 rounded-xl text-[12px] font-medium border transition-all ${showInactive ? "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)]" : "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/30"}`}>
                                {showInactive ? "All" : "Active Only"}
                            </button>
                        </div>

                        {/* Assets Table */}
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
                            {loadingAssets ? (
                                <div className="flex items-center justify-center py-16">
                                    <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                                </div>
                            ) : assets.length === 0 ? (
                                <div className="flex flex-col items-center py-16 text-[var(--text3)]">
                                    <Package size={40} className="mb-3 opacity-30" />
                                    <p className="text-[14px] font-medium">No assets found</p>
                                    <p className="text-[12px] mt-1">Add your first asset to get started</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                <table className="w-full min-w-[900px] text-[13px]">
                                    <thead>
                                        <tr className="border-b border-[var(--border)] bg-[var(--surface2)]">
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">Asset</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">Category</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">Condition</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">Stock</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">Cost</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">Location</th>
                                            <th className="text-right px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        {assets.map(asset => (
                                            <tr key={asset.id} className="hover:bg-[var(--surface2)]/50 transition-colors group">
                                                <td className="px-4 py-3">
                                                    <button onClick={() => setDrawerAssetId(asset.id)} className="text-left hover:text-[var(--accent)] transition-colors">
                                                        <span className="font-mono text-[11px] text-[var(--accent)] font-semibold block">{asset.assetCode}</span>
                                                        <span className="font-medium text-[var(--text)]">{asset.name}</span>
                                                        {asset.description && (
                                                            <span className="block text-[11.5px] text-[var(--text3)] truncate max-w-[200px]">{asset.description}</span>
                                                        )}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <CategoryBadge category={asset.category} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <ConditionBadge condition={asset.condition} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`font-semibold text-[13px] ${asset.available === 0 ? "text-red-500" : "text-[var(--text)]"}`}>
                                                        {asset.available}
                                                    </span>
                                                    <span className="text-[var(--text3)]"> / {asset.quantity}</span>
                                                </td>
                                                <td className="px-4 py-3 text-[var(--text2)]">
                                                    {fmtRupee(asset.purchaseCost)}
                                                </td>
                                                <td className="px-4 py-3 text-[var(--text2)] text-[12px]">
                                                    {asset.location || "—"}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => setIssueAsset(asset)}
                                                            disabled={asset.available === 0}
                                                            title="Issue to Employee"
                                                            className="px-2.5 py-1.5 text-[11px] font-medium bg-[var(--accent)]/10 text-[var(--accent)] rounded-lg hover:bg-[var(--accent)]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
                                                            <Users size={12} />
                                                            Issue
                                                        </button>
                                                        <button onClick={() => setEditAsset(asset)} title="Edit"
                                                            className="p-2 md:p-1.5 hover:bg-[var(--surface2)] rounded-lg text-[var(--text3)] hover:text-[var(--text)] transition-colors">
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button onClick={() => handleDelete(asset)} title="Delete"
                                                            className="p-2 md:p-1.5 hover:bg-red-50 rounded-lg text-[var(--text3)] hover:text-red-500 transition-colors">
                                                            <Trash2 size={14} />
                                                        </button>
                                                        <button onClick={() => setDrawerAssetId(asset.id)} title="Details"
                                                            className="p-2 md:p-1.5 hover:bg-[var(--surface2)] rounded-lg text-[var(--text3)] hover:text-[var(--accent)] transition-colors">
                                                            <ChevronRight size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {tab === "issued" && (
                    <>
                        {/* Filters */}
                        <div className="flex items-center gap-3 mb-4">
                            <div className="relative flex-1 max-w-xs">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                                <input
                                    value={assignSearch}
                                    onChange={e => setAssignSearch(e.target.value)}
                                    placeholder="Search by employee or asset..."
                                    className="pl-8 pr-4 py-2 text-[12.5px] border border-[var(--border)] rounded-xl bg-[var(--surface2)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] w-full"
                                />
                                {assignSearch && (
                                    <button onClick={() => setAssignSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]">
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                            <button onClick={() => setActiveOnly(v => !v)}
                                className={`px-3 py-2 rounded-xl text-[12px] font-medium border transition-all ${activeOnly ? "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/30" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)]"}`}>
                                {activeOnly ? "Active Only" : "All"}
                            </button>
                        </div>

                        {/* Issued Items Table */}
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
                            {loadingAssignments ? (
                                <div className="flex items-center justify-center py-16">
                                    <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                                </div>
                            ) : assignments.length === 0 ? (
                                <div className="flex flex-col items-center py-16 text-[var(--text3)]">
                                    <Users size={40} className="mb-3 opacity-30" />
                                    <p className="text-[14px] font-medium">No issued items found</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                <table className="w-full min-w-[820px] text-[13px]">
                                    <thead>
                                        <tr className="border-b border-[var(--border)] bg-[var(--surface2)]">
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">Employee</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">Asset</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">Issued Date</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">Condition</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">Status</th>
                                            <th className="text-right px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        {assignments.map(a => (
                                            <tr key={a.id} className="hover:bg-[var(--surface2)]/50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <Avatar firstName={a.employee.firstName} lastName={a.employee.lastName} photo={a.employee.photo} size={32} />
                                                        <div>
                                                            <p className="font-medium text-[var(--text)]">{a.employee.firstName} {a.employee.lastName}</p>
                                                            <p className="text-[11.5px] text-[var(--text3)]">{a.employee.employeeId}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-[var(--text)]">{a.asset.name}</p>
                                                    <p className="text-[11px] font-mono text-[var(--accent)]">{a.asset.assetCode}</p>
                                                </td>
                                                <td className="px-4 py-3 text-[var(--text2)]">
                                                    {format(new Date(a.issuedAt), "dd MMM yyyy")}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <ConditionBadge condition={a.condition} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    {a.isActive ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#e8f7f1] text-[#1a9e6e]">
                                                            <CheckCircle size={10} />
                                                            With Employee
                                                        </span>
                                                    ) : (
                                                        <div>
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f3f4f6] text-[#6b7280]">
                                                                <RotateCcw size={10} />
                                                                Returned
                                                            </span>
                                                            {a.returnedAt && (
                                                                <p className="text-[11px] text-[var(--text3)] mt-0.5">{format(new Date(a.returnedAt), "dd MMM yyyy")}</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {a.isActive && (
                                                        <button
                                                            onClick={() => setReturnAssignment(a)}
                                                            className="px-3 py-1.5 text-[11.5px] font-medium border border-[var(--border)] rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors flex items-center gap-1.5 ml-auto">
                                                            <RotateCcw size={12} />
                                                            Return
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Modals */}
            {addModal && (
                <AssetModal
                    onClose={() => setAddModal(false)}
                    onSave={() => { setAddModal(false); fetchAssets() }}
                />
            )}
            {editAsset && (
                <AssetModal
                    asset={editAsset}
                    onClose={() => setEditAsset(null)}
                    onSave={() => { setEditAsset(null); fetchAssets() }}
                />
            )}
            {issueAsset && (
                <IssueModal
                    asset={issueAsset}
                    employees={employees}
                    onClose={() => setIssueAsset(null)}
                    onSave={() => { setIssueAsset(null); fetchAssets(); fetchAssignments() }}
                />
            )}
            {returnAssignment && (
                <ReturnModal
                    assignment={returnAssignment}
                    onClose={() => setReturnAssignment(null)}
                    onSave={() => { setReturnAssignment(null); fetchAssets(); fetchAssignments() }}
                />
            )}
            {drawerAssetId && (
                <AssetDrawer
                    assetId={drawerAssetId}
                    employees={employees}
                    onClose={() => setDrawerAssetId(null)}
                    onRefresh={() => { fetchAssets(); fetchAssignments() }}
                />
            )}
        </div>
    )
}
