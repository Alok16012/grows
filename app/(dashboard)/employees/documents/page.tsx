"use client"
import { useState, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Search, Download, Trash2, Loader2, Eye, Upload, Users, FileText, CheckCircle2, AlertCircle, Filter } from "lucide-react"
import { DocumentViewer } from "@/components/DocumentViewer"

// ─── Types ────────────────────────────────────────────────────────────────────
type Doc = {
    id: string; type: string; fileName: string; fileUrl: string
    status: string; uploadedAt: string
    employee: {
        id: string; employeeId: string; firstName: string; lastName: string
        designation?: string; department?: { name: string } | null
        deployments?: { site: { name: string } }[]
    }
}

type Employee = {
    id: string; employeeId: string; firstName: string; lastName: string
    designation?: string; department?: { name: string } | null
    deployments?: { site: { name: string } }[]
}

// ─── Document columns shown in the table ─────────────────────────────────────
const DOC_COLS = [
    { key: "AADHAAR",      label: "Aadhaar",      color: "#1d4ed8", bg: "#dbeafe" },
    { key: "PAN",          label: "PAN",          color: "#b45309", bg: "#fef3c7" },
    { key: "PHOTO",        label: "Photo",        color: "#15803d", bg: "#dcfce7" },
    { key: "BANK_DETAILS", label: "Bank Details", color: "#0369a1", bg: "#e0f2fe" },
    { key: "CERTIFICATE",  label: "Certificate",  color: "#0f766e", bg: "#ccfbf1" },
    { key: "RESUME",       label: "Resume",       color: "#7c3aed", bg: "#ede9fe" },
    { key: "OFFER_LETTER", label: "Offer Letter", color: "#9333ea", bg: "#f3e8ff" },
    { key: "OTHER",        label: "Other",        color: "#6b7280", bg: "#f3f4f6" },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["#1a9e6e","#3b82f6","#8b5cf6","#f59e0b","#ef4444","#06b6d4","#f97316"]
function avatarColor(name: string) {
    return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

// ─── Doc Cell ─────────────────────────────────────────────────────────────────
function DocCell({
    doc, empId, docType, onView, onDelete, onUploaded, isAdmin,
}: {
    doc: Doc | undefined; empId: string; docType: string
    onView: (url: string, name: string) => void
    onDelete: (empId: string, docId: string) => void
    onUploaded: () => void
    isAdmin: boolean
}) {
    const [uploading, setUploading] = useState(false)
    const [deleting, setDeleting]   = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    const handleUpload = async (ev: React.ChangeEvent<HTMLInputElement>) => {
        const file = ev.target.files?.[0]
        if (!file) return
        if (file.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return }
        setUploading(true)
        try {
            const url = await new Promise<string>((res, rej) => {
                const r = new FileReader()
                r.onload = () => res(r.result as string)
                r.onerror = rej
                r.readAsDataURL(file)
            })
            const resp = await fetch(`/api/employees/${empId}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: docType, fileName: file.name, fileUrl: url }),
            })
            if (resp.ok) { toast.success("Uploaded!"); onUploaded() }
            else toast.error("Upload failed")
        } catch { toast.error("Upload error") }
        finally { setUploading(false); if (fileRef.current) fileRef.current.value = "" }
    }

    const handleDelete = async () => {
        if (!doc) return
        if (!confirm("Delete this document?")) return
        setDeleting(true)
        try {
            const r = await fetch(`/api/employees/${empId}/documents/${doc.id}`, { method: "DELETE" })
            if (r.ok) { toast.success("Deleted"); onDelete(empId, doc.id) }
            else toast.error("Delete failed")
        } catch { toast.error("Delete error") }
        finally { setDeleting(false) }
    }

    // ── Not uploaded ──────────────────────────────────────────────────────────
    if (!doc) {
        return (
            <div className="flex flex-col items-center justify-center gap-1.5 h-full min-h-[64px] px-2">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                    <AlertCircle size={9} /> Not Uploaded
                </div>
                {isAdmin && (
                    <>
                        <button
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-[4px] bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
                        >
                            {uploading ? <Loader2 size={9} className="animate-spin" /> : <Upload size={9} />}
                            Upload
                        </button>
                        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleUpload} />
                    </>
                )}
            </div>
        )
    }

    // ── Uploaded ──────────────────────────────────────────────────────────────
    const statusColor = doc.status === "VERIFIED" ? "#14532d" : doc.status === "REJECTED" ? "#991b1b" : "#92400e"
    const statusBg    = doc.status === "VERIFIED" ? "#dcfce7" : doc.status === "REJECTED" ? "#fef2f2" : "#fffbeb"

    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 min-h-[64px]">
            {/* filename + status */}
            <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: statusColor, background: statusBg }}>
                    {doc.status === "VERIFIED" ? "✓" : doc.status === "REJECTED" ? "✗" : "●"} {doc.status}
                </span>
            </div>
            <p className="text-[11px] text-[#1a1a18] truncate max-w-[120px]" title={doc.fileName}>{doc.fileName}</p>
            {/* actions */}
            <div className="flex items-center gap-1 flex-wrap mt-0.5">
                <button onClick={() => onView(doc.fileUrl, doc.fileName)}
                    className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] bg-blue-50 text-blue-600 hover:bg-blue-100">
                    <Eye size={9} /> View
                </button>
                <a href={doc.fileUrl} download={doc.fileName}
                    className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] bg-green-50 text-green-700 hover:bg-green-100">
                    <Download size={9} /> Download
                </a>
                {isAdmin && (
                    <button onClick={handleDelete} disabled={deleting}
                        className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">
                        {deleting ? <Loader2 size={9} className="animate-spin" /> : <Trash2 size={9} />} Delete
                    </button>
                )}
            </div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MasterDocumentsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [employees, setEmployees] = useState<Employee[]>([])
    const [docs, setDocs]           = useState<Doc[]>([])
    const [loading, setLoading]     = useState(true)
    const [search, setSearch]       = useState("")
    const [siteFilter, setSiteFilter] = useState("ALL")
    const [statusFilter, setStatusFilter] = useState("ALL") // ALL | COMPLETE | MISSING
    const [viewer, setViewer]       = useState<{ url: string; name: string } | null>(null)

    useEffect(() => { if (status === "unauthenticated") router.push("/login") }, [status, router])

    const fetchAll = async () => {
        setLoading(true)
        try {
            const [eRes, dRes] = await Promise.all([
                fetch("/api/employees"),
                fetch("/api/employees/all-documents"),
            ])
            if (eRes.ok) setEmployees(await eRes.json())
            if (dRes.ok) setDocs(await dRes.json())
        } catch { toast.error("Failed to load") }
        finally { setLoading(false) }
    }

    useEffect(() => { fetchAll() }, [])

    const handleDeleteLocal = (empId: string, docId: string) => {
        setDocs(prev => prev.filter(d => d.id !== docId))
    }

    // Build doc map: empId → { docType → Doc }
    const docMap = new Map<string, Map<string, Doc>>()
    for (const doc of docs) {
        const eid = doc.employee.id
        if (!docMap.has(eid)) docMap.set(eid, new Map())
        // Keep latest per type
        const existing = docMap.get(eid)!.get(doc.type)
        if (!existing || new Date(doc.uploadedAt) > new Date(existing.uploadedAt)) {
            docMap.get(eid)!.set(doc.type, doc)
        }
    }

    // Unique sites for filter
    const sites = ["ALL", ...Array.from(new Set(employees.map(e => e.deployments?.[0]?.site?.name).filter(Boolean) as string[])).sort()]

    // Summary
    const totalEmployees = employees.length
    const totalDocs = docs.length
    const fullyVerified = employees.filter(e => {
        const empDocs = docMap.get(e.id)
        return empDocs && DOC_COLS.every(c => empDocs.has(c.key))
    }).length
    const missingAny = totalEmployees - fullyVerified

    // Filtered rows
    const filtered = employees.filter(emp => {
        const siteName = emp.deployments?.[0]?.site?.name || "Unassigned"
        if (siteFilter !== "ALL" && siteName !== siteFilter) return false
        if (search) {
            const q = search.toLowerCase()
            if (!`${emp.firstName} ${emp.lastName}`.toLowerCase().includes(q) &&
                !emp.employeeId.toLowerCase().includes(q) &&
                !siteName.toLowerCase().includes(q)) return false
        }
        if (statusFilter === "COMPLETE") {
            const empDocs = docMap.get(emp.id)
            if (!empDocs || !DOC_COLS.every(c => empDocs.has(c.key))) return false
        }
        if (statusFilter === "MISSING") {
            const empDocs = docMap.get(emp.id)
            if (empDocs && DOC_COLS.every(c => empDocs.has(c.key))) return false
        }
        return true
    })

    const isAdmin = ["ADMIN", "MANAGER", "HR_MANAGER"].includes(session?.user?.role || "")

    return (
        <div className="p-4 lg:p-6 max-w-full mx-auto">
            {/* Header */}
            <div className="mb-5 flex items-center gap-3">
                <div className="h-10 w-10 rounded-[10px] bg-[#e8f7f1] flex items-center justify-center shrink-0">
                    <FileText size={20} className="text-[#1a9e6e]" />
                </div>
                <div>
                    <h1 className="text-[20px] font-semibold text-[#1a1a18]">Document Management</h1>
                    <p className="text-[12px] text-[#6b6860]">All employee documents — manage, upload and verify</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {[
                    { label: "Total Employees", value: totalEmployees, color: "#3b82f6", bg: "#eff6ff",  icon: <Users size={15} /> },
                    { label: "Total Documents", value: totalDocs,      color: "#1a9e6e", bg: "#e8f7f1",  icon: <FileText size={15} /> },
                    { label: "All Docs Present", value: fullyVerified,  color: "#14532d", bg: "#dcfce7",  icon: <CheckCircle2 size={15} /> },
                    { label: "Missing Docs",     value: missingAny,     color: "#dc2626", bg: "#fef2f2",  icon: <AlertCircle size={15} /> },
                ].map(s => (
                    <div key={s.label} className="bg-white border border-[#e8e6e1] rounded-[12px] p-3 flex items-center gap-3">
                        <div className="h-8 w-8 rounded-[7px] flex items-center justify-center shrink-0" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
                        <div>
                            <p className="text-[10px] text-[#6b6860]">{s.label}</p>
                            <p className="text-[18px] font-bold leading-tight" style={{ color: s.color }}>{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-4 items-center">
                <div className="relative flex-1 min-w-[180px] max-w-[300px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[13px] w-[13px] text-[#9e9b95]" />
                    <input placeholder="Search employee, ID…"
                        className="w-full pl-8 pr-3 py-2 bg-white border border-[#e8e6e1] rounded-[8px] text-[12px] placeholder:text-[#9e9b95] outline-none focus:border-[#1a9e6e]"
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
                    className="px-3 py-2 bg-white border border-[#e8e6e1] rounded-[8px] text-[12px] text-[#6b6860] outline-none cursor-pointer">
                    {sites.map(s => <option key={s} value={s}>{s === "ALL" ? "All Sites" : s}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-white border border-[#e8e6e1] rounded-[8px] text-[12px] text-[#6b6860] outline-none cursor-pointer">
                    <option value="ALL">All Status</option>
                    <option value="COMPLETE">All Docs Present</option>
                    <option value="MISSING">Missing Docs</option>
                </select>
                <span className="text-[11px] text-[#9e9b95] ml-auto flex items-center gap-1">
                    <Filter size={11} /> {filtered.length} employees
                </span>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="animate-spin text-[#1a9e6e]" size={26} />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3 bg-white border border-[#e8e6e1] rounded-[14px]">
                    <FileText size={32} className="text-[#c8c5bf]" />
                    <p className="text-[13px] text-[#9e9b95]">No employees found</p>
                </div>
            ) : (
                <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-x-auto">
                    <table className="w-full min-w-[900px] border-collapse text-[12px]">
                        <thead>
                            <tr className="bg-[#f9f8f5] border-b border-[#e8e6e1]">
                                <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#9e9b95] uppercase tracking-wider w-[100px]">Emp ID</th>
                                <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#9e9b95] uppercase tracking-wider w-[160px]">Employee Name</th>
                                <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#9e9b95] uppercase tracking-wider w-[100px]">Site</th>
                                {DOC_COLS.map(col => (
                                    <th key={col.key} className="text-center px-2 py-3 text-[10px] font-semibold uppercase tracking-wider min-w-[130px]"
                                        style={{ color: col.color }}>
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((emp, i) => {
                                const empDocs = docMap.get(emp.id)
                                const hasAll  = empDocs && DOC_COLS.every(c => empDocs.has(c.key))
                                const ac      = avatarColor(emp.firstName)
                                return (
                                    <tr key={emp.id}
                                        className={`border-b border-[#f0efec] last:border-0 ${i % 2 === 0 ? "bg-white" : "bg-[#fafaf8]"} hover:bg-[#f7fdf9] transition-colors`}>
                                        {/* Emp ID */}
                                        <td className="px-4 py-2 align-top pt-3">
                                            <span className="font-mono text-[11px] text-[#6b6860] bg-[#f3f4f6] px-2 py-0.5 rounded whitespace-nowrap">
                                                {emp.employeeId}
                                            </span>
                                        </td>
                                        {/* Name */}
                                        <td className="px-4 py-2 align-top pt-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                                    style={{ background: ac }}>
                                                    {emp.firstName[0]}{emp.lastName[0]}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-[#1a1a18] whitespace-nowrap">{emp.firstName} {emp.lastName}</p>
                                                    {emp.designation && <p className="text-[10px] text-[#9e9b95]">{emp.designation}</p>}
                                                </div>
                                            </div>
                                        </td>
                                        {/* Site */}
                                        <td className="px-4 py-2 align-top pt-3 text-[11px] text-[#6b6860] whitespace-nowrap">{emp.deployments?.[0]?.site?.name || "Unassigned"}</td>
                                        {/* Doc columns */}
                                        {DOC_COLS.map(col => {
                                            const doc = empDocs?.get(col.key)
                                            return (
                                                <td key={col.key}
                                                    className={`px-1 py-1 align-top border-l border-[#f0efec] ${doc ? "bg-[#f0fdf4]/40" : "bg-[#fff5f5]/60"}`}>
                                                    <DocCell
                                                        doc={doc}
                                                        empId={emp.id}
                                                        docType={col.key}
                                                        onView={(url, name) => setViewer({ url, name })}
                                                        onDelete={handleDeleteLocal}
                                                        onUploaded={fetchAll}
                                                        isAdmin={isAdmin}
                                                    />
                                                </td>
                                            )
                                        })}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Document Viewer */}
            <DocumentViewer
                url={viewer?.url ?? null}
                fileName={viewer?.name}
                onClose={() => setViewer(null)}
            />
        </div>
    )
}
