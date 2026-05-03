"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import {
    User, MapPin, Shield, CreditCard, Users, CheckCircle2,
    ChevronRight, ChevronLeft, Save, Loader2, AlertCircle,
    RefreshCw, BadgeCheck, Clock, Building2, CalendarDays
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────────────────────
type EmpProfile = {
    id: string; employeeId: string; firstName: string; middleName: string | null
    lastName: string; nameAsPerAadhar: string | null; fathersName: string | null
    dateOfBirth: string | null; gender: string | null; bloodGroup: string | null
    maritalStatus: string | null; nationality: string | null; religion: string | null
    caste: string | null; phone: string; alternatePhone: string | null; email: string | null
    address: string | null; city: string | null; state: string | null; pincode: string | null
    permanentAddress: string | null; permanentCity: string | null
    permanentState: string | null; permanentPincode: string | null
    aadharNumber: string | null; panNumber: string | null
    uan: string | null; pfNumber: string | null; esiNumber: string | null
    labourCardNo: string | null
    bankAccountNumber: string | null; bankIFSC: string | null
    bankName: string | null; bankBranch: string | null
    emergencyContact1Name: string | null; emergencyContact1Phone: string | null
    emergencyContact2Name: string | null; emergencyContact2Phone: string | null
    status: string; designation: string | null; dateOfJoining: string | null
    isKycVerified: boolean; kycRejectionNote: string | null
    department?: { name: string } | null
}

// ── Completion scoring ───────────────────────────────────────────────────────
const SCORE_FIELDS: (keyof EmpProfile)[] = [
    "nameAsPerAadhar", "fathersName", "dateOfBirth", "gender", "bloodGroup",
    "maritalStatus", "alternatePhone", "email",
    "address", "city", "state", "pincode",
    "permanentAddress", "permanentCity", "permanentState", "permanentPincode",
    "aadharNumber", "panNumber",
    "bankAccountNumber", "bankIFSC", "bankName", "bankBranch",
    "emergencyContact1Name", "emergencyContact1Phone",
]
function completion(p: EmpProfile | null) {
    if (!p) return 0
    const filled = SCORE_FIELDS.filter(f => p[f] && String(p[f]).trim() !== "").length
    return Math.round((filled / SCORE_FIELDS.length) * 100)
}

// ── Steps config ─────────────────────────────────────────────────────────────
const STEPS = [
    { id: 1, label: "Personal",  icon: User,       desc: "Basic identity & contact" },
    { id: 2, label: "Address",   icon: MapPin,      desc: "Current & permanent address" },
    { id: 3, label: "Documents", icon: Shield,      desc: "Aadhar, PAN & statutory IDs" },
    { id: 4, label: "Bank",      icon: CreditCard,  desc: "Salary bank account details" },
    { id: 5, label: "Emergency", icon: Users,       desc: "Emergency contacts" },
]

