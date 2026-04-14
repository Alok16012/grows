"use client"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    FileText, Search, Download, Trash2,
    CheckCircle2, Clock, XCircle, Loader2, Eye, ChevronDown, ChevronUp,
    User, Building2, Phone, Mail, Users
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
        phone?: string
        email?: string
        designation?: string
        branch: { name: string }
        department?: { name: string } | null
    }
}

type GroupedEmployee = {
    id: string
    employeeId: string
    firstName: string
    lastName: string
    phone?: string
    email?: string
    designation?: string
    branch: string
    department: string
    documents: Doc[]
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    AADHAAR: { label: "Aadhaar", color: "#1d4ed8", bg: "#dbeafe" },
    PAN: { label: "PAN", color: "#b45309", bg: "#fef3c7" },
    RESUME: { label: "Resume", color: "#7c3aed", bg: "#ede9fe" },
    PHOTO: { label: "Photo", color: "#15803d", bg: "#dcfce7" },
    CERTIFICATE: { label: "Certificate", color: "#0f766e", bg: "#ccfbf1" },
    OFFER_LETTER: { label: "Offer Letter", color: "#9333ea", bg: "#f3e8ff" },
    OTHER: { label: "Other", color: "#6b7280", bg: "#f3f4f6" },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    PENDING: { label: "Pending", color: "#92400e", bg: "#fffbeb", icon: <Clock size={11} /> },
    VERIFIED: { label: "Verified", color: "#14532d", bg: "#dcfce7", icon: <CheckCircle2 size={11} /> },
    REJECTED: { label: "Rejected", color: "#991b1b", bg: "#fef2f2", icon: <XCircle size={11} /> },
}

const AVATAR_COLORS = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#f97316"]

