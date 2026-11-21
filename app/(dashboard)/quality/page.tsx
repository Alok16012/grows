"use client"

// Quality — the central defect library (one list for every customer), matching
// each project's defect spellings to it, the Pareto across all customers, and
// traceability search by lot / batch / machine / supplier / part number.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { BarChart3, BookOpen, Link2, Loader2, Plus, Search, Upload, X, ScanSearch, Check } from "lucide-react"
import { canAny } from "@/lib/can"

type Severity = "CRITICAL" | "MAJOR" | "MINOR"
type Defect = { id: string; code: string; name: string; severity: Severity; category: string | null; description: string | null; photoUrl: string | null; aliases: string[]; isActive: boolean; fields: number; projects: number }
type MapRow = { key: string; label: string; variants: string[]; projects: number; fields: number; qty: number; linkedTo: string | null; partlyLinked: boolean; suggestion: string | null }
type Tab = "pareto" | "library" | "map" | "trace"

const CATEGORIES = ["Welding", "Surface", "Dimension", "Assembly", "Paint / Coating", "Material", "Marking / Label", "Packing", "Other"]
const SEV_STYLE: Record<Severity, string> = {
    CRITICAL: "bg-[#fef2f2] text-[#dc2626] border-[#fecaca]",
    MAJOR: "bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]",
    MINOR: "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)]",
}
const card = "bg-white border border-[var(--border)] rounded-[14px]"
const input = "h-9 rounded-[9px] border border-[var(--border)] bg-white px-2.5 text-[13px] outline-none focus:border-[var(--accent)]"
const btn = "inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[9px] text-[13px] font-medium disabled:opacity-50"
const btnPrimary = `${btn} bg-[var(--accent)] text-white`
const btnGhost = `${btn} border border-[var(--border)] bg-white text-[var(--text2)] hover:bg-[var(--surface2)]`
const th = "px-3 py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide whitespace-nowrap"
const td = "px-3 py-2.5 text-[13px] align-middle"
const fmt = (n: number) => n.toLocaleString("en-IN")

async function api<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const r = await fetch(url, init?.body !== undefined ? { method: init.method ?? "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) } : { method: init?.method ?? "GET" })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d?.error || "Something went wrong")
    return d as T
}

const SevPill = ({ s }: { s: Severity }) => <span className={`inline-flex h-[22px] items-center rounded-full border px-2 text-[11px] font-semibold ${SEV_STYLE[s]}`}>{s[0] + s.slice(1).toLowerCase()}</span>

export default function QualityPage() {
    const { data: session, status } = useSession()
    const [tab, setTab] = useState<Tab>("pareto")
    const [defects, setDefects] = useState<Defect[]>([])
    const [canManage, setCanManage] = useState(false)
    const [libError, setLibError] = useState<string | null>(null)

    useEffect(() => {
        const t = new URLSearchParams(window.location.search).get("tab") as Tab | null
        if (t && ["pareto", "library", "map", "trace"].includes(t)) setTab(t)
    }, [])
    const go = (t: Tab) => { setTab(t); const u = new URL(window.location.href); u.searchParams.set("tab", t); window.history.replaceState(null, "", u.toString()) }

    const loadLib = useCallback(async () => {
        try { const d = await api<{ defects: Defect[]; canManage: boolean }>("/api/quality/defects"); setDefects(d.defects); setCanManage(d.canManage); setLibError(null) }
        catch (e: any) { setLibError(e.message) }
    }, [])
    useEffect(() => { if (status === "authenticated") loadLib() }, [status, loadLib])

    if (status === "authenticated" && !canAny(session, ["reports.view", "approvals.view", "projects.view"])) {
        return <div className="p-6 text-[13px] text-[var(--text3)]">You don&apos;t have access to Quality.</div>
    }

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: "pareto", label: "Pareto (all customers)", icon: <BarChart3 className="h-3.5 w-3.5" /> },
        { id: "library", label: `Defect library (${defects.filter(d => d.isActive).length})`, icon: <BookOpen className="h-3.5 w-3.5" /> },
        { id: "map", label: "Match project defects", icon: <Link2 className="h-3.5 w-3.5" /> },
        { id: "trace", label: "Traceability", icon: <ScanSearch className="h-3.5 w-3.5" /> },
    ]

    return (
        <div className="space-y-4 pb-10">
            <div>
                <h1 className="text-[26px] font-bold tracking-[-0.5px] text-[var(--text)]">Quality</h1>
                <p className="text-[13.5px] text-[var(--text3)] mt-1">One defect list for every customer, defects compared across projects, and lot / batch traceability.</p>
            </div>
            <div className="flex flex-wrap gap-2">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => go(t.id)}
                        className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-medium border transition-colors ${tab === t.id ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white text-[var(--text2)] border-[var(--border)] hover:bg-[var(--surface2)]"}`}>
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>
            {libError ? <div className={`${card} p-5 text-[13px] text-[#dc2626]`}>{libError}</div> : (<>
                {tab === "pareto" && <ParetoTab onMap={() => go("map")} />}
                {tab === "library" && <LibraryTab defects={defects} canManage={canManage} reload={loadLib} />}
                {tab === "map" && <MapTab defects={defects} canManage={canManage} reloadLib={loadLib} />}
                {tab === "trace" && <TraceTab />}
            </>)}
        </div>
    )
}

