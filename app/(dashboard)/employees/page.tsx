"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, Search, UserCheck, X, Loader2, Users,
    Calendar, TrendingDown, Edit2, Eye, ChevronDown,
    CheckCircle, Clock, Building2, Briefcase, Phone, Mail,
    FileText, IndianRupee, MoreVertical, ShieldOff, Trash2,
    User, CreditCard, MapPin, LogOut
} from "lucide-react"
import { format } from "date-fns"

// ─── Types ────────────────────────────────────────────────────────────────────

type Employee = {
    id: string
    employeeId: string
    firstName: string
    lastName: string
    email?: string
    phone: string
    alternatePhone?: string
    designation?: string
    branchId: string
    departmentId?: string
    status: string
    employmentType: string
    salaryType?: string
    basicSalary: number
    dateOfJoining?: string
    dateOfLeaving?: string
    dateOfBirth?: string
    gender?: string
    address?: string
    city?: string
    state?: string
    pincode?: string
    aadharNumber?: string
    panNumber?: string
    bankAccountNumber?: string
    bankIFSC?: string
    bankName?: string
    managerId?: string
    notes?: string
    photo?: string
    createdAt: string
    branch: { id: string; name: string }
    department?: { id: string; name: string }
    _count: { attendances: number; leaves: number }
}

