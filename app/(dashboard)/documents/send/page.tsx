"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Send, Loader2, FileText, Download, Users, UserCheck, Globe, Search, Eye, X, Undo2, RotateCcw, History, PenLine, Trash2, Lock, Play, ArrowRight, FileStack, ChevronDown } from "lucide-react"
import { can, canAny } from "@/lib/can"

type DocType = { id: string; name: string; requiresApproval: boolean; templateContent?: string }

type HistoryEvent = { action: string; by: string; byName: string; at: string; reason?: string }

const TEMPLATE_VARS = [
    "{{employee_name}}", "{{employee_id}}", "{{designation}}", "{{department}}",
    "{{joining_date}}", "{{effective_date}}", "{{salary}}", "{{company_name}}", "{{date}}",
]
type Role = { id: string; name: string; color?: string }
type Emp = {
    id: string; firstName: string; lastName: string | null; employeeId: string; designation: string | null
    user?: { customRole?: { id: string; name: string } | null } | null
}
type IssuedDoc = {
    id: string; docNumber: string; status: string; issuedAt: string | null; createdAt: string
    sentByName?: string | null
    recalledByName?: string | null
    recalledAt?: string | null
    recallReason?: string | null
    recallCount?: number | null
    history?: HistoryEvent[] | null
    employee: { firstName: string; lastName: string; employeeId: string }
    type: { name: string }
}

const fmtDate = (s: string | null | undefined) =>
    s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"

type Scope = "role" | "employees" | "all"

