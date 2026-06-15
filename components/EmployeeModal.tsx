"use client"
import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import {
    X, Loader2, CheckCircle, User, MapPin,
    Eye, Download, Trash2, Upload, Camera,
} from "lucide-react"
import { DocumentViewer } from "@/components/DocumentViewer"

// ─── Types ────────────────────────────────────────────────────────────────────

export type Employee = {
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
    user?: { id?: string; role: string; customRoleId?: string; email?: string; customRole?: { id?: string; name: string; color?: string } | null } | null
    userId?: string
    userRole?: string
    userCustomRoleId?: string
    userEmail?: string
    employeeSalary?: {
        basic: number; da: number; washing: number; conveyance: number
        leaveWithWages: number; otherAllowance: number
        otRatePerHour: number; canteenRatePerDay: number
        complianceType?: string; status?: string
        hra?: number; bonus?: number
    } | null
}

type Department = { id: string; name: string }

// ─── Constants ────────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    ACTIVE: { label: "Active", color: "#1a9e6e", bg: "#e8f7f1", border: "#6ee7b7" },
    INACTIVE: { label: "Inactive", color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
    ON_LEAVE: { label: "On Leave", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
    TERMINATED: { label: "Terminated", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    RESIGNED: { label: "Resigned", color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe" },
}

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Daily Wage"]
const SALARY_TYPES = ["Monthly", "Daily", "Hourly"]

// ─── Form Types ───────────────────────────────────────────────────────────────

export type ModalForm = {
    firstName: string; lastName: string; email: string; phone: string; alternatePhone: string
    dateOfBirth: string; gender: string; aadharNumber: string; panNumber: string
    designation: string; departmentId: string; branchId: string; managerId: string
    dateOfJoining: string; employmentType: string; salaryType: string; basicSalary: string
    customRoleId: string; role: string
    address: string; city: string; state: string; pincode: string
    permanentAddress: string; permanentCity: string; permanentState: string; permanentPincode: string
    bankName: string; bankBranch: string; bankAccountNumber: string; bankIFSC: string
    status: string; notes: string
    middleName: string; nameAsPerAadhar: string; fathersName: string; bloodGroup: string
    maritalStatus: string; nationality: string; religion: string; caste: string
    uan: string; pfNumber: string; esiNumber: string; labourCardNo: string
    emergencyContact1Name: string; emergencyContact1Phone: string
    emergencyContact2Name: string; emergencyContact2Phone: string
    safetyGoggles: boolean; safetyGloves: boolean; safetyHelmet: boolean
    safetyMask: boolean; safetyJacket: boolean; safetyEarMuffs: boolean; safetyShoes: boolean
    salDA: string; salHRA: string; salBonus: string; salWashing: string; salConveyance: string; salLeaveWithWages: string
    salOtherAllowance: string; salOtRatePerHour: string; salCanteenRatePerDay: string
    salComplianceType: string
    siteId: string; deployShift: string; deployRole: string; deployStartDate: string
}

export const EMPTY_FORM: ModalForm = {
    firstName: "", lastName: "", email: "", phone: "", alternatePhone: "",
    dateOfBirth: "", gender: "", aadharNumber: "", panNumber: "",
    designation: "", departmentId: "", branchId: "", managerId: "",
    dateOfJoining: "", employmentType: "Full-time", salaryType: "Monthly", basicSalary: "",
    customRoleId: "", role: "",
    address: "", city: "", state: "", pincode: "",
    permanentAddress: "", permanentCity: "", permanentState: "", permanentPincode: "",
    bankName: "", bankBranch: "", bankAccountNumber: "", bankIFSC: "",
    status: "ACTIVE", notes: "",
    middleName: "", nameAsPerAadhar: "", fathersName: "", bloodGroup: "",
    maritalStatus: "", nationality: "Indian", religion: "", caste: "",
    uan: "", pfNumber: "", esiNumber: "", labourCardNo: "",
    emergencyContact1Name: "", emergencyContact1Phone: "",
    emergencyContact2Name: "", emergencyContact2Phone: "",
    safetyGoggles: false, safetyGloves: false, safetyHelmet: false,
    safetyMask: false, safetyJacket: false, safetyEarMuffs: false, safetyShoes: false,
    salDA: "", salHRA: "", salBonus: "", salWashing: "", salConveyance: "", salLeaveWithWages: "",
    salOtherAllowance: "", salOtRatePerHour: "170", salCanteenRatePerDay: "55",
    salComplianceType: "OR",
    siteId: "", deployShift: "", deployRole: "", deployStartDate: "",
}

// ─── Credentials Modal ────────────────────────────────────────────────────────

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

// ─── Employee Modal ───────────────────────────────────────────────────────────

export function EmployeeModal({
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
    const [activeTab, setActiveTab] = useState<"personal" | "employment" | "salary" | "bank" | "compliance" | "safety" | "documents" | "history">("personal")
    type HistoryData = {
        employee: { name: string; status: string; createdAt: string; createdByName: string | null; dateOfJoining: string | null }
        recruitment: {
            positionAppliedFor: string; source: string; recruitedBy: string | null; handledByHr: string | null
            targetSite: string | null; enteredRecruitmentAt: string; interviewDate: string | null
            interviewResult: string | null; leadStatus: string
            activities: { id: string; type: string; content: string; at: string; by: string | null }[]
        } | null
        onboarding: { onboardedByName: string | null; status: string; startedAt: string | null; completedAt: string | null } | null
        cameThroughRecruitment: boolean
    }
    const [history, setHistory] = useState<HistoryData | null>(null)
    const [historyLoading, setHistoryLoading] = useState(false)
    const [form, setForm] = useState<ModalForm>(EMPTY_FORM)
    const [draftEmpId, setDraftEmpId] = useState<string | null>(null)
    type PendingDoc = { type: string; fileName: string; fileUrl: string }
    type ExistingDoc = { id: string; type: string; fileName: string; fileUrl: string; status: string; uploadedAt: string }
    const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([])
    const [existingDocs, setExistingDocs] = useState<ExistingDoc[]>([])
    const [docUploading, setDocUploading] = useState(false)
    const [docDeleting, setDocDeleting] = useState<string | null>(null)
    const [docType, setDocType] = useState("AADHAAR")
    const [photo, setPhoto] = useState<string>("")
    const [photoUploading, setPhotoUploading] = useState(false)
    const photoInputRef = useRef<HTMLInputElement>(null)
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

    useEffect(() => {
        if (activeTab === "documents" && employee) {
            fetchExistingDocs(employee.id)
        }
    }, [activeTab, employee])

    useEffect(() => {
        if (activeTab !== "history" || !employee) return
        setHistoryLoading(true)
        setHistory(null)
        fetch(`/api/employees/${employee.id}/history`)
            .then(r => r.ok ? r.json() : null)
            .then(setHistory)
            .catch(() => {})
            .finally(() => setHistoryLoading(false))
    }, [activeTab, employee])

    useEffect(() => {
        if (!open) return
        setActiveTab("personal")
        setSameAsCurrent(false)
        setDraftEmpId(null)
        setPhoto(employee?.photo || "")
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
                middleName: employee.middleName || "",
                nameAsPerAadhar: employee.nameAsPerAadhar || "",
                fathersName: employee.fathersName || "",
                bloodGroup: employee.bloodGroup || "",
                maritalStatus: employee.maritalStatus || "",
                nationality: employee.nationality || "Indian",
                religion: employee.religion || "",
                caste: employee.caste || "",
                uan: employee.uan || "",
                pfNumber: employee.pfNumber || "",
                esiNumber: employee.esiNumber || "",
                labourCardNo: employee.labourCardNo || "",
                emergencyContact1Name: employee.emergencyContact1Name || "",
                emergencyContact1Phone: employee.emergencyContact1Phone || "",
                emergencyContact2Name: employee.emergencyContact2Name || "",
                emergencyContact2Phone: employee.emergencyContact2Phone || "",
                safetyGoggles: employee.safetyGoggles ?? false,
                safetyGloves: employee.safetyGloves ?? false,
                safetyHelmet: employee.safetyHelmet ?? false,
                safetyMask: employee.safetyMask ?? false,
                safetyJacket: employee.safetyJacket ?? false,
                safetyEarMuffs: employee.safetyEarMuffs ?? false,
                safetyShoes: employee.safetyShoes ?? false,
                customRoleId: (employee as any).user?.customRoleId || "",
                role: employee.designation || "",
                salDA:                String(employee.employeeSalary?.da               ?? ""),
                salHRA:               String(employee.employeeSalary?.hra              ?? ""),
                salBonus:             String((employee.employeeSalary as any)?.bonus   ?? ""),
                salWashing:           String(employee.employeeSalary?.washing          ?? ""),
                salConveyance:        String(employee.employeeSalary?.conveyance       ?? ""),
                salLeaveWithWages:    String(employee.employeeSalary?.leaveWithWages   ?? ""),
                salOtherAllowance:    String(employee.employeeSalary?.otherAllowance   ?? ""),
                salOtRatePerHour:     String(employee.employeeSalary?.otRatePerHour    ?? "170"),
                salCanteenRatePerDay: String(employee.employeeSalary?.canteenRatePerDay ?? "55"),
                salComplianceType:    employee.employeeSalary?.complianceType          ?? "OR",
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

    const digits = (v: string) => v.replace(/\D/g, "")
    const isPhoneValid   = (v: string) => !v || digits(v).length === 10
    const isAadharValid  = (v: string) => !v || digits(v).length === 12
    const isPANValid     = (v: string) => !v || /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(v.trim())

    const fieldErrors = {
        phone:           !isPhoneValid(form.phone)           ? "Phone must be 10 digits" : "",
        alternatePhone:  !isPhoneValid(form.alternatePhone)  ? "Phone must be 10 digits" : "",
        aadharNumber:    !isAadharValid(form.aadharNumber)   ? "Aadhar must be 12 digits" : "",
        panNumber:       !isPANValid(form.panNumber)         ? "PAN format: AAAAA9999A (10 chars)" : "",
        emergencyContact1Phone: !isPhoneValid((form as any).emergencyContact1Phone) ? "Phone must be 10 digits" : "",
        emergencyContact2Phone: !isPhoneValid((form as any).emergencyContact2Phone) ? "Phone must be 10 digits" : "",
    }
    const hasFieldErrors = Object.values(fieldErrors).some(Boolean)

    const doSave = async (keepOpen: boolean) => {
        if (!form.firstName.trim()) { toast.error("First name is required"); return }
        if (hasFieldErrors) { toast.error("Please fix validation errors before saving"); return }
        setLoading(true)
        try {
            const existingId = employee?.id || draftEmpId
            const url    = existingId ? `/api/employees/${existingId}` : "/api/employees"
            const method = existingId ? "PUT" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, designation: form.role, photo: photo || undefined }),
            })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            const empId = data.id || existingId

            if (!draftEmpId && empId) setDraftEmpId(empId)

            if (empId && form.basicSalary) {
                try {
                    const salRes = await fetch(`/api/payroll/salary-structure/${empId}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            basic:            Number(form.basicSalary) || 0,
                            da:               Number(form.salDA) || 0,
                            hra:              Number(form.salHRA) || 0,
                            bonus:            Number(form.salBonus) || 0,
                            washing:          Number(form.salWashing) || 0,
                            conveyance:       Number(form.salConveyance) || 0,
                            leaveWithWages:   Number(form.salLeaveWithWages) || 0,
                            otherAllowance:   Number(form.salOtherAllowance) || 0,
                            otRatePerHour:    Number(form.salOtRatePerHour) || 170,
                            canteenRatePerDay: Number(form.salCanteenRatePerDay) || 55,
                            complianceType:   form.salComplianceType || "OR",
                            status:           "APPROVED",
                        }),
                    })
                    if (!salRes.ok) toast.error("Salary structure save failed: " + await salRes.text())
                } catch (e) { toast.error("Salary structure save error: " + (e as Error).message) }
            }

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

            if (empId && form.siteId) {
                try {
                    const currentDeployment = employee?.deployments?.[0]
                    const currentSiteId = currentDeployment?.site?.id
                    if (currentSiteId !== form.siteId) {
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

            if (keepOpen) {
                toast.success("Saved! You can continue filling remaining sections.")
            } else {
                if (!existingId && data._userCreated) {
                    setNewCredentials({ email: data._loginEmail, password: data._loginPassword })
                } else {
                    toast.success(employee ? "Employee updated!" : "Employee added!")
                    onClose()
                }
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to save")
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await doSave(false)
    }

    if (!open) return null

    if (newCredentials) {
        return <CredentialsModal email={newCredentials.email} password={newCredentials.password} onClose={() => { setNewCredentials(null); onClose() }} />
    }

    const setCheck = (key: keyof ModalForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [key]: e.target.checked }))

    const tabCls = (t: string) =>
        `px-3 py-2 text-[13px] font-semibold transition-colors whitespace-nowrap rounded-md ${activeTab === t
            ? "bg-[var(--accent)] text-white shadow-sm"
            : "text-[var(--text)] hover:bg-[var(--surface2)]"
        }`
    const inputCls = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text3)]"
    const labelCls = "block text-[12px] text-[var(--text2)] mb-1"

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-[var(--surface)] rounded-[16px] border border-[var(--border)] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                    <div>
                        <h2 className="text-[16px] font-semibold text-[var(--text)]">
                            {employee ? `${employee.firstName} ${employee.lastName}` : "Add New Employee"}
                        </h2>
                        {employee && (
                            <p className="text-[12px] text-[var(--text3)] mt-0.5">{employee.employeeId} · {employee.designation || "No Designation"}</p>
                        )}
                    </div>
                    <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text)] p-1 rounded-md hover:bg-[var(--surface2)] transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b border-[var(--border)] px-4 py-3 overflow-x-auto bg-[var(--surface2)]/40">
                    {(["personal", "employment", "salary", "bank", "compliance", "safety", "documents", ...(employee ? ["history"] as const : [])] as const).map(t => (
                        <button type="button" key={t} onClick={() => setActiveTab(t)} className={tabCls(t)}>
                            {t === "personal" ? "Personal" : t === "employment" ? "Employment" : t === "salary" ? "Salary" : t === "bank" ? "Bank" : t === "compliance" ? "Compliance" : t === "safety" ? "Safety" : t === "history" ? "History" : `Docs${pendingDocs.length ? ` (${pendingDocs.length})` : ""}`}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5">
                    {/* Personal Tab */}
                    {activeTab === "personal" && (
                        <div className="space-y-4">
                            {/* ── Profile Photo ── */}
                            <div className="flex items-center gap-4 p-3 bg-[var(--surface2)] rounded-[10px] border border-[var(--border)]">
                                <div className="relative shrink-0">
                                    {photo ? (
                                        <img src={photo} alt="Profile" className="w-16 h-16 rounded-full object-cover border-2 border-[var(--accent)]" />
                                    ) : (
                                        <div className="w-16 h-16 rounded-full bg-[var(--accent-light)] flex items-center justify-center border-2 border-dashed border-[var(--accent)]">
                                            <User size={24} className="text-[var(--accent)]" />
                                        </div>
                                    )}
                                    {photoUploading && (
                                        <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                                            <Loader2 size={16} className="text-white animate-spin" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className="text-[13px] font-semibold text-[var(--text)] mb-1">Profile Photo</p>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => photoInputRef.current?.click()}
                                            disabled={photoUploading}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] bg-[var(--accent)] text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-50">
                                            <Camera size={12} /> {photo ? "Change" : "Upload"} Photo
                                        </button>
                                        {photo && (
                                            <button type="button" onClick={() => setPhoto("")}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] border border-[var(--border)] text-[var(--text3)] text-[12px] hover:bg-[var(--surface)]">
                                                <Trash2 size={12} /> Remove
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-[var(--text3)] mt-1">JPG, PNG — max 2MB</p>
                                </div>
                                <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0]
                                        if (!file) return
                                        if (file.size > 2 * 1024 * 1024) { toast.error("Photo 2MB se badi nahi honi chahiye"); return }
                                        setPhotoUploading(true)
                                        try {
                                            const fd = new FormData()
                                            fd.append("file", file)
                                            const res = await fetch("/api/upload", { method: "POST", body: fd })
                                            const data = await res.json()
                                            if (data.url) setPhoto(data.url)
                                            else toast.error("Photo upload failed")
                                        } catch { toast.error("Upload error") }
                                        finally { setPhotoUploading(false); e.target.value = "" }
                                    }}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>First Name *</label>
                                    <input value={form.firstName} onChange={set("firstName")} className={inputCls} placeholder="First name" required />
                                </div>
                                <div>
                                    <label className={labelCls}>Middle Name</label>
                                    <input value={form.middleName} onChange={set("middleName")} className={inputCls} placeholder="Middle name" />
                                </div>
                                <div>
                                    <label className={labelCls}>Last Name</label>
                                    <input value={form.lastName} onChange={set("lastName")} className={inputCls} placeholder="Last name" />
                                </div>
                                <div>
                                    <label className={labelCls}>Father&apos;s Name</label>
                                    <input value={form.fathersName} onChange={set("fathersName")} className={inputCls} placeholder="Father's full name" />
                                </div>
                                <div>
                                    <label className={labelCls}>Phone</label>
                                    <input value={form.phone} onChange={set("phone")} maxLength={10}
                                        className={inputCls + (fieldErrors.phone ? " !border-red-400" : "")} placeholder="10-digit mobile number" />
                                    {fieldErrors.phone && <p className="text-[11px] text-red-500 mt-0.5 flex items-center gap-1">⚠ {fieldErrors.phone}</p>}
                                </div>
                                <div>
                                    <label className={labelCls}>Email</label>
                                    <input type="email" value={form.email} onChange={set("email")} className={inputCls} placeholder="Email address" />
                                </div>
                                <div>
                                    <label className={labelCls}>Alternate Phone</label>
                                    <input value={form.alternatePhone} onChange={set("alternatePhone")} maxLength={10}
                                        className={inputCls + (fieldErrors.alternatePhone ? " !border-red-400" : "")} placeholder="10-digit number (optional)" />
                                    {fieldErrors.alternatePhone && <p className="text-[11px] text-red-500 mt-0.5 flex items-center gap-1">⚠ {fieldErrors.alternatePhone}</p>}
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
                                    <input value={form.aadharNumber} onChange={set("aadharNumber")} maxLength={12}
                                        className={inputCls + (fieldErrors.aadharNumber ? " !border-red-400" : "")} placeholder="12-digit Aadhar number" />
                                    {fieldErrors.aadharNumber && <p className="text-[11px] text-red-500 mt-0.5 flex items-center gap-1">⚠ {fieldErrors.aadharNumber}</p>}
                                </div>
                                <div>
                                    <label className={labelCls}>PAN Number</label>
                                    <input value={form.panNumber} onChange={e => setForm(f => ({ ...f, panNumber: e.target.value.toUpperCase() }))} maxLength={10}
                                        className={inputCls + (fieldErrors.panNumber ? " !border-red-400" : "")} placeholder="AAAAA9999A" />
                                    {fieldErrors.panNumber && <p className="text-[11px] text-red-500 mt-0.5 flex items-center gap-1">⚠ {fieldErrors.panNumber}</p>}
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
                            <div className="border border-amber-200 bg-amber-50 rounded-[10px] p-4 mb-2">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-base">🔐</span>
                                        <div>
                                            <p className="text-[13px] font-semibold text-amber-800">Login Account</p>
                                            {employee && (employee as any).user?.email ? (
                                                <p className="text-[11px] text-amber-600">Login: {(employee as any).user.email}</p>
                                            ) : (
                                                <p className="text-[11px] text-amber-600">Role select karke click karo if employee can&apos;t login</p>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (!employee) return
                                            if (!form.customRoleId) { alert("Pehle System Role select karo"); return }
                                            try {
                                                const res = await fetch(`/api/employees/${employee.id}/fix-login`, {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ customRoleId: form.customRoleId })
                                                })
                                                const data = await res.json()
                                                if (data.created) {
                                                    setNewCredentials({ email: data.email, password: data.password })
                                                } else {
                                                    alert("Role update ho gaya!")
                                                }
                                            } catch { alert("Error") }
                                        }}
                                        className="px-3 py-1.5 bg-amber-500 text-white text-[12px] font-semibold rounded-lg hover:bg-amber-600"
                                    >
                                        Fix Login
                                    </button>
                                </div>
                                <div>
                                    <label className={labelCls}>System Role (Login Access)</label>
                                    <select value={form.customRoleId} onChange={set("customRoleId")} className={inputCls}>
                                        <option value="">-- Select Role --</option>
                                        {customRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
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
                                <textarea value={form.notes} onChange={set("notes")} className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none placeholder:text-[var(--text3)]" rows={3} placeholder="Additional notes..." />
                            </div>
                        </div>
                    )}

                    {/* Salary Tab */}
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
                                            <label className={labelCls}>HRA (₹)</label>
                                            <input type="number" value={form.salHRA} onChange={set("salHRA")} className={inputCls} placeholder="0" min="0" />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Bonus (₹)</label>
                                            <input type="number" value={form.salBonus} onChange={set("salBonus")} className={inputCls} placeholder="0" min="0" />
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

                            {(() => {
                                const basic   = Number(form.basicSalary) || 0
                                const isCALL  = form.salComplianceType === "CALL"
                                const da      = isCALL ? 0 : (Number(form.salDA) || 0)
                                const hra     = isCALL ? 0 : (Number(form.salHRA) || 0)
                                const bonus   = isCALL ? 0 : (Number(form.salBonus) || 0)
                                const wash    = isCALL ? 0 : (Number(form.salWashing) || 0)
                                const conv    = isCALL ? 0 : (Number(form.salConveyance) || 0)
                                const lww     = isCALL ? 0 : (Number(form.salLeaveWithWages) || 0)
                                const other   = isCALL ? 0 : (Number(form.salOtherAllowance) || 0)
                                const otRate  = Number(form.salOtRatePerHour) || 170
                                const canteen = Number(form.salCanteenRatePerDay) || 55
                                const gross   = basic + da + hra + wash + conv + lww + bonus + other
                                const ctc     = gross
                                const fmt     = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")
                                if (!basic) return null
                                return (
                                    <div style={{ background: "#f8fafc", border: `1px solid ${isCALL ? "#fed7aa" : "#e2e8f0"}`, borderRadius: 10, padding: "12px 14px", marginTop: 4 }}>
                                        <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px 0" }}>Live Salary Breakdown</p>
                                        {isCALL && (
                                            <p style={{ fontSize: 10, color: "#c2410c", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "4px 8px", margin: "0 0 8px 0", fontWeight: 600 }}>
                                                CALL contract — only Basic salary, no PF / ESIC / HRA / allowances
                                            </p>
                                        )}
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "5px 12px" }}>
                                            {[
                                                { label: "Basic",       value: fmt(basic),  color: "#1d4ed8" },
                                                { label: "DA",          value: isCALL ? "—" : fmt(da),     color: isCALL ? "#cbd5e1" : "#1d4ed8" },
                                                { label: "HRA",         value: isCALL ? "—" : fmt(hra),    color: isCALL ? "#cbd5e1" : "#6366f1" },
                                                { label: "Washing",     value: isCALL ? "—" : fmt(wash),   color: isCALL ? "#cbd5e1" : "#1d4ed8" },
                                                { label: "Conv.",       value: isCALL ? "—" : fmt(conv),   color: isCALL ? "#cbd5e1" : "#1d4ed8" },
                                                { label: "LWW",         value: isCALL ? "—" : fmt(lww),    color: isCALL ? "#cbd5e1" : "#1d4ed8" },
                                                { label: "Bonus",       value: isCALL ? "—" : fmt(bonus),  color: isCALL ? "#cbd5e1" : "#6366f1" },
                                                { label: "Other",       value: isCALL ? "—" : fmt(other),  color: isCALL ? "#cbd5e1" : "#1d4ed8" },
                                                { label: "OT Rate/Hr",  value: fmt(otRate), color: "#64748b" },
                                                { label: "Canteen/Day", value: fmt(canteen),color: "#64748b" },
                                            ].map(r => (
                                                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                                                    <span style={{ fontSize: 10, color: "#94a3b8" }}>{r.label}</span>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: r.color }}>{r.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ borderTop: "1px dashed #cbd5e1", margin: "8px 0" }} />
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                                            <div style={{ background: isCALL ? "#fff7ed" : "#dcfce7", borderRadius: 7, padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: isCALL ? "#c2410c" : "#15803d" }}>CTC / Month</span>
                                                <span style={{ fontSize: 13, fontWeight: 800, color: isCALL ? "#c2410c" : "#15803d" }}>{fmt(ctc)}</span>
                                            </div>
                                            <div style={{ background: "#eff6ff", borderRadius: 7, padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: "#1d4ed8" }}>CTC / Year</span>
                                                <span style={{ fontSize: 13, fontWeight: 800, color: "#1d4ed8" }}>{fmt(ctc * 12)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>
                    )}

                    {/* Bank Tab */}
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
                                    <input value={form.emergencyContact1Phone} onChange={set("emergencyContact1Phone")} maxLength={10}
                                        className={inputCls + (fieldErrors.emergencyContact1Phone ? " !border-red-400" : "")} placeholder="10-digit number" />
                                    {fieldErrors.emergencyContact1Phone && <p className="text-[11px] text-red-500 mt-0.5">⚠ {fieldErrors.emergencyContact1Phone}</p>}
                                </div>
                                <div>
                                    <label className={labelCls}>EC2 Name</label>
                                    <input value={form.emergencyContact2Name} onChange={set("emergencyContact2Name")} className={inputCls} placeholder="Contact person name" />
                                </div>
                                <div>
                                    <label className={labelCls}>EC2 Phone</label>
                                    <input value={form.emergencyContact2Phone} onChange={set("emergencyContact2Phone")} maxLength={10}
                                        className={inputCls + (fieldErrors.emergencyContact2Phone ? " !border-red-400" : "")} placeholder="10-digit number" />
                                    {fieldErrors.emergencyContact2Phone && <p className="text-[11px] text-red-500 mt-0.5">⚠ {fieldErrors.emergencyContact2Phone}</p>}
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

                    {/* Documents Tab */}
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
                        const docByType: Record<string, ExistingDoc> = {}
                        existingDocs.forEach(d => { if (!docByType[d.type]) docByType[d.type] = d })
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

                    {/* History Tab */}
                    {activeTab === "history" && (
                        <div className="space-y-4">
                            {historyLoading && (
                                <div className="flex items-center justify-center py-10 text-[var(--text3)]">
                                    <Loader2 size={20} className="animate-spin" />
                                </div>
                            )}
                            {!historyLoading && history && (() => {
                                const fmt = (d?: string | null) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"
                                const fmtD = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"
                                const r = history.recruitment
                                const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
                                    <div className="flex items-start justify-between gap-3 py-1.5">
                                        <span className="text-[12px] text-[var(--text3)]">{label}</span>
                                        <span className="text-[13px] text-[var(--text)] font-medium text-right">{value || "—"}</span>
                                    </div>
                                )
                                return (
                                    <>
                                        {/* Recruitment summary */}
                                        <div className="p-4 bg-[var(--surface2)] rounded-[10px] border border-[var(--border)]">
                                            <p className="text-[12px] font-semibold text-[var(--text2)] uppercase tracking-wide mb-2">Recruitment</p>
                                            {history.cameThroughRecruitment && r ? (
                                                <div className="divide-y divide-[var(--border)]">
                                                    <Row label="Recruited by (HR)" value={r.recruitedBy} />
                                                    <Row label="Handled by (assigned HR)" value={r.handledByHr} />
                                                    <Row label="Source" value={r.source} />
                                                    <Row label="Position applied for" value={r.positionAppliedFor} />
                                                    <Row label="Target site" value={r.targetSite} />
                                                    <Row label="Entered recruitment on" value={fmtD(r.enteredRecruitmentAt)} />
                                                    <Row label="Interview date" value={fmtD(r.interviewDate)} />
                                                    <Row label="Interview result" value={r.interviewResult} />
                                                </div>
                                            ) : (
                                                <p className="text-[13px] text-[var(--text3)]">This employee was added directly (not through the recruitment module).</p>
                                            )}
                                        </div>

                                        {/* Employee record */}
                                        <div className="p-4 bg-[var(--surface2)] rounded-[10px] border border-[var(--border)]">
                                            <p className="text-[12px] font-semibold text-[var(--text2)] uppercase tracking-wide mb-2">Employee record</p>
                                            <div className="divide-y divide-[var(--border)]">
                                                <Row label="Created by (HR)" value={history.employee.createdByName} />
                                                <Row label="Employee created on" value={fmt(history.employee.createdAt)} />
                                                <Row label="Date of joining" value={fmtD(history.employee.dateOfJoining)} />
                                                <Row label="Current status" value={history.employee.status} />
                                            </div>
                                        </div>

                                        {/* Onboarding */}
                                        <div className="p-4 bg-[var(--surface2)] rounded-[10px] border border-[var(--border)]">
                                            <p className="text-[12px] font-semibold text-[var(--text2)] uppercase tracking-wide mb-2">Onboarding</p>
                                            {history.onboarding ? (
                                                <div className="divide-y divide-[var(--border)]">
                                                    <Row label="Onboarded by" value={history.onboarding.onboardedByName} />
                                                    <Row label="Onboarding status" value={history.onboarding.status?.replace(/_/g, " ")} />
                                                    <Row label="Onboarding started" value={fmtD(history.onboarding.startedAt)} />
                                                    <Row label="Onboarding completed" value={fmtD(history.onboarding.completedAt)} />
                                                </div>
                                            ) : (
                                                <p className="text-[13px] text-[var(--text3)]">No onboarding record for this employee.</p>
                                            )}
                                        </div>

                                        {/* Activity timeline */}
                                        {r && r.activities.length > 0 && (
                                            <div className="p-4 bg-[var(--surface2)] rounded-[10px] border border-[var(--border)]">
                                                <p className="text-[12px] font-semibold text-[var(--text2)] uppercase tracking-wide mb-3">Recruitment timeline</p>
                                                <div className="space-y-3">
                                                    {r.activities.map(a => (
                                                        <div key={a.id} className="flex gap-3">
                                                            <div className="mt-1 w-2 h-2 rounded-full bg-[var(--accent)] shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-[13px] text-[var(--text)]">{a.content}</p>
                                                                <p className="text-[11px] text-[var(--text3)] mt-0.5">
                                                                    {fmt(a.at)}{a.by ? ` · ${a.by}` : ""}{a.type ? ` · ${a.type.replace(/_/g, " ")}` : ""}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )
                            })()}
                            {!historyLoading && !history && (
                                <p className="text-[13px] text-[var(--text3)] text-center py-10">Could not load history.</p>
                            )}
                        </div>
                    )}
                </form>

                {/* Footer */}
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
                        <button
                            type="button"
                            onClick={() => doSave(activeTab !== "documents")}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 px-4 py-2 border border-[var(--accent)] text-[var(--accent)] rounded-[8px] text-[13px] font-medium hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50"
                        >
                            {loading && <Loader2 size={13} className="animate-spin" />}
                            {activeTab === "documents" ? (employee || draftEmpId ? "Save Changes" : "Add Employee") : "Save"}
                        </button>
                        {activeTab !== "documents" && (
                            <button
                                type="button"
                                onClick={() => {
                                    const order = ["personal", "employment", "salary", "bank", "compliance", "safety", "documents"] as const
                                    const idx = order.indexOf(activeTab as typeof order[number])
                                    if (idx < order.length - 1) setActiveTab(order[idx + 1])
                                }}
                                className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity"
                            >
                                Next →
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
