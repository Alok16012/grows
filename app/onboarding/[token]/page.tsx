"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { UploadCloud, CheckCircle2, AlertCircle, FileText, Loader2, User, Banknote, ShieldAlert } from "lucide-react"
import { toast } from "sonner"

export default function OnboardingPortal() {
    const params = useParams()
    const token = params.token as string

    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [employee, setEmployee] = useState<any>(null)

    // Form State
    const [formData, setFormData] = useState({
        dateOfBirth: "",
        gender: "",
        address: "",
        city: "",
        state: "",
        pincode: "",
        aadharNumber: "",
        panNumber: "",
        bankAccountNumber: "",
        bankIFSC: "",
        bankName: ""
    })

    // Simulated local files (Just names for mock UI without real storage)
    const [docs, setDocs] = useState<{ type: string; fileName: string; fileUrl: string }[]>([])
    const DOC_TYPES = ["Aadhaar Card", "PAN Card", "Resume", "Educational Certificates", "Bank Proof", "Photo"]

    useEffect(() => {
        if (!token) return
        fetch(`/api/external/onboarding/${token}`)
            .then(res => res.json())
            .then(data => {
                if (data.id) {
                    setEmployee(data)
                    setFormData({
                        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString().split("T")[0] : "",
                        gender: data.gender || "",
                        address: data.address || "",
                        city: data.city || "",
                        state: data.state || "",
                        pincode: data.pincode || "",
                        aadharNumber: data.aadharNumber || "",
                        panNumber: data.panNumber || "",
                        bankAccountNumber: data.bankAccountNumber || "",
                        bankIFSC: data.bankIFSC || "",
                        bankName: data.bankName || ""
                    })
                    // Map existing docs
                    if (data.documents) {
                        setDocs(data.documents)
                    }
                }
            })
            .catch(e => console.error("Invalid token"))
            .finally(() => setLoading(false))
    }, [token])

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
        const file = e.target.files?.[0]
        if (!file) return

        // MOCK UPLOAD - In production use AWS S3 / Supabase Storage
        // Here we just use a mocked URL string for demo purposes
        const mockUrl = `https://mock-storage.com/${file.name.replace(/\s+/g, "_")}`
        
        setDocs(prev => {
            const existing = prev.filter(d => d.type !== type)
            return [...existing, { type, fileName: file.name, fileUrl: mockUrl }]
        })
        toast.success(`${type} selected`)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)

        try {
            const res = await fetch(`/api/external/onboarding/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...formData, uploadedDocs: docs })
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Details submitted successfully for verification!")
            window.location.reload()
        } catch (error: any) {
            toast.error(error.message || "Failed to submit")
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
            <Loader2 className="animate-spin text-[var(--accent)]" size={32} />
        </div>
    )

    if (!employee) return (
        <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-white">
            <div className="text-center">
                <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
                <h1 className="text-xl font-bold">Invalid or Expired Link</h1>
                <p className="text-gray-400 mt-2">Please contact HR for a new onboarding access link.</p>
            </div>
        </div>
    )

    if (employee.status === "ACTIVE") return (
        <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-white">
            <div className="text-center p-8 bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-sm">
                <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
                <h1 className="text-xl font-bold">Onboarding Complete</h1>
                <p className="text-[13px] text-gray-400 mt-2">Welcome aboard, {employee.firstName}! Your employee profile is now fully active.</p>
            </div>
        </div>
    )

    return (
        <div className="min-h-screen bg-[#09090b] text-[var(--text)] pb-20">
            {/* Header */}
            <div className="bg-[var(--surface)] border-b border-[var(--border)] sticky top-0 z-10 px-4 py-4 md:px-8">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-[18px] font-bold">Digital Onboarding</h1>
                        <p className="text-[12px] text-[var(--text3)]">Welcome, {employee.firstName} {employee.lastName}</p>
                    </div>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 mt-6">
                {employee.kycRejectionNote && (
                    <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3">
                        <AlertCircle className="text-red-500 shrink-0" size={20} />
                        <div>
                            <h3 className="text-red-500 text-[14px] font-semibold">Verification Update Required</h3>
                            <p className="text-red-400 text-[13px] mt-1">{employee.kycRejectionNote}</p>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
                    
                    {/* Personal Information */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 md:p-6">
                        <div className="flex items-center gap-2 mb-5 border-b border-[var(--border)] pb-3">
                            <User className="text-[var(--accent)]" size={18} />
                            <h2 className="font-semibold text-[15px]">Personal Details</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[12px] text-[var(--text3)] mb-1 block">Date of Birth</label>
                                <input required type="date" value={formData.dateOfBirth} onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                       className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]" />
                            </div>
                            <div>
                                <label className="text-[12px] text-[var(--text3)] mb-1 block">Gender</label>
                                <select required value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })}
                                        className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]">
                                    <option value="">Select...</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[12px] text-[var(--text3)] mb-1 block">Current Address</label>
                                <input required type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })}
                                       className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]" />
                            </div>
                            <div>
                                <label className="text-[12px] text-[var(--text3)] mb-1 block">City</label>
                                <input required type="text" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })}
                                       className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]" />
                            </div>
                            <div>
                                <label className="text-[12px] text-[var(--text3)] mb-1 block">State & Pincode</label>
                                <div className="flex gap-2">
                                    <input required type="text" placeholder="State" value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value })}
                                           className="w-2/3 bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]" />
                                    <input required type="text" placeholder="PIN" value={formData.pincode} onChange={e => setFormData({ ...formData, pincode: e.target.value })}
                                           className="w-1/3 bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* KYC Details */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 md:p-6">
                        <div className="flex items-center gap-2 mb-5 border-b border-[var(--border)] pb-3">
                            <ShieldAlert className="text-[var(--accent)]" size={18} />
                            <h2 className="font-semibold text-[15px]">KYC Verification</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[12px] text-[var(--text3)] mb-1 block">Aadhaar Number <span className="text-red-500">*</span></label>
                                <input required type="text" maxLength={12} placeholder="12-digit Aadhaar" value={formData.aadharNumber} onChange={e => setFormData({ ...formData, aadharNumber: e.target.value.replace(/\D/g,'') })}
                                       className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]" />
                            </div>
                            <div>
                                <label className="text-[12px] text-[var(--text3)] mb-1 block">PAN Number <span className="text-red-500">*</span></label>
                                <input required type="text" maxLength={10} placeholder="ABCDE1234F" value={formData.panNumber} onChange={e => setFormData({ ...formData, panNumber: e.target.value.toUpperCase() })}
                                       className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)] uppercase" />
                            </div>
                        </div>
                    </div>

                    {/* Bank Details */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 md:p-6">
                        <div className="flex items-center gap-2 mb-5 border-b border-[var(--border)] pb-3">
                            <Banknote className="text-[var(--accent)]" size={18} />
                            <h2 className="font-semibold text-[15px]">Bank Details</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="text-[12px] text-[var(--text3)] mb-1 block">Bank Name</label>
                                <input required type="text" placeholder="HDFC, SBI, etc." value={formData.bankName} onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                                       className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]" />
                            </div>
                            <div>
                                <label className="text-[12px] text-[var(--text3)] mb-1 block">Account Number</label>
                                <input required type="password" placeholder="Account Number" value={formData.bankAccountNumber} onChange={e => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                                       className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]" />
                            </div>
                            <div>
                                <label className="text-[12px] text-[var(--text3)] mb-1 block">IFSC Code</label>
                                <input required type="text" placeholder="IFSC Code" value={formData.bankIFSC} onChange={e => setFormData({ ...formData, bankIFSC: e.target.value.toUpperCase() })}
                                       className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)] uppercase" />
                            </div>
                        </div>
                    </div>

                    {/* Document Uploads */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 md:p-6">
                        <div className="flex items-center gap-2 mb-5 border-b border-[var(--border)] pb-3">
                            <UploadCloud className="text-[var(--accent)]" size={18} />
                            <h2 className="font-semibold text-[15px]">Document Uploads</h2>
                        </div>
                        
                        <div className="space-y-4">
                            {DOC_TYPES.map(type => {
                                const exist = docs.find(d => d.type === type)
                                return (
                                    <div key={type} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--surface2)] gap-3 md:gap-0">
                                        <div className="flex items-center gap-3">
                                            <FileText size={20} className={exist ? "text-[var(--accent)]" : "text-[var(--text3)]"} />
                                            <div>
                                                <p className="text-[13px] font-medium">{type} <span className="text-red-500 text-[10px]">*</span></p>
                                                {exist && <p className="text-[11px] text-green-500">Uploaded: {exist.fileName}</p>}
                                                {exist?.status === "REJECTED" && <p className="text-[11px] text-red-500">Rejected: {exist.rejectionReason}</p>}
                                            </div>
                                        </div>
                                        <label className="shrink-0">
                                            <div className="px-4 py-2 border border-[var(--border)] rounded-lg text-[12px] cursor-pointer hover:border-[var(--accent)] transition-colors inline-block text-center w-full md:w-auto bg-[var(--surface)]">
                                                {exist ? "Re-upload" : "Browse File"}
                                            </div>
                                            <input type="file" className="hidden" onChange={(e) => handleFileChange(e, type)} />
                                        </label>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={submitting} 
                        className="w-full h-12 bg-[var(--accent)] text-white rounded-xl font-medium text-[15px] flex justify-center items-center gap-2"
                    >
                        {submitting && <Loader2 size={16} className="animate-spin" />}
                        Submit Details for Verification
                    </button>
                    <p className="text-center text-[11px] text-[var(--text3)] mt-2">
                        I hereby declare that the details furnished above are true and correct to the best of my knowledge.
                    </p>
                </form>
            </div>
        </div>
    )
}
