"use client"
import { useState, useEffect, useRef } from "react"
import { fetchAllEmployees } from "@/lib/fetch-all-employees"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Search, Download, Trash2, Loader2, Eye, Upload, Users, FileText,
    CheckCircle2, AlertCircle, Filter, Clock, ShieldCheck, MoreVertical,
    ChevronLeft, ChevronRight, Info, X,
} from "lucide-react"
import { DocumentViewer } from "@/components/DocumentViewer"
import { can, canAny } from "@/lib/can"
import { StatCard, statGridClass } from "@/components/StatCard"

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
const POLICIES_COL = "POLICIES"
const DOC_COLS = [
    { key: "AADHAAR",      label: "Aadhaar",      hint: "Aadhaar card (front & back)",   color: "#1d4ed8", bg: "#dbeafe" },
    { key: "PAN",          label: "PAN",          hint: "PAN card",                       color: "#b45309", bg: "#fef3c7" },
    { key: "PHOTO",        label: "Photo",        hint: "Passport-size photo",            color: "#15803d", bg: "#dcfce7" },
    { key: "OFFER_LETTER", label: "Agreement",    hint: "Offer letter / agreement",       color: "#9333ea", bg: "#f3e8ff" },
    { key: "BANK_DETAILS", label: "Bank Proof",   hint: "Passbook / cancelled cheque",    color: "#0369a1", bg: "#e0f2fe" },
    { key: "CERTIFICATE",  label: "Certificate",  hint: "Educational certificate",        color: "#0f766e", bg: "#ccfbf1" },
    // Not an upload: the employee's signed policies (Policies → sign-off),
    // shown only to roles with the Policies report permission.
    { key: POLICIES_COL,   label: "Policies",     hint: "Policies the employee must sign", color: "#be185d", bg: "#fce7f3" },
    { key: "RESUME",       label: "Resume",       hint: "Resume / CV",                    color: "#7c3aed", bg: "#ede9fe" },
    { key: "OTHER",        label: "Other",        hint: "Any other document",             color: "#6b7280", bg: "#f3f4f6" },
]

// What an employee file must hold to count as complete. Certificate, Resume,
// Agreement and "Any other document" are optional — counting them made 966 of
// 967 employees "missing docs", which hid the people who really lack KYC.
const REQUIRED_DOCS = ["AADHAAR", "PAN", "PHOTO", "BANK_DETAILS"]

// Sentinel id for a PHOTO cell synthesised from the employee's profile photo
// (no real EmployeeDocument row). Delete is hidden for these.
const PROFILE_PHOTO_ID = "__profile_photo__"

// ─── Helpers ─────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["#0b5cff","#3b82f6","#8b5cf6","#f59e0b","#ef4444","#06b6d4","#f97316"]
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

// ─── Policies cell ────────────────────────────────────────────────────────────
type PolicySignoff = { title: string; versionNo: number; signed: boolean; ackId: string | null; signedAt: string | null }

