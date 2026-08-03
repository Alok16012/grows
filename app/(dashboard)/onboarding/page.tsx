"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import {
    Search, Loader2, CheckCircle2, XCircle, Clock,
    User, Phone, MapPin, X, ChevronRight, ChevronLeft, MoreVertical,
    Building2, Calendar, RefreshCw, FileText, Eye, Link2, Copy, Check,
    Users, ClipboardList, SlidersHorizontal, ChevronsUpDown,
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { DocumentViewer } from "@/components/DocumentViewer"

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Pending candidates carry a temporary PENDING-xxxx placeholder id until their
// onboarding is approved (a real EMP-NNNN code is assigned then). Show a clean
// "Pending" label instead of the raw placeholder so the UI has one format.
function displayEmpId(id?: string | null): string {
    if (!id || id.startsWith("PENDING-") || id.startsWith("EXT-")) return "Pending"
    return id
}

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
            <span className="text-[11px] md:text-[10px]" style={{ fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
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

function DetailModal({ record: listRecord, onClose, onAction }: {
    record: OnboardingRecord
    onClose: () => void
    onAction: (id: string, action: "approve" | "reject", reason?: string) => Promise<void>
}) {
    // The list API now returns a slim summary (fast to load); the full record —
    // all KYC fields + documents — is fetched here when the modal opens.
    const [record, setRecord] = useState<OnboardingRecord>(listRecord)
    const [detailLoading, setDetailLoading] = useState(true)
    useEffect(() => {
        let stop = false
        fetch(`/api/onboarding/${listRecord.id}`)
            .then(r => (r.ok ? r.json() : null))
            .then(full => {
                if (stop || !full) return
                setRecord(full)
                setDocs(((full.employee?.documents as any[]) || []))
            })
            .catch(() => { /* keep summary */ })
            .finally(() => { if (!stop) setDetailLoading(false) })
        return () => { stop = true }
    }, [listRecord.id])

    const e = record.employee
    const [tab, setTab] = useState<"personal" | "employment" | "bank" | "safety" | "docs">("personal")
    const [acting, setActing] = useState(false)
    const [showReject, setShowReject] = useState(false)
    const [rejectReason, setRejectReason] = useState(listRecord.notes || "")
    const [approveNotes, setApproveNotes] = useState("")
    const [viewDoc, setViewDoc] = useState<{ url: string; name: string } | null>(null)
    const [docs, setDocs] = useState<{ id: string; type: string; fileName: string; fileUrl: string; status: string; rejectionReason?: string | null }[]>(((listRecord.employee.documents as any[]) || []))
    const [docActing, setDocActing] = useState<string | null>(null)
    const [docRejectId, setDocRejectId] = useState<string | null>(null)
    const [docRejectReason, setDocRejectReason] = useState("")

    const verifyDoc = async (docId: string, status: "VERIFIED" | "REJECTED", reason?: string) => {
        setDocActing(docId)
        try {
            const res = await fetch("/api/onboarding/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "DOCUMENT",
                    employeeId: e.id,
                    documentId: docId,
                    status,
                    rejectionReason: reason,
                }),
            })
            if (!res.ok) throw new Error(await res.text())
            setDocs(prev => prev.map(d => d.id === docId ? { ...d, status, rejectionReason: status === "REJECTED" ? (reason || null) : null } : d))
            toast.success(status === "VERIFIED" ? "Document verified" : "Document rejected")
            setDocRejectId(null)
            setDocRejectReason("")
        } catch (err: any) {
            toast.error(err?.message || "Failed to update document")
        } finally {
            setDocActing(null)
        }
    }

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
        // The strip scrolls horizontally on narrow screens — tabs must not squash.
        flexShrink: 0, whiteSpace: "nowrap",
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
                                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--accent)" }}>{displayEmpId(e.employeeId)}</span>
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
                                <Field label="Employee ID" value={displayEmpId(e.employeeId)} />
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
                            {docs.length === 0 && detailLoading ? (
                                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text3)" }}>
                                    <Loader2 size={22} className="animate-spin" style={{ margin: "0 auto 8px" }} />
                                    <p style={{ fontSize: 13, margin: 0 }}>Loading documents…</p>
                                </div>
                            ) : docs.length === 0 ? (
                                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text3)" }}>
                                    <FileText size={28} style={{ margin: "0 auto 8px" }} />
                                    <p style={{ fontSize: 13, margin: 0 }}>No documents uploaded yet</p>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {docs.map((doc) => (
                                        <div key={doc.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                                <FileText size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{doc.type.replace(/_/g, " ")}</div>
                                                    <div style={{ fontSize: 11, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.fileName}</div>
                                                    {doc.status === "REJECTED" && doc.rejectionReason && (
                                                        <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>Reason: {doc.rejectionReason}</div>
                                                    )}
                                                </div>
                                                <span className="text-[11px] md:text-[10px]" style={{ padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: doc.status === "VERIFIED" ? "#dcfce7" : doc.status === "REJECTED" ? "#fee2e2" : "#fef3c7", color: doc.status === "VERIFIED" ? "#15803d" : doc.status === "REJECTED" ? "#dc2626" : "#d97706" }}>
                                                    {doc.status}
                                                </span>
                                                {doc.fileUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setViewDoc({ url: doc.fileUrl, name: doc.fileName || doc.type })}
                                                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--accent)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                                    >
                                                        <Eye size={13} /> View
                                                    </button>
                                                )}
                                                {doc.status !== "VERIFIED" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => verifyDoc(doc.id, "VERIFIED")}
                                                        disabled={docActing === doc.id}
                                                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#15803d", fontWeight: 700, background: "#dcfce7", border: "1px solid #86efac", borderRadius: 6, cursor: docActing === doc.id ? "not-allowed" : "pointer", padding: "4px 8px" }}
                                                    >
                                                        {docActing === doc.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Verify
                                                    </button>
                                                )}
                                                {doc.status !== "REJECTED" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => { setDocRejectId(doc.id); setDocRejectReason("") }}
                                                        disabled={docActing === doc.id}
                                                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#dc2626", fontWeight: 700, background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, cursor: "pointer", padding: "4px 8px" }}
                                                    >
                                                        <XCircle size={12} /> Reject
                                                    </button>
                                                )}
                                            </div>
                                            {docRejectId === doc.id && (
                                                <div style={{ display: "flex", gap: 6, padding: "8px", background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
                                                    <input
                                                        autoFocus
                                                        value={docRejectReason}
                                                        onChange={ev => setDocRejectReason(ev.target.value)}
                                                        placeholder="Rejection reason…"
                                                        style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid #fca5a5", fontSize: 12, background: "#fff", color: "#7f1d1d", outline: "none" }}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (!docRejectReason.trim()) { toast.error("Reason required"); return }
                                                            verifyDoc(doc.id, "REJECTED", docRejectReason.trim())
                                                        }}
                                                        disabled={docActing === doc.id}
                                                        style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                                                    >
                                                        Confirm
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setDocRejectId(null); setDocRejectReason("") }}
                                                        style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
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

                <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                    {record.status !== "COMPLETED" && record.status !== "ON_HOLD" ? (
                        <>
                            <div style={{ flex: 1, minWidth: 180 }}>
                                <label className="text-[11px] md:text-[10px]" style={{ fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Notes (optional)</label>
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
                    <div style={{ padding: "0 24px 16px", display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 180 }}>
                            <label className="text-[11px] md:text-[10px]" style={{ fontWeight: 700, color: "#dc2626", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Rejection Reason *</label>
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
            {viewDoc && (
                <DocumentViewer url={viewDoc.url} fileName={viewDoc.name} onClose={() => setViewDoc(null)} />
            )}
        </div>
    )
}

// ─── Pagination arrow ──────────────────────────────────────────────────────────
function PageArrow({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button onClick={onClick} disabled={disabled}
            style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text2)", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            {children}
        </button>
    )
}

// ─── Table row ──────────────────────────────────────────────────────────────────
function OnboardingRow({ record, expanded, checked, onCheck, onToggle, onOpen, onApprove }: {
    record: OnboardingRecord
    expanded: boolean
    checked: boolean
    onCheck: () => void
    onToggle: () => void
    onOpen: () => void
    onApprove: () => void
}) {
    const e = record.employee
    const fullName = [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ")
    const site = e.deployments?.[0]?.site?.name
    const st = STATUS_CONFIG[record.status]
    const StIcon = st.icon
    const isPending = record.status === "IN_PROGRESS" || record.status === "NOT_STARTED"

    const tasks = record.tasks ?? []
    const totalTasks = tasks.length || 7
    const doneTasks = tasks.filter(t => t.status === "COMPLETED").length
    const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

    // With borderCollapse: separate, draw row separators via borderBottom.
    // When expanded, the row group is outlined with an accent box (top/side
    // borders here; the expansion cell closes the box below).
    const topB = expanded ? "2px solid var(--accent)" : "none"
    const botB = expanded ? "none" : "1px solid var(--border)"
    const cell: React.CSSProperties = { padding: "14px 16px", verticalAlign: "middle", borderTop: topB, borderBottom: botB, background: expanded ? "var(--accent-light, #f0fdf9)" : undefined }

    return (
        <>
            <tr style={{ transition: "background 0.15s" }}
                onMouseEnter={el => { if (!expanded) el.currentTarget.querySelectorAll("td").forEach(td => (td as HTMLElement).style.background = "var(--surface2)") }}
                onMouseLeave={el => { if (!expanded) el.currentTarget.querySelectorAll("td").forEach(td => (td as HTMLElement).style.background = "") }}>
                {/* Checkbox */}
                <td style={{ ...cell, width: 40, padding: "14px 6px 14px 16px", borderLeft: expanded ? "2px solid var(--accent)" : "none", borderTopLeftRadius: expanded ? 12 : 0 }}>
                    <input type="checkbox" checked={checked} onChange={onCheck}
                        style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }} />
                </td>
                {/* Employee */}
                <td style={cell}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <Avatar name={fullName} photo={e.photo} size={38} />
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>{fullName}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2 }}>
                                <span style={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 700, color: "var(--accent)" }}>{displayEmpId(e.employeeId)}</span>
                                {isPending && (
                                    <span style={{ fontSize: 9.5, fontWeight: 700, color: "#15803d", background: "#dcfce7", padding: "1px 7px", borderRadius: 20, letterSpacing: "0.3px" }}>New</span>
                                )}
                            </div>
                        </div>
                    </div>
                </td>
                {/* Role / Designation */}
                <td style={cell}>
                    <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, whiteSpace: "nowrap" }}>{e.designation || "—"}</div>
                    {e.department?.name && <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 1 }}>{e.department.name}</div>}
                </td>
                {/* Site */}
                <td style={cell}>
                    {site ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--text)", whiteSpace: "nowrap" }}>
                            <MapPin size={12} style={{ color: "var(--text3)" }} /> {site}
                        </div>
                    ) : <span style={{ color: "var(--text3)" }}>—</span>}
                </td>
                {/* Contact */}
                <td style={cell}>
                    {e.phone ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--text2)", whiteSpace: "nowrap" }}>
                            <Phone size={12} style={{ color: "var(--text3)" }} /> {e.phone}
                        </div>
                    ) : <span style={{ color: "var(--text3)" }}>—</span>}
                </td>
                {/* Joined On */}
                <td style={cell}>
                    {e.dateOfJoining ? (
                        <div style={{ whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--text)" }}>
                                <Calendar size={12} style={{ color: "var(--text3)" }} /> {format(new Date(e.dateOfJoining), "dd MMM yyyy")}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1, paddingLeft: 17 }}>
                                {formatDistanceToNow(new Date(e.dateOfJoining), { addSuffix: true })}
                            </div>
                        </div>
                    ) : <span style={{ color: "var(--text3)" }}>—</span>}
                </td>
                {/* Progress */}
                <td style={cell}>
                    <div style={{ minWidth: 130 }}>
                        <div style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 4, whiteSpace: "nowrap" }}>{doneTasks} of {totalTasks} Completed</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 4, background: "var(--surface2)", overflow: "hidden" }}>
                                <div style={{ width: `${progress}%`, height: "100%", borderRadius: 4, background: progress === 100 ? "#15803d" : "var(--accent, #1a9e6e)" }} />
                            </div>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text2)", fontVariantNumeric: "tabular-nums" }}>{progress}%</span>
                        </div>
                    </div>
                </td>
                {/* Status */}
                <td style={cell}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                        <StIcon size={11} /> {st.label}
                    </span>
                </td>
                {/* Actions */}
                <td style={{ ...cell, borderRight: expanded ? "2px solid var(--accent)" : "none", borderTopRightRadius: expanded ? 12 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button onClick={onOpen}
                            style={{ padding: "7px 16px", borderRadius: 8, border: isPending ? "none" : "1px solid var(--border)", background: isPending ? "var(--accent, #1a9e6e)" : "var(--surface)", color: isPending ? "#fff" : "var(--text2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                            {isPending ? "Review" : "View"}
                        </button>
                        <button onClick={onToggle} title="Quick actions"
                            style={{ width: 30, height: 30, borderRadius: 8, border: expanded ? "1px solid var(--accent)" : "1px solid var(--border)", background: expanded ? "var(--accent-light, #f0fdf9)" : "var(--surface)", color: expanded ? "var(--accent)" : "var(--text3)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            <MoreVertical size={15} />
                        </button>
                    </div>
                </td>
            </tr>

            {/* Expanded quick-actions row */}
            {expanded && (
                <tr>
                    <td colSpan={9} style={{ padding: 0, background: "var(--accent-light, #f0fdf9)", borderLeft: "2px solid var(--accent)", borderRight: "2px solid var(--accent)", borderBottom: "2px solid var(--accent)", borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, padding: "6px 16px 16px" }}>
                            {[
                                { icon: Eye,           title: "Review",         sub: "Review employee details", color: "#3b82f6", onClick: onOpen },
                                { icon: CheckCircle2,  title: "Approve",        sub: "Approve onboarding",      color: "#15803d", onClick: onApprove },
                                { icon: XCircle,       title: "Reject",         sub: "Reject onboarding",       color: "#dc2626", onClick: onOpen },
                                { icon: ClipboardList, title: "View Checklist", sub: "See onboarding tasks",    color: "#6b7280", onClick: onOpen },
                            ].map(a => (
                                <button key={a.title} onClick={a.onClick}
                                    style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", textAlign: "left" }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 10, background: a.color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <a.icon size={17} style={{ color: a.color }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{a.title}</div>
                                        <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 1 }}>{a.sub}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </td>
                </tr>
            )}
        </>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
    const { data: session } = useSession()
    const [records, setRecords] = useState<OnboardingRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState("ALL")
    const [search, setSearch] = useState("")
    // Debounced copy of `search` — the actual fetch keys off this so we don't
    // fire a request on every keystroke (which caused out-of-order responses to
    // overwrite the filtered list).
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [selected, setSelected] = useState<OnboardingRecord | null>(null)
    const [linkCopied, setLinkCopied] = useState(false)
    const [shareOpen, setShareOpen] = useState(false)
    const [shareRole, setShareRole] = useState("")
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [page, setPage] = useState(1)
    const [perPage, setPerPage] = useState(10)
    useEffect(() => { setPage(1) }, [filter, debouncedSearch, perPage])

    // Personalized join link — embeds the logged-in user as the HR contact (ref)
    // and an optional role, so candidates who open it get their HR auto-assigned
    // and the role pre-filled (no manual picking = fewer mistakes).
    const uid = (session?.user as { id?: string })?.id || ""
    const joinLink = `${typeof window !== "undefined" ? window.location.origin : ""}/join`
        + `?ref=${encodeURIComponent(uid)}`
        + (shareRole.trim() ? `&role=${encodeURIComponent(shareRole.trim())}` : "")

    const copyJoinLink = () => {
        navigator.clipboard.writeText(joinLink)
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2500)
        toast.success("Personalized join link copied!")
    }

    // Debounce the search box so we query 300ms after typing stops.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(t)
    }, [search])

    // Monotonic request id — only the newest response is allowed to update state,
    // so a slow earlier request can never overwrite a newer filtered result.
    const reqIdRef = useRef(0)

    const fetchRecords = useCallback(async () => {
        const reqId = ++reqIdRef.current
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (filter !== "ALL") params.set("status", filter)
            if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim())
            const res = await fetch(`/api/onboarding?${params}`)
            if (!res.ok) throw new Error("Failed")
            const data = await res.json()
            if (reqId !== reqIdRef.current) return // a newer request superseded this one
            setRecords(Array.isArray(data) ? data : [])
        } catch {
            if (reqId === reqIdRef.current) toast.error("Failed to load onboarding records")
        } finally {
            if (reqId === reqIdRef.current) setLoading(false)
        }
    }, [filter, debouncedSearch])

    useEffect(() => { fetchRecords() }, [fetchRecords])

    const handleAction = async (id: string, action: "approve" | "reject", reason?: string, force?: boolean) => {
        try {
            const res = await fetch(`/api/onboarding/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, rejectionReason: reason, notes: action === "approve" ? reason : undefined, force }),
            })
            if (!res.ok) {
                const raw = await res.text()
                // Approval is refused when required KYC documents are missing.
                // Offer to go ahead anyway, for records collected on paper or
                // created before the check existed.
                try {
                    const err = JSON.parse(raw)
                    if (err?.canForce) {
                        if (confirm(`${err.message}\n\nApprove anyway?`)) {
                            return handleAction(id, action, reason, true)
                        }
                        return
                    }
                    throw new Error(err?.message || err?.error || raw)
                } catch (parseErr) {
                    if (parseErr instanceof Error && parseErr.message !== raw) throw parseErr
                    throw new Error(raw)
                }
            }
            if (action === "approve") {
                toast.success("Onboarding Approved! Employee is now Active.")
                setSelected(null)
                fetchRecords()
                // Stay on the onboarding page after approval — the list refresh
                // above already reflects the new status (no redirect to Employees).
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

    const total = records.length
    const pct = (n: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}% of total` : "0% of total"

    const kpis = [
        { label: "Pending Review", count: (counts["IN_PROGRESS"] || 0) + (counts["NOT_STARTED"] || 0), color: "#d97706", bg: "#fef3c7", icon: Clock },
        { label: "Approved",       count: counts["COMPLETED"] || 0, color: "#15803d", bg: "#dcfce7", icon: CheckCircle2 },
        { label: "Rejected",       count: counts["ON_HOLD"]   || 0, color: "#dc2626", bg: "#fee2e2", icon: XCircle },
        { label: "Total",          count: total,                    color: "#3b82f6", bg: "#eff6ff", icon: Users, isTotal: true },
    ]

    // Client-side pagination over the fetched (already status/search filtered) list.
    const totalPages = Math.max(1, Math.ceil(records.length / perPage))
    const safePage = Math.min(page, totalPages)
    const pageRows = records.slice((safePage - 1) * perPage, safePage * perPage)

    return (
        <div className="px-4 lg:px-0" style={{ display: "flex", flexDirection: "column", gap: 18, paddingBottom: 32 }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", margin: 0, letterSpacing: "-0.4px" }}>Onboarding</h1>
                    <p style={{ fontSize: 13, color: "var(--text3)", margin: "4px 0 0 0" }}>
                        Review, approve or reject newly joined employees
                    </p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setShareOpen(true)}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        <Link2 size={15} /> Share Join Link
                    </button>
                    <button onClick={fetchRecords}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
            </div>

            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                {kpis.map(s => (
                    <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <s.icon size={21} style={{ color: s.color }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 12.5, color: "var(--text3)", margin: 0, fontWeight: 500 }}>{s.label}</p>
                            <p style={{ fontSize: 27, fontWeight: 800, color: s.color, margin: "1px 0 2px", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{s.count}</p>
                            <p style={{ fontSize: 11.5, color: "var(--text3)", margin: 0 }}>{s.isTotal ? "100% of total" : pct(s.count)}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filter tabs + search */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div className="flex gap-1 overflow-x-auto max-w-full">
                    {FILTER_TABS.map(t => (
                        <button key={t.key} onClick={() => setFilter(t.key)} className="shrink-0"
                            style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: filter === t.key ? "var(--accent)" : "transparent", color: filter === t.key ? "#fff" : "var(--text2)", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                            {t.label}
                        </button>
                    ))}
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ position: "relative", minWidth: 240, flex: "0 1 360px" }}>
                    <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }} />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name or employee ID..."
                        style={{ width: "100%", height: 40, paddingLeft: 36, paddingRight: 12, borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text)", outline: "none", boxSizing: "border-box" }} />
                </div>
                <button
                    style={{ display: "flex", alignItems: "center", gap: 7, height: 40, padding: "0 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    <SlidersHorizontal size={15} /> Filters
                </button>
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, gap: 8, color: "var(--text3)" }}>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Loading onboarding records…</span>
                </div>
            ) : records.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14 }}>
                    <User size={32} style={{ color: "var(--text3)", margin: "0 auto 12px" }} />
                    <p style={{ color: "var(--text2)", fontWeight: 600, margin: 0 }}>No onboarding records found</p>
                    <p style={{ color: "var(--text3)", fontSize: 12, margin: "4px 0 0" }}>Converted employees from Recruitment will appear here</p>
                </div>
            ) : (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13, minWidth: 1020 }}>
                            <thead>
                                <tr>
                                    <th style={{ padding: "13px 6px 13px 16px", borderBottom: "1px solid var(--border)", width: 40 }}>
                                        <input type="checkbox"
                                            checked={pageRows.length > 0 && pageRows.every(r => selectedIds.has(r.id))}
                                            ref={el => { if (el) el.indeterminate = pageRows.some(r => selectedIds.has(r.id)) && !pageRows.every(r => selectedIds.has(r.id)) }}
                                            onChange={e => {
                                                setSelectedIds(prev => {
                                                    const next = new Set(prev)
                                                    if (e.target.checked) pageRows.forEach(r => next.add(r.id))
                                                    else pageRows.forEach(r => next.delete(r.id))
                                                    return next
                                                })
                                            }}
                                            style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }} />
                                    </th>
                                    {[
                                        { label: "Employee", sort: true },
                                        { label: "Role / Designation", sort: true },
                                        { label: "Site", sort: true },
                                        { label: "Contact", sort: true },
                                        { label: "Joined On", sort: false },
                                        { label: "Progress", sort: false },
                                        { label: "Status", sort: false },
                                        { label: "Actions", sort: false },
                                    ].map(h => (
                                        <th key={h.label} style={{ textAlign: "left", padding: "13px 16px", fontSize: 11.5, fontWeight: 600, color: "var(--text3)", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" }}>
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                                {h.label}{h.sort && <ChevronsUpDown size={12} style={{ opacity: 0.5 }} />}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {pageRows.map(record => (
                                    <OnboardingRow
                                        key={record.id}
                                        record={record}
                                        expanded={expandedId === record.id}
                                        checked={selectedIds.has(record.id)}
                                        onCheck={() => setSelectedIds(prev => { const n = new Set(prev); n.has(record.id) ? n.delete(record.id) : n.add(record.id); return n })}
                                        onToggle={() => setExpandedId(id => id === record.id ? null : record.id)}
                                        onOpen={() => setSelected(record)}
                                        onApprove={() => { if (confirm("Approve this employee's onboarding?")) handleAction(record.id, "approve") }}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: 10 }}>
                        <span style={{ fontSize: 12.5, color: "var(--text3)" }}>
                            Showing {(safePage - 1) * perPage + 1} to {(safePage - 1) * perPage + pageRows.length} of {records.length} results
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <PageArrow disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={15} /></PageArrow>
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    const start = Math.max(1, Math.min(totalPages - 4, safePage - 2))
                                    const p = start + i
                                    if (p > totalPages) return null
                                    return (
                                        <button key={p} onClick={() => setPage(p)}
                                            style={{ minWidth: 32, height: 32, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                                                border: p === safePage ? "1px solid var(--accent)" : "1px solid var(--border)",
                                                background: p === safePage ? "var(--accent)" : "var(--surface)",
                                                color: p === safePage ? "#fff" : "var(--text2)" }}>
                                            {p}
                                        </button>
                                    )
                                })}
                                {totalPages > 5 && safePage < totalPages - 2 && <span style={{ color: "var(--text3)", padding: "0 4px" }}>…</span>}
                                <PageArrow disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}><ChevronRight size={15} /></PageArrow>
                            </div>
                            <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}
                                style={{ height: 32, padding: "0 8px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5, background: "var(--surface)", color: "var(--text2)", outline: "none", cursor: "pointer" }}>
                                {[10, 20, 50].map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                        </div>
                    </div>
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

            {/* Share Join Link modal */}
            {shareOpen && (
                <div onClick={() => setShareOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                    <div onClick={e => e.stopPropagation()}
                        style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
                        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#e8f7f1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <Link2 size={18} style={{ color: "var(--accent)" }} />
                                </div>
                                <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: 0 }}>Share Join Link</h2>
                            </div>
                            <button onClick={() => setShareOpen(false)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text3)" }}><X size={18} /></button>
                        </div>
                        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                            <p style={{ fontSize: 13, color: "var(--text2)", margin: 0, lineHeight: 1.5 }}>
                                Send this link to the candidate. They register themselves with <b>you as their HR contact</b>, so nobody has to pick an HR manually and there is less room for mistakes.
                            </p>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", display: "block", marginBottom: 6 }}>Role / Designation (optional)</label>
                                <input value={shareRole} onChange={e => setShareRole(e.target.value)}
                                    placeholder="e.g. Quality Inspector"
                                    style={{ width: "100%", height: 42, borderRadius: 10, border: "1px solid var(--border)", padding: "0 12px", fontSize: 13.5, background: "var(--surface)", color: "var(--text)", outline: "none", boxSizing: "border-box" }} />
                                <p style={{ fontSize: 11.5, color: "var(--text3)", margin: "6px 0 0" }}>Fill this in and the designation is pre-filled on the candidate's form.</p>
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", display: "block", marginBottom: 6 }}>Your personalized link</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input readOnly value={joinLink}
                                        onFocus={e => e.currentTarget.select()}
                                        style={{ flex: 1, height: 42, borderRadius: 10, border: "1px solid var(--border)", padding: "0 12px", fontSize: 12.5, background: "var(--surface2)", color: "var(--text2)", outline: "none", boxSizing: "border-box" }} />
                                    <button onClick={copyJoinLink}
                                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                        {linkCopied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}
                                    </button>
                                </div>
                            </div>
                            <a href={`https://wa.me/?text=${encodeURIComponent(`Hello! Please complete your onboarding for Growus Auto using this link:\n${joinLink}`)}`}
                                target="_blank" rel="noreferrer"
                                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 42, borderRadius: 10, border: "1px solid #25d366", background: "#25d36612", color: "#128c3e", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                                Share on WhatsApp
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
