"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Search, Loader2, CheckCircle2, XCircle, Clock,
    User, Phone, MapPin, X, ChevronRight,
    Building2, Calendar, RefreshCw, FileText, Eye
} from "lucide-react"
import { format } from "date-fns"

// ─── Types ───────────────────────────────────────────────────────────────────

type OnboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD"

type OnboardingRecord = {
    id: string
    status: OnboardingStatus
    startedAt?: string | null
    completedAt?: string | null
    notes?: string | null
    employee: {
        id: string
        firstName: string
        middleName?: string | null
        lastName: string
        employeeId: string
        designation?: string | null
        dateOfJoining?: string | null
        dateOfBirth?: string | null
        photo?: string | null
        gender?: string | null
        phone?: string | null
        alternatePhone?: string | null
        email?: string | null
        address?: string | null
        city?: string | null
        state?: string | null
        pincode?: string | null
        permanentAddress?: string | null
        permanentCity?: string | null
        permanentState?: string | null
        permanentPincode?: string | null
        nameAsPerAadhar?: string | null
        fathersName?: string | null
        bloodGroup?: string | null
        maritalStatus?: string | null
        nationality?: string | null
        religion?: string | null
        caste?: string | null
        emergencyContact1Name?: string | null
        emergencyContact1Phone?: string | null
        emergencyContact2Name?: string | null
        emergencyContact2Phone?: string | null
        employmentType?: string | null
        basicSalary?: number | null
        aadharNumber?: string | null
        panNumber?: string | null
        uan?: string | null
        pfNumber?: string | null
        esiNumber?: string | null
        labourCardNo?: string | null
        bankAccountNumber?: string | null
        bankIFSC?: string | null
        bankName?: string | null
        bankBranch?: string | null
        isKycVerified?: boolean
        kycRejectionNote?: string | null
        safetyGoggles?: boolean
        safetyGloves?: boolean
        safetyHelmet?: boolean
        safetyMask?: boolean
        safetyJacket?: boolean
        safetyEarMuffs?: boolean
        safetyShoes?: boolean
        department?: { name: string } | null
        deployments?: { site: { name: string } }[]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        employeeSalary?: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        documents?: any[]
    }
    tasks?: { id: string; status: string; category: string; isRequired: boolean }[]
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OnboardingStatus, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
    NOT_STARTED: { label: "Not Started", color: "#6b7280", bg: "#f3f4f6",   border: "#d1d5db", icon: Clock },
    IN_PROGRESS: { label: "Pending Review", color: "#d97706", bg: "#fef3c7", border: "#fcd34d", icon: Clock },
    COMPLETED:   { label: "Approved",    color: "#15803d", bg: "#dcfce7",   border: "#86efac", icon: CheckCircle2 },
    ON_HOLD:     { label: "Rejected",    color: "#dc2626", bg: "#fee2e2",   border: "#fca5a5", icon: XCircle },
}

const FILTER_TABS = [
    { key: "ALL",         label: "All" },
    { key: "IN_PROGRESS", label: "Pending Review" },
    { key: "NOT_STARTED", label: "Not Started" },
    { key: "COMPLETED",   label: "Approved" },
    { key: "ON_HOLD",     label: "Rejected" },
]

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, photo, size = 40 }: { name: string; photo?: string | null; size?: number }) {
    const colors = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"]
    const color = colors[name.charCodeAt(0) % colors.length]
    if (photo) return <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
    return (
        <div style={{ width: size, height: size, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, flexShrink: 0 }}>
            {name.charAt(0).toUpperCase()}
        </div>
    )
}

