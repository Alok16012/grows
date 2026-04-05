"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, Search, Loader2, X, Receipt,
    ChevronDown, Trash2, Send, FileText,
    MoreVertical, CreditCard, Ban, CheckCircle2,
    IndianRupee, AlertTriangle, Clock, TrendingUp
} from "lucide-react"
import { format } from "date-fns"

// ─── Types ─────────────────────────────────────────────────────────────────────

type InvoiceStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED"

type InvoiceItem = {
    id: string
    invoiceId: string
    description: string
    employeeCount: number
    ratePerHead: number
    days: number
    amount: number
}

type Payment = {
    id: string
    invoiceId: string
    amount: number
    paymentDate: string
    paymentMode: string
    referenceNo: string | null
    remarks: string | null
    recordedBy: string
    createdAt: string
}

type Invoice = {
    id: string
    invoiceNo: string
    clientName: string
    clientEmail: string | null
    clientAddress: string | null
    clientGST: string | null
    companyId: string | null
    billingMonth: number
    billingYear: number
    issueDate: string
    dueDate: string
    status: InvoiceStatus
    effectiveStatus?: string
    subtotal: number
    taxRate: number
    taxAmount: number
    totalAmount: number
    paidAmount: number
    notes: string | null
    createdBy: string
    createdAt: string
    updatedAt: string
    items: InvoiceItem[]
    payments: Payment[]
    _count?: { items: number; payments: number }
}

type LineItemDraft = {
    description: string
    employeeCount: string
    ratePerHead: string
    days: string
    amount: number
}

type PaymentForm = {
    amount: string
    paymentDate: string
    paymentMode: string
    referenceNo: string
    remarks: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
]

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

const PAYMENT_MODES = ["Cash", "Cheque", "NEFT", "RTGS", "UPI"]

const STATUS_FILTERS: { value: string; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "DRAFT", label: "Draft" },
    { value: "SENT", label: "Sent" },
    { value: "PARTIALLY_PAID", label: "Partial" },
    { value: "PAID", label: "Paid" },
    { value: "OVERDUE", label: "Overdue" },
    { value: "CANCELLED", label: "Cancelled" },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
    return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtShort(n: number) {
    return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
}

function monthLabel(m: number) {
    return MONTHS.find(x => x.value === m)?.label ?? ""
}

function billingPeriod(month: number, year: number) {
    return `${monthLabel(month)} ${year}`
}

type StatusStyle = { bg: string; color: string; label: string }

function statusBadge(status: string): StatusStyle {
    const map: Record<string, StatusStyle> = {
        DRAFT: { bg: "var(--surface2)", color: "var(--text3)", label: "Draft" },
        SENT: { bg: "#eff6ff", color: "#3b82f6", label: "Sent" },
        PARTIALLY_PAID: { bg: "#fffbeb", color: "#d97706", label: "Partial" },
        PAID: { bg: "#e8f7f1", color: "var(--accent)", label: "Paid" },
        OVERDUE: { bg: "#fef2f2", color: "var(--red)", label: "Overdue" },
        CANCELLED: { bg: "var(--surface2)", color: "var(--text3)", label: "Cancelled" },
    }
    return map[status] ?? { bg: "var(--surface2)", color: "var(--text3)", label: status }
}

// ─── Input / Label helpers ─────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
    return <label className="block text-[12px] text-[var(--text2)] mb-1">{children}</label>
}

function Input({
    value,
    onChange,
    placeholder,
    type = "text",
    required,
    className = "",
}: {
    value: string | number
    onChange: (v: string) => void
    placeholder?: string
    type?: string
    required?: boolean
    className?: string
}) {
    return (
        <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            required={required}
            className={`w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors ${className}`}
        />
    )
}

