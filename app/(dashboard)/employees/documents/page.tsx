"use client"
import { useState, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Search, Download, Trash2, Loader2, Eye, Upload, Users, FileText,
    CheckCircle2, AlertCircle, Filter, Clock, ShieldCheck, MoreVertical,
    ChevronLeft, ChevronRight, Info, X,
} from "lucide-react"
import { DocumentViewer } from "@/components/DocumentViewer"
import { can } from "@/lib/can"

// ─── Types ────────────────────────────────────────────────────────────────────
type Doc = {
    id: string; type: string; fileName: string
    // fileUrl is NOT shipped in the bulk list (base64 blobs were too heavy).
    // Present only on the synthesised profile-photo cell, otherwise fetched
    // on demand via GET /api/employees/[id]/documents/[docId].
    fileUrl?: string
    status: string; uploadedAt: string
    employee: {
        id: string; employeeId: string; firstName: string; lastName: string
        designation?: string; department?: { name: string } | null
        deployments?: { site: { name: string } }[]
    }
}

type Employee = {
    id: string; employeeId: string; firstName: string; lastName: string
    photo?: string | null
    designation?: string; department?: { name: string } | null
    deployments?: { site: { name: string } }[]
}

// ─── Document columns shown in the table ─────────────────────────────────────
const DOC_COLS = [
    { key: "AADHAAR",      label: "Aadhaar",      hint: "Aadhaar card (front & back)",   color: "#1d4ed8", bg: "#dbeafe" },
    { key: "PAN",          label: "PAN",          hint: "PAN card",                       color: "#b45309", bg: "#fef3c7" },
    { key: "PHOTO",        label: "Photo",        hint: "Passport-size photo",            color: "#15803d", bg: "#dcfce7" },
    { key: "OFFER_LETTER", label: "Agreement",    hint: "Offer letter / agreement",       color: "#9333ea", bg: "#f3e8ff" },
    { key: "BANK_DETAILS", label: "Bank Proof",   hint: "Passbook / cancelled cheque",    color: "#0369a1", bg: "#e0f2fe" },
    { key: "CERTIFICATE",  label: "Certificate",  hint: "Educational certificate",        color: "#0f766e", bg: "#ccfbf1" },
    { key: "RESUME",       label: "Resume",       hint: "Resume / CV",                    color: "#7c3aed", bg: "#ede9fe" },
    { key: "OTHER",        label: "Other",        hint: "Any other document",             color: "#6b7280", bg: "#f3f4f6" },
]

