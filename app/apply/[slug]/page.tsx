"use client"
import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { Loader2, CheckCircle2, AlertCircle, Send, Briefcase, User, MapPin, Camera, Plus, Trash2 } from "lucide-react"

const POSITIONS = [
    "Quality Inspector",
    "Quality Supervisor",
    "Security Guard",
    "Security Supervisor",
    "Driver",
    "Heavy Vehicle Driver",
    "Helper / Labour",
    "Electrician",
    "Plumber",
    "Housekeeping Staff",
    "Peon / Office Boy",
    "Data Entry Operator",
    "HR Recruiter",
    "HR Recruiter TL",
    "HR Executive",
    "HR Manager",
    "Field Recruiter",
    "Payroll Executive",
    "Compliance Executive",
    "Account Executive",
    "MIS Executive",
    "Operations Manager",
    "Operations Head",
    "Other",
]
const TSHIRT_SIZES = ["S", "M", "L", "XL", "XXL"]
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
const COURSE_ROWS = ["BE / BTECH", "DIPLOMA", "ITI / OTHER", "12TH", "10TH"]
const DOC_OPTIONS = ["PAN Card", "Aadhar Card", "Bank Passbook", "Educational Certificates", "Resume", "Passport Size Photo"]

type EducationRow = { course: string; stream: string; institute: string; year: string; percentage: string; location: string }
type FormMeta = { title: string; description: string | null; siteName: string | null; formType: string }