// ─── Pareto ──────────────────────────────────────────────────────────────────

function ParetoTab({ onMap }: { onMap: () => void }) {
    const today = new Date().toISOString().slice(0, 10)
    const [from, setFrom] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
    const [to, setTo] = useState(today)
    const [siteId, setSiteId] = useState("")
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => { fetch("/api/sites?isActive=true").then(r => r.json()).then(d => setSites(Array.isArray(d) ? d.sort((a: any, b: any) => a.name.localeCompare(b.name)) : [])).catch(() => {}) }, [])
    useEffect(() => {
        setLoading(true)
        const q = new URLSearchParams({ from, to, ...(siteId ? { siteId } : {}) })
        api(`/api/quality/pareto?${q}`).then(setData).catch(e => toast.error(e.message)).finally(() => setLoading(false))
    }, [from, to, siteId])

    const rows: any[] = data?.rows ?? []
    const max = rows[0]?.qty || 1
    const total = data?.totals?.mappedQty || 0
    let cum = 0
    const coverage = data?.totals?.qty ? Math.round((data.totals.mappedQty / data.totals.qty) * 100) : 0

    return (
        <div className="space-y-4">
            <div className={`${card} p-4 flex flex-wrap items-end gap-3`}>
                <label className="text-[12px] text-[var(--text3)]">From<br /><input type="date" className={input} value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
                <label className="text-[12px] text-[var(--text3)]">To<br /><input type="date" className={input} value={to} max={today} onChange={e => setTo(e.target.value)} /></label>
                <label className="text-[12px] text-[var(--text3)]">Site<br />
                    <select className={input} value={siteId} onChange={e => setSiteId(e.target.value)}>
                        <option value="">All sites</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </label>
                {loading && <Loader2 className="h-4 w-4 animate-spin text-[var(--text3)] mb-2.5" />}
            </div>
            {data && (<>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    {[
                        { l: "Approved reports", v: fmt(data.totals.reports) },
                        { l: "Defect pieces", v: fmt(data.totals.qty) },
                        { l: "Critical", v: fmt(data.totals.bySeverity?.CRITICAL ?? 0), c: "text-[#dc2626]" },
                        { l: "Major", v: fmt(data.totals.bySeverity?.MAJOR ?? 0), c: "text-[#c2410c]" },
                        { l: "Matched to library", v: `${coverage}%`, c: coverage < 80 ? "text-[#d97706]" : "text-[var(--success-strong)]" },
                    ].map(t => (
                        <div key={t.l} className={`${card} p-4`}>
                            <p className="text-[11.5px] text-[var(--text3)]">{t.l}</p>
                            <p className={`text-[22px] font-bold font-mono mt-0.5 ${t.c ?? "text-[var(--text)]"}`}>{t.v}</p>
                        </div>
                    ))}
                </div>
                <div className={`${card} p-4`}>
                    <p className="text-[14px] font-semibold text-[var(--text)]">Top defects across customers</p>
                    <p className="text-[12px] text-[var(--text3)] mb-3">Library defects only. Bars are pieces; the right column is the running share of all matched defects.</p>
                    {rows.length === 0 ? <p className="text-[13px] text-[var(--text3)]">No matched defects in this period yet. Build the library and match project defects first.</p> : (
                        <div className="space-y-1.5">
                            {rows.slice(0, 25).map(r => {
                                cum += r.qty
                                return (
                                    <div key={r.id} className="grid grid-cols-[minmax(0,220px)_1fr_auto] items-center gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-[12.5px] font-medium text-[var(--text)]" title={r.name}><span className="font-mono text-[var(--text3)] mr-1">{r.code}</span>{r.name}</p>
                                            <p className="text-[11px] text-[var(--text3)]">{r.projects} project{r.projects === 1 ? "" : "s"} · {r.reports} reports</p>
                                        </div>
                                        <div className="h-[18px] rounded bg-[var(--surface2)] overflow-hidden">
                                            <div className={`h-full rounded ${r.severity === "CRITICAL" ? "bg-[#dc2626]" : r.severity === "MAJOR" ? "bg-[#f97316]" : "bg-[var(--accent)]"}`} style={{ width: `${Math.max(2, (r.qty / max) * 100)}%` }} />
                                        </div>
                                        <p className="w-[110px] text-right text-[12px] font-mono text-[var(--text2)]">{fmt(r.qty)} · {total ? Math.round((cum / total) * 100) : 0}%</p>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
                {data.unmapped?.length > 0 && (
                    <div className={`${card} p-4`}>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div>
                                <p className="text-[14px] font-semibold text-[var(--text)]">Not matched to the library yet</p>
                                <p className="text-[12px] text-[var(--text3)]">These project defect names aren&apos;t in the Pareto above until they&apos;re matched.</p>
                            </div>
                            <button className={btnGhost} onClick={onMap}><Link2 className="h-4 w-4" /> Match them</button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {data.unmapped.slice(0, 30).map((u: any) => <span key={u.label} className="h-7 inline-flex items-center rounded-full bg-[var(--surface2)] px-2.5 text-[12px] text-[var(--text2)]">{u.label} <span className="ml-1 font-mono text-[11px] text-[var(--text3)]">{fmt(u.qty)}</span></span>)}
                        </div>
                    </div>
                )}
            </>)}
        </div>
    )
}

// ─── Library ─────────────────────────────────────────────────────────────────

function DefectForm({ initial, onSave, onClose, busy }: { initial?: Partial<Defect>; onSave: (d: any) => void; onClose: () => void; busy: boolean }) {
    const [name, setName] = useState(initial?.name ?? "")
    const [severity, setSeverity] = useState<Severity>(initial?.severity ?? "MINOR")
    const [category, setCategory] = useState(initial?.category ?? "")
    const [description, setDescription] = useState(initial?.description ?? "")
    const [photoUrl, setPhotoUrl] = useState(initial?.photoUrl ?? "")
    const [aliases, setAliases] = useState((initial?.aliases ?? []).join(", "))
    const [uploading, setUploading] = useState(false)

    async function upload(file: File) {
        setUploading(true)
        try {
            const fd = new FormData(); fd.append("file", file)
            const r = await fetch("/api/upload", { method: "POST", body: fd }); const d = await r.json().catch(() => ({}))
            if (r.ok && d.url) setPhotoUrl(d.url); else toast.error(d.error || "Upload failed")
        } finally { setUploading(false) }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="w-full max-w-lg rounded-[14px] bg-white p-5 space-y-3" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <p className="text-[15px] font-semibold text-[var(--text)]">{initial?.id ? `Edit ${initial.code}` : "Add a defect"}</p>
                    <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-[var(--surface2)]" aria-label="Close"><X className="h-4 w-4" /></button>
                </div>
                <label className="block text-[12px] text-[var(--text3)]">Name<input className={`${input} w-full mt-1`} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SCRATCH MARK" /></label>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block text-[12px] text-[var(--text3)]">Severity
                        <select className={`${input} w-full mt-1`} value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
                            <option value="CRITICAL">Critical — safety / function</option>
                            <option value="MAJOR">Major — likely rejection</option>
                            <option value="MINOR">Minor — cosmetic</option>
                        </select>
                    </label>
                    <label className="block text-[12px] text-[var(--text3)]">Category
                        <input className={`${input} w-full mt-1`} list="defect-cats" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Welding" />
                        <datalist id="defect-cats">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
                    </label>
                </div>
                <label className="block text-[12px] text-[var(--text3)]">How to recognise it (optional)<textarea className="w-full mt-1 rounded-[9px] border border-[var(--border)] p-2.5 text-[13px] outline-none focus:border-[var(--accent)]" rows={2} value={description} onChange={e => setDescription(e.target.value)} /></label>
                <label className="block text-[12px] text-[var(--text3)]">Other spellings used in projects (comma-separated)<input className={`${input} w-full mt-1`} value={aliases} onChange={e => setAliases(e.target.value)} placeholder="e.g. SCRATCH MARKS, SCRACHING" /></label>
                <div className="flex items-center gap-3">
                    {photoUrl ? <img src={photoUrl} alt="" className="h-14 w-14 rounded-[8px] object-cover border border-[var(--border)]" /> : null}
                    <label className={`${btnGhost} cursor-pointer`}>
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {photoUrl ? "Change reference photo" : "Add reference photo"}
                        <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = "" }} />
                    </label>
                    {photoUrl && <button className="text-[12px] text-[var(--text3)] underline" onClick={() => setPhotoUrl("")}>Remove</button>}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                    <button className={btnGhost} onClick={onClose}>Cancel</button>
                    <button className={btnPrimary} disabled={busy || name.trim().length < 2}
                        onClick={() => onSave({ name, severity, category, description, photoUrl, aliases: aliases.split(",").map(a => a.trim()).filter(Boolean) })}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
                    </button>
                </div>
            </div>
        </div>
    )
}

function LibraryTab({ defects, canManage, reload }: { defects: Defect[]; canManage: boolean; reload: () => void }) {
    const [edit, setEdit] = useState<Partial<Defect> | null>(null)
    const [busy, setBusy] = useState(false)
    const [q, setQ] = useState("")
    const [showOff, setShowOff] = useState(false)
    const shown = defects.filter(d => (showOff || d.isActive) && (!q || `${d.code} ${d.name} ${d.category ?? ""} ${d.aliases.join(" ")}`.toLowerCase().includes(q.toLowerCase())))

    async function save(body: any) {
        setBusy(true)
        try {
            const r = edit?.id ? await api<{ linked: number }>(`/api/quality/defects/${edit.id}`, { method: "PATCH", body }) : await api<{ linked: number }>("/api/quality/defects", { body })
            toast.success(`Saved${r.linked ? ` · ${r.linked} project columns linked` : ""}`)
            setEdit(null); reload()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    async function toggle(d: Defect) {
        try { await api(`/api/quality/defects/${d.id}`, { method: "PATCH", body: { isActive: !d.isActive } }); reload() } catch (e: any) { toast.error(e.message) }
    }

    return (
        <div className={card}>
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-[var(--border)]">
                <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text3)]" /><input className={`${input} pl-8 w-[240px]`} placeholder="Search defects…" value={q} onChange={e => setQ(e.target.value)} /></div>
                <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--text2)]"><input type="checkbox" className="accent-[var(--accent)]" checked={showOff} onChange={e => setShowOff(e.target.checked)} /> Show switched off</label>
                <div className="flex-1" />
                {canManage && <button className={btnPrimary} onClick={() => setEdit({})}><Plus className="h-4 w-4" /> Add defect</button>}
            </div>
            {shown.length === 0 ? (
                <p className="p-6 text-[13px] text-[var(--text3)]">No defects in the library yet. Add them here, or create them straight from project spellings in “Match project defects”.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-[var(--surface2)]"><tr>
                            <th className={th}>Code</th><th className={th}>Defect</th><th className={th}>Severity</th><th className={th}>Category</th>
                            <th className={`${th} text-right`}>Projects</th><th className={`${th} text-right`}>Columns</th>{canManage && <th className={th} />}
                        </tr></thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {shown.map(d => (
                                <tr key={d.id} className={d.isActive ? "" : "opacity-50"}>
                                    <td className={`${td} font-mono text-[12px] text-[var(--text3)]`}>{d.code}</td>
                                    <td className={td}>
                                        <div className="flex items-center gap-2">
                                            {d.photoUrl && <img src={d.photoUrl} alt="" className="h-8 w-8 rounded-[6px] object-cover border border-[var(--border)]" />}
                                            <div>
                                                <p className="font-medium text-[var(--text)]">{d.name}</p>
                                                {d.aliases.length > 0 && <p className="text-[11px] text-[var(--text3)] max-w-[420px] truncate" title={d.aliases.join(", ")}>also: {d.aliases.join(", ")}</p>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className={td}><SevPill s={d.severity} /></td>
                                    <td className={`${td} text-[var(--text2)]`}>{d.category ?? "—"}</td>
                                    <td className={`${td} text-right font-mono`}>{d.projects}</td>
                                    <td className={`${td} text-right font-mono`}>{d.fields}</td>
                                    {canManage && <td className={`${td} text-right whitespace-nowrap`}>
                                        <button className="text-[12px] text-[var(--accent)] mr-3" onClick={() => setEdit(d)}>Edit</button>
                                        <button className="text-[12px] text-[var(--text3)]" onClick={() => toggle(d)}>{d.isActive ? "Switch off" : "Switch on"}</button>
                                    </td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {edit && <DefectForm initial={edit} busy={busy} onClose={() => setEdit(null)} onSave={save} />}
        </div>
    )
}

// ─── Match project defects ───────────────────────────────────────────────────

function MapTab({ defects, canManage, reloadLib }: { defects: Defect[]; canManage: boolean; reloadLib: () => void }) {
    const [rows, setRows] = useState<MapRow[]>([])
    const [stats, setStats] = useState({ totalFields: 0, linkedFields: 0 })
    const [loading, setLoading] = useState(true)
    const [q, setQ] = useState("")
    const [filter, setFilter] = useState<"unlinked" | "all" | "suggested">("unlinked")
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [target, setTarget] = useState("")
    const [creating, setCreating] = useState<{ name: string } | null>(null)
    const [busy, setBusy] = useState(false)
    const libOf = useMemo(() => new Map(defects.map(d => [d.id, d])), [defects])
    const active = defects.filter(d => d.isActive)

    const load = useCallback(async () => {
        setLoading(true)
        try { const d = await api<{ rows: MapRow[]; totalFields: number; linkedFields: number }>("/api/quality/mapping"); setRows(d.rows); setStats({ totalFields: d.totalFields, linkedFields: d.linkedFields }) }
        catch (e: any) { toast.error(e.message) } finally { setLoading(false) }
    }, [])
    useEffect(() => { load() }, [load])

    const shown = rows.filter(r =>
        (filter === "all" || (filter === "unlinked" && !r.linkedTo) || (filter === "suggested" && !r.linkedTo && r.suggestion))
        && (!q || r.variants.some(v => v.toLowerCase().includes(q.toLowerCase()))))
    const suggested = rows.filter(r => !r.linkedTo && r.suggestion)
    const toggle = (k: string) => setPicked(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })
    const pickedRows = rows.filter(r => picked.has(r.key))

    async function link(body: any, msg: string) {
        setBusy(true)
        try {
            const r = await api<{ linked?: number; unlinked?: number }>("/api/quality/mapping", { body })
            toast.success(`${msg}: ${r.linked ?? r.unlinked ?? 0} project columns`)
            setPicked(new Set()); setTarget(""); setCreating(null); await Promise.all([load(), reloadLib()])
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    async function acceptSuggestions() {
        const groups = new Map<string, string[]>()
        for (const r of suggested) groups.set(r.suggestion!, [...(groups.get(r.suggestion!) ?? []), r.key])
        setBusy(true)
        let n = 0
        try { for (const [defectTypeId, keys] of Array.from(groups)) { const r = await api<{ linked: number }>("/api/quality/mapping", { body: { keys, defectTypeId } }); n += r.linked } toast.success(`Linked ${n} project columns`) }
        catch (e: any) { toast.error(e.message) }
        finally { setBusy(false); await Promise.all([load(), reloadLib()]) }
    }

    const pct = stats.totalFields ? Math.round((stats.linkedFields / stats.totalFields) * 100) : 0

    return (
        <div className="space-y-3">
            <div className={`${card} p-4`}>
                <p className="text-[13px] text-[var(--text2)]"><b className="font-mono">{fmt(stats.linkedFields)}</b> of <b className="font-mono">{fmt(stats.totalFields)}</b> project defect columns are matched to the library ({pct}%). Each row is one defect name; different spellings of the same name are grouped. Matching never changes a project&apos;s form or its recorded data.</p>
                <div className="mt-2 h-2 rounded-full bg-[var(--surface2)] overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} /></div>
            </div>
            <div className={card}>
                <div className="flex flex-wrap items-center gap-2 p-3 border-b border-[var(--border)]">
                    <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text3)]" /><input className={`${input} pl-8 w-[220px]`} placeholder="Search spellings…" value={q} onChange={e => setQ(e.target.value)} /></div>
                    <select className={input} value={filter} onChange={e => setFilter(e.target.value as any)}>
                        <option value="unlinked">Not matched</option>
                        <option value="suggested">Not matched, with a suggestion</option>
                        <option value="all">All</option>
                    </select>
                    <div className="flex-1" />
                    {canManage && suggested.length > 0 && <button className={btnGhost} disabled={busy} onClick={acceptSuggestions}><Check className="h-4 w-4" /> Accept {suggested.length} suggestions</button>}
                </div>
                {canManage && picked.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 p-3 bg-[var(--accent-light)] border-b border-[var(--border)]">
                        <span className="text-[12.5px] text-[var(--text)]"><b>{picked.size}</b> selected</span>
                        <select className={input} value={target} onChange={e => setTarget(e.target.value)}>
                            <option value="">Match to library defect…</option>
                            {active.map(d => <option key={d.id} value={d.id}>{d.code} {d.name}</option>)}
                        </select>
                        <button className={btnPrimary} disabled={!target || busy} onClick={() => link({ keys: Array.from(picked), defectTypeId: target }, "Matched")}>Match</button>
                        <span className="text-[12px] text-[var(--text3)]">or</span>
                        <button className={btnGhost} disabled={busy} onClick={() => setCreating({ name: pickedRows[0]?.label ?? "" })}><Plus className="h-4 w-4" /> New library defect from these</button>
                        <button className="text-[12px] text-[var(--text3)] underline" disabled={busy} onClick={() => link({ keys: Array.from(picked), unlink: true }, "Unmatched")}>Unmatch</button>
                        <button className="ml-auto text-[12px] text-[var(--text3)]" onClick={() => setPicked(new Set())}>Clear</button>
                    </div>
                )}
                {loading ? <div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div> : (
                    <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
                        <table className="w-full">
                            <thead className="bg-[var(--surface2)] sticky top-0 z-[1]"><tr>
                                {canManage && <th className={`${th} w-8`} />}
                                <th className={th}>Defect name (spellings)</th><th className={`${th} text-right`}>Projects</th><th className={`${th} text-right`}>Pieces recorded</th><th className={th}>Library defect</th>
                            </tr></thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {shown.slice(0, 400).map(r => {
                                    const linked = r.linkedTo ? libOf.get(r.linkedTo) : null
                                    const sug = !linked && r.suggestion ? libOf.get(r.suggestion) : null
                                    return (
                                        <tr key={r.key} className={picked.has(r.key) ? "bg-[var(--accent-light)]/60" : "hover:bg-[var(--surface2)]/60"} onClick={() => canManage && toggle(r.key)}>
                                            {canManage && <td className={td} onClick={e => e.stopPropagation()}><input type="checkbox" className="accent-[var(--accent)]" checked={picked.has(r.key)} onChange={() => toggle(r.key)} /></td>}
                                            <td className={td}>
                                                <p className="font-medium text-[var(--text)]">{r.label}</p>
                                                {r.variants.length > 1 && <p className="text-[11px] text-[var(--text3)]">also: {r.variants.slice(1).join(", ")}</p>}
                                            </td>
                                            <td className={`${td} text-right font-mono`}>{r.projects}</td>
                                            <td className={`${td} text-right font-mono`}>{fmt(r.qty)}</td>
                                            <td className={td}>
                                                {linked ? <span className="inline-flex items-center gap-1.5 text-[12.5px]"><Check className="h-3.5 w-3.5 text-[var(--success-strong)]" /> {linked.code} {linked.name} <SevPill s={linked.severity} /></span>
                                                    : sug ? <span className="text-[12px] text-[var(--accent)]">Suggested: {sug.code} {sug.name}</span>
                                                    : r.partlyLinked ? <span className="text-[12px] text-[#d97706]">Partly matched</span>
                                                    : <span className="text-[12px] text-[var(--text3)]">—</span>}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                        {shown.length > 400 && <p className="p-3 text-[12px] text-[var(--text3)]">Showing 400 of {shown.length}. Search to narrow down.</p>}
                    </div>
                )}
            </div>
            {creating && <DefectForm initial={{ name: creating.name }} busy={busy} onClose={() => setCreating(null)}
                onSave={d => link({ keys: Array.from(picked), create: d }, "Created and matched")} />}
        </div>
    )
}

// ─── Traceability ────────────────────────────────────────────────────────────

function TraceTab() {
    const [q, setQ] = useState("")
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    async function search(e?: React.FormEvent) {
        e?.preventDefault()
        if (q.trim().length < 2) return
        setLoading(true)
        try { setData(await api(`/api/quality/trace?q=${encodeURIComponent(q.trim())}`)) } catch (err: any) { toast.error(err.message) } finally { setLoading(false) }
    }
    return (
        <div className="space-y-3">
            <form onSubmit={search} className={`${card} p-4 flex flex-wrap items-center gap-2`}>
                <div className="relative flex-1 min-w-[240px]"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text3)]" /><input className={`${input} pl-8 w-full`} placeholder="Lot / batch, machine, supplier or part number…" value={q} onChange={e => setQ(e.target.value)} /></div>
                <button className={btnPrimary} disabled={loading || q.trim().length < 2}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search</button>
                <p className="w-full text-[11.5px] text-[var(--text3)]">Searches form fields with the role Lot / Batch No., Machine / Line, Supplier, Customer Part No. or Part Number (Form Builder), and fields named like Lot, Batch, Heat, Serial, Machine or Supplier. Inspectors can scan these fields with the camera.</p>
            </form>
            {data && (
                <div className={card}>
                    <div className="flex flex-wrap gap-4 p-4 border-b border-[var(--border)] text-[13px]">
                        <span><b className="font-mono">{data.rows.length}</b> reports{data.truncated ? " (first 200)" : ""}</span>
                        <span>Inspected <b className="font-mono">{fmt(data.totals?.inspected ?? 0)}</b></span>
                        <span>Rework <b className="font-mono text-[#d97706]">{fmt(data.totals?.rework ?? 0)}</b></span>
                        <span>Rejected <b className="font-mono text-[#dc2626]">{fmt(data.totals?.rejected ?? 0)}</b></span>
                    </div>
                    {data.rows.length === 0 ? <p className="p-6 text-[13px] text-[var(--text3)]">No reports found. Projects need a lot / batch field first: add one in the project&apos;s Form Builder and set its role to “Lot / Batch No.”.</p> : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-[var(--surface2)]"><tr>
                                    <th className={th}>Date</th><th className={th}>Project / site</th><th className={th}>Matched</th><th className={th}>Part</th>
                                    <th className={`${th} text-right`}>Inspected</th><th className={`${th} text-right`}>Rework</th><th className={`${th} text-right`}>Rejected</th><th className={th}>Top defects</th><th className={th}>Status</th>
                                </tr></thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {data.rows.map((r: any) => (
                                        <tr key={r.id} className="hover:bg-[var(--surface2)]/60">
                                            <td className={`${td} whitespace-nowrap`}><Link href={`/approvals/${r.id}`} className="text-[var(--accent)]">{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString("en-GB") : "—"}</Link></td>
                                            <td className={td}><p className="font-medium">{r.project}</p><p className="text-[11px] text-[var(--text3)]">{r.site ?? ""}{r.inspector ? ` · ${r.inspector}` : ""}</p></td>
                                            <td className={`${td} text-[12px]`}>{r.matches.map((m: any) => <p key={m.label}><span className="text-[var(--text3)]">{m.label}:</span> <b>{m.value}</b></p>)}</td>
                                            <td className={`${td} text-[12px]`}>{r.part || "—"}</td>
                                            <td className={`${td} text-right font-mono`}>{fmt(r.inspected || 0)}</td>
                                            <td className={`${td} text-right font-mono text-[#d97706]`}>{fmt(r.rework || 0)}</td>
                                            <td className={`${td} text-right font-mono text-[#dc2626]`}>{fmt(r.rejected || 0)}</td>
                                            <td className={`${td} text-[11.5px] text-[var(--text2)]`}>{r.topDefects.map((d: any) => `${d.name} ${d.qty}`).join(", ") || "—"}</td>
                                            <td className={`${td} text-[12px] capitalize`}>{r.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