export default function MasterDocumentsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [docs, setDocs] = useState<Doc[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [typeFilter, setTypeFilter] = useState("ALL")
    const [statusFilter, setStatusFilter] = useState("ALL")
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [downloadingId, setDownloadingId] = useState<string | null>(null)

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

    const downloadAllDocs = async (emp: GroupedEmployee) => {
        setDownloadingId(emp.id)
        try {
            for (const doc of emp.documents) {
                const link = document.createElement("a")
                link.href = doc.fileUrl
                link.download = `${emp.employeeId}_${doc.type}_${doc.fileName}`
                link.target = "_blank"
                link.rel = "noopener noreferrer"
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                // Small delay between downloads to prevent browser blocking
                await new Promise(r => setTimeout(r, 400))
            }
            toast.success(`${emp.documents.length} documents downloading for ${emp.firstName} ${emp.lastName}`)
        } catch { toast.error("Download failed") }
        finally { setDownloadingId(null) }
    }

    // Group docs by employee
    const grouped: GroupedEmployee[] = (() => {
        const map = new Map<string, GroupedEmployee>()
        for (const doc of docs) {
            const e = doc.employee
            if (!map.has(e.id)) {
                map.set(e.id, {
                    id: e.id,
                    employeeId: e.employeeId,
                    firstName: e.firstName,
                    lastName: e.lastName,
                    phone: e.phone,
                    email: e.email,
                    designation: e.designation,
                    branch: e.branch.name,
                    department: e.department?.name || "—",
                    documents: [],
                })
            }
            const matchType = typeFilter === "ALL" || doc.type === typeFilter
            const matchStatus = statusFilter === "ALL" || doc.status === statusFilter
            if (matchType && matchStatus) {
                map.get(e.id)!.documents.push(doc)
            }
        }
        return Array.from(map.values())
            .filter(emp => {
                if (!search) return emp.documents.length > 0
                const q = search.toLowerCase()
                const match = `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(q) ||
                    emp.employeeId.toLowerCase().includes(q) ||
                    emp.branch.toLowerCase().includes(q)
                return match && emp.documents.length > 0
            })
            .sort((a, b) => a.firstName.localeCompare(b.firstName))
    })()

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })
    }

    const expandAll = () => setExpandedIds(new Set(grouped.map(e => e.id)))
    const collapseAll = () => setExpandedIds(new Set())

    // Summary counts
    const totalDocs = docs.length
    const totalEmployees = new Set(docs.map(d => d.employee.id)).size
    const verified = docs.filter(d => d.status === "VERIFIED").length
    const pending = docs.filter(d => d.status === "PENDING").length

    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "HR_MANAGER" || session?.user?.role === "MANAGER"

    return (
        <div className="p-6 lg:p-7 max-w-screen-xl mx-auto">
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-1">
                    <div className="h-10 w-10 rounded-[10px] bg-[#e8f7f1] flex items-center justify-center shrink-0">
                        <FileText size={20} className="text-[#1a9e6e]" />
                    </div>
                    <div>
                        <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a18]">Document Management</h1>
                        <p className="text-[13px] text-[#6b6860]">All employee documents — grouped by employee with download option</p>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                    { label: "Employees", value: totalEmployees, color: "#3b82f6", bg: "#eff6ff", icon: <Users size={16} /> },
                    { label: "Total Documents", value: totalDocs, color: "#1a9e6e", bg: "#e8f7f1", icon: <FileText size={16} /> },
                    { label: "Verified", value: verified, color: "#14532d", bg: "#dcfce7", icon: <CheckCircle2 size={16} /> },
                    { label: "Pending", value: pending, color: "#92400e", bg: "#fffbeb", icon: <Clock size={16} /> },
                ].map(s => (
                    <div key={s.label} className="bg-white border border-[#e8e6e1] rounded-[12px] p-4 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-[8px] flex items-center justify-center shrink-0" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
                        <div>
                            <p className="text-[11px] text-[#6b6860]">{s.label}</p>
                            <p className="text-[20px] font-bold" style={{ color: s.color }}>{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4 items-center">
                <div className="relative flex-1 min-w-[200px] max-w-[360px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95]" />
                    <input
                        placeholder="Search employee name, ID, branch…"
                        className="w-full pl-9 pr-4 py-[9px] bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:outline-none focus:border-[#1a9e6e]"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                    className="px-3 py-[9px] bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#6b6860] focus:outline-none cursor-pointer">
                    <option value="ALL">All Types</option>
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-[9px] bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#6b6860] focus:outline-none cursor-pointer">
                    <option value="ALL">All Status</option>
                    <option value="PENDING">Pending</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="REJECTED">Rejected</option>
                </select>
                <div className="flex gap-1.5 ml-auto">
                    <button onClick={expandAll} className="text-[12px] text-[var(--accent)] hover:underline font-medium">Expand All</button>
                    <span className="text-[12px] text-[#ccc]">|</span>
                    <button onClick={collapseAll} className="text-[12px] text-[var(--accent)] hover:underline font-medium">Collapse All</button>
                </div>
            </div>

            {/* Employee List */}
            {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-[#1a9e6e]" size={28} /></div>
            ) : grouped.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white border border-[#e8e6e1] rounded-[14px]">
                    <FileText size={36} className="text-[#c8c5bf]" />
                    <p className="text-[13px] text-[#9e9b95]">No documents found</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {grouped.map(emp => {
                        const isExpanded = expandedIds.has(emp.id)
                        const verifiedCount = emp.documents.filter(d => d.status === "VERIFIED").length
                        const pendingCount = emp.documents.filter(d => d.status === "PENDING").length
                        const avatarColor = AVATAR_COLORS[(emp.firstName.charCodeAt(0) + (emp.lastName.charCodeAt(0) || 0)) % AVATAR_COLORS.length]

                        return (
                            <div key={emp.id} className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                                {/* Employee Header Row */}
                                <div
                                    className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#f9f8f5] transition-colors"
                                    onClick={() => toggleExpand(emp.id)}
                                >
                                    {/* Avatar */}
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-[14px] font-bold"
                                        style={{ background: avatarColor }}>
                                        {emp.firstName[0]}{emp.lastName[0]}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[14px] font-semibold text-[#1a1a18]">{emp.firstName} {emp.lastName}</span>
                                            <span className="text-[11px] text-[#9e9b95] bg-[#f3f4f6] px-2 py-0.5 rounded">{emp.employeeId}</span>
                                            {emp.designation && <span className="text-[11px] text-[#6b6860]">· {emp.designation}</span>}
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[#9e9b95]">
                                            <span className="flex items-center gap-1"><Building2 size={10} /> {emp.branch}</span>
                                            {emp.department !== "—" && <span>· {emp.department}</span>}
                                        </div>
                                    </div>

                                    {/* Doc count badges */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[11px] font-medium bg-[#eff6ff] text-[#3b82f6] px-2 py-0.5 rounded-full">
                                            {emp.documents.length} docs
                                        </span>
                                        {verifiedCount > 0 && (
                                            <span className="text-[11px] font-medium bg-[#dcfce7] text-[#14532d] px-2 py-0.5 rounded-full">
                                                {verifiedCount} verified
                                            </span>
                                        )}
                                        {pendingCount > 0 && (
                                            <span className="text-[11px] font-medium bg-[#fffbeb] text-[#92400e] px-2 py-0.5 rounded-full">
                                                {pendingCount} pending
                                            </span>
                                        )}
                                    </div>

                                    {/* Download All */}
                                    <button
                                        onClick={e => { e.stopPropagation(); downloadAllDocs(emp) }}
                                        disabled={downloadingId === emp.id}
                                        className="flex items-center gap-1.5 text-[12px] font-medium text-white bg-[#1a9e6e] hover:bg-[#158a5e] px-3 py-1.5 rounded-[8px] shrink-0 disabled:opacity-60 transition-colors"
                                        title="Download all documents"
                                    >
                                        {downloadingId === emp.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                        Download All
                                    </button>

                                    {/* Expand icon */}
                                    {isExpanded ? <ChevronUp size={16} className="text-[#9e9b95] shrink-0" /> : <ChevronDown size={16} className="text-[#9e9b95] shrink-0" />}
                                </div>

                                {/* Expanded Document List */}
                                {isExpanded && (
                                    <div className="border-t border-[#e8e6e1]">
                                        {/* Table Header */}
                                        <div className="grid grid-cols-[1fr_120px_100px_140px] px-5 py-2 bg-[#f9f8f5] text-[10px] font-semibold text-[#9e9b95] uppercase tracking-wide">
                                            <span>File Name</span>
                                            <span>Type</span>
                                            <span>Status</span>
                                            <span className="text-right">Actions</span>
                                        </div>
                                        {emp.documents.map((doc, i) => {
                                            const typeConf = TYPE_CONFIG[doc.type] || TYPE_CONFIG.OTHER
                                            const statusConf = STATUS_CONFIG[doc.status] || STATUS_CONFIG.PENDING
                                            const isImage = /\.(jpg|jpeg|png|webp)(\?|$)/i.test(doc.fileUrl)
                                            return (
                                                <div key={doc.id}
                                                    className={`grid grid-cols-[1fr_120px_100px_140px] items-center px-5 py-3 hover:bg-[#fafaf8] transition-colors ${i < emp.documents.length - 1 ? "border-b border-[#f0efec]" : ""}`}>
                                                    <div className="min-w-0">
                                                        <p className="text-[13px] text-[#1a1a18] truncate">{doc.fileName}</p>
                                                        <p className="text-[10px] text-[#9e9b95]">{new Date(doc.uploadedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                                                    </div>
                                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                                                        style={{ color: typeConf.color, background: typeConf.bg }}>
                                                        {typeConf.label}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                                                        style={{ color: statusConf.color, background: statusConf.bg }}>
                                                        {statusConf.icon} {statusConf.label}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 justify-end">
                                                        {isImage ? (
                                                            <button onClick={() => setPreviewUrl(doc.fileUrl)}
                                                                className="h-7 w-7 rounded-[6px] bg-[#f0f4ff] text-[#1d4ed8] flex items-center justify-center hover:bg-[#dbeafe]" title="Preview">
                                                                <Eye size={13} />
                                                            </button>
                                                        ) : null}
                                                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" download
                                                            className="h-7 w-7 rounded-[6px] bg-[#e8f7f1] text-[#1a9e6e] flex items-center justify-center hover:bg-[#d1fae5]" title="Download">
                                                            <Download size={13} />
                                                        </a>
                                                        {isAdmin && doc.status !== "VERIFIED" && (
                                                            <button onClick={() => handleVerify(emp.id, doc.id)}
                                                                disabled={!!actionLoading}
                                                                className="h-7 px-2 rounded-[6px] bg-[#dcfce7] text-[#14532d] text-[11px] font-semibold hover:bg-[#bbf7d0] disabled:opacity-50">
                                                                {actionLoading === doc.id + "_verify" ? "…" : "Verify"}
                                                            </button>
                                                        )}
                                                        {isAdmin && (
                                                            <button onClick={() => handleDelete(emp.id, doc.id)}
                                                                disabled={actionLoading === doc.id + "_delete"}
                                                                className="h-7 w-7 rounded-[6px] bg-[#fef2f2] text-[#dc2626] flex items-center justify-center hover:bg-[#fecaca] disabled:opacity-50" title="Delete">
                                                                <Trash2 size={13} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Image lightbox */}
            {previewUrl && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
                    <div className="relative" onClick={e => e.stopPropagation()}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewUrl} alt="Preview" className="max-w-[90vw] max-h-[85vh] rounded-xl object-contain" />
                        <button onClick={() => setPreviewUrl(null)}
                            className="absolute -top-3 -right-3 w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg">
                            ✕
                        </button>
                        <a href={previewUrl} download target="_blank" rel="noopener noreferrer"
                            className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-white text-[#1a1a18] px-4 py-1.5 rounded-full text-[12px] font-medium shadow-lg hover:bg-[#f5f5f5]">
                            <Download size={12} /> Download
                        </a>
                    </div>
                </div>
            )}
        </div>
    )
}
