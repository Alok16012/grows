"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import {
    UploadCloud, CheckCircle2, AlertCircle, FileText, Loader2,
    User, Banknote, ShieldAlert, Phone, MapPin, ChevronRight, ChevronLeft, Camera
} from "lucide-react"
import { toast } from "sonner"
import {
    validatePhone, validateAadhaar, validatePAN, validateIFSC,
    validateBankAccount, validateUAN, validateESIC,
    validatePincode, validateDateOfBirth,
} from "@/lib/validation"

// ─── Types ────────────────────────────────────────────────────────────────────

type Doc = { type: string; fileName: string; fileUrl: string; status?: string | null; rejectionReason?: string | null }

type FormData = {
    // Personal
    middleName: string
    nameAsPerAadhar: string
    dateOfBirth: string
    gender: string
    bloodGroup: string
    fathersName: string
    maritalStatus: string
    nationality: string
    religion: string
    caste: string
    alternatePhone: string
    photo: string
    // Assignment
    siteId: string
    hrId: string
    designation: string
    dateOfJoining: string
    employmentType: string
    // Current Address
    address: string
    city: string
    state: string
    pincode: string
    // Permanent Address
    permanentAddress: string
    permanentCity: string
    permanentState: string
    permanentPincode: string
    sameAsCurrent: boolean
    // Emergency Contact
    emergencyContact1Name: string
    emergencyContact1Phone: string
    // KYC
    aadharNumber: string
    panNumber: string
    // Statutory numbers (previous employment)
    uan: string
    esiNumber: string
    labourCardNo: string
    // Bank
    bankName: string
    bankAccountNumber: string
    bankIFSC: string
    bankBranch: string
}

type SiteOption = { id: string; name: string; code?: string | null }
type HrOption = { id: string; name: string; email?: string | null; role?: string | null; customRole?: { name: string } | null }

const EMPTY: FormData = {
    middleName: "", nameAsPerAadhar: "",
    dateOfBirth: "", gender: "", bloodGroup: "", fathersName: "", maritalStatus: "",
    nationality: "Indian", religion: "", caste: "", alternatePhone: "", photo: "",
    siteId: "", hrId: "", designation: "", dateOfJoining: "", employmentType: "",
    address: "", city: "", state: "", pincode: "",
    permanentAddress: "", permanentCity: "", permanentState: "", permanentPincode: "", sameAsCurrent: false,
    emergencyContact1Name: "", emergencyContact1Phone: "",
    aadharNumber: "", panNumber: "",
    uan: "", esiNumber: "", labourCardNo: "",
    bankName: "", bankAccountNumber: "", bankIFSC: "", bankBranch: "",
}

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Daily Wage"]
// `type` MUST be the enum key the rest of the system uses (Document Master,
// employee document views). Storing the human label here previously meant
// onboarding docs never matched those slots and looked "missing".
const DOC_TYPES: { type: string; label: string }[] = [
    { type: "AADHAAR",      label: "Aadhaar Card" },
    { type: "PAN",          label: "PAN Card" },
    { type: "PHOTO",        label: "Photo" },
    { type: "RESUME",       label: "Resume" },
    { type: "CERTIFICATE",  label: "Educational Certificates" },
    { type: "BANK_DETAILS", label: "Bank Proof" },
]

const STEPS = [
    { id: 1, label: "Personal", icon: User },
    { id: 2, label: "Address", icon: MapPin },
    { id: 3, label: "Emergency", icon: Phone },
    { id: 4, label: "KYC", icon: ShieldAlert },
    { id: 5, label: "Bank", icon: Banknote },
    { id: 6, label: "Documents", icon: FileText },
]

// ─── Input helpers ─────────────────────────────────────────────────────────────

