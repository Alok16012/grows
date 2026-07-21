"use client"
import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { can } from "@/lib/can"
import {
    Plus, Search, UserCheck, X, Loader2, Users,
    Calendar, TrendingDown, TrendingUp, Minus, Edit2, Eye, ChevronDown,
    CheckCircle, Clock, Building2, Briefcase, Phone, Mail,
    FileText, IndianRupee, MoreVertical, ShieldOff, Trash2,
    User, CreditCard, MapPin, LogOut, Download, Upload,
    Copy, Link2, RefreshCw, SlidersHorizontal
} from "lucide-react"
import { format } from "date-fns"
// xlsx is lazy-loaded — it's a ~430KB dep used only on template download
// and import. Eager import would bloat the post-login landing bundle.
const loadXLSX = () => import("xlsx")
import { EmployeeModal, Employee, STATUS_CONFIG } from "@/components/EmployeeModal"

// Columns offered in the Export picker — mirrors the server export
// (app/api/employees/export). "Basic Salary" is hidden without salary access.
const EXPORT_COLUMNS = [
    "Employee ID", "First Name", "Middle Name", "Last Name", "Name As Per Aadhar",
    "Father's Name", "Phone", "Email", "Designation", "Branch", "Department",
    "Employment Type", "Basic Salary", "Status", "Date of Joining", "City",
    "Blood Group", "UAN", "PF No", "ESI No", "Aadhar No", "PAN No", "Labour Card No",
    "Contract From", "Contractor Code", "Work Order Number",
    "Bank Name", "Bank Branch", "Bank IFSC", "Bank Account",
]
import { DocumentViewer } from "@/components/DocumentViewer"

// ─── Local Types ──────────────────────────────────────────────────────────────