// Sentinel id for a PHOTO cell synthesised from the employee's profile photo
// (no real EmployeeDocument row). Delete is hidden for these.
const PROFILE_PHOTO_ID = "__profile_photo__"

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
    const [verifying, setVerifying] = useState(false)
    const [fetchingFile, setFetchingFile] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    const handleVerify = async () => {
        if (!doc || doc.id === PROFILE_PHOTO_ID) return
        setVerifying(true)
        try {
            const r = await fetch(`/api/employees/${empId}/documents/${doc.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "VERIFIED" }),
            })
            if (r.ok) { toast.success("Document verified"); onUploaded() }
            else toast.error("Verify failed")
        } catch { toast.error("Verify error") }
        finally { setVerifying(false) }
    }

    // The bulk list omits the base64 `fileUrl` for speed. Resolve it lazily the
    // first time the user views/downloads a document. Profile-photo cells carry
    // their url inline (no DB row), so those resolve instantly.
    const resolveFileUrl = async (): Promise<string | null> => {
        if (!doc) return null
        if (doc.fileUrl) return doc.fileUrl
        try {
            const r = await fetch(`/api/employees/${empId}/documents/${doc.id}`)
            if (!r.ok) { toast.error("Could not load file"); return null }
            const data = await r.json()
            return data.fileUrl ?? null
        } catch { toast.error("Could not load file"); return null }
    }

    const handleView = async () => {
        setFetchingFile(true)
        try {
            const url = await resolveFileUrl()
            if (url && doc) onView(url, doc.fileName)
        } finally { setFetchingFile(false) }
    }

    const handleDownload = async () => {
        setFetchingFile(true)
        try {
            const url = await resolveFileUrl()
            if (!url || !doc) return
            const a = document.createElement("a")
            a.href = url
            a.download = doc.fileName
            document.body.appendChild(a)
            a.click()
            a.remove()
        } finally { setFetchingFile(false) }
    }

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
            <div className="flex flex-col items-start gap-2 px-3 py-3 min-h-[60px]">
                <span className="text-[11px] font-semibold text-[#dc2626] bg-[#fef2f2] px-2.5 py-1 rounded-full">Not Uploaded</span>
                {isAdmin && (
                    <>
                        <button onClick={() => fileRef.current?.click()} disabled={uploading}
                            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#15803d] hover:underline disabled:opacity-50">
                            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload
                        </button>
                        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleUpload} />
                    </>
                )}
            </div>
        )
    }

    // ── Uploaded ──────────────────────────────────────────────────────────────
    const isVerified = doc.status === "VERIFIED"
    const isRejected = doc.status === "REJECTED"
    const badge = isVerified
        ? { label: "Verified", color: "#15803d", bg: "#dcfce7" }
        : isRejected
            ? { label: "Rejected", color: "#dc2626", bg: "#fef2f2" }
            : { label: "Pending", color: "#b45309", bg: "#fef3c7" }

    return (
        <div className="flex flex-col items-start gap-2 px-3 py-3 min-h-[60px]">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: badge.color, background: badge.bg }}>
                {badge.label}
            </span>
            <div className="flex items-center gap-3 flex-wrap">
                {/* Verify link for pending docs */}
                {isAdmin && !isVerified && doc.id !== PROFILE_PHOTO_ID && (
                    <button onClick={handleVerify} disabled={verifying}
                        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#2563eb] hover:underline disabled:opacity-50">
                        {verifying ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />} Verify
                    </button>
                )}
                <button onClick={handleView} disabled={fetchingFile}
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#2563eb] hover:underline disabled:opacity-50">
                    {fetchingFile ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} View
                </button>
                <button onClick={handleDownload} disabled={fetchingFile}
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#15803d] hover:underline disabled:opacity-50">
                    <Download size={12} /> Download
                </button>
                {isAdmin && doc.id !== PROFILE_PHOTO_ID && (
                    <button onClick={handleDelete} disabled={deleting}
                        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#dc2626] hover:underline disabled:opacity-50">
                        {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                )}
            </div>
        </div>
    )
}

// ─── Pagination arrow button ─────────────────────────────────────────────────
function PageBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button onClick={onClick} disabled={disabled}
            className="w-[34px] h-[34px] rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)] flex items-center justify-center"
            style={{ opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer" }}>
            {children}
        </button>
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
    const [statusFilter, setStatusFilter] = useState("ALL") // ALL | COMPLETE | MISSING | PENDING
    const [docTypeFilter, setDocTypeFilter] = useState("ALL")
    const [page, setPage] = useState(1)
    const [perPage, setPerPage] = useState(25)
    const [viewer, setViewer]       = useState<{ url: string; name: string } | null>(null)

    useEffect(() => { setPage(1) }, [search, siteFilter, statusFilter, docTypeFilter, perPage])

    useEffect(() => { if (status === "unauthenticated") router.push("/login") }, [status, router])

    const fetchAll = async () => {
        setLoading(true)
        try {
            const [eRes, dRes] = await Promise.all([
                fetch("/api/employees?pageSize=500"),
                fetch("/api/employees/all-documents"),
            ])
            if (eRes.ok) {
                const data = await eRes.json()
                setEmployees(Array.isArray(data) ? data : (data.employees ?? []))
            }
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
    // A doc "exists" if there's an EmployeeDocument row — or, for PHOTO, if the
    // employee simply has a profile photo set (onboarding/modal upload path).
    const hasDoc = (emp: Employee, key: string) =>
        !!docMap.get(emp.id)?.has(key) || (key === "PHOTO" && !!emp.photo)
    const allPresent = employees.filter(e => DOC_COLS.every(c => hasDoc(e, c.key))).length
    const missingAny = totalEmployees - allPresent
    // Employees with at least one uploaded document still awaiting verification.
    const verificationPending = employees.filter(e => {
        const m = docMap.get(e.id)
        return m && Array.from(m.values()).some(d => d.status === "PENDING")
    }).length
    const pctOf = (n: number) => totalEmployees > 0 ? `${((n / totalEmployees) * 100).toFixed(1)}%` : "0%"

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
            if (!DOC_COLS.every(c => hasDoc(emp, c.key))) return false
        }
        if (statusFilter === "MISSING") {
            if (DOC_COLS.every(c => hasDoc(emp, c.key))) return false
        }
        if (statusFilter === "PENDING") {
            const m = docMap.get(emp.id)
            if (!m || !Array.from(m.values()).some(d => d.status === "PENDING")) return false
        }
        return true
    })

    // Which doc columns to show — "All" shows every type, else just the one.
    const visibleCols = docTypeFilter === "ALL" ? DOC_COLS : DOC_COLS.filter(c => c.key === docTypeFilter)

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
    const safePage = Math.min(page, totalPages)
    const pageRows = filtered.slice((safePage - 1) * perPage, safePage * perPage)
    const anyFilter = search || siteFilter !== "ALL" || statusFilter !== "ALL" || docTypeFilter !== "ALL"

    // Upload/manage rights are permission-driven: ADMIN, or any custom role that
    // has been granted "Upload Documents". Base roles get nothing implicitly.
    const isAdmin = can(session, "documents.upload")

    return (
        <div className="p-4 lg:p-6 max-w-full mx-auto flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-[24px] font-bold text-[var(--text)] tracking-[-0.4px]">Document Management</h1>
                    <p className="text-[13px] text-[var(--text3)] mt-1">Manage, upload and verify all employee documents in one place.</p>
                </div>
                <div className="flex items-center gap-2.5">
                    <button className="flex items-center gap-2 h-[42px] px-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                        <Download size={16} /> Export
                    </button>
                    {isAdmin && (
                        <button onClick={() => toast.info("Use the per-document Upload buttons in each employee's row.")}
                            className="flex items-center gap-2 h-[42px] px-5 rounded-[10px] bg-[var(--accent,#1a9e6e)] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
                            style={{ boxShadow: "0 1px 3px rgba(26,158,110,0.35)" }}>
                            <Upload size={16} /> Upload Documents
                        </button>
                    )}
                </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                    { label: "Total Employees",      value: totalEmployees,       sub: "100%",              color: "#3b82f6", bg: "#eff6ff", icon: Users },
                    { label: "Total Documents",      value: totalDocs,            sub: "100%",              color: "#1a9e6e", bg: "#e8f7f1", icon: FileText },
                    { label: "All Docs Present",     value: allPresent,           sub: pctOf(allPresent),   color: "#15803d", bg: "#dcfce7", icon: CheckCircle2 },
                    { label: "Missing Docs",         value: missingAny,           sub: pctOf(missingAny),   color: "#dc2626", bg: "#fef2f2", icon: AlertCircle },
                    { label: "Verification Pending", value: verificationPending,  sub: pctOf(verificationPending), color: "#d97706", bg: "#fef3c7", icon: Clock },
                ].map(s => (
                    <div key={s.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-4 flex items-center gap-3">
                        <div className="h-11 w-11 rounded-[12px] flex items-center justify-center shrink-0" style={{ background: s.bg }}>
                            <s.icon size={20} style={{ color: s.color }} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[12px] text-[var(--text3)] whitespace-nowrap">{s.label}</p>
                            <p className="text-[24px] font-bold leading-tight tabular-nums" style={{ color: s.color }}>{s.value}</p>
                            <p className="text-[11px] text-[var(--text3)]">{s.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2.5 items-center">
                <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text3)]" />
                    <input placeholder="Search by employee name or ID..."
                        className="w-full h-10 pl-9 pr-3 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] text-[13px] placeholder:text-[var(--text3)] outline-none focus:border-[var(--accent)]"
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
                    className="h-10 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] text-[13px] text-[var(--text2)] outline-none cursor-pointer">
                    {sites.map(s => <option key={s} value={s}>{s === "ALL" ? "All Sites" : s}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="h-10 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] text-[13px] text-[var(--text2)] outline-none cursor-pointer">
                    <option value="ALL">All Status</option>
                    <option value="COMPLETE">All Docs Present</option>
                    <option value="MISSING">Missing Docs</option>
                    <option value="PENDING">Verification Pending</option>
                </select>
                <select value={docTypeFilter} onChange={e => setDocTypeFilter(e.target.value)}
                    className="h-10 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] text-[13px] text-[var(--text2)] outline-none cursor-pointer">
                    <option value="ALL">All Document Types</option>
                    {DOC_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                {anyFilter && (
                    <button onClick={() => { setSearch(""); setSiteFilter("ALL"); setStatusFilter("ALL"); setDocTypeFilter("ALL") }}
                        className="h-10 px-3 rounded-[10px] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] flex items-center gap-1.5">
                        <X size={14} /> Clear
                    </button>
                )}
                <span className="text-[12.5px] text-[var(--text3)] ml-auto flex items-center gap-1.5 whitespace-nowrap">
                    <Users size={14} /> {filtered.length} employees
                </span>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="animate-spin text-[var(--accent)]" size={26} />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-[14px]">
                    <FileText size={32} className="text-[var(--text3)]" />
                    <p className="text-[13px] text-[var(--text3)]">No employees found</p>
                </div>
            ) : (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[12.5px]" style={{ minWidth: 300 + visibleCols.length * 140 }}>
                            <thead>
                                <tr className="border-b border-[var(--border)]">
                                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] whitespace-nowrap">Employee</th>
                                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] whitespace-nowrap">Site</th>
                                    {visibleCols.map(col => (
                                        <th key={col.key} className="text-left px-3 py-3 text-[11px] font-semibold whitespace-nowrap" style={{ color: col.color }}>
                                            <span className="inline-flex items-center gap-1" title={col.hint}>{col.label}<Info size={11} className="opacity-50" /></span>
                                        </th>
                                    ))}
                                    <th className="w-10" />
                                </tr>
                            </thead>
                            <tbody>
                                {pageRows.map(emp => {
                                    const empDocs = docMap.get(emp.id)
                                    const ac      = avatarColor(emp.firstName)
                                    return (
                                        <tr key={emp.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface2)] transition-colors">
                                            {/* Employee */}
                                            <td className="px-4 py-3 align-middle">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono text-[10.5px] text-[var(--text3)] bg-[var(--surface2)] px-2 py-1 rounded-md whitespace-nowrap">{emp.employeeId}</span>
                                                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                                                        style={{ background: ac, position: "relative", overflow: "hidden" }}>
                                                        {emp.firstName[0]}{emp.lastName[0]}
                                                        {emp.photo && (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img src={emp.photo} alt=""
                                                                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                                                                onError={e => (e.currentTarget.style.display = "none")} />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-[var(--text)] whitespace-nowrap text-[13px]">{emp.firstName} {emp.lastName}</p>
                                                        {emp.designation && <p className="text-[11px] text-[var(--text3)]">{emp.designation}</p>}
                                                    </div>
                                                </div>
                                            </td>
                                            {/* Site */}
                                            <td className="px-4 py-3 align-middle text-[12.5px] text-[var(--text2)] whitespace-nowrap">{emp.deployments?.[0]?.site?.name || "Unassigned"}</td>
                                            {/* Doc columns */}
                                            {visibleCols.map(col => {
                                                let doc = empDocs?.get(col.key)
                                                if (!doc && col.key === "PHOTO" && emp.photo) {
                                                    doc = {
                                                        id: PROFILE_PHOTO_ID, type: "PHOTO", fileName: "Profile photo",
                                                        fileUrl: emp.photo, status: "VERIFIED", uploadedAt: new Date().toISOString(),
                                                        employee: { id: emp.id, employeeId: emp.employeeId, firstName: emp.firstName, lastName: emp.lastName },
                                                    }
                                                }
                                                return (
                                                    <td key={col.key} className="align-middle border-l border-[var(--border)]">
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
                                            {/* Kebab */}
                                            <td className="px-2 align-middle border-l border-[var(--border)]">
                                                <button className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text3)] hover:bg-[var(--surface2)]" title="More">
                                                    <MoreVertical size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <span className="text-[12.5px] text-[var(--text3)]">
                                Showing {(safePage - 1) * perPage + 1} to {(safePage - 1) * perPage + pageRows.length} of {filtered.length} employees
                            </span>
                            <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}
                                className="h-9 px-3 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[12.5px] text-[var(--text2)] outline-none cursor-pointer">
                                {[25, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}
                            </select>
                        </div>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1.5">
                                <PageBtn disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={15} /></PageBtn>
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    const start = Math.max(1, Math.min(totalPages - 4, safePage - 2))
                                    const p = start + i
                                    if (p > totalPages) return null
                                    return (
                                        <button key={p} onClick={() => setPage(p)}
                                            className="min-w-[34px] h-[34px] rounded-[9px] text-[13px] font-semibold"
                                            style={{
                                                border: p === safePage ? "1px solid var(--accent)" : "1px solid var(--border)",
                                                background: p === safePage ? "var(--accent)" : "var(--surface)",
                                                color: p === safePage ? "#fff" : "var(--text2)",
                                            }}>{p}</button>
                                    )
                                })}
                                {totalPages > 5 && safePage < totalPages - 2 && <span className="text-[var(--text3)] px-1">…</span>}
                                {totalPages > 5 && safePage < totalPages - 2 && (
                                    <button onClick={() => setPage(totalPages)} className="min-w-[34px] h-[34px] rounded-[9px] text-[13px] font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)]">{totalPages}</button>
                                )}
                                <PageBtn disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}><ChevronRight size={15} /></PageBtn>
                            </div>
                        )}
                    </div>
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
