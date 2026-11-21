"use client"

// Assets → Kits & sizes.
//   Kits           — uniform / PPE kits (item groups × qty) for a site / designation
//   Issue kit      — pick a kit and employees (or recent joiners), preview each
//                    person's size per item, issue in one go
//   Employee sizes — each employee's size per item group; Excel template / upload
//   Item groups    — which assets are sizes of one item, stock and reorder level per size
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { ArrowLeft, Download, Loader2, Plus, Trash2, Upload, X } from "lucide-react"

type Variant = { assetId: string; name: string; assetCode: string; size: string | null; available: number; reorderLevel: number }
type Group = { groupName: string; variants: Variant[]; available: number }
type KitItem = { groupName: string; qty: number }
type Kit = { id: string; name: string; description: string | null; siteId: string | null; siteName: string | null; designation: string | null; items: KitItem[]; onJoining: boolean; isActive: boolean }
type Emp = { id: string; code: string; name: string; designation: string | null; site: string | null; sizes: Record<string, string> }
type Line = { groupName: string; qty: number; assetId: string | null; assetName: string | null; size: string | null; problem: string | null }

const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const ghost = "h-9 px-3 rounded-[9px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text2)] inline-flex items-center gap-1.5 disabled:opacity-50"
const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)]"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px] align-top"

async function api<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const r = await fetch(url, { method: init?.method ?? "GET", headers: init?.body ? { "Content-Type": "application/json" } : undefined, body: init?.body ? JSON.stringify(init.body) : undefined })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d?.error || "Something went wrong")
    return d as T
}