type Site = { id: string; name: string; code?: string }
type Department = { id: string; name: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Daily Wage"]
const SALARY_TYPES = ["Monthly", "Daily", "Hourly"]
const ROLE_OPTIONS = [
    "Security Guard",
    "Supervisor",
    "Manager",
    "Housekeeping",
    "Operator",
    "Receptionist",
    "Electrician",
    "Plumber",
    "Gardener",
    "Driver",
    "Admin Staff",
    "HR Staff",
    "Other",
]

const AVATAR_COLORS = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#f97316"]

function getAvatarColor(firstName: string, lastName: string) {
    const idx = (firstName.charCodeAt(0) + (lastName.charCodeAt(0) || 0)) % AVATAR_COLORS.length
    return AVATAR_COLORS[idx]
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ firstName, lastName, photo, size = 40 }: {
    firstName: string; lastName: string; photo?: string; size?: number
}) {
    const [imgErr, setImgErr] = useState(false)
    const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase()
    const bg = getAvatarColor(firstName, lastName)

    if (photo && !imgErr) {
        return (
            <img
                src={photo}
                alt={`${firstName} ${lastName}`}
                style={{ width: size, height: size }}
                className="rounded-full object-cover shrink-0"
                onError={() => setImgErr(true)}
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

// Decorative sparkline for the stat cards (fixed gentle wave — the app has no
// per-day employee history, so this is a visual cue, not real data).
function Sparkline({ color, seed = 0 }: { color: string; seed?: number }) {
    const base = [6, 10, 7, 13, 9, 15, 11, 17]
    const pts = base.map((v, i) => `${(i / (base.length - 1)) * 72},${22 - ((v + (seed % 3)) % 18)}`).join(" ")
    return (
        <svg viewBox="0 0 72 24" preserveAspectRatio="none" className="w-[64px] h-[26px] shrink-0">
            <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function StatCard({ label, value, icon, color, bg, trend, sparkColor, seed }: {
    label: string; value: number; icon: React.ReactNode; color: string; bg: string
    trend?: { dir: "up" | "down" | "flat"; text: string }; sparkColor: string; seed: number
}) {
    return (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px] hover:shadow-sm transition-all">
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                    <div style={{ background: bg, color }} className="w-10 h-10 rounded-[11px] flex items-center justify-center shrink-0">
                        {icon}
                    </div>
                    <span className="text-[12.5px] font-medium text-[var(--text2)]">{label}</span>
                </div>
                <Sparkline color={sparkColor} seed={seed} />
            </div>
            <p className="text-[28px] font-bold text-[var(--text)] leading-none tabular-nums">{value.toLocaleString("en-IN")}</p>
            {trend && (
                <p className={`text-[11.5px] font-medium mt-2 flex items-center gap-1 ${
                    trend.dir === "up" ? "text-[var(--accent-text)]" : trend.dir === "down" ? "text-[var(--red)]" : "text-[var(--text3)]"
                }`}>
                    {trend.dir === "up" ? <TrendingUp size={12} /> : trend.dir === "down" ? <TrendingDown size={12} /> : <Minus size={12} />}
                    {trend.text}
                </p>
            )}
        </div>
    )
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


// ─── Document Types Config ────────────────────────────────────────────────────

const DOC_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    AADHAAR: { label: "Aadhaar", color: "#1d4ed8", bg: "#dbeafe" },
    PAN: { label: "PAN", color: "#b45309", bg: "#fef3c7" },
    RESUME: { label: "Resume", color: "#7c3aed", bg: "#ede9fe" },
    PHOTO: { label: "Photo", color: "#15803d", bg: "#dcfce7" },
    CERTIFICATE: { label: "Certificate", color: "#0f766e", bg: "#ccfbf1" },
    OFFER_LETTER: { label: "Offer Letter", color: "#9333ea", bg: "#f3e8ff" },
    OTHER: { label: "Other", color: "#6b7280", bg: "#f3f4f6" },
}

const DOC_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    PENDING: { label: "Pending", color: "#92400e", bg: "#fffbeb", border: "#fde68a" },
    VERIFIED: { label: "Verified", color: "#14532d", bg: "#dcfce7", border: "#86efac" },
    REJECTED: { label: "Rejected", color: "#991b1b", bg: "#fef2f2", border: "#fecaca" },
}

type EmployeeDocument = {
    id: string
    employeeId: string
    type: string
    fileName: string
    fileUrl: string
    status: string
    rejectionReason?: string | null
    verifiedBy?: string | null
    uploadedAt: string
}

// ─── Profile Completion Card ───────────────────────────────────────────────────

function OnboardingCard({ employee }: { employee: Employee }) {
    const fields = [
        employee.dateOfBirth, employee.gender, employee.aadharNumber, employee.panNumber,
        employee.bankAccountNumber, employee.bankIFSC, employee.address,
        employee.emergencyContact1Phone, employee.fathersName, employee.bloodGroup,
    ]
    const filled = fields.filter(Boolean).length
    const pct = Math.round((filled / fields.length) * 100)
    const isComplete = pct === 100

    return (
        <div style={{ borderRadius: 10, border: `1px solid ${isComplete ? "#86efac" : "#e5e7eb"}`, background: isComplete ? "#f0fdf4" : "#fafafa", padding: "12px 14px", marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: isComplete ? "#15803d" : "var(--text2)" }}>Profile Completion</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: isComplete ? "#16a34a" : "var(--accent)" }}>{pct}%</span>
            </div>
            <div style={{ height: 5, background: "#e5e7eb", borderRadius: 999, marginBottom: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: isComplete ? "#22c55e" : "var(--accent)", borderRadius: 999, transition: "width 0.3s" }} />
            </div>
            <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>
                {isComplete
                    ? "All key details filled."
                    : `${filled}/${fields.length} key fields filled. Employee should log in and go to My Profile to complete.`}
            </p>
        </div>
    )
}

// ─── Employee Detail Drawer ────────────────────────────────────────────────────

function EmployeeDrawer({
    employee, onClose, onEdit, onStatusChange, isAdmin, canViewSalary,
}: {
    employee: Employee | null
    onClose: () => void
    onEdit: (e: Employee) => void
    onStatusChange: (id: string, status: string) => void
    isAdmin: boolean
    canViewSalary: boolean
}) {
    const [activeTab, setActiveTab] = useState<"personal" | "employment" | "salary" | "bank" | "documents">("personal")
    const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [statusMenuOpen, setStatusMenuOpen] = useState(false)
    const statusRef = useRef<HTMLDivElement>(null)

    // Salary structure state
    type SalaryData = { basic: number; da: number; hra?: number; bonus?: number; washing: number; conveyance: number; leaveWithWages: number; otherAllowance: number; otRatePerHour: number; canteenRatePerDay: number; complianceType: string; status: string; ctcMonthly?: number }
    const [salaryData, setSalaryData] = useState<SalaryData | null>(null)
    const [salaryLoading, setSalaryLoading] = useState(false)
    const [salaryEditing, setSalaryEditing] = useState(false)
    const [salaryForm, setSalaryForm] = useState<SalaryData>({ basic: 0, da: 0, washing: 0, conveyance: 0, leaveWithWages: 0, otherAllowance: 0, otRatePerHour: 170, canteenRatePerDay: 55, complianceType: "OR", status: "APPROVED" })
    const [salarySaving, setSalarySaving] = useState(false)

    const fetchSalary = async (empId: string) => {
        setSalaryLoading(true)
        try {
            const r = await fetch(`/api/payroll/salary-structure/${empId}`)
            if (r.ok) {
                const data = await r.json()
                if (data) {
                    setSalaryData(data)
                    setSalaryForm(data)
                }
            }
        } catch { /* ignore */ }
        finally { setSalaryLoading(false) }
    }

    const saveSalary = async () => {
        if (!employee) return
        setSalarySaving(true)
        try {
            const r = await fetch(`/api/payroll/salary-structure/${employee.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(salaryForm),
            })
            if (r.ok) {
                const data = await r.json()
                setSalaryData(data)
                setSalaryForm(data)
                setSalaryEditing(false)
                toast.success("Salary structure saved!")
            } else toast.error("Failed to save salary structure")
        } catch { toast.error("Failed to save") }
        finally { setSalarySaving(false) }
    }

    // Documents tab state
    const [documents, setDocuments] = useState<EmployeeDocument[]>([])
    const [docsLoading, setDocsLoading] = useState(false)
    const [showUploadForm, setShowUploadForm] = useState(false)
    const [uploadForm, setUploadForm] = useState({ type: "AADHAAR", fileName: "", fileUrl: "" })
    const [uploadSaving, setUploadSaving] = useState(false)
    const [fileUploading, setFileUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewName, setPreviewName] = useState<string>("")
    const [rejectingDocId, setRejectingDocId] = useState<string | null>(null)
    const [rejectReason, setRejectReason] = useState("")

    const fetchDocuments = async (empId: string) => {
        setDocsLoading(true)
        try {
            const r = await fetch(`/api/employees/${empId}/documents`)
            if (r.ok) setDocuments(await r.json())
        } catch { /* ignore */ }
        finally { setDocsLoading(false) }
    }

    const handleVerify = async (docId: string) => {
        if (!employee) return
        setActionLoading(docId + "_verify")
        try {
            const r = await fetch(`/api/employees/${employee.id}/documents/${docId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "VERIFIED" }),
            })
            if (r.ok) { toast.success("Document verified"); fetchDocuments(employee.id) }
            else toast.error("Failed to verify")
        } catch { toast.error("Failed to verify") }
        finally { setActionLoading(null) }
    }

    const handleReject = async (docId: string) => {
        if (!employee || !rejectReason.trim()) return
        setActionLoading(docId + "_reject")
        try {
            const r = await fetch(`/api/employees/${employee.id}/documents/${docId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "REJECTED", rejectionReason: rejectReason.trim() }),
            })
            if (r.ok) {
                toast.success("Document rejected")
                setRejectingDocId(null)
                setRejectReason("")
                fetchDocuments(employee.id)
            } else toast.error("Failed to reject")
        } catch { toast.error("Failed to reject") }
        finally { setActionLoading(null) }
    }

    const handleDelete = async (docId: string) => {
        if (!employee) return
        setActionLoading(docId + "_delete")
        try {
            const r = await fetch(`/api/employees/${employee.id}/documents/${docId}`, { method: "DELETE" })
            if (r.ok) { toast.success("Document deleted"); fetchDocuments(employee.id) }
            else toast.error("Failed to delete")
        } catch { toast.error("Failed to delete") }
        finally { setActionLoading(null) }
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !employee) return
        setFileUploading(true)
        try {
            const fd = new FormData()
            fd.append("file", file)
            const r = await fetch(`/api/employees/${employee.id}/documents/upload`, {
                method: "POST",
                body: fd,
            })
            if (r.ok) {
                const data = await r.json()
                setUploadForm(f => ({
                    ...f,
                    fileUrl: data.url,
                    fileName: f.fileName || data.fileName,
                }))
                toast.success("File uploaded — fill in details and save")
            } else {
                toast.error(await r.text())
            }
        } catch { toast.error("Upload failed") }
        finally { setFileUploading(false) }
    }

    const handleUpload = async () => {
        if (!employee) return
        if (!uploadForm.fileName.trim() || !uploadForm.fileUrl.trim()) {
            toast.error("File name and URL are required")
            return
        }
        setUploadSaving(true)
        try {
            const r = await fetch(`/api/employees/${employee.id}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(uploadForm),
            })
            if (r.ok) {
                toast.success("Document uploaded")
                setShowUploadForm(false)
                setUploadForm({ type: "RESUME", fileName: "", fileUrl: "" })
                if (fileInputRef.current) fileInputRef.current.value = ""
                fetchDocuments(employee.id)
            } else {
                toast.error(await r.text())
            }
        } catch { toast.error("Failed to upload") }
        finally { setUploadSaving(false) }
    }

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
            setDocuments([])
            setShowUploadForm(false)
            setSalaryData(null)
            setSalaryEditing(false)
            fetch(`/api/employees/${employee.id}`)
                .then(r => r.json())
                .then(setDetail)
                .catch(() => setDetail(null))
                .finally(() => setLoadingDetail(false))
            fetchSalary(employee.id)
        }
    }, [employee])

    if (!employee) return null

    const status = STATUS_CONFIG[employee.status] || STATUS_CONFIG.ACTIVE
    const emp = (detail as Employee | null) || employee

    const tabCls = (t: string) =>
        `px-3 py-3 text-[12px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${activeTab === t
            ? "border-[var(--accent)] text-[var(--accent-text)]"
            : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"
        }`

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/40" onClick={onClose} />
            <div className="w-full max-w-[480px] bg-[var(--surface)] h-full overflow-hidden flex flex-col shadow-2xl border-l border-[var(--border)]">
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
                                {(employee as any).user?.customRole?.name && (
                                    <span
                                        style={{
                                            color: (employee as any).user.customRole.color || "#6366f1",
                                            background: `${(employee as any).user.customRole.color || "#6366f1"}15`,
                                            borderColor: `${(employee as any).user.customRole.color || "#6366f1"}40`,
                                        }}
                                        className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border"
                                    >
                                        {(employee as any).user.customRole.name}
                                    </span>
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
                            ...(canViewSalary ? [{ icon: <IndianRupee size={12} />, label: "Salary", value: fmtRupee(employee.basicSalary) }] : []),
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
                <div className="flex border-b border-[var(--border)] px-5 overflow-x-auto">
                    {(["personal", "employment", ...(canViewSalary ? ["salary"] as const : []), "bank", "documents"] as const).map(t => (
                        <button key={t} onClick={() => {
                            setActiveTab(t)
                            if (t === "documents" && employee && documents.length === 0 && !docsLoading) {
                                fetchDocuments(employee.id)
                            }
                        }} className={tabCls(t)}>
                            {t === "personal" ? "Personal" : t === "employment" ? "Employment" : t === "salary" ? "Salary" : t === "bank" ? "Bank" : "Documents"}
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
                        <div className="space-y-3">
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
                            <OnboardingCard employee={emp} />
                        </div>
                    ) : activeTab === "employment" ? (
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <InfoItem label="Employment Type" value={emp.employmentType} icon={<Briefcase size={13} />} />
                                {canViewSalary && <InfoItem label="Salary Type" value={emp.salaryType || "—"} icon={<IndianRupee size={13} />} />}
                                {canViewSalary && <InfoItem label="Basic Salary" value={fmtRupee(emp.basicSalary)} icon={<IndianRupee size={13} />} />}
                                <InfoItem label="Manager" value={emp.managerId || "—"} icon={<User size={13} />} />
                                <InfoItem
                                    label="Date of Joining"
                                    value={emp.dateOfJoining ? format(new Date(emp.dateOfJoining), "dd MMM yyyy") : "—"}
                                    icon={<Calendar size={13} />}
                                />
                                <InfoItem label="Primary Site" value={employee.deployments?.[0]?.site?.name || "—"} icon={<MapPin size={13} />} />
                            </div>
                            {emp.notes && (
                                <div className="p-3 rounded-[10px] bg-[var(--surface2)]/40 border border-[var(--border)]">
                                    <p className="text-[10.5px] text-[var(--text3)] font-medium uppercase tracking-[0.4px] mb-1">Notes</p>
                                    <p className="text-[13px] text-[var(--text)]">{emp.notes}</p>
                                </div>
                            )}
                        </div>
                    ) : activeTab === "salary" ? (
                        <div className="space-y-3">
                            {salaryLoading ? (
                                <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-[var(--accent)]" /></div>
                            ) : !salaryData && !salaryEditing ? (
                                <div className="text-center py-8">
                                    <IndianRupee size={32} className="mx-auto text-[var(--text3)] mb-3" />
                                    <p className="text-[13px] text-[var(--text3)] mb-3">No salary structure set</p>
                                    <button onClick={() => setSalaryEditing(true)}
                                        className="inline-flex items-center gap-2 bg-[var(--accent)] text-white px-4 py-2 rounded-[8px] text-[13px] font-medium hover:opacity-90">
                                        <Plus size={14} /> Setup Salary Structure
                                    </button>
                                </div>
                            ) : salaryEditing ? (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[11px] text-[var(--text3)] mb-1.5">Compliance Type</label>
                                        <div className="flex gap-3">
                                            <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                                                <input type="radio" checked={salaryForm.complianceType === "OR"} onChange={() => setSalaryForm(p => ({ ...p, complianceType: "OR" }))} className="accent-emerald-600" />
                                                <span><b>OR</b> — PF + ESIC</span>
                                            </label>
                                            <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                                                <input type="radio" checked={salaryForm.complianceType === "CALL"} onChange={() => setSalaryForm(p => ({ ...p, complianceType: "CALL" }))} className="accent-orange-500" />
                                                <span><b>CALL</b> — No PF/ESIC</span>
                                            </label>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <div>
                                            <label className="block text-[11px] text-[var(--text3)] mb-1">Basic (₹)</label>
                                            <input type="number" value={salaryForm.basic} min="0"
                                                onChange={e => setSalaryForm(p => ({ ...p, basic: Number(e.target.value) || 0 }))}
                                                className="w-full h-8 px-2.5 border border-[var(--border)] rounded-[6px] text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]" />
                                        </div>
                                        {salaryForm.complianceType !== "CALL" && (
                                            <>
                                                {([
                                                    { key: "da", label: "DA (₹)" },
                                                    { key: "hra", label: "HRA (₹)" },
                                                    { key: "bonus", label: "Bonus (₹)" },
                                                    { key: "washing", label: "Washing (₹)" },
                                                    { key: "conveyance", label: "Conveyance (₹)" },
                                                    { key: "leaveWithWages", label: "Leave With Wages (₹)" },
                                                    { key: "otherAllowance", label: "Other Allowance (₹)" },
                                                    { key: "otRatePerHour", label: "OT Rate/Hr (₹)" },
                                                    { key: "canteenRatePerDay", label: "Canteen/Day (₹)" },
                                                ] as { key: keyof SalaryData; label: string }[]).map(f => (
                                                    <div key={f.key}>
                                                        <label className="block text-[11px] text-[var(--text3)] mb-1">{f.label}</label>
                                                        <input type="number" value={(salaryForm[f.key] as number) ?? 0} min="0"
                                                            onChange={e => setSalaryForm(p => ({ ...p, [f.key]: Number(e.target.value) || 0 }))}
                                                            className="w-full h-8 px-2.5 border border-[var(--border)] rounded-[6px] text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]" />
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                    {/* Live CTC preview */}
                                    {(() => {
                                        const sf = salaryForm
                                        const isC = sf.complianceType === "CALL"
                                        // CALL = contract: only Basic, everything else zero
                                        const da    = isC ? 0 : sf.da
                                        const wash  = isC ? 0 : sf.washing
                                        const conv  = isC ? 0 : sf.conveyance
                                        const lww   = isC ? 0 : sf.leaveWithWages
                                        const other = isC ? 0 : sf.otherAllowance
                                        const hra   = isC ? 0 : (sf.hra ?? 0)
                                        const bonus = isC ? 0 : (sf.bonus ?? 0)
                                        const gross = sf.basic + da + hra + wash + conv + lww + bonus + other
                                        const pf    = 0
                                        const esic  = 0
                                        const ctc   = gross
                                        return (
                                            <div className={`border rounded-[8px] p-3 space-y-1 text-[12px] ${isC ? "bg-amber-50 border-amber-200" : "bg-[#f0fdf4] border-emerald-200"}`}>
                                                {isC && <div className="text-[11px] font-semibold text-amber-700 pb-1">CALL contract — Basic only, no allowances or PF/ESIC</div>}
                                                {!isC && <>
                                                    <div className="flex justify-between"><span className="text-[var(--text3)]">HRA</span><span>₹{Math.round(hra).toLocaleString("en-IN")}</span></div>
                                                    <div className="flex justify-between"><span className="text-[var(--text3)]">Bonus</span><span>₹{Math.round(bonus).toLocaleString("en-IN")}</span></div>
                                                </>}
                                                <div className="flex justify-between font-medium"><span>Full Gross</span><span>₹{Math.round(gross).toLocaleString("en-IN")}</span></div>
                                                <div className="flex justify-between text-[var(--text3)]"><span>Employer PF</span><span>{isC ? "N/A" : `₹${pf.toLocaleString("en-IN")}`}</span></div>
                                                <div className="flex justify-between text-[var(--text3)]"><span>Employer ESIC</span><span>{isC ? "N/A" : `₹${esic.toLocaleString("en-IN")}`}</span></div>
                                                <div className={`flex justify-between font-bold border-t pt-1 ${isC ? "text-amber-700 border-amber-200" : "text-purple-700 border-emerald-200"}`}><span>CTC / Month</span><span>₹{Math.round(ctc).toLocaleString("en-IN")}</span></div>
                                            </div>
                                        )
                                    })()}
                                    <div className="flex gap-2 pt-1">
                                        <button onClick={() => { setSalaryEditing(false); if (salaryData) setSalaryForm(salaryData) }}
                                            className="flex-1 h-9 border border-[var(--border)] rounded-[8px] text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)]">Cancel</button>
                                        <button onClick={saveSalary} disabled={salarySaving}
                                            className="flex-1 h-9 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
                                            {salarySaving && <Loader2 size={13} className="animate-spin" />} Save
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${salaryData?.complianceType === "CALL" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                            {salaryData?.complianceType || "OR"} Compliance
                                        </span>
                                        {isAdmin && (
                                            <button onClick={() => setSalaryEditing(true)}
                                                className="text-[12px] text-[var(--accent)] hover:underline font-medium flex items-center gap-1">
                                                <Edit2 size={11} /> Edit
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <InfoItem label="Basic" value={fmtRupee(salaryData?.basic ?? 0)} icon={<IndianRupee size={13} />} />
                                        <InfoItem label="DA" value={fmtRupee(salaryData?.da ?? 0)} icon={<IndianRupee size={13} />} />
                                        <InfoItem label="Washing" value={fmtRupee(salaryData?.washing ?? 0)} />
                                        <InfoItem label="Conveyance" value={fmtRupee(salaryData?.conveyance ?? 0)} />
                                        <InfoItem label="Leave With Wages" value={fmtRupee(salaryData?.leaveWithWages ?? 0)} />
                                        <InfoItem label="Other Allowance" value={fmtRupee(salaryData?.otherAllowance ?? 0)} />
                                        <InfoItem label="OT Rate/Hr" value={fmtRupee(salaryData?.otRatePerHour ?? 170)} />
                                        <InfoItem label="Canteen/Day" value={fmtRupee(salaryData?.canteenRatePerDay ?? 55)} />
                                    </div>
                                    {salaryData && (() => {
                                        const s = salaryData
                                        const isC = s.complianceType === "CALL"
                                        const da    = isC ? 0 : s.da
                                        const wash  = isC ? 0 : s.washing
                                        const conv  = isC ? 0 : s.conveyance
                                        const lww   = isC ? 0 : s.leaveWithWages
                                        const other = isC ? 0 : s.otherAllowance
                                        const hra   = isC ? 0 : (s.hra ?? 0)
                                        const bonus = isC ? 0 : (s.bonus ?? 0)
                                        const gross = s.basic + da + hra + wash + conv + lww + bonus + other
                                        const ctc   = gross  // CALL: no employer contributions
                                        return (
                                            <div className={`border rounded-[8px] p-3 flex justify-between items-center ${isC ? "bg-amber-50 border-amber-200" : "bg-[#f5f3ff] border-purple-200"}`}>
                                                <span className={`text-[12px] font-medium ${isC ? "text-amber-700" : "text-purple-700"}`}>CTC / Month</span>
                                                <span className={`text-[16px] font-bold ${isC ? "text-amber-700" : "text-purple-700"}`}>₹{Math.round(ctc).toLocaleString("en-IN")}</span>
                                            </div>
                                        )
                                    })()}
                                </div>
                            )}
                        </div>
                    ) : activeTab === "bank" ? (
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
                    ) : (
                        /* Documents Tab */
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                            {/* KYC Checklist */}
                            <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
                                <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px 0" }}>KYC Status</p>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {(["AADHAAR", "PAN", "PHOTO"] as const).map(type => {
                                        const uploaded = documents.filter(d => d.type === type)
                                        const verified = uploaded.find(d => d.status === "VERIFIED")
                                        const pending = uploaded.find(d => d.status === "PENDING")
                                        const conf = DOC_TYPE_CONFIG[type]
                                        let statusColor = "#991b1b"; let statusBg = "#fef2f2"; let statusText = "Missing"
                                        if (verified) { statusColor = "#14532d"; statusBg = "#dcfce7"; statusText = "Verified" }
                                        else if (pending) { statusColor = "#92400e"; statusBg = "#fffbeb"; statusText = "Pending" }
                                        return (
                                            <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, background: statusBg, border: `1px solid ${statusColor}22` }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: conf.color }}>{conf.label}</span>
                                                <span style={{ fontSize: 10, fontWeight: 600, color: statusColor }}>{statusText}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Upload button */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px", margin: 0 }}>All Documents</p>
                                <button
                                    onClick={() => { setShowUploadForm(v => !v); setUploadForm({ type: "AADHAAR", fileName: "", fileUrl: "" }) }}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                                >
                                    <Plus size={13} /> Upload
                                </button>
                            </div>

                            {/* Upload Form */}
                            {showUploadForm && (
                                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: 0 }}>Upload Document</p>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 4 }}>Document Type</label>
                                        <select
                                            value={uploadForm.type}
                                            onChange={e => setUploadForm(f => ({ ...f, type: e.target.value }))}
                                            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" }}
                                        >
                                            {Object.entries(DOC_TYPE_CONFIG).map(([k, v]) => (
                                                <option key={k} value={k}>{v.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 4 }}>Label / File Name</label>
                                        <input
                                            value={uploadForm.fileName}
                                            onChange={e => setUploadForm(f => ({ ...f, fileName: e.target.value }))}
                                            placeholder="e.g. Aadhaar Front"
                                            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 4 }}>File (PDF / JPG / PNG)</label>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png,.webp"
                                            style={{ display: "none" }}
                                            onChange={handleFileSelect}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={fileUploading}
                                            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: fileUploading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, opacity: fileUploading ? 0.6 : 1, marginBottom: 6 }}
                                        >
                                            <Upload size={13} />
                                            {fileUploading ? "Uploading…" : uploadForm.fileUrl ? "Replace File" : "Choose File"}
                                        </button>
                                        {uploadForm.fileUrl && (
                                            <p style={{ fontSize: 11, color: "#14532d", background: "#dcfce7", padding: "3px 8px", borderRadius: 6, margin: 0, display: "inline-block" }}>
                                                ✓ File ready
                                            </p>
                                        )}
                                    </div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                        <button
                                            onClick={() => { setShowUploadForm(false); setUploadForm({ type: "AADHAAR", fileName: "", fileUrl: "" }); if (fileInputRef.current) fileInputRef.current.value = "" }}
                                            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "none", cursor: "pointer", fontSize: 12, color: "var(--text)" }}
                                        >Cancel</button>
                                        <button
                                            onClick={handleUpload}
                                            disabled={uploadSaving || !uploadForm.fileUrl || !uploadForm.fileName.trim()}
                                            style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, opacity: (uploadSaving || !uploadForm.fileUrl || !uploadForm.fileName.trim()) ? 0.5 : 1 }}
                                        >
                                            {uploadSaving ? "Saving..." : "Save Document"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Documents List */}
                            {docsLoading ? (
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0" }}>
                                    <Loader2 size={22} className="animate-spin" style={{ color: "var(--accent)" }} />
                                </div>
                            ) : documents.length === 0 ? (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 8 }}>
                                    <FileText size={28} style={{ color: "var(--text3)" }} />
                                    <p style={{ fontSize: 13, color: "var(--text3)", margin: 0 }}>No documents uploaded yet</p>
                                    <p style={{ fontSize: 11, color: "var(--text3)", margin: 0 }}>Upload Aadhaar, PAN, Photo etc.</p>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {documents.map(doc => {
                                        const typeConf = DOC_TYPE_CONFIG[doc.type] || DOC_TYPE_CONFIG.OTHER
                                        const statusConf = DOC_STATUS_CONFIG[doc.status] || DOC_STATUS_CONFIG.PENDING
                                        const isImage = /\.(jpg|jpeg|png|webp)(\?|$)/i.test(doc.fileUrl)
                                        const isPdf = /\.pdf(\?|$)/i.test(doc.fileUrl)
                                        const isRejecting = rejectingDocId === doc.id
                                        return (
                                            <div key={doc.id} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface)" }}>
                                                {/* Image preview for Aadhaar/PAN/Photo */}
                                                {isImage && (
                                                    <div
                                                        style={{ width: "100%", height: 100, overflow: "hidden", cursor: "pointer", background: "#f1f5f9", position: "relative" }}
                                                        onClick={() => {
                                                            setPreviewUrl(doc.fileUrl)
                                                            setPreviewName(doc.fileName)
                                                        }}
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={doc.fileUrl} alt={doc.fileName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.15s" }}
                                                            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                                                            onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
                                                        >
                                                            <Eye size={22} style={{ color: "#fff" }} />
                                                        </div>
                                                    </div>
                                                )}
                                                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                            <span style={{ fontSize: 11, fontWeight: 700, color: typeConf.color, background: typeConf.bg, padding: "2px 7px", borderRadius: 20 }}>
                                                                {typeConf.label}
                                                            </span>
                                                            <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>{doc.fileName}</span>
                                                        </div>
                                                        <span style={{ fontSize: 10.5, fontWeight: 600, color: statusConf.color, background: statusConf.bg, border: `1px solid ${statusConf.border}`, padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap" }}>
                                                            {statusConf.label}
                                                        </span>
                                                    </div>
                                                    {doc.rejectionReason && (
                                                        <p style={{ fontSize: 11, color: "#991b1b", margin: 0, background: "#fef2f2", padding: "4px 8px", borderRadius: 6 }}>
                                                            ✗ {doc.rejectionReason}
                                                        </p>
                                                    )}
                                                    {/* Inline rejection form */}
                                                    {isRejecting && (
                                                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                            <input
                                                                value={rejectReason}
                                                                onChange={e => setRejectReason(e.target.value)}
                                                                placeholder="Rejection reason…"
                                                                autoFocus
                                                                style={{ flex: 1, padding: "5px 8px", borderRadius: 7, border: "1px solid #fca5a5", fontSize: 12, background: "#fef2f2", color: "#991b1b", outline: "none" }}
                                                            />
                                                            <button
                                                                onClick={() => handleReject(doc.id)}
                                                                disabled={!rejectReason.trim() || actionLoading === doc.id + "_reject"}
                                                                style={{ padding: "5px 10px", borderRadius: 7, background: "#dc2626", color: "#fff", border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", opacity: !rejectReason.trim() ? 0.5 : 1 }}
                                                            >Reject</button>
                                                            <button
                                                                onClick={() => { setRejectingDocId(null); setRejectReason("") }}
                                                                style={{ padding: "5px 10px", borderRadius: 7, background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", fontSize: 11, cursor: "pointer" }}
                                                            >✕</button>
                                                        </div>
                                                    )}
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                                        {isImage ? (
                                                            <button
                                                                onClick={() => {
                                                                    setPreviewUrl(doc.fileUrl)
                                                                    setPreviewName(doc.fileName)
                                                                }}
                                                                style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, padding: 0, fontWeight: 600 }}
                                                            ><Eye size={12} /> Preview</button>
                                                        ) : (
                                                            <button
                                                                onClick={() => {
                                                                    setPreviewUrl(doc.fileUrl)
                                                                    setPreviewName(doc.fileName)
                                                                }}
                                                                style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}
                                                            ><Eye size={12} /> {isPdf ? "View PDF" : "View File"}</button>
                                                        )}
                                                        {isAdmin && doc.status !== "VERIFIED" && !isRejecting && (
                                                            <button
                                                                onClick={() => handleVerify(doc.id)}
                                                                disabled={!!actionLoading}
                                                                style={{ fontSize: 11, fontWeight: 600, color: "#14532d", background: "#dcfce7", border: "1px solid #86efac", padding: "3px 9px", borderRadius: 6, cursor: "pointer", opacity: actionLoading ? 0.6 : 1 }}
                                                            >{actionLoading === doc.id + "_verify" ? "…" : "✓ Verify"}</button>
                                                        )}
                                                        {isAdmin && doc.status !== "REJECTED" && !isRejecting && (
                                                            <button
                                                                onClick={() => { setRejectingDocId(doc.id); setRejectReason("") }}
                                                                style={{ fontSize: 11, fontWeight: 600, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", padding: "3px 9px", borderRadius: 6, cursor: "pointer" }}
                                                            >✗ Reject</button>
                                                        )}
                                                        {isAdmin && (
                                                            <button
                                                                onClick={() => handleDelete(doc.id)}
                                                                disabled={actionLoading === doc.id + "_delete"}
                                                                style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", background: "none", border: "none", padding: "3px 6px", cursor: "pointer", marginLeft: "auto", opacity: actionLoading === doc.id + "_delete" ? 0.5 : 1 }}
                                                                title="Delete document"
                                                            ><Trash2 size={12} /></button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DocumentViewer 
                    url={previewUrl} 
                    fileName={previewName} 
                    onClose={() => setPreviewUrl(null)} 
                />

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
                            className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] rounded-[8px] text-[13px] font-medium hover:bg-[var(--surface)] transition-colors"
                        >
                            Change Status <ChevronDown size={13} />
                        </button>
                        {statusMenuOpen && (
                            <div className="absolute bottom-full mb-1 right-0 w-[180px] bg-[var(--surface)] border border-[var(--border)] rounded-[10px] shadow-xl z-10 overflow-hidden py-1">
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
    canDelete,
    onView,
    onEdit,
    onTerminate,
    onDelete,
}: {
    emp: Employee
    isAdmin: boolean
    canDelete: boolean
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
                <div className="absolute right-0 top-full mt-1 w-[160px] bg-[var(--surface)] border border-[var(--border)] rounded-[10px] shadow-xl z-20 py-1 overflow-hidden">
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
                    {canDelete && (
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

function EmployeesPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const searchParams = useSearchParams()
    const [employees, setEmployees] = useState<Employee[]>([])
    const [sitesForFilter, setSitesForFilter] = useState<Site[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("")
    const [deptFilter, setDeptFilter] = useState("")
    const [empTypeFilter, setEmpTypeFilter] = useState("")
    const [siteFilter, setSiteFilter] = useState("")
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [allDepts, setAllDepts] = useState<Department[]>([])
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [totalCount, setTotalCount] = useState(0)
    const [counts, setCounts] = useState<{
        total: number; active: number; onLeave: number; inactive: number; terminated: number; resigned: number
        newThisMonth: { total: number; active: number; terminated: number }
    } | null>(null)
    const PAGE_SIZE = 50
    const [showModal, setShowModal] = useState(false)
    const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
    const [drawerEmployee, setDrawerEmployee] = useState<Employee | null>(null)
    const [showImportModal, setShowImportModal] = useState(false)
    const [importRows, setImportRows] = useState<Record<string, unknown>[]>([])
    const [importLoading, setImportLoading] = useState(false)
    const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })
    const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: { row: number; reason: string }[] } | null>(null)
    const importFileRef = useRef<HTMLInputElement>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
    const [exportOpen, setExportOpen] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [exportCols, setExportCols] = useState<Set<string>>(new Set(EXPORT_COLUMNS))

    const isAdmin = can(session, "employees.edit")
    const canViewSalary = can(session, "employees.viewSalary")
    const canDelete = can(session, "employees.delete")

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        if (status === "authenticated") {
            if (!can(session, "employees.view")) router.push("/")
        }
    }, [status, session, router])

    const fetchEmployees = useCallback(async (p = page) => {
        setSelectedIds(new Set())
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (statusFilter) params.set("status", statusFilter)
            if (deptFilter) params.set("departmentId", deptFilter)
            if (empTypeFilter) params.set("employmentType", empTypeFilter)
            if (siteFilter) params.set("siteId", siteFilter)
            if (search) params.set("search", search)
            params.set("page", String(p))
            params.set("pageSize", String(PAGE_SIZE))
            const res = await fetch(`/api/employees?${params}`)
            const data = await res.json()
            if (data && data.employees) {
                setEmployees(Array.isArray(data.employees) ? data.employees : [])
                setTotalPages(data.totalPages ?? 1)
                setTotalCount(data.total ?? 0)
                if (data.counts) setCounts(data.counts)
            } else {
                // fallback for old API shape
                setEmployees(Array.isArray(data) ? data : [])
            }
        } catch {
            toast.error("Failed to load employees")
        } finally {
            setLoading(false)
        }
    }, [statusFilter, deptFilter, empTypeFilter, siteFilter, search, page])

    // Debounce: reset to page 1 and refetch when filters change
    useEffect(() => {
        if (status === "unauthenticated") return
        const t = setTimeout(() => { setPage(1); fetchEmployees(1) }, 300)
        return () => clearTimeout(t)
    }, [statusFilter, deptFilter, empTypeFilter, siteFilter, search, status])

    // Re-fetch when page changes (not debounced)
    useEffect(() => {
        if (status !== "unauthenticated") fetchEmployees(page)
    }, [page])

    useEffect(() => {
        fetch("/api/departments").then(r => r.json()).then(data => setAllDepts(Array.isArray(data) ? data : [])).catch(() => {})
        fetch("/api/sites?isActive=true").then(r => r.json()).then(data => setSites(Array.isArray(data) ? data : [])).catch(() => {})
    }, [])

    // Auto-open drawer when ?id= param is present (e.g. from recruitment "View Employee")
    useEffect(() => {
        const id = searchParams.get("id")
        if (!id || loading) return
        const emp = employees.find(e => e.id === id)
        if (emp) {
            setDrawerEmployee(emp)
        } else {
            fetch(`/api/employees/${id}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (data) setDrawerEmployee(data) })
                .catch(() => {})
        }
    }, [searchParams, employees, loading])

    async function handleExport() {
        const cols = EXPORT_COLUMNS.filter(c => exportCols.has(c) && (c !== "Basic Salary" || canViewSalary))
        if (cols.length === 0) { toast.error("Pick at least one column"); return }
        const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined
        setExporting(true)
        try {
            const res = await fetch("/api/employees/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids, cols }),
            })
            if (!res.ok) { toast.error("Export failed"); return }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `employees_export_${new Date().toISOString().split("T")[0]}.xlsx`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
            toast.success(`Exported ${ids ? `${ids.length} selected` : "all"} employees`)
            setExportOpen(false)
        } catch {
            toast.error("Export failed")
        } finally {
            setExporting(false)
        }
    }

    async function handleDownloadTemplate() {
        const XLSX = await loadXLSX()
        const headers = [
            // ── Required ──────────────────────────────────────────────────────
            "First Name*", "Middle Name", "Last Name", "Fathers Name", "Phone*", "Email",
            // ── Employment ────────────────────────────────────────────────────
            "Designation", "Role", "Employment Type", "Status", "Date Of Joining",
            "Date Of Leaving", "Department", "Site",
            // ── Salary ────────────────────────────────────────────────────────
            "Basic Salary", "DA", "HRA", "Bonus",
            "Washing Allowance", "Conveyance Allowance",
            "Leave With Wages", "Other Allowance",
            "OT Rate Per Hour", "Canteen Rate Per Day", "Compliance Type",
            // ── Personal ──────────────────────────────────────────────────────
            "Name As Per Aadhar", "Date Of Birth", "Gender", "Blood Group",
            "Marital Status", "Nationality", "Religion", "Caste",
            // ── Address ───────────────────────────────────────────────────────
            "Address", "City", "State", "Pincode",
            "Permanent Address", "Permanent City", "Permanent State", "Permanent Pincode",
            // ── Identity / Statutory ──────────────────────────────────────────
            "Aadhar Number", "PAN Number", "UAN", "PF Number",
            "ESI Number", "Labour Card No",
            // ── Bank ──────────────────────────────────────────────────────────
            "Bank Name", "Bank Branch", "Bank Account Number", "Bank IFSC",
            // ── Contact ───────────────────────────────────────────────────────
            "Alternate Phone",
            "Emergency Contact 1 Name", "Emergency Contact 1 Phone",
            "Emergency Contact 2 Name", "Emergency Contact 2 Phone",
            // ── Work Details ──────────────────────────────────────────────────
            "Work Skill", "Nature Of Work", "Notes",
        ]

        const sample = [
            "Ramesh", "", "Kumar", "Suresh Kumar", "9876543210", "ramesh@example.com",
            "Guard", "", "Full-time", "ACTIVE", "2024-01-15",
            "", "", "Site Name Here",
            "12000", "1000", "0", "583",
            "500", "500",
            "0", "0",
            "170", "55", "OR",
            "", "1990-05-20", "Male", "O+",
            "Single", "Indian", "Hindu", "General",
            "123 MG Road", "Mumbai", "Maharashtra", "400001",
            "", "", "", "",
            "123456789012", "ABCDE1234F", "", "",
            "", "",
            "State Bank of India", "Andheri Branch", "00112233445566", "SBIN0001234",
            "",
            "Sita Devi", "9811223344",
            "", "",
            "", "", "",
        ]

        const instructions = [
            ["Field", "Required", "Valid Values / Format", "Example"],
            ["First Name*",        "Yes",  "Any text",                             "Ramesh"],
            ["Middle Name",        "No",   "Any text",                             ""],
            ["Last Name",          "No",   "Any text",                             "Kumar"],
            ["Fathers Name",       "No",   "Father's full name",                   "Suresh Kumar"],
            ["Phone*",             "Yes",  "10-digit mobile number",               "9876543210"],
            ["Email",              "No",   "Valid email",                          "ramesh@example.com"],
            ["Designation",        "No",   "Any text",                             "Security Guard"],
            ["Role",               "No",   "Must match a role name from the Roles page (login is created for every employee; blank = no role)", "Supervisor"],
            ["Employment Type",    "No",   "Full-time / Part-time / Contract / Daily Wage", "Full-time"],
            ["Status",             "No",   "ACTIVE / INACTIVE",                    "ACTIVE"],
            ["Date Of Joining",    "No",   "YYYY-MM-DD",                           "2024-01-15"],
            ["Date Of Leaving",    "No",   "YYYY-MM-DD (leave blank if active)",   ""],
            ["Department",         "No",   "Must match existing department name",  "Security"],
            ["Site",               "No",   "Must match existing site name exactly","Main Site"],
            ["Basic Salary",       "No",   "Number (monthly)",                     "12000"],
            ["DA",                 "No",   "Number",                               "1000"],
            ["HRA",                "No",   "Number — manual entry, no auto-calc",  "0"],
            ["Bonus",              "No",   "Number — manual entry, no auto-calc (Payment of Bonus Act)", "583"],
            ["Washing Allowance",  "No",   "Number",                               "500"],
            ["Conveyance Allowance","No",  "Number",                               "500"],
            ["Leave With Wages",   "No",   "Number",                               "0"],
            ["Other Allowance",    "No",   "Number",                               "0"],
            ["OT Rate Per Hour",   "No",   "Number (default 170)",                 "170"],
            ["Canteen Rate Per Day","No",  "Number (default 55)",                  "55"],
            ["Compliance Type",    "No",   "OR (full PF/ESI) / CALL (no PF/ESI)", "OR"],
            ["Gender",             "No",   "Male / Female / Other",                "Male"],
            ["Blood Group",        "No",   "A+ / A- / B+ / B- / O+ / O- / AB+ / AB-", "O+"],
            ["Marital Status",     "No",   "Single / Married / Divorced / Widowed","Single"],
            ["Date Of Birth",      "No",   "YYYY-MM-DD",                           "1990-05-20"],
            ["Bank Account Number","No",   "Full account number (no spaces)",      "00112233445566"],
            ["Bank IFSC",          "No",   "11-character IFSC code",               "SBIN0001234"],
            ["Aadhar Number",      "No",   "12-digit number",                      "123456789012"],
            ["PAN Number",         "No",   "10-character PAN",                     "ABCDE1234F"],
        ]

        const wb = XLSX.utils.book_new()

        // Sheet 1: Data
        const ws = XLSX.utils.aoa_to_sheet([headers, sample])
        ws["!cols"] = headers.map(() => ({ wch: 22 }))
        XLSX.utils.book_append_sheet(wb, ws, "Employees")

        // Sheet 2: Instructions
        const wi = XLSX.utils.aoa_to_sheet(instructions)
        wi["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 48 }, { wch: 22 }]
        XLSX.utils.book_append_sheet(wb, wi, "Instructions")

        XLSX.writeFile(wb, "employees_bulk_template.xlsx")
        toast.success("Template downloaded — fill Sheet 1 and re-import")
    }

    function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = async (ev) => {
            const XLSX = await loadXLSX()
            const arrayBuffer = ev.target?.result as ArrayBuffer
            const wb = XLSX.read(arrayBuffer, { type: "array" })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const rawRows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
            const normalized = rawRows.map(r => {
                const entry: Record<string, unknown> = {}
                for (const key of Object.keys(r)) {
                    const val = r[key]
                    // Normalize: lowercase, strip spaces/parens/slashes/dashes/asterisks/apostrophes
                    const lk = key.toLowerCase().replace(/[\s()/\-*']/g, "")
                    if      (lk === "firstname")               entry.firstName = val
                    else if (lk === "lastname")                entry.lastName = val
                    else if (lk === "phone")                   entry.phone = val
                    else if (lk === "email")                   entry.email = val
                    else if (lk === "designation")             entry.designation = val
                    else if (lk === "role")                    entry.role = val
                    else if (lk === "employmenttype")          entry.employmentType = val
                    else if (lk === "status")                  entry.status = val
                    else if (lk === "dateofjoining")           entry.dateOfJoining = val
                    else if (lk === "dateofleaving")           entry.dateOfLeaving = val
                    else if (lk === "department")              entry.department = val
                    else if (lk === "site")                    entry.site = val
                    // Salary
                    else if (lk === "basicsalary")             entry.basicSalary = val
                    else if (lk === "da")                      entry.da = val
                    else if (lk === "washingallowance")        entry.washing = val
                    else if (lk === "conveyanceallowance")     entry.conveyance = val
                    else if (lk === "leavewithwages")          entry.leaveWithWages = val
                    else if (lk === "otherallowance")          entry.otherAllowance = val
                    else if (lk === "bonus")                   entry.bonus = val
                    else if (lk === "hra")                     entry.hra = val
                    else if (lk === "otrateperhour")           entry.otRatePerHour = val
                    else if (lk === "canteenrateperday")       entry.canteenRatePerDay = val
                    else if (lk === "compliancetype")          entry.complianceType = val
                    // Personal
                    else if (lk === "middlename")              entry.middleName = val
                    else if (lk === "nameasperaadhar")         entry.nameAsPerAadhar = val
                    else if (lk === "fathersname")             entry.fathersName = val
                    else if (lk === "dateofbirth")             entry.dateOfBirth = val
                    else if (lk === "gender")                  entry.gender = val
                    else if (lk === "bloodgroup")              entry.bloodGroup = val
                    else if (lk === "maritalstatus")           entry.maritalStatus = val
                    else if (lk === "nationality")             entry.nationality = val
                    else if (lk === "religion")                entry.religion = val
                    else if (lk === "caste")                   entry.caste = val
                    // Address
                    else if (lk === "address")                 entry.address = val
                    else if (lk === "city")                    entry.city = val
                    else if (lk === "state")                   entry.state = val
                    else if (lk === "pincode")                 entry.pincode = val
                    else if (lk === "permanentaddress")        entry.permanentAddress = val
                    else if (lk === "permanentcity")           entry.permanentCity = val
                    else if (lk === "permanentstate")          entry.permanentState = val
                    else if (lk === "permanentpincode")        entry.permanentPincode = val
                    // Identity
                    else if (lk === "aadharnumber")            entry.aadharNumber = val
                    else if (lk === "pannumber")               entry.panNumber = val
                    else if (lk === "uan")                     entry.uan = val
                    else if (lk === "pfnumber")                entry.pfNumber = val
                    else if (lk === "esinumber")               entry.esiNumber = val
                    else if (lk === "labourcardno")            entry.labourCardNo = val
                    // Bank
                    else if (lk === "bankname")                entry.bankName = val
                    else if (lk === "bankbranch")              entry.bankBranch = val
                    else if (lk === "bankaccountnumber")       entry.bankAccountNumber = val
                    else if (lk === "bankifsc")                entry.bankIFSC = val
                    // Contact
                    else if (lk === "alternatephone")          entry.alternatePhone = val
                    else if (lk === "emergencycontact1name")   entry.emergencyContact1Name = val
                    else if (lk === "emergencycontact1phone")  entry.emergencyContact1Phone = val
                    else if (lk === "emergencycontact2name")   entry.emergencyContact2Name = val
                    else if (lk === "emergencycontact2phone")  entry.emergencyContact2Phone = val
                    // Work
                    else if (lk === "workskill")               entry.workSkill = val
                    else if (lk === "natureofwork")            entry.natureOfWork = val
                    else if (lk === "notes")                   entry.notes = val
                }
                return entry
            })
            setImportRows(normalized)
            setImportResult(null)
        }
        reader.readAsArrayBuffer(file)
    }

    async function handleImportSubmit() {
        if (importRows.length === 0) return
        setImportLoading(true)
        const BATCH = 50
        const total = importRows.length
        setImportProgress({ done: 0, total })
        let totalImported = 0, totalSkipped = 0
        const allErrors: { row: number; reason: string }[] = []
        try {
            for (let start = 0; start < total; start += BATCH) {
                const chunk = importRows.slice(start, start + BATCH)
                const res = await fetch("/api/employees/import", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rows: chunk }),
                })
                const data = await res.json()
                totalImported += data.imported ?? 0
                totalSkipped  += data.skipped  ?? 0
                // Adjust row numbers to global offset
                for (const e of (data.errors ?? [])) {
                    allErrors.push({ row: e.row + start, reason: e.reason })
                }
                setImportProgress({ done: Math.min(start + BATCH, total), total })
            }
            const result = { imported: totalImported, skipped: totalSkipped, errors: allErrors }
            setImportResult(result)
            if (totalImported > 0) {
                toast.success(`${totalImported} employee(s) imported`)
                fetchEmployees()
            } else {
                toast.error("No employees imported — check errors below")
            }
        } catch {
            toast.error("Import failed")
        } finally {
            setImportLoading(false)
        }
    }

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

    const handleBulkDelete = async () => {
        setBulkDeleting(true)
        try {
            const res = await fetch("/api/employees", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: Array.from(selectedIds) }),
            })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            toast.success(`${data.deleted} employee${data.deleted !== 1 ? "s" : ""} permanently deleted`)
            setShowBulkDeleteConfirm(false)
            fetchEmployees()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Bulk delete failed")
        } finally {
            setBulkDeleting(false)
        }
    }

    // Stats — use server total for the summary card, page-local for other counts
    const total = totalCount || employees.length
    const active = employees.filter(e => e.status === "ACTIVE").length
    const onLeave = employees.filter(e => e.status === "ON_LEAVE").length
    const now = new Date()
    const terminatedResignedThisMonth = employees.filter(e => {
        if (e.status !== "TERMINATED" && e.status !== "RESIGNED") return false
        const updated = new Date(e.createdAt)
        return updated.getMonth() === now.getMonth() && updated.getFullYear() === now.getFullYear()
    }).length


    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-[12px] bg-[var(--accent-light)] flex items-center justify-center shrink-0">
                        <Users size={20} className="text-[var(--accent-text)]" />
                    </div>
                    <div>
                        <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)]">Employees</h1>
                        <p className="text-[13px] text-[var(--text3)] mt-0.5">Manage your workforce and track employee information</p>
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ position: "relative" }}>
                        <button
                            onClick={() => setExportOpen(o => !o)}
                            title="Export to Excel — pick rows & columns"
                            style={{ display: "flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "13px", fontWeight: 500, borderRadius: "8px", cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                            <Download size={15} />
                            Export{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                        </button>
                        {exportOpen && (
                            <>
                                <div onClick={() => setExportOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                                <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 280, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 10px 32px rgba(0,0,0,0.15)", zIndex: 50, padding: 12 }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Export to Excel</span>
                                        <span style={{ fontSize: 11, color: "var(--text3)" }}>
                                            {selectedIds.size > 0 ? `${selectedIds.size} row(s)` : `All rows (${totalCount})`}
                                        </span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                                        <button onClick={() => setExportCols(new Set(EXPORT_COLUMNS))} style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Select all</button>
                                        <button onClick={() => setExportCols(new Set())} style={{ fontSize: 11, color: "var(--text3)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Clear</button>
                                    </div>
                                    <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: 6, marginBottom: 10 }}>
                                        {EXPORT_COLUMNS.filter(c => c !== "Basic Salary" || canViewSalary).map(c => (
                                            <label key={c} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 4px", fontSize: 12.5, color: "var(--text2)", cursor: "pointer" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={exportCols.has(c)}
                                                    onChange={() => setExportCols(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })}
                                                    style={{ accentColor: "var(--accent)" }}
                                                />
                                                {c}
                                            </label>
                                        ))}
                                    </div>
                                    <button
                                        onClick={handleExport}
                                        disabled={exporting}
                                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", opacity: exporting ? 0.6 : 1 }}
                                    >
                                        {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                        {exporting ? "Exporting…" : `Download ${selectedIds.size > 0 ? `${selectedIds.size} selected` : "all"}`}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    <button
                        onClick={() => { setShowImportModal(true); setImportRows([]); setImportResult(null); if (importFileRef.current) importFileRef.current.value = "" }}
                        title="Import from Excel"
                        style={{ display: "flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "13px", fontWeight: 500, borderRadius: "8px", cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                        <Upload size={15} />
                        Import
                    </button>
                    <button
                        onClick={() => { setEditEmployee(null); setShowModal(true) }}
                        className="inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                    >
                        <Plus size={16} /> Add Employee
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                    label="Total Employees" value={counts?.total ?? total}
                    icon={<Users size={18} />} color="#0d6b4a" bg="#e8f7f1" sparkColor="#1a9e6e" seed={0}
                    trend={counts && counts.newThisMonth.total > 0 ? { dir: "up", text: `${counts.newThisMonth.total} this month` } : { dir: "flat", text: "No change" }}
                />
                <StatCard
                    label="Active Employees" value={counts?.active ?? active}
                    icon={<CheckCircle size={18} />} color="#16a34a" bg="#dcfce7" sparkColor="#16a34a" seed={1}
                    trend={counts && counts.newThisMonth.active > 0 ? { dir: "up", text: `${counts.newThisMonth.active} this month` } : { dir: "flat", text: "No change" }}
                />
                <StatCard
                    label="On Leave" value={counts?.onLeave ?? onLeave}
                    icon={<Clock size={18} />} color="#d97706" bg="#fffbeb" sparkColor="#f59e0b" seed={2}
                    trend={{ dir: "flat", text: "No change" }}
                />
                <StatCard
                    label="Terminated / Resigned" value={counts ? counts.terminated + counts.resigned : terminatedResignedThisMonth}
                    icon={<TrendingDown size={18} />} color="#dc2626" bg="#fef2f2" sparkColor="#ef4444" seed={1}
                    trend={counts && counts.newThisMonth.terminated > 0 ? { dir: "down", text: `${counts.newThisMonth.terminated} this month` } : { dir: "flat", text: "No change" }}
                />
            </div>

            {/* Status tabs — underline style */}
            <div className="border-b border-[var(--border)] overflow-x-auto">
                <div className="flex items-center gap-1 min-w-max">
                    {[{ k: "", label: "All" }, ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ k, label: v.label }))].map(({ k, label }) => (
                        <button
                            key={k}
                            onClick={() => setStatusFilter(k)}
                            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                                statusFilter === k
                                    ? "border-[var(--accent)] text-[var(--accent-text)]"
                                    : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Search + dropdowns */}
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[220px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && fetchEmployees()}
                        placeholder="Search by name, ID, phone, email..."
                        className="w-full h-10 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                    />
                </div>
                <div className="relative">
                    <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                    <select
                        value={deptFilter}
                        onChange={e => setDeptFilter(e.target.value)}
                        className="h-10 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] pl-8 pr-8 text-[13px] text-[var(--text2)] outline-none focus:border-[var(--accent)] transition-colors cursor-pointer appearance-none"
                    >
                        <option value="">All Departments</option>
                        {allDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                </div>
                <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                    <select
                        value={siteFilter}
                        onChange={e => setSiteFilter(e.target.value)}
                        className="h-10 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] pl-8 pr-8 text-[13px] text-[var(--text2)] outline-none focus:border-[var(--accent)] transition-colors cursor-pointer appearance-none"
                    >
                        <option value="">All Sites</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                </div>
                <div className="relative">
                    <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                    <select
                        value={empTypeFilter}
                        onChange={e => setEmpTypeFilter(e.target.value)}
                        className="h-10 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] pl-8 pr-8 text-[13px] text-[var(--text2)] outline-none focus:border-[var(--accent)] transition-colors cursor-pointer appearance-none"
                    >
                        <option value="">All Employment Types</option>
                        {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                </div>
                {(deptFilter || siteFilter || empTypeFilter || search) && (
                    <button
                        onClick={() => { setDeptFilter(""); setSiteFilter(""); setEmpTypeFilter(""); setSearch("") }}
                        className="h-10 px-3.5 inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
                    >
                        <X size={14} /> Clear
                    </button>
                )}
            </div>

            {/* Employee Table */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
                </div>
            ) : employees.length === 0 ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[14px] bg-[var(--surface2)] border border-dashed border-[var(--border)] shadow-sm">
                    <UserCheck size={36} className="text-[var(--text3)] mb-2" />
                    <h3 className="text-[15px] font-semibold text-[var(--text)]">No employees found</h3>
                    <p className="text-[13px] text-[var(--text3)] mt-1">Add your first employee to get started.</p>
                </div>
            ) : (
                <>
                {/* Bulk action bar */}
                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-[10px]">
                        <span className="text-[13px] font-semibold text-[var(--accent)]">{selectedIds.size} employee{selectedIds.size !== 1 ? "s" : ""} selected</span>
                        <button
                            onClick={handleExport}
                            disabled={exporting}
                            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#16a34a] text-white rounded-[7px] text-[12px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                        >
                            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                            {exporting ? "Exporting…" : "Export Selected"}
                        </button>
                        {canDelete && (
                            <button
                                onClick={() => setShowBulkDeleteConfirm(true)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-[7px] text-[12px] font-semibold hover:bg-red-700 transition-colors"
                            >
                                <Trash2 size={13} /> Delete Selected
                            </button>
                        )}
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text2)] rounded-[7px] text-[12px] font-medium hover:bg-[var(--surface2)] transition-colors"
                        >
                            <X size={13} /> Clear
                        </button>
                    </div>
                )}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[var(--border)] bg-[var(--surface2)]/40">
                                    {canDelete && (
                                        <th className="px-4 py-3 w-10">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                                                checked={employees.length > 0 && employees.every(e => selectedIds.has(e.id))}
                                                onChange={e => {
                                                    if (e.target.checked) setSelectedIds(new Set(employees.map(emp => emp.id)))
                                                    else setSelectedIds(new Set())
                                                }}
                                            />
                                        </th>
                                    )}
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-5 py-3">Employee</th>
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Department</th>
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Site</th>
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Type</th>
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Phone</th>
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Joined</th>
                                    {canViewSalary && (
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
                                            className={`border-b border-[var(--border)] hover:bg-[var(--surface2)]/30 transition-colors ${selectedIds.has(emp.id) ? "bg-[var(--accent)]/5" : ""} ${i === employees.length - 1 ? "border-b-0" : ""}`}
                                        >
                                            {canDelete && (
                                                <td className="px-4 py-3 w-10">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                                                        checked={selectedIds.has(emp.id)}
                                                        onChange={e => {
                                                            setSelectedIds(prev => {
                                                                const next = new Set(prev)
                                                                if (e.target.checked) next.add(emp.id)
                                                                else next.delete(emp.id)
                                                                return next
                                                            })
                                                        }}
                                                    />
                                                </td>
                                            )}
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
                                                        {(emp as any).user?.customRole?.name && (
                                                            <span
                                                                style={{
                                                                    color: (emp as any).user.customRole.color || "#6366f1",
                                                                    background: `${(emp as any).user.customRole.color || "#6366f1"}15`,
                                                                    borderColor: `${(emp as any).user.customRole.color || "#6366f1"}40`,
                                                                }}
                                                                className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border"
                                                            >
                                                                {(emp as any).user.customRole.name}
                                                            </span>
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
                                            <td className="px-4 py-3">
                                                {emp.deployments?.[0]?.site ? (
                                                    <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-[6px] text-[12px] text-blue-700 font-medium whitespace-nowrap">
                                                        {emp.deployments[0].site.name}
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
                                            {canViewSalary && (
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
                                                        canDelete={canDelete}
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
                </>
            )}

            {/* Bulk Delete Confirmation Modal */}
            {showBulkDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-6 w-full max-w-sm shadow-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                <Trash2 size={18} className="text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-[15px] font-semibold text-[var(--text)]">Delete {selectedIds.size} Employee{selectedIds.size !== 1 ? "s" : ""}?</h3>
                                <p className="text-[12px] text-[var(--text3)] mt-0.5">This will permanently remove all their records. Cannot be undone.</p>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end mt-5">
                            <button
                                onClick={() => setShowBulkDeleteConfirm(false)}
                                disabled={bulkDeleting}
                                className="px-4 py-2 rounded-[8px] text-[13px] font-medium bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                disabled={bulkDeleting}
                                className="px-4 py-2 rounded-[8px] text-[13px] font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
                            >
                                {bulkDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                {bulkDeleting ? "Deleting…" : `Delete ${selectedIds.size}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 4px", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text3)" }}>
                        Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount} employees
                    </span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button onClick={() => setPage(1)} disabled={page === 1}
                            style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.4 : 1, color: "var(--text2)" }}>
                            «
                        </button>
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                            style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.4 : 1, color: "var(--text2)" }}>
                            ‹ Prev
                        </button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
                            return (
                                <button key={p} onClick={() => setPage(p)}
                                    style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 12, cursor: "pointer",
                                        background: p === page ? "var(--accent)" : "var(--surface)",
                                        color: p === page ? "#fff" : "var(--text2)", fontWeight: p === page ? 700 : 400 }}>
                                    {p}
                                </button>
                            )
                        })}
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                            style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.4 : 1, color: "var(--text2)" }}>
                            Next ›
                        </button>
                        <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                            style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.4 : 1, color: "var(--text2)" }}>
                            »
                        </button>
                    </div>
                </div>
            )}

            {/* Modals */}
            <EmployeeModal
                open={showModal}
                onClose={() => { setShowModal(false); setEditEmployee(null) }}
                onSaved={fetchEmployees}
                employee={editEmployee}
                allSites={sites}
            />
            <EmployeeDrawer
                employee={drawerEmployee}
                onClose={() => setDrawerEmployee(null)}
                onEdit={(e) => { setDrawerEmployee(null); setEditEmployee(e); setShowModal(true) }}
                onStatusChange={handleStatusChange}
                isAdmin={isAdmin}
                canViewSalary={canViewSalary}
            />

            {/* Import Modal */}
            {showImportModal && (
                <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)" }}>
                    <div style={{ background: "var(--surface)", borderRadius: "14px", width: "min(680px, 96vw)", maxHeight: "88vh", overflowY: "auto", padding: "24px", position: "relative" }}>
                        <button onClick={() => setShowImportModal(false)} style={{ position: "absolute", top: "14px", right: "14px", background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}><X size={18} /></button>
                        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: "var(--text)" }}>Import Employees</h2>

                        <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "7px", padding: "8px 14px", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", fontSize: "13px", color: "var(--text)", background: "var(--surface)" }}>
                                <Upload size={14} /> Choose File (.xlsx / .csv)
                                <input ref={importFileRef} type="file" accept=".xlsx,.csv" onChange={handleImportFile} style={{ display: "none" }} />
                            </label>
                            <button onClick={handleDownloadTemplate} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "8px 14px", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", fontSize: "13px", color: "var(--text)", background: "var(--surface)" }}>
                                <Download size={14} /> Download Template
                            </button>
                        </div>

                        {importRows.length > 0 && !importResult && (
                            <>
                                <p style={{ fontSize: "12px", color: "var(--text3)", marginBottom: "8px" }}>Preview (first 5 rows of {importRows.length} total)</p>
                                <div style={{ overflowX: "auto", marginBottom: "16px" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                        <thead>
                                            <tr style={{ background: "var(--surface)" }}>
                                                {["First Name", "Last Name", "Phone", "Email", "Designation"].map(h => (
                                                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text3)", fontWeight: 600 }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {importRows.slice(0, 5).map((r, i) => (
                                                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                                    <td style={{ padding: "6px 10px", color: "var(--text)" }}>{String(r.firstName ?? "")}</td>
                                                    <td style={{ padding: "6px 10px", color: "var(--text)" }}>{String(r.lastName ?? "")}</td>
                                                    <td style={{ padding: "6px 10px", color: "var(--text)" }}>{String(r.phone ?? "")}</td>
                                                    <td style={{ padding: "6px 10px", color: "var(--text)" }}>{String(r.email ?? "")}</td>
                                                    <td style={{ padding: "6px 10px", color: "var(--text)" }}>{String(r.designation ?? "")}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {importLoading && importProgress.total > 0 && (
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>
                                            <span>Importing… {importProgress.done} / {importProgress.total}</span>
                                            <span>{Math.round(importProgress.done / importProgress.total * 100)}%</span>
                                        </div>
                                        <div style={{ height: 6, borderRadius: 4, background: "var(--border)" }}>
                                            <div style={{ height: 6, borderRadius: 4, background: "var(--accent)", width: `${Math.round(importProgress.done / importProgress.total * 100)}%`, transition: "width 0.3s" }} />
                                        </div>
                                    </div>
                                )}
                                <button
                                    onClick={handleImportSubmit}
                                    disabled={importLoading}
                                    style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: importLoading ? "not-allowed" : "pointer", opacity: importLoading ? 0.7 : 1 }}
                                >
                                    {importLoading && <Loader2 size={14} className="animate-spin" />}
                                    {importLoading ? `Importing ${importProgress.done}/${importProgress.total}…` : `Import ${importRows.length} rows`}
                                </button>
                            </>
                        )}

                        {importResult && (
                            <div style={{ padding: "14px 16px", borderRadius: "10px", background: importResult.imported > 0 ? "#e8f7f1" : "#fef2f2", border: `1px solid ${importResult.imported > 0 ? "#6ee7b7" : "#fecaca"}` }}>
                                <p style={{ fontSize: "14px", fontWeight: 600, color: importResult.imported > 0 ? "#047857" : "#dc2626", marginBottom: "4px" }}>
                                    ✓ {importResult.imported} imported, {importResult.skipped} skipped (duplicates / errors)
                                </p>
                                {importResult.errors.length > 0 && (
                                    <ul style={{ margin: "8px 0 0 0", padding: "0 0 0 16px", fontSize: "12px", color: "#6b7280" }}>
                                        {importResult.errors.slice(0, 5).map((e, i) => <li key={i}>Row {e.row}: {e.reason}</li>)}
                                        {importResult.errors.length > 5 && <li>…and {importResult.errors.length - 5} more</li>}
                                    </ul>
                                )}
                            </div>
                        )}

                        {importRows.length === 0 && !importResult && (
                            <p style={{ fontSize: "13px", color: "var(--text3)" }}>Select an .xlsx or .csv file to preview and import employees.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default function EmployeesPageWrapper() {
    return (
        <Suspense>
            <EmployeesPage />
        </Suspense>
    )
}