// ─── Field display helper ─────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value?: string | number | boolean | null }) {
    if (value === null || value === undefined || value === "") return null
    const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
            <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{display}</span>
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>{title}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px" }}>
                {children}
            </div>
        </div>
    )
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ record, onClose, onAction }: {
    record: OnboardingRecord
    onClose: () => void
    onAction: (id: string, action: "approve" | "reject", reason?: string) => Promise<void>
}) {
    const e = record.employee
    const [tab, setTab] = useState<"personal" | "employment" | "bank" | "safety" | "docs">("personal")
    const [acting, setActing] = useState(false)
    const [showReject, setShowReject] = useState(false)
    const [rejectReason, setRejectReason] = useState(record.notes || "")
    const [approveNotes, setApproveNotes] = useState("")
    const docs: { id: string; type: string; fileName: string; fileUrl: string; status: string }[] = (e.documents as any[]) || []

    const fullName = [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ")
    const site = e.deployments?.[0]?.site?.name
    const st = STATUS_CONFIG[record.status]

    const doApprove = async () => {
        setActing(true)
        await onAction(record.id, "approve", approveNotes || undefined)
        setActing(false)
    }

    const doReject = async () => {
        if (!rejectReason.trim()) { toast.error("Please enter a rejection reason"); return }
        setActing(true)
        await onAction(record.id, "reject", rejectReason)
        setActing(false)
        setShowReject(false)
    }

    const tabCls = (t: string) => ({
        padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        border: "none", background: "none",
        borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
        color: tab === t ? "var(--accent)" : "var(--text3)",
    } as React.CSSProperties)

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={onClose} />
            <div style={{ position: "relative", background: "var(--surface)", borderRadius: 16, width: "min(720px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 25px 50px rgba(0,0,0,0.25)" }}>

                {/* Header */}
                <div style={{ padding: "20px 24px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <Avatar name={fullName} photo={e.photo} size={46} />
                            <div>
                                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{fullName}</div>
                                <div style={{ fontSize: 12, color: "var(--text3)", display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--accent)" }}>{e.employeeId}</span>
                                    {e.designation && <><span>·</span><span>{e.designation}</span></>}
                                    {site && <><span>·</span><MapPin size={11} /><span>{site}</span></>}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ padding: "4px 10px", borderRadius: 20, background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontSize: 11, fontWeight: 700 }}>{st.label}</span>
                            <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "var(--surface2)", cursor: "pointer", color: "var(--text3)", display: "flex" }}>
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
                        {(["personal", "employment", "bank", "safety", "docs"] as const).map(t => (
                            <button key={t} onClick={() => setTab(t)} style={tabCls(t)}>
                                {t === "personal" ? "Personal" : t === "employment" ? "Employment" : t === "bank" ? "Bank & Compliance" : t === "safety" ? "Safety" : `Documents${docs.length ? ` (${docs.length})` : ""}`}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

                    {tab === "personal" && (
                        <>
                            <Section title="Basic Info">
                                <Field label="Full Name" value={fullName} />
                                <Field label="Name as per Aadhar" value={e.nameAsPerAadhar} />
                                <Field label="Father's Name" value={e.fathersName} />
                                <Field label="Date of Birth" value={e.dateOfBirth ? format(new Date(e.dateOfBirth), "dd MMM yyyy") : null} />
                                <Field label="Gender" value={e.gender} />
                                <Field label="Blood Group" value={e.bloodGroup} />
                                <Field label="Marital Status" value={e.maritalStatus} />
                                <Field label="Nationality" value={e.nationality} />
                                <Field label="Religion" value={e.religion} />
                                <Field label="Caste" value={e.caste} />
                            </Section>
                            <Section title="Contact">
                                <Field label="Phone" value={e.phone} />
                                <Field label="Alternate Phone" value={e.alternatePhone} />
                                <Field label="Email" value={e.email} />
                            </Section>
                            <Section title="Current Address">
                                <Field label="Address" value={e.address} />
                                <Field label="City" value={e.city} />
                                <Field label="State" value={e.state} />
                                <Field label="Pincode" value={e.pincode} />
                            </Section>
                            <Section title="Permanent Address">
                                <Field label="Address" value={e.permanentAddress || e.address} />
                                <Field label="City" value={e.permanentCity || e.city} />
                                <Field label="State" value={e.permanentState || e.state} />
                                <Field label="Pincode" value={e.permanentPincode || e.pincode} />
                            </Section>
                            <Section title="Emergency Contacts">
                                <Field label="Contact 1 Name" value={e.emergencyContact1Name} />
                                <Field label="Contact 1 Phone" value={e.emergencyContact1Phone} />
                                <Field label="Contact 2 Name" value={e.emergencyContact2Name} />
                                <Field label="Contact 2 Phone" value={e.emergencyContact2Phone} />
                            </Section>
                        </>
                    )}

                    {tab === "employment" && (
                        <>
                            <Section title="Job Details">
                                <Field label="Employee ID" value={e.employeeId} />
                                <Field label="Designation" value={e.designation} />
                                <Field label="Department" value={e.department?.name} />
                                <Field label="Site" value={site} />
                                <Field label="Employment Type" value={e.employmentType} />
                                <Field label="Date of Joining" value={e.dateOfJoining ? format(new Date(e.dateOfJoining), "dd MMM yyyy") : null} />
                                <Field label="Basic Salary" value={e.basicSalary ? `₹${e.basicSalary.toLocaleString("en-IN")}` : null} />
                            </Section>
                            {e.employeeSalary && (
                                <Section title="Salary Structure">
                                    <Field label="Basic" value={e.employeeSalary.basic ? `₹${e.employeeSalary.basic}` : null} />
                                    <Field label="DA" value={e.employeeSalary.da ? `₹${e.employeeSalary.da}` : null} />
                                    <Field label="HRA" value={e.employeeSalary.hra ? `₹${e.employeeSalary.hra?.toFixed(0)}` : null} />
                                    <Field label="Washing" value={e.employeeSalary.washing ? `₹${e.employeeSalary.washing}` : null} />
                                    <Field label="Conveyance" value={e.employeeSalary.conveyance ? `₹${e.employeeSalary.conveyance}` : null} />
                                    <Field label="Leave with Wages" value={e.employeeSalary.leaveWithWages ? `₹${e.employeeSalary.leaveWithWages}` : null} />
                                    <Field label="Other Allowance" value={e.employeeSalary.otherAllowance ? `₹${e.employeeSalary.otherAllowance}` : null} />
                                    <Field label="CTC Monthly" value={e.employeeSalary.ctcMonthly ? `₹${e.employeeSalary.ctcMonthly?.toFixed(0)}` : null} />
                                </Section>
                            )}
                        </>
                    )}

                    {tab === "bank" && (
                        <>
                            <Section title="Bank Details">
                                <Field label="Bank Name" value={e.bankName} />
                                <Field label="Branch" value={e.bankBranch} />
                                <Field label="Account Number" value={e.bankAccountNumber} />
                                <Field label="IFSC Code" value={e.bankIFSC} />
                            </Section>
                            <Section title="Statutory / Compliance">
                                <Field label="Aadhar Number" value={e.aadharNumber} />
                                <Field label="PAN Number" value={e.panNumber} />
                                <Field label="UAN" value={e.uan} />
                                <Field label="PF Number" value={e.pfNumber} />
                                <Field label="ESI Number" value={e.esiNumber} />
                                <Field label="Labour Card No" value={e.labourCardNo} />
                            </Section>
                        </>
                    )}

                    {tab === "safety" && (
                        <Section title="Safety Equipment Issued">
                            <Field label="Safety Goggles" value={e.safetyGoggles} />
                            <Field label="Safety Gloves" value={e.safetyGloves} />
                            <Field label="Safety Helmet" value={e.safetyHelmet} />
                            <Field label="Safety Mask" value={e.safetyMask} />
                            <Field label="Safety Jacket" value={e.safetyJacket} />
                            <Field label="Ear Muffs" value={e.safetyEarMuffs} />
                            <Field label="Safety Shoes" value={e.safetyShoes} />
                        </Section>
                    )}

                    {tab === "docs" && (
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
                                Uploaded Documents
                            </div>
                            {docs.length === 0 ? (
                                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text3)" }}>
                                    <FileText size={28} style={{ margin: "0 auto 8px" }} />
                                    <p style={{ fontSize: 13, margin: 0 }}>No documents uploaded yet</p>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {docs.map((doc: any) => (
                                        <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)" }}>
                                            <FileText size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{doc.type.replace(/_/g, " ")}</div>
                                                <div style={{ fontSize: 11, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.fileName}</div>
                                            </div>
                                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: doc.status === "VERIFIED" ? "#dcfce7" : doc.status === "REJECTED" ? "#fee2e2" : "#fef3c7", color: doc.status === "VERIFIED" ? "#15803d" : doc.status === "REJECTED" ? "#dc2626" : "#d97706" }}>
                                                {doc.status}
                                            </span>
                                            {doc.fileUrl && (
                                                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>
                                                    <Eye size={13} /> View
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Action Footer */}
                {record.status === "ON_HOLD" && (
                    <div style={{ padding: "12px 24px", background: "#fee2e2", borderTop: "1px solid #fca5a5" }}>
                        <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
                            ✗ Rejected — {record.notes || "No reason provided"}
                        </div>
                    </div>
                )}

                <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "flex-end" }}>
                    {record.status !== "COMPLETED" && record.status !== "ON_HOLD" ? (
                        <>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Notes (optional)</label>
                                <input
                                    value={approveNotes}
                                    onChange={e => setApproveNotes(e.target.value)}
                                    placeholder="Add notes before approving…"
                                    style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface2)", color: "var(--text)", outline: "none" }}
                                />
                            </div>
                            <button onClick={doApprove} disabled={acting}
                                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 13, fontWeight: 700, cursor: acting ? "not-allowed" : "pointer", opacity: acting ? 0.7 : 1 }}>
                                {acting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                Approve
                            </button>
                            <button onClick={() => setShowReject(!showReject)} disabled={acting}
                                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 8, border: "1px solid #fca5a5", background: showReject ? "#fee2e2" : "var(--surface)", color: "#dc2626", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                                <XCircle size={14} />
                                Reject
                            </button>
                        </>
                    ) : record.status === "COMPLETED" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 8, background: "#dcfce7", border: "1px solid #86efac", flex: 1 }}>
                            <CheckCircle2 size={16} style={{ color: "#15803d" }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>Approved — Onboarding Complete</span>
                            {record.notes && <span style={{ fontSize: 12, color: "#15803d", marginLeft: 8 }}>· {record.notes}</span>}
                        </div>
                    ) : (
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 600, marginBottom: 8 }}>Re-review after rejection</div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={doApprove} disabled={acting}
                                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                                    <CheckCircle2 size={14} /> Approve Now
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Reject reason panel */}
                {showReject && record.status !== "COMPLETED" && (
                    <div style={{ padding: "0 24px 16px", display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Rejection Reason *</label>
                            <textarea
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder="Enter reason for rejection…"
                                rows={2}
                                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #fca5a5", fontSize: 12, background: "#fff5f5", color: "var(--text)", outline: "none", resize: "none" }}
                            />
                        </div>
                        <button onClick={doReject} disabled={acting}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                            {acting ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                            Confirm Reject
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const [records, setRecords] = useState<OnboardingRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState("ALL")
    const [search, setSearch] = useState("")
    const [selected, setSelected] = useState<OnboardingRecord | null>(null)

    const fetchRecords = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (filter !== "ALL") params.set("status", filter)
            if (search.trim()) params.set("search", search.trim())
            const res = await fetch(`/api/onboarding?${params}`)
            if (!res.ok) throw new Error("Failed")
            const data = await res.json()
            setRecords(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load onboarding records")
        } finally {
            setLoading(false)
        }
    }, [filter, search])

    useEffect(() => { fetchRecords() }, [fetchRecords])

    const handleAction = async (id: string, action: "approve" | "reject", reason?: string) => {
        try {
            const res = await fetch(`/api/onboarding/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, rejectionReason: reason, notes: action === "approve" ? reason : undefined }),
            })
            if (!res.ok) throw new Error(await res.text())
            if (action === "approve") {
                toast.success("Onboarding Approved! Redirecting to employee profile…")
                // Find the employee id from selected record
                const empId = selected?.employee?.id
                setSelected(null)
                fetchRecords()
                if (empId) {
                    setTimeout(() => router.push(`/employees/${empId}`), 800)
                }
            } else {
                toast.success("Onboarding Rejected")
                setSelected(null)
                fetchRecords()
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Action failed")
        }
    }

    // Counts for tabs
    const counts = records.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1
        return acc
    }, {} as Record<string, number>)

    const role = session?.user?.role

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1100, paddingBottom: 32 }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Onboarding</h1>
                    <p style={{ fontSize: 12, color: "var(--text3)", margin: "3px 0 0 0" }}>
                        Review, approve or reject newly joined employees
                    </p>
                </div>
                <button onClick={fetchRecords} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text2)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                    <RefreshCw size={13} /> Refresh
                </button>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                    { label: "Pending Review", count: (counts["IN_PROGRESS"] || 0) + (counts["NOT_STARTED"] || 0), color: "#d97706", bg: "#fef3c7", border: "#fcd34d" },
                    { label: "Approved",       count: counts["COMPLETED"] || 0, color: "#15803d", bg: "#dcfce7", border: "#86efac" },
                    { label: "Rejected",       count: counts["ON_HOLD"]   || 0, color: "#dc2626", bg: "#fee2e2", border: "#fca5a5" },
                    { label: "Total",          count: records.length,            color: "#6b7280", bg: "var(--surface2)", border: "var(--border)" },
                ].map(s => (
                    <div key={s.label} style={{ padding: "10px 16px", borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.count}</span>
                        <span style={{ fontSize: 12, color: s.color, fontWeight: 600 }}>{s.label}</span>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {/* Status filter */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {FILTER_TABS.map(t => (
                        <button key={t.key} onClick={() => setFilter(t.key)}
                            style={{ padding: "6px 14px", borderRadius: 20, border: filter === t.key ? "1px solid var(--accent)" : "1px solid var(--border)", background: filter === t.key ? "var(--accent)" : "var(--surface2)", color: filter === t.key ? "#fff" : "var(--text2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            {t.label}
                        </button>
                    ))}
                </div>
                {/* Search */}
                <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
                    <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name or employee ID…"
                        style={{ width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface2)", color: "var(--text)", outline: "none" }}
                    />
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, gap: 8, color: "var(--text3)" }}>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Loading onboarding records…</span>
                </div>
            ) : records.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
                    <User size={32} style={{ color: "var(--text3)", margin: "0 auto 12px" }} />
                    <p style={{ color: "var(--text2)", fontWeight: 600, margin: 0 }}>No onboarding records found</p>
                    <p style={{ color: "var(--text3)", fontSize: 12, margin: "4px 0 0" }}>Converted employees from Recruitment will appear here</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {records.map(record => {
                        const e = record.employee
                        const fullName = [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ")
                        const site = e.deployments?.[0]?.site?.name
                        const st = STATUS_CONFIG[record.status]
                        const Icon = st.icon

                        return (
                            <div key={record.id}
                                onClick={() => setSelected(record)}
                                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", transition: "all 0.15s", }}
                                onMouseEnter={el => (el.currentTarget.style.borderColor = "var(--accent)")}
                                onMouseLeave={el => (el.currentTarget.style.borderColor = "var(--border)")}
                            >
                                <Avatar name={fullName} photo={e.photo} size={42} />

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>{fullName}</div>
                                    <div style={{ fontSize: 12, color: "var(--text3)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--accent)" }}>{e.employeeId}</span>
                                        {e.designation && <span>{e.designation}</span>}
                                        {e.department?.name && <><Building2 size={11} /><span>{e.department.name}</span></>}
                                        {site && <><MapPin size={11} /><span>{site}</span></>}
                                        {e.phone && <><Phone size={11} /><span>{e.phone}</span></>}
                                        {e.dateOfJoining && <><Calendar size={11} /><span>Joined {format(new Date(e.dateOfJoining), "dd MMM yyyy")}</span></>}
                                    </div>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                                    <span style={{ padding: "4px 10px", borderRadius: 20, background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                                        <Icon size={11} />
                                        {st.label}
                                    </span>
                                    {record.status === "ON_HOLD" && record.notes && (
                                        <span style={{ fontSize: 11, color: "#dc2626", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={record.notes}>
                                            {record.notes}
                                        </span>
                                    )}
                                    <ChevronRight size={14} style={{ color: "var(--text3)" }} />
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Detail Modal */}
            {selected && (
                <DetailModal
                    record={selected}
                    onClose={() => setSelected(null)}
                    onAction={handleAction}
                />
            )}
        </div>
    )
}