export default function KitsPage() {
    const [tab, setTab] = useState<"kits" | "issue" | "sizes" | "groups">("kits")
    const [kits, setKits] = useState<Kit[] | null>(null)
    const [groups, setGroups] = useState<Group[]>([])
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const load = useCallback(() => {
        api<{ kits: Kit[]; groups: Group[] }>("/api/assets/kits").then(d => { setKits(d.kits); setGroups(d.groups) }).catch(e => { toast.error(e.message); setKits([]) })
    }, [])
    useEffect(() => {
        load()
        fetch("/api/sites?isActive=true").then(r => r.ok ? r.json() : []).then(d => { const l = Array.isArray(d) ? d : d?.sites ?? []; setSites(l.map((s: any) => ({ id: s.id, name: s.name })).sort((a: any, b: any) => a.name.localeCompare(b.name))) }).catch(() => {})
    }, [load])

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
            <div>
                <Link href="/assets" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Assets</Link>
                <h1 className="text-[22px] font-bold text-[var(--text)] mt-1">Kits &amp; sizes</h1>
                <p className="text-[12.5px] text-[var(--text3)]">Uniform / PPE kits, employee sizes and stock by size.</p>
            </div>
            <div className="flex gap-1 border-b border-[var(--border)] overflow-x-auto">
                {([["kits", "Kits"], ["issue", "Issue kit"], ["sizes", "Employee sizes"], ["groups", "Item groups & sizes"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>
            {tab === "kits" && <KitsTab kits={kits} groups={groups} sites={sites} onChanged={load} />}
            {tab === "issue" && <IssueTab kits={(kits ?? []).filter(k => k.isActive)} sites={sites} />}
            {tab === "sizes" && <SizesTab groups={groups} sites={sites} />}
            {tab === "groups" && <GroupsTab groups={groups} onChanged={load} />}
        </div>
    )
}

// ── Kits ─────────────────────────────────────────────────────────────────────
function KitsTab({ kits, groups, sites, onChanged }: { kits: Kit[] | null; groups: Group[]; sites: { id: string; name: string }[]; onChanged: () => void }) {
    const [edit, setEdit] = useState<Partial<Kit> | null>(null)
    return (
        <>
            <div className="flex justify-between items-center">
                <p className="text-[12.5px] text-[var(--text3)]">A kit lists item groups and quantities; the size is picked per employee when it is issued.</p>
                <button className={btn} onClick={() => setEdit({ name: "", items: [{ groupName: groups[0]?.groupName ?? "", qty: 1 }], onJoining: false, isActive: true })}><Plus size={14} /> New kit</button>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full min-w-[720px]">
                    <thead><tr><th className={th}>Kit</th><th className={th}>Items</th><th className={th}>For</th><th className={th}>On joining</th><th className={th}></th></tr></thead>
                    <tbody>
                        {!kits && <tr><td className={td} colSpan={5}><Loader2 size={14} className="inline animate-spin" /> Loading…</td></tr>}
                        {kits && !kits.length && <tr><td className={`${td} text-center text-[var(--text3)] py-8`} colSpan={5}>No kits yet. Create one, e.g. “Site uniform: T-shirt × 2, Safety shoes × 1”.</td></tr>}
                        {kits?.map(k => (
                            <tr key={k.id} className={k.isActive ? "" : "opacity-50"}>
                                <td className={td}><b className="text-[var(--text)]">{k.name}</b>{k.description && <span className="block text-[11px] text-[var(--text3)]">{k.description}</span>}{!k.isActive && <span className="block text-[11px] text-[var(--text3)]">inactive</span>}</td>
                                <td className={td}>{k.items.map(i => `${i.groupName} × ${i.qty}`).join(", ")}</td>
                                <td className={td}>{[k.siteName ?? "All sites", k.designation ?? "All designations"].join(" · ")}</td>
                                <td className={td}>{k.onJoining ? "Yes" : "—"}</td>
                                <td className={`${td} text-right`}><button className="text-[12px] font-semibold text-[var(--accent)]" onClick={() => setEdit(k)}>Edit</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {edit && <KitModal kit={edit} groups={groups} sites={sites} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged() }} />}
        </>
    )
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[92vh] flex flex-col bg-white rounded-[14px] border border-[var(--border)] shadow-xl`}>
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)]">
                    <h3 className="text-[15px] font-semibold text-[var(--text)]">{title}</h3>
                    <button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-3 overflow-y-auto">{children}</div>
            </div>
        </div>, document.body)
}

function KitModal({ kit, groups, sites, onClose, onSaved }: { kit: Partial<Kit>; groups: Group[]; sites: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
    const [k, setK] = useState<Partial<Kit>>(kit)
    const [busy, setBusy] = useState(false)
    const items = k.items ?? []
    const setItem = (i: number, p: Partial<KitItem>) => setK(x => ({ ...x, items: items.map((it, j) => j === i ? { ...it, ...p } : it) }))
    async function save() {
        setBusy(true)
        try {
            const body = { ...k, siteName: sites.find(s => s.id === k.siteId)?.name ?? null }
            await api(k.id ? `/api/assets/kits/${k.id}` : "/api/assets/kits", { method: k.id ? "PUT" : "POST", body })
            toast.success("Kit saved"); onSaved()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    async function remove() {
        if (!k.id || !confirm(`Delete the kit "${k.name}"? Items already issued are not affected.`)) return
        setBusy(true)
        try { await api(`/api/assets/kits/${k.id}`, { method: "DELETE" }); toast.success("Kit deleted"); onSaved() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <Modal title={k.id ? "Edit kit" : "New kit"} onClose={onClose}>
            <label className="block text-[11px] font-semibold uppercase text-[var(--text3)]">Name<input value={k.name ?? ""} onChange={e => setK(x => ({ ...x, name: e.target.value }))} className={`${box} w-full`} placeholder="e.g. Site uniform" /></label>
            <label className="block text-[11px] font-semibold uppercase text-[var(--text3)]">Description<input value={k.description ?? ""} onChange={e => setK(x => ({ ...x, description: e.target.value }))} className={`${box} w-full`} /></label>
            <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold uppercase text-[var(--text3)]">Site<select value={k.siteId ?? ""} onChange={e => setK(x => ({ ...x, siteId: e.target.value || null }))} className={`${box} w-full`}><option value="">All sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <label className="text-[11px] font-semibold uppercase text-[var(--text3)]">Designation<input value={k.designation ?? ""} onChange={e => setK(x => ({ ...x, designation: e.target.value }))} placeholder="All designations" className={`${box} w-full`} /></label>
            </div>
            <div>
                <p className="text-[11px] font-semibold uppercase text-[var(--text3)] mb-1">Items</p>
                {items.map((it, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                        <select value={it.groupName} onChange={e => setItem(i, { groupName: e.target.value })} className={`${box} flex-1`}>
                            <option value="">Pick an item…</option>
                            {groups.map(g => <option key={g.groupName} value={g.groupName}>{g.groupName}{g.variants.length > 1 ? ` (${g.variants.length} sizes)` : ""} — {g.available} in stock</option>)}
                        </select>
                        <input type="number" min={1} max={100} value={it.qty} onChange={e => setItem(i, { qty: Number(e.target.value) || 1 })} className={`${box} w-20`} aria-label="Quantity" />
                        <button onClick={() => setK(x => ({ ...x, items: items.filter((_, j) => j !== i) }))} className="p-2 text-[var(--text3)] hover:text-red-600" aria-label="Remove item"><Trash2 size={14} /></button>
                    </div>
                ))}
                <button className={ghost} onClick={() => setK(x => ({ ...x, items: [...items, { groupName: "", qty: 1 }] }))}><Plus size={13} /> Add item</button>
            </div>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!k.onJoining} onChange={e => setK(x => ({ ...x, onJoining: e.target.checked }))} /> Give to new joiners (they show under Issue kit → New joiners)</label>
            {k.id && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={k.isActive !== false} onChange={e => setK(x => ({ ...x, isActive: e.target.checked }))} /> Active</label>}
            <div className="flex justify-between pt-2">
                {k.id ? <button className="text-[12.5px] font-semibold text-red-600" onClick={remove} disabled={busy}>Delete kit</button> : <span />}
                <div className="flex gap-2"><button className={ghost} onClick={onClose}>Cancel</button><button className={btn} onClick={save} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}Save</button></div>
            </div>
        </Modal>
    )
}

// ── Issue kit ────────────────────────────────────────────────────────────────
function IssueTab({ kits, sites }: { kits: Kit[]; sites: { id: string; name: string }[] }) {
    const [mode, setMode] = useState<"joiners" | "pick">("joiners")
    const [kitId, setKitId] = useState("")
    const [joiners, setJoiners] = useState<{ employeeId: string; name: string; code: string; joined: string | null; kitId: string; kitName: string; missing: string[] }[] | null>(null)
    const [windowDays, setWindowDays] = useState(30)
    const [siteId, setSiteId] = useState("")
    const [search, setSearch] = useState("")
    const [emps, setEmps] = useState<Emp[] | null>(null)
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [preview, setPreview] = useState<{ employeeId: string; name: string; code: string; lines: Line[] }[] | null>(null)
    const [ack, setAck] = useState(true)
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState<{ name: string; code: string; issued: string[]; problems: string[] }[] | null>(null)

    const loadJoiners = useCallback(() => {
        setJoiners(null)
        api<{ windowDays: number; joiners: any[] }>("/api/assets/kits/joiners").then(d => { setJoiners(d.joiners); setWindowDays(d.windowDays) }).catch(e => { toast.error(e.message); setJoiners([]) })
    }, [])
    useEffect(() => { if (mode === "joiners") loadJoiners() }, [mode, loadJoiners])
    useEffect(() => {
        if (mode !== "pick") return
        const t = setTimeout(() => {
            setEmps(null)
            api<{ employees: Emp[] }>(`/api/assets/sizes?${new URLSearchParams({ siteId, search })}`).then(d => setEmps(d.employees)).catch(() => setEmps([]))
        }, 250)
        return () => clearTimeout(t)
    }, [mode, siteId, search])
    useEffect(() => { setPicked(new Set()); setPreview(null); setResult(null) }, [mode, kitId])

    const joinerRows = (joiners ?? []).filter(j => !kitId || j.kitId === kitId)
    async function doPreview() {
        if (!kitId || !picked.size) return
        setBusy(true)
        try { setPreview((await api<{ preview: any[] }>("/api/assets/kits/issue", { method: "POST", body: { kitId, employeeIds: Array.from(picked), preview: true } })).preview) }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    async function doIssue() {
        if (!preview) return
        const ok = preview.filter(p => p.lines.some(l => l.assetId && !l.problem)).length
        if (!confirm(`Issue the kit to ${ok} employee(s)? Items with a problem are skipped.`)) return
        setBusy(true)
        try {
            const r = await api<{ results: any[] }>("/api/assets/kits/issue", { method: "POST", body: { kitId, employeeIds: Array.from(picked), acknowledged: ack } })
            setResult(r.results); setPreview(null); setPicked(new Set())
            toast.success(`Issued to ${r.results.filter(x => x.issued.length).length} employee(s)`)
            if (mode === "joiners") loadJoiners()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const list: { id: string; name: string; code: string; extra: string }[] = mode === "joiners"
        ? joinerRows.map(j => ({ id: j.employeeId, name: j.name, code: j.code, extra: `Joined ${j.joined ?? "—"} · ${j.kitName}: needs ${j.missing.join(", ")}` }))
        : (emps ?? []).map(e => ({ id: e.id, name: e.name, code: e.code, extra: [e.site, e.designation].filter(Boolean).join(" · ") }))
    const allOn = list.length > 0 && list.every(l => picked.has(l.id))

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3 bg-white border border-[var(--border)] rounded-[12px] p-3">
                <label className="text-[11px] font-semibold uppercase text-[var(--text3)]">Kit
                    <select value={kitId} onChange={e => setKitId(e.target.value)} className={`${box} block min-w-[220px]`}><option value="">{mode === "joiners" ? "All on-joining kits" : "Pick a kit…"}</option>{kits.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
                </label>
                <div className="flex gap-1">
                    <button className={`${ghost} ${mode === "joiners" ? "!border-[var(--accent)] !text-[var(--accent)]" : ""}`} onClick={() => setMode("joiners")}>New joiners</button>
                    <button className={`${ghost} ${mode === "pick" ? "!border-[var(--accent)] !text-[var(--accent)]" : ""}`} onClick={() => setMode("pick")}>Pick employees</button>
                </div>
                {mode === "pick" && (<>
                    <select value={siteId} onChange={e => setSiteId(e.target.value)} className={box} aria-label="Site"><option value="">All sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or code" className={`${box} flex-1 min-w-[160px]`} />
                </>)}
            </div>
            {mode === "joiners" && <p className="text-[12px] text-[var(--text3)]">Employees who joined in the last {windowDays} days (Assets → Settings), posted where an on-joining kit applies, and not yet given all of it.</p>}

            {!preview && (
                <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                        <thead><tr><th className={`${th} w-8`}><input type="checkbox" checked={allOn} aria-label="Tick all" onChange={() => setPicked(allOn ? new Set() : new Set(list.map(l => l.id)))} /></th><th className={th}>Employee</th><th className={th}>{mode === "joiners" ? "Kit" : "Site · Designation"}</th></tr></thead>
                        <tbody>
                            {((mode === "joiners" && !joiners) || (mode === "pick" && !emps)) && <tr><td className={td} colSpan={3}><Loader2 size={14} className="inline animate-spin" /> Loading…</td></tr>}
                            {list.length === 0 && ((mode === "joiners" && joiners) || (mode === "pick" && emps)) && <tr><td className={`${td} text-center text-[var(--text3)] py-8`} colSpan={3}>{mode === "joiners" ? "No recent joiners waiting for a kit." : "No employees found."}</td></tr>}
                            {list.map(l => (
                                <tr key={l.id} className={picked.has(l.id) ? "bg-[var(--accent)]/5" : ""}>
                                    <td className={td}><input type="checkbox" checked={picked.has(l.id)} aria-label={`Tick ${l.name}`} onChange={() => setPicked(p => { const n = new Set(p); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n })} /></td>
                                    <td className={td}><b className="text-[var(--text)]">{l.name}</b><span className="block text-[11px] text-[var(--text3)]">{l.code}</span></td>
                                    <td className={`${td} text-[var(--text2)]`}>{l.extra}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {!preview && (
                <div className="flex justify-end gap-2">
                    {mode === "joiners" && !kitId && picked.size > 0 && <span className="text-[12px] text-amber-700 self-center">Pick the kit to issue first.</span>}
                    <button className={btn} disabled={!kitId || !picked.size || busy} onClick={doPreview}>{busy && <Loader2 size={14} className="animate-spin" />}Check sizes ({picked.size})</button>
                </div>
            )}

            {preview && (
                <div className="space-y-3">
                    <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                        <table className="w-full min-w-[640px]">
                            <thead><tr><th className={th}>Employee</th><th className={th}>Will get</th></tr></thead>
                            <tbody>
                                {preview.map(p => (
                                    <tr key={p.employeeId}>
                                        <td className={td}><b>{p.name}</b><span className="block text-[11px] text-[var(--text3)]">{p.code}</span></td>
                                        <td className={td}>{p.lines.map((l, i) => (
                                            <span key={i} className={`inline-block mr-2 mb-1 px-2 py-0.5 rounded-full text-[11.5px] ${l.problem ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                                                {l.problem ? `${l.groupName}: ${l.problem}` : `${l.assetName}${l.size ? ` (${l.size})` : ""} × ${l.qty}`}
                                            </span>
                                        ))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[12px] text-[var(--text3)]">“Size not set”: add it under Employee sizes, then check again. Items with a problem are skipped; the rest are issued.</p>
                    <div className="flex flex-wrap justify-end items-center gap-3">
                        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /> Handed over in person</label>
                        <button className={ghost} onClick={() => setPreview(null)}>Back</button>
                        <button className={btn} disabled={busy} onClick={doIssue}>{busy && <Loader2 size={14} className="animate-spin" />}Issue kit</button>
                    </div>
                </div>
            )}
            {result && (
                <div className="bg-white border border-[var(--border)] rounded-[12px] p-3 space-y-1">
                    <p className="text-[13px] font-semibold text-[var(--text)]">Result</p>
                    {result.map((r, i) => (
                        <p key={i} className="text-[12.5px]"><b>{r.name}</b> ({r.code}): {r.issued.length ? <span className="text-green-700">{r.issued.join(", ")}</span> : "nothing issued"}{r.problems.length ? <span className="text-red-700"> · {r.problems.join("; ")}</span> : null}</p>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Employee sizes ───────────────────────────────────────────────────────────
function SizesTab({ groups, sites }: { groups: Group[]; sites: { id: string; name: string }[] }) {
    // Only items that come in more than one size need one.
    const sized = groups.filter(g => g.variants.length > 1)
    const [siteId, setSiteId] = useState("")
    const [search, setSearch] = useState("")
    const [emps, setEmps] = useState<Emp[] | null>(null)
    const [changes, setChanges] = useState<Record<string, string>>({}) // `${empId}|${group}` → size
    const [busy, setBusy] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)
    const load = useCallback(() => {
        setEmps(null)
        api<{ employees: Emp[] }>(`/api/assets/sizes?${new URLSearchParams({ siteId, search })}`).then(d => setEmps(d.employees)).catch(() => setEmps([]))
    }, [siteId, search])
    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
    const value = (e: Emp, g: string) => changes[`${e.id}|${g}`] ?? e.sizes[g] ?? ""
    const pending = Object.keys(changes).length

    async function save(extra?: Record<string, string>) {
        const all = { ...changes, ...(extra ?? {}) }
        const rows = Object.entries(all).map(([k, size]) => { const [employeeId, groupName] = k.split("|"); return { employeeId, groupName, size } })
        if (!rows.length) return
        setBusy(true)
        try { const r = await api<{ saved: number; removed: number }>("/api/assets/sizes", { method: "PUT", body: { sizes: rows } }); toast.success(`${r.saved} size(s) saved${r.removed ? `, ${r.removed} removed` : ""}`); setChanges({}); load() }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    async function template() {
        const mod: any = await import("exceljs"); const ExcelJS = mod.default ?? mod
        const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Sizes")
        ws.columns = [{ header: "Emp Code", key: "code", width: 14 }, { header: "Employee", key: "name", width: 28 }, { header: "Site", key: "site", width: 20 }, ...sized.map(g => ({ header: g.groupName, key: g.groupName, width: 14 }))]
        for (const e of emps ?? []) ws.addRow({ code: e.code, name: e.name, site: e.site ?? "", ...Object.fromEntries(sized.map(g => [g.groupName, value(e, g.groupName)])) })
        ws.getRow(1).font = { bold: true }
        ws.addRow([]); ws.addRow([`Sizes in stock: ${sized.map(g => `${g.groupName}: ${g.variants.map(v => v.size).filter(Boolean).join("/")}`).join(" · ")}`])
        const buf = await wb.xlsx.writeBuffer()
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf])); a.download = "Employee_Sizes.xlsx"; a.click()
    }
    async function upload(file: File) {
        try {
            const mod: any = await import("exceljs"); const ExcelJS = mod.default ?? mod
            const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer())
            const ws = wb.worksheets[0]; const head: string[] = []
            ws.getRow(1).eachCell((c: any, col: number) => { head[col] = String(c.value ?? "").trim() })
            const codeCol = head.findIndex(h => /emp(loyee)?\s*code/i.test(h ?? ""))
            if (codeCol < 0) throw new Error("No “Emp Code” column — use the downloaded template")
            const byCode = new Map((emps ?? []).map(e => [e.code.toLowerCase(), e.id]))
            const add: Record<string, string> = {}; let n = 0, unknown = 0
            ws.eachRow((row: any, r: number) => {
                if (r === 1) return
                const code = String(row.getCell(codeCol).value ?? "").trim().toLowerCase(); if (!code) return
                const id = byCode.get(code); if (!id) { unknown++; return }
                for (const g of sized) { const col = head.findIndex(h => h?.toLowerCase() === g.groupName.toLowerCase()); if (col < 0) continue; const v = String(row.getCell(col).value ?? "").trim(); add[`${id}|${g.groupName}`] = v; n++ }
            })
            setChanges(c => ({ ...c, ...add }))
            toast.success(`${n} size(s) read from the file${unknown ? ` · ${unknown} code(s) not in this list (pick All sites)` : ""}. Review, then Save.`)
        } catch (e: any) { toast.error(e.message) } finally { if (fileRef.current) fileRef.current.value = "" }
    }

    if (!sized.length) return <p className="text-[13px] text-[var(--text3)] bg-white border border-[var(--border)] rounded-[12px] p-4">No item comes in more than one size yet. Under “Item groups & sizes”, give the size assets (e.g. T shirt S, T shirt M…) the same group name.</p>
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <select value={siteId} onChange={e => setSiteId(e.target.value)} className={box} aria-label="Site"><option value="">All sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or code" className={`${box} flex-1 min-w-[160px]`} />
                <button className={ghost} onClick={template} disabled={!emps?.length}><Download size={14} /> Excel template</button>
                <button className={ghost} onClick={() => fileRef.current?.click()} disabled={!emps?.length}><Upload size={14} /> Upload Excel</button>
                <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
                <button className={btn} disabled={!pending || busy} onClick={() => save()}>{busy && <Loader2 size={14} className="animate-spin" />}Save {pending ? `(${pending})` : ""}</button>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto max-h-[65vh]">
                <table className="w-full">
                    <thead className="sticky top-0"><tr><th className={th}>Employee</th><th className={th}>Site</th>{sized.map(g => <th key={g.groupName} className={th}>{g.groupName}</th>)}</tr></thead>
                    <tbody>
                        {!emps && <tr><td className={td} colSpan={2 + sized.length}><Loader2 size={14} className="inline animate-spin" /> Loading…</td></tr>}
                        {emps?.map(e => (
                            <tr key={e.id}>
                                <td className={td}><b>{e.name}</b><span className="block text-[11px] text-[var(--text3)]">{e.code}</span></td>
                                <td className={`${td} text-[var(--text2)]`}>{e.site ?? "—"}</td>
                                {sized.map(g => (
                                    <td key={g.groupName} className={td}>
                                        <select value={value(e, g.groupName)} onChange={ev => setChanges(c => ({ ...c, [`${e.id}|${g.groupName}`]: ev.target.value }))}
                                            className={`h-8 rounded-[7px] border px-1.5 text-[12px] ${changes[`${e.id}|${g.groupName}`] !== undefined ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)] bg-white"}`} aria-label={`${g.groupName} size for ${e.name}`}>
                                            <option value="">—</option>
                                            {g.variants.map(v => v.size).filter(Boolean).map(s => <option key={s!} value={s!}>{s}</option>)}
                                            {value(e, g.groupName) && !g.variants.some(v => v.size === value(e, g.groupName)) && <option value={value(e, g.groupName)}>{value(e, g.groupName)} (not stocked)</option>}
                                        </select>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// ── Item groups & sizes ──────────────────────────────────────────────────────
function GroupsTab({ groups, onChanged }: { groups: Group[]; onChanged: () => void }) {
    const [edit, setEdit] = useState<Variant & { groupName: string } | null>(null)
    const sorted = useMemo(() => [...groups].sort((a, b) => b.variants.length - a.variants.length || a.groupName.localeCompare(b.groupName)), [groups])
    return (
        <div className="space-y-3">
            <p className="text-[12.5px] text-[var(--text3)]">Add each size as its own asset (e.g. “T shirt M”), then give the sizes the same group name and a size here. Low stock: set a reorder level per size — issuers get a daily message (Assets → Settings).</p>
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full min-w-[640px]">
                    <thead><tr><th className={th}>Item group</th><th className={th}>Asset</th><th className={th}>Size</th><th className={`${th} !text-right`}>In stock</th><th className={`${th} !text-right`}>Reorder at</th><th className={th}></th></tr></thead>
                    <tbody>
                        {sorted.flatMap(g => g.variants.map((v, i) => (
                            <tr key={v.assetId}>
                                <td className={td}>{i === 0 ? <b>{g.groupName}</b> : ""}</td>
                                <td className={td}>{v.name}<span className="block text-[11px] font-mono text-[var(--accent)]">{v.assetCode}</span></td>
                                <td className={td}>{v.size ?? "—"}</td>
                                <td className={`${td} text-right tabular-nums ${v.reorderLevel > 0 && v.available <= v.reorderLevel ? "text-red-600 font-semibold" : ""}`}>{v.available}</td>
                                <td className={`${td} text-right tabular-nums`}>{v.reorderLevel || "—"}</td>
                                <td className={`${td} text-right`}><button className="text-[12px] font-semibold text-[var(--accent)]" onClick={() => setEdit({ ...v, groupName: g.groupName })}>Edit</button></td>
                            </tr>
                        )))}
                    </tbody>
                </table>
            </div>
            {edit && <VariantModal v={edit} groups={groups} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged() }} />}
        </div>
    )
}

function VariantModal({ v, groups, onClose, onSaved }: { v: Variant & { groupName: string }; groups: Group[]; onClose: () => void; onSaved: () => void }) {
    const [groupName, setGroupName] = useState(v.groupName === v.name ? "" : v.groupName)
    const [size, setSize] = useState(v.size ?? "")
    const [reorder, setReorder] = useState(String(v.reorderLevel || ""))
    const [busy, setBusy] = useState(false)
    async function save() {
        setBusy(true)
        try { await api(`/api/assets/${v.assetId}/meta`, { method: "PUT", body: { groupName: groupName.trim() || null, size: size.trim() || null, reorderLevel: Number(reorder) || 0 } }); toast.success("Saved"); onSaved() }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <Modal title={`${v.name} (${v.assetCode})`} onClose={onClose}>
            <label className="block text-[11px] font-semibold uppercase text-[var(--text3)]">Item group
                <input list="asset-groups" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder={`Blank = its own group (${v.name})`} className={`${box} w-full`} />
                <datalist id="asset-groups">{groups.map(g => <option key={g.groupName} value={g.groupName} />)}</datalist>
            </label>
            <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold uppercase text-[var(--text3)]">Size<input value={size} onChange={e => setSize(e.target.value)} placeholder="e.g. M, 42, 8" className={`${box} w-full`} /></label>
                <label className="text-[11px] font-semibold uppercase text-[var(--text3)]">Reorder at<input type="number" min={0} value={reorder} onChange={e => setReorder(e.target.value)} placeholder="0 = no alert" className={`${box} w-full`} /></label>
            </div>
            <div className="flex justify-end gap-2 pt-2"><button className={ghost} onClick={onClose}>Cancel</button><button className={btn} onClick={save} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}Save</button></div>
        </Modal>
    )
}
