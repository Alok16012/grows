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
    User, CreditCard, MapPin, LogOut, Download, Upload,
    Copy, Link2, RefreshCw
} from "lucide-react"
import { format } from "date-fns"
import * as XLSX from "xlsx"
import { DocumentViewer } from "@/components/DocumentViewer"

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
    managerId?: string
    notes?: string
    photo?: string
    createdAt: string
    deployments?: { id: string; site: { id: string; name: string } }[]
    department?: { id: string; name: string }
    _count: { attendances: number; leaves: number }
    // New fields
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
    emergencyContact1Name?: string
    emergencyContact1Phone?: string
    emergencyContact2Name?: string
    emergencyContact2Phone?: string
    safetyGoggles?: boolean
    safetyGloves?: boolean
    safetyHelmet?: boolean
    safetyMask?: boolean
    safetyJacket?: boolean
    safetyEarMuffs?: boolean
    safetyShoes?: boolean
    onboardingToken?: string
    employeeSalary?: {
        basic: number; da: number; washing: number; conveyance: number
        leaveWithWages: number; otherAllowance: number
        otRatePerHour: number; canteenRatePerDay: number
        complianceType?: string; status?: string
    } | null
}

type Site = { id: string; name: string; code?: string }
type Department = { id: string; name: string }

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
    customRoleId: string; systemRole: string; role: string
    address: string; city: string; state: string; pincode: string
    permanentAddress: string; permanentCity: string; permanentState: string; permanentPincode: string
    bankName: string; bankBranch: string; bankAccountNumber: string; bankIFSC: string
    status: string; notes: string
    // Compliance
    middleName: string; nameAsPerAadhar: string; fathersName: string; bloodGroup: string
    maritalStatus: string; nationality: string; religion: string; caste: string
    uan: string; pfNumber: string; esiNumber: string; labourCardNo: string
    emergencyContact1Name: string; emergencyContact1Phone: string
    emergencyContact2Name: string; emergencyContact2Phone: string
    // Safety
    safetyGoggles: boolean; safetyGloves: boolean; safetyHelmet: boolean
    safetyMask: boolean; safetyJacket: boolean; safetyEarMuffs: boolean; safetyShoes: boolean
    // Salary Structure
    salDA: string; salWashing: string; salConveyance: string; salLeaveWithWages: string
    salOtherAllowance: string; salOtRatePerHour: string; salCanteenRatePerDay: string
    salComplianceType: string
    // Site Deployment
    siteId: string; deployShift: string; deployRole: string; deployStartDate: string
}

const EMPTY_FORM: ModalForm = {
    firstName: "", lastName: "", email: "", phone: "", alternatePhone: "",
    dateOfBirth: "", gender: "", aadharNumber: "", panNumber: "",
    designation: "Security Guard", departmentId: "", branchId: "", managerId: "",
    dateOfJoining: "", employmentType: "Full-time", salaryType: "Monthly", basicSalary: "",
    customRoleId: "", systemRole: "INSPECTION_BOY", role: "Security Guard",
    address: "", city: "", state: "", pincode: "",
    permanentAddress: "", permanentCity: "", permanentState: "", permanentPincode: "",
    bankName: "", bankBranch: "", bankAccountNumber: "", bankIFSC: "",
    status: "ACTIVE", notes: "",
    // Compliance
    middleName: "", nameAsPerAadhar: "", fathersName: "", bloodGroup: "",
    maritalStatus: "", nationality: "Indian", religion: "", caste: "",
    uan: "", pfNumber: "", esiNumber: "", labourCardNo: "",
    emergencyContact1Name: "", emergencyContact1Phone: "",
    emergencyContact2Name: "", emergencyContact2Phone: "",
    // Safety
    safetyGoggles: false, safetyGloves: false, safetyHelmet: false,
    safetyMask: false, safetyJacket: false, safetyEarMuffs: false, safetyShoes: false,
    // Salary Structure
    salDA: "", salWashing: "", salConveyance: "", salLeaveWithWages: "",
    salOtherAllowance: "", salOtRatePerHour: "170", salCanteenRatePerDay: "55",
    salComplianceType: "OR",
    // Site Deployment
    siteId: "", deployShift: "", deployRole: "", deployStartDate: "",
}


function CredentialsModal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
    const [copied, setCopied] = useState(false)
    const copy = () => {
        navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }
    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <CheckCircle size={20} style={{ color: "#16a34a" }} />
                    </div>
                    <div>
                        <p style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", margin: 0 }}>Employee Account Created</p>
                        <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>Share these login credentials with the employee</p>
                    </div>
                </div>
                <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                    <div style={{ marginBottom: 10 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px", margin: "0 0 3px" }}>Login Email / ID</p>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0, wordBreak: "break-all" }}>{email}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px", margin: "0 0 3px" }}>Password</p>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0, fontFamily: "monospace", letterSpacing: "1px" }}>{password}</p>
                    </div>
                </div>
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <User size={14} style={{ color: "#16a34a", flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 12, color: "#15803d", margin: 0 }}>
                        Employee can log in and go to <b>My Profile</b> to fill in all remaining details — personal info, KYC, bank, emergency contacts and documents.
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={copy} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid var(--border)", background: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                        {copied ? "Copied!" : "Copy Credentials"}
                    </button>
                    <button onClick={onClose} style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    )
}