function Select({
    value,
    onChange,
    children,
    className = "",
}: {
    value: string | number
    onChange: (v: string) => void
    children: React.ReactNode
    className?: string
}) {
    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors appearance-none cursor-pointer ${className}`}
        >
            {children}
        </select>
    )
}

// ─── New Invoice Modal ─────────────────────────────────────────────────────────

function NewInvoiceModal({
    open,
    onClose,
    onSaved,
}: {
    open: boolean
    onClose: () => void
    onSaved: () => void
}) {
    const [loading, setLoading] = useState(false)
    const now = new Date()

    const defaultForm = {
        clientName: "",
        clientEmail: "",
        clientAddress: "",
        clientGST: "",
        billingMonth: now.getMonth() + 1,
        billingYear: now.getFullYear(),
        issueDate: format(now, "yyyy-MM-dd"),
        dueDate: "",
        taxRate: 18,
        notes: "",
    }

    const [form, setForm] = useState(defaultForm)
    const [items, setItems] = useState<LineItemDraft[]>([
        { description: "", employeeCount: "1", ratePerHead: "", days: "26", amount: 0 },
    ])

    useEffect(() => {
        if (open) {
            setForm(defaultForm)
            setItems([{ description: "", employeeCount: "1", ratePerHead: "", days: "26", amount: 0 }])
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const updateItem = (idx: number, field: keyof LineItemDraft, value: string) => {
        setItems(prev => {
            const next = [...prev]
            const item = { ...next[idx], [field]: value }
            const count = parseFloat(item.employeeCount) || 0
            const rate = parseFloat(item.ratePerHead) || 0
            const days = parseFloat(item.days) || 26
            item.amount = count * rate * days / 26
            next[idx] = item
            return next
        })
    }

    const addItem = () =>
        setItems(prev => [
            ...prev,
            { description: "", employeeCount: "1", ratePerHead: "", days: "26", amount: 0 },
        ])

    const removeItem = (idx: number) =>
        setItems(prev => prev.filter((_, i) => i !== idx))

    const subtotal = items.reduce((s, i) => s + i.amount, 0)
    const taxAmount = subtotal * form.taxRate / 100
    const totalAmount = subtotal + taxAmount

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (items.some(i => !i.description || !i.ratePerHead)) {
            toast.error("All line items need a description and rate per head")
            return
        }
        setLoading(true)
        try {
            const res = await fetch("/api/billing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    items: items.map(i => ({
                        description: i.description,
                        employeeCount: parseFloat(i.employeeCount) || 1,
                        ratePerHead: parseFloat(i.ratePerHead) || 0,
                        days: parseFloat(i.days) || 26,
                        amount: i.amount,
                    })),
                }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Invoice created successfully")
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to create invoice")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div
                className="bg-[var(--surface)] rounded-[16px] border border-[var(--border)] w-full max-w-2xl shadow-xl max-h-[92vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--surface)] rounded-t-[16px] z-10">
                    <h2 className="text-[15px] font-semibold text-[var(--text)]">New Invoice</h2>
                    <button
                        onClick={onClose}
                        className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-5">
                    {/* Client Info */}
                    <div>
                        <h3 className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-3">
                            Client Information
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <Label>Client Name *</Label>
                                <Input
                                    value={form.clientName}
                                    onChange={v => setForm(f => ({ ...f, clientName: v }))}
                                    placeholder="ABC Industries Ltd."
                                    required
                                />
                            </div>
                            <div>
                                <Label>Client Email</Label>
                                <Input
                                    type="email"
                                    value={form.clientEmail}
                                    onChange={v => setForm(f => ({ ...f, clientEmail: v }))}
                                    placeholder="billing@client.com"
                                />
                            </div>
                            <div>
                                <Label>Client GST No.</Label>
                                <Input
                                    value={form.clientGST}
                                    onChange={v => setForm(f => ({ ...f, clientGST: v }))}
                                    placeholder="22AAAAA0000A1Z5"
                                />
                            </div>
                            <div className="col-span-2">
                                <Label>Client Address</Label>
                                <textarea
                                    value={form.clientAddress}
                                    onChange={e => setForm(f => ({ ...f, clientAddress: e.target.value }))}
                                    placeholder="Full billing address..."
                                    className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
                                    rows={2}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Billing Period & Dates */}
                    <div>
                        <h3 className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-3">
                            Billing Period & Dates
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Billing Month *</Label>
                                <Select
                                    value={form.billingMonth}
                                    onChange={v => setForm(f => ({ ...f, billingMonth: parseInt(v) }))}
                                    className="w-full"
                                >
                                    {MONTHS.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </Select>
                            </div>
                            <div>
                                <Label>Billing Year *</Label>
                                <Select
                                    value={form.billingYear}
                                    onChange={v => setForm(f => ({ ...f, billingYear: parseInt(v) }))}
                                    className="w-full"
                                >
                                    {YEARS.map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </Select>
                            </div>
                            <div>
                                <Label>Issue Date</Label>
                                <Input
                                    type="date"
                                    value={form.issueDate}
                                    onChange={v => setForm(f => ({ ...f, issueDate: v }))}
                                />
                            </div>
                            <div>
                                <Label>Due Date *</Label>
                                <Input
                                    type="date"
                                    value={form.dueDate}
                                    onChange={v => setForm(f => ({ ...f, dueDate: v }))}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/* Line Items */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider">
                                Line Items
                            </h3>
                            <button
                                type="button"
                                onClick={addItem}
                                className="text-[12px] text-[var(--accent)] hover:underline font-medium flex items-center gap-1"
                            >
                                <Plus size={13} /> Add Row
                            </button>
                        </div>

                        <div className="rounded-[10px] border border-[var(--border)] overflow-hidden">
                            <table className="w-full text-[12px]">
                                <thead>
                                    <tr className="bg-[var(--surface2)]">
                                        <th className="text-left px-3 py-2 text-[var(--text3)] font-semibold">Description</th>
                                        <th className="text-right px-3 py-2 text-[var(--text3)] font-semibold w-16">Emp.</th>
                                        <th className="text-right px-3 py-2 text-[var(--text3)] font-semibold w-24">Rate/Head</th>
                                        <th className="text-right px-3 py-2 text-[var(--text3)] font-semibold w-14">Days</th>
                                        <th className="text-right px-3 py-2 text-[var(--text3)] font-semibold w-24">Amount</th>
                                        <th className="w-8"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, idx) => (
                                        <tr key={idx} className="border-t border-[var(--border)]">
                                            <td className="px-2 py-1.5">
                                                <input
                                                    value={item.description}
                                                    onChange={e => updateItem(idx, "description", e.target.value)}
                                                    placeholder="e.g. Security Guard Services"
                                                    className="w-full h-8 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                                                />
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={item.employeeCount}
                                                    onChange={e => updateItem(idx, "employeeCount", e.target.value)}
                                                    className="w-full h-8 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] text-[var(--text)] text-right outline-none focus:border-[var(--accent)] transition-colors"
                                                />
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={item.ratePerHead}
                                                    onChange={e => updateItem(idx, "ratePerHead", e.target.value)}
                                                    placeholder="0"
                                                    className="w-full h-8 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] text-[var(--text)] text-right outline-none focus:border-[var(--accent)] transition-colors"
                                                />
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="31"
                                                    value={item.days}
                                                    onChange={e => updateItem(idx, "days", e.target.value)}
                                                    className="w-full h-8 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] text-[var(--text)] text-right outline-none focus:border-[var(--accent)] transition-colors"
                                                />
                                            </td>
                                            <td className="px-3 py-1.5 text-right font-semibold text-[var(--text)]">
                                                {fmtShort(item.amount)}
                                            </td>
                                            <td className="px-2 py-1.5">
                                                {items.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(idx)}
                                                        className="text-[var(--text3)] hover:text-[var(--red)] transition-colors"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-[11px] text-[var(--text3)] mt-1.5">
                            Amount = Employees × Rate/Head × Days ÷ 26
                        </p>
                    </div>

                    {/* Notes & GST */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <Label>Notes</Label>
                            <textarea
                                value={form.notes}
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                placeholder="Payment terms, bank details, etc."
                                className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
                                rows={2}
                            />
                        </div>
                        <div>
                            <Label>GST Rate %</Label>
                            <Input
                                type="number"
                                value={form.taxRate}
                                onChange={v => setForm(f => ({ ...f, taxRate: parseFloat(v) || 0 }))}
                            />
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="rounded-[10px] bg-[var(--surface2)] border border-[var(--border)] p-4 space-y-2">
                        <div className="flex justify-between text-[13px] text-[var(--text2)]">
                            <span>Subtotal</span>
                            <span className="font-medium text-[var(--text)]">{fmt(subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-[13px] text-[var(--text2)]">
                            <span>GST ({form.taxRate}%)</span>
                            <span className="font-medium text-[var(--text)]">{fmt(taxAmount)}</span>
                        </div>
                        <div className="border-t border-[var(--border)] pt-2 flex justify-between text-[14px] font-bold">
                            <span className="text-[var(--text)]">Total</span>
                            <span className="text-[var(--accent)]">{fmt(totalAmount)}</span>
                        </div>
                    </div>

                    {/* Actions */}
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
                            className="h-9 px-5 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            Create Invoice
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Invoice Drawer ────────────────────────────────────────────────────────────

function InvoiceDrawer({
    invoice,
    onClose,
    onUpdated,
    isAdmin,
}: {
    invoice: Invoice | null
    onClose: () => void
    onUpdated: () => void
    isAdmin: boolean
}) {
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [detail, setDetail] = useState<Invoice | null>(null)
    const [showPayForm, setShowPayForm] = useState(false)
    const [payLoading, setPayLoading] = useState(false)
    const [actionLoading, setActionLoading] = useState(false)
    const [payForm, setPayForm] = useState<PaymentForm>({
        amount: "",
        paymentDate: format(new Date(), "yyyy-MM-dd"),
        paymentMode: "NEFT",
        referenceNo: "",
        remarks: "",
    })

    const fetchDetail = useCallback(async (id: string) => {
        setLoadingDetail(true)
        try {
            const res = await fetch(`/api/billing/${id}`)
            if (!res.ok) throw new Error("Failed to load invoice")
            const data = await res.json()
            setDetail(data)
        } catch {
            toast.error("Failed to load invoice details")
        } finally {
            setLoadingDetail(false)
        }
    }, [])

    useEffect(() => {
        if (invoice) {
            fetchDetail(invoice.id)
            setShowPayForm(false)
            setPayForm({
                amount: "",
                paymentDate: format(new Date(), "yyyy-MM-dd"),
                paymentMode: "NEFT",
                referenceNo: "",
                remarks: "",
            })
        } else {
            setDetail(null)
        }
    }, [invoice, fetchDetail])

    const handleStatusChange = async (newStatus: string) => {
        if (!detail) return
        setActionLoading(true)
        try {
            const res = await fetch(`/api/billing/${detail.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            })
            if (!res.ok) throw new Error(await res.text())
            const updated = await res.json()
            setDetail(updated)
            onUpdated()
            toast.success(`Invoice marked as ${newStatus.toLowerCase().replace("_", " ")}`)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to update status")
        } finally {
            setActionLoading(false)
        }
    }

    const handlePayment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!detail) return
        setPayLoading(true)
        try {
            const res = await fetch(`/api/billing/${detail.id}/payment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    amount: parseFloat(payForm.amount),
                    paymentDate: payForm.paymentDate,
                    paymentMode: payForm.paymentMode,
                    referenceNo: payForm.referenceNo || null,
                    remarks: payForm.remarks || null,
                }),
            })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            setDetail(data.invoice)
            setShowPayForm(false)
            setPayForm({
                amount: "",
                paymentDate: format(new Date(), "yyyy-MM-dd"),
                paymentMode: "NEFT",
                referenceNo: "",
                remarks: "",
            })
            onUpdated()
            toast.success("Payment recorded successfully")
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to record payment")
        } finally {
            setPayLoading(false)
        }
    }

    if (!invoice) return null

    const d = detail ?? invoice
    const outstanding = Math.max(0, d.totalAmount - d.paidAmount)
    const paidPct = d.totalAmount > 0 ? Math.min(100, (d.paidAmount / d.totalAmount) * 100) : 0
    const effectiveStatus = d.status !== "PAID" && d.status !== "CANCELLED" && d.status !== "DRAFT" && new Date(d.dueDate) < new Date()
        ? "OVERDUE"
        : d.status

    const badge = statusBadge(effectiveStatus)

    return (
        <div className="fixed inset-0 z-40 flex justify-end">
            {/* Backdrop */}
            <div className="flex-1 bg-black/20" onClick={onClose} />
            {/* Drawer panel */}
            <div className="w-full max-w-[480px] bg-[var(--surface)] border-l border-[var(--border)] h-full overflow-y-auto flex flex-col shadow-2xl">
                {/* Drawer header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--surface)] z-10">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-[15px] font-bold text-[var(--accent)]">{d.invoiceNo}</span>
                            <span
                                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: badge.bg, color: badge.color }}
                            >
                                {badge.label}
                            </span>
                        </div>
                        <p className="text-[13px] text-[var(--text2)]">{d.clientName}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors mt-0.5"
                    >
                        <X size={18} />
                    </button>
                </div>

                {loadingDetail && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 size={22} className="animate-spin text-[var(--text3)]" />
                    </div>
                )}

                {!loadingDetail && (
                    <div className="flex-1 px-5 py-4 space-y-5">
                        {/* Meta */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                            <div>
                                <span className="text-[var(--text3)] text-[11px] uppercase font-semibold tracking-wide">Issue Date</span>
                                <p className="text-[var(--text)] font-medium mt-0.5">
                                    {format(new Date(d.issueDate), "dd MMM yyyy")}
                                </p>
                            </div>
                            <div>
                                <span className="text-[var(--text3)] text-[11px] uppercase font-semibold tracking-wide">Due Date</span>
                                <p className={`font-medium mt-0.5 ${effectiveStatus === "OVERDUE" ? "text-[var(--red)]" : "text-[var(--text)]"}`}>
                                    {format(new Date(d.dueDate), "dd MMM yyyy")}
                                </p>
                            </div>
                            <div>
                                <span className="text-[var(--text3)] text-[11px] uppercase font-semibold tracking-wide">Billing Period</span>
                                <p className="text-[var(--text)] font-medium mt-0.5">
                                    {billingPeriod(d.billingMonth, d.billingYear)}
                                </p>
                            </div>
                            {d.clientGST && (
                                <div>
                                    <span className="text-[var(--text3)] text-[11px] uppercase font-semibold tracking-wide">GST No.</span>
                                    <p className="text-[var(--text)] font-medium mt-0.5 font-mono text-[12px]">{d.clientGST}</p>
                                </div>
                            )}
                            {d.clientAddress && (
                                <div className="col-span-2">
                                    <span className="text-[var(--text3)] text-[11px] uppercase font-semibold tracking-wide">Address</span>
                                    <p className="text-[var(--text)] mt-0.5 text-[12px] leading-relaxed">{d.clientAddress}</p>
                                </div>
                            )}
                        </div>

                        {/* Line Items */}
                        <div>
                            <h4 className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-2">Line Items</h4>
                            <div className="rounded-[10px] border border-[var(--border)] overflow-hidden">
                                <table className="w-full text-[12px]">
                                    <thead>
                                        <tr className="bg-[var(--surface2)]">
                                            <th className="text-left px-3 py-2 text-[var(--text3)] font-semibold">Description</th>
                                            <th className="text-right px-3 py-2 text-[var(--text3)] font-semibold">Emp</th>
                                            <th className="text-right px-3 py-2 text-[var(--text3)] font-semibold">Rate</th>
                                            <th className="text-right px-3 py-2 text-[var(--text3)] font-semibold">Days</th>
                                            <th className="text-right px-3 py-2 text-[var(--text3)] font-semibold">Amt</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {d.items?.map(item => (
                                            <tr key={item.id} className="border-t border-[var(--border)]">
                                                <td className="px-3 py-2 text-[var(--text)]">{item.description}</td>
                                                <td className="px-3 py-2 text-right text-[var(--text2)]">{item.employeeCount}</td>
                                                <td className="px-3 py-2 text-right text-[var(--text2)]">{fmtShort(item.ratePerHead)}</td>
                                                <td className="px-3 py-2 text-right text-[var(--text2)]">{item.days}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-[var(--text)]">{fmtShort(item.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Totals */}
                        <div className="rounded-[10px] bg-[var(--surface2)] border border-[var(--border)] p-3 space-y-1.5">
                            <div className="flex justify-between text-[13px] text-[var(--text2)]">
                                <span>Subtotal</span>
                                <span>{fmt(d.subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-[13px] text-[var(--text2)]">
                                <span>GST ({d.taxRate}%)</span>
                                <span>{fmt(d.taxAmount)}</span>
                            </div>
                            <div className="border-t border-[var(--border)] pt-1.5 flex justify-between text-[14px] font-bold">
                                <span className="text-[var(--text)]">Total</span>
                                <span className="text-[var(--accent)]">{fmt(d.totalAmount)}</span>
                            </div>
                        </div>

                        {/* Payment Progress */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider">Payment Progress</span>
                                <span className="text-[12px] font-semibold text-[var(--text)]">
                                    {fmtShort(d.paidAmount)} / {fmtShort(d.totalAmount)}
                                </span>
                            </div>
                            <div className="h-2 rounded-full bg-[var(--surface2)] overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${paidPct}%`,
                                        background: paidPct >= 100 ? "var(--accent)" : "#d97706",
                                    }}
                                />
                            </div>
                            <div className="flex justify-between mt-1 text-[11px] text-[var(--text3)]">
                                <span>{paidPct.toFixed(0)}% paid</span>
                                {outstanding > 0 && <span className="text-[var(--amber)]">{fmtShort(outstanding)} outstanding</span>}
                            </div>
                        </div>

                        {/* Payment History */}
                        {d.payments && d.payments.length > 0 && (
                            <div>
                                <h4 className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-2">
                                    Payment History
                                </h4>
                                <div className="space-y-2">
                                    {d.payments.map(p => (
                                        <div
                                            key={p.id}
                                            className="flex items-start justify-between py-2 px-3 rounded-[8px] bg-[var(--surface2)] border border-[var(--border)]"
                                        >
                                            <div>
                                                <p className="text-[12px] font-semibold text-[var(--text)]">{fmt(p.amount)}</p>
                                                <p className="text-[11px] text-[var(--text3)] mt-0.5">
                                                    {format(new Date(p.paymentDate), "dd MMM yyyy")} · {p.paymentMode}
                                                    {p.referenceNo && ` · ${p.referenceNo}`}
                                                </p>
                                                {p.remarks && (
                                                    <p className="text-[11px] text-[var(--text3)] mt-0.5 italic">{p.remarks}</p>
                                                )}
                                            </div>
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#e8f7f1] text-[var(--accent)]">
                                                {p.paymentMode}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        {d.notes && (
                            <div>
                                <h4 className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-1">Notes</h4>
                                <p className="text-[13px] text-[var(--text2)] leading-relaxed">{d.notes}</p>
                            </div>
                        )}

                        {/* Record Payment Form */}
                        {showPayForm && (
                            <div className="rounded-[10px] border border-[var(--border)] p-4 bg-[var(--surface2)]">
                                <h4 className="text-[12px] font-semibold text-[var(--text)] mb-3">Record Payment</h4>
                                <form onSubmit={handlePayment} className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label>Amount (₹) *</Label>
                                            <Input
                                                type="number"
                                                value={payForm.amount}
                                                onChange={v => setPayForm(f => ({ ...f, amount: v }))}
                                                placeholder="0.00"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <Label>Payment Date *</Label>
                                            <Input
                                                type="date"
                                                value={payForm.paymentDate}
                                                onChange={v => setPayForm(f => ({ ...f, paymentDate: v }))}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <Label>Payment Mode *</Label>
                                            <Select
                                                value={payForm.paymentMode}
                                                onChange={v => setPayForm(f => ({ ...f, paymentMode: v }))}
                                                className="w-full"
                                            >
                                                {PAYMENT_MODES.map(m => (
                                                    <option key={m} value={m}>{m}</option>
                                                ))}
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Reference No.</Label>
                                            <Input
                                                value={payForm.referenceNo}
                                                onChange={v => setPayForm(f => ({ ...f, referenceNo: v }))}
                                                placeholder="UTR / Cheque No."
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <Label>Remarks</Label>
                                        <input
                                            value={payForm.remarks}
                                            onChange={e => setPayForm(f => ({ ...f, remarks: e.target.value }))}
                                            placeholder="Optional remarks"
                                            className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowPayForm(false)}
                                            className="flex-1 h-9 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text2)] hover:bg-[var(--surface)] transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={payLoading}
                                            className="flex-1 h-9 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
                                        >
                                            {payLoading && <Loader2 size={13} className="animate-spin" />}
                                            Save Payment
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2 pt-1 pb-4">
                            {(isAdmin) && d.status !== "PAID" && d.status !== "CANCELLED" && (
                                <button
                                    onClick={() => setShowPayForm(!showPayForm)}
                                    className="flex items-center gap-1.5 h-8 px-3 rounded-[8px] bg-[var(--accent)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                                >
                                    <CreditCard size={13} />
                                    Record Payment
                                </button>
                            )}
                            {d.status === "DRAFT" && (
                                <button
                                    onClick={() => handleStatusChange("SENT")}
                                    disabled={actionLoading}
                                    className="flex items-center gap-1.5 h-8 px-3 rounded-[8px] border border-[#3b82f6] text-[#3b82f6] text-[12px] font-medium hover:bg-[#eff6ff] transition-colors disabled:opacity-50"
                                >
                                    <Send size={13} />
                                    Mark as Sent
                                </button>
                            )}
                            {d.status !== "CANCELLED" && d.status !== "PAID" && (
                                <button
                                    onClick={() => handleStatusChange("CANCELLED")}
                                    disabled={actionLoading}
                                    className="flex items-center gap-1.5 h-8 px-3 rounded-[8px] border border-[var(--border)] text-[var(--text3)] text-[12px] hover:text-[var(--red)] hover:border-[var(--red)] transition-colors disabled:opacity-50"
                                >
                                    <Ban size={13} />
                                    Cancel Invoice
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Row Actions Menu ──────────────────────────────────────────────────────────

function RowMenu({
    invoice,
    isAdmin,
    onView,
    onMarkSent,
    onRecordPayment,
    onDelete,
}: {
    invoice: Invoice
    isAdmin: boolean
    onView: () => void
    onMarkSent: () => void
    onRecordPayment: () => void
    onDelete: () => void
}) {
    const [open, setOpen] = useState(false)
    const effectiveStatus = invoice.status !== "PAID" && invoice.status !== "CANCELLED" && invoice.status !== "DRAFT"
        && new Date(invoice.dueDate) < new Date()
        ? "OVERDUE"
        : invoice.status

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="p-1 rounded-md text-[var(--text3)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors"
            >
                <MoreVertical size={15} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-7 z-20 w-44 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-lg py-1">
                        <button
                            onClick={() => { setOpen(false); onView() }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
                        >
                            <FileText size={13} className="text-[var(--text3)]" />
                            View Details
                        </button>
                        {effectiveStatus === "DRAFT" && (
                            <button
                                onClick={() => { setOpen(false); onMarkSent() }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
                            >
                                <Send size={13} className="text-[var(--text3)]" />
                                Mark as Sent
                            </button>
                        )}
                        {isAdmin && effectiveStatus !== "PAID" && effectiveStatus !== "CANCELLED" && (
                            <button
                                onClick={() => { setOpen(false); onRecordPayment() }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
                            >
                                <CreditCard size={13} className="text-[var(--text3)]" />
                                Record Payment
                            </button>
                        )}
                        {isAdmin && invoice.status === "DRAFT" && (
                            <>
                                <div className="h-px bg-[var(--border)] my-1" />
                                <button
                                    onClick={() => { setOpen(false); onDelete() }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--red)] hover:bg-[#fef2f2] transition-colors"
                                >
                                    <Trash2 size={13} />
                                    Delete Invoice
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
    const { data: session } = useSession()
    const router = useRouter()

    const role = session?.user?.role
    const isAdmin = role === "ADMIN"
    const isPrivileged = isAdmin || role === "MANAGER"

    const now = new Date()
    const [invoices, setInvoices] = useState<Invoice[]>([])
    const [loading, setLoading] = useState(true)
    const [filterStatus, setFilterStatus] = useState("ALL")
    const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1)
    const [filterYear, setFilterYear] = useState(now.getFullYear())
    const [search, setSearch] = useState("")
    const [showNew, setShowNew] = useState(false)
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

    useEffect(() => {
        if (session && !isPrivileged) {
            router.push("/")
        }
    }, [session, isPrivileged, router])

    const fetchInvoices = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (filterStatus !== "ALL") params.set("status", filterStatus)
            if (filterMonth) params.set("month", String(filterMonth))
            if (filterYear) params.set("year", String(filterYear))
            if (search.trim()) params.set("search", search.trim())
            const res = await fetch(`/api/billing?${params}`)
            if (!res.ok) throw new Error("Failed to fetch invoices")
            const data = await res.json()
            setInvoices(data)
        } catch {
            toast.error("Failed to load invoices")
        } finally {
            setLoading(false)
        }
    }, [filterStatus, filterMonth, filterYear, search])

    useEffect(() => {
        if (isPrivileged) fetchInvoices()
    }, [isPrivileged, fetchInvoices])

    const handleMarkSent = async (inv: Invoice) => {
        try {
            const res = await fetch(`/api/billing/${inv.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "SENT" }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Invoice marked as Sent")
            fetchInvoices()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to update invoice")
        }
    }

    const handleDelete = async (inv: Invoice) => {
        if (!window.confirm(`Delete invoice ${inv.invoiceNo}? This cannot be undone.`)) return
        try {
            const res = await fetch(`/api/billing/${inv.id}`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Invoice deleted")
            fetchInvoices()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to delete invoice")
        }
    }

    // Stats for this month
    const thisMonthInvoices = invoices.filter(
        i => i.billingMonth === filterMonth && i.billingYear === filterYear
    )
    const totalInvoiced = thisMonthInvoices.reduce((s, i) => s + i.totalAmount, 0)
    const totalPaid = thisMonthInvoices
        .filter(i => i.status === "PAID")
        .reduce((s, i) => s + i.totalAmount, 0)
    const totalOutstanding = thisMonthInvoices
        .filter(i => i.status !== "PAID" && i.status !== "CANCELLED")
        .reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0)
    const overdueCount = invoices.filter(
        i => (i.effectiveStatus === "OVERDUE") ||
            (i.status !== "PAID" && i.status !== "CANCELLED" && i.status !== "DRAFT" && new Date(i.dueDate) < now)
    ).length

    if (!isPrivileged) return null

    return (
        <div className="min-h-screen bg-[var(--surface2)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
                {/* Page Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-[10px] bg-[var(--accent-light)] flex items-center justify-center">
                            <Receipt size={18} className="text-[var(--accent)]" />
                        </div>
                        <div>
                            <h1 className="text-[18px] font-bold text-[var(--text)]">Billing & Invoicing</h1>
                            <p className="text-[12px] text-[var(--text3)]">Manage client invoices and payment tracking</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowNew(true)}
                        className="flex items-center gap-2 h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity shadow-sm"
                    >
                        <Plus size={15} />
                        New Invoice
                    </button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-[var(--surface)] rounded-[12px] border border-[var(--border)] p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Total Invoiced</span>
                            <TrendingUp size={15} className="text-[var(--accent)]" />
                        </div>
                        <p className="text-[18px] font-bold text-[var(--accent)]">{fmtShort(totalInvoiced)}</p>
                        <p className="text-[11px] text-[var(--text3)] mt-0.5">{billingPeriod(filterMonth, filterYear)}</p>
                    </div>
                    <div className="bg-[var(--surface)] rounded-[12px] border border-[var(--border)] p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Paid</span>
                            <CheckCircle2 size={15} className="text-[var(--accent)]" />
                        </div>
                        <p className="text-[18px] font-bold text-[var(--accent)]">{fmtShort(totalPaid)}</p>
                        <p className="text-[11px] text-[var(--text3)] mt-0.5">Fully settled</p>
                    </div>
                    <div className="bg-[var(--surface)] rounded-[12px] border border-[var(--border)] p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Outstanding</span>
                            <Clock size={15} className="text-[#d97706]" />
                        </div>
                        <p className="text-[18px] font-bold text-[#d97706]">{fmtShort(totalOutstanding)}</p>
                        <p className="text-[11px] text-[var(--text3)] mt-0.5">Pending payment</p>
                    </div>
                    <div className="bg-[var(--surface)] rounded-[12px] border border-[var(--border)] p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Overdue</span>
                            <AlertTriangle size={15} className="text-[var(--red)]" />
                        </div>
                        <p className="text-[18px] font-bold text-[var(--red)]">{overdueCount}</p>
                        <p className="text-[11px] text-[var(--text3)] mt-0.5">Invoices past due</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-[var(--surface)] rounded-[12px] border border-[var(--border)] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {/* Status Pills */}
                        <div className="flex flex-wrap gap-1.5">
                            {STATUS_FILTERS.map(f => (
                                <button
                                    key={f.value}
                                    onClick={() => setFilterStatus(f.value)}
                                    className={`h-7 px-3 rounded-full text-[12px] font-medium transition-colors ${
                                        filterStatus === f.value
                                            ? "bg-[var(--accent)] text-white"
                                            : "bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--border)]"
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        {/* Month / Year + Search */}
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Select
                                    value={filterMonth}
                                    onChange={v => setFilterMonth(parseInt(v))}
                                    className="pr-7"
                                >
                                    {MONTHS.map(m => (
                                        <option key={m.value} value={m.value}>{m.label.slice(0, 3)}</option>
                                    ))}
                                </Select>
                                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                            </div>
                            <div className="relative">
                                <Select
                                    value={filterYear}
                                    onChange={v => setFilterYear(parseInt(v))}
                                    className="pr-7"
                                >
                                    {YEARS.map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </Select>
                                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                            </div>
                            <div className="relative">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search client / invoice..."
                                    className="h-9 pl-8 pr-3 w-48 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)] text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Invoice Table */}
                <div className="bg-[var(--surface)] rounded-[12px] border border-[var(--border)] overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 size={24} className="animate-spin text-[var(--text3)]" />
                        </div>
                    ) : invoices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="h-12 w-12 rounded-[12px] bg-[var(--surface2)] flex items-center justify-center mb-3">
                                <IndianRupee size={22} className="text-[var(--text3)]" />
                            </div>
                            <p className="text-[14px] font-medium text-[var(--text)]">No invoices found</p>
                            <p className="text-[12px] text-[var(--text3)] mt-1">
                                {search ? "Try a different search term" : "Create your first invoice to get started"}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="border-b border-[var(--border)] bg-[var(--surface2)]">
                                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Invoice No</th>
                                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Client</th>
                                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide hidden md:table-cell">Period</th>
                                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide hidden lg:table-cell">Issue Date</th>
                                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide hidden lg:table-cell">Due Date</th>
                                        <th className="text-right px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Amount</th>
                                        <th className="text-right px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide hidden sm:table-cell">Paid</th>
                                        <th className="text-center px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Status</th>
                                        <th className="w-10 px-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoices.map(inv => {
                                        const effectiveStatus = inv.status !== "PAID" && inv.status !== "CANCELLED" && inv.status !== "DRAFT"
                                            && new Date(inv.dueDate) < now
                                            ? "OVERDUE"
                                            : inv.status
                                        const badge = statusBadge(effectiveStatus)
                                        const isCancelled = inv.status === "CANCELLED"

                                        return (
                                            <tr
                                                key={inv.id}
                                                className="border-b border-[var(--border)] hover:bg-[var(--surface2)] transition-colors cursor-pointer"
                                                onClick={() => setSelectedInvoice(inv)}
                                            >
                                                <td className="px-4 py-3">
                                                    <span className={`font-mono font-semibold text-[var(--accent)] ${isCancelled ? "line-through opacity-60" : ""}`}>
                                                        {inv.invoiceNo}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className={`font-medium text-[var(--text)] ${isCancelled ? "line-through opacity-60" : ""}`}>
                                                        {inv.clientName}
                                                    </p>
                                                    {inv.clientEmail && (
                                                        <p className="text-[11px] text-[var(--text3)] hidden sm:block">{inv.clientEmail}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">
                                                    {billingPeriod(inv.billingMonth, inv.billingYear)}
                                                </td>
                                                <td className="px-4 py-3 text-[var(--text2)] hidden lg:table-cell">
                                                    {format(new Date(inv.issueDate), "dd MMM yyyy")}
                                                </td>
                                                <td className={`px-4 py-3 hidden lg:table-cell ${effectiveStatus === "OVERDUE" ? "text-[var(--red)] font-medium" : "text-[var(--text2)]"}`}>
                                                    {format(new Date(inv.dueDate), "dd MMM yyyy")}
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold text-[var(--text)]">
                                                    {fmt(inv.totalAmount)}
                                                </td>
                                                <td className="px-4 py-3 text-right text-[var(--text2)] hidden sm:table-cell">
                                                    {inv.paidAmount > 0 ? fmt(inv.paidAmount) : "—"}
                                                </td>
                                                <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                    <span
                                                        className="text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap"
                                                        style={{ background: badge.bg, color: badge.color }}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                                                    <RowMenu
                                                        invoice={inv}
                                                        isAdmin={isAdmin}
                                                        onView={() => setSelectedInvoice(inv)}
                                                        onMarkSent={() => handleMarkSent(inv)}
                                                        onRecordPayment={() => {
                                                            setSelectedInvoice(inv)
                                                        }}
                                                        onDelete={() => handleDelete(inv)}
                                                    />
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer count */}
                {!loading && invoices.length > 0 && (
                    <p className="text-[12px] text-[var(--text3)] text-right">
                        Showing {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
                    </p>
                )}
            </div>

            {/* New Invoice Modal */}
            <NewInvoiceModal
                open={showNew}
                onClose={() => setShowNew(false)}
                onSaved={fetchInvoices}
            />

            {/* Invoice Detail Drawer */}
            <InvoiceDrawer
                invoice={selectedInvoice}
                onClose={() => setSelectedInvoice(null)}
                onUpdated={fetchInvoices}
                isAdmin={isAdmin}
            />
        </div>
    )
}
