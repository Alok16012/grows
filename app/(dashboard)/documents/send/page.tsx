"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Send, Loader2, FileText, Download, Users, UserCheck, Globe, Search } from "lucide-react"
import { can } from "@/lib/can"

type DocType = { id: string; name: string; requiresApproval: boolean }
type Role = { id: string; name: string; color?: string }
type Emp = {
    id: string; firstName: string; lastName: string | null; employeeId: string; designation: string | null
    user?: { customRole?: { id: string; name: string } | null } | null
}
type IssuedDoc = {
    id: string; docNumber: string; status: string; issuedAt: string | null; createdAt: string
    employee: { firstName: string; lastName: string; employeeId: string }
    type: { name: string }
}

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

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        if (status === "authenticated" && !can(session, "documents.view")) router.push("/")
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

    const scopeBtn = (s: Scope, label: string, Icon: typeof Users) => (
        <button
            type="button"
            onClick={() => setScope(s)}
            className={`flex items-center gap-2 px-3.5 h-9 rounded-[9px] text-[13px] font-medium border transition-colors ${scope === s
                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                : "bg-[var(--surface)] text-[var(--text2)] border-[var(--border)] hover:bg-[var(--surface2)]"}`}
        >
            <Icon size={14} /> {label}
        </button>
    )

    const inputCls = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
    const labelCls = "block text-[12px] text-[var(--text2)] mb-1.5"

    if (loading) {
        return <div className="p-6 flex h-[70vh] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-[var(--accent)]" /></div>
    }

    return (
        <div className="p-6 lg:p-7 max-w-5xl">
            <div className="mb-5">
                <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text)]">Send Documents</h1>
                <p className="text-[13px] text-[var(--text3)] mt-[3px]">Issue a letter/document to employees by role or selection — generated on the company letterhead as PDF.</p>
            </div>

            {/* Composer */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-5 space-y-4">
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

                <div>
                    <label className={labelCls}>Send to</label>
                    <div className="flex flex-wrap gap-2">
                        {scopeBtn("role", "By role", UserCheck)}
                        {scopeBtn("employees", "Pick employees", Users)}
                        {scopeBtn("all", "All employees", Globe)}
                    </div>
                </div>

                {scope === "role" && (
                    <div>
                        <label className={labelCls}>Role</label>
                        <select value={roleId} onChange={e => setRoleId(e.target.value)} className={inputCls}>
                            <option value="">— Select a role —</option>
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                )}

                {scope === "employees" && (
                    <div>
                        <label className={labelCls}>Employees ({selectedEmp.size} selected)</label>
                        <div className="relative mb-2">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                            <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search name / ID / designation" className={inputCls + " pl-9"} />
                        </div>
                        <div className="max-h-64 overflow-y-auto border border-[var(--border)] rounded-[8px] divide-y divide-[var(--border)]">
                            {filteredEmps.map(e => (
                                <label key={e.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--surface2)]">
                                    <input type="checkbox" checked={selectedEmp.has(e.id)} onChange={() => toggleEmp(e.id)} />
                                    <span className="text-[13px] text-[var(--text)]">{e.firstName} {e.lastName}</span>
                                    <span className="text-[12px] text-[var(--text3)]">{e.employeeId}{e.designation ? ` · ${e.designation}` : ""}{e.user?.customRole ? ` · ${e.user.customRole.name}` : ""}</span>
                                </label>
                            ))}
                            {filteredEmps.length === 0 && <p className="px-3 py-3 text-[13px] text-[var(--text3)]">No employees found.</p>}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelCls}>Effective date (optional)</label>
                        <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>Remarks (optional)</label>
                        <input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Internal note" className={inputCls} />
                    </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                    <p className="text-[13px] text-[var(--text2)]">Target: <span className="font-semibold text-[var(--text)]">{targetCount}</span> employee(s)</p>
                    <button
                        onClick={send}
                        disabled={sending || !typeId || targetCount === 0}
                        className="inline-flex items-center gap-2 px-4 h-9 bg-[var(--accent)] text-white rounded-[9px] text-[13px] font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        Send document
                    </button>
                </div>
            </div>

            {/* Recently issued */}
            <div className="mt-7">
                <h2 className="text-[15px] font-semibold text-[var(--text)] mb-3 flex items-center gap-2"><FileText size={16} /> Issued documents</h2>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden">
                    {issued.length === 0 ? (
                        <p className="px-4 py-6 text-[13px] text-[var(--text3)] text-center">No documents issued yet.</p>
                    ) : (
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="bg-[var(--surface2)] text-[var(--text3)] text-[12px]">
                                    <th className="text-left font-medium px-4 py-2.5">Employee</th>
                                    <th className="text-left font-medium px-4 py-2.5">Document</th>
                                    <th className="text-left font-medium px-4 py-2.5">Ref</th>
                                    <th className="text-left font-medium px-4 py-2.5">Status</th>
                                    <th className="text-right font-medium px-4 py-2.5">PDF</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {issued.map(d => (
                                    <tr key={d.id} className="hover:bg-[var(--surface2)]/50">
                                        <td className="px-4 py-2.5 text-[var(--text)]">{d.employee.firstName} {d.employee.lastName} <span className="text-[var(--text3)]">· {d.employee.employeeId}</span></td>
                                        <td className="px-4 py-2.5 text-[var(--text2)]">{d.type.name}</td>
                                        <td className="px-4 py-2.5 text-[var(--text3)]">{d.docNumber}</td>
                                        <td className="px-4 py-2.5"><span className="text-[12px] px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">{d.status}</span></td>
                                        <td className="px-4 py-2.5 text-right">
                                            <a href={`/api/hr-documents/${d.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline">
                                                <Download size={13} /> PDF
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}