function EmployeeModal({
    open, onClose, onSaved, employee, allSites,
}: {
    open: boolean; onClose: () => void; onSaved: () => void; employee?: Employee | null
    allSites: { id: string; name: string }[]
}) {
    const [loading, setLoading] = useState(false)
    const [newCredentials, setNewCredentials] = useState<{ email: string; password: string } | null>(null)
    const [sameAsCurrent, setSameAsCurrent] = useState(false)
    const [departments, setDepartments] = useState<Department[]>([])
    const [customRoles, setCustomRoles] = useState<{ id: string; name: string; color: string }[]>([])
    const sites = allSites
    const [activeTab, setActiveTab] = useState<"personal" | "employment" | "salary" | "bank" | "compliance" | "safety" | "documents">("personal")
    const [form, setForm] = useState<ModalForm>(EMPTY_FORM)
    // Pending documents to upload after employee creation
    type PendingDoc = { type: string; fileName: string; fileUrl: string }
    type ExistingDoc = { id: string; type: string; fileName: string; fileUrl: string; status: string; uploadedAt: string }
    const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([])
    const [existingDocs, setExistingDocs] = useState<ExistingDoc[]>([])
    const [docUploading, setDocUploading] = useState(false)
    const [docDeleting, setDocDeleting] = useState<string | null>(null)
    const docFileRef = useRef<HTMLInputElement>(null)
    const [docType, setDocType] = useState("AADHAAR")
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewName, setPreviewName] = useState<string>("")

    const fetchExistingDocs = async (empId: string) => {
        try {
            const r = await fetch(`/api/employees/${empId}/documents`)
            if (r.ok) setExistingDocs(await r.json())
        } catch { /* ignore */ }
    }

    useEffect(() => {
        fetch("/api/admin/roles").then(r => r.ok ? r.json() : []).then(setCustomRoles).catch(() => {})
    }, [])

    // Branches derivation removed

    // Fetch existing docs when documents tab is opened for an existing employee
    useEffect(() => {
        if (activeTab === "documents" && employee) {
            fetchExistingDocs(employee.id)
        }
    }, [activeTab, employee])


    useEffect(() => {
        if (!open) return
        setActiveTab("personal")
        setSameAsCurrent(false)
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
                branchId: employee.branchId || "",
                managerId: employee.managerId || "",
                dateOfJoining: employee.dateOfJoining ? employee.dateOfJoining.split("T")[0] : "",
                employmentType: employee.employmentType,
                salaryType: employee.salaryType || "Monthly",
                basicSalary: String(employee.employeeSalary?.basic ?? employee.basicSalary),
                address: employee.address || "",
                city: employee.city || "",
                state: employee.state || "",
                pincode: employee.pincode || "",
                permanentAddress: employee.permanentAddress || "",
                permanentCity: employee.permanentCity || "",
                permanentState: employee.permanentState || "",
                permanentPincode: employee.permanentPincode || "",
                bankName: employee.bankName || "",
                bankBranch: employee.bankBranch || "",
                bankAccountNumber: employee.bankAccountNumber || "",
                bankIFSC: employee.bankIFSC || "",
                status: employee.status,
                notes: employee.notes || "",
                // Compliance
                middleName: employee.middleName || "",
                nameAsPerAadhar: employee.nameAsPerAadhar || "",
                fathersName: employee.fathersName || "",
                bloodGroup: employee.bloodGroup || "",
                maritalStatus: employee.maritalStatus || "",
                nationality: employee.nationality || "Indian",
                religion: employee.religion || "",
                caste: employee.caste || "",
                uan: employee.uan || "",
                pfNumber: employee.panNumber || "",
                esiNumber: employee.esiNumber || "",
                labourCardNo: employee.labourCardNo || "",
                emergencyContact1Name: employee.emergencyContact1Name || "",
                emergencyContact1Phone: employee.emergencyContact1Phone || "",
                emergencyContact2Name: employee.emergencyContact2Name || "",
                emergencyContact2Phone: employee.emergencyContact2Phone || "",
                // Safety
                safetyGoggles: employee.safetyGoggles ?? false,
                safetyGloves: employee.safetyGloves ?? false,
                safetyHelmet: employee.safetyHelmet ?? false,
                safetyMask: employee.safetyMask ?? false,
                safetyJacket: employee.safetyJacket ?? false,
                safetyEarMuffs: employee.safetyEarMuffs ?? false,
                safetyShoes: employee.safetyShoes ?? false,
                customRoleId: "",
                systemRole: "INSPECTION_BOY",
                role: employee.designation || "Security Guard",
                // Salary Structure — pre-fill from existing record
                salDA:                String(employee.employeeSalary?.da               ?? ""),
                salWashing:           String(employee.employeeSalary?.washing          ?? ""),
                salConveyance:        String(employee.employeeSalary?.conveyance       ?? ""),
                salLeaveWithWages:    String(employee.employeeSalary?.leaveWithWages   ?? ""),
                salOtherAllowance:    String(employee.employeeSalary?.otherAllowance   ?? ""),
                salOtRatePerHour:     String(employee.employeeSalary?.otRatePerHour    ?? "170"),
                salCanteenRatePerDay: String(employee.employeeSalary?.canteenRatePerDay ?? "55"),
                salComplianceType:    employee.employeeSalary?.complianceType          ?? "OR",
                // Site Deployment
                siteId: employee.deployments?.[0]?.site?.id || "", deployShift: "", deployRole: "", deployStartDate: "",
            })
        } else {
            setForm(EMPTY_FORM)
        }
    }, [employee, open])

    useEffect(() => {
        fetch(`/api/departments`)
            .then(r => r.json())
            .then(data => setDepartments(Array.isArray(data) ? data : []))
            .catch(() => setDepartments([]))
    }, [])

    const set = (key: keyof ModalForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.firstName.trim()) {
            toast.error("First name is required")
            return
        }
        setLoading(true)
        try {
            const url = employee ? `/api/employees/${employee.id}` : "/api/employees"
            const method = employee ? "PUT" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    designation: form.role,
                }),
            })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            const empId = data.id || employee?.id

            // Save salary structure if any salary fields are filled
            const hasSalary = form.basicSalary || form.salDA || form.salWashing || form.salConveyance
            if (empId && hasSalary) {
                try {
                    await fetch(`/api/payroll/salary-structure/${empId}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            basic: Number(form.basicSalary) || 0,
                            da: Number(form.salDA) || 0,
                            washing: Number(form.salWashing) || 0,
                            conveyance: Number(form.salConveyance) || 0,
                            leaveWithWages: Number(form.salLeaveWithWages) || 0,
                            otherAllowance: Number(form.salOtherAllowance) || 0,
                            otRatePerHour: Number(form.salOtRatePerHour) || 170,
                            canteenRatePerDay: Number(form.salCanteenRatePerDay) || 55,
                            complianceType: form.salComplianceType || "OR",
                            status: "APPROVED",
                        }),
                    })
                } catch { /* salary structure save failed silently */ }
            }

            // Upload pending documents
            if (empId && pendingDocs.length > 0) {
                for (const doc of pendingDocs) {
                    try {
                        await fetch(`/api/employees/${empId}/documents`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(doc),
                        })
                    } catch { /* doc upload failed silently */ }
                }
                setPendingDocs([])
            }

            // Create or update site deployment if site is selected
            if (empId && form.siteId) {
                try {
                    const currentDeployment = employee?.deployments?.[0]
                    const currentSiteId = currentDeployment?.site?.id
                    if (currentSiteId !== form.siteId) {
                        // Relieve existing deployment before creating a new one
                        if (currentDeployment?.id) {
                            await fetch(`/api/deployments/${currentDeployment.id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ relievedAt: new Date().toISOString() }),
                            })
                        }
                        await fetch("/api/deployments", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                employeeId: empId,
                                siteId: form.siteId,
                                startDate: form.deployStartDate || new Date().toISOString().split("T")[0],
                                shift: form.deployShift || null,
                                role: form.deployRole || null,
                            }),
                        })
                    }
                } catch { /* deployment update failed silently */ }
            }

            onSaved()
            if (!employee && data._userCreated) {
                setNewCredentials({ email: data._loginEmail, password: data._loginPassword })
            } else {
                toast.success(employee ? "Employee updated!" : "Employee added!")
                onClose()
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to save")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null

    if (newCredentials) {
        return <CredentialsModal email={newCredentials.email} password={newCredentials.password} onClose={() => { setNewCredentials(null); onClose() }} />
    }

    const setCheck = (key: keyof ModalForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [key]: e.target.checked }))

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
                <div className="flex border-b border-[var(--border)] px-6 overflow-x-auto">
                    {(["personal", "employment", "salary", "bank", "compliance", "safety", "documents"] as const).map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={tabCls(t)}>
                            {t === "personal" ? "Personal" : t === "employment" ? "Employment" : t === "salary" ? "Salary" : t === "bank" ? "Bank" : t === "compliance" ? "Compliance" : t === "safety" ? "Safety" : `Docs${pendingDocs.length ? ` (${pendingDocs.length})` : ""}`}
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
                                    <label className={labelCls}>Last Name</label>
                                    <input value={form.lastName} onChange={set("lastName")} className={inputCls} placeholder="Last name" />
                                </div>
                                <div>
                                    <label className={labelCls}>Phone</label>
                                    <input value={form.phone} onChange={set("phone")} className={inputCls} placeholder="Phone number" />
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

                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase mt-2">Current Address</p>
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
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase mt-2">Permanent Address</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2 flex items-center gap-2">
                                    <input type="checkbox" id="sameAsCurrent" checked={sameAsCurrent} onChange={e => {
                                        const checked = e.target.checked
                                        if (checked) {
                                            setForm(f => ({ ...f, permanentAddress: f.address, permanentCity: f.city, permanentState: f.state, permanentPincode: f.pincode }))
                                        }
                                        setSameAsCurrent(checked)
                                    }} className="w-4 h-4" />
                                    <label htmlFor="sameAsCurrent" className="text-sm text-[var(--text2)] cursor-pointer">Same as current address</label>
                                </div>
                                <div className="col-span-2">
                                    <label className={labelCls}>Address</label>
                                    <input value={form.permanentAddress} onChange={set("permanentAddress")} className={inputCls} placeholder="Street address" disabled={sameAsCurrent} />
                                </div>
                                <div>
                                    <label className={labelCls}>City</label>
                                    <input value={form.permanentCity} onChange={set("permanentCity")} className={inputCls} placeholder="City" disabled={sameAsCurrent} />
                                </div>
                                <div>
                                    <label className={labelCls}>State</label>
                                    <input value={form.permanentState} onChange={set("permanentState")} className={inputCls} placeholder="State" disabled={sameAsCurrent} />
                                </div>
                                <div>
                                    <label className={labelCls}>Pincode</label>
                                    <input value={form.permanentPincode} onChange={set("permanentPincode")} className={inputCls} placeholder="Pincode" disabled={sameAsCurrent} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Employment Tab */}
                    {activeTab === "employment" && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Role</label>
                                    <select value={form.customRoleId} onChange={set("customRoleId")} className={inputCls}>
                                        <option value="">No custom role</option>
                                        {customRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
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

                            {/* Site Assignment Section */}
                            <div className="border border-[var(--accent)]/30 bg-[var(--accent-light)]/30 rounded-[10px] p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <MapPin size={14} className="text-[var(--accent)]" />
                                    <label className="text-[13px] font-semibold text-[var(--accent)]">Site Assignment</label>
                                </div>
                                <p className="text-[11px] text-[var(--text3)] mb-3">Assign this employee to a site immediately upon creation</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2">
                                        <label className={labelCls}>Select Site</label>
                                        <select value={form.siteId} onChange={set("siteId")} className={inputCls}>
                                            <option value="">-- No Site (Assign Later) --</option>
                                            {sites.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {form.siteId && (
                                        <>
                                            <div>
                                                <label className={labelCls}>Deployment Role</label>
                                                <input value={form.deployRole} onChange={set("deployRole")} className={inputCls} placeholder="e.g. Security Guard" />
                                            </div>
                                            <div>
                                                <label className={labelCls}>Shift</label>
                                                <select value={form.deployShift} onChange={set("deployShift")} className={inputCls}>
                                                    <option value="">Select Shift</option>
                                                    <option value="Morning">Morning</option>
                                                    <option value="Evening">Evening</option>
                                                    <option value="Night">Night</option>
                                                    <option value="Rotating">Rotating</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className={labelCls}>Deployment Start Date</label>
                                                <input type="date" value={form.deployStartDate || new Date().toISOString().split("T")[0]} onChange={set("deployStartDate")} className={inputCls} />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Notes</label>
                                <textarea value={form.notes} onChange={set("notes")} className="w-full rounded-[8px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none" rows={3} placeholder="Additional notes..." />
                            </div>
                        </div>
                    )}

                    {/* Salary Structure Tab */}
                    {activeTab === "salary" && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-[8px] px-3 py-2.5">
                                <span className="text-[12px] text-blue-700">Set the detailed salary structure for payroll calculation. Basic Salary from Employment tab is used as the base.</span>
                            </div>
                            <div>
                                <label className={labelCls}>Compliance Type</label>
                                <div className="flex gap-4 mt-1">
                                    <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[var(--text2)]">
                                        <input type="radio" name="salComplianceType" value="OR" checked={form.salComplianceType === "OR"}
                                            onChange={() => setForm(f => ({ ...f, salComplianceType: "OR" }))} className="accent-[var(--accent)]" />
                                        <span><strong>OR</strong> — PF + ESIC apply (full-time)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[var(--text2)]">
                                        <input type="radio" name="salComplianceType" value="CALL" checked={form.salComplianceType === "CALL"}
                                            onChange={() => setForm(f => ({ ...f, salComplianceType: "CALL" }))} className="accent-orange-500" />
                                        <span><strong>CALL</strong> — No PF / ESIC (contract)</span>
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Basic Salary (₹)</label>
                                    <input type="number" value={form.basicSalary} onChange={set("basicSalary")} className={inputCls} placeholder="0" min="0" />
                                </div>
                                {form.salComplianceType !== "CALL" && (
                                    <>
                                        <div>
                                            <label className={labelCls}>DA — Dearness Allowance (₹)</label>
                                            <input type="number" value={form.salDA} onChange={set("salDA")} className={inputCls} placeholder="0" min="0" />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Washing Allowance (₹)</label>
                                            <input type="number" value={form.salWashing} onChange={set("salWashing")} className={inputCls} placeholder="0" min="0" />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Conveyance Allowance (₹)</label>
                                            <input type="number" value={form.salConveyance} onChange={set("salConveyance")} className={inputCls} placeholder="0" min="0" />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Leave With Wages (₹)</label>
                                            <input type="number" value={form.salLeaveWithWages} onChange={set("salLeaveWithWages")} className={inputCls} placeholder="0" min="0" />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Other Allowance (₹)</label>
                                            <input type="number" value={form.salOtherAllowance} onChange={set("salOtherAllowance")} className={inputCls} placeholder="0" min="0" />
                                        </div>
                                        <div>
                                            <label className={labelCls}>OT Rate / Hour (₹)</label>
                                            <input type="number" value={form.salOtRatePerHour} onChange={set("salOtRatePerHour")} className={inputCls} placeholder="170" min="0" />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Canteen Rate / Day (₹)</label>
                                            <input type="number" value={form.salCanteenRatePerDay} onChange={set("salCanteenRatePerDay")} className={inputCls} placeholder="55" min="0" />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Bank & Address Tab */}
                    {activeTab === "bank" && (
                        <div className="space-y-4">
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase">Bank Details</p>
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

                    {/* Compliance Tab */}
                    {activeTab === "compliance" && (
                        <div className="space-y-4">
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase">Identity</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Middle Name</label>
                                    <input value={form.middleName} onChange={set("middleName")} className={inputCls} placeholder="Middle name" />
                                </div>
                                <div>
                                    <label className={labelCls}>Name as per Aadhar</label>
                                    <input value={form.nameAsPerAadhar} onChange={set("nameAsPerAadhar")} className={inputCls} placeholder="As on Aadhar card" />
                                </div>
                                <div>
                                    <label className={labelCls}>Father&apos;s Name</label>
                                    <input value={form.fathersName} onChange={set("fathersName")} className={inputCls} placeholder="Father's full name" />
                                </div>
                                <div>
                                    <label className={labelCls}>Blood Group</label>
                                    <select value={form.bloodGroup} onChange={set("bloodGroup")} className={inputCls}>
                                        <option value="">Select</option>
                                        {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Nationality</label>
                                    <input value={form.nationality} onChange={set("nationality")} className={inputCls} placeholder="Nationality" />
                                </div>
                                <div>
                                    <label className={labelCls}>Religion</label>
                                    <input value={form.religion} onChange={set("religion")} className={inputCls} placeholder="Religion" />
                                </div>
                                <div>
                                    <label className={labelCls}>Caste</label>
                                    <input value={form.caste} onChange={set("caste")} className={inputCls} placeholder="Caste category" />
                                </div>
                            </div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase mt-2">Statutory Numbers</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>UAN (PF)</label>
                                    <input value={form.uan} onChange={set("uan")} className={inputCls} placeholder="Universal Account Number" />
                                </div>
                                <div>
                                    <label className={labelCls}>PF Number</label>
                                    <input value={form.pfNumber} onChange={set("pfNumber")} className={inputCls} placeholder="PF number" />
                                </div>
                                <div>
                                    <label className={labelCls}>ESIC Number</label>
                                    <input value={form.esiNumber} onChange={set("esiNumber")} className={inputCls} placeholder="ESIC number" />
                                </div>
                                <div>
                                    <label className={labelCls}>Labour Card No.</label>
                                    <input value={form.labourCardNo} onChange={set("labourCardNo")} className={inputCls} placeholder="Labour card number" />
                                </div>
                            </div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase mt-2">Emergency Contacts</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>EC1 Name</label>
                                    <input value={form.emergencyContact1Name} onChange={set("emergencyContact1Name")} className={inputCls} placeholder="Contact person name" />
                                </div>
                                <div>
                                    <label className={labelCls}>EC1 Phone</label>
                                    <input value={form.emergencyContact1Phone} onChange={set("emergencyContact1Phone")} className={inputCls} placeholder="Contact phone" />
                                </div>
                                <div>
                                    <label className={labelCls}>EC2 Name</label>
                                    <input value={form.emergencyContact2Name} onChange={set("emergencyContact2Name")} className={inputCls} placeholder="Contact person name" />
                                </div>
                                <div>
                                    <label className={labelCls}>EC2 Phone</label>
                                    <input value={form.emergencyContact2Phone} onChange={set("emergencyContact2Phone")} className={inputCls} placeholder="Contact phone" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Safety Tab */}
                    {activeTab === "safety" && (
                        <div className="space-y-3">
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase">Safety Equipment Issued</p>
                            {([
                                { key: "safetyGoggles", label: "Safety Goggles" },
                                { key: "safetyGloves", label: "Hand Gloves" },
                                { key: "safetyHelmet", label: "Helmet" },
                                { key: "safetyMask", label: "Mask" },
                                { key: "safetyJacket", label: "Safety Jacket" },
                                { key: "safetyEarMuffs", label: "Ear Muffs" },
                                { key: "safetyShoes", label: "Safety Shoes" },
                            ] as { key: keyof ModalForm; label: string }[]).map(item => (
                                <div key={item.key} className="flex items-center gap-3 p-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)]/30">
                                    <input
                                        type="checkbox"
                                        id={item.key}
                                        checked={!!form[item.key]}
                                        onChange={setCheck(item.key)}
                                        className="w-4 h-4 accent-[var(--accent)]"
                                    />
                                    <label htmlFor={item.key} className="text-[13px] text-[var(--text)] cursor-pointer select-none flex-1">
                                        {item.label}
                                    </label>
                                    {form[item.key] && (
                                        <span className="text-[11px] text-[#16a34a] font-medium">Issued</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Documents Tab — per-type matrix */}
                    {activeTab === "documents" && (() => {
                        const DOC_TYPES = [
                            { key: "AADHAAR", label: "Aadhaar Card" },
                            { key: "PAN", label: "PAN Card" },
                            { key: "PHOTO", label: "Photo" },
                            { key: "BANK_DETAILS", label: "Bank Details" },
                            { key: "CERTIFICATE", label: "Certificate" },
                            { key: "RESUME", label: "Resume" },
                            { key: "OFFER_LETTER", label: "Offer Letter" },
                            { key: "OTHER", label: "Other" },
                        ]
                        // build map: docType -> first matching doc
                        const docByType: Record<string, ExistingDoc> = {}
                        existingDocs.forEach(d => { if (!docByType[d.type]) docByType[d.type] = d })
                        // also factor in pending docs (new employee)
                        const pendingByType: Record<string, PendingDoc> = {}
                        pendingDocs.forEach(d => { if (!pendingByType[d.type]) pendingByType[d.type] = d })

                        return (
                            <div className="border border-[var(--border)] rounded-[10px] overflow-hidden">
                                <table className="w-full text-[12px]">
                                    <thead>
                                        <tr className="bg-[var(--surface2)] border-b border-[var(--border)]">
                                            <th className="text-left px-3 py-2 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide w-[130px]">Document</th>
                                            <th className="text-left px-3 py-2 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Status / File</th>
                                            <th className="px-3 py-2 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {DOC_TYPES.map(({ key, label }) => {
                                            const uploaded = docByType[key]
                                            const pending = pendingByType[key]
                                            const uploading = docUploading && docType === key
                                            const fileInputId = `doc-upload-${key}`
                                            const statusColor: Record<string, string> = { PENDING: "bg-amber-100 text-amber-700", VERIFIED: "bg-green-100 text-green-700", REJECTED: "bg-red-100 text-red-700" }
                                            return (
                                                <tr key={key} className="border-b border-[var(--border)] last:border-0">
                                                    <td className="px-3 py-2.5 font-medium text-[var(--text)]">{label}</td>
                                                    <td className="px-3 py-2.5">
                                                        {uploaded ? (
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                                                                <span className="truncate max-w-[140px] text-[var(--text)]" title={uploaded.fileName}>{uploaded.fileName}</span>
                                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusColor[uploaded.status] || "bg-gray-100 text-gray-600"}`}>{uploaded.status}</span>
                                                            </div>
                                                        ) : pending ? (
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                                                                <span className="truncate max-w-[160px] text-[var(--text)]">{pending.fileName}</span>
                                                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">Queued</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                                                                <span className="text-red-500 text-[11px] font-medium">Not Uploaded</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <div className="flex items-center justify-end gap-1 flex-wrap">
                                                            {uploaded ? (
                                                                <>
                                                                    <button type="button"
                                                                        onClick={() => { setPreviewUrl(uploaded.fileUrl); setPreviewName(uploaded.fileName) }}
                                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                                                                        <Eye size={11} /> View
                                                                    </button>
                                                                    <a href={uploaded.fileUrl} download={uploaded.fileName}
                                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] font-medium bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                                                                        <Download size={11} /> Download
                                                                    </a>
                                                                    {employee && (
                                                                        <button type="button" disabled={docDeleting === uploaded.id}
                                                                            onClick={async () => {
                                                                                if (!confirm(`"${uploaded.fileName}" delete karna chahte hain?`)) return
                                                                                setDocDeleting(uploaded.id)
                                                                                try {
                                                                                    const r = await fetch(`/api/employees/${employee.id}/documents/${uploaded.id}`, { method: "DELETE" })
                                                                                    if (r.ok) { toast.success("Document deleted"); fetchExistingDocs(employee.id) }
                                                                                    else toast.error("Delete failed")
                                                                                } catch { toast.error("Delete failed") }
                                                                                finally { setDocDeleting(null) }
                                                                            }}
                                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50">
                                                                            {docDeleting === uploaded.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                                                            Delete
                                                                        </button>
                                                                    )}
                                                                </>
                                                            ) : pending ? (
                                                                <button type="button" onClick={() => setPendingDocs(prev => prev.filter(d => d.type !== key))}
                                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
                                                                    <X size={11} /> Remove
                                                                </button>
                                                            ) : (
                                                                <>
                                                                    <button type="button" disabled={uploading}
                                                                        onClick={() => { setDocType(key); document.getElementById(fileInputId)?.click() }}
                                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-60">
                                                                        {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                                                                        {uploading ? "Uploading…" : "Upload"}
                                                                    </button>
                                                                    <input id={fileInputId} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                                                                        onChange={async (ev) => {
                                                                            const file = ev.target.files?.[0]
                                                                            if (!file) return
                                                                            if (file.size > 5 * 1024 * 1024) { toast.error("File too large (max 5MB)"); return }
                                                                            setDocUploading(true)
                                                                            try {
                                                                                const url = await new Promise<string>((resolve, reject) => {
                                                                                    const reader = new FileReader()
                                                                                    reader.onload = () => resolve(reader.result as string)
                                                                                    reader.onerror = reject
                                                                                    reader.readAsDataURL(file)
                                                                                })
                                                                                const newDoc = { type: key, fileName: file.name, fileUrl: url }
                                                                                if (employee) {
                                                                                    const r = await fetch(`/api/employees/${employee.id}/documents`, {
                                                                                        method: "POST",
                                                                                        headers: { "Content-Type": "application/json" },
                                                                                        body: JSON.stringify(newDoc),
                                                                                    })
                                                                                    if (r.ok) { toast.success("Document uploaded!"); fetchExistingDocs(employee.id) }
                                                                                    else toast.error("Upload failed")
                                                                                } else {
                                                                                    setPendingDocs(prev => [...prev, newDoc])
                                                                                    toast.success(`${file.name} queued`)
                                                                                }
                                                                            } catch { toast.error("Failed to read file") }
                                                                            finally {
                                                                                setDocUploading(false)
                                                                                ev.target.value = ""
                                                                            }
                                                                        }}
                                                                    />
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    })()}
                </form>

                <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
                    <div className="flex gap-1">
                        {(["personal", "employment", "salary", "bank", "compliance", "safety", "documents"] as const).map((t) => (
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
                        {activeTab !== "documents" ? (
                            <button
                                type="button"
                                onClick={() => {
                                    const order = ["personal", "employment", "salary", "bank", "compliance", "safety", "documents"] as const
                                    const idx = order.indexOf(activeTab as typeof order[number])
                                    if (idx < order.length - 1) setActiveTab(order[idx + 1])
                                }}
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

            <DocumentViewer 
                url={previewUrl} 
                fileName={previewName} 
                onClose={() => setPreviewUrl(null)} 
            />
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
    employee, onClose, onEdit, onStatusChange, isAdmin,
}: {
    employee: Employee | null
    onClose: () => void
    onEdit: (e: Employee) => void
    onStatusChange: (id: string, status: string) => void
    isAdmin: boolean
}) {
    const [activeTab, setActiveTab] = useState<"personal" | "employment" | "salary" | "bank" | "documents">("personal")
    const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [statusMenuOpen, setStatusMenuOpen] = useState(false)
    const statusRef = useRef<HTMLDivElement>(null)

    // Salary structure state
    type SalaryData = { basic: number; da: number; washing: number; conveyance: number; leaveWithWages: number; otherAllowance: number; otRatePerHour: number; canteenRatePerDay: number; complianceType: string; status: string; hra?: number; ctcMonthly?: number }
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
                <div className="flex border-b border-[var(--border)] px-5 overflow-x-auto">
                    {(["personal", "employment", "salary", "bank", "documents"] as const).map(t => (
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
                                <InfoItem label="Salary Type" value={emp.salaryType || "—"} icon={<IndianRupee size={13} />} />
                                <InfoItem label="Basic Salary" value={fmtRupee(emp.basicSalary)} icon={<IndianRupee size={13} />} />
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
                                                    { key: "washing", label: "Washing (₹)" },
                                                    { key: "conveyance", label: "Conveyance (₹)" },
                                                    { key: "leaveWithWages", label: "Leave With Wages (₹)" },
                                                    { key: "otherAllowance", label: "Other Allowance (₹)" },
                                                    { key: "otRatePerHour", label: "OT Rate/Hr (₹)" },
                                                    { key: "canteenRatePerDay", label: "Canteen/Day (₹)" },
                                                ] as { key: keyof SalaryData; label: string }[]).map(f => (
                                                    <div key={f.key}>
                                                        <label className="block text-[11px] text-[var(--text3)] mb-1">{f.label}</label>
                                                        <input type="number" value={salaryForm[f.key] as number} min="0"
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
                                        const hra = (sf.basic + sf.da) * 0.05
                                        const gross = sf.basic + sf.da + hra + sf.washing + sf.conveyance + sf.leaveWithWages + (7000/12) + sf.otherAllowance
                                        const isC = sf.complianceType === "CALL"
                                        const pf = isC ? 0 : Math.round(15000 * 0.13)
                                        const esic = (isC || gross > 21000) ? 0 : Math.ceil((gross - sf.washing - 7000/12) * 0.0325)
                                        const ctc = gross + pf + esic
                                        return (
                                            <div className="bg-[#f0fdf4] border border-emerald-200 rounded-[8px] p-3 space-y-1 text-[12px]">
                                                <div className="flex justify-between"><span className="text-[var(--text3)]">HRA (5%)</span><span>₹{Math.round(hra).toLocaleString("en-IN")}</span></div>
                                                <div className="flex justify-between"><span className="text-[var(--text3)]">Bonus (₹7000/12)</span><span>₹{Math.round(7000/12).toLocaleString("en-IN")}</span></div>
                                                <div className="flex justify-between font-medium"><span>Full Gross</span><span>₹{Math.round(gross).toLocaleString("en-IN")}</span></div>
                                                <div className="flex justify-between text-[var(--text3)]"><span>Employer PF</span><span>₹{pf.toLocaleString("en-IN")}</span></div>
                                                <div className="flex justify-between text-[var(--text3)]"><span>Employer ESIC</span><span>₹{esic.toLocaleString("en-IN")}</span></div>
                                                <div className="flex justify-between font-bold text-purple-700 border-t border-emerald-200 pt-1"><span>CTC / Month</span><span>₹{Math.round(ctc).toLocaleString("en-IN")}</span></div>
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
                                        const hra = (s.basic + s.da) * 0.05
                                        const gross = s.basic + s.da + hra + s.washing + s.conveyance + s.leaveWithWages + (7000/12) + s.otherAllowance
                                        const isC = s.complianceType === "CALL"
                                        const ctc = gross + (isC ? 0 : Math.round(15000 * 0.13)) + ((isC || gross > 21000) ? 0 : Math.ceil((gross - s.washing - 7000/12) * 0.0325))
                                        return (
                                            <div className="bg-[#f5f3ff] border border-purple-200 rounded-[8px] p-3 flex justify-between items-center">
                                                <span className="text-[12px] text-purple-700 font-medium">CTC / Month</span>
                                                <span className="text-[16px] font-bold text-purple-700">₹{Math.round(ctc).toLocaleString("en-IN")}</span>
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
    const [sitesForFilter, setSitesForFilter] = useState<Site[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("")
    const [deptFilter, setDeptFilter] = useState("")
    const [empTypeFilter, setEmpTypeFilter] = useState("")
    const [siteFilter, setSiteFilter] = useState("")
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [allDepts, setAllDepts] = useState<Department[]>([])
    const [showModal, setShowModal] = useState(false)
    const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
    const [drawerEmployee, setDrawerEmployee] = useState<Employee | null>(null)
    const [showImportModal, setShowImportModal] = useState(false)
    const [importRows, setImportRows] = useState<Record<string, unknown>[]>([])
    const [importLoading, setImportLoading] = useState(false)
    const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: { row: number; reason: string }[] } | null>(null)
    const importFileRef = useRef<HTMLInputElement>(null)

    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "HR_MANAGER"

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        if (status === "authenticated") {
            const userPerms: string[] = (session?.user as any)?.permissions || []
            const hasAccess =
                session?.user?.role === "ADMIN" ||
                session?.user?.role === "MANAGER" ||
                session?.user?.role === "HR_MANAGER" ||
                userPerms.includes("employees.view")
            if (!hasAccess) router.push("/")
        }
    }, [status, session, router])

    const fetchEmployees = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (statusFilter) params.set("status", statusFilter)
            if (deptFilter) params.set("departmentId", deptFilter)
            if (empTypeFilter) params.set("employmentType", empTypeFilter)
            if (siteFilter) params.set("siteId", siteFilter)
            if (search) params.set("search", search)
            const res = await fetch(`/api/employees?${params}`)
            const data = await res.json()
            setEmployees(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load employees")
        } finally {
            setLoading(false)
        }
    }, [statusFilter, deptFilter, empTypeFilter, siteFilter, search])

    useEffect(() => {
        if (status !== "unauthenticated") fetchEmployees()
    }, [status, fetchEmployees])

    useEffect(() => {
        fetch("/api/departments").then(r => r.json()).then(data => setAllDepts(Array.isArray(data) ? data : [])).catch(() => {})
        fetch("/api/sites?isActive=true").then(r => r.json()).then(data => setSites(Array.isArray(data) ? data : [])).catch(() => {})
    }, [])

    async function handleExport() {
        try {
            const res = await fetch("/api/employees/export")
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
        } catch {
            toast.error("Export failed")
        }
    }

    function handleDownloadTemplate() {
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet([["First Name", "Last Name", "Phone", "Email", "Designation", "Employment Type", "Basic Salary", "City", "Date of Joining (YYYY-MM-DD)"]])
        XLSX.utils.book_append_sheet(wb, ws, "Employees")
        XLSX.writeFile(wb, "employees_template.xlsx")
    }

    function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
            const arrayBuffer = ev.target?.result as ArrayBuffer
            const wb = XLSX.read(arrayBuffer, { type: "array" })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const rawRows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
            const normalized = rawRows.map(r => {
                const entry: Record<string, unknown> = {}
                for (const key of Object.keys(r)) {
                    const val = r[key]
                    const lk = key.toLowerCase().replace(/[\s()/-]/g, "")
                    if (lk === "firstname") entry.firstName = val
                    else if (lk === "lastname") entry.lastName = val
                    else if (lk === "phone") entry.phone = val
                    else if (lk === "email") entry.email = val
                    else if (lk === "designation") entry.designation = val
                    else if (lk === "employmenttype") entry.employmentType = val
                    else if (lk === "basicsalary") entry.basicSalary = val
                    else if (lk === "city") entry.city = val
                    else if (lk === "dateofjoiningyyyymmdd" || lk === "dateofjoining") entry.dateOfJoining = val
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
        try {
            const res = await fetch("/api/employees/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: importRows }),
            })
            const data = await res.json()
            setImportResult(data)
            if (data.imported > 0) {
                toast.success(`${data.imported} employee(s) imported`)
                fetchEmployees()
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


    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)]">Employees</h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">Manage your workforce</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                        onClick={handleExport}
                        title="Export to Excel"
                        style={{ display: "flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "13px", fontWeight: 500, borderRadius: "8px", cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                        <Download size={15} />
                        Export
                    </button>
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
                        value={siteFilter}
                        onChange={e => setSiteFilter(e.target.value)}
                        className="h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                    >
                        <option value="">All Sites</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                employee={editEmployee}
                allSites={sites}
            />
            <EmployeeDrawer
                employee={drawerEmployee}
                onClose={() => setDrawerEmployee(null)}
                onEdit={(e) => { setDrawerEmployee(null); setEditEmployee(e); setShowModal(true) }}
                onStatusChange={handleStatusChange}
                isAdmin={isAdmin}
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
                                <button
                                    onClick={handleImportSubmit}
                                    disabled={importLoading}
                                    style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: importLoading ? "not-allowed" : "pointer", opacity: importLoading ? 0.7 : 1 }}
                                >
                                    {importLoading && <Loader2 size={14} className="animate-spin" />}
                                    Import {importRows.length} rows
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