function PolicyCell({ list, loading }: { list: PolicySignoff[] | undefined; loading: boolean }) {
    if (loading) {
        return <div className="px-3 py-3 min-h-[60px] flex items-center"><Loader2 size={14} className="animate-spin text-[var(--text3)]" /></div>
    }
    if (!list?.length) {
        return (
            <div className="flex flex-col items-start gap-2 px-3 py-3 min-h-[60px]">
                <span className="text-[11px] font-semibold text-[var(--text3)] bg-[var(--surface2)] px-2.5 py-1 rounded-full">No policies</span>
            </div>
        )
    }
    const signed = list.filter(p => p.signed).length
    const badge = signed === list.length
        ? { label: "Signed", color: "#15803d", bg: "#dcfce7" }
        : signed === 0
            ? { label: "Not Signed", color: "#dc2626", bg: "#fef2f2" }
            : { label: `${signed} of ${list.length} Signed`, color: "#b45309", bg: "#fef3c7" }
    return (
        <div className="flex flex-col items-start gap-2 px-3 py-3 min-h-[60px] max-w-[240px]">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ color: badge.color, background: badge.bg }}>
                {badge.label}
            </span>
            {list.map(p => (
                <div key={p.title} className="flex flex-col gap-1 w-full">
                    <span className="text-[11.5px] text-[var(--text2)] truncate" title={`${p.title} (v${p.versionNo})`}>
                        {p.signed ? <CheckCircle2 size={11} className="inline mr-1 text-[#15803d]" /> : <Clock size={11} className="inline mr-1 text-[#b45309]" />}
                        {p.title}
                    </span>
                    {p.signed && p.ackId ? (
                        <div className="flex items-center gap-3">
                            <a href={`/api/policies/acks/${p.ackId}/pdf`} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#2563eb] hover:underline">
                                <Eye size={12} /> View
                            </a>
                            <a href={`/api/policies/acks/${p.ackId}/pdf`} download
                                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#15803d] hover:underline">
                                <Download size={12} /> Download
                            </a>
                        </div>
                    ) : (
                        <span className="text-[11px] text-[var(--text3)]">Not signed yet</span>
                    )}
                </div>
            ))}
        </div>
    )
}

// ─── Row menu (⋮) ────────────────────────────────────────────────────────────
const MIME_EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" }
const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "file"

/** A stored file (data: URL or storage link) as bytes plus a file extension. */
async function fileBytes(url: string, fallbackName: string): Promise<{ bytes: Uint8Array; ext: string }> {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const type = (r.headers.get("content-type") || "").split(";")[0].trim()
    const fromName = /\.([A-Za-z0-9]{2,5})$/.exec(fallbackName)?.[1]?.toLowerCase()
    return { bytes: new Uint8Array(await r.arrayBuffer()), ext: MIME_EXT[type] ?? fromName ?? "bin" }
}

