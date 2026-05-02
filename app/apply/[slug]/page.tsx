"use client"
import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Loader2, CheckCircle2, AlertCircle, Send, Briefcase, User, Phone, Mail, MapPin } from "lucide-react"

const POSITIONS = [
    "Security Guard", "Security Supervisor", "Inspector", "Senior Inspector",
    "Driver", "Heavy Vehicle Driver", "Supervisor", "Team Leader",
    "Helper / Labour", "Electrician", "Plumber", "Housekeeping Staff",
    "Data Entry Operator", "Peon / Office Boy", "Other"
]
const QUALIFICATIONS = ["8th Pass", "10th Pass", "12th Pass", "ITI", "Diploma", "Graduate", "Post Graduate", "Other"]

type FormMeta = { title: string; description: string | null; siteName: string | null }

export default function ApplyPage() {
    const { slug } = useParams<{ slug: string }>()
    const [meta, setMeta] = useState<FormMeta | null>(null)
    const [notFound, setNotFound] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState("")

    const [form, setForm] = useState({
        candidateName: "", phone: "", email: "", city: "",
        position: "", experience: "", qualification: "",
        skills: "", gender: "", age: "", expectedSalary: "", notes: "",
    })

    useEffect(() => {
        fetch(`/api/lead-forms/${slug}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => d ? setMeta(d) : setNotFound(true))
            .catch(() => setNotFound(true))
    }, [slug])

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm(prev => ({ ...prev, [k]: e.target.value }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.candidateName.trim() || !form.phone.trim()) { setError("Name and phone are required"); return }
        if (!/^[6-9]\d{9}$/.test(form.phone.replace(/\s/g, ""))) { setError("Enter a valid 10-digit mobile number"); return }
        setSubmitting(true); setError("")
        try {
            const res = await fetch(`/api/lead-forms/${slug}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
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
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#15803d", textAlign: "center" }}>Application Submitted!</h2>
            <p style={{ color: "#166534", fontSize: 14, textAlign: "center", maxWidth: 340 }}>
                Thank you <b>{form.candidateName}</b>! Your application has been received. Our HR team will contact you on <b>{form.phone}</b> shortly.
            </p>
        </div>
    )

    const inp: React.CSSProperties = {
        width: "100%", padding: "10px 12px", borderRadius: 8,
        border: "1px solid #e2e8f0", fontSize: 14, outline: "none",
        background: "#fff", color: "#111", boxSizing: "border-box",
    }
    const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4, display: "block" }

    return (
        <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px 60px" }}>
            <div style={{ width: "100%", maxWidth: 520, background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.15)" }}>
                {/* Header */}
                <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", padding: "28px 28px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Briefcase size={20} color="#fff" />
                        </div>
                        <div>
                            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>Job Application</p>
                            <h1 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0 }}>{meta!.title}</h1>
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

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                            <label style={lbl}>Full Name *</label>
                            <input value={form.candidateName} onChange={set("candidateName")} placeholder="Ramesh Kumar" style={inp} required />
                        </div>
                        <div>
                            <label style={lbl}>Mobile Number *</label>
                            <input value={form.phone} onChange={set("phone")} placeholder="9876543210" maxLength={10} style={inp} required />
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                            <label style={lbl}>Email (optional)</label>
                            <input value={form.email} onChange={set("email")} placeholder="email@example.com" type="email" style={inp} />
                        </div>
                        <div>
                            <label style={lbl}>City</label>
                            <input value={form.city} onChange={set("city")} placeholder="Mumbai" style={inp} />
                        </div>
                    </div>

                    <div>
                        <label style={lbl}>Position Applied For</label>
                        <select value={form.position} onChange={set("position")} style={inp}>
                            <option value="">Select position…</option>
                            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                        <div>
                            <label style={lbl}>Experience (years)</label>
                            <input value={form.experience} onChange={set("experience")} placeholder="2" type="number" min="0" step="0.5" style={inp} />
                        </div>
                        <div>
                            <label style={lbl}>Gender</label>
                            <select value={form.gender} onChange={set("gender")} style={inp}>
                                <option value="">Select…</option>
                                <option>Male</option><option>Female</option><option>Other</option>
                            </select>
                        </div>
                        <div>
                            <label style={lbl}>Age</label>
                            <input value={form.age} onChange={set("age")} placeholder="25" type="number" min="18" max="65" style={inp} />
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                            <label style={lbl}>Qualification</label>
                            <select value={form.qualification} onChange={set("qualification")} style={inp}>
                                <option value="">Select…</option>
                                {QUALIFICATIONS.map(q => <option key={q} value={q}>{q}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={lbl}>Expected Salary (₹/month)</label>
                            <input value={form.expectedSalary} onChange={set("expectedSalary")} placeholder="15000" type="number" style={inp} />
                        </div>
                    </div>

                    <div>
                        <label style={lbl}>Skills (optional)</label>
                        <input value={form.skills} onChange={set("skills")} placeholder="Driving License, Forklift, First Aid…" style={inp} />
                    </div>

                    <div>
                        <label style={lbl}>Anything else? (optional)</label>
                        <textarea value={form.notes} onChange={set("notes")} placeholder="Tell us anything relevant…"
                            rows={3} style={{ ...inp, resize: "none" as const }} />
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
                        background: submitting ? "#a5b4fc" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                        color: "#fff", fontSize: 14, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
                        boxShadow: submitting ? "none" : "0 4px 15px rgba(102,126,234,0.4)",
                    }}>
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {submitting ? "Submitting…" : "Submit Application"}
                    </button>

                    <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", margin: 0 }}>
                        By submitting you agree that we may contact you regarding this application.
                    </p>
                </form>
            </div>
        </div>
    )
}
