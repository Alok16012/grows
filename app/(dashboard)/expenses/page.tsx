"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import {
    Plus, Search, Loader2, X, CreditCard,
    ChevronRight, CheckCircle2, Clock,
    XCircle, Wallet, Calendar, MoreVertical,
    Trash2, Edit2, Send, BadgeCheck, Ban, Banknote,
    type LucideIcon
} from "lucide-react"
import { format } from "date-fns"

// ─── Types ─────────────────────────────────────────────────────────────────────

type ExpenseStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID"
type ExpenseCategory =
    | "TRAVEL" | "FOOD" | "ACCOMMODATION" | "FUEL"
    | "OFFICE_SUPPLIES" | "COMMUNICATION" | "MEDICAL"
    | "UNIFORM" | "TRAINING" | "OTHER"

type ExpenseUser = { id: string; name: string; email: string }

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
    approvedBy: string | null
    approvedAt: string | null
    rejectedAt: string | null
    rejectionReason: string | null
    paidAt: string | null
    paymentMode: string | null
    status: ExpenseStatus
    createdAt: string
    updatedAt: string
    submittedByUser: ExpenseUser | null
    approvedByUser: ExpenseUser | null
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: ExpenseCategory[] = [
    "TRAVEL", "FOOD", "ACCOMMODATION", "FUEL",
    "OFFICE_SUPPLIES", "COMMUNICATION", "MEDICAL",
    "UNIFORM", "TRAINING", "OTHER"
]

const PAYMENT_MODES = ["Cash", "NEFT", "RTGS", "UPI", "Cheque", "Bank Transfer"]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
    return "₹" + amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function categoryLabel(cat: ExpenseCategory): string {
    const map: Record<ExpenseCategory, string> = {
        TRAVEL: "Travel",
        FOOD: "Food",
        ACCOMMODATION: "Accommodation",
        FUEL: "Fuel",
        OFFICE_SUPPLIES: "Office Supplies",
        COMMUNICATION: "Communication",
        MEDICAL: "Medical",
        UNIFORM: "Uniform",
        TRAINING: "Training",
        OTHER: "Other",
    }
    return map[cat] || cat
}