export default function SendDocumentsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [docTypes, setDocTypes] = useState<DocType[]>([])
    const [roles, setRoles] = useState<Role[]>([])
    const [employees, setEmployees] = useState<Emp[]>([])
    const [issued, setIssued] = useState<IssuedDoc[]>([])
    const [loading, setLoading] = useState(true)

    const [typeId, setTypeId] = useState("")
    const [scope, setScope] = useState<Scope>("role")
    const [roleId, setRoleId] = useState("")
    const [selectedEmp, setSelectedEmp] = useState<Set<string>>(new Set())
    const [empSearch, setEmpSearch] = useState("")
    const [effectiveDate, setEffectiveDate] = useState("")
    const [remarks, setRemarks] = useState("")
    const [sending, setSending] = useState(false)

    const [template, setTemplate] = useState("")
    const [previewOpen, setPreviewOpen] = useState(false)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [previewContent, setPreviewContent] = useState("")
    const [previewSample, setPreviewSample] = useState<string | null>(null)

    // The sender's personal signature — saved ("locked") once, then stamped on
    // every document they issue. Each sender has their own.
    const [signature, setSignature] = useState<string | null>(null)
    const [sigBusy, setSigBusy] = useState(false)

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        if (status === "authenticated" && !canAny(session, ["documents.send", "documents.view"])) router.push("/")
    }, [status, session, router])

    const fetchIssued = useCallback(async () => {
        try {
            const r = await fetch("/api/hr-documents")
            if (r.ok) setIssued(await r.json())
        } catch { /* ignore */ }
    }, [])

    useEffect(() => {
        (async () => {
            setLoading(true)
            try {
                const [t, ro, e] = await Promise.all([
                    fetch("/api/hr-documents/types").then(r => r.ok ? r.json() : []),
                    fetch("/api/admin/roles").then(r => r.ok ? r.json() : []),
                    fetch("/api/employees?pageSize=1000").then(r => r.ok ? r.json() : { employees: [] }),
                ])
                setDocTypes(t)
                setRoles(ro)
                setEmployees(e.employees || [])
                await fetchIssued()
            } finally {
                setLoading(false)
            }
        })()
    }, [fetchIssued])

    // Load my saved signature once.
    useEffect(() => {
        fetch("/api/me/signature")
            .then(r => (r.ok ? r.json() : null))
            .then(d => setSignature(d?.signature ?? null))
            .catch(() => { /* ignore */ })
    }, [])

    const uploadSignature = async (file: File) => {
        if (!/^image\/(png|jpe?g)$/.test(file.type)) {
            toast.error("Signature must be a PNG or JPEG image")
            return
        }
        if (file.size > 200 * 1024) {
            toast.error("Signature image is too large — keep it under 200 KB")
            return
        }
        setSigBusy(true)
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(String(reader.result))
                reader.onerror = () => reject(new Error("Could not read file"))
                reader.readAsDataURL(file)
            })
            const res = await fetch("/api/me/signature", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ signature: dataUrl }),
            })
            if (!res.ok) {
                const d = await res.json().catch(() => null)
                throw new Error(d?.error || "Could not save signature")
            }
            setSignature(dataUrl)
            toast.success("Signature saved — it will appear on documents you send")
        } catch (e) {
            toast.error((e as Error).message)
        } finally {
            setSigBusy(false)
        }
    }

    const removeSignature = async () => {
        if (!confirm("Remove your saved signature? New documents you send will go out without it.")) return
        setSigBusy(true)
        try {
            const res = await fetch("/api/me/signature", { method: "DELETE" })
            if (!res.ok) throw new Error("Could not remove signature")
            setSignature(null)
            toast.success("Signature removed")
        } catch (e) {
            toast.error((e as Error).message)
        } finally {
            setSigBusy(false)
        }
    }

    const filteredEmps = useMemo(() => {
        const q = empSearch.trim().toLowerCase()
        if (!q) return employees
        return employees.filter(e =>
            `${e.firstName} ${e.lastName || ""} ${e.employeeId} ${e.designation || ""}`.toLowerCase().includes(q))
    }, [employees, empSearch])

    const targetCount = useMemo(() => {
        if (scope === "all") return employees.length
        if (scope === "role") return roleId ? employees.filter(e => e.user?.customRole?.id === roleId).length : 0
        return selectedEmp.size
    }, [scope, roleId, employees, selectedEmp])

    // Load the editable template whenever the document type changes.
    useEffect(() => {
        const t = docTypes.find(d => d.id === typeId)
        setTemplate(t?.templateContent || "")
    }, [typeId, docTypes])

    // Pick a representative employee to preview the filled document with.
    const sampleEmployeeId = useCallback((): string | undefined => {
        if (scope === "employees") return Array.from(selectedEmp)[0]
        if (scope === "role") return employees.find(e => e.user?.customRole?.id === roleId)?.id
        return employees[0]?.id
    }, [scope, selectedEmp, employees, roleId])

    const openPreview = async () => {
        if (!typeId) return toast.error("Select a document type")
        setPreviewOpen(true)
        setPreviewLoading(true)
        setPreviewContent("")
        try {
            const res = await fetch("/api/hr-documents/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ typeId, templateOverride: template, employeeId: sampleEmployeeId(), effectiveDate: effectiveDate || undefined }),
            })
            if (!res.ok) throw new Error(await res.text() || "Failed")
            const data = await res.json()
            setPreviewContent(data.content || "")
            setPreviewSample(data.sampleEmployee || null)
        } catch (e) {
            toast.error((e as Error).message)
            setPreviewOpen(false)
        } finally {
            setPreviewLoading(false)
        }
    }

    const toggleEmp = (id: string) => {
        setSelectedEmp(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const send = async () => {
        if (!typeId) return toast.error("Select a document type")
        if (scope === "role" && !roleId) return toast.error("Select a role")
        if (scope === "employees" && selectedEmp.size === 0) return toast.error("Select at least one employee")
        if (targetCount === 0) return toast.error("No employees match the selected target")
        if (!confirm(`Issue this document to ${targetCount} employee(s)?`)) return

        setSending(true)
        try {
            const res = await fetch("/api/hr-documents/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    typeId,
                    scope,
                    roleId: scope === "role" ? roleId : undefined,
                    employeeIds: scope === "employees" ? Array.from(selectedEmp) : undefined,
                    effectiveDate: effectiveDate || undefined,
                    remarks: remarks || undefined,
                    templateOverride: template,
                }),
            })
            if (!res.ok) throw new Error(await res.text() || "Failed")
            const data = await res.json()
            toast.success(`Issued to ${data.issued} employee(s)${data.failed ? `, ${data.failed} failed` : ""}`)
            setSelectedEmp(new Set())
            setRemarks("")
            await fetchIssued()
        } catch (e) {
            toast.error((e as Error).message)
        } finally {
            setSending(false)
        }
    }

    // Recall a mistakenly-sent document, or re-issue a recalled one. Both hit
    // the same PUT endpoint and refresh the list; history is kept server-side.
    const [busyId, setBusyId] = useState<string | null>(null)
    const [historyDoc, setHistoryDoc] = useState<IssuedDoc | null>(null)
    const canManage = canAny(session, ["documents.send", "documents.view", "documents.upload"])

    const recallDoc = async (d: IssuedDoc) => {
        const reason = window.prompt(
            `Recall this document from ${d.employee.firstName} ${d.employee.lastName}?\n\nThe employee will no longer see it. Optionally add a reason:`,
            ""
        )
        if (reason === null) return // cancelled
        setBusyId(d.id)
        try {
            const res = await fetch(`/api/hr-documents/${d.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "recall", reason: reason || undefined }),
            })
            if (!res.ok) throw new Error(await res.text() || "Failed")
            toast.success("Document recalled")
            await fetchIssued()
        } catch (e) {
            toast.error((e as Error).message)
        } finally {
            setBusyId(null)
        }
    }

    const reissueDoc = async (d: IssuedDoc) => {
        if (!confirm(`Re-send this document to ${d.employee.firstName} ${d.employee.lastName}?`)) return
        setBusyId(d.id)
        try {
            const res = await fetch(`/api/hr-documents/${d.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "reissue" }),
            })
            if (!res.ok) throw new Error(await res.text() || "Failed")
            toast.success("Document re-sent")
            await fetchIssued()
        } catch (e) {
            toast.error((e as Error).message)
        } finally {
            setBusyId(null)
        }
    }

    // Wipe issued documents. Admins can clear everything (fresh start after the
    // old "everyone saw everything" mess); everyone else clears only their own sends.
    const isAdmin = session?.user?.role === "ADMIN"
    const [clearing, setClearing] = useState(false)
    const [showAllIssued, setShowAllIssued] = useState(false)
    const clearDocs = async (scope: "mine" | "all") => {
        const msg = scope === "all"
            ? "Delete ALL issued documents for EVERYONE? This permanently removes every letter that was ever sent and cannot be undone."
            : "Delete all documents YOU have sent? This permanently removes them and cannot be undone."
        if (!confirm(msg)) return
        if (scope === "all" && !confirm("Are you absolutely sure? This wipes the entire issued-documents history.")) return
        setClearing(true)
        try {
            const res = await fetch(`/api/hr-documents?scope=${scope}`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text() || "Failed")
            const data = await res.json()
            toast.success(`Cleared ${data.deleted} document(s)`)
            await fetchIssued()
        } catch (e) {
            toast.error((e as Error).message)
        } finally {
            setClearing(false)
        }
    }

    const scopeBtn = (s: Scope, label: string, Icon: typeof Users) => (
        <button
            type="button"
            onClick={() => setScope(s)}
            className={`flex-1 flex items-center justify-center gap-2 h-[46px] rounded-[10px] text-[13.5px] font-semibold border transition-colors ${scope === s
                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                : "bg-[var(--surface)] text-[var(--text2)] border-[var(--border)] hover:bg-[var(--surface2)]"}`}
        >
            <Icon size={16} /> {label}
        </button>
    )

    const inputCls = "w-full h-[44px] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[13.5px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
    const labelCls = "block text-[12.5px] font-medium text-[var(--text2)] mb-2"
    const displayedIssued = showAllIssued ? issued : issued.slice(0, 6)

    if (loading) {
        return <div className="p-6 flex h-[70vh] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-[var(--accent)]" /></div>
    }

    return (
        <div className="p-5 lg:p-7 max-w-6xl mx-auto flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-[26px] font-bold tracking-[-0.5px] text-[var(--text)]">Send Documents</h1>
                    <p className="text-[13.5px] text-[var(--text3)] mt-1.5">Issue letters or documents to employees by role or selection — generated on the company letterhead as PDF.</p>
                </div>
                <button
                    onClick={openPreview}
                    className="flex items-center gap-2 h-[42px] px-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                    <Play size={15} /> How it works
                </button>
            </div>

            {/* Compose Document card */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[16px] p-6">
                <div className="flex items-center justify-between gap-3 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[11px] bg-[#e8f7f1] flex items-center justify-center">
                            <FileText size={20} className="text-[var(--accent)]" />
                        </div>
                        <h2 className="text-[17px] font-bold text-[var(--text)]">Compose Document</h2>
                    </div>
                    <div className="relative">
                        <select value={typeId} onChange={e => setTypeId(e.target.value)}
                            className="appearance-none h-[40px] pl-9 pr-9 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[13px] font-medium text-[var(--text2)] outline-none cursor-pointer hover:bg-[var(--surface2)]">
                            <option value="">Use a template</option>
                            {docTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <FileStack size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                        <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                    </div>
                </div>

                <div className="flex flex-col gap-5">
                    {/* Document type */}
                    <div>
                        <label className={labelCls}>Document type</label>
                        <select value={typeId} onChange={e => setTypeId(e.target.value)} className={inputCls}>
                            <option value="">— Select a document type —</option>
                            {docTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        {docTypes.length === 0 && (
                            <p className="text-[12px] text-[var(--text3)] mt-1.5">No document types yet. Create one in <button onClick={() => router.push("/documents/types")} className="text-[var(--accent)] underline">Doc Types</button>.</p>
                        )}
                    </div>

                    {/* Send to */}
                    <div>
                        <label className={labelCls}>Send to</label>
                        <div className="flex gap-3">
                            {scopeBtn("role", "By Role", Users)}
                            {scopeBtn("employees", "Pick Employees", UserCheck)}
                            {scopeBtn("all", "All Employees", Globe)}
                        </div>
                    </div>

                    {/* Role / Effective date / Remarks */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className={labelCls}>{scope === "role" ? "Role" : scope === "all" ? "Audience" : "Selection"}</label>
                            {scope === "role" ? (
                                <select value={roleId} onChange={e => setRoleId(e.target.value)} className={inputCls}>
                                    <option value="">— Select a role —</option>
                                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            ) : scope === "all" ? (
                                <div className={inputCls + " flex items-center text-[var(--text3)]"}>All active employees</div>
                            ) : (
                                <div className={inputCls + " flex items-center text-[var(--text2)]"}>{selectedEmp.size} employee(s) selected</div>
                            )}
                        </div>
                        <div>
                            <label className={labelCls}>Effective date (optional)</label>
                            <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Remarks (optional)</label>
                            <input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Internal note" className={inputCls} />
                        </div>
                    </div>

                    {/* Employee picker (only when picking) */}
                    {scope === "employees" && (
                        <div>
                            <div className="relative mb-2">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                                <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search name / ID / designation" className={inputCls + " pl-9"} />
                            </div>
                            <div className="max-h-64 overflow-y-auto border border-[var(--border)] rounded-[10px] divide-y divide-[var(--border)]">
                                {filteredEmps.map(e => (
                                    <label key={e.id} className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-[var(--surface2)]">
                                        <input type="checkbox" checked={selectedEmp.has(e.id)} onChange={() => toggleEmp(e.id)} style={{ accentColor: "var(--accent)" }} />
                                        <span className="text-[13px] text-[var(--text)]">{e.firstName} {e.lastName}</span>
                                        <span className="text-[12px] text-[var(--text3)]">{e.employeeId}{e.designation ? ` · ${e.designation}` : ""}{e.user?.customRole ? ` · ${e.user.customRole.name}` : ""}</span>
                                    </label>
                                ))}
                                {filteredEmps.length === 0 && <p className="px-3 py-3 text-[13px] text-[var(--text3)]">No employees found.</p>}
                            </div>
                        </div>
                    )}

                    {/* Your signature / Letterhead */}
                    <div>
                        <label className={labelCls + " flex items-center gap-1.5"}>
                            <PenLine size={13} /> Your signature / Letterhead
                        </label>
                        {signature ? (
                            <div className="flex items-center gap-4 border border-[var(--border)] rounded-[12px] bg-[var(--surface2)] p-4 flex-wrap">
                                <div className="bg-white border border-[var(--border)] rounded-[10px] px-4 py-2.5 flex items-center justify-center shrink-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={signature} alt="Your signature" className="h-11 max-w-[150px] object-contain" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[14px] font-bold text-[var(--text)]">Growus Auto</span>
                                        <span className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)] font-semibold">
                                            <Lock size={12} /> Locked to your account
                                        </span>
                                    </div>
                                    <p className="text-[12.5px] text-[var(--text3)] mt-0.5">This will appear on all documents you send.</p>
                                </div>
                                <div className="ml-auto flex items-center gap-2">
                                    <label className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--text2)] border border-[var(--border)] rounded-[9px] px-3.5 h-9 cursor-pointer bg-[var(--surface)] hover:bg-[var(--surface2)] transition ${sigBusy ? "opacity-50 pointer-events-none" : ""}`}>
                                        {sigBusy ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />} Change
                                        <input type="file" accept="image/png,image/jpeg" className="hidden"
                                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadSignature(f); e.target.value = "" }} />
                                    </label>
                                    <button type="button" onClick={removeSignature} disabled={sigBusy}
                                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-red-600 border border-[var(--border)] rounded-[9px] px-3.5 h-9 bg-[var(--surface)] hover:bg-red-50 transition disabled:opacity-50">
                                        <Trash2 size={14} /> Remove
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <label className={`flex items-center gap-3 border border-dashed border-[var(--border)] rounded-[12px] bg-[var(--surface2)] p-4 cursor-pointer hover:border-[var(--accent)] transition ${sigBusy ? "opacity-50 pointer-events-none" : ""}`}>
                                {sigBusy ? <Loader2 size={16} className="animate-spin text-[var(--accent)]" /> : <PenLine size={16} className="text-[var(--text3)]" />}
                                <span className="text-[13px] text-[var(--text2)]">
                                    Upload your signature / letterhead — <span className="font-medium">small PNG or JPEG</span>, max 200 KB. Saved once, then applied to every document you send.
                                </span>
                                <input type="file" accept="image/png,image/jpeg" className="hidden"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadSignature(f); e.target.value = "" }} />
                            </label>
                        )}
                    </div>

                    {/* Document content editor (only after a type is chosen) */}
                    {typeId && (
                        <div>
                            <label className={labelCls}>Document content — edit before sending</label>
                            <textarea value={template} onChange={e => setTemplate(e.target.value)} rows={7}
                                placeholder="This document type has no template yet. Type the content here…"
                                className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] font-mono leading-relaxed" />
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                <span className="text-[11px] text-[var(--text3)] mr-1">Insert:</span>
                                {TEMPLATE_VARS.map(v => (
                                    <button key={v} type="button"
                                        onClick={() => setTemplate(t => `${t}${t && !t.endsWith(" ") && !t.endsWith("\n") ? " " : ""}${v}`)}
                                        className="text-[11px] px-2 py-0.5 rounded-md border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] font-mono">
                                        {v}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Target recipients bar */}
                    <div className="rounded-[14px] bg-[var(--surface2)] border border-[var(--border)] p-4 flex items-center gap-4 flex-wrap">
                        <div className="w-11 h-11 rounded-[12px] bg-[#e8f7f1] flex items-center justify-center shrink-0">
                            <Users size={20} className="text-[var(--accent)]" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[12.5px] text-[var(--text3)]">Target recipients</p>
                            <p className="text-[18px] font-bold text-[var(--text)] leading-tight">
                                {targetCount} <span className="text-[13px] font-medium text-[var(--text3)]">employee(s)</span>
                            </p>
                            <p className="text-[11.5px] text-[var(--text3)]">{targetCount === 0 ? "No recipients selected yet" : "Ready to send"}</p>
                        </div>
                        <p className="hidden lg:block text-[12.5px] text-[var(--text3)] flex-1 min-w-[180px] pl-4">
                            Recipients will be shown here based on the filters above.
                        </p>
                        <div className="flex items-center gap-2.5 ml-auto">
                            <button onClick={openPreview} disabled={!typeId}
                                className="inline-flex items-center gap-2 px-4 h-[42px] bg-[var(--surface)] text-[var(--text2)] border border-[var(--border)] rounded-[10px] text-[13px] font-semibold hover:bg-[var(--surface2)] transition disabled:opacity-50 disabled:cursor-not-allowed">
                                <Eye size={16} /> Preview
                            </button>
                            <button onClick={send} disabled={sending || !typeId || targetCount === 0}
                                className="inline-flex items-center gap-2 px-5 h-[42px] bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ boxShadow: "0 1px 3px rgba(26,158,110,0.35)" }}>
                                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                Send Document
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Issued Documents card */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[16px] p-6">
                <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[11px] bg-[#eef2ff] flex items-center justify-center">
                            <FileText size={20} className="text-[#6366f1]" />
                        </div>
                        <h2 className="text-[17px] font-bold text-[var(--text)]">Issued Documents</h2>
                    </div>
                    {canManage && issued.length > 0 && (
                        <div className="flex items-center gap-2">
                            <button onClick={() => clearDocs("mine")} disabled={clearing}
                                className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[12.5px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors disabled:opacity-50">
                                {clearing ? <Loader2 size={13} className="animate-spin" /> : <X size={14} />} Clear my sends
                            </button>
                            {isAdmin && (
                                <button onClick={() => clearDocs("all")} disabled={clearing}
                                    className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[12.5px] font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                                    <Trash2 size={14} /> Clear all (everyone)
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {issued.length === 0 ? (
                    <p className="px-4 py-8 text-[13px] text-[var(--text3)] text-center">No documents issued yet.</p>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]" style={{ minWidth: 820 }}>
                                <thead>
                                    <tr className="border-b border-[var(--border)] text-[var(--text3)] text-[11.5px]">
                                        <th className="text-left font-semibold px-3 py-2.5">Employee</th>
                                        <th className="text-left font-semibold px-3 py-2.5">Document</th>
                                        <th className="text-left font-semibold px-3 py-2.5">Reference No.</th>
                                        <th className="text-left font-semibold px-3 py-2.5">Sent by</th>
                                        <th className="text-left font-semibold px-3 py-2.5">Issue Date</th>
                                        <th className="text-left font-semibold px-3 py-2.5">Status</th>
                                        <th className="text-left font-semibold px-3 py-2.5">PDF</th>
                                        {canManage && <th className="text-left font-semibold px-3 py-2.5">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayedIssued.map(d => {
                                        const st = d.status === "RECALLED"
                                            ? { label: "RECALLED", color: "#dc2626", bg: "#fef2f2" }
                                            : d.status === "SCHEDULED"
                                                ? { label: "SCHEDULED", color: "#2563eb", bg: "#eff6ff" }
                                                : { label: d.status, color: "#15803d", bg: "#dcfce7" }
                                        return (
                                            <tr key={d.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface2)]">
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full bg-[var(--accent-light,#e8f7f1)] text-[var(--accent)] flex items-center justify-center text-[11px] font-bold shrink-0">
                                                            {d.employee.firstName[0]}{(d.employee.lastName || "")[0]}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-[var(--text)] whitespace-nowrap text-[12.5px]">{d.employee.firstName} {d.employee.lastName}</p>
                                                            <p className="text-[10.5px] font-mono text-[var(--text3)]">{d.employee.employeeId}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-[var(--text2)] whitespace-nowrap">{d.type.name}</td>
                                                <td className="px-3 py-3 font-mono text-[12px] text-[var(--text3)] whitespace-nowrap">{d.docNumber}</td>
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                                        <div className="w-6 h-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                                            {(d.sentByName || "?")[0]}
                                                        </div>
                                                        <span className="text-[12.5px] text-[var(--text2)]">{d.sentByName || "—"}</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-[var(--text3)] whitespace-nowrap">{fmtDate(d.issuedAt || d.createdAt)}</td>
                                                <td className="px-3 py-3">
                                                    <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-full tracking-wide" style={{ color: st.color, background: st.bg }}>
                                                        {st.label}
                                                    </span>
                                                    {(d.recallCount ?? 0) > 0 && <span className="ml-1.5 text-[11px] text-[var(--text3)]" title="Times recalled">↺{d.recallCount}</span>}
                                                </td>
                                                <td className="px-3 py-3">
                                                    <a href={`/api/hr-documents/${d.id}/pdf`} target="_blank" rel="noreferrer"
                                                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--accent)] hover:underline">
                                                        <Download size={14} /> PDF
                                                    </a>
                                                </td>
                                                {canManage && (
                                                    <td className="px-3 py-3 whitespace-nowrap">
                                                        <div className="flex items-center gap-3">
                                                            {d.status === "ISSUED" && (
                                                                <button onClick={() => recallDoc(d)} disabled={busyId === d.id}
                                                                    className="inline-flex items-center gap-1 text-[12.5px] font-medium text-red-600 hover:underline disabled:opacity-50">
                                                                    {busyId === d.id ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={14} />} Recall
                                                                </button>
                                                            )}
                                                            {d.status === "RECALLED" && (
                                                                <button onClick={() => reissueDoc(d)} disabled={busyId === d.id}
                                                                    className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--accent)] hover:underline disabled:opacity-50">
                                                                    {busyId === d.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={14} />} Re-send
                                                                </button>
                                                            )}
                                                            {(d.history?.length ?? 0) > 0 && (
                                                                <button onClick={() => setHistoryDoc(d)}
                                                                    className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]">
                                                                    <History size={14} /> History
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {issued.length > 6 && (
                            <div className="flex justify-center pt-4">
                                <button onClick={() => setShowAllIssued(v => !v)}
                                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--accent)] hover:underline">
                                    {showAllIssued ? "Show less" : "View all issued documents"} <ArrowRight size={15} />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* History modal */}
            {historyDoc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setHistoryDoc(null)}>
                    <div className="bg-[var(--surface)] rounded-[16px] border border-[var(--border)] w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                            <div>
                                <h2 className="text-[16px] font-semibold text-[var(--text)] flex items-center gap-2"><History size={16} /> Document history</h2>
                                <p className="text-[12px] text-[var(--text3)] mt-0.5">{historyDoc.employee.firstName} {historyDoc.employee.lastName} · {historyDoc.docNumber}</p>
                            </div>
                            <button onClick={() => setHistoryDoc(null)} className="text-[var(--text3)] hover:text-[var(--text)] p-1 rounded-md hover:bg-[var(--surface2)]"><X size={18} /></button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-6">
                            <ol className="relative border-l border-[var(--border)] ml-2 space-y-4">
                                {(historyDoc.history ?? []).slice().reverse().map((h, i) => (
                                    <li key={i} className="ml-4">
                                        <span className={`absolute -left-[6px] w-3 h-3 rounded-full ${h.action === "recall" ? "bg-red-500" : "bg-[var(--accent)]"}`} />
                                        <p className="text-[13px] font-medium text-[var(--text)]">
                                            {h.action === "recall" ? "Recalled" : "Re-sent"} by {h.byName}
                                        </p>
                                        <p className="text-[12px] text-[var(--text3)]">{new Date(h.at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                                        {h.reason && <p className="text-[12px] text-[var(--text2)] mt-0.5 italic">“{h.reason}”</p>}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview modal */}
            {previewOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setPreviewOpen(false)}>
                    <div className="bg-[var(--surface)] rounded-[16px] border border-[var(--border)] w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                            <div>
                                <h2 className="text-[16px] font-semibold text-[var(--text)]">Document preview</h2>
                                <p className="text-[12px] text-[var(--text3)] mt-0.5">{previewSample ? `Filled for: ${previewSample}` : "Sample"} · other employees get their own details</p>
                            </div>
                            <button onClick={() => setPreviewOpen(false)} className="text-[var(--text3)] hover:text-[var(--text)] p-1 rounded-md hover:bg-[var(--surface2)]"><X size={18} /></button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-6">
                            {previewLoading ? (
                                <div className="flex items-center justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" /></div>
                            ) : (
                                <div className="bg-white border border-[var(--border)] rounded-[10px] p-6">
                                    <div className="border-b-2 border-[#e23b3b] pb-3 mb-4">
                                        <p className="text-[18px] font-bold text-[#1a1a18]">Growus Auto India Pvt. Ltd.</p>
                                        <p className="text-[11px] italic text-[#e23b3b]">Pioneer in outsourcing</p>
                                    </div>
                                    <pre className="whitespace-pre-wrap font-sans text-[13px] text-[#1a1a18] leading-relaxed">{previewContent || "(empty)"}</pre>
                                    <div className="mt-8">
                                        <p className="text-[12px] font-semibold text-[#1a1a18]">For Growus Auto India Pvt. Ltd.</p>
                                        {signature ? (
                                            <>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={signature} alt="Signature" className="h-10 max-w-[160px] object-contain mt-2" />
                                                <p className="text-[11px] text-[#555] mt-1">Authorised Signatory</p>
                                            </>
                                        ) : (
                                            <p className="text-[11px] text-[#555] mt-6">Authorised Signatory</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-end gap-2">
                            <button onClick={() => setPreviewOpen(false)} className="px-4 h-9 text-[13px] font-medium text-[var(--text2)] hover:text-[var(--text)] rounded-[8px] hover:bg-[var(--surface2)]">Close & edit</button>
                            <button
                                onClick={() => { setPreviewOpen(false); send() }}
                                disabled={sending || targetCount === 0}
                                className="inline-flex items-center gap-2 px-4 h-9 bg-[var(--accent)] text-white rounded-[9px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                            >
                                <Send size={14} /> Send to {targetCount}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