function RowMenu({
    emp, docs, policies, canVerify, onChanged,
}: {
    emp: Employee
    /** Latest document per type (as shown in the row); the photo cell may be the profile photo. */
    docs: Doc[]
    policies: PolicySignoff[]
    canVerify: boolean
    onChanged: () => void
}) {
    const router = useRouter()
    const btnRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
    const [busy, setBusy] = useState<"" | "zip" | "verify">("")

    // The table scrolls sideways inside an overflow box, so the menu is fixed to
    // the viewport (an absolute menu was clipped) and closes on scroll / resize.
    useEffect(() => {
        if (!pos) return
        const close = (e: Event) => {
            if (e.type === "mousedown" && (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node))) return
            setPos(null)
        }
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPos(null) }
        document.addEventListener("mousedown", close)
        window.addEventListener("scroll", close, true)
        window.addEventListener("resize", close)
        document.addEventListener("keydown", esc)
        return () => {
            document.removeEventListener("mousedown", close)
            window.removeEventListener("scroll", close, true)
            window.removeEventListener("resize", close)
            document.removeEventListener("keydown", esc)
        }
    }, [pos])

    const toggle = () => {
        if (pos) { setPos(null); return }
        const r = btnRef.current!.getBoundingClientRect()
        const menuH = 150
        const top = r.bottom + 4 + menuH > window.innerHeight ? Math.max(8, r.top - 4 - menuH) : r.bottom + 4
        setPos({ top, right: window.innerWidth - r.right })
    }

    const signed = policies.filter(p => p.signed && p.ackId)
    const pending = docs.filter(d => d.status === "PENDING" && d.id !== PROFILE_PHOTO_ID)
    const fileCount = docs.length + signed.length
    const label = (type: string) => DOC_COLS.find(c => c.key === type)?.label ?? type

    // Every document in the row plus the signed policy PDFs, in one ZIP.
    const downloadAll = async () => {
        setPos(null)
        setBusy("zip")
        const t = toast.loading(`Preparing ${fileCount} file${fileCount === 1 ? "" : "s"}…`)
        try {
            const XLSX = await import("xlsx")
            const zip = XLSX.CFB.utils.cfb_new()
            const used = new Set<string>()
            const add = (base: string, ext: string, bytes: Uint8Array) => {
                let name = `${base}.${ext}`
                for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base}_${i}.${ext}`
                used.add(name.toLowerCase())
                XLSX.CFB.utils.cfb_add(zip, name, bytes)
            }
            const failed: string[] = []
            for (const d of docs) {
                try {
                    let url = d.fileUrl
                    if (!url) {
                        const r = await fetch(`/api/employees/${emp.id}/documents/${d.id}`)
                        url = r.ok ? (await r.json()).fileUrl : undefined
                    }
                    if (!url) throw new Error("no file")
                    const f = await fileBytes(url, d.fileName)
                    add(safeName(`${emp.employeeId}_${label(d.type)}`), f.ext, f.bytes)
                } catch { failed.push(label(d.type)) }
            }
            for (const p of signed) {
                try {
                    const f = await fileBytes(`/api/policies/acks/${p.ackId}/pdf`, "policy.pdf")
                    add(safeName(`${emp.employeeId}_Policy_${p.title}`), "pdf", f.bytes)
                } catch { failed.push(p.title) }
            }
            if (!used.size) { toast.error("Couldn't download any file", { id: t }); return }
            const out = new Uint8Array(XLSX.CFB.write(zip, { fileType: "zip", type: "array", compression: true }) as ArrayLike<number>)
            const href = URL.createObjectURL(new Blob([out], { type: "application/zip" }))
            const a = document.createElement("a")
            a.href = href
            a.download = `${safeName(`${emp.employeeId}_${emp.firstName}_${emp.lastName}`)}_documents.zip`
            document.body.appendChild(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(href), 10_000)
            if (failed.length) toast.warning(`Downloaded ${used.size} file${used.size === 1 ? "" : "s"}; couldn't fetch ${failed.join(", ")}`, { id: t })
            else toast.success(`Downloaded ${used.size} file${used.size === 1 ? "" : "s"}`, { id: t })
        } catch {
            toast.error("Download failed", { id: t })
        } finally { setBusy("") }
    }

    const verifyPending = async () => {
        setPos(null)
        setBusy("verify")
        let ok = 0
        try {
            for (const d of pending) {
                const r = await fetch(`/api/employees/${emp.id}/documents/${d.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "VERIFIED" }),
                }).catch(() => null)
                if (r?.ok) ok++
            }
            if (ok === pending.length) toast.success(`${ok} document${ok === 1 ? "" : "s"} verified`)
            else toast.error(`Verified ${ok} of ${pending.length} documents`)
            if (ok) onChanged()
        } finally { setBusy("") }
    }

    const item = "w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-[var(--text)] hover:bg-[var(--surface2)] disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
    return (
        <>
            <button ref={btnRef} onClick={toggle} disabled={!!busy} title="More" aria-haspopup="menu" aria-expanded={!!pos}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text3)] hover:bg-[var(--surface2)]"
                style={pos ? { background: "var(--surface2)", color: "var(--text)" } : undefined}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <MoreVertical size={16} />}
            </button>
            {pos && (
                <div ref={menuRef} role="menu"
                    className="fixed z-50 min-w-[230px] py-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-lg"
                    style={{ top: pos.top, right: pos.right }}>
                    <button role="menuitem" className={item} onClick={() => { setPos(null); router.push(`/employees?id=${emp.id}`) }}>
                        <Users size={14} className="text-[var(--text3)]" /> View employee profile
                    </button>
                    <button role="menuitem" className={item} disabled={!fileCount} onClick={downloadAll}>
                        <Download size={14} className="text-[var(--text3)]" />
                        {fileCount ? `Download all (${fileCount}) as ZIP` : "No files to download"}
                    </button>
                    {canVerify && (
                        <button role="menuitem" className={item} disabled={!pending.length} onClick={verifyPending}>
                            <ShieldCheck size={14} className="text-[var(--text3)]" />
                            {pending.length ? `Verify pending (${pending.length})` : "Nothing to verify"}
                        </button>
                    )}
                </div>
            )}
        </>
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
    // employee.id → their policy sign-offs; loaded apart from the documents so a
    // failure here never blanks the document grid.
    const [policies, setPolicies]   = useState<Record<string, PolicySignoff[]>>({})
    const [policiesLoading, setPoliciesLoading] = useState(false)
    // Same rule as the sign-off API: the Policies report permission (or manage).
    const canPolicies = canAny(session, ["policy.report", "policy.manage"])

    useEffect(() => { setPage(1) }, [search, siteFilter, statusFilter, docTypeFilter, perPage])

    useEffect(() => { if (status === "unauthenticated") router.push("/login") }, [status, router])

    const fetchPolicies = async () => {
        setPoliciesLoading(true)
        try {
            const r = await fetch("/api/policies/employee-status")
            if (r.ok) setPolicies((await r.json()).employees ?? {})
            else toast.error("Couldn't load policy sign-offs")
        } catch { toast.error("Couldn't load policy sign-offs") }
        finally { setPoliciesLoading(false) }
    }

    const fetchAll = async () => {
        setLoading(true)
        try {
            const [empAll, dRes] = await Promise.all([
                fetchAllEmployees<Employee>(),
                fetch("/api/employees/all-documents"),
            ])
            setEmployees(empAll.employees)
            if (dRes.ok) setDocs(await dRes.json())
        } catch { toast.error("Failed to load") }
        finally { setLoading(false) }
    }

    // Load once the session is ready, not before (that started a second load).
    useEffect(() => { if (status === "authenticated") fetchAll() }, [status]) // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (status === "authenticated" && canPolicies) fetchPolicies() }, [status, canPolicies]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // The PHOTO cell for an employee with a profile photo but no uploaded one.
    const profilePhotoDoc = (emp: Employee): Doc => ({
        id: PROFILE_PHOTO_ID, type: "PHOTO", fileName: "Profile photo",
        fileUrl: emp.photo ?? undefined, status: "VERIFIED", uploadedAt: new Date().toISOString(),
        employee: { id: emp.id, employeeId: emp.employeeId, firstName: emp.firstName, lastName: emp.lastName },
    })
    // What the row shows: the latest document of each type, plus the profile photo.
    const rowDocs = (emp: Employee): Doc[] => {
        const m = docMap.get(emp.id)
        const list = m ? Array.from(m.values()) : []
        if (!m?.has("PHOTO") && emp.photo) list.push(profilePhotoDoc(emp))
        return list
    }
    // A doc "exists" if there's an EmployeeDocument row — or, for PHOTO, if the
    // employee simply has a profile photo set (onboarding/modal upload path).
    const hasDoc = (emp: Employee, key: string) =>
        !!docMap.get(emp.id)?.has(key) || (key === "PHOTO" && !!emp.photo)
    const hasRequired = (emp: Employee) => REQUIRED_DOCS.every(k => hasDoc(emp, k))
    const allPresent = employees.filter(hasRequired).length
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
            if (!hasRequired(emp)) return false
        }
        if (statusFilter === "MISSING") {
            if (hasRequired(emp)) return false
        }
        if (statusFilter === "PENDING") {
            const m = docMap.get(emp.id)
            if (!m || !Array.from(m.values()).some(d => d.status === "PENDING")) return false
        }
        return true
    })

    // Which doc columns to show — "All" shows every type, else just the one.
    const docCols = canPolicies ? DOC_COLS : DOC_COLS.filter(c => c.key !== POLICIES_COL)
    const visibleCols = docTypeFilter === "ALL" ? docCols : docCols.filter(c => c.key === docTypeFilter)

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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-[24px] font-bold text-[var(--text)] tracking-[-0.4px]">Document Management</h1>
                    <p className="text-[13px] text-[var(--text3)] mt-1">Manage, upload and verify all employee documents in one place.</p>
                </div>
                <div className="page-actions">
                    <button className="flex items-center justify-center gap-2 h-[42px] px-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                        <Download size={16} /> Export
                    </button>
                    {isAdmin && (
                        <button onClick={() => toast.info("Use the per-document Upload buttons in each employee's row.")}
                            className="flex items-center justify-center gap-2 h-[42px] px-5 rounded-[10px] bg-[var(--accent,#0b5cff)] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
                            style={{ boxShadow: "0 1px 3px rgba(26,158,110,0.35)" }}>
                            <Upload size={16} /> Upload Documents
                        </button>
                    )}
                </div>
            </div>

            {/* KPI cards */}
            <div className={statGridClass(5)}>
                {/* "…" while loading — a slow load used to read as "0 employees". */}
                <StatCard label="Total Employees" value={loading ? "…" : totalEmployees} sub="100%" tone="blue" icon={<Users size={20} />} seed={0} />
                <StatCard label="Total Documents" value={loading ? "…" : totalDocs} sub="100%" tone="violet" icon={<FileText size={20} />} seed={1} />
                <StatCard label="Required Docs Present" value={loading ? "…" : allPresent} sub={loading ? "Aadhaar, PAN, Photo, Bank" : pctOf(allPresent)} tone="teal" icon={<CheckCircle2 size={20} />} seed={2} />
                <StatCard label="Missing Required Docs" value={loading ? "…" : missingAny} sub={loading ? undefined : pctOf(missingAny)} tone="rose" icon={<AlertCircle size={20} />} seed={3} />
                <StatCard label="Verification Pending" value={loading ? "…" : verificationPending} sub={loading ? undefined : pctOf(verificationPending)} tone="amber" icon={<Clock size={20} />} seed={4} />
            </div>

            {/* Filters */}
            <div className="filter-bar sm:gap-2.5">
                <div className="filter-search relative flex-1 sm:min-w-[200px] sm:max-w-[320px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text3)]" />
                    <input placeholder="Search by employee name or ID..."
                        className="w-full h-10 pl-9 pr-3 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] text-[13px] placeholder:text-[var(--text3)] outline-none focus:border-[var(--accent)]"
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
                    className="w-full sm:w-auto h-10 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] text-[13px] text-[var(--text2)] outline-none cursor-pointer">
                    {sites.map(s => <option key={s} value={s}>{s === "ALL" ? "All Sites" : s}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="w-full sm:w-auto h-10 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] text-[13px] text-[var(--text2)] outline-none cursor-pointer">
                    <option value="ALL">All Status</option>
                    <option value="COMPLETE">Required Docs Present</option>
                    <option value="MISSING">Missing Required Docs</option>
                    <option value="PENDING">Verification Pending</option>
                </select>
                <select value={docTypeFilter} onChange={e => setDocTypeFilter(e.target.value)}
                    className="w-full sm:w-auto h-10 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] text-[13px] text-[var(--text2)] outline-none cursor-pointer">
                    <option value="ALL">All Document Types</option>
                    {docCols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                {anyFilter && (
                    <button onClick={() => { setSearch(""); setSiteFilter("ALL"); setStatusFilter("ALL"); setDocTypeFilter("ALL") }}
                        className="h-10 px-3 rounded-[10px] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] flex items-center justify-center gap-1.5">
                        <X size={14} /> Clear
                    </button>
                )}
                <span className="filter-full text-[12.5px] text-[var(--text3)] ml-auto flex items-center justify-end gap-1.5 whitespace-nowrap">
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
                                                if (!doc && col.key === "PHOTO" && emp.photo) doc = profilePhotoDoc(emp)
                                                if (col.key === POLICIES_COL) return (
                                                    <td key={col.key} className="align-middle border-l border-[var(--border)]">
                                                        <PolicyCell list={policies[emp.id]} loading={policiesLoading} />
                                                    </td>
                                                )
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
                                                <RowMenu
                                                    emp={emp}
                                                    docs={rowDocs(emp)}
                                                    policies={canPolicies ? policies[emp.id] ?? [] : []}
                                                    canVerify={can(session, "documents.verify")}
                                                    onChanged={fetchAll}
                                                />
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