function categoryStyle(cat: ExpenseCategory): { bg: string; color: string } {
    const map: Record<ExpenseCategory, { bg: string; color: string }> = {
        TRAVEL: { bg: "#eff6ff", color: "#3b82f6" },
        FOOD: { bg: "#fff7ed", color: "#f97316" },
        ACCOMMODATION: { bg: "#fdf4ff", color: "#a855f7" },
        FUEL: { bg: "#fefce8", color: "#ca8a04" },
        OFFICE_SUPPLIES: { bg: "#f0fdfa", color: "#0d9488" },
        COMMUNICATION: { bg: "#ecfeff", color: "#0891b2" },
        MEDICAL: { bg: "#fef2f2", color: "#ef4444" },
        UNIFORM: { bg: "#eef2ff", color: "#6366f1" },
        TRAINING: { bg: "#f0fdf4", color: "#22c55e" },
        OTHER: { bg: "#f9fafb", color: "#6b7280" },
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

function AddExpenseModal({
    open, onClose, onSaved, editExpense
}: {
    open: boolean
    onClose: () => void
    onSaved: () => void
    editExpense?: Expense | null
}) {
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({
        title: "",
        category: "TRAVEL" as ExpenseCategory,
        amount: "",
        date: format(new Date(), "yyyy-MM-dd"),
        description: "",
    })

    useEffect(() => {
        if (open) {
            if (editExpense) {
                setForm({
                    title: editExpense.title,
                    category: editExpense.category,
                    amount: String(editExpense.amount),
                    date: format(new Date(editExpense.date), "yyyy-MM-dd"),
                    description: editExpense.description || "",
                })
            } else {
                setForm({
                    title: "",
                    category: "TRAVEL",
                    amount: "",
                    date: format(new Date(), "yyyy-MM-dd"),
                    description: "",
                })
            }
        }
    }, [open, editExpense])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const url = editExpense ? `/api/expenses/${editExpense.id}` : "/api/expenses"
            const method = editExpense ? "PUT" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
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
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-white rounded-t-[16px]">
                    <h2 className="text-[15px] font-semibold text-[var(--text)]">
                        {editExpense ? "Edit Expense" : "Add Expense"}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Title *</label>
                        <input
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="e.g. Business trip to Mumbai"
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
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Amount (₹) *</label>
                            <input
                                type="number"
                                value={form.amount}
                                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                                className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                                required
                            />
                        </div>
                    </div>
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
                    <div className="rounded-[8px] bg-[var(--surface2)] border border-[var(--border)] p-3 text-[12px] text-[var(--text2)]">
                        Receipt upload will be available in the next release. You can attach receipts once the expense is submitted.
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
    const [showEditModal, setShowEditModal] = useState(false)

    useEffect(() => {
        setShowRejectBox(false)
        setShowPayBox(false)
        setRejectionReason("")
        setPaymentMode("NEFT")
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

                        {/* Description */}
                        {expense.description && (
                            <div>
                                <p className="text-[12px] font-medium text-[var(--text2)] mb-1.5">Description</p>
                                <p className="text-[13px] text-[var(--text)] bg-[var(--surface2)] rounded-[10px] p-3 leading-relaxed">
                                    {expense.description}
                                </p>
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
                                        <span className="text-[var(--text3)]">Paid on: </span>
                                        <span className="font-medium text-[var(--text)]">
                                            {expense.paidAt ? format(new Date(expense.paidAt), "dd MMM yyyy") : "-"}
                                        </span>
                                    </div>
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
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setShowPayBox(false)}
                                                    className="flex-1 h-9 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => doAction("PAID", { paymentMode })}
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
                    <p className="text-[13px] font-medium text-[var(--text)] truncate">{expense.title}</p>
                    <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium mt-0.5"
                        style={{ background: catStyle.bg, color: catStyle.color }}
                    >
                        {categoryLabel(expense.category)}
                    </span>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

type ActiveTab = "mine" | "all"
type StatusFilter = "ALL" | ExpenseStatus

export default function ExpensesPage() {
    const { data: session } = useSession()
    const role = session?.user?.role
    const userId = session?.user?.id || ""
    const isPrivileged = role === "ADMIN" || role === "MANAGER"

    const [expenses, setExpenses] = useState<Expense[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<ActiveTab>("mine")
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
    const [categoryFilter, setCategoryFilter] = useState<string>("ALL")
    const [dateFrom, setDateFrom] = useState("")
    const [dateTo, setDateTo] = useState("")
    const [search, setSearch] = useState("")
    const [addOpen, setAddOpen] = useState(false)
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)

    const fetchExpenses = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (statusFilter !== "ALL") params.set("status", statusFilter)
            if (categoryFilter !== "ALL") params.set("category", categoryFilter)
            if (dateFrom) params.set("dateFrom", dateFrom)
            if (dateTo) params.set("dateTo", dateTo)
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
    }, [statusFilter, categoryFilter, dateFrom, dateTo, search, activeTab, userId, selectedExpense])

    useEffect(() => {
        if (userId) fetchExpenses()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter, categoryFilter, dateFrom, dateTo, search, activeTab, userId])

    // Stats computed from all "mine" data (independent call)
    const [stats, setStats] = useState({
        myPending: 0,
        approvedThisMonth: 0,
        claimedThisMonth: 0,
        rejected: 0,
    })

    useEffect(() => {
        if (!userId) return
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
    }, [userId, expenses])

    const STATUS_FILTERS: StatusFilter[] = ["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"]

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
                <button
                    onClick={() => setAddOpen(true)}
                    className="h-9 px-4 bg-[var(--accent)] text-white text-[13px] font-medium rounded-[8px] hover:opacity-90 flex items-center gap-2 transition-opacity"
                >
                    <Plus size={16} /> Add Expense
                </button>
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
            {isPrivileged && (
                <div className="flex gap-1 mb-4 border-b border-[var(--border)]">
                    {(["mine", "all"] as ActiveTab[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px ${activeTab === tab
                                ? "border-[var(--accent)] text-[var(--accent)]"
                                : "border-transparent text-[var(--text2)] hover:text-[var(--text)]"
                                }`}
                        >
                            {tab === "mine" ? "My Expenses" : "All Expenses"}
                        </button>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-3 mb-4 space-y-3">
                {/* Status pills */}
                <div className="flex flex-wrap gap-1.5">
                    {STATUS_FILTERS.map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${statusFilter === s
                                ? "bg-[var(--accent)] text-white"
                                : "bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--border)]"
                                }`}
                        >
                            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                        </button>
                    ))}
                </div>
                {/* Second row: Category + Date range + Search */}
                <div className="flex flex-wrap gap-2">
                    <select
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value)}
                        className="h-8 rounded-[8px] border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                    >
                        <option value="ALL">All Categories</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                        <Calendar size={13} className="text-[var(--text3)] shrink-0" />
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            className="h-8 rounded-[8px] border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                            placeholder="From"
                        />
                        <span className="text-[var(--text3)] text-[12px]">–</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
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
            </div>

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

            {/* Modals / Drawers */}
            <AddExpenseModal
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onSaved={fetchExpenses}
            />
            <ExpenseDrawer
                expense={selectedExpense}
                onClose={() => setSelectedExpense(null)}
                onRefresh={fetchExpenses}
                isPrivileged={isPrivileged}
                currentUserId={userId}
            />
        </div>
    )
}
