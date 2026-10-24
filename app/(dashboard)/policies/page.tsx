"use client"
// Policy Management — HR writes policies, maps them to designations and
// publishes versions; joiners read and sign them on step 3 of joining.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import {
    FileSignature, Plus, Search, Layers, Pencil, Archive, RotateCcw, Trash2, Users, Download, FileText,
    CheckCircle2, Clock, History, Eye, Send, AlertTriangle, Loader2, ShieldCheck, Globe2, X,
} from "lucide-react"
import { can } from "@/lib/can"
import { StatCard, statGridClass } from "@/components/StatCard"
import { OpenFromQuery } from "@/components/OpenFromQuery"
import { POLICY_CATEGORIES, SIGNOFF_MISSING_MESSAGE, policyBlocks } from "@/lib/policy-text"
import {
    api, ApiError, qs, Card, Empty, Loading, Pill, Modal, Drawer, UploadButton, Label, inputCls,
    filterCls, btnPrimary, btnGhost, btnSmall, btnIcon, thCls, tdCls, fmtDate,
} from "../performance/hub/_components/shared"

// ─── Types ───────────────────────────────────────────────────────────────────

type Status = "DRAFT" | "ACTIVE" | "ARCHIVED"
type Row = {
    id: string; title: string; category: string | null; status: Status
    requiresSignature: boolean; appliesToAll: boolean
    currentVersionNo: number | null; publishedAt: string | null; effectiveFrom: string | null
    designations: string[]; updatedAt: string; hasDraftChanges: boolean
    required: number; signed: number
}
type Version = { id: string; versionNo: number; title: string; contentHash: string; changeNote: string | null; effectiveFrom: string | null; requireResign: boolean; publishedAt: string; attachmentUrl: string | null }
type Detail = {
    id: string; title: string; category: string | null; status: Status; requiresSignature: boolean; appliesToAll: boolean
    draftContent: string; draftAttachmentUrl: string | null; draftEffectiveFrom: string | null; draftChangeNote: string | null
    updatedAt: string; designations: string[]; versions: Version[]
    currentVersionNo: number | null; hasDraftChanges: boolean; required: number; signed: number; signedAnyVersion: number
}
type DesignationOpt = { designation: string; employees: number }

const STATUS_TONE: Record<Status, { label: string; bg: string; color: string }> = {
    DRAFT: { label: "Draft", bg: "#f3f4f6", color: "#4b5563" },
    ACTIVE: { label: "Active", bg: "#dcfce7", color: "#15803d" },
    ARCHIVED: { label: "Archived", bg: "#fef3c7", color: "#92400e" },
}

function usePolicyApi() {
    const [missing, setMissing] = useState(false)
    const fail = useCallback((e: unknown, fallback = "Something went wrong") => {
        if (e instanceof ApiError && e.status === 503) { setMissing(true); return }
        toast.error(e instanceof Error && e.message ? e.message : fallback)
    }, [])
    return { missing, fail }
}

