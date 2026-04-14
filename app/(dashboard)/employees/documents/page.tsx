"use client"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    FileText, Search, Filter, Download, Trash2,
    CheckCircle2, Clock, XCircle, Loader2, Eye, Upload
} from "lucide-react"

type Doc = {
    id: string
    type: string
    fileName: string
    fileUrl: string
    status: string
    rejectionReason?: string | null
    uploadedAt: string
    employee: {
        id: string
        employeeId: string
        firstName: string
        lastName: string
        branch: { name: string }
        department?: { name: string } | null
    }
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    AADHAAR:      { label: "Aadhaar",      color: "#1d4ed8", bg: "#dbeafe" },
    PAN:          { label: "PAN",          color: "#b45309", bg: "#fef3c7" },
    RESUME:       { label: "Resume",       color: "#7c3aed", bg: "#ede9fe" },
    PHOTO:        { label: "Photo",        color: "#15803d", bg: "#dcfce7" },
    CERTIFICATE:  { label: "Certificate",  color: "#0f766e", bg: "#ccfbf1" },
    OFFER_LETTER: { label: "Offer Letter", color: "#9333ea", bg: "#f3e8ff" },
    OTHER:        { label: "Other",        color: "#6b7280", bg: "#f3f4f6" },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    PENDING:  { label: "Pending",  color: "#92400e", bg: "#fffbeb", icon: <Clock size={11} /> },
    VERIFIED: { label: "Verified", color: "#14532d", bg: "#dcfce7", icon: <CheckCircle2 size={11} /> },
    REJECTED: { label: "Rejected", color: "#991b1b", bg: "#fef2f2", icon: <XCircle size={11} /> },
}

