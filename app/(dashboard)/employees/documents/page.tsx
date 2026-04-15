"use client"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    FileText, Search, Download, Trash2,
    CheckCircle2, Clock, XCircle, Loader2, Eye, Users
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
    PENDING:  { label: "Pending",  color: "#92400e", bg: "#fffbeb", icon: <Clock size={10} /> },
    VERIFIED: { label: "Verified", color: "#14532d", bg: "#dcfce7", icon: <CheckCircle2 size={10} /> },
    REJECTED: { label: "Rejected", color: "#991b1b", bg: "#fef2f2", icon: <XCircle size={10} /> },
}

export default function MasterDocumentsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [docs, setDocs]               = useState<Doc[]>([])
    const [loading, setLoading]         = useState(true)
    const [search, setSearch]           = useState("")
    const [typeFilter, setTypeFilter]   = useState("ALL")
    const [statusFilter, setStatusFilter] = useState("ALL")
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [previewUrl, setPreviewUrl]   = useState<string | null>(null)

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

    // Group by employee, apply filters per-doc
    type GroupedEmp = {
        id: string; employeeId: string; firstName: string; lastName: string
        branch: string; designation?: string; docs: Doc[]
    }
    const grouped: GroupedEmp[] = (() => {
        const map = new Map<string, GroupedEmp>()
        for (const doc of docs) {
            const matchType   = typeFilter   === "ALL" || doc.type   === typeFilter
            const matchStatus = statusFilter === "ALL" || doc.status === statusFilter
            if (!matchType || !matchStatus) continue
            const e = doc.employee
            if (!map.has(e.id)) {
                map.set(e.id, {
                    id: e.id, employeeId: e.employeeId,
                    firstName: e.firstName, lastName: e.lastName,
                    branch: e.branch.name, designation: e.designation,
                    docs: [],
                })
            }
            map.get(e.id)!.docs.push(doc)
        }
        return Array.from(map.values())
            .filter(emp => {
                if (!emp.docs.length) return false
                if (!search) return true
                const q = search.toLowerCase()
                return (
                    `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(q) ||
                    emp.employeeId.toLowerCase().includes(q) ||
                    emp.branch.toLowerCase().includes(q) ||
                    emp.docs.some(d => d.fileName.toLowerCase().includes(q))
                )
            })
            .sort((a, b) => a.firstName.localeCompare(b.firstName))
    })()

    // Summary counts
    const totalDocs      = docs.length
    const totalEmployees = new Set(docs.map(d => d.employee.id)).size
    const verified       = docs.filter(d => d.status === "VERIFIED").length
    const pending        = docs.filter(d => d.status === "PENDING").length

    const isAdmin = session?.user?.role === "ADMIN" ||
                    session?.user?.role === "HR_MANAGER" ||
                    session?.user?.role === "MANAGER"

    return (
        <div className="p-6 lg:p-7 max-w-screen-xl mx-auto">
            {/* Header */}
            <div className="mb-6 flex items-center gap-3">
                <div className="h-10 w-10 rounded-[10px] bg-[#e8f7f1] flex items-center justify-center shrink-0">
                    <FileText size={20} className="text-[#1a9e6e]" />
                </div>
                <div>
                    <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a18]">Document Management</h1>
                    <p className="text-[13px] text-[#6b6860]">All employee documents — grouped by employee and download option</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                    { label: "Employees",        value: totalEmployees, color: "#3b82f6", bg: "#eff6ff", icon: <Users size={16} /> },
                    { label: "Total Documents",  value: totalDocs,      color: "#1a9e6e", bg: "#e8f7f1", icon: <FileText size={16} /> },
                    { label: "Verified",         value: verified,       color: "#14532d", bg: "#dcfce7", icon: <CheckCircle2 size={16} /> },
                    { label: "Pending",          value: pending,        color: "#92400e", bg: "#fffbeb", icon: <Clock size={16} /> },
                ].map(s => (
                    <div key={s.label} className="bg-white border border-[#e8e6e1] rounded-[12px] p-4 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-[8px] flex items-center justify-center shrink-0"
                            style={{ background: s.bg, color: s.color }}>{s.icon}</div>
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
                        placeholder="Search employee name, ID, file…"
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
                <span className="text-[12px] text-[#9e9b95] ml-auto">{grouped.length} employees</span>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="animate-spin text-[#1a9e6e]" size={28} />
                </div>
            ) : grouped.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white border border-[#e8e6e1] rounded-[14px]">
                    <FileText size={36} className="text-[#c8c5bf]" />
                    <p className="text-[13px] text-[#9e9b95]">No documents found</p>
                </div>
            ) : (
                <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                    {/* Header */}
                    <div className="grid text-[10.5px] font-semibold text-[#9e9b95] uppercase tracking-wider px-5 py-3 bg-[#f9f8f5] border-b border-[#e8e6e1]"
                        style={{ gridTemplateColumns: "110px 180px 1fr 200px" }}>
                        <span>Emp ID</span>
                        <span>Employee Name</span>
                        <span>Document</span>
                        <span className="text-right">Actions</span>
                    </div>

                    {/* One row per employee */}
                    {grouped.map((emp, i) => (
                        <div
                            key={emp.id}
                            className="grid border-b border-[#f0efec] last:border-0 hover:bg-[#f7fdf9] transition-colors"
                            style={{
                                gridTemplateColumns: "110px 180px 1fr 200px",
                                background: i % 2 === 0 ? "#ffffff" : "#fafaf8",
                            }}
                        >
                            {/* Emp ID — vertically centered, spans all docs */}
                            <div className="flex items-start pt-3 px-5 pb-3">
                                <span className="font-mono text-[11px] text-[#6b6860] bg-[#f3f4f6] px-2 py-0.5 rounded whitespace-nowrap">
                                    {emp.employeeId}
                                </span>
                            </div>

                            {/* Employee Name — vertically centered */}
                            <div className="flex flex-col justify-start pt-3 px-2 pb-3">
                                <p className="text-[13px] font-semibold text-[#1a1a18] truncate">
                                    {emp.firstName} {emp.lastName}
                                </p>
                                <p className="text-[11px] text-[#9e9b95] truncate">{emp.branch}</p>
                            </div>

                            {/* Documents — stacked, one per line */}
                            <div className="flex flex-col divide-y divide-[#f0efec] border-l border-[#f0efec]">
                                {emp.docs.map(doc => {
                                    const typeConf = TYPE_CONFIG[doc.type] || TYPE_CONFIG.OTHER
                                    const statConf = STATUS_CONFIG[doc.status] || STATUS_CONFIG.PENDING
                                    return (
                                        <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5 min-h-[44px]">
                                            {/* Type badge */}
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                                                style={{ color: typeConf.color, background: typeConf.bg }}>
                                                {typeConf.label}
                                            </span>
                                            {/* File name */}
                                            <span className="text-[12px] text-[#1a1a18] truncate flex-1" title={doc.fileName}>
                                                {doc.fileName}
                                            </span>
                                            {/* Status */}
                                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                                                style={{ color: statConf.color, background: statConf.bg }}>
                                                {statConf.icon} {statConf.label}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Actions — stacked, aligned to each doc row */}
                            <div className="flex flex-col divide-y divide-[#f0efec] border-l border-[#f0efec]">
                                {emp.docs.map(doc => {
                                    const isImage = /\.(jpg|jpeg|png|webp)(\?|$)/i.test(doc.fileUrl)
                                    return (
                                        <div key={doc.id} className="flex items-center justify-end gap-1.5 px-4 py-2.5 min-h-[44px]">
                                            {/* View */}
                                            {isImage ? (
                                                <button onClick={() => setPreviewUrl(doc.fileUrl)}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] font-medium bg-[#eff6ff] text-[#1d4ed8] hover:bg-[#dbeafe] transition-colors">
                                                    <Eye size={11} /> View
                                                </button>
                                            ) : (
                                                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] font-medium bg-[#eff6ff] text-[#1d4ed8] hover:bg-[#dbeafe] transition-colors">
                                                    <Eye size={11} /> View
                                                </a>
                                            )}
                                            {/* Download */}
                                            <a href={doc.fileUrl} download={doc.fileName} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] font-medium bg-[#e8f7f1] text-[#1a9e6e] hover:bg-[#d1fae5] transition-colors">
                                                <Download size={11} /> Download
                                            </a>
                                            {/* Delete */}
                                            {isAdmin && (
                                                <button onClick={() => handleDelete(emp.id, doc.id)}
                                                    disabled={actionLoading === doc.id + "_delete"}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] font-medium bg-[#fef2f2] text-[#dc2626] hover:bg-[#fecaca] disabled:opacity-50 transition-colors">
                                                    {actionLoading === doc.id + "_delete"
                                                        ? <Loader2 size={11} className="animate-spin" />
                                                        : <Trash2 size={11} />}
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Image lightbox */}
            {previewUrl && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setPreviewUrl(null)}>
                    <div className="relative" onClick={e => e.stopPropagation()}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewUrl} alt="Preview"
                            className="max-w-[90vw] max-h-[85vh] rounded-xl object-contain" />
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