const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase()

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
    const { data: session, status: authStatus } = useSession()
    const canManage = can(session, "policy.manage")
    const canReport = canManage || can(session, "policy.report")
    const canView = canReport || can(session, "policy.view")
    const { missing, fail } = usePolicyApi()

    const [rows, setRows] = useState<Row[]>([])
    const [loading, setLoading] = useState(true)
    const [q, setQ] = useState("")
    const [status, setStatus] = useState<"" | Status | "ALL">("")
    const [designation, setDesignation] = useState("")
    const [designations, setDesignations] = useState<DesignationOpt[]>([])
    const [editing, setEditing] = useState<string | "new" | null>(null)
    const [report, setReport] = useState<Row | null>(null)
    const [bulkOpen, setBulkOpen] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const d = await api<{ policies: Row[] }>(`/api/policies${qs({ q: q.trim(), status, designation })}`)
            setRows(d.policies)
        } catch (e) { fail(e, "Could not load policies") }
        finally { setLoading(false) }
    }, [q, status, designation, fail])

    const loadDesignations = useCallback(async () => {
        try { setDesignations((await api<{ designations: DesignationOpt[] }>("/api/policies/designations")).designations) }
        catch (e) { fail(e) }
    }, [fail])

    useEffect(() => {
        if (authStatus !== "authenticated" || !canView) return
        const t = setTimeout(load, q ? 250 : 0)
        return () => clearTimeout(t)
    }, [authStatus, canView, load, q])
    useEffect(() => { if (authStatus === "authenticated" && canView) loadDesignations() }, [authStatus, canView, loadDesignations])

    const totals = useMemo(() => {
        const active = rows.filter(r => r.status === "ACTIVE")
        const required = active.reduce((s, r) => s + r.required, 0)
        const signed = active.reduce((s, r) => s + r.signed, 0)
        return {
            active: active.length,
            drafts: rows.filter(r => r.status === "DRAFT" || (r.status === "ACTIVE" && r.hasDraftChanges)).length,
            rate: required ? Math.round((signed / required) * 100) : null,
            pending: required - signed,
        }
    }, [rows])

    async function archive(r: Row, action: "ARCHIVE" | "RESTORE") {
        if (action === "ARCHIVE" && !confirm(`Archive “${r.title}”? It stops appearing in joining forms. Versions and signatures are kept.`)) return
        try {
            await api(`/api/policies/${r.id}`, { method: "PATCH", body: { action } })
            toast.success(action === "ARCHIVE" ? "Policy archived" : "Policy restored")
            load()
        } catch (e) { fail(e) }
    }

    async function remove(r: Row) {
        const published = r.currentVersionNo !== null
        if (!confirm(published
            ? `“${r.title}” has been published, so it will be archived instead of deleted — signatures and versions are kept. Continue?`
            : `Delete the draft “${r.title}”? This can't be undone.`)) return
        try {
            const res = await api<{ deleted: boolean; message?: string }>(`/api/policies/${r.id}`, { method: "DELETE" })
            toast.success(res.deleted ? "Draft deleted" : "Policy archived")
            load()
        } catch (e) { fail(e) }
    }

    if (authStatus === "loading") return <div className="p-6"><Loading /></div>
    if (!canView) {
        return <div className="p-6"><Card><Empty icon={<ShieldCheck size={40} />} title="You don't have access to Policy Management" sub="Ask an admin for the policy.view permission." /></Card></div>
    }

    return (
        <div className="px-4 py-5 sm:px-7 sm:py-6 min-h-screen">
            <OpenFromQuery ready={authStatus === "authenticated"} onOpen={id => setEditing(id)} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
                <div>
                    <h1 className="text-[24px] sm:text-[26px] font-bold text-[var(--text)] tracking-[-0.5px] leading-tight">Policy Sign-off</h1>
                    <p className="text-[13.5px] text-[var(--text3)] mt-1">Policies joiners read and sign on step 3 of joining, mapped by designation.</p>
                </div>
                {canManage && !missing && (
                    <div className="page-actions flex gap-2 flex-wrap">
                        <button className={btnGhost} onClick={() => setBulkOpen(true)}><Layers size={15} /> Bulk assign</button>
                        <button className={btnPrimary} onClick={() => setEditing("new")}><Plus size={15} /> New policy</button>
                    </div>
                )}
            </div>

            {missing ? (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <div><p className="font-semibold">{SIGNOFF_MISSING_MESSAGE}</p><p className="text-[12px] mt-0.5 opacity-90">Joining forms skip the policy step until then.</p></div>
                </div>
            ) : (
                <>
                    <div className={`${statGridClass(4)} mb-5`}>
                        <StatCard label="Active policies" value={totals.active} tone="blue" icon={<FileSignature />} seed={0} />
                        <StatCard label="Sign-off rate" value={totals.rate === null ? "—" : `${totals.rate}%`} tone={totals.rate === null || totals.rate >= 90 ? "teal" : totals.rate >= 60 ? "amber" : "rose"} icon={<CheckCircle2 />} seed={1} />
                        <StatCard label="Signatures pending" value={totals.pending} tone={totals.pending > 0 ? "amber" : "teal"} icon={<Clock />} seed={2} />
                        <StatCard label="Drafts & unpublished edits" value={totals.drafts} tone="violet" icon={<Pencil />} seed={3} />
                    </div>

                    <Card>
                        <div className="p-3 sm:p-4 flex flex-wrap gap-2 items-center border-b border-[var(--border)]">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title or category…" aria-label="Search policies"
                                    className={`${filterCls} w-full !pl-8`} />
                            </div>
                            <select className={filterCls} value={designation} onChange={e => setDesignation(e.target.value)} aria-label="Designation">
                                <option value="">All designations</option>
                                {designations.map(d => <option key={d.designation} value={d.designation}>{d.designation}{d.employees ? ` (${d.employees})` : ""}</option>)}
                            </select>
                            <select className={filterCls} value={status} onChange={e => setStatus(e.target.value as typeof status)} aria-label="Status">
                                <option value="">Active & drafts</option>
                                <option value="ACTIVE">Active</option>
                                <option value="DRAFT">Draft</option>
                                <option value="ARCHIVED">Archived</option>
                                <option value="ALL">All</option>
                            </select>
                        </div>
                        {loading ? <Loading /> : rows.length === 0 ? (
                            <Empty icon={<FileSignature size={40} />} title="No policies yet"
                                sub={canManage ? "Create a policy, assign designations and publish it — joiners then sign it on step 3." : "HR hasn't published any policies yet."}
                                action={canManage ? <button className={btnPrimary} onClick={() => setEditing("new")}><Plus size={15} /> New policy</button> : undefined} />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[13px]">
                                    <thead><tr>
                                        <th className={thCls}>Policy</th>
                                        <th className={thCls}>Applies to</th>
                                        <th className={thCls}>Version</th>
                                        <th className={thCls}>Sign-offs</th>
                                        <th className={thCls}>Status</th>
                                        <th className={`${thCls} text-right`}>Actions</th>
                                    </tr></thead>
                                    <tbody>
                                        {rows.map(r => {
                                            const pct = r.required ? Math.round((r.signed / r.required) * 100) : 0
                                            return (
                                                <tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--surface2)]/50">
                                                    <td className={tdCls}>
                                                        <button className="text-left font-semibold text-[var(--text)] hover:text-[var(--accent)]" onClick={() => setEditing(r.id)}>{r.title}</button>
                                                        <p className="text-[11.5px] text-[var(--text3)]">{r.category || "—"}{!r.requiresSignature ? " · read only, no signature" : ""}</p>
                                                    </td>
                                                    <td className={`${tdCls} max-w-[260px]`}>
                                                        {r.appliesToAll ? (
                                                            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent)]"><Globe2 size={12} /> All designations</span>
                                                        ) : r.designations.length ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {r.designations.slice(0, 3).map(d => <span key={d} className="px-1.5 py-0.5 rounded-md bg-[var(--surface2)] border border-[var(--border)] text-[11px] text-[var(--text2)]">{d}</span>)}
                                                                {r.designations.length > 3 && <span className="text-[11px] text-[var(--text3)]">+{r.designations.length - 3} more</span>}
                                                            </div>
                                                        ) : <span className="text-[12px] text-amber-700">Not assigned</span>}
                                                    </td>
                                                    <td className={`${tdCls} whitespace-nowrap`}>
                                                        {r.currentVersionNo ? <span className="font-mono text-[12px]">v{r.currentVersionNo}</span> : <span className="text-[var(--text3)]">—</span>}
                                                        <p className="text-[11px] text-[var(--text3)]">{r.publishedAt ? fmtDate(r.publishedAt) : "Not published"}{r.status === "ACTIVE" && r.hasDraftChanges ? " · unpublished edits" : ""}</p>
                                                    </td>
                                                    <td className={`${tdCls} min-w-[140px]`}>
                                                        {r.status === "ACTIVE" && r.requiresSignature ? (
                                                            <button className="w-full text-left disabled:cursor-default" disabled={!canReport} onClick={() => setReport(r)} title={canReport ? "See who signed" : undefined}>
                                                                <span className="text-[12px] font-semibold text-[var(--text)]">{r.signed}/{r.required}</span>
                                                                <span className="text-[11px] text-[var(--text3)]"> signed</span>
                                                                <div className="h-1.5 mt-1 rounded-full bg-[var(--surface2)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? "#16a34a" : pct >= 60 ? "#d97706" : "#dc2626" }} /></div>
                                                            </button>
                                                        ) : <span className="text-[var(--text3)]">—</span>}
                                                    </td>
                                                    <td className={tdCls}><Pill tone={STATUS_TONE[r.status]} /></td>
                                                    <td className={`${tdCls} text-right whitespace-nowrap`}>
                                                        <div className="inline-flex gap-1">
                                                            <button className={btnIcon} title={canManage ? "Edit" : "View"} aria-label={canManage ? "Edit" : "View"} onClick={() => setEditing(r.id)}>{canManage ? <Pencil size={14} /> : <Eye size={14} />}</button>
                                                            {canReport && r.currentVersionNo && <button className={btnIcon} title="Sign-offs" aria-label="Sign-offs" onClick={() => setReport(r)}><Users size={14} /></button>}
                                                            {canManage && (r.status === "ARCHIVED"
                                                                ? <button className={btnIcon} title="Restore" aria-label="Restore" onClick={() => archive(r, "RESTORE")}><RotateCcw size={14} /></button>
                                                                : r.currentVersionNo
                                                                    ? <button className={btnIcon} title="Archive" aria-label="Archive" onClick={() => archive(r, "ARCHIVE")}><Archive size={14} /></button>
                                                                    : <button className={btnIcon} title="Delete draft" aria-label="Delete draft" onClick={() => remove(r)}><Trash2 size={14} /></button>)}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </>
            )}

            {editing && (
                <PolicyEditor id={editing === "new" ? null : editing} canManage={canManage} designationOpts={designations} fail={fail}
                    onClose={() => setEditing(null)}
                    onChanged={() => { load(); loadDesignations() }} />
            )}
            {report && <SignoffReport policy={report} fail={fail} onClose={() => setReport(null)} />}
            {bulkOpen && <BulkAssign rows={rows.filter(r => r.status !== "ARCHIVED")} designationOpts={designations} fail={fail}
                onClose={() => setBulkOpen(false)} onDone={() => { setBulkOpen(false); load() }} />}
        </div>
    )
}

