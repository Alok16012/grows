"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, Search, Loader2, X, FileSignature,
    Users, MoreHorizontal,
    AlertTriangle, CheckCircle2, Clock, TrendingUp,
    Edit2, Trash2, RefreshCw,
    XCircle, Eye, type LucideIcon
} from "lucide-react"
import { format, formatDistanceToNow, differenceInDays } from "date-fns"

// ─── Types ──────────────────────────────────────────────────────────────────────

type ContractStatus = "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED" | "RENEWED"
type ContractType = "FIXED_TERM" | "ONGOING" | "PROJECT_BASED" | "RETAINER"

type ContractRenewal = {
    id: string
    contractId: string
    renewedAt: string
    newEndDate: string
    newValue: number | null
    notes: string | null
    renewedBy: string
}

type Contract = {
    id: string
    contractNo: string
    clientName: string
    clientCompanyId: string | null
    contactPerson: string | null
    contactEmail: string | null
    contactPhone: string | null
    contractType: ContractType
    status: ContractStatus
    startDate: string
    endDate: string | null
    value: number | null
    monthlyValue: number | null
    manpowerCount: number | null
    serviceType: string | null
    slaTerms: string | null
    billingCycle: string | null
    paymentTerms: string | null
    notes: string | null
    createdBy: string
    createdAt: string
    updatedAt: string
    daysUntilExpiry: number | null
    renewalsCount?: number
    renewals?: ContractRenewal[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtINR(val: number | null | undefined) {
    if (val == null) return "—"
    return "₹" + val.toLocaleString("en-IN")
}

function statusConfig(status: ContractStatus) {
    const map: Record<ContractStatus, { bg: string; color: string; label: string }> = {
        DRAFT:      { bg: "var(--surface2)", color: "var(--text2)",  label: "Draft" },
        ACTIVE:     { bg: "#e8f7f1",         color: "#1a9e6e",        label: "Active" },
        EXPIRED:    { bg: "#fef2f2",         color: "var(--red)",     label: "Expired" },
        TERMINATED: { bg: "#fef2f2",         color: "var(--red)",     label: "Terminated" },
        RENEWED:    { bg: "#eff6ff",         color: "#3b82f6",        label: "Renewed" },
    }
    return map[status]
}

function typeConfig(type: ContractType) {
    const map: Record<ContractType, { bg: string; color: string; label: string }> = {
        FIXED_TERM:    { bg: "#eff6ff", color: "#3b82f6", label: "Fixed Term" },
        ONGOING:       { bg: "#e8f7f1", color: "#1a9e6e", label: "Ongoing" },
        PROJECT_BASED: { bg: "#fdf4ff", color: "#a855f7", label: "Project Based" },
        RETAINER:      { bg: "#fff7ed", color: "#f97316", label: "Retainer" },
    }
    return map[type]
}

function DaysChip({ days }: { days: number | null }) {
    if (days === null) return <span className="text-[var(--text3)] text-[12px]">No end date</span>
    if (days < 0) return (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#fef2f2] text-[var(--red)]">
            Expired {Math.abs(days)}d ago
        </span>
    )
    if (days <= 30) return (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#fffbeb] text-[var(--amber)]">
            {days}d left
        </span>
    )
    return (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#e8f7f1] text-[#1a9e6e]">
            {days}d left
        </span>
    )
}

// ─── New / Edit Contract Modal ──────────────────────────────────────────────────

type ContractFormData = {
    clientName: string
    contactPerson: string
    contactEmail: string
    contactPhone: string
    contractType: ContractType
    serviceType: string
    startDate: string
    endDate: string
    monthlyValue: string
    value: string
    manpowerCount: string
    slaTerms: string
    billingCycle: string
    paymentTerms: string
    notes: string
}

const emptyForm: ContractFormData = {
    clientName: "",
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    contractType: "FIXED_TERM",
    serviceType: "",
    startDate: "",
    endDate: "",
    monthlyValue: "",
    value: "",
    manpowerCount: "",
    slaTerms: "",
    billingCycle: "Monthly",
    paymentTerms: "Net 30",
    notes: "",
}

function ContractModal({
    open,
    onClose,
    onSaved,
    editing,
}: {
    open: boolean
    onClose: () => void
    onSaved: () => void
    editing: Contract | null
}) {
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState<ContractFormData>(emptyForm)

    useEffect(() => {
        if (open) {
            if (editing) {
                setForm({
                    clientName: editing.clientName,
                    contactPerson: editing.contactPerson || "",
                    contactEmail: editing.contactEmail || "",
                    contactPhone: editing.contactPhone || "",
                    contractType: editing.contractType,
                    serviceType: editing.serviceType || "",
                    startDate: editing.startDate ? editing.startDate.slice(0, 10) : "",
                    endDate: editing.endDate ? editing.endDate.slice(0, 10) : "",
                    monthlyValue: editing.monthlyValue != null ? String(editing.monthlyValue) : "",
                    value: editing.value != null ? String(editing.value) : "",
                    manpowerCount: editing.manpowerCount != null ? String(editing.manpowerCount) : "",
                    slaTerms: editing.slaTerms || "",
                    billingCycle: editing.billingCycle || "Monthly",
                    paymentTerms: editing.paymentTerms || "Net 30",
                    notes: editing.notes || "",
                })
            } else {
                setForm(emptyForm)
            }
        }
    }, [open, editing])

    const set = (field: keyof ContractFormData, val: string) =>
        setForm(prev => ({ ...prev, [field]: val }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const url = editing ? `/api/contracts/${editing.id}` : "/api/contracts"
            const method = editing ? "PUT" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(editing ? "Contract updated!" : "Contract created!")
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to save contract")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-white rounded-t-[16px] z-10">
                    <h2 className="text-[15px] font-semibold text-[var(--text)]">
                        {editing ? "Edit Contract" : "New Contract"}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-5">
                    {/* Client info */}
                    <div>
                        <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-3">Client Information</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Client Name <span className="text-[var(--red)]">*</span></label>
                                <input
                                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                                    value={form.clientName}
                                    onChange={e => set("clientName", e.target.value)}
                                    placeholder="e.g. Tata Consultancy Services"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Contact Person</label>
                                <input
                                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                                    value={form.contactPerson}
                                    onChange={e => set("contactPerson", e.target.value)}
                                    placeholder="Full name"
                                />
                            </div>
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Contact Email</label>
                                <input
                                    type="email"
                                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                                    value={form.contactEmail}
                                    onChange={e => set("contactEmail", e.target.value)}
                                    placeholder="email@company.com"
                                />
                            </div>
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Contact Phone</label>
                                <input
                                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                                    value={form.contactPhone}
                                    onChange={e => set("contactPhone", e.target.value)}
                                    placeholder="+91 98765 43210"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Contract details */}
                    <div>
                        <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-3">Contract Details</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Contract Type</label>
                                <select
                                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                                    value={form.contractType}
                                    onChange={e => set("contractType", e.target.value as ContractType)}
                                >
                                    <option value="FIXED_TERM">Fixed Term</option>
                                    <option value="ONGOING">Ongoing</option>
                                    <option value="PROJECT_BASED">Project Based</option>
                                    <option value="RETAINER">Retainer</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Service Type</label>
                                <input
                                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                                    value={form.serviceType}
                                    onChange={e => set("serviceType", e.target.value)}
                                    placeholder="e.g. Security, Housekeeping"
                                />
                            </div>
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Start Date <span className="text-[var(--red)]">*</span></label>
                                <input
                                    type="date"
                                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                                    value={form.startDate}
                                    onChange={e => set("startDate", e.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">End Date</label>
                                <input
                                    type="date"
                                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                                    value={form.endDate}
                                    onChange={e => set("endDate", e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Financial */}
                    <div>
                        <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-3">Financial & Staffing</p>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Monthly Value (₹)</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                                    value={form.monthlyValue}
                                    onChange={e => set("monthlyValue", e.target.value)}
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Total Value (₹)</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                                    value={form.value}
                                    onChange={e => set("value", e.target.value)}
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Manpower Count</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                                    value={form.manpowerCount}
                                    onChange={e => set("manpowerCount", e.target.value)}
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Billing Cycle</label>
                                <select
                                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                                    value={form.billingCycle}
                                    onChange={e => set("billingCycle", e.target.value)}
                                >
                                    <option>Monthly</option>
                                    <option>Bi-monthly</option>
                                    <option>Quarterly</option>
                                    <option>Annual</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Payment Terms</label>
                                <select
                                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                                    value={form.paymentTerms}
                                    onChange={e => set("paymentTerms", e.target.value)}
                                >
                                    <option>Net 15</option>
                                    <option>Net 30</option>
                                    <option>Net 45</option>
                                    <option>Net 60</option>
                                    <option>Advance</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* SLA & Notes */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">SLA Terms</label>
                            <textarea
                                rows={3}
                                className="w-full px-3 py-2 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] resize-none"
                                value={form.slaTerms}
                                onChange={e => set("slaTerms", e.target.value)}
                                placeholder="Service level agreement terms..."
                            />
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Notes</label>
                            <textarea
                                rows={3}
                                className="w-full px-3 py-2 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] resize-none"
                                value={form.notes}
                                onChange={e => set("notes", e.target.value)}
                                placeholder="Additional notes..."
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-9 px-4 rounded-[8px] text-[13px] font-medium text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="h-9 px-5 rounded-[8px] text-[13px] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2"
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            {editing ? "Save Changes" : "Create Contract"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Renew Modal ────────────────────────────────────────────────────────────────

function RenewModal({
    open,
    onClose,
    onSaved,
    contract,
}: {
    open: boolean
    onClose: () => void
    onSaved: () => void
    contract: Contract | null
}) {
    const [loading, setLoading] = useState(false)
    const [newEndDate, setNewEndDate] = useState("")
    const [newValue, setNewValue] = useState("")
    const [notes, setNotes] = useState("")

    useEffect(() => {
        if (open) {
            setNewEndDate("")
            setNewValue(contract?.monthlyValue != null ? String(contract.monthlyValue) : "")
            setNotes("")
        }
    }, [open, contract])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!contract) return
        setLoading(true)
        try {
            const res = await fetch(`/api/contracts/${contract.id}/renew`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newEndDate, newValue: newValue || undefined, notes: notes || undefined }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Contract renewed!")
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to renew contract")
        } finally {
            setLoading(false)
        }
    }

    if (!open || !contract) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-md shadow-xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <h2 className="text-[15px] font-semibold text-[var(--text)]">Renew Contract</h2>
                    <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)]">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="p-3 bg-[var(--surface2)] rounded-[10px]">
                        <p className="text-[12px] text-[var(--text3)]">Renewing</p>
                        <p className="text-[14px] font-semibold text-[var(--text)]">{contract.contractNo} — {contract.clientName}</p>
                    </div>
                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">New End Date <span className="text-[var(--red)]">*</span></label>
                        <input
                            type="date"
                            className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                            value={newEndDate}
                            onChange={e => setNewEndDate(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">New Monthly Value (₹)</label>
                        <input
                            type="number"
                            min="0"
                            className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                            value={newValue}
                            onChange={e => setNewValue(e.target.value)}
                            placeholder="Leave blank to keep current"
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Notes</label>
                        <textarea
                            rows={3}
                            className="w-full px-3 py-2 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] resize-none"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Renewal notes..."
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                        <button type="button" onClick={onClose} className="h-9 px-4 rounded-[8px] text-[13px] font-medium text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} className="h-9 px-5 rounded-[8px] text-[13px] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            Renew Contract
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Contract Detail Drawer ──────────────────────────────────────────────────────

function ContractDrawer({
    contract,
    onClose,
    onEdit,
    onRenew,
    onStatusChange,
    onDelete,
}: {
    contract: Contract | null
    onClose: () => void
    onEdit: (c: Contract) => void
    onRenew: (c: Contract) => void
    onStatusChange: (id: string, status: ContractStatus) => Promise<void>
    onDelete: (id: string) => Promise<void>
}) {
    const [detail, setDetail] = useState<Contract | null>(null)
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [actionLoading, setActionLoading] = useState(false)

    useEffect(() => {
        if (!contract) {
            setDetail(null)
            return
        }
        setLoadingDetail(true)
        fetch(`/api/contracts/${contract.id}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => setDetail(data))
            .catch(() => setDetail(null))
            .finally(() => setLoadingDetail(false))
    }, [contract])

    if (!contract) return null

    const c = detail || contract
    const statusCfg = statusConfig(c.status)
    const typeCfg = typeConfig(c.contractType)

    const totalDays = c.startDate && c.endDate
        ? differenceInDays(new Date(c.endDate), new Date(c.startDate))
        : null
    const passedDays = c.startDate
        ? differenceInDays(new Date(), new Date(c.startDate))
        : null
    const progressPct = totalDays && passedDays != null
        ? Math.max(0, Math.min(100, Math.round((passedDays / totalDays) * 100)))
        : null

    const handleActivate = async () => {
        setActionLoading(true)
        await onStatusChange(c.id, "ACTIVE")
        setActionLoading(false)
    }
    const handleTerminate = async () => {
        if (!confirm("Terminate this contract?")) return
        setActionLoading(true)
        await onStatusChange(c.id, "TERMINATED")
        setActionLoading(false)
    }
    const handleDelete = async () => {
        if (!confirm("Delete this draft contract?")) return
        setActionLoading(true)
        await onDelete(c.id)
        setActionLoading(false)
        onClose()
    }

    return (
        <div className="fixed inset-0 z-40 flex">
            <div className="flex-1 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
            <div className="w-[420px] bg-white h-full border-l border-[var(--border)] flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 border-b border-[var(--border)] flex items-start justify-between shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-[14px] font-semibold text-[#1a9e6e]">{c.contractNo}</span>
                            <span
                                className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                style={{ background: statusCfg.bg, color: statusCfg.color }}
                            >
                                {statusCfg.label}
                            </span>
                        </div>
                        <p className="text-[16px] font-semibold text-[var(--text)]">{c.clientName}</p>
                        {c.serviceType && (
                            <p className="text-[12px] text-[var(--text3)] mt-0.5">{c.serviceType}</p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] mt-0.5">
                        <X size={18} />
                    </button>
                </div>

                {loadingDetail ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 size={22} className="animate-spin text-[var(--accent)]" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto">
                        {/* Meta grid */}
                        <div className="px-5 py-4 border-b border-[var(--border)]">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                <MetaItem label="Type">
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: typeCfg.bg, color: typeCfg.color }}>
                                        {typeCfg.label}
                                    </span>
                                </MetaItem>
                                <MetaItem label="Manpower">
                                    <span className="text-[13px] text-[var(--text)] font-medium flex items-center gap-1">
                                        <Users size={13} className="text-[var(--text3)]" />
                                        {c.manpowerCount != null ? `${c.manpowerCount} people` : "—"}
                                    </span>
                                </MetaItem>
                                <MetaItem label="Monthly Value">
                                    <span className="text-[13px] font-semibold text-[var(--text)]">{fmtINR(c.monthlyValue)}</span>
                                </MetaItem>
                                <MetaItem label="Total Value">
                                    <span className="text-[13px] font-semibold text-[var(--text)]">{fmtINR(c.value)}</span>
                                </MetaItem>
                                <MetaItem label="Billing Cycle">
                                    <span className="text-[13px] text-[var(--text)]">{c.billingCycle || "—"}</span>
                                </MetaItem>
                                <MetaItem label="Payment Terms">
                                    <span className="text-[13px] text-[var(--text)]">{c.paymentTerms || "—"}</span>
                                </MetaItem>
                            </div>
                        </div>

                        {/* Dates */}
                        <div className="px-5 py-4 border-b border-[var(--border)]">
                            <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-3">Contract Period</p>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[12px] text-[var(--text2)]">
                                    {format(new Date(c.startDate), "dd MMM yyyy")}
                                </span>
                                <span className="text-[12px] text-[var(--text3)]">→</span>
                                <span className="text-[12px] text-[var(--text2)]">
                                    {c.endDate ? format(new Date(c.endDate), "dd MMM yyyy") : "Ongoing"}
                                </span>
                            </div>
                            {progressPct !== null && (
                                <div className="space-y-1.5">
                                    <div className="h-2 bg-[var(--surface2)] rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{
                                                width: `${progressPct}%`,
                                                background: progressPct >= 90 ? "var(--red)" : progressPct >= 70 ? "var(--amber)" : "var(--accent)",
                                            }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-[var(--text3)]">{progressPct}% elapsed</span>
                                        <DaysChip days={c.daysUntilExpiry} />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* SLA Terms */}
                        {c.slaTerms && (
                            <div className="px-5 py-4 border-b border-[var(--border)]">
                                <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-2">SLA Terms</p>
                                <p className="text-[13px] text-[var(--text2)] leading-relaxed whitespace-pre-wrap">{c.slaTerms}</p>
                            </div>
                        )}

                        {/* Contact Info */}
                        {(c.contactPerson || c.contactEmail || c.contactPhone) && (
                            <div className="px-5 py-4 border-b border-[var(--border)]">
                                <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-2">Contact</p>
                                <div className="space-y-1.5">
                                    {c.contactPerson && <p className="text-[13px] text-[var(--text)] font-medium">{c.contactPerson}</p>}
                                    {c.contactEmail && <p className="text-[12px] text-[var(--text2)]">{c.contactEmail}</p>}
                                    {c.contactPhone && <p className="text-[12px] text-[var(--text2)]">{c.contactPhone}</p>}
                                </div>
                            </div>
                        )}

                        {/* Renewal History */}
                        {detail?.renewals && detail.renewals.length > 0 && (
                            <div className="px-5 py-4 border-b border-[var(--border)]">
                                <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-3">
                                    Renewal History ({detail.renewals.length})
                                </p>
                                <div className="space-y-2">
                                    {detail.renewals.map(r => (
                                        <div key={r.id} className="bg-[var(--surface2)] rounded-[10px] p-3">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[12px] font-semibold text-[var(--text)]">
                                                    New end: {format(new Date(r.newEndDate), "dd MMM yyyy")}
                                                </span>
                                                {r.newValue != null && (
                                                    <span className="text-[12px] font-medium text-[#1a9e6e]">{fmtINR(r.newValue)}/mo</span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-[var(--text3)]">
                                                Renewed {formatDistanceToNow(new Date(r.renewedAt), { addSuffix: true })}
                                            </p>
                                            {r.notes && <p className="text-[12px] text-[var(--text2)] mt-1">{r.notes}</p>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        {c.notes && (
                            <div className="px-5 py-4">
                                <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-2">Notes</p>
                                <p className="text-[13px] text-[var(--text2)] leading-relaxed">{c.notes}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="px-5 py-4 border-t border-[var(--border)] shrink-0 space-y-2">
                    {c.status === "DRAFT" && (
                        <button
                            onClick={handleActivate}
                            disabled={actionLoading}
                            className="w-full h-9 rounded-[8px] text-[13px] font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={15} />}
                            Activate Contract
                        </button>
                    )}
                    {c.status === "ACTIVE" && (
                        <>
                            <button
                                onClick={() => onRenew(c)}
                                disabled={actionLoading}
                                className="w-full h-9 rounded-[8px] text-[13px] font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={15} />
                                Renew Contract
                            </button>
                            <button
                                onClick={handleTerminate}
                                disabled={actionLoading}
                                className="w-full h-9 rounded-[8px] text-[13px] font-semibold border border-[var(--red)] text-[var(--red)] hover:bg-[#fef2f2] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={15} />}
                                Terminate
                            </button>
                        </>
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={() => onEdit(c)}
                            className="flex-1 h-9 rounded-[8px] text-[13px] font-medium border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors flex items-center justify-center gap-2"
                        >
                            <Edit2 size={14} />
                            Edit
                        </button>
                        {c.status === "DRAFT" && (
                            <button
                                onClick={handleDelete}
                                disabled={actionLoading}
                                className="flex-1 h-9 rounded-[8px] text-[13px] font-medium border border-[var(--red)] text-[var(--red)] hover:bg-[#fef2f2] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                <Trash2 size={14} />
                                Delete
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[11px] text-[var(--text3)] mb-0.5">{label}</p>
            {children}
        </div>
    )
}

// ─── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({
    label,
    value,
    icon: Icon,
    colorClass,
    bgClass,
}: {
    label: string
    value: string | number
    icon: LucideIcon
    colorClass: string
    bgClass: string
}) {
    return (
        <div className="bg-white border border-[var(--border)] rounded-[14px] px-5 py-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 ${bgClass}`}>
                <Icon size={20} className={colorClass} />
            </div>
            <div>
                <p className="text-[12px] text-[var(--text3)] font-medium">{label}</p>
                <p className="text-[22px] font-bold text-[var(--text)] leading-tight">{value}</p>
            </div>
        </div>
    )
}

// ─── Contract Row ────────────────────────────────────────────────────────────────

function ContractRow({
    contract,
    onView,
    onEdit,
    onRenew,
    onStatusChange,
    onDelete,
}: {
    contract: Contract
    onView: (c: Contract) => void
    onEdit: (c: Contract) => void
    onRenew: (c: Contract) => void
    onStatusChange: (id: string, status: ContractStatus) => Promise<void>
    onDelete: (id: string) => Promise<void>
}) {
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuLoading, setMenuLoading] = useState(false)
    const statusCfg = statusConfig(contract.status)
    const typeCfg = typeConfig(contract.contractType)

    const handleMenuAction = async (action: string) => {
        setMenuOpen(false)
        if (action === "view") { onView(contract); return }
        if (action === "edit") { onEdit(contract); return }
        if (action === "renew") { onRenew(contract); return }
        if (action === "terminate") {
            if (!confirm("Terminate this contract?")) return
            setMenuLoading(true)
            await onStatusChange(contract.id, "TERMINATED")
            setMenuLoading(false)
        }
        if (action === "delete") {
            if (!confirm("Delete this draft contract?")) return
            setMenuLoading(true)
            await onDelete(contract.id)
            setMenuLoading(false)
        }
    }

    return (
        <div className="bg-white border border-[var(--border)] rounded-[12px] px-4 py-3.5 flex items-center gap-4 hover:border-[var(--accent)]/30 hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all">
            {/* Contract No + Client */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span
                        className="font-mono text-[13px] font-bold cursor-pointer hover:underline"
                        style={{ color: "#1a9e6e" }}
                        onClick={() => onView(contract)}
                    >
                        {contract.contractNo}
                    </span>
                    {contract.serviceType && (
                        <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium bg-[var(--surface2)] text-[var(--text3)]">
                            {contract.serviceType}
                        </span>
                    )}
                </div>
                <p className="text-[14px] font-semibold text-[var(--text)] truncate">{contract.clientName}</p>
            </div>

            {/* Type badge */}
            <div className="hidden sm:block">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: typeCfg.bg, color: typeCfg.color }}>
                    {typeCfg.label}
                </span>
            </div>

            {/* Manpower */}
            <div className="hidden md:flex items-center gap-1 text-[13px] text-[var(--text2)] w-[80px]">
                <Users size={13} className="text-[var(--text3)]" />
                {contract.manpowerCount != null ? `${contract.manpowerCount}` : "—"}
            </div>

            {/* Dates */}
            <div className="hidden lg:block text-[12px] text-[var(--text3)] w-[150px] shrink-0">
                {format(new Date(contract.startDate), "dd MMM yy")}
                {" → "}
                {contract.endDate ? format(new Date(contract.endDate), "dd MMM yy") : "Ongoing"}
            </div>

            {/* Monthly Value */}
            <div className="hidden md:block text-[13px] font-semibold text-[var(--text)] w-[100px] text-right shrink-0">
                {fmtINR(contract.monthlyValue)}<span className="text-[11px] text-[var(--text3)] font-normal">/mo</span>
            </div>

            {/* Status */}
            <div className="shrink-0">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                    {statusCfg.label}
                </span>
            </div>

            {/* Days chip */}
            <div className="hidden md:block shrink-0 w-[90px] text-right">
                <DaysChip days={contract.daysUntilExpiry} />
            </div>

            {/* 3-dot menu */}
            <div className="relative shrink-0">
                <button
                    onClick={() => setMenuOpen(v => !v)}
                    disabled={menuLoading}
                    className="p-1.5 rounded-[6px] text-[var(--text3)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors"
                >
                    {menuLoading ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={16} />}
                </button>
                {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-[var(--border)] rounded-[10px] shadow-lg z-20 min-w-[140px] py-1 overflow-hidden">
                        <MenuItem icon={Eye} label="View" onClick={() => handleMenuAction("view")} />
                        <MenuItem icon={Edit2} label="Edit" onClick={() => handleMenuAction("edit")} />
                        {contract.status === "ACTIVE" && (
                            <MenuItem icon={RefreshCw} label="Renew" onClick={() => handleMenuAction("renew")} />
                        )}
                        {contract.status === "ACTIVE" && (
                            <MenuItem icon={XCircle} label="Terminate" onClick={() => handleMenuAction("terminate")} danger />
                        )}
                        {contract.status === "DRAFT" && (
                            <MenuItem icon={Trash2} label="Delete" onClick={() => handleMenuAction("delete")} danger />
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

function MenuItem({
    icon: Icon,
    label,
    onClick,
    danger,
}: {
    icon: LucideIcon
    label: string
    onClick: () => void
    danger?: boolean
}) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors ${danger ? "text-[var(--red)] hover:bg-[#fef2f2]" : "text-[var(--text2)] hover:bg-[var(--surface2)]"}`}
        >
            <Icon size={14} />
            {label}
        </button>
    )
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function ContractsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [contracts, setContracts] = useState<Contract[]>([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState("ALL")
    const [typeFilter, setTypeFilter] = useState("ALL")
    const [search, setSearch] = useState("")

    const [modalOpen, setModalOpen] = useState(false)
    const [editingContract, setEditingContract] = useState<Contract | null>(null)
    const [drawerContract, setDrawerContract] = useState<Contract | null>(null)
    const [renewContract, setRenewContract] = useState<Contract | null>(null)
    const [renewModalOpen, setRenewModalOpen] = useState(false)

    // Auth guard
    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        if (status === "authenticated" && session?.user?.role === "CLIENT") router.push("/client")
        if (status === "authenticated" && session?.user?.role === "INSPECTION_BOY") router.push("/inspection")
    }, [status, session, router])

    const fetchContracts = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (statusFilter !== "ALL") params.set("status", statusFilter)
            if (typeFilter !== "ALL") params.set("contractType", typeFilter)
            if (search) params.set("search", search)
            const res = await fetch(`/api/contracts?${params}`)
            if (!res.ok) throw new Error()
            const data = await res.json()
            setContracts(data)
        } catch {
            toast.error("Failed to load contracts")
        } finally {
            setLoading(false)
        }
    }, [statusFilter, typeFilter, search])

    useEffect(() => {
        if (status === "authenticated") fetchContracts()
    }, [fetchContracts, status])

    // Stats
    const activeCount = contracts.filter(c => c.status === "ACTIVE").length
    const expiringSoon = contracts.filter(c => c.status === "ACTIVE" && c.daysUntilExpiry != null && c.daysUntilExpiry >= 0 && c.daysUntilExpiry <= 30).length
    const expiring7 = contracts.filter(c => c.status === "ACTIVE" && c.daysUntilExpiry != null && c.daysUntilExpiry >= 0 && c.daysUntilExpiry <= 7).length
    const totalMonthly = contracts.filter(c => c.status === "ACTIVE").reduce((s, c) => s + (c.monthlyValue || 0), 0)
    const expiredTermCount = contracts.filter(c => c.status === "EXPIRED" || c.status === "TERMINATED").length

    const handleStatusChange = async (id: string, newStatus: ContractStatus) => {
        try {
            const res = await fetch(`/api/contracts/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(`Contract ${newStatus.toLowerCase()}`)
            fetchContracts()
            // Refresh drawer if open
            if (drawerContract?.id === id) {
                const updated = await res.json().catch(() => null)
                if (updated) setDrawerContract(updated)
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Action failed")
        }
    }

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/contracts/${id}`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Contract deleted")
            if (drawerContract?.id === id) setDrawerContract(null)
            fetchContracts()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Delete failed")
        }
    }

    const handleEdit = (c: Contract) => {
        setEditingContract(c)
        setModalOpen(true)
    }

    const handleRenew = (c: Contract) => {
        setRenewContract(c)
        setRenewModalOpen(true)
    }

    const statusPills: { label: string; value: string }[] = [
        { label: "All", value: "ALL" },
        { label: "Draft", value: "DRAFT" },
        { label: "Active", value: "ACTIVE" },
        { label: "Expired", value: "EXPIRED" },
        { label: "Terminated", value: "TERMINATED" },
        { label: "Renewed", value: "RENEWED" },
    ]

    if (status === "loading") {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {/* Expiry Alert Banner */}
            {expiring7 > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 bg-[#fffbeb] border border-[var(--amber)]/40 rounded-[12px]">
                    <AlertTriangle size={18} className="text-[var(--amber)] shrink-0" />
                    <p className="text-[13px] font-medium text-[#92400e]">
                        {expiring7} contract{expiring7 !== 1 ? "s" : ""} expiring within 7 days
                    </p>
                </div>
            )}

            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-[var(--accent-light)] rounded-[10px] flex items-center justify-center">
                        <FileSignature size={18} className="text-[var(--accent)]" />
                    </div>
                    <div>
                        <h1 className="text-[22px] font-bold tracking-[-0.4px] text-[var(--text)]">Contracts</h1>
                        <p className="text-[12px] text-[var(--text3)]">Client & contract management</p>
                    </div>
                </div>
                <button
                    onClick={() => { setEditingContract(null); setModalOpen(true) }}
                    className="inline-flex items-center gap-2 h-9 px-4 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-semibold hover:opacity-90 transition-opacity"
                >
                    <Plus size={16} />
                    New Contract
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Active Contracts" value={activeCount} icon={CheckCircle2} colorClass="text-[#1a9e6e]" bgClass="bg-[#e8f7f1]" />
                <StatCard label="Expiring in 30d" value={expiringSoon} icon={Clock} colorClass="text-[var(--amber)]" bgClass="bg-[#fffbeb]" />
                <StatCard label="Total Monthly" value={"₹" + totalMonthly.toLocaleString("en-IN")} icon={TrendingUp} colorClass="text-[#3b82f6]" bgClass="bg-[#eff6ff]" />
                <StatCard label="Expired / Terminated" value={expiredTermCount} icon={XCircle} colorClass="text-[var(--red)]" bgClass="bg-[#fef2f2]" />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Status Pills */}
                <div className="flex items-center gap-1 bg-[var(--surface2)] rounded-[10px] p-1 flex-wrap">
                    {statusPills.map(p => (
                        <button
                            key={p.value}
                            onClick={() => setStatusFilter(p.value)}
                            className={`px-3 py-1.5 rounded-[7px] text-[12px] font-medium transition-all ${statusFilter === p.value ? "bg-white text-[var(--text)] shadow-sm" : "text-[var(--text3)] hover:text-[var(--text2)]"}`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* Type dropdown */}
                <select
                    className="h-9 px-3 rounded-[9px] border border-[var(--border)] text-[13px] text-[var(--text)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                >
                    <option value="ALL">All Types</option>
                    <option value="FIXED_TERM">Fixed Term</option>
                    <option value="ONGOING">Ongoing</option>
                    <option value="PROJECT_BASED">Project Based</option>
                    <option value="RETAINER">Retainer</option>
                </select>

                {/* Search */}
                <div className="flex items-center gap-2 h-9 px-3 bg-white border border-[var(--border)] rounded-[9px] flex-1 min-w-[180px] max-w-[280px]">
                    <Search size={14} className="text-[var(--text3)] shrink-0" />
                    <input
                        className="flex-1 text-[13px] text-[var(--text)] bg-transparent outline-none placeholder-[var(--text3)]"
                        placeholder="Search client or contract no..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="text-[var(--text3)] hover:text-[var(--text)]">
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Contract List */}
            {loading ? (
                <div className="flex items-center justify-center min-h-[200px]">
                    <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                </div>
            ) : contracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[300px] bg-white border border-dashed border-[var(--border)] rounded-[14px]">
                    <FileSignature size={40} className="text-[var(--text3)] mb-3" />
                    <p className="text-[15px] font-semibold text-[var(--text)] mb-1">No contracts found</p>
                    <p className="text-[13px] text-[var(--text3)]">
                        {search || statusFilter !== "ALL" || typeFilter !== "ALL"
                            ? "Try adjusting your filters"
                            : "Create your first contract"}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {contracts.map(c => (
                        <ContractRow
                            key={c.id}
                            contract={c}
                            onView={setDrawerContract}
                            onEdit={handleEdit}
                            onRenew={handleRenew}
                            onStatusChange={handleStatusChange}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}

            {/* Modals */}
            <ContractModal
                open={modalOpen}
                onClose={() => { setModalOpen(false); setEditingContract(null) }}
                onSaved={fetchContracts}
                editing={editingContract}
            />
            <RenewModal
                open={renewModalOpen}
                onClose={() => setRenewModalOpen(false)}
                onSaved={fetchContracts}
                contract={renewContract}
            />
            <ContractDrawer
                contract={drawerContract}
                onClose={() => setDrawerContract(null)}
                onEdit={c => { setDrawerContract(null); handleEdit(c) }}
                onRenew={c => { setDrawerContract(null); handleRenew(c) }}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
            />
        </div>
    )
}