export default function ApplyPage() {
    const { slug } = useParams<{ slug: string }>()
    const [meta, setMeta] = useState<FormMeta | null>(null)
    const [notFound, setNotFound] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState("")

    const [form, setForm] = useState({
        // Basic
        candidateName: "", phone: "", email: "", tshirtSize: "", bloodGroup: "", altPhone: "", position: "",
        // Personal
        dateOfBirth: "", gender: "", fatherName: "", fatherOccupation: "",
        motherName: "", motherOccupation: "", maritalStatus: "", nationality: "Indian", aadharNumber: "",
        // Address
        presentAddress: "", permanentAddress: "", city: "",
        // Employment
        currentCompany: "", currentDesignation: "", currentSalary: "", experience: "",
        pfEsicNumber: "", previousCompany: "", reasonForLeaving: "",
        // Vehicle & Declaration
        hasBike: "", declarationDate: "", declarationPlace: "",
        // Extras
        expectedSalary: "", notes: "",
    })

    const [education, setEducation] = useState<EducationRow[]>(
        COURSE_ROWS.map(c => ({ course: c, stream: "", institute: "", year: "", percentage: "", location: "" }))
    )
    const [docs, setDocs] = useState<string[]>([])
    const isOnSiteJoin = meta?.formType === "ON_SITE_JOIN"

    const [photo, setPhoto] = useState("")
    const [photoUploading, setPhotoUploading] = useState(false)
    const photoRef = useRef<HTMLInputElement>(null)

    async function uploadPhoto(file: File) {
        if (file.size > 2 * 1024 * 1024) { setError("Photo 2MB se badi nahi honi chahiye"); return }
        setPhotoUploading(true)
        try {
            const fd = new FormData()
            fd.append("file", file)
            const res = await fetch("/api/upload", { method: "POST", body: fd })
            const data = await res.json()
            if (data.url) setPhoto(data.url)
            else setError("Photo upload failed")
        } catch { setError("Photo upload error") }
        finally { setPhotoUploading(false) }
    }

    useEffect(() => {
        fetch(`/api/lead-forms/${slug}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => d ? setMeta(d) : setNotFound(true))
            .catch(() => setNotFound(true))
    }, [slug])

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm(prev => ({ ...prev, [k]: e.target.value }))

    const updateEdu = (idx: number, field: keyof EducationRow, value: string) =>
        setEducation(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row))

    const toggleDoc = (d: string) =>
        setDocs(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.candidateName.trim() || !form.phone.trim()) { setError("Name and phone are required"); return }
        if (!/^[6-9]\d{9}$/.test(form.phone.replace(/\s/g, ""))) { setError("Enter a valid 10-digit mobile number"); return }
        setSubmitting(true); setError("")
        try {
            const payload = {
                ...form,
                profileUrl: photo || undefined,
                educationDetails: education.filter(r => r.institute || r.year || r.percentage),
                documentsSubmitted: docs,
            }
            const res = await fetch(`/api/lead-forms/${slug}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error || "Submission failed"); return }
            setSubmitted(true)
        } catch { setError("Network error. Please try again.") }
        finally { setSubmitting(false) }
    }

    if (!meta && !notFound) return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
            <Loader2 size={28} style={{ color: "#6366f1" }} className="animate-spin" />
        </div>
    )

    if (notFound) return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8fafc", gap: 12 }}>
            <AlertCircle size={40} style={{ color: "#dc2626" }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>Form not found</h2>
            <p style={{ color: "#6b7280", fontSize: 14 }}>This application link is invalid or has been deactivated.</p>
        </div>
    )

    if (submitted) return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f0fdf4", gap: 16, padding: 24 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={40} style={{ color: "#16a34a" }} />
            </div>
            {isOnSiteJoin ? (
                <>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: "#15803d", textAlign: "center" }}>Joining Confirmed!</h2>
                    <p style={{ color: "#166534", fontSize: 14, textAlign: "center", maxWidth: 340 }}>
                        Welcome aboard, <b>{form.candidateName}</b>! Your on-site joining has been recorded. Please report to HR for further formalities.
                    </p>
                    <div style={{ marginTop: 4, padding: "8px 20px", borderRadius: 20, background: "#dcfce7", border: "1px solid #86efac" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>Status: Joined ✓</span>
                    </div>
                </>
            ) : (
                <>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: "#15803d", textAlign: "center" }}>Application Submitted!</h2>
                    <p style={{ color: "#166534", fontSize: 14, textAlign: "center", maxWidth: 340 }}>
                        Thank you <b>{form.candidateName}</b>! Your application has been received. Our HR team will contact you on <b>{form.phone}</b> shortly.
                    </p>
                </>
            )}
        </div>
    )

    const inp: React.CSSProperties = {
        width: "100%", padding: "9px 11px", borderRadius: 7,
        border: "1px solid #e2e8f0", fontSize: 13, outline: "none",
        background: "#fff", color: "#111", boxSizing: "border-box",
    }
    const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4, display: "block" }
    const section: React.CSSProperties = { padding: "16px 18px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }
    const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: "#1f2937", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid #6366f1", display: "inline-block" }

    return (
        <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 12px 60px" }}>
            <div style={{ width: "100%", maxWidth: 780, background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.15)" }}>
                {/* Header */}
                <div style={{ background: isOnSiteJoin ? "linear-gradient(135deg, #047857 0%, #065f46 100%)" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", padding: "28px 28px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Briefcase size={20} color="#fff" />
                        </div>
                        <div>
                            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>
                                Growus Auto India Pvt. Ltd.
                            </p>
                            <h1 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0 }}>
                                {isOnSiteJoin ? "Candidate On-site Joining" : "Candidate Personal Information Form"}
                            </h1>
                        </div>
                    </div>
                    {meta!.description && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", margin: "8px 0 0 0" }}>{meta!.description}</p>}
                    {meta!.siteName && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
                            <MapPin size={12} color="rgba(255,255,255,0.7)" />
                            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>{meta!.siteName}</span>
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* Photo Upload */}
                    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                        <div onClick={() => photoRef.current?.click()} style={{ cursor: "pointer", position: "relative", flexShrink: 0 }}>
                            {photo ? (
                                <img src={photo} alt="Profile" style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover", border: "2.5px solid #6366f1" }} />
                            ) : (
                                <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed #6366f1" }}>
                                    <User size={24} color="#6366f1" />
                                </div>
                            )}
                            {photoUploading && (
                                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <Loader2 size={16} color="#fff" className="animate-spin" />
                                </div>
                            )}
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", margin: "0 0 5px" }}>Passport Size Photo</p>
                            <button type="button" onClick={() => photoRef.current?.click()} disabled={photoUploading}
                                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 7, background: photo ? "#f0fdf4" : "#ede9fe", color: photo ? "#047857" : "#6366f1", fontSize: 11, fontWeight: 600, border: `1px solid ${photo ? "#86efac" : "#c4b5fd"}`, cursor: "pointer" }}>
                                <Camera size={11} /> {photoUploading ? "Uploading…" : photo ? "Change Photo" : "Upload Photo"}
                            </button>
                            <p style={{ fontSize: 10, color: "#9ca3af", margin: "4px 0 0" }}>JPG / PNG • max 2MB</p>
                        </div>
                        <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = "" }} />
                    </div>

                    {/* 1. BASIC DETAILS */}
                    <div style={section}>
                        <h3 style={sectionTitle}>1. Basic Details</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div><label style={lbl}>Full Name *</label><input value={form.candidateName} onChange={set("candidateName")} placeholder="Ramesh Kumar" style={inp} required /></div>
                            <div><label style={lbl}>Mobile Number *</label><input value={form.phone} onChange={set("phone")} placeholder="9876543210" maxLength={10} style={inp} required /></div>
                            <div><label style={lbl}>Email ID</label><input value={form.email} onChange={set("email")} placeholder="email@example.com" type="email" style={inp} /></div>
                            <div><label style={lbl}>Alternative Number</label><input value={form.altPhone} onChange={set("altPhone")} placeholder="Optional" maxLength={10} style={inp} /></div>
                            <div><label style={lbl}>T-Shirt Size</label>
                                <select value={form.tshirtSize} onChange={set("tshirtSize")} style={inp}>
                                    <option value="">Select…</option>
                                    {TSHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div><label style={lbl}>Blood Group</label>
                                <select value={form.bloodGroup} onChange={set("bloodGroup")} style={inp}>
                                    <option value="">Select…</option>
                                    {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ marginTop: 12 }}>
                            <label style={lbl}>Position Applied For</label>
                            <select value={form.position} onChange={set("position")} style={inp}>
                                <option value="">Select position…</option>
                                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* 2. EDUCATIONAL DETAILS */}
                    <div style={section}>
                        <h3 style={sectionTitle}>2. Educational Details</h3>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ background: "#eef2ff", color: "#3730a3" }}>
                                        <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700 }}>Course</th>
                                        <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700 }}>Trade / Stream</th>
                                        <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700 }}>Institute</th>
                                        <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700 }}>Year</th>
                                        <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700 }}>%/CGPA</th>
                                        <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700 }}>Location</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {education.map((row, i) => (
                                        <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                                            <td style={{ padding: "4px 8px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{row.course}</td>
                                            <td style={{ padding: "4px 4px" }}><input value={row.stream} onChange={e => updateEdu(i, "stream", e.target.value)} style={{ ...inp, padding: "5px 7px", fontSize: 12 }} /></td>
                                            <td style={{ padding: "4px 4px" }}><input value={row.institute} onChange={e => updateEdu(i, "institute", e.target.value)} style={{ ...inp, padding: "5px 7px", fontSize: 12 }} /></td>
                                            <td style={{ padding: "4px 4px" }}><input value={row.year} onChange={e => updateEdu(i, "year", e.target.value)} style={{ ...inp, padding: "5px 7px", fontSize: 12, width: 70 }} /></td>
                                            <td style={{ padding: "4px 4px" }}><input value={row.percentage} onChange={e => updateEdu(i, "percentage", e.target.value)} style={{ ...inp, padding: "5px 7px", fontSize: 12, width: 80 }} /></td>
                                            <td style={{ padding: "4px 4px" }}><input value={row.location} onChange={e => updateEdu(i, "location", e.target.value)} style={{ ...inp, padding: "5px 7px", fontSize: 12 }} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 3. PERSONAL DETAILS */}
                    <div style={section}>
                        <h3 style={sectionTitle}>3. Personal Details</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div><label style={lbl}>Date of Birth</label><input value={form.dateOfBirth} onChange={set("dateOfBirth")} type="date" style={inp} /></div>
                            <div><label style={lbl}>Gender</label>
                                <select value={form.gender} onChange={set("gender")} style={inp}>
                                    <option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option>
                                </select>
                            </div>
                            <div><label style={lbl}>Father's Name</label><input value={form.fatherName} onChange={set("fatherName")} style={inp} /></div>
                            <div><label style={lbl}>Father's Occupation</label><input value={form.fatherOccupation} onChange={set("fatherOccupation")} style={inp} /></div>
                            <div><label style={lbl}>Mother's Name</label><input value={form.motherName} onChange={set("motherName")} style={inp} /></div>
                            <div><label style={lbl}>Mother's Occupation</label><input value={form.motherOccupation} onChange={set("motherOccupation")} style={inp} /></div>
                            <div><label style={lbl}>Marital Status</label>
                                <select value={form.maritalStatus} onChange={set("maritalStatus")} style={inp}>
                                    <option value="">Select…</option><option>Single</option><option>Married</option><option>Other</option>
                                </select>
                            </div>
                            <div><label style={lbl}>Nationality</label><input value={form.nationality} onChange={set("nationality")} style={inp} /></div>
                            <div style={{ gridColumn: "span 2" }}><label style={lbl}>Aadhar Number</label><input value={form.aadharNumber} onChange={set("aadharNumber")} placeholder="12-digit Aadhar" maxLength={14} style={inp} /></div>
                        </div>
                    </div>

                    {/* 4. ADDRESS */}
                    <div style={section}>
                        <h3 style={sectionTitle}>4. Address</h3>
                        <div style={{ display: "grid", gap: 12 }}>
                            <div><label style={lbl}>City</label><input value={form.city} onChange={set("city")} placeholder="Mumbai" style={inp} /></div>
                            <div><label style={lbl}>Present Address</label><textarea value={form.presentAddress} onChange={set("presentAddress")} rows={2} style={{ ...inp, resize: "none" as const }} /></div>
                            <div><label style={lbl}>Permanent Address</label><textarea value={form.permanentAddress} onChange={set("permanentAddress")} rows={2} style={{ ...inp, resize: "none" as const }} /></div>
                        </div>
                    </div>

                    {/* 5. EMPLOYMENT DETAILS */}
                    <div style={section}>
                        <h3 style={sectionTitle}>5. Employment Details</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div><label style={lbl}>Current Employer Name</label><input value={form.currentCompany} onChange={set("currentCompany")} style={inp} /></div>
                            <div><label style={lbl}>Current Designation</label><input value={form.currentDesignation} onChange={set("currentDesignation")} style={inp} /></div>
                            <div><label style={lbl}>Current Salary (₹/month)</label><input value={form.currentSalary} onChange={set("currentSalary")} type="number" style={inp} /></div>
                            <div><label style={lbl}>Total Experience (years)</label><input value={form.experience} onChange={set("experience")} type="number" step="0.5" style={inp} /></div>
                            <div><label style={lbl}>PF & ESIC Number</label><input value={form.pfEsicNumber} onChange={set("pfEsicNumber")} style={inp} /></div>
                            <div><label style={lbl}>Last Employer Name</label><input value={form.previousCompany} onChange={set("previousCompany")} style={inp} /></div>
                            <div style={{ gridColumn: "span 2" }}><label style={lbl}>Reason for Leaving</label><textarea value={form.reasonForLeaving} onChange={set("reasonForLeaving")} rows={2} style={{ ...inp, resize: "none" as const }} /></div>
                            <div><label style={lbl}>Expected Salary (₹/month)</label><input value={form.expectedSalary} onChange={set("expectedSalary")} type="number" style={inp} /></div>
                        </div>
                    </div>

                    {/* 6. DOCUMENTS SUBMITTED */}
                    <div style={section}>
                        <h3 style={sectionTitle}>6. Documents Submitted</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            {DOC_OPTIONS.map(d => (
                                <label key={d} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, background: docs.includes(d) ? "#ede9fe" : "#fff", border: `1px solid ${docs.includes(d) ? "#c4b5fd" : "#e2e8f0"}`, fontSize: 12, fontWeight: 600, color: docs.includes(d) ? "#5b21b6" : "#374151", cursor: "pointer" }}>
                                    <input type="checkbox" checked={docs.includes(d)} onChange={() => toggleDoc(d)} />
                                    {d}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* 7. VEHICLE */}
                    <div style={section}>
                        <h3 style={sectionTitle}>7. Vehicle Details</h3>
                        <label style={lbl}>Do you have a bike?</label>
                        <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                            {["Yes", "No"].map(opt => (
                                <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 7, background: form.hasBike === opt ? "#ede9fe" : "#fff", border: `1px solid ${form.hasBike === opt ? "#c4b5fd" : "#e2e8f0"}`, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                    <input type="radio" name="hasBike" value={opt} checked={form.hasBike === opt} onChange={set("hasBike")} />
                                    {opt}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* 8. DECLARATION */}
                    <div style={section}>
                        <h3 style={sectionTitle}>8. Declaration</h3>
                        <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 12, lineHeight: 1.5 }}>
                            I hereby declare that all the information provided by me is true and correct to the best of my knowledge.
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div><label style={lbl}>Date</label><input value={form.declarationDate} onChange={set("declarationDate")} type="date" style={inp} /></div>
                            <div><label style={lbl}>Place</label><input value={form.declarationPlace} onChange={set("declarationPlace")} placeholder="City of signing" style={inp} /></div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label style={lbl}>Anything else? (optional)</label>
                        <textarea value={form.notes} onChange={set("notes")} placeholder="Additional info…" rows={3} style={{ ...inp, resize: "none" as const }} />
                    </div>

                    {error && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca" }}>
                            <AlertCircle size={14} style={{ color: "#dc2626", flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
                        </div>
                    )}

                    <button type="submit" disabled={submitting} style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        padding: "12px 24px", borderRadius: 10, border: "none",
                        background: submitting ? "#a5b4fc" : (isOnSiteJoin ? "linear-gradient(135deg, #047857 0%, #065f46 100%)" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"),
                        color: "#fff", fontSize: 14, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
                        boxShadow: submitting ? "none" : "0 4px 15px rgba(102,126,234,0.4)",
                    }}>
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {submitting ? "Submitting…" : isOnSiteJoin ? "Confirm On-site Joining" : "Submit Application"}
                    </button>

                    <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", margin: 0 }}>
                        By submitting you agree that we may contact you regarding this application.
                    </p>
                </form>
            </div>
        </div>
    )
}