// ── Small UI helpers ─────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
    return <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 4 }}>{children}</label>
}
function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
    return (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, outline: "none", background: "var(--surface2)", color: "var(--text)", boxSizing: "border-box" }} />
    )
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, outline: "none", background: "var(--surface2)", color: "var(--text)" }}>
            <option value="">— Select —</option>
            {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
    )
}
function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
    return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div><Label>{label}</Label>{children}</div>
}
function FieldFull({ label, children }: { label: string; children: React.ReactNode }) {
    return <div style={{ gridColumn: "1 / -1" }}><Label>{label}</Label>{children}</div>
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SelfOnboardingPage() {
    const { data: session } = useSession()
    const [profile, setProfile] = useState<EmpProfile | null>(null)
    const [form, setForm]       = useState<Partial<EmpProfile>>({})
    const [step, setStep]       = useState(1)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving]   = useState(false)
    const [sameAddr, setSameAddr] = useState(false)

    const f = (k: keyof EmpProfile) => String(form[k] ?? "")
    const set = (k: keyof EmpProfile) => (v: string) => setForm(prev => ({ ...prev, [k]: v }))

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/employee/self-profile")
            if (res.ok) {
                const d: EmpProfile = await res.json()
                setProfile(d)
                setForm({
                    ...d,
                    dateOfBirth: d.dateOfBirth ? d.dateOfBirth.slice(0, 10) : "",
                })
            } else {
                const err = await res.json().catch(() => ({}))
                toast.error(err?.error ?? "Could not load your profile")
            }
        } catch { toast.error("Connection error — check your network and retry") }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    // copy current → permanent address
    useEffect(() => {
        if (sameAddr) {
            setForm(prev => ({
                ...prev,
                permanentAddress: prev.address ?? "",
                permanentCity:    prev.city ?? "",
                permanentState:   prev.state ?? "",
                permanentPincode: prev.pincode ?? "",
            }))
        }
    }, [sameAddr, form.address, form.city, form.state, form.pincode])

    const save = async () => {
        setSaving(true)
        try {
            const res = await fetch("/api/employee/self-profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            })
            if (res.ok) {
                toast.success("Saved successfully!")
                await load()
            } else {
                const err = await res.json()
                toast.error(err?.error ?? "Save failed")
            }
        } catch { toast.error("Network error") }
        finally { setSaving(false) }
    }

    const saveAndNext = async () => { await save(); if (step < 5) setStep(s => s + 1) }

    const pct = completion(profile)

    if (loading) return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, gap: 10 }}>
            <RefreshCw size={22} className="animate-spin" style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 14, color: "var(--text3)" }}>Loading your profile…</span>
        </div>
    )

    if (!profile) return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, gap: 10 }}>
            <AlertCircle size={36} style={{ color: "var(--text3)", opacity: 0.4 }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text3)" }}>No employee profile linked to your account</p>
            <p style={{ fontSize: 12, color: "var(--text3)" }}>Please contact HR to link your account</p>
        </div>
    )

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 48 }}>

            {/* ── Header card ─────────────────────────────────────────────── */}
            <div style={{ background: "linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%)", borderRadius: 16, padding: "20px 24px", color: "#fff", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
                <div style={{ position: "absolute", bottom: -20, right: 60, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", opacity: 0.7, margin: "0 0 4px" }}>EMPLOYEE SELF-ONBOARDING</p>
                        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>
                            Welcome, {profile.firstName}!
                        </h1>
                        <p style={{ fontSize: 13, opacity: 0.8, margin: 0 }}>
                            Complete your profile to get started · {profile.employeeId}
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                        {profile.designation && (
                            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                                <Building2 size={14} />
                                <span style={{ fontSize: 12, fontWeight: 700 }}>{profile.designation}</span>
                            </div>
                        )}
                        {profile.department?.name && (
                            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                                <Users size={14} />
                                <span style={{ fontSize: 12, fontWeight: 700 }}>{profile.department.name}</span>
                            </div>
                        )}
                        {profile.dateOfJoining && (
                            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                                <CalendarDays size={14} />
                                <span style={{ fontSize: 12, fontWeight: 700 }}>Joined {new Date(profile.dateOfJoining).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginTop: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.8 }}>Profile Completion</span>
                        <span style={{ fontSize: 13, fontWeight: 900 }}>{pct}%</span>
                    </div>
                    <div style={{ height: 8, background: "rgba(255,255,255,0.2)", borderRadius: 99 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "#fff", borderRadius: 99, transition: "width 0.5s ease" }} />
                    </div>
                    <p style={{ fontSize: 10, opacity: 0.65, marginTop: 4 }}>
                        {pct < 100 ? `${SCORE_FIELDS.length - Math.round(pct / 100 * SCORE_FIELDS.length)} fields remaining to complete your onboarding` : "Profile is fully complete!"}
                    </p>
                </div>
            </div>

            {/* ── KYC status banner ───────────────────────────────────────── */}
            {profile.isKycVerified ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 10, background: "#f0fdf4", border: "1px solid #86efac" }}>
                    <BadgeCheck size={18} style={{ color: "#16a34a", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>KYC Verified — Your documents have been verified by HR</span>
                </div>
            ) : profile.kycRejectionNote ? (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fca5a5" }}>
                    <AlertCircle size={18} style={{ color: "#dc2626", flexShrink: 0, marginTop: 2 }} />
                    <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c", margin: 0 }}>KYC Rejected</p>
                        <p style={{ fontSize: 12, color: "#dc2626", margin: "2px 0 0" }}>{profile.kycRejectionNote}</p>
                    </div>
                </div>
            ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fcd34d" }}>
                    <Clock size={18} style={{ color: "#d97706", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#b45309" }}>KYC Pending — Complete your profile and HR will verify your documents</span>
                </div>
            )}

            {/* ── Stepper ─────────────────────────────────────────────────── */}
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {STEPS.map((s, i) => {
                    const Icon = s.icon
                    const isActive   = step === s.id
                    const isDone     = step > s.id
                    return (
                        <button key={s.id} onClick={() => setStep(s.id)}
                            style={{
                                flex: "1 1 0", minWidth: 100, padding: "10px 8px",
                                borderRadius: 12, border: isActive ? "2px solid var(--accent)" : "2px solid var(--border)",
                                background: isActive ? "var(--accent-light)" : isDone ? "#f0fdf4" : "var(--surface)",
                                cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                                transition: "all 0.15s",
                            }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                                background: isActive ? "var(--accent)" : isDone ? "#16a34a" : "var(--surface2)" }}>
                                {isDone
                                    ? <CheckCircle2 size={16} style={{ color: "#fff" }} />
                                    : <Icon size={15} style={{ color: isActive ? "#fff" : "var(--text3)" }} />
                                }
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? "var(--accent)" : isDone ? "#16a34a" : "var(--text3)", textAlign: "center" }}>{s.label}</span>
                        </button>
                    )
                })}
            </div>

            {/* ── Step title ──────────────────────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {(() => { const Icon = STEPS[step-1].icon; return <Icon size={18} style={{ color: "var(--accent)" }} /> })()}
                <div>
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", margin: 0 }}>
                        Step {step} — {STEPS[step-1].label}
                    </h2>
                    <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>{STEPS[step-1].desc}</p>
                </div>
            </div>

            {/* ── Form card ───────────────────────────────────────────────── */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 24px" }}>

                {/* ── Step 1: Personal ─────────────────────────────────── */}
                {step === 1 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <Grid cols={2}>
                            <Field label="First Name">
                                <Input value={f("firstName")} onChange={set("firstName")} placeholder="First Name" />
                            </Field>
                            <Field label="Middle Name">
                                <Input value={f("middleName")} onChange={set("middleName")} placeholder="Middle Name" />
                            </Field>
                            <Field label="Last Name">
                                <Input value={f("lastName")} onChange={set("lastName")} placeholder="Last Name" />
                            </Field>
                            <Field label="Name as per Aadhar">
                                <Input value={f("nameAsPerAadhar")} onChange={set("nameAsPerAadhar")} placeholder="Exact name on Aadhar card" />
                            </Field>
                            <Field label="Father's Name">
                                <Input value={f("fathersName")} onChange={set("fathersName")} placeholder="Father's full name" />
                            </Field>
                            <Field label="Date of Birth">
                                <Input type="date" value={f("dateOfBirth")} onChange={set("dateOfBirth")} />
                            </Field>
                            <Field label="Gender">
                                <Select value={f("gender")} onChange={set("gender")} options={[
                                    { v: "Male", l: "Male" }, { v: "Female", l: "Female" }, { v: "Other", l: "Other" }
                                ]} />
                            </Field>
                            <Field label="Blood Group">
                                <Select value={f("bloodGroup")} onChange={set("bloodGroup")} options={[
                                    "A+","A-","B+","B-","AB+","AB-","O+","O-"
                                ].map(x => ({ v: x, l: x }))} />
                            </Field>
                            <Field label="Marital Status">
                                <Select value={f("maritalStatus")} onChange={set("maritalStatus")} options={[
                                    { v: "Single", l: "Single" }, { v: "Married", l: "Married" },
                                    { v: "Divorced", l: "Divorced" }, { v: "Widowed", l: "Widowed" }
                                ]} />
                            </Field>
                            <Field label="Nationality">
                                <Input value={f("nationality")} onChange={set("nationality")} placeholder="e.g. Indian" />
                            </Field>
                            <Field label="Religion">
                                <Input value={f("religion")} onChange={set("religion")} placeholder="Religion" />
                            </Field>
                            <Field label="Caste">
                                <Select value={f("caste")} onChange={set("caste")} options={[
                                    { v: "General", l: "General" }, { v: "OBC", l: "OBC" },
                                    { v: "SC", l: "SC" }, { v: "ST", l: "ST" }, { v: "NT", l: "NT" }
                                ]} />
                            </Field>
                            <Field label="Mobile Number">
                                <Input value={f("phone")} onChange={set("phone")} placeholder="10-digit mobile" />
                            </Field>
                            <Field label="Alternate Mobile">
                                <Input value={f("alternatePhone")} onChange={set("alternatePhone")} placeholder="Alternate number" />
                            </Field>
                            <FieldFull label="Personal Email">
                                <Input type="email" value={f("email")} onChange={set("email")} placeholder="your@email.com" />
                            </FieldFull>
                        </Grid>
                    </div>
                )}

                {/* ── Step 2: Address ───────────────────────────────────── */}
                {step === 2 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)", marginBottom: 12 }}>Current Address</p>
                            <Grid cols={2}>
                                <FieldFull label="Full Address">
                                    <Input value={f("address")} onChange={set("address")} placeholder="House/Flat, Street, Locality" />
                                </FieldFull>
                                <Field label="City">
                                    <Input value={f("city")} onChange={set("city")} placeholder="City" />
                                </Field>
                                <Field label="State">
                                    <Input value={f("state")} onChange={set("state")} placeholder="State" />
                                </Field>
                                <Field label="Pincode">
                                    <Input value={f("pincode")} onChange={set("pincode")} placeholder="6-digit pincode" />
                                </Field>
                            </Grid>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="checkbox" id="sameAddr" checked={sameAddr} onChange={e => setSameAddr(e.target.checked)}
                                style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} />
                            <label htmlFor="sameAddr" style={{ fontSize: 13, fontWeight: 600, color: "var(--text2)", cursor: "pointer" }}>
                                Permanent address same as current address
                            </label>
                        </div>

                        <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)", marginBottom: 12 }}>Permanent Address</p>
                            <Grid cols={2}>
                                <FieldFull label="Full Address">
                                    <Input value={f("permanentAddress")} onChange={set("permanentAddress")} placeholder="House/Flat, Street, Locality" />
                                </FieldFull>
                                <Field label="City">
                                    <Input value={f("permanentCity")} onChange={set("permanentCity")} placeholder="City" />
                                </Field>
                                <Field label="State">
                                    <Input value={f("permanentState")} onChange={set("permanentState")} placeholder="State" />
                                </Field>
                                <Field label="Pincode">
                                    <Input value={f("permanentPincode")} onChange={set("permanentPincode")} placeholder="6-digit pincode" />
                                </Field>
                            </Grid>
                        </div>
                    </div>
                )}

                {/* ── Step 3: Documents / Statutory ─────────────────────── */}
                {step === 3 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: 12, color: "#1d4ed8" }}>
                            Ensure your Aadhar and PAN numbers are accurate — they are used for PF, ESIC and income tax processing.
                        </div>
                        <Grid cols={2}>
                            <Field label="Aadhar Number">
                                <Input value={f("aadharNumber")} onChange={set("aadharNumber")} placeholder="12-digit Aadhar number" />
                            </Field>
                            <Field label="PAN Number">
                                <Input value={f("panNumber")} onChange={set("panNumber")} placeholder="e.g. ABCDE1234F" />
                            </Field>
                            <Field label="UAN (Universal Account No.)">
                                <Input value={f("uan")} onChange={set("uan")} placeholder="12-digit UAN" />
                            </Field>
                            <Field label="PF Number">
                                <Input value={f("pfNumber")} onChange={set("pfNumber")} placeholder="PF Account Number" />
                            </Field>
                            <Field label="ESIC Number">
                                <Input value={f("esiNumber")} onChange={set("esiNumber")} placeholder="ESIC Insurance Number" />
                            </Field>
                            <Field label="Labour Card No.">
                                <Input value={f("labourCardNo")} onChange={set("labourCardNo")} placeholder="Labour Card Number" />
                            </Field>
                        </Grid>
                    </div>
                )}

                {/* ── Step 4: Bank Details ──────────────────────────────── */}
                {step === 4 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ padding: "10px 14px", borderRadius: 10, background: "#f0fdf4", border: "1px solid #86efac", fontSize: 12, color: "#15803d" }}>
                            Your salary will be credited to this account. Please double-check the account number and IFSC code.
                        </div>
                        <Grid cols={2}>
                            <Field label="Account Holder Name">
                                <Input value={f("nameAsPerAadhar")} onChange={set("nameAsPerAadhar")} placeholder="Name as on bank passbook" />
                            </Field>
                            <Field label="Bank Name">
                                <Input value={f("bankName")} onChange={set("bankName")} placeholder="e.g. State Bank of India" />
                            </Field>
                            <Field label="Account Number">
                                <Input value={f("bankAccountNumber")} onChange={set("bankAccountNumber")} placeholder="Bank account number" />
                            </Field>
                            <Field label="IFSC Code">
                                <Input value={f("bankIFSC")} onChange={set("bankIFSC")} placeholder="e.g. SBIN0001234" />
                            </Field>
                            <FieldFull label="Branch Name">
                                <Input value={f("bankBranch")} onChange={set("bankBranch")} placeholder="Branch name & city" />
                            </FieldFull>
                        </Grid>
                    </div>
                )}

                {/* ── Step 5: Emergency Contacts ────────────────────────── */}
                {step === 5 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)", marginBottom: 12 }}>Primary Emergency Contact</p>
                            <Grid cols={2}>
                                <Field label="Full Name">
                                    <Input value={f("emergencyContact1Name")} onChange={set("emergencyContact1Name")} placeholder="Contact person name" />
                                </Field>
                                <Field label="Phone Number">
                                    <Input value={f("emergencyContact1Phone")} onChange={set("emergencyContact1Phone")} placeholder="Mobile number" />
                                </Field>
                            </Grid>
                        </div>
                        <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)", marginBottom: 12 }}>Secondary Emergency Contact</p>
                            <Grid cols={2}>
                                <Field label="Full Name">
                                    <Input value={f("emergencyContact2Name")} onChange={set("emergencyContact2Name")} placeholder="Contact person name" />
                                </Field>
                                <Field label="Phone Number">
                                    <Input value={f("emergencyContact2Phone")} onChange={set("emergencyContact2Phone")} placeholder="Mobile number" />
                                </Field>
                            </Grid>
                        </div>

                        {/* Completion summary */}
                        <div style={{ background: "var(--surface2)", borderRadius: 12, padding: "16px 20px", border: "1px solid var(--border)" }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 12px" }}>Onboarding Summary</p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                                {STEPS.slice(0, 4).map(s => {
                                    const Icon = s.icon
                                    return (
                                        <div key={s.id} onClick={() => setStep(s.id)}
                                            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                                            <Icon size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)" }}>{s.label}</span>
                                            <ChevronRight size={12} style={{ color: "var(--text3)", marginLeft: "auto" }} />
                                        </div>
                                    )
                                })}
                            </div>
                            <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 12 }}>
                                Profile completion: <strong style={{ color: "var(--accent)" }}>{completion(profile)}%</strong> · After saving all steps, HR will review and verify your KYC.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Navigation footer ───────────────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <button onClick={() => setStep(s => s - 1)} disabled={step === 1}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, fontWeight: 700, color: step === 1 ? "var(--text3)" : "var(--text2)", cursor: step === 1 ? "not-allowed" : "pointer", opacity: step === 1 ? 0.5 : 1 }}>
                    <ChevronLeft size={15} /> Previous
                </button>

                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={save} disabled={saving}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, fontWeight: 700, color: "var(--text2)", cursor: "pointer" }}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Draft
                    </button>
                    {step < 5 ? (
                        <button onClick={saveAndNext} disabled={saving}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 24px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                            Save & Next <ChevronRight size={15} />
                        </button>
                    ) : (
                        <button onClick={save} disabled={saving}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 24px", borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={15} />}
                            Submit Profile
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