const inp = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-indigo-500 transition-colors placeholder:text-white/30"
const lbl = "block text-[11px] font-medium text-white/50 mb-1.5 uppercase tracking-wider"

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string | null }) {
    return (
        <div>
            <label className={lbl}>{label}</label>
            {children}
            {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
        </div>
    )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function OnboardingPortal() {
    const params = useParams()
    const token = params.token as string

    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [employee, setEmployee] = useState<any>(null)
    const [step, setStep] = useState(1)
    const [form, setForm] = useState<FormData>(EMPTY)
    const [docs, setDocs] = useState<Doc[]>([])
    const [uploadingDocs, setUploadingDocs] = useState<Record<string, boolean>>({})
    const [photoUploading, setPhotoUploading] = useState(false)
    const [sites, setSites] = useState<SiteOption[]>([])
    const [hrUsers, setHrUsers] = useState<HrOption[]>([])

    useEffect(() => {
        if (!token) return
        fetch(`/api/external/onboarding/${token}`)
            .then(r => r.json())
            .then(data => {
                if (data.id) {
                    setEmployee(data)
                    if (Array.isArray(data.sites)) setSites(data.sites)
                    if (Array.isArray(data.hrUsers)) setHrUsers(data.hrUsers)
                    setForm({
                        middleName: data.middleName || "",
                        nameAsPerAadhar: data.nameAsPerAadhar || "",
                        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString().split("T")[0] : "",
                        gender: data.gender || "",
                        bloodGroup: data.bloodGroup || "",
                        fathersName: data.fathersName || "",
                        maritalStatus: data.maritalStatus || "",
                        nationality: data.nationality || "Indian",
                        religion: data.religion || "",
                        caste: data.caste || "",
                        alternatePhone: data.alternatePhone || "",
                        photo: data.photo || "",
                        siteId: data.currentSiteId || "",
                        hrId: data.managerId || "",
                        designation: data.designation || "",
                        dateOfJoining: data.dateOfJoining ? new Date(data.dateOfJoining).toISOString().split("T")[0] : "",
                        employmentType: data.employmentType || "",
                        address: data.address || "",
                        city: data.city || "",
                        state: data.state || "",
                        pincode: data.pincode || "",
                        permanentAddress: data.permanentAddress || "",
                        permanentCity: data.permanentCity || "",
                        permanentState: data.permanentState || "",
                        permanentPincode: data.permanentPincode || "",
                        sameAsCurrent: false,
                        emergencyContact1Name: data.emergencyContact1Name || "",
                        emergencyContact1Phone: data.emergencyContact1Phone || "",
                        aadharNumber: data.aadharNumber || "",
                        panNumber: data.panNumber || "",
                        uan: data.uan || "",
                        esiNumber: data.esiNumber || "",
                        labourCardNo: data.labourCardNo || "",
                        bankName: data.bankName || "",
                        bankAccountNumber: data.bankAccountNumber || "",
                        bankIFSC: data.bankIFSC || "",
                        bankBranch: data.bankBranch || "",
                    })
                    if (data.documents) setDocs(data.documents)
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [token])

    const set = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value }))

    const handleSameAsCurrent = (checked: boolean) => {
        if (checked) {
            setForm(f => ({
                ...f,
                sameAsCurrent: true,
                permanentAddress: f.address,
                permanentCity: f.city,
                permanentState: f.state,
                permanentPincode: f.pincode,
            }))
        } else {
            setForm(f => ({ ...f, sameAsCurrent: false }))
        }
    }

    const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setPhotoUploading(true)
        try {
            const fd = new FormData()
            fd.append("file", file)
            const res = await fetch("/api/upload", { method: "POST", headers: { "x-onboarding-token": token }, body: fd })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            setForm(f => ({ ...f, photo: data.url }))
            toast.success("Photo uploaded")
        } catch {
            toast.error("Photo upload failed")
        } finally {
            setPhotoUploading(false)
        }
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: string, label: string) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploadingDocs(p => ({ ...p, [type]: true }))
        try {
            const fd = new FormData()
            fd.append("file", file)
            const res = await fetch("/api/upload", { method: "POST", headers: { "x-onboarding-token": token }, body: fd })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            setDocs(p => [...p.filter(d => d.type !== type), { type, fileName: file.name, fileUrl: data.url }])
            toast.success(`${label} uploaded`)
        } catch {
            toast.error(`Failed to upload ${label}`)
        } finally {
            setUploadingDocs(p => ({ ...p, [type]: false }))
        }
    }

    // Same rule as the Employee form: Aadhaar, PAN and bank proof are compulsory.
    // Older uploads were stored under the human label ("Aadhaar Card") instead of
    // the enum key, so match loosely — otherwise an already-uploaded document
    // reads as missing and the candidate can never submit.
    const normType = (t?: string | null) => (t || "").toUpperCase().replace(/[^A-Z]/g, "")
    // Must match the set HR approval enforces (app/api/onboarding/[id]/route.ts),
    // otherwise an applicant submits successfully and HR is then blocked from
    // approving them.
    const REQUIRED_DOCS = [
        { type: "AADHAAR", label: "Aadhaar Card", match: (n: string) => n.includes("AADHA") },
        { type: "PAN", label: "PAN Card", match: (n: string) => n.startsWith("PAN") },
        { type: "BANK_DETAILS", label: "Bank Proof", match: (n: string) => n.includes("BANK") },
        { type: "PHOTO", label: "Photo", match: (n: string) => n.includes("PHOTO") },
    ]
    const missingRequiredDocs = REQUIRED_DOCS.filter(
        r => !docs.some(d => d.fileUrl && (d.type === r.type || r.match(normType(d.type))))
    )

    const errors = {
        dateOfBirth:            validateDateOfBirth(form.dateOfBirth),
        alternatePhone:         validatePhone(form.alternatePhone),
        pincode:                validatePincode(form.pincode),
        permanentPincode:       validatePincode(form.permanentPincode),
        emergencyContact1Phone: validatePhone(form.emergencyContact1Phone),
        aadharNumber:           validateAadhaar(form.aadharNumber),
        panNumber:              validatePAN(form.panNumber),
        uan:                    validateUAN(form.uan),
        esiNumber:              validateESIC(form.esiNumber),
        bankAccountNumber:      validateBankAccount(form.bankAccountNumber),
        bankIFSC:               validateIFSC(form.bankIFSC),
    }

    const handleSubmit = async () => {
        // Name the failing field — the offender is often on a step that isn't open.
        const firstError = Object.values(errors).find(Boolean)
        if (firstError) { toast.error(firstError); return }
        if (missingRequiredDocs.length > 0) {
            toast.error(`Upload required documents: ${missingRequiredDocs.map(d => d.label).join(", ")}`)
            setStep(6)
            return
        }
        setSubmitting(true)
        try {
            const res = await fetch(`/api/external/onboarding/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, uploadedDocs: docs }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Details submitted for verification!")
            window.location.reload()
        } catch (err: any) {
            toast.error(err.message || "Submission failed")
        } finally {
            setSubmitting(false)
        }
    }

    // ─── Loading / Error / Complete ────────────────────────────────────────────

    if (loading) return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a12" }}>
            <Loader2 style={{ color: "#6366f1", animation: "spin 1s linear infinite" }} size={36} />
        </div>
    )

    if (!employee) return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a12", color: "#fff" }}>
            <div style={{ textAlign: "center" }}>
                <AlertCircle size={48} style={{ color: "#ef4444", margin: "0 auto 16px" }} />
                <h1 style={{ fontSize: 20, fontWeight: 700 }}>Invalid or Expired Link</h1>
                <p style={{ color: "#6b7280", marginTop: 8 }}>Please contact HR for a new onboarding access link.</p>
            </div>
        </div>
    )

    if (employee.status === "ACTIVE") return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a12", color: "#fff" }}>
            <div style={{ textAlign: "center", padding: 40, background: "#111120", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, maxWidth: 360 }}>
                <CheckCircle2 size={52} style={{ color: "#22c55e", margin: "0 auto 16px" }} />
                <h1 style={{ fontSize: 22, fontWeight: 700 }}>Onboarding Complete!</h1>
                <p style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>Welcome aboard, {employee.firstName}! Your profile is now fully active.</p>
            </div>
        </div>
    )

    const progress = Math.round(((step - 1) / STEPS.length) * 100)

    return (
        <div style={{ minHeight: "100vh", background: "#0a0a12", color: "#fff", paddingBottom: 60 }}>

            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <div style={{ background: "#111120", borderBottom: "1px solid rgba(255,255,255,0.07)", position: "sticky", top: 0, zIndex: 20, padding: "14px 20px" }}>
                <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                        <p style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>Digital Onboarding</p>
                        <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Welcome, {employee.firstName} {employee.lastName} &bull; {employee.employeeId}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 3px" }}>Step {step} of {STEPS.length}</p>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#a5b4fc", margin: 0 }}>{STEPS[step - 1].label}</p>
                    </div>
                </div>
                {/* Progress bar */}
                <div style={{ maxWidth: 600, margin: "10px auto 0", height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 999 }}>
                    <div style={{ height: "100%", width: `${progress + (100 / STEPS.length)}%`, background: "linear-gradient(90deg,#6366f1,#8b5cf6)", borderRadius: 999, transition: "width 0.3s ease" }} />
                </div>
            </div>

            {/* ── Step tabs (scrollable) ──────────────────────────────────────────── */}
            <div style={{ overflowX: "auto", padding: "0 16px" }}>
                <div style={{ display: "flex", gap: 0, maxWidth: 600, margin: "0 auto", paddingTop: 16 }}>
                    {STEPS.map((s) => {
                        const done = s.id < step
                        const active = s.id === step
                        return (
                            <button key={s.id} onClick={() => s.id <= step && setStep(s.id)}
                                style={{
                                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                                    padding: "8px 4px", background: "none", border: "none", cursor: s.id <= step ? "pointer" : "default",
                                    opacity: s.id > step ? 0.4 : 1,
                                }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: "50%",
                                    background: done ? "#22c55e" : active ? "#6366f1" : "rgba(255,255,255,0.06)",
                                    border: active ? "2px solid #818cf8" : "2px solid transparent",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    transition: "all 0.2s",
                                }}>
                                    {done ? <CheckCircle2 size={14} color="#fff" /> : <s.icon size={14} color={active ? "#fff" : "#6b7280"} />}
                                </div>
                                <span style={{ fontSize: 10, color: active ? "#a5b4fc" : done ? "#4ade80" : "#6b7280", fontWeight: active ? 600 : 400 }}>{s.label}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* ── Rejection banner ──────────────────────────────────────────────── */}
            {employee.kycRejectionNote && (
                <div style={{ maxWidth: 600, margin: "16px auto 0", padding: "0 16px" }}>
                    <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", gap: 12 }}>
                        <AlertCircle size={18} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
                        <div>
                            <p style={{ color: "#ef4444", fontWeight: 600, fontSize: 13, margin: "0 0 3px" }}>Action Required</p>
                            <p style={{ color: "#fca5a5", fontSize: 12, margin: 0 }}>{employee.kycRejectionNote}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Form content ────────────────────────────────────────────────────── */}
            <div style={{ maxWidth: 600, margin: "20px auto 0", padding: "0 16px" }}>
                <div style={{ background: "#111120", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, padding: "24px 20px" }}>

                    {/* STEP 1 — Personal Details */}
                    {step === 1 && (
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Personal Details</h2>

                            {/* ── Posting & HR — FIRST thing employee fills ── */}
                            <div style={{ marginBottom: 24, padding: "16px", borderRadius: 14, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
                                <p style={{ fontSize: 12, color: "#a5b4fc", fontWeight: 700, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 14px" }}>
                                    Posting &amp; Assignment
                                </p>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                    <Field label="Work Site *">
                                        <select value={form.siteId} onChange={set("siteId")} className={inp} required>
                                            <option value="">Select your work site...</option>
                                            {sites.map(s => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name}{s.code ? ` (${s.code})` : ""}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Field label="Assigned HR / Manager *">
                                        <select value={form.hrId} onChange={set("hrId")} className={inp} required>
                                            <option value="">Select your HR contact...</option>
                                            {hrUsers.map(u => (
                                                <option key={u.id} value={u.id}>
                                                    {u.name}{u.customRole?.name ? ` — ${u.customRole.name}` : u.role ? ` — ${u.role.replace("_", " ")}` : ""}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                    <div style={{ gridColumn: "1 / -1" }}>
                                        <Field label="Designation / Job Role *">
                                            <input type="text" value={form.designation} onChange={set("designation")}
                                                placeholder="e.g. Quality Inspector, Security Guard" className={inp} required />
                                        </Field>
                                    </div>
                                    <Field label="Date of Joining">
                                        <input type="date" value={form.dateOfJoining} onChange={set("dateOfJoining")} className={inp} />
                                    </Field>
                                    <Field label="Employment Type">
                                        <select value={form.employmentType} onChange={set("employmentType")} className={inp}>
                                            <option value="">Select...</option>
                                            {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </Field>
                                </div>
                                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 10, margin: "10px 0 0" }}>
                                    Select the site where you&apos;ll work, the HR person handling your onboarding, and your job role — the designation is printed on your official letters.
                                </p>
                            </div>

                            {/* Photo upload */}
                            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                                <div style={{ position: "relative", flexShrink: 0 }}>
                                    <div style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,0.06)", border: "2px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        {form.photo
                                            ? <img src={form.photo} alt="photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                            : <User size={28} style={{ color: "#6b7280" }} />}
                                    </div>
                                    <label style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: "50%", background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                                        {photoUploading ? <Loader2 size={11} color="#fff" style={{ animation: "spin 1s linear infinite" }} /> : <Camera size={11} color="#fff" />}
                                        <input type="file" accept="image/*" className="hidden" onChange={uploadPhoto} disabled={photoUploading} />
                                    </label>
                                </div>
                                <div>
                                    <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 2px" }}>{employee.firstName} {employee.lastName}</p>
                                    <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Upload your profile photo (optional)</p>
                                </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                <Field label="Date of Birth *" error={errors.dateOfBirth}>
                                    <input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} className={inp} required />
                                </Field>
                                <Field label="Gender *">
                                    <select value={form.gender} onChange={set("gender")} className={inp} required>
                                        <option value="">Select...</option>
                                        <option>Male</option><option>Female</option><option>Other</option>
                                    </select>
                                </Field>
                                <Field label="Blood Group">
                                    <select value={form.bloodGroup} onChange={set("bloodGroup")} className={inp}>
                                        <option value="">Select...</option>
                                        {BLOOD_GROUPS.map(g => <option key={g}>{g}</option>)}
                                    </select>
                                </Field>
                                <Field label="Marital Status">
                                    <select value={form.maritalStatus} onChange={set("maritalStatus")} className={inp}>
                                        <option value="">Select...</option>
                                        <option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option>
                                    </select>
                                </Field>
                                <div style={{ gridColumn: "1 / -1" }}>
                                    <Field label="Father's Name">
                                        <input type="text" value={form.fathersName} onChange={set("fathersName")} placeholder="Father's full name" className={inp} />
                                    </Field>
                                </div>
                                <Field label="Middle Name">
                                    <input type="text" value={form.middleName} onChange={set("middleName")} placeholder="Middle name" className={inp} />
                                </Field>
                                <Field label="Name as per Aadhaar">
                                    <input type="text" value={form.nameAsPerAadhar} onChange={set("nameAsPerAadhar")} placeholder="Exactly as printed on Aadhaar" className={inp} />
                                </Field>
                                <Field label="Nationality">
                                    <input type="text" value={form.nationality} onChange={set("nationality")} placeholder="Indian" className={inp} />
                                </Field>
                                <Field label="Religion">
                                    <input type="text" value={form.religion} onChange={set("religion")} placeholder="Religion" className={inp} />
                                </Field>
                                <Field label="Caste">
                                    <input type="text" value={form.caste} onChange={set("caste")} placeholder="General / OBC / SC / ST" className={inp} />
                                </Field>
                                <Field label="Alternate Phone" error={errors.alternatePhone}>
                                    <input type="tel" maxLength={10} value={form.alternatePhone} onChange={set("alternatePhone")} placeholder="10-digit number" className={inp} />
                                </Field>
                            </div>
                        </div>
                    )}

                    {/* STEP 2 — Address */}
                    {step === 2 && (
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Address Details</h2>

                            <p style={{ fontSize: 12, color: "#a5b4fc", fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Current Address</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                                <div style={{ gridColumn: "1 / -1" }}>
                                    <Field label="Street / House No *">
                                        <input type="text" value={form.address} onChange={set("address")} placeholder="House no, Street, Area" className={inp} required />
                                    </Field>
                                </div>
                                <Field label="City *">
                                    <input type="text" value={form.city} onChange={set("city")} placeholder="City" className={inp} required />
                                </Field>
                                <Field label="State *">
                                    <input type="text" value={form.state} onChange={set("state")} placeholder="State" className={inp} required />
                                </Field>
                                <Field label="Pincode *" error={errors.pincode}>
                                    <input type="text" maxLength={6} value={form.pincode} onChange={set("pincode")} placeholder="6-digit PIN" className={inp} required />
                                </Field>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "10px 14px", background: "rgba(99,102,241,0.08)", borderRadius: 10, border: "1px solid rgba(99,102,241,0.2)" }}>
                                <input type="checkbox" id="sameAddr" checked={form.sameAsCurrent} onChange={e => handleSameAsCurrent(e.target.checked)}
                                    style={{ width: 16, height: 16, accentColor: "#6366f1", cursor: "pointer" }} />
                                <label htmlFor="sameAddr" style={{ fontSize: 13, cursor: "pointer", color: "#a5b4fc" }}>Permanent address is same as current address</label>
                            </div>

                            <p style={{ fontSize: 12, color: "#a5b4fc", fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Permanent Address</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, opacity: form.sameAsCurrent ? 0.5 : 1, pointerEvents: form.sameAsCurrent ? "none" : "auto" }}>
                                <div style={{ gridColumn: "1 / -1" }}>
                                    <Field label="Street / House No">
                                        <input type="text" value={form.permanentAddress} onChange={set("permanentAddress")} placeholder="House no, Street, Area" className={inp} />
                                    </Field>
                                </div>
                                <Field label="City">
                                    <input type="text" value={form.permanentCity} onChange={set("permanentCity")} placeholder="City" className={inp} />
                                </Field>
                                <Field label="State">
                                    <input type="text" value={form.permanentState} onChange={set("permanentState")} placeholder="State" className={inp} />
                                </Field>
                                <Field label="Pincode" error={errors.permanentPincode}>
                                    <input type="text" maxLength={6} value={form.permanentPincode} onChange={set("permanentPincode")} placeholder="6-digit PIN" className={inp} />
                                </Field>
                            </div>
                        </div>
                    )}

                    {/* STEP 3 — Emergency Contacts */}
                    {step === 3 && (
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Emergency Contacts</h2>

                            <div style={{ marginBottom: 24, padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)" }}>
                                <p style={{ fontSize: 13, fontWeight: 600, color: "#a5b4fc", marginBottom: 12 }}>Emergency Contact *</p>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    <Field label="Full Name">
                                        <input type="text" value={form.emergencyContact1Name} onChange={set("emergencyContact1Name")} placeholder="Contact name" className={inp} />
                                    </Field>
                                    <Field label="Phone Number" error={errors.emergencyContact1Phone}>
                                        <input type="tel" maxLength={10} value={form.emergencyContact1Phone} onChange={set("emergencyContact1Phone")} placeholder="10-digit mobile" className={inp} />
                                    </Field>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 4 — KYC */}
                    {step === 4 && (
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>KYC Verification</h2>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                <div style={{ gridColumn: "1 / -1" }}>
                                    <Field label="Aadhaar Number *" error={errors.aadharNumber}>
                                        <input type="text" maxLength={12} value={form.aadharNumber}
                                            onChange={e => setForm(f => ({ ...f, aadharNumber: e.target.value.replace(/\D/g, "") }))}
                                            placeholder="12-digit Aadhaar number" className={inp} required />
                                    </Field>
                                </div>
                                <div style={{ gridColumn: "1 / -1" }}>
                                    <Field label="PAN Number *" error={errors.panNumber}>
                                        <input type="text" maxLength={10} value={form.panNumber}
                                            onChange={e => setForm(f => ({ ...f, panNumber: e.target.value.toUpperCase() }))}
                                            placeholder="ABCDE1234F" className={inp} required />
                                    </Field>
                                </div>
                            </div>
                            {/* Previous employment statutory numbers */}
                            <div style={{ marginTop: 24 }}>
                                <p style={{ fontSize: 12, color: "#a5b4fc", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Previous Employment — PF &amp; ESIC
                                </p>
                                <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 12 }}>
                                    If you worked before and have a PF (UAN) or ESIC number, enter it so your account continues. Leave blank if this is your first job.
                                </p>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                    <Field label="Previous PF / UAN Number" error={errors.uan}>
                                        <input type="text" maxLength={12} value={form.uan}
                                            onChange={e => setForm(f => ({ ...f, uan: e.target.value.replace(/\D/g, "") }))}
                                            placeholder="12-digit UAN" className={inp} />
                                    </Field>
                                    <Field label="Labour Card No.">
                                        <input type="text" value={form.labourCardNo} onChange={set("labourCardNo")}
                                            placeholder="Labour card number" className={inp} />
                                    </Field>
                                    <Field label="Previous ESIC Number" error={errors.esiNumber}>
                                        <input type="text" maxLength={17} value={form.esiNumber}
                                            onChange={e => setForm(f => ({ ...f, esiNumber: e.target.value.replace(/\D/g, "") }))}
                                            placeholder="ESIC IP number" className={inp} />
                                    </Field>
                                </div>
                            </div>

                            <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 10, background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }}>
                                <p style={{ fontSize: 12, color: "#fbbf24", margin: 0 }}>Your KYC details will be verified by HR. Make sure the information matches your official documents.</p>
                            </div>
                        </div>
                    )}

                    {/* STEP 5 — Bank Details */}
                    {step === 5 && (
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Bank Details</h2>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                <div style={{ gridColumn: "1 / -1" }}>
                                    <Field label="Bank Name *">
                                        <input type="text" value={form.bankName} onChange={set("bankName")} placeholder="HDFC Bank, SBI, etc." className={inp} required />
                                    </Field>
                                </div>
                                <div style={{ gridColumn: "1 / -1" }}>
                                    <Field label="Account Number *" error={errors.bankAccountNumber}>
                                        <input type="text" maxLength={18} value={form.bankAccountNumber} onChange={set("bankAccountNumber")} placeholder="Account number" className={inp} required />
                                    </Field>
                                </div>
                                <Field label="IFSC Code *" error={errors.bankIFSC}>
                                    <input type="text" maxLength={11} value={form.bankIFSC}
                                        onChange={e => setForm(f => ({ ...f, bankIFSC: e.target.value.toUpperCase() }))}
                                        placeholder="IFSC Code" className={inp} required />
                                </Field>
                                <Field label="Branch Name">
                                    <input type="text" value={form.bankBranch} onChange={set("bankBranch")} placeholder="Branch name" className={inp} />
                                </Field>
                            </div>
                            <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 10, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
                                <p style={{ fontSize: 12, color: "#86efac", margin: 0 }}>Salary will be credited to this account. Ensure account number and IFSC are correct.</p>
                            </div>
                        </div>
                    )}

                    {/* STEP 6 — Documents */}
                    {step === 6 && (
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Document Uploads</h2>
                            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>Upload clear, legible copies of each document.</p>

                            {missingRequiredDocs.length > 0 && (
                                <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 12, background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)", marginBottom: 16 }}>
                                    <AlertCircle size={16} style={{ color: "#fbbf24", flexShrink: 0, marginTop: 1 }} />
                                    <p style={{ fontSize: 12, color: "#fbbf24", margin: 0, lineHeight: 1.5 }}>
                                        <b>Required:</b> {missingRequiredDocs.map(d => d.label).join(", ")}. These must be uploaded before you can submit.
                                    </p>
                                </div>
                            )}

                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {DOC_TYPES.map(({ type, label }) => {
                                    const exist = docs.find(d => d.type === type)
                                    const uploading = uploadingDocs[type]
                                    return (
                                        <div key={type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, border: `1px solid ${exist ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.07)"}`, background: exist ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.02)", gap: 12 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                                                <div style={{ width: 34, height: 34, borderRadius: 9, background: exist ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                    <FileText size={16} style={{ color: exist ? "#4ade80" : "#6b7280" }} />
                                                </div>
                                                <div style={{ minWidth: 0 }}>
                                                    <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 1px", color: "#fff" }}>
                                                        {label}
                                                        {REQUIRED_DOCS.some(r => r.type === type) && <span style={{ color: "#f87171", marginLeft: 4 }}>*</span>}
                                                    </p>
                                                    {exist
                                                        ? <p style={{ fontSize: 11, color: exist.status === "REJECTED" ? "#f87171" : "#4ade80", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                            {exist.status === "REJECTED" ? `Rejected: ${exist.rejectionReason}` : `Uploaded: ${exist.fileName}`}
                                                        </p>
                                                        : <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>Not uploaded</p>}
                                                </div>
                                            </div>
                                            <label style={{ flexShrink: 0 }}>
                                                <div style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.08)", cursor: uploading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 500, color: "#a5b4fc", opacity: uploading ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
                                                    {uploading ? <><Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> Uploading</> : exist ? "Re-upload" : "Upload"}
                                                </div>
                                                <input type="file" style={{ display: "none" }} disabled={uploading} onChange={e => handleFileChange(e, type, label)} />
                                            </label>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Navigation ──────────────────────────────────────────────────── */}
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    {step > 1 && (
                        <button onClick={() => setStep(s => s - 1)}
                            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "none", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            <ChevronLeft size={16} /> Back
                        </button>
                    )}
                    {step < STEPS.length ? (
                        <button onClick={() => setStep(s => s + 1)}
                            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            Continue <ChevronRight size={16} />
                        </button>
                    ) : (
                        <button onClick={handleSubmit} disabled={submitting}
                            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none", background: submitting ? "#374151" : "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            {submitting ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Submitting...</> : <>Submit for Verification <CheckCircle2 size={15} /></>}
                        </button>
                    )}
                </div>
                <p style={{ textAlign: "center", fontSize: 11, color: "#4b5563", marginTop: 12 }}>
                    I hereby declare that the details furnished are true and correct to the best of my knowledge.
                </p>
            </div>
        </div>
    )
}
