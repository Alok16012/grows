"use client"

import { useState, useRef } from "react"
import {
    Loader2, CheckCircle2, Copy, Check, AlertCircle,
    ChevronRight, ChevronLeft, Upload, X, FileText, ImageIcon
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type FormData = {
    // Personal
    firstName: string; middleName: string; lastName: string
    gender: string; dateOfBirth: string; bloodGroup: string
    maritalStatus: string; fathersName: string; nationality: string; religion: string
    phone: string; email: string
    // Current Address
    address: string; city: string; state: string; pincode: string
    // Permanent Address
    sameAsCurrent: boolean
    permanentAddress: string; permanentCity: string; permanentState: string; permanentPincode: string
    // Emergency
    emergencyContact1Name: string; emergencyContact1Phone: string
    emergencyContact2Name: string; emergencyContact2Phone: string
    // Employment
    designation: string; dateOfJoining: string; employmentType: string
    // Bank & Compliance
    bankName: string; bankBranch: string; bankAccountNumber: string; bankIFSC: string
    aadharNumber: string; panNumber: string
    // Safety
    safetyGoggles: boolean; safetyGloves: boolean; safetyHelmet: boolean
    safetyMask: boolean; safetyJacket: boolean; safetyEarMuffs: boolean; safetyShoes: boolean
}

type DocFile = { type: string; label: string; file: File | null; uploading: boolean; url: string | null; error: string | null }

const INITIAL: FormData = {
    firstName: "", middleName: "", lastName: "",
    gender: "", dateOfBirth: "", bloodGroup: "", maritalStatus: "",
    fathersName: "", nationality: "Indian", religion: "",
    phone: "", email: "",
    address: "", city: "", state: "", pincode: "",
    sameAsCurrent: false,
    permanentAddress: "", permanentCity: "", permanentState: "", permanentPincode: "",
    emergencyContact1Name: "", emergencyContact1Phone: "",
    emergencyContact2Name: "", emergencyContact2Phone: "",
    designation: "", dateOfJoining: "", employmentType: "",
    bankName: "", bankBranch: "", bankAccountNumber: "", bankIFSC: "",
    aadharNumber: "", panNumber: "",
    safetyGoggles: false, safetyGloves: false, safetyHelmet: false,
    safetyMask: false, safetyJacket: false, safetyEarMuffs: false, safetyShoes: false,
}

const TABS = [
    { key: "personal",   label: "Personal" },
    { key: "employment", label: "Employment" },
    { key: "bank",       label: "Bank & Compliance" },
    { key: "safety",     label: "Safety" },
    { key: "documents",  label: "Documents" },
]

const DOC_TYPES: { type: string; label: string; required: boolean }[] = [
    { type: "AADHAR",          label: "Aadhar Card",           required: true },
    { type: "PAN",             label: "PAN Card",              required: true },
    { type: "PASSPORT_PHOTO",  label: "Passport Size Photo",   required: true },
    { type: "BANK_PASSBOOK",   label: "Bank Passbook / Cancelled Cheque", required: false },
    { type: "OTHER",           label: "Any Other Document",    required: false },
]

const SAFETY_ITEMS: { key: keyof FormData; label: string; icon: string }[] = [
    { key: "safetyHelmet",  label: "Safety Helmet",    icon: "🪖" },
    { key: "safetyGoggles", label: "Safety Goggles",   icon: "🥽" },
    { key: "safetyGloves",  label: "Safety Gloves",    icon: "🧤" },
    { key: "safetyMask",    label: "Safety Mask",      icon: "😷" },
    { key: "safetyJacket",  label: "Safety Jacket",    icon: "🦺" },
    { key: "safetyEarMuffs",label: "Ear Muffs",        icon: "🎧" },
    { key: "safetyShoes",   label: "Safety Shoes",     icon: "👟" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
    width: "100%", height: 38, padding: "0 12px",
    borderRadius: 8, border: "1px solid var(--border)",
    background: "var(--surface2)", fontSize: 13,
    color: "var(--text)", outline: "none", boxSizing: "border-box",
}
const sel: React.CSSProperties = { ...inp, cursor: "pointer" }

function Lbl({ text, required }: { text: string; required?: boolean }) {
    return (
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>
            {text}{required && <span style={{ color: "var(--red)", marginLeft: 2 }}>*</span>}
        </div>
    )
}
function Err({ msg }: { msg?: string }) {
    if (!msg) return null
    return <div style={{ fontSize: 11, color: "var(--red)", marginTop: 3 }}>{msg}</div>
}
function SecTitle({ children }: { children: React.ReactNode }) {
    return <div style={{ gridColumn: "1 / -1", fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.6px", paddingBottom: 6, borderBottom: "1px solid var(--border)", marginTop: 4 }}>{children}</div>
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function JoinPage() {
    const [tab, setTab] = useState("personal")
    const [form, setForm] = useState<FormData>(INITIAL)
    const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
    const [loading, setLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [result, setResult] = useState<{ employeeId: string } | null>(null)
    const [copied, setCopied] = useState(false)

    // Docs state
    const [docs, setDocs] = useState<DocFile[]>(
        DOC_TYPES.map(d => ({ type: d.type, label: d.label, file: null, uploading: false, url: null, error: null }))
    )
    const fileRefs = useRef<(HTMLInputElement | null)[]>([])

    const set = (k: keyof FormData, v: string | boolean) =>
        setForm(prev => {
            const u = { ...prev, [k]: v }
            if (k === "sameAsCurrent" && v === true) {
                u.permanentAddress = prev.address; u.permanentCity = prev.city
                u.permanentState = prev.state; u.permanentPincode = prev.pincode
            }
            if (prev.sameAsCurrent && ["address","city","state","pincode"].includes(k as string)) {
                const m: Record<string, keyof FormData> = { address:"permanentAddress", city:"permanentCity", state:"permanentState", pincode:"permanentPincode" }
                ;(u as any)[m[k as string]] = v
            }
            return u
        })
    const clrErr = (k: keyof FormData) => setErrors(p => { const n={...p}; delete n[k]; return n })

    const tabOrder = TABS.map(t => t.key)
    const tabIdx = tabOrder.indexOf(tab)
    const isLast = tabIdx === tabOrder.length - 1

    // ── Validation ────────────────────────────────────────────────────────────

    function validate(t: string): boolean {
        const e: Partial<Record<keyof FormData, string>> = {}
        if (t === "personal") {
            if (!form.firstName.trim()) e.firstName = "Required"
            if (!form.lastName.trim())  e.lastName  = "Required"
            if (!form.phone.trim())     e.phone     = "Required"
            else if (!/^[6-9]\d{9}$/.test(form.phone.replace(/\s/g,""))) e.phone = "Enter valid 10-digit mobile"
            if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter valid email"
            if (!form.emergencyContact1Name.trim())  e.emergencyContact1Name  = "Required"
            if (!form.emergencyContact1Phone.trim()) e.emergencyContact1Phone = "Required"
            else if (!/^\d{10}$/.test(form.emergencyContact1Phone.replace(/\s/g,""))) e.emergencyContact1Phone = "Valid 10-digit number required"
        }
        setErrors(e)
        return Object.keys(e).length === 0
    }

    function goNext() { if (!validate(tab)) return; setTab(tabOrder[tabIdx + 1]) }
    function goBack() { setTab(tabOrder[tabIdx - 1]) }

    // ── File select & upload ──────────────────────────────────────────────────

    function handleFileSelect(idx: number, file: File | null) {
        setDocs(prev => prev.map((d, i) => i === idx ? { ...d, file, url: null, error: null } : d))
    }

    async function uploadDoc(idx: number, token: string): Promise<boolean> {
        const doc = docs[idx]
        if (!doc.file) return true // no file — skip

        setDocs(prev => prev.map((d, i) => i === idx ? { ...d, uploading: true, error: null } : d))
        try {
            // 1. Upload file to get URL
            const fd = new FormData()
            fd.append("file", doc.file)
            const upRes = await fetch("/api/upload", {
                method: "POST",
                headers: { "x-onboarding-token": token },
                body: fd,
            })
            if (!upRes.ok) throw new Error("Upload failed")
            const { url } = await upRes.json()

            // 2. Save document record
            const saveRes = await fetch("/api/join/documents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ onboardingToken: token, type: doc.type, fileName: doc.file.name, fileUrl: url }),
            })
            if (!saveRes.ok) throw new Error("Failed to save document")

            setDocs(prev => prev.map((d, i) => i === idx ? { ...d, uploading: false, url } : d))
            return true
        } catch (err: any) {
            setDocs(prev => prev.map((d, i) => i === idx ? { ...d, uploading: false, error: err.message || "Upload failed" } : d))
            return false
        }
    }

    // ── Submit ────────────────────────────────────────────────────────────────

    async function handleSubmit() {
        if (!validate(tab)) return
        setLoading(true)
        try {
            // 1. Create employee record
            const { sameAsCurrent, ...payload } = form
            const res = await fetch("/api/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (!res.ok) {
                setErrors({ firstName: data.error || "Submission failed" })
                setLoading(false)
                return
            }

            const token: string = data.onboardingToken

            // 2. Upload selected documents in parallel
            const filledDocs = docs.map((d, i) => ({ ...d, idx: i })).filter(d => d.file)
            await Promise.all(filledDocs.map(d => uploadDoc(d.idx, token)))

            setResult({ employeeId: data.employeeId })
            setSubmitted(true)
        } catch {
            setErrors({ firstName: "Network error. Check your connection." })
        } finally {
            setLoading(false)
        }
    }

    // ── Success Screen ────────────────────────────────────────────────────────

    if (submitted && result) {
        return (
            <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                <div style={{ width: "100%", maxWidth: 460, background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", padding: 36, textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                        <div style={{ height: 64, width: 64, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <CheckCircle2 size={32} color="var(--accent)" />
                        </div>
                    </div>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: "0 0 8px" }}>You're all set! 🎉</h2>
                    <p style={{ fontSize: 13, color: "var(--text2)", margin: "0 0 24px", lineHeight: 1.6 }}>
                        Your onboarding details have been submitted. HR will review and contact you on your registered number.
                    </p>
                    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
                        <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Your Employee ID</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <span style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)", fontFamily: "monospace", letterSpacing: 2 }}>{result.employeeId}</span>
                            <button onClick={() => { navigator.clipboard.writeText(result.employeeId); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                                style={{ padding: 6, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex" }}>
                                {copied ? <Check size={13} color="var(--accent)" /> : <Copy size={13} color="var(--text3)" />}
                            </button>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>Save this ID for future reference</div>
                    </div>
                    {["HR will verify your documents and complete onboarding tasks", "You'll be contacted on your registered phone", "Keep your ID card and documents ready"].map((t, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", textAlign: "left", marginBottom: 8 }}>
                            <CheckCircle2 size={14} color="var(--accent)" style={{ marginTop: 1, flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: "var(--text2)" }}>{t}</span>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    // ── Layout helpers ────────────────────────────────────────────────────────

    const g2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }
    const g3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px" }
    const span2: React.CSSProperties = { gridColumn: "1 / -1" }

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "32px 16px" }}>
            <div style={{ width: "100%", maxWidth: 720, margin: "0 auto" }}>

                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                        <div style={{ height: 40, width: 40, background: "var(--accent)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 3h18v18H3z" /><path d="M18 9h-6v6h6v-3h-3" />
                            </svg>
                        </div>
                    </div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: "0 0 4px" }}>Employee Onboarding Form</h1>
                    <p style={{ fontSize: 13, color: "var(--text2)", margin: 0 }}>Fill in your details carefully. Fields marked <span style={{ color: "var(--red)" }}>*</span> are required.</p>
                </div>

                {/* Card */}
                <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", overflow: "hidden" }}>

                    {/* Tabs */}
                    <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface2)", overflowX: "auto" }}>
                        {TABS.map((t, i) => {
                            const done = tabIdx > i; const active = tab === t.key
                            return (
                                <button key={t.key}
                                    onClick={() => { if (i <= tabIdx) setTab(t.key) }}
                                    style={{ padding: "13px 18px", fontSize: 12, fontWeight: 600, cursor: i <= tabIdx ? "pointer" : "default", border: "none", background: "none", whiteSpace: "nowrap", borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent", color: active ? "var(--accent)" : done ? "var(--text2)" : "var(--text3)", display: "flex", alignItems: "center", gap: 5 }}>
                                    {done
                                        ? <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:15, height:15, borderRadius:"50%", background:"var(--accent)", flexShrink:0 }}><Check size={9} color="white" /></span>
                                        : <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:15, height:15, borderRadius:"50%", background: active ? "var(--accent)" : "var(--border2)", fontSize:8, fontWeight:800, color: active ? "white" : "var(--text3)", flexShrink:0 }}>{i+1}</span>
                                    }
                                    {t.label}
                                </button>
                            )
                        })}
                    </div>

                    {/* Body */}
                    <div style={{ padding: "24px 28px" }}>

                        {/* Global submit error */}
                        {errors.firstName && form.firstName.trim() === "" && (
                            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8 }}>
                                <AlertCircle size={14} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
                                <span style={{ fontSize: 13, color: "var(--red)" }}>{errors.firstName}</span>
                            </div>
                        )}

                        {/* ── PERSONAL ─────────────────────────────────────────── */}
                        {tab === "personal" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

                                <div>
                                    <SecTitle>Basic Info</SecTitle>
                                    <div style={{ ...g3, marginTop: 14 }}>
                                        <div>
                                            <Lbl text="First Name" required />
                                            <input style={{ ...inp, borderColor: errors.firstName ? "var(--red)" : undefined }} placeholder="Rajan" value={form.firstName} onChange={e => { set("firstName", e.target.value); clrErr("firstName") }} />
                                            <Err msg={errors.firstName} />
                                        </div>
                                        <div>
                                            <Lbl text="Middle Name" />
                                            <input style={inp} placeholder="Kumar" value={form.middleName} onChange={e => set("middleName", e.target.value)} />
                                        </div>
                                        <div>
                                            <Lbl text="Last Name" required />
                                            <input style={{ ...inp, borderColor: errors.lastName ? "var(--red)" : undefined }} placeholder="Sharma" value={form.lastName} onChange={e => { set("lastName", e.target.value); clrErr("lastName") }} />
                                            <Err msg={errors.lastName} />
                                        </div>
                                    </div>
                                    <div style={{ ...g2, marginTop: 14 }}>
                                        <div>
                                            <Lbl text="Gender" />
                                            <select style={sel} value={form.gender} onChange={e => set("gender", e.target.value)}>
                                                <option value="">Select gender</option>
                                                <option>Male</option><option>Female</option><option>Other</option>
                                            </select>
                                        </div>
                                        <div>
                                            <Lbl text="Date of Birth" />
                                            <input style={inp} type="date" value={form.dateOfBirth} onChange={e => set("dateOfBirth", e.target.value)} />
                                        </div>
                                        <div>
                                            <Lbl text="Blood Group" />
                                            <select style={sel} value={form.bloodGroup} onChange={e => set("bloodGroup", e.target.value)}>
                                                <option value="">Select</option>
                                                {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(b => <option key={b}>{b}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <Lbl text="Marital Status" />
                                            <select style={sel} value={form.maritalStatus} onChange={e => set("maritalStatus", e.target.value)}>
                                                <option value="">Select</option>
                                                <option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option>
                                            </select>
                                        </div>
                                        <div>
                                            <Lbl text="Father's Name" />
                                            <input style={inp} placeholder="Ram Kumar Sharma" value={form.fathersName} onChange={e => set("fathersName", e.target.value)} />
                                        </div>
                                        <div>
                                            <Lbl text="Nationality" />
                                            <input style={inp} placeholder="Indian" value={form.nationality} onChange={e => set("nationality", e.target.value)} />
                                        </div>
                                        <div>
                                            <Lbl text="Religion" />
                                            <input style={inp} placeholder="Hindu" value={form.religion} onChange={e => set("religion", e.target.value)} />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <SecTitle>Contact</SecTitle>
                                    <div style={{ ...g2, marginTop: 14 }}>
                                        <div>
                                            <Lbl text="Mobile Number" required />
                                            <div style={{ position: "relative" }}>
                                                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--text2)", fontWeight: 600, pointerEvents: "none" }}>+91</span>
                                                <input style={{ ...inp, paddingLeft: 38, borderColor: errors.phone ? "var(--red)" : undefined }} placeholder="9876543210" maxLength={10} value={form.phone} onChange={e => { set("phone", e.target.value.replace(/\D/g,"")); clrErr("phone") }} />
                                            </div>
                                            <Err msg={errors.phone} />
                                        </div>
                                        <div>
                                            <Lbl text="Email Address" />
                                            <input style={{ ...inp, borderColor: errors.email ? "var(--red)" : undefined }} type="email" placeholder="you@example.com" value={form.email} onChange={e => { set("email", e.target.value); clrErr("email") }} />
                                            <Err msg={errors.email} />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <SecTitle>Current Address</SecTitle>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px", marginTop: 14 }}>
                                        <div style={span2}>
                                            <Lbl text="Street Address" />
                                            <input style={inp} placeholder="House No., Street, Area" value={form.address} onChange={e => set("address", e.target.value)} />
                                        </div>
                                        <div><Lbl text="City" /><input style={inp} placeholder="Mumbai" value={form.city} onChange={e => set("city", e.target.value)} /></div>
                                        <div><Lbl text="State" /><input style={inp} placeholder="Maharashtra" value={form.state} onChange={e => set("state", e.target.value)} /></div>
                                        <div><Lbl text="PIN Code" /><input style={inp} placeholder="400001" maxLength={6} value={form.pincode} onChange={e => set("pincode", e.target.value.replace(/\D/g,""))} /></div>
                                    </div>
                                </div>

                                <div>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <SecTitle>Permanent Address</SecTitle>
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "var(--text2)", fontWeight: 500, marginBottom: 6 }}>
                                            <input type="checkbox" checked={form.sameAsCurrent} onChange={e => set("sameAsCurrent", e.target.checked)} /> Same as current
                                        </label>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px", marginTop: 14 }}>
                                        <div style={span2}>
                                            <Lbl text="Street Address" />
                                            <input style={{ ...inp, opacity: form.sameAsCurrent ? 0.6 : 1 }} disabled={form.sameAsCurrent} placeholder="House No., Street, Area" value={form.permanentAddress} onChange={e => set("permanentAddress", e.target.value)} />
                                        </div>
                                        <div><Lbl text="City" /><input style={{ ...inp, opacity: form.sameAsCurrent ? 0.6 : 1 }} disabled={form.sameAsCurrent} placeholder="Delhi" value={form.permanentCity} onChange={e => set("permanentCity", e.target.value)} /></div>
                                        <div><Lbl text="State" /><input style={{ ...inp, opacity: form.sameAsCurrent ? 0.6 : 1 }} disabled={form.sameAsCurrent} placeholder="Delhi" value={form.permanentState} onChange={e => set("permanentState", e.target.value)} /></div>
                                        <div><Lbl text="PIN Code" /><input style={{ ...inp, opacity: form.sameAsCurrent ? 0.6 : 1 }} disabled={form.sameAsCurrent} placeholder="110001" maxLength={6} value={form.permanentPincode} onChange={e => set("permanentPincode", e.target.value.replace(/\D/g,""))} /></div>
                                    </div>
                                </div>

                                <div>
                                    <SecTitle>Emergency Contacts</SecTitle>
                                    <div style={{ ...g2, marginTop: 14 }}>
                                        <div>
                                            <Lbl text="Primary Contact Name" required />
                                            <input style={{ ...inp, borderColor: errors.emergencyContact1Name ? "var(--red)" : undefined }} placeholder="Contact person" value={form.emergencyContact1Name} onChange={e => { set("emergencyContact1Name", e.target.value); clrErr("emergencyContact1Name") }} />
                                            <Err msg={errors.emergencyContact1Name} />
                                        </div>
                                        <div>
                                            <Lbl text="Primary Contact Phone" required />
                                            <input style={{ ...inp, borderColor: errors.emergencyContact1Phone ? "var(--red)" : undefined }} placeholder="9876543210" maxLength={10} value={form.emergencyContact1Phone} onChange={e => { set("emergencyContact1Phone", e.target.value.replace(/\D/g,"")); clrErr("emergencyContact1Phone") }} />
                                            <Err msg={errors.emergencyContact1Phone} />
                                        </div>
                                        <div>
                                            <Lbl text="Secondary Contact Name" />
                                            <input style={inp} placeholder="Optional" value={form.emergencyContact2Name} onChange={e => set("emergencyContact2Name", e.target.value)} />
                                        </div>
                                        <div>
                                            <Lbl text="Secondary Contact Phone" />
                                            <input style={inp} placeholder="9876543210" maxLength={10} value={form.emergencyContact2Phone} onChange={e => set("emergencyContact2Phone", e.target.value.replace(/\D/g,""))} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── EMPLOYMENT ──────────────────────────────────────── */}
                        {tab === "employment" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                                <div>
                                    <SecTitle>Job Details</SecTitle>
                                    <div style={{ ...g2, marginTop: 14 }}>
                                        <div>
                                            <Lbl text="Designation / Role" />
                                            <input style={inp} placeholder="e.g. Security Guard" value={form.designation} onChange={e => set("designation", e.target.value)} />
                                        </div>
                                        <div>
                                            <Lbl text="Date of Joining" />
                                            <input style={inp} type="date" value={form.dateOfJoining} onChange={e => set("dateOfJoining", e.target.value)} />
                                        </div>
                                        <div>
                                            <Lbl text="Employment Type" />
                                            <select style={sel} value={form.employmentType} onChange={e => set("employmentType", e.target.value)}>
                                                <option value="">Select type</option>
                                                <option value="FULL_TIME">Full Time</option>
                                                <option value="PART_TIME">Part Time</option>
                                                <option value="CONTRACT">Contract</option>
                                                <option value="DAILY_WAGE">Daily Wage</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px" }}>
                                    <p style={{ fontSize: 12, color: "var(--text3)", margin: 0, lineHeight: 1.6 }}>
                                        💡 Salary, department, and site assignment will be configured by HR after approval.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ── BANK & COMPLIANCE ───────────────────────────────── */}
                        {tab === "bank" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                                <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                                    <AlertCircle size={14} color="#d97706" style={{ marginTop: 1, flexShrink: 0 }} />
                                    <p style={{ fontSize: 12, color: "#92400e", margin: 0, lineHeight: 1.6 }}>Your bank and KYC details are encrypted and stored securely. Used only for salary processing and compliance.</p>
                                </div>
                                <div>
                                    <SecTitle>Bank Details</SecTitle>
                                    <div style={{ ...g2, marginTop: 14 }}>
                                        <div><Lbl text="Bank Name" /><input style={inp} placeholder="State Bank of India" value={form.bankName} onChange={e => set("bankName", e.target.value)} /></div>
                                        <div><Lbl text="Branch Name" /><input style={inp} placeholder="Andheri West" value={form.bankBranch} onChange={e => set("bankBranch", e.target.value)} /></div>
                                        <div style={span2}><Lbl text="Account Number" /><input style={inp} placeholder="Your account number" value={form.bankAccountNumber} onChange={e => set("bankAccountNumber", e.target.value.replace(/\D/g,""))} /></div>
                                        <div><Lbl text="IFSC Code" /><input style={{ ...inp, textTransform: "uppercase" }} placeholder="SBIN0001234" maxLength={11} value={form.bankIFSC} onChange={e => set("bankIFSC", e.target.value.toUpperCase())} /></div>
                                    </div>
                                </div>
                                <div>
                                    <SecTitle>KYC Documents</SecTitle>
                                    <div style={{ ...g2, marginTop: 14 }}>
                                        <div><Lbl text="Aadhar Number" /><input style={inp} placeholder="12-digit number" maxLength={12} value={form.aadharNumber} onChange={e => set("aadharNumber", e.target.value.replace(/\D/g,""))} /></div>
                                        <div><Lbl text="PAN Number" /><input style={{ ...inp, textTransform: "uppercase" }} placeholder="ABCDE1234F" maxLength={10} value={form.panNumber} onChange={e => set("panNumber", e.target.value.toUpperCase())} /></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── SAFETY ──────────────────────────────────────────── */}
                        {tab === "safety" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px" }}>
                                    <p style={{ fontSize: 12, color: "var(--text3)", margin: 0, lineHeight: 1.6 }}>
                                        ✅ Tick the safety equipment you already own or have been provided. HR will verify and issue missing items.
                                    </p>
                                </div>
                                <div>
                                    <SecTitle>Safety Equipment</SecTitle>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                                        {SAFETY_ITEMS.map(item => (
                                            <label key={item.key}
                                                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", border: `1px solid ${form[item.key] ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, cursor: "pointer", background: form[item.key] ? "var(--accent-light)" : "var(--surface2)", transition: "all 0.15s" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={form[item.key] as boolean}
                                                    onChange={e => set(item.key, e.target.checked)}
                                                    style={{ width: 16, height: 16, accentColor: "var(--accent)", flexShrink: 0 }}
                                                />
                                                <span style={{ fontSize: 18 }}>{item.icon}</span>
                                                <span style={{ fontSize: 13, fontWeight: 500, color: form[item.key] ? "var(--accent-text)" : "var(--text2)" }}>{item.label}</span>
                                                {form[item.key] && <Check size={14} color="var(--accent)" style={{ marginLeft: "auto", flexShrink: 0 }} />}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── DOCUMENTS ───────────────────────────────────────── */}
                        {tab === "documents" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                                <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                                    <AlertCircle size={14} color="#d97706" style={{ marginTop: 1, flexShrink: 0 }} />
                                    <p style={{ fontSize: 12, color: "#92400e", margin: 0, lineHeight: 1.6 }}>
                                        Documents marked <span style={{ color: "var(--red)", fontWeight: 700 }}>*</span> are required. Upload clear scans or photos. Max 5MB per file. Supported: JPG, PNG, PDF.
                                    </p>
                                </div>

                                <div>
                                    <SecTitle>Upload Documents</SecTitle>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                                        {docs.map((doc, idx) => {
                                            const docDef = DOC_TYPES[idx]
                                            const hasFile = !!doc.file
                                            const isImg = doc.file?.type.startsWith("image/")
                                            return (
                                                <div key={doc.type} style={{ border: `1px solid ${doc.error ? "var(--red)" : doc.url ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, overflow: "hidden" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: doc.url ? "var(--accent-light)" : "var(--surface2)" }}>
                                                        <div style={{ width: 36, height: 36, borderRadius: 8, background: doc.url ? "var(--accent)" : "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                            {doc.url ? <Check size={18} color="white" /> : isImg ? <ImageIcon size={18} color="var(--text3)" /> : <FileText size={18} color="var(--text3)" />}
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: doc.url ? "var(--accent-text)" : "var(--text)", display: "flex", alignItems: "center", gap: 4 }}>
                                                                {docDef.label}
                                                                {docDef.required && <span style={{ color: "var(--red)", fontSize: 11 }}>*</span>}
                                                            </div>
                                                            {doc.file && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.file.name}</div>}
                                                            {doc.error && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 1 }}>{doc.error}</div>}
                                                            {doc.url && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 1 }}>Uploaded ✓</div>}
                                                        </div>
                                                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                                            {doc.file && !doc.url && (
                                                                <button onClick={() => handleFileSelect(idx, null)}
                                                                    style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center" }}>
                                                                    <X size={13} color="var(--text3)" />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => fileRefs.current[idx]?.click()}
                                                                style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${doc.url ? "var(--accent)" : "var(--border)"}`, background: doc.url ? "var(--accent)" : "var(--surface)", cursor: "pointer", fontSize: 12, fontWeight: 600, color: doc.url ? "white" : "var(--text2)", display: "flex", alignItems: "center", gap: 4 }}>
                                                                <Upload size={12} />
                                                                {doc.url ? "Replace" : hasFile ? "Change" : "Choose"}
                                                            </button>
                                                        </div>
                                                        <input
                                                            ref={el => { fileRefs.current[idx] = el }}
                                                            type="file"
                                                            accept="image/jpeg,image/png,image/webp,application/pdf"
                                                            style={{ display: "none" }}
                                                            onChange={e => {
                                                                const f = e.target.files?.[0] || null
                                                                if (f && f.size > 5 * 1024 * 1024) {
                                                                    setDocs(prev => prev.map((d,i) => i===idx ? {...d, error:"File too large. Max 5MB allowed."} : d))
                                                                    return
                                                                }
                                                                handleFileSelect(idx, f)
                                                                e.target.value = ""
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Review Summary */}
                                <div>
                                    <SecTitle>Review Before Submit</SecTitle>
                                    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 14 }}>
                                        {[
                                            { label: "Name", val: [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ") },
                                            { label: "Phone", val: form.phone ? `+91 ${form.phone}` : "" },
                                            { label: "Email", val: form.email },
                                            { label: "Designation", val: form.designation },
                                            { label: "Date of Joining", val: form.dateOfJoining },
                                            { label: "City", val: form.city ? `${form.city}, ${form.state}` : "" },
                                            { label: "Bank", val: form.bankName },
                                            { label: "Documents", val: `${docs.filter(d=>d.file).length} of ${docs.length} uploaded` },
                                        ].filter(r => r.val).map(r => (
                                            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                                                <span style={{ color: "var(--text3)", fontWeight: 500 }}>{r.label}</span>
                                                <span style={{ color: "var(--text)", fontWeight: 600 }}>{r.val}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 8 }}>
                                        By submitting, you confirm all information is accurate. Documents will be uploaded automatically on submit.
                                    </p>
                                </div>
                            </div>
                        )}

                    </div>

                    {/* Footer */}
                    <div style={{ padding: "16px 28px", borderTop: "1px solid var(--border)", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <button onClick={goBack} disabled={tabIdx === 0}
                            style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: tabIdx===0 ? "var(--text3)" : "var(--text2)", fontSize: 13, fontWeight: 600, cursor: tabIdx===0 ? "not-allowed" : "pointer", opacity: tabIdx===0 ? 0.5 : 1 }}>
                            <ChevronLeft size={15} /> Back
                        </button>

                        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                            {TABS.map((t, i) => (
                                <div key={t.key} style={{ height: 6, width: tab===t.key ? 20 : 6, borderRadius: 99, background: tab===t.key ? "var(--accent)" : tabIdx>i ? "var(--accent)" : "var(--border2)", opacity: tabIdx>i ? 0.5 : 1, transition: "all 0.2s" }} />
                            ))}
                        </div>

                        {!isLast ? (
                            <button onClick={goNext}
                                style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 20px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                                Next <ChevronRight size={15} />
                            </button>
                        ) : (
                            <button onClick={handleSubmit} disabled={loading}
                                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 22px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.75 : 1 }}>
                                {loading ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : <><CheckCircle2 size={14} /> Submit</>}
                            </button>
                        )}
                    </div>
                </div>

                <p style={{ textAlign: "center", fontSize: 11, color: "var(--text3)", marginTop: 16 }}>
                    Growus Auto · HR Management System · Your data is encrypted and secure
                </p>
            </div>
        </div>
    )
}