type Branch = { id: string; name: string; companyId?: string }
type Department = { id: string; name: string; branchId: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    ACTIVE: { label: "Active", color: "#1a9e6e", bg: "#e8f7f1", border: "#6ee7b7" },
    INACTIVE: { label: "Inactive", color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
    ON_LEAVE: { label: "On Leave", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
    TERMINATED: { label: "Terminated", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    RESIGNED: { label: "Resigned", color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe" },
}

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Daily Wage"]
const SALARY_TYPES = ["Monthly", "Daily", "Hourly"]

const AVATAR_COLORS = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#f97316"]

function getAvatarColor(firstName: string, lastName: string) {
    const idx = (firstName.charCodeAt(0) + (lastName.charCodeAt(0) || 0)) % AVATAR_COLORS.length
    return AVATAR_COLORS[idx]
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ firstName, lastName, photo, size = 40 }: {
    firstName: string; lastName: string; photo?: string; size?: number
}) {
    const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase()
    const bg = getAvatarColor(firstName, lastName)

    if (photo) {
        return (
            <img
                src={photo}
                alt={`${firstName} ${lastName}`}
                style={{ width: size, height: size }}
                className="rounded-full object-cover shrink-0"
            />
        )
    }
    return (
        <div
            style={{ width: size, height: size, background: bg, fontSize: size * 0.33 }}
            className="rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none"
        >
            {initials}
        </div>
    )
}

// ─── Mask helpers ─────────────────────────────────────────────────────────────

function maskAadhar(v?: string) {
    if (!v) return "—"
    return `XXXX-XXXX-${v.slice(-4)}`
}
function maskPAN(v?: string) {
    if (!v) return "—"
    return `XXXXX${v.slice(-5)}`
}
function maskBank(v?: string) {
    if (!v) return "—"
    return `XXXXXX${v.slice(-4)}`
}
function fmtRupee(n?: number) {
    if (n === undefined || n === null) return "—"
    return `₹${n.toLocaleString("en-IN")}`
}
function getMonthName(m: number) {
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] || ""
}

// ─── Info Item ────────────────────────────────────────────────────────────────

function InfoItem({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2 p-3 rounded-[10px] bg-[var(--surface2)]/40 border border-[var(--border)]">
            {icon && <span className="text-[var(--text3)] mt-0.5 shrink-0">{icon}</span>}
            <div className="min-w-0">
                <p className="text-[10.5px] text-[var(--text3)] font-medium uppercase tracking-[0.4px]">{label}</p>
                <p className="text-[13px] text-[var(--text)] font-medium break-all">{value || "—"}</p>
            </div>
        </div>
    )
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────

type ModalForm = {
    firstName: string; lastName: string; email: string; phone: string; alternatePhone: string
    dateOfBirth: string; gender: string; aadharNumber: string; panNumber: string
    designation: string; departmentId: string; branchId: string; managerId: string
    dateOfJoining: string; employmentType: string; salaryType: string; basicSalary: string
    address: string; city: string; state: string; pincode: string
    bankName: string; bankAccountNumber: string; bankIFSC: string
    status: string; notes: string
}

const EMPTY_FORM: ModalForm = {
    firstName: "", lastName: "", email: "", phone: "", alternatePhone: "",
    dateOfBirth: "", gender: "", aadharNumber: "", panNumber: "",
    designation: "", departmentId: "", branchId: "", managerId: "",
    dateOfJoining: "", employmentType: "Full-time", salaryType: "Monthly", basicSalary: "",
    address: "", city: "", state: "", pincode: "",
    bankName: "", bankAccountNumber: "", bankIFSC: "",
    status: "ACTIVE", notes: ""
}

function EmployeeModal({
    open, onClose, onSaved, branches, employee,
}: {
    open: boolean; onClose: () => void; onSaved: () => void; branches: Branch[]; employee?: Employee | null
}) {
    const [loading, setLoading] = useState(false)
    const [departments, setDepartments] = useState<Department[]>([])
    const [activeTab, setActiveTab] = useState<"personal" | "employment" | "bank">("personal")
    const [form, setForm] = useState<ModalForm>(EMPTY_FORM)

    useEffect(() => {
        if (!open) return
        setActiveTab("personal")
        if (employee) {
            setForm({
                firstName: employee.firstName,
                lastName: employee.lastName,
                email: employee.email || "",
                phone: employee.phone,
                alternatePhone: employee.alternatePhone || "",
                dateOfBirth: employee.dateOfBirth ? employee.dateOfBirth.split("T")[0] : "",
                gender: employee.gender || "",
                aadharNumber: employee.aadharNumber || "",
                panNumber: employee.panNumber || "",
                designation: employee.designation || "",
                departmentId: employee.departmentId || "",
                branchId: employee.branchId,
                managerId: employee.managerId || "",
                dateOfJoining: employee.dateOfJoining ? employee.dateOfJoining.split("T")[0] : "",
                employmentType: employee.employmentType,
                salaryType: employee.salaryType || "Monthly",
                basicSalary: employee.basicSalary.toString(),
                address: employee.address || "",
                city: employee.city || "",
                state: employee.state || "",
                pincode: employee.pincode || "",
                bankName: employee.bankName || "",
                bankAccountNumber: employee.bankAccountNumber || "",
                bankIFSC: employee.bankIFSC || "",
                status: employee.status,
                notes: employee.notes || "",
            })
        } else {
            setForm(EMPTY_FORM)
        }
    }, [employee, open])

    useEffect(() => {
        if (form.branchId) {
            fetch(`/api/departments?branchId=${form.branchId}`)
                .then(r => r.json())
                .then(data => setDepartments(Array.isArray(data) ? data : []))
                .catch(() => setDepartments([]))
        } else {
            setDepartments([])
        }
    }, [form.branchId])

    const set = (key: keyof ModalForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()) {
            toast.error("First name, last name and phone are required")
            return
        }
        if (!form.branchId) {
            toast.error("Branch is required")
            return
        }
        setLoading(true)
        try {
            const url = employee ? `/api/employees/${employee.id}` : "/api/employees"
            const method = employee ? "PUT" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(employee ? "Employee updated!" : "Employee added!")
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to save")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null

    const tabCls = (t: string) =>
        `px-4 py-2.5 text-[12px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${activeTab === t
            ? "border-[var(--accent)] text-[var(--accent-text)]"
            : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"
        }`
    const inputCls = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
    const labelCls = "block text-[12px] text-[var(--text2)] mb-1"

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                    <h2 className="text-[16px] font-semibold text-[var(--text)]">
                        {employee ? "Edit Employee" : "Add New Employee"}
                    </h2>
                    <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text)] p-1 rounded-md hover:bg-[var(--surface2)] transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[var(--border)] px-6">
                    {(["personal", "employment", "bank"] as const).map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={tabCls(t)}>
                            {t === "personal" ? "Personal Info" : t === "employment" ? "Employment" : "Bank & Address"}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5">
                    {/* Personal Tab */}
                    {activeTab === "personal" && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>First Name *</label>
                                    <input value={form.firstName} onChange={set("firstName")} className={inputCls} placeholder="First name" required />
                                </div>
                                <div>
                                    <label className={labelCls}>Last Name *</label>
                                    <input value={form.lastName} onChange={set("lastName")} className={inputCls} placeholder="Last name" required />
                                </div>
                                <div>
                                    <label className={labelCls}>Phone *</label>
                                    <input value={form.phone} onChange={set("phone")} className={inputCls} placeholder="Phone number" required />
                                </div>
                                <div>
                                    <label className={labelCls}>Email</label>
                                    <input type="email" value={form.email} onChange={set("email")} className={inputCls} placeholder="Email address" />
                                </div>
                                <div>
                                    <label className={labelCls}>Alternate Phone</label>
                                    <input value={form.alternatePhone} onChange={set("alternatePhone")} className={inputCls} placeholder="Alternate phone" />
                                </div>
                                <div>
                                    <label className={labelCls}>Date of Birth</label>
                                    <input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Gender</label>
                                    <select value={form.gender} onChange={set("gender")} className={inputCls}>
                                        <option value="">Select</option>
                                        <option value="MALE">Male</option>
                                        <option value="FEMALE">Female</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Aadhar Number</label>
                                    <input value={form.aadharNumber} onChange={set("aadharNumber")} className={inputCls} placeholder="XXXX XXXX XXXX" />
                                </div>
                                <div>
                                    <label className={labelCls}>PAN Number</label>
                                    <input value={form.panNumber} onChange={set("panNumber")} className={inputCls} placeholder="XXXXX0000X" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Employment Tab */}
                    {activeTab === "employment" && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Branch *</label>
                                    <select value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value, departmentId: "" }))} className={inputCls} required>
                                        <option value="">Select Branch</option>
                                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Designation</label>
                                    <input value={form.designation} onChange={set("designation")} className={inputCls} placeholder="e.g. Security Guard" />
                                </div>
                                <div>
                                    <label className={labelCls}>Department</label>
                                    <select value={form.departmentId} onChange={set("departmentId")} className={inputCls}>
                                        <option value="">No Department</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Manager</label>
                                    <input value={form.managerId} onChange={set("managerId")} className={inputCls} placeholder="Manager name or ID" />
                                </div>
                                <div>
                                    <label className={labelCls}>Date of Joining</label>
                                    <input type="date" value={form.dateOfJoining} onChange={set("dateOfJoining")} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Employment Type</label>
                                    <select value={form.employmentType} onChange={set("employmentType")} className={inputCls}>
                                        {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Salary Type</label>
                                    <select value={form.salaryType} onChange={set("salaryType")} className={inputCls}>
                                        {SALARY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Basic Salary (₹)</label>
                                    <input type="number" value={form.basicSalary} onChange={set("basicSalary")} className={inputCls} placeholder="0" min="0" />
                                </div>
                                <div>
                                    <label className={labelCls}>Status</label>
                                    <select value={form.status} onChange={set("status")} className={inputCls}>
                                        {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>Notes</label>
                                <textarea value={form.notes} onChange={set("notes")} className="w-full rounded-[8px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none" rows={3} placeholder="Additional notes..." />
                            </div>
                        </div>
                    )}

                    {/* Bank & Address Tab */}
                    {activeTab === "bank" && (
                        <div className="space-y-4">
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase">Address</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className={labelCls}>Address</label>
                                    <input value={form.address} onChange={set("address")} className={inputCls} placeholder="Street address" />
                                </div>
                                <div>
                                    <label className={labelCls}>City</label>
                                    <input value={form.city} onChange={set("city")} className={inputCls} placeholder="City" />
                                </div>
                                <div>
                                    <label className={labelCls}>State</label>
                                    <input value={form.state} onChange={set("state")} className={inputCls} placeholder="State" />
                                </div>
                                <div>
                                    <label className={labelCls}>Pincode</label>
                                    <input value={form.pincode} onChange={set("pincode")} className={inputCls} placeholder="Pincode" />
                                </div>
                            </div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase mt-2">Bank Details</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Bank Name</label>
                                    <input value={form.bankName} onChange={set("bankName")} className={inputCls} placeholder="Bank name" />
                                </div>
                                <div>
                                    <label className={labelCls}>IFSC Code</label>
                                    <input value={form.bankIFSC} onChange={set("bankIFSC")} className={inputCls} placeholder="IFSC code" />
                                </div>
                                <div className="col-span-2">
                                    <label className={labelCls}>Account Number</label>
                                    <input value={form.bankAccountNumber} onChange={set("bankAccountNumber")} className={inputCls} placeholder="Account number" />
                                </div>
                            </div>
                        </div>
                    )}
                </form>

                <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
                    <div className="flex gap-1">
                        {(["personal", "employment", "bank"] as const).map((t, i) => (
                            <div
                                key={t}
                                onClick={() => setActiveTab(t)}
                                className={`h-1.5 rounded-full cursor-pointer transition-all ${activeTab === t ? "w-6 bg-[var(--accent)]" : "w-1.5 bg-[var(--border)]"}`}
                            />
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} type="button" className="px-4 py-2 text-[13px] font-medium text-[var(--text2)] hover:text-[var(--text)] rounded-[8px] hover:bg-[var(--surface2)] transition-colors">
                            Cancel
                        </button>
                        {activeTab !== "bank" ? (
                            <button
                                type="button"
                                onClick={() => setActiveTab(activeTab === "personal" ? "employment" : "bank")}
                                className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity"
                            >
                                Next
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                                {loading && <Loader2 size={14} className="animate-spin" />}
                                {employee ? "Save Changes" : "Add Employee"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Employee Detail Drawer ────────────────────────────────────────────────────

function EmployeeDrawer({
    employee, onClose, onEdit, onStatusChange, isAdmin,
}: {
    employee: Employee | null
    onClose: () => void
    onEdit: (e: Employee) => void
    onStatusChange: (id: string, status: string) => void
    isAdmin: boolean
}) {
    const [activeTab, setActiveTab] = useState<"personal" | "employment" | "bank">("personal")
    const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [statusMenuOpen, setStatusMenuOpen] = useState(false)
    const statusRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleOutside(e: MouseEvent) {
            if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
                setStatusMenuOpen(false)
            }
        }
        document.addEventListener("mousedown", handleOutside)
        return () => document.removeEventListener("mousedown", handleOutside)
    }, [])

    useEffect(() => {
        if (employee) {
            setLoadingDetail(true)
            setActiveTab("personal")
            setDetail(null)
            fetch(`/api/employees/${employee.id}`)
                .then(r => r.json())
                .then(setDetail)
                .catch(() => setDetail(null))
                .finally(() => setLoadingDetail(false))
        }
    }, [employee])

    if (!employee) return null

    const status = STATUS_CONFIG[employee.status] || STATUS_CONFIG.ACTIVE
    const emp = (detail as Employee | null) || employee

    const tabCls = (t: string) =>
        `px-3 py-3 text-[12px] font-medium border-b-2 -mb-px transition-colors ${activeTab === t
            ? "border-[var(--accent)] text-[var(--accent-text)]"
            : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"
        }`

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/40" onClick={onClose} />
            <div className="w-full max-w-[480px] bg-white h-full overflow-hidden flex flex-col shadow-2xl border-l border-[var(--border)]">
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b border-[var(--border)]">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <Avatar firstName={employee.firstName} lastName={employee.lastName} photo={employee.photo} size={52} />
                            <div>
                                <h3 className="text-[16px] font-semibold text-[var(--text)]">
                                    {employee.firstName} {employee.lastName}
                                </h3>
                                <p className="text-[12px] font-mono text-[var(--accent-text)] mt-0.5">{employee.employeeId}</p>
                                {employee.designation && (
                                    <p className="text-[12px] text-[var(--text3)] mt-0.5">{employee.designation}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span
                                style={{ color: status.color, background: status.bg, borderColor: status.border }}
                                className="px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap"
                            >
                                {status.label}
                            </span>
                            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-[var(--surface2)] text-[var(--text3)] transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { icon: <Building2 size={12} />, label: "Department", value: employee.department?.name || "—" },
                            { icon: <Briefcase size={12} />, label: "Designation", value: employee.designation || "—" },
                            {
                                icon: <Calendar size={12} />,
                                label: "Joined",
                                value: employee.dateOfJoining ? format(new Date(employee.dateOfJoining), "dd MMM yyyy") : "—"
                            },
                            { icon: <IndianRupee size={12} />, label: "Salary", value: fmtRupee(employee.basicSalary) },
                        ].map(s => (
                            <div key={s.label} className="flex items-center gap-1.5 bg-[var(--surface2)]/40 rounded-[8px] px-2.5 py-2 border border-[var(--border)]">
                                <span className="text-[var(--text3)]">{s.icon}</span>
                                <div className="min-w-0">
                                    <p className="text-[9.5px] text-[var(--text3)] font-medium uppercase tracking-[0.3px]">{s.label}</p>
                                    <p className="text-[11.5px] text-[var(--text)] font-semibold truncate">{s.value}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[var(--border)] px-5">
                    {(["personal", "employment", "bank"] as const).map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={tabCls(t)}>
                            {t === "personal" ? "Personal" : t === "employment" ? "Employment" : "Bank"}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {loadingDetail ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                        </div>
                    ) : activeTab === "personal" ? (
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <InfoItem label="Date of Birth" value={emp.dateOfBirth ? format(new Date(emp.dateOfBirth), "dd MMM yyyy") : "—"} icon={<Calendar size={13} />} />
                                <InfoItem label="Gender" value={emp.gender || "—"} icon={<User size={13} />} />
                                <InfoItem label="Phone" value={emp.phone} icon={<Phone size={13} />} />
                                <InfoItem label="Alt. Phone" value={emp.alternatePhone || "—"} icon={<Phone size={13} />} />
                                <InfoItem label="Email" value={emp.email || "—"} icon={<Mail size={13} />} />
                                <InfoItem label="Aadhar" value={maskAadhar(emp.aadharNumber)} icon={<FileText size={13} />} />
                                <InfoItem label="PAN" value={maskPAN(emp.panNumber)} icon={<FileText size={13} />} />
                            </div>
                            {(emp.address || emp.city || emp.state) && (
                                <InfoItem
                                    label="Address"
                                    value={[emp.address, emp.city, emp.state, emp.pincode].filter(Boolean).join(", ")}
                                    icon={<MapPin size={13} />}
                                />
                            )}
                        </div>
                    ) : activeTab === "employment" ? (
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <InfoItem label="Employment Type" value={emp.employmentType} icon={<Briefcase size={13} />} />
                                <InfoItem label="Salary Type" value={emp.salaryType || "—"} icon={<IndianRupee size={13} />} />
                                <InfoItem label="Basic Salary" value={fmtRupee(emp.basicSalary)} icon={<IndianRupee size={13} />} />
                                <InfoItem label="Manager" value={emp.managerId || "—"} icon={<User size={13} />} />
                                <InfoItem
                                    label="Date of Joining"
                                    value={emp.dateOfJoining ? format(new Date(emp.dateOfJoining), "dd MMM yyyy") : "—"}
                                    icon={<Calendar size={13} />}
                                />
                                <InfoItem label="Branch" value={employee.branch.name} icon={<Building2 size={13} />} />
                            </div>
                            {emp.notes && (
                                <div className="p-3 rounded-[10px] bg-[var(--surface2)]/40 border border-[var(--border)]">
                                    <p className="text-[10.5px] text-[var(--text3)] font-medium uppercase tracking-[0.4px] mb-1">Notes</p>
                                    <p className="text-[13px] text-[var(--text)]">{emp.notes}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <InfoItem label="Bank Name" value={emp.bankName || "—"} icon={<CreditCard size={13} />} />
                                <InfoItem label="IFSC Code" value={emp.bankIFSC || "—"} icon={<FileText size={13} />} />
                                <InfoItem label="Account No." value={maskBank(emp.bankAccountNumber)} icon={<CreditCard size={13} />} />
                            </div>
                            <div className="mt-3 p-3 rounded-[10px] bg-[#fffbeb] border border-[#fde68a]">
                                <p className="text-[11px] text-[#92400e]">Account number is partially masked for security. Edit employee to update bank details.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Footer */}
                <div className="px-5 py-4 border-t border-[var(--border)] flex items-center gap-2">
                    <button
                        onClick={() => onEdit(employee)}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity"
                    >
                        <Edit2 size={14} /> Edit Employee
                    </button>

                    <div className="relative" ref={statusRef}>
                        <button
                            onClick={() => setStatusMenuOpen(v => !v)}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border)] bg-white text-[var(--text)] rounded-[8px] text-[13px] font-medium hover:bg-[var(--surface2)] transition-colors"
                        >
                            Change Status <ChevronDown size={13} />
                        </button>
                        {statusMenuOpen && (
                            <div className="absolute bottom-full mb-1 right-0 w-[180px] bg-white border border-[var(--border)] rounded-[10px] shadow-xl z-10 overflow-hidden py-1">
                                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                    <button
                                        key={k}
                                        onClick={() => {
                                            onStatusChange(employee.id, k)
                                            setStatusMenuOpen(false)
                                        }}
                                        className={`w-full text-left px-4 py-2 text-[13px] flex items-center gap-2 hover:bg-[var(--surface2)] transition-colors ${employee.status === k ? "font-semibold" : ""}`}
                                        style={{ color: v.color }}
                                    >
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: v.color }} />
                                        {v.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Row Actions Menu ─────────────────────────────────────────────────────────

function RowActions({
    emp,
    isAdmin,
    onView,
    onEdit,
    onTerminate,
    onDelete,
}: {
    emp: Employee
    isAdmin: boolean
    onView: () => void
    onEdit: () => void
    onTerminate: () => void
    onDelete: () => void
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handler(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [])

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(v => !v)}
                className="p-1.5 rounded-md hover:bg-[var(--surface2)] text-[var(--text3)] transition-colors"
            >
                <MoreVertical size={15} />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 w-[160px] bg-white border border-[var(--border)] rounded-[10px] shadow-xl z-20 py-1 overflow-hidden">
                    <button onClick={() => { onView(); setOpen(false) }} className="w-full text-left px-4 py-2 text-[13px] flex items-center gap-2.5 hover:bg-[var(--surface2)] text-[var(--text2)] transition-colors">
                        <Eye size={14} /> View
                    </button>
                    <button onClick={() => { onEdit(); setOpen(false) }} className="w-full text-left px-4 py-2 text-[13px] flex items-center gap-2.5 hover:bg-[var(--surface2)] text-[var(--text2)] transition-colors">
                        <Edit2 size={14} /> Edit
                    </button>
                    {emp.status !== "TERMINATED" && (
                        <button onClick={() => { onTerminate(); setOpen(false) }} className="w-full text-left px-4 py-2 text-[13px] flex items-center gap-2.5 hover:bg-[var(--surface2)] text-[#f59e0b] transition-colors">
                            <ShieldOff size={14} /> Terminate
                        </button>
                    )}
                    {isAdmin && (
                        <button onClick={() => { onDelete(); setOpen(false) }} className="w-full text-left px-4 py-2 text-[13px] flex items-center gap-2.5 hover:bg-[#fef2f2] text-[#dc2626] transition-colors">
                            <Trash2 size={14} /> Delete
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [employees, setEmployees] = useState<Employee[]>([])
    const [branches, setBranches] = useState<Branch[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("")
    const [deptFilter, setDeptFilter] = useState("")
    const [empTypeFilter, setEmpTypeFilter] = useState("")
    const [allDepts, setAllDepts] = useState<Department[]>([])
    const [showModal, setShowModal] = useState(false)
    const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
    const [drawerEmployee, setDrawerEmployee] = useState<Employee | null>(null)

    const isAdmin = session?.user?.role === "ADMIN"

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        if (status === "authenticated" && session?.user?.role !== "ADMIN" && session?.user?.role !== "MANAGER") {
            router.push("/")
        }
    }, [status, session, router])

    const fetchEmployees = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (statusFilter) params.set("status", statusFilter)
            if (deptFilter) params.set("departmentId", deptFilter)
            if (empTypeFilter) params.set("employmentType", empTypeFilter)
            if (search) params.set("search", search)
            const res = await fetch(`/api/employees?${params}`)
            const data = await res.json()
            setEmployees(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load employees")
        } finally {
            setLoading(false)
        }
    }, [statusFilter, deptFilter, empTypeFilter, search])

    useEffect(() => {
        if (status === "authenticated") fetchEmployees()
    }, [status, fetchEmployees])

    useEffect(() => {
        fetch("/api/branches").then(r => r.json()).then(data => setBranches(Array.isArray(data) ? data : [])).catch(() => {})
        fetch("/api/departments").then(r => r.json()).then(data => setAllDepts(Array.isArray(data) ? data : [])).catch(() => {})
    }, [])

    const handleStatusChange = async (id: string, newStatus: string) => {
        try {
            const res = await fetch(`/api/employees/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Status updated")
            fetchEmployees()
            if (drawerEmployee?.id === id) {
                setDrawerEmployee(prev => prev ? { ...prev, status: newStatus } : null)
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to update status")
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure? This action cannot be undone.")) return
        try {
            const res = await fetch(`/api/employees/${id}`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            toast.success(data.softDeleted ? "Employee terminated (has records)" : "Employee deleted")
            fetchEmployees()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to delete")
        }
    }

    // Stats
    const total = employees.length
    const active = employees.filter(e => e.status === "ACTIVE").length
    const onLeave = employees.filter(e => e.status === "ON_LEAVE").length
    const now = new Date()
    const terminatedResignedThisMonth = employees.filter(e => {
        if (e.status !== "TERMINATED" && e.status !== "RESIGNED") return false
        const updated = new Date(e.createdAt)
        return updated.getMonth() === now.getMonth() && updated.getFullYear() === now.getFullYear()
    }).length

    if (status === "loading") {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)]">Employees</h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">Manage your workforce</p>
                </div>
                <button
                    onClick={() => { setEditEmployee(null); setShowModal(true) }}
                    className="inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                >
                    <Plus size={16} /> Add Employee
                </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: "Total Employees", value: total, icon: <Users size={18} />, color: "#1a9e6e", bg: "#e8f7f1" },
                    { label: "Active", value: active, icon: <CheckCircle size={18} />, color: "#16a34a", bg: "#dcfce7" },
                    { label: "On Leave", value: onLeave, icon: <Clock size={18} />, color: "#f59e0b", bg: "#fffbeb" },
                    { label: "Terminated/Resigned", value: terminatedResignedThisMonth, icon: <TrendingDown size={18} />, color: "#dc2626", bg: "#fef2f2" },
                ].map(stat => (
                    <div key={stat.label} className="bg-white border border-[var(--border)] rounded-[12px] p-4 flex items-center gap-3">
                        <div style={{ background: stat.bg, color: stat.color }} className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0">
                            {stat.icon}
                        </div>
                        <div>
                            <p className="text-[22px] font-bold text-[var(--text)] leading-tight">{stat.value}</p>
                            <p className="text-[11.5px] text-[var(--text3)]">{stat.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 space-y-3">
                {/* Status pills */}
                <div className="flex flex-wrap gap-2">
                    {[{ k: "", label: "All" }, ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ k, label: v.label }))].map(({ k, label }) => (
                        <button
                            key={k}
                            onClick={() => setStatusFilter(k)}
                            className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-all ${statusFilter === k
                                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                : "bg-white text-[var(--text2)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Search + dropdowns */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && fetchEmployees()}
                            placeholder="Search by name, ID, phone..."
                            className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)]/30 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                        />
                    </div>
                    <select
                        value={deptFilter}
                        onChange={e => setDeptFilter(e.target.value)}
                        className="h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                    >
                        <option value="">All Departments</option>
                        {allDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select
                        value={empTypeFilter}
                        onChange={e => setEmpTypeFilter(e.target.value)}
                        className="h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                    >
                        <option value="">All Employment Types</option>
                        {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
            </div>

            {/* Employee Table */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
                </div>
            ) : employees.length === 0 ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[14px] bg-white border border-dashed border-[var(--border)] shadow-sm">
                    <UserCheck size={36} className="text-[var(--text3)] mb-2" />
                    <h3 className="text-[15px] font-semibold text-[var(--text)]">No employees found</h3>
                    <p className="text-[13px] text-[var(--text3)] mt-1">Add your first employee to get started.</p>
                </div>
            ) : (
                <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[var(--border)] bg-[var(--surface2)]/40">
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-5 py-3">Employee</th>
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Department</th>
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Type</th>
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Phone</th>
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Joined</th>
                                    {isAdmin && (
                                        <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Salary</th>
                                    )}
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Status</th>
                                    <th className="text-right text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-5 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map((emp, i) => {
                                    const s = STATUS_CONFIG[emp.status] || STATUS_CONFIG.ACTIVE
                                    return (
                                        <tr
                                            key={emp.id}
                                            className={`border-b border-[var(--border)] hover:bg-[var(--surface2)]/30 transition-colors ${i === employees.length - 1 ? "border-b-0" : ""}`}
                                        >
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-3">
                                                    <Avatar firstName={emp.firstName} lastName={emp.lastName} photo={emp.photo} size={36} />
                                                    <div>
                                                        <p className="text-[13px] font-semibold text-[var(--text)]">
                                                            {emp.firstName} {emp.lastName}
                                                        </p>
                                                        <p className="text-[11px] font-mono text-[var(--accent-text)]">{emp.employeeId}</p>
                                                        {emp.designation && (
                                                            <p className="text-[11px] text-[var(--text3)]">{emp.designation}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {emp.department ? (
                                                    <span className="px-2 py-0.5 bg-[var(--surface2)] border border-[var(--border)] rounded-[6px] text-[12px] text-[var(--text2)] font-medium">
                                                        {emp.department.name}
                                                    </span>
                                                ) : (
                                                    <span className="text-[13px] text-[var(--text3)]">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-[13px] text-[var(--text2)]">{emp.employmentType}</td>
                                            <td className="px-4 py-3 text-[13px] text-[var(--text2)]">{emp.phone}</td>
                                            <td className="px-4 py-3 text-[13px] text-[var(--text2)] whitespace-nowrap">
                                                {emp.dateOfJoining ? format(new Date(emp.dateOfJoining), "dd MMM yyyy") : "—"}
                                            </td>
                                            {isAdmin && (
                                                <td className="px-4 py-3 text-[13px] text-[var(--text2)] whitespace-nowrap">
                                                    {fmtRupee(emp.basicSalary)}
                                                </td>
                                            )}
                                            <td className="px-4 py-3">
                                                <span
                                                    style={{ color: s.color, background: s.bg, borderColor: s.border }}
                                                    className="px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap"
                                                >
                                                    {s.label}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center justify-end">
                                                    <RowActions
                                                        emp={emp}
                                                        isAdmin={isAdmin}
                                                        onView={() => setDrawerEmployee(emp)}
                                                        onEdit={() => { setEditEmployee(emp); setShowModal(true) }}
                                                        onTerminate={() => handleStatusChange(emp.id, "TERMINATED")}
                                                        onDelete={() => handleDelete(emp.id)}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modals */}
            <EmployeeModal
                open={showModal}
                onClose={() => { setShowModal(false); setEditEmployee(null) }}
                onSaved={fetchEmployees}
                branches={branches}
                employee={editEmployee}
            />
            <EmployeeDrawer
                employee={drawerEmployee}
                onClose={() => setDrawerEmployee(null)}
                onEdit={(e) => { setDrawerEmployee(null); setEditEmployee(e); setShowModal(true) }}
                onStatusChange={handleStatusChange}
                isAdmin={isAdmin}
            />
        </div>
    )
}