export default function MasterDocumentsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [docs, setDocs] = useState<Doc[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [typeFilter, setTypeFilter] = useState("ALL")
    const [statusFilter, setStatusFilter] = useState("ALL")
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
    }, [status, router])

    const fetchDocs = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/employees/all-documents")
            if (res.ok) setDocs(await res.json())
        } catch { toast.error("Failed to load documents") }
        finally { setLoading(false) }
    }

    useEffect(() => { fetchDocs() }, [])

    const handleVerify = async (empId: string, docId: string) => {
        setActionLoading(docId + "_verify")
        try {
            const r = await fetch(`/api/employees/${empId}/documents/${docId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "VERIFIED" }),
            })
            if (r.ok) { toast.success("Verified"); fetchDocs() }
            else toast.error("Failed")
        } catch { toast.error("Failed") }
        finally { setActionLoading(null) }
    }

    const handleDelete = async (empId: string, docId: string) => {
        if (!confirm("Delete this document?")) return
        setActionLoading(docId + "_delete")
        try {
            const r = await fetch(`/api/employees/${empId}/documents/${docId}`, { method: "DELETE" })
            if (r.ok) { toast.success("Deleted"); setDocs(d => d.filter(x => x.id !== docId)) }
            else toast.error("Failed")
        } catch { toast.error("Failed") }
        finally { setActionLoading(null) }
    }

    const filtered = docs.filter(d => {
        const empName = `${d.employee.firstName} ${d.employee.lastName}`.toLowerCase()
        const matchSearch = !search || empName.includes(search.toLowerCase()) ||
            d.employee.employeeId.toLowerCase().includes(search.toLowerCase()) ||
            d.fileName.toLowerCase().includes(search.toLowerCase())
        const matchType = typeFilter === "ALL" || d.type === typeFilter
        const matchStatus = statusFilter === "ALL" || d.status === statusFilter
        return matchSearch && matchType && matchStatus
    })

    // Summary counts
    const total = docs.length
    const verified = docs.filter(d => d.status === "VERIFIED").length
    const pending = docs.filter(d => d.status === "PENDING").length

    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "HR_MANAGER" || session?.user?.role === "MANAGER"

    return (
        <div className="p-6 lg:p-7">
            <div className="mb-6">
                <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a18]">Master Documents</h1>
                <p className="text-[13px] text-[#6b6860] mt-[3px]">All employee KYC & HR documents — view, verify, download</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                    { label: "Total Documents", value: total, color: "#1a9e6e", bg: "#e8f7f1" },
                    { label: "Verified", value: verified, color: "#14532d", bg: "#dcfce7" },
                    { label: "Pending Review", value: pending, color: "#92400e", bg: "#fffbeb" },
                ].map(s => (
                    <div key={s.label} className="bg-white border border-[#e8e6e1] rounded-[14px] p-4">
                        <p className="text-[12px] font-medium text-[#6b6860]">{s.label}</p>
                        <p className="text-[26px] font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-[360px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95]" />
                    <input
                        placeholder="Search employee name, ID, filename…"
                        className="w-full pl-9 pr-4 py-[9px] bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:outline-none focus:border-[#1a9e6e]"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="px-3 py-[9px] bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#6b6860] focus:outline-none appearance-none cursor-pointer"
                >
                    <option value="ALL">All Types</option>
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                    ))}
                </select>
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-[9px] bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#6b6860] focus:outline-none appearance-none cursor-pointer"
                >
                    <option value="ALL">All Status</option>
                    <option value="PENDING">Pending</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="REJECTED">Rejected</option>
                </select>
            </div>

            {/* Table */}
            <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                <div className="grid grid-cols-[1fr_140px_120px_110px_160px] px-5 py-2.5 bg-[#f9f8f5] border-b border-[#e8e6e1] text-[11px] font-semibold text-[#6b6860] uppercase tracking-wide">
                    <span>Employee</span>
                    <span>Document</span>
                    <span>Type</span>
                    <span>Status</span>
                    <span className="text-right">Actions</span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="animate-spin text-[#1a9e6e]" size={28} />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <FileText size={36} className="text-[#c8c5bf]" />
                        <p className="text-[13px] text-[#9e9b95]">No documents found</p>
                    </div>
                ) : (
                    filtered.map((doc, idx) => {
                        const typeConf = TYPE_CONFIG[doc.type] || TYPE_CONFIG.OTHER
                        const statusConf = STATUS_CONFIG[doc.status] || STATUS_CONFIG.PENDING
                        const isImage = /\.(jpg|jpeg|png|webp)(\?|$)/i.test(doc.fileUrl)
                        return (
                            <div
                                key={doc.id}
                                className={`grid grid-cols-[1fr_140px_120px_110px_160px] items-center px-5 py-3.5 hover:bg-[#f9f8f5] transition-colors ${idx !== filtered.length - 1 ? "border-b border-[#e8e6e1]" : ""}`}
                            >
                                {/* Employee */}
                                <div className="min-w-0">
                                    <p className="text-[13px] font-medium text-[#1a1a18] truncate">
                                        {doc.employee.firstName} {doc.employee.lastName}
                                    </p>
                                    <p className="text-[11px] text-[#9e9b95]">
                                        {doc.employee.employeeId} · {doc.employee.branch.name}
                                    </p>
                                </div>

                                {/* File name */}
                                <p className="text-[12px] text-[#6b6860] truncate pr-2">{doc.fileName}</p>

                                {/* Type badge */}
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                                    style={{ color: typeConf.color, background: typeConf.bg }}>
                                    {typeConf.label}
                                </span>

                                {/* Status */}
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                                    style={{ color: statusConf.color, background: statusConf.bg }}>
                                    {statusConf.icon} {statusConf.label}
                                </span>

                                {/* Actions */}
                                <div className="flex items-center gap-1.5 justify-end">
                                    {isImage ? (
                                        <button
                                            onClick={() => setPreviewUrl(doc.fileUrl)}
                                            className="h-7 w-7 rounded-[6px] bg-[#f0f4ff] text-[#1d4ed8] flex items-center justify-center hover:bg-[#dbeafe] transition-colors"
                                            title="Preview"
                                        ><Eye size={13} /></button>
                                    ) : (
                                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                                            className="h-7 w-7 rounded-[6px] bg-[#f0f4ff] text-[#1d4ed8] flex items-center justify-center hover:bg-[#dbeafe] transition-colors"
                                            title="Download"
                                        ><Download size={13} /></a>
                                    )}
                                    {isAdmin && doc.status !== "VERIFIED" && (
                                        <button
                                            onClick={() => handleVerify(doc.employee.id, doc.id)}
                                            disabled={!!actionLoading}
                                            className="h-7 px-2 rounded-[6px] bg-[#dcfce7] text-[#14532d] text-[11px] font-semibold hover:bg-[#bbf7d0] transition-colors disabled:opacity-50"
                                        >{actionLoading === doc.id + "_verify" ? "…" : "Verify"}</button>
                                    )}
                                    {isAdmin && (
                                        <button
                                            onClick={() => handleDelete(doc.employee.id, doc.id)}
                                            disabled={actionLoading === doc.id + "_delete"}
                                            className="h-7 w-7 rounded-[6px] bg-[#fef2f2] text-[#dc2626] flex items-center justify-center hover:bg-[#fecaca] transition-colors disabled:opacity-50"
                                            title="Delete"
                                        ><Trash2 size={13} /></button>
                                    )}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {/* Image lightbox */}
            {previewUrl && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setPreviewUrl(null)}>
                    <div className="relative" onClick={e => e.stopPropagation()}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewUrl} alt="Preview" className="max-w-[90vw] max-h-[85vh] rounded-xl object-contain" />
                        <button onClick={() => setPreviewUrl(null)}
                            className="absolute -top-3 -right-3 w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg">✕</button>
                    </div>
                </div>
            )}
        </div>
    )
}