// ─── Designation picker ──────────────────────────────────────────────────────

function DesignationPicker({ value, onChange, options, appliesToAll, onAppliesToAll, disabled }: {
    value: string[]; onChange: (v: string[]) => void; options: DesignationOpt[]
    appliesToAll?: boolean; onAppliesToAll?: (v: boolean) => void; disabled?: boolean
}) {
    const [q, setQ] = useState("")
    const chosen = new Set(value.map(key))
    const list = options.filter(o => !q.trim() || o.designation.toLowerCase().includes(q.trim().toLowerCase()))
    const canAdd = q.trim() && !options.some(o => key(o.designation) === key(q)) && !chosen.has(key(q))
    const toggle = (d: string) => onChange(chosen.has(key(d)) ? value.filter(v => key(v) !== key(d)) : [...value, d])

    return (
        <div className={disabled ? "opacity-60 pointer-events-none" : ""}>
            {onAppliesToAll && (
                <label className="flex items-start gap-2 mb-2 p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface2)] cursor-pointer">
                    <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[var(--accent)]" checked={!!appliesToAll} onChange={e => onAppliesToAll(e.target.checked)} />
                    <span className="text-[12.5px] text-[var(--text2)]"><b className="text-[var(--text)]">All designations</b> — everyone signs it, including designations added later (e.g. Code of Conduct).</span>
                </label>
            )}
            {!appliesToAll && (
                <>
                    {value.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {value.map(d => (
                                <span key={d} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] text-[12px] font-medium">
                                    {d}<button type="button" onClick={() => toggle(d)} aria-label={`Remove ${d}`} className="p-0.5 rounded hover:bg-[var(--accent)]/20"><X size={11} /></button>
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-2 mb-2">
                        <input className={inputCls("!py-1.5 flex-1")} placeholder="Search or type a designation…" value={q} onChange={e => setQ(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && canAdd) { e.preventDefault(); onChange([...value, q.trim()]); setQ("") } }} aria-label="Find designation" />
                        <button type="button" className={btnSmall} onClick={() => onChange(Array.from(new Map([...value, ...options.map(o => o.designation)].map(d => [key(d), d])).values()))}>Select all ({options.length})</button>
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
                        {canAdd && (
                            <button type="button" className="w-full text-left px-3 py-2 text-[12.5px] text-[var(--accent)] hover:bg-[var(--surface2)]" onClick={() => { onChange([...value, q.trim()]); setQ("") }}>
                                + Add “{q.trim()}”
                            </button>
                        )}
                        {list.length === 0 && !canAdd && <p className="px-3 py-3 text-[12px] text-[var(--text3)]">No designations match.</p>}
                        {list.map(o => (
                            <label key={o.designation} className="flex items-center gap-2 px-3 py-2 text-[12.5px] cursor-pointer hover:bg-[var(--surface2)]">
                                <input type="checkbox" className="w-4 h-4 accent-[var(--accent)]" checked={chosen.has(key(o.designation))} onChange={() => toggle(o.designation)} />
                                <span className="flex-1 text-[var(--text)]">{o.designation}</span>
                                <span className="text-[11px] text-[var(--text3)]">{o.employees} staff</span>
                            </label>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

// ─── Editor ──────────────────────────────────────────────────────────────────

const FORMAT_HELP = "Plain text. Start a line with # for a heading, - for a bullet, 1. for a numbered point. Leave a blank line between paragraphs."

function PolicyEditor({ id, canManage, designationOpts, fail, onClose, onChanged }: {
    id: string | null; canManage: boolean; designationOpts: DesignationOpt[]
    fail: (e: unknown, f?: string) => void; onClose: () => void; onChanged: () => void
}) {
    const [policyId, setPolicyId] = useState<string | null>(id)
    const [detail, setDetail] = useState<Detail | null>(null)
    const [loading, setLoading] = useState(!!id)
    const [saving, setSaving] = useState(false)
    const [preview, setPreview] = useState(false)
    const [publishOpen, setPublishOpen] = useState(false)
    const [f, setF] = useState({
        title: "", category: "", effectiveFrom: "", requiresSignature: true, content: "", attachmentUrl: "", changeNote: "",
        designations: [] as string[], appliesToAll: false,
    })
    const [dirty, setDirty] = useState(false)
    const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF(p => ({ ...p, [k]: v })); setDirty(true) }
    const archived = detail?.status === "ARCHIVED"
    const readOnly = !canManage || archived

    // The parent passes a fresh onClose every render; don't let that re-trigger loads.
    const closeRef = useRef(onClose)
    closeRef.current = onClose

    const load = useCallback(async (pid: string) => {
        setLoading(true)
        try {
            const { policy } = await api<{ policy: Detail }>(`/api/policies/${pid}`)
            setDetail(policy)
            setF({
                title: policy.title, category: policy.category ?? "", effectiveFrom: policy.draftEffectiveFrom?.slice(0, 10) ?? "",
                requiresSignature: policy.requiresSignature, content: policy.draftContent, attachmentUrl: policy.draftAttachmentUrl ?? "",
                changeNote: policy.draftChangeNote ?? "", designations: policy.designations, appliesToAll: policy.appliesToAll,
            })
            setDirty(false)
        } catch (e) { fail(e, "Could not load the policy"); closeRef.current() }
        finally { setLoading(false) }
    }, [fail])

    useEffect(() => { if (id) load(id) }, [id, load])

    /** Saves the draft and the designation list; returns the policy id. */
    async function save(silent = false): Promise<string | null> {
        if (!f.title.trim()) { toast.error("Policy title is required"); return null }
        setSaving(true)
        try {
            const body = {
                title: f.title, category: f.category || null, effectiveFrom: f.effectiveFrom || null, requiresSignature: f.requiresSignature,
                content: f.content, attachmentUrl: f.attachmentUrl || null, changeNote: f.changeNote || null,
            }
            let pid = policyId
            if (!pid) {
                const { policy } = await api<{ policy: { id: string } }>("/api/policies", { body: { ...body, designations: f.designations, appliesToAll: f.appliesToAll } })
                pid = policy.id
                setPolicyId(pid)
            } else {
                await api(`/api/policies/${pid}`, { method: "PUT", body: { ...body, updatedAt: detail?.updatedAt } })
                const sameList = detail && detail.appliesToAll === f.appliesToAll
                    && detail.designations.map(key).sort().join("|") === f.designations.map(key).sort().join("|")
                if (!sameList) {
                    const r = await api<{ notified: number }>(`/api/policies/${pid}/designations`, { method: "PUT", body: { designations: f.designations, appliesToAll: f.appliesToAll } })
                    if (r.notified) toast.info(`${r.notified} employee${r.notified === 1 ? "" : "s"} notified to sign`)
                }
            }
            if (!silent) toast.success("Draft saved")
            await load(pid)
            onChanged()
            return pid
        } catch (e) { fail(e, "Could not save"); return null }
        finally { setSaving(false) }
    }

    async function startPublish() {
        if (!f.content.trim()) { toast.error("Add the policy text before publishing"); return }
        if (!f.appliesToAll && f.designations.length === 0) { toast.error("Pick at least one designation, or “All designations”"); return }
        if (dirty || !policyId) { const pid = await save(true); if (!pid) return }
        setPublishOpen(true)
    }

    const blocks = useMemo(() => policyBlocks(f.content), [f.content])
    const status = detail?.status ?? "DRAFT"

    return (
        <Drawer width="max-w-3xl" onClose={() => { if (!dirty || confirm("Discard unsaved changes?")) onClose() }}
            header={
                <div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-[17px] font-semibold text-[var(--text)]">{policyId ? f.title || "Policy" : "New policy"}</h2>
                        <Pill tone={STATUS_TONE[status]} />
                        {detail?.currentVersionNo && <span className="text-[11.5px] font-mono text-[var(--text3)]">live v{detail.currentVersionNo}</span>}
                    </div>
                    <p className="text-[12px] text-[var(--text3)] mt-0.5">
                        {archived ? "Archived — restore it to edit or publish." : detail?.currentVersionNo
                            ? (detail.hasDraftChanges || dirty ? "Edits below are a draft — employees keep seeing the live version until you publish." : "No unpublished changes.")
                            : "Save as a draft, then publish to make it live."}
                    </p>
                </div>
            }
            footer={canManage && !archived ? (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11.5px] text-[var(--text3)]">{dirty ? "Unsaved changes" : ""}</span>
                    <div className="flex gap-2">
                        <button className={btnGhost} onClick={() => save()} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : null} Save draft</button>
                        <button className={btnPrimary} onClick={startPublish} disabled={saving}><Send size={14} /> Publish{detail?.currentVersionNo ? ` v${detail.currentVersionNo + 1}` : ""}</button>
                    </div>
                </div>
            ) : undefined}>
            {loading ? <Loading /> : (
                <div className="p-5 space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <Label>Title *</Label>
                            <input className={inputCls()} value={f.title} onChange={e => set("title", e.target.value)} disabled={readOnly} placeholder="e.g. Code of Conduct" maxLength={200} />
                        </div>
                        <div>
                            <Label>Category</Label>
                            <input className={inputCls()} list="policy-categories" value={f.category} onChange={e => set("category", e.target.value)} disabled={readOnly} placeholder="HR, Safety, IT & Data…" maxLength={60} />
                            <datalist id="policy-categories">{POLICY_CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
                        </div>
                        <div>
                            <Label>Effective from</Label>
                            <input type="date" className={inputCls()} value={f.effectiveFrom} onChange={e => set("effectiveFrom", e.target.value)} disabled={readOnly} />
                        </div>
                        <label className="sm:col-span-2 flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[var(--accent)]" checked={f.requiresSignature} disabled={readOnly} onChange={e => set("requiresSignature", e.target.checked)} />
                            <span className="text-[12.5px] text-[var(--text2)]"><b className="text-[var(--text)]">Requires signature</b> — joiners must read it to the end and sign before submitting their joining form.</span>
                        </label>
                    </div>

                    <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <Label hint={FORMAT_HELP}>Policy text *</Label>
                            <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden text-[12px]">
                                <button type="button" onClick={() => setPreview(false)} className={`px-2.5 py-1 ${!preview ? "bg-[var(--accent)] text-white" : "text-[var(--text2)]"}`}>Write</button>
                                <button type="button" onClick={() => setPreview(true)} className={`px-2.5 py-1 ${preview ? "bg-[var(--accent)] text-white" : "text-[var(--text2)]"}`}>Preview</button>
                            </div>
                        </div>
                        {preview ? (
                            <div className="min-h-[260px] max-h-[420px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[13.5px] leading-relaxed text-[var(--text2)]">
                                {blocks.length === 0 ? <p className="text-[var(--text3)]">Nothing to preview yet.</p> : blocks.map((b, i) =>
                                    b.kind === "heading" ? <p key={i} className="font-bold text-[var(--text)] mt-3 mb-1">{b.text}</p>
                                        : b.kind === "bullet" ? <p key={i} className="pl-4 -indent-3 mb-1">•&nbsp;&nbsp;{b.text}</p>
                                            : b.kind === "numbered" ? <p key={i} className="pl-5 -indent-4 mb-1">{b.n}.&nbsp;&nbsp;{b.text}</p>
                                                : <p key={i} className="mb-2.5">{b.text}</p>)}
                            </div>
                        ) : (
                            <textarea className={inputCls("min-h-[260px] font-[inherit] leading-relaxed")} value={f.content} disabled={readOnly}
                                onChange={e => set("content", e.target.value)} placeholder={"# Purpose\nThis policy explains…\n\n# Rules\n- Wear your ID card at all times\n- …"} />
                        )}
                        <p className="text-[11px] text-[var(--text3)] mt-1">{f.content.length.toLocaleString("en-IN")} characters</p>
                    </div>

                    <div>
                        <Label hint="Optional — e.g. the signed PDF of the policy. Employees can open it; the text above is what they sign.">Attachment</Label>
                        <div className="flex gap-2 items-center flex-wrap">
                            <input className={inputCls("flex-1 min-w-[220px]")} value={f.attachmentUrl} onChange={e => set("attachmentUrl", e.target.value)} disabled={readOnly} placeholder="https://…" />
                            {!readOnly && <UploadButton label="Upload PDF" onUploaded={url => set("attachmentUrl", url)} />}
                            {f.attachmentUrl && <a href={f.attachmentUrl} target="_blank" rel="noreferrer" className={btnSmall}><FileText size={12} /> Open</a>}
                        </div>
                    </div>

                    <div>
                        <Label hint="Who must sign this policy. Designation is matched ignoring case and extra spaces.">Applies to *</Label>
                        <DesignationPicker value={f.designations} onChange={v => set("designations", v)} options={designationOpts}
                            appliesToAll={f.appliesToAll} onAppliesToAll={v => set("appliesToAll", v)} disabled={readOnly} />
                    </div>

                    {detail?.currentVersionNo && !readOnly && (
                        <div>
                            <Label hint="Shown in version history, e.g. “Added WFH rules”.">Change note for the next version</Label>
                            <input className={inputCls()} value={f.changeNote} onChange={e => set("changeNote", e.target.value)} maxLength={500} />
                        </div>
                    )}

                    {detail && detail.versions.length > 0 && (
                        <div>
                            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text)] mb-2"><History size={14} /> Version history</p>
                            <div className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
                                {detail.versions.map(v => (
                                    <div key={v.id} className="px-3 py-2.5 flex items-start gap-3">
                                        <span className="font-mono text-[12px] font-semibold text-[var(--text)] w-8">v{v.versionNo}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12.5px] text-[var(--text2)]">
                                                Published {fmtDate(v.publishedAt, "dd MMM yyyy, HH:mm")}
                                                {v.requireResign && <span className="ml-1.5 text-[11px] font-semibold text-amber-700">· re-sign required</span>}
                                            </p>
                                            {v.changeNote && <p className="text-[12px] text-[var(--text3)]">{v.changeNote}</p>}
                                            <p className="text-[10.5px] font-mono text-[var(--text3)] truncate" title={v.contentHash}>SHA-256 {v.contentHash}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {publishOpen && policyId && detail && (
                <PublishDialog detail={detail} fail={fail} onClose={() => setPublishOpen(false)}
                    onPublished={() => { setPublishOpen(false); load(policyId); onChanged() }} />
            )}
        </Drawer>
    )
}

function PublishDialog({ detail, fail, onClose, onPublished }: { detail: Detail; fail: (e: unknown, f?: string) => void; onClose: () => void; onPublished: () => void }) {
    const first = !detail.currentVersionNo
    const [resign, setResign] = useState(false)
    const [busy, setBusy] = useState(false)
    async function publish() {
        setBusy(true)
        try {
            const r = await api<{ version: { versionNo: number }; notified: number }>(`/api/policies/${detail.id}/publish`, { body: { requireResign: resign } })
            toast.success(`Published version ${r.version.versionNo}${r.notified ? ` · ${r.notified} employee${r.notified === 1 ? "" : "s"} notified` : ""}`)
            onPublished()
        } catch (e) { fail(e, "Could not publish") }
        finally { setBusy(false) }
    }
    return (
        <Modal title={`Publish ${first ? "policy" : `version ${(detail.currentVersionNo ?? 0) + 1}`}`} subtitle={detail.title} onClose={onClose}
            footer={<><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} onClick={publish} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Publish</button></>}>
            <div className="p-5 space-y-3 text-[13px] text-[var(--text2)]">
                <p>
                    {detail.appliesToAll ? "Applies to every designation" : `Applies to ${detail.designations.length} designation${detail.designations.length === 1 ? "" : "s"}`}
                    {detail.required ? ` · ${detail.required} current staff` : ""}. The published text is locked and stamped with a SHA-256 hash; new joiners sign it from now on.
                </p>
                {first ? (
                    <p className="text-[12.5px] text-[var(--text3)]">Employees who have already joined get it as a pending task on their profile.</p>
                ) : (
                    <div className="space-y-2">
                        <label className="flex items-start gap-2 p-3 rounded-xl border border-[var(--border)] cursor-pointer">
                            <input type="radio" name="resign" className="mt-0.5 accent-[var(--accent)]" checked={!resign} onChange={() => setResign(false)} />
                            <span><b className="text-[var(--text)]">Existing signatures stay valid</b><br /><span className="text-[12px] text-[var(--text3)]">For small wording fixes. Only new joiners see the new version.</span></span>
                        </label>
                        <label className="flex items-start gap-2 p-3 rounded-xl border border-[var(--border)] cursor-pointer">
                            <input type="radio" name="resign" className="mt-0.5 accent-[var(--accent)]" checked={resign} onChange={() => setResign(true)} />
                            <span><b className="text-[var(--text)]">Everyone must sign again</b><br /><span className="text-[12px] text-[var(--text3)]">{detail.signedAnyVersion} employee{detail.signedAnyVersion === 1 ? "" : "s"} signed an earlier version and will be asked to sign this one.</span></span>
                        </label>
                    </div>
                )}
            </div>
        </Modal>
    )
}

// ─── Sign-off report ─────────────────────────────────────────────────────────

type AckRow = {
    ackId: string; employee: { id: string; employeeId: string; firstName: string; lastName: string; designation: string | null; status: string }
    versionNo: number; valid: boolean; signedAt: string; scrolledAt: string | null; typedName: string | null; signatureType: string | null; ipAddress: string | null; channel: string | null
}
type PendingRow = { id: string; employeeId: string; firstName: string; lastName: string; designation: string | null; status: string }

function SignoffReport({ policy, fail, onClose }: { policy: Row; fail: (e: unknown, f?: string) => void; onClose: () => void }) {
    const [data, setData] = useState<{ signed: AckRow[]; pending: PendingRow[]; currentVersionNo: number | null } | null>(null)
    const [tab, setTab] = useState<"signed" | "pending">("signed")
    const closeRef = useRef(onClose)
    closeRef.current = onClose
    useEffect(() => {
        api<{ signed: AckRow[]; pending: PendingRow[]; currentVersionNo: number | null }>(`/api/policies/${policy.id}/acknowledgements`)
            .then(setData).catch(e => { fail(e, "Could not load sign-offs"); closeRef.current() })
    }, [policy.id, fail])
    const valid = data?.signed.filter(s => s.valid).length ?? 0
    return (
        <Drawer width="max-w-3xl" onClose={onClose}
            header={<div><h2 className="text-[17px] font-semibold text-[var(--text)]">Sign-offs · {policy.title}</h2><p className="text-[12px] text-[var(--text3)]">{data ? `${valid} valid signature${valid === 1 ? "" : "s"} · ${data.pending.length} pending` : "Loading…"}</p></div>}
            footer={<div className="flex justify-end"><a className={btnGhost} href={`/api/policies/${policy.id}/acknowledgements?format=csv`}><Download size={14} /> Export CSV</a></div>}>
            {!data ? <Loading /> : (
                <div className="p-4">
                    <div className="z-tabs-wrap mb-3"><div className="z-tabs z-tabs--inset">
                        <button className={`z-tab ${tab === "signed" ? "is-active" : ""}`} onClick={() => setTab("signed")}><CheckCircle2 size={14} /> Signed ({data.signed.length})</button>
                        <button className={`z-tab ${tab === "pending" ? "is-active" : ""}`} onClick={() => setTab("pending")}><Clock size={14} /> Pending ({data.pending.length})</button>
                    </div></div>
                    {tab === "signed" ? (data.signed.length === 0 ? <Empty icon={<FileSignature size={36} />} title="No signatures yet" /> : (
                        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                            <table className="w-full text-[12.5px]">
                                <thead><tr><th className={thCls}>Employee</th><th className={thCls}>Version</th><th className={thCls}>Signed</th><th className={thCls}>Evidence</th><th className={thCls}></th></tr></thead>
                                <tbody>{data.signed.map(s => (
                                    <tr key={s.ackId} className="border-t border-[var(--border)]">
                                        <td className={tdCls}><p className="font-medium text-[var(--text)]">{s.employee.firstName} {s.employee.lastName}</p><p className="text-[11px] text-[var(--text3)]"><span className="font-mono">{s.employee.employeeId}</span> · {s.employee.designation || "—"}</p></td>
                                        <td className={tdCls}><span className="font-mono">v{s.versionNo}</span>{!s.valid && <p className="text-[10.5px] font-semibold text-amber-700">re-sign needed</p>}</td>
                                        <td className={`${tdCls} whitespace-nowrap`}>{fmtDate(s.signedAt, "dd MMM yyyy, HH:mm")}</td>
                                        <td className={tdCls}><p className="text-[11.5px] text-[var(--text2)]">“{s.typedName}” · {s.signatureType === "DRAWN" ? "drawn + typed" : "typed"}</p><p className="text-[10.5px] text-[var(--text3)]">{s.channel === "ONBOARDING_LINK" ? "Joining form" : "Self-service"}{s.ipAddress ? ` · ${s.ipAddress}` : ""}</p></td>
                                        <td className={`${tdCls} text-right`}><a className={btnSmall} href={`/api/policies/acks/${s.ackId}/pdf`} target="_blank" rel="noreferrer"><FileText size={12} /> PDF</a></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )) : (data.pending.length === 0 ? <Empty icon={<CheckCircle2 size={36} />} title="Everyone has signed" /> : (
                        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                            <table className="w-full text-[12.5px]">
                                <thead><tr><th className={thCls}>Employee</th><th className={thCls}>Designation</th><th className={thCls}>Status</th></tr></thead>
                                <tbody>{data.pending.map(e => (
                                    <tr key={e.id} className="border-t border-[var(--border)]">
                                        <td className={tdCls}><p className="font-medium text-[var(--text)]">{e.firstName} {e.lastName}</p><p className="text-[11px] font-mono text-[var(--text3)]">{e.employeeId}</p></td>
                                        <td className={tdCls}>{e.designation || "—"}</td>
                                        <td className={tdCls}>{e.status === "ONBOARDING" ? "Joining" : e.status === "ON_LEAVE" ? "On leave" : "Active"}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}
        </Drawer>
    )
}

// ─── Bulk assign ─────────────────────────────────────────────────────────────

function BulkAssign({ rows, designationOpts, fail, onClose, onDone }: {
    rows: Row[]; designationOpts: DesignationOpt[]; fail: (e: unknown, f?: string) => void; onClose: () => void; onDone: () => void
}) {
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [designations, setDesignations] = useState<string[]>([])
    const [busy, setBusy] = useState(false)
    const togglePolicy = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
    async function assign() {
        if (!picked.size || !designations.length) { toast.error("Pick policies and designations"); return }
        setBusy(true)
        try {
            const r = await api<{ added: number }>("/api/policies/bulk-assign", { body: { policyIds: Array.from(picked), designations } })
            toast.success(`${r.added} new assignment${r.added === 1 ? "" : "s"} added`)
            onDone()
        } catch (e) { fail(e, "Could not assign") }
        finally { setBusy(false) }
    }
    return (
        <Modal wide title="Bulk assign" subtitle="Add designations to many policies at once. Existing assignments are kept." onClose={onClose}
            footer={<><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} onClick={assign} disabled={busy || !picked.size || !designations.length}>{busy && <Loader2 size={14} className="animate-spin" />} Assign {picked.size || ""} polic{picked.size === 1 ? "y" : "ies"}</button></>}>
            <div className="p-5 grid gap-5 sm:grid-cols-2">
                <div>
                    <Label>Policies</Label>
                    <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
                        {rows.length === 0 && <p className="px-3 py-3 text-[12px] text-[var(--text3)]">No policies yet.</p>}
                        {rows.map(r => (
                            <label key={r.id} className="flex items-start gap-2 px-3 py-2 text-[12.5px] cursor-pointer hover:bg-[var(--surface2)]">
                                <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[var(--accent)]" checked={picked.has(r.id)} onChange={() => togglePolicy(r.id)} />
                                <span className="flex-1"><span className="text-[var(--text)] font-medium">{r.title}</span><br /><span className="text-[11px] text-[var(--text3)]">{r.appliesToAll ? "All designations" : `${r.designations.length} designation${r.designations.length === 1 ? "" : "s"}`} · {STATUS_TONE[r.status].label}</span></span>
                            </label>
                        ))}
                    </div>
                </div>
                <div>
                    <Label>Designations</Label>
                    <DesignationPicker value={designations} onChange={setDesignations} options={designationOpts} />
                </div>
            </div>
        </Modal>
    )
}
