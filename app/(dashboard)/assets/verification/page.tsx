"use client"

// Assets → Verification. Start a physical count (all assets or one site),
// enter what is on the shelf, see the differences, close it — optionally
// setting stock to the count (posted to the stock ledger as adjustments).
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Download, Loader2, Plus } from "lucide-react"

type V = { id: string; verificationNo: string; name: string; siteName: string | null; status: string; startedAt: string; closedAt: string | null; lines: number; counted: number; differences: number }
type L = { id: string; assetId: string; assetCode: string; name: string; category: string; size: string | null; expectedQty: number; countedQty: number | null; condition: string | null; note: string | null; availableNow: number }
type Detail = { id: string; verificationNo: string; name: string; siteName: string | null; status: string; startedAt: string; lines: L[] }

const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)]"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px] align-middle"
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"

async function api<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const r = await fetch(url, { method: init?.method ?? "GET", headers: init?.body ? { "Content-Type": "application/json" } : undefined, body: init?.body ? JSON.stringify(init.body) : undefined })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d?.error || "Something went wrong")
    return d as T
}

export default function VerificationPage() {
    const [list, setList] = useState<V[] | null>(null)
    const [open, setOpen] = useState<string | null>(null)
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [name, setName] = useState(`${new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" })} stock count`)
    const [siteId, setSiteId] = useState("")
    const [busy, setBusy] = useState(false)
    const load = useCallback(() => { api<{ verifications: V[] }>("/api/assets/verifications").then(d => setList(d.verifications)).catch(e => { toast.error(e.message); setList([]) }) }, [])
    useEffect(() => {
        load()
        fetch("/api/sites?isActive=true").then(r => r.ok ? r.json() : []).then(d => { const l = Array.isArray(d) ? d : d?.sites ?? []; setSites(l.map((s: any) => ({ id: s.id, name: s.name })).sort((a: any, b: any) => a.name.localeCompare(b.name))) }).catch(() => {})
    }, [load])
    async function start() {
        setBusy(true)
        try { const v = await api<{ id: string }>("/api/assets/verifications", { method: "POST", body: { name, siteId: siteId || null, siteName: sites.find(s => s.id === siteId)?.name ?? null } }); toast.success("Verification started"); load(); setOpen(v.id) }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }

    if (open) return <CountView id={open} onBack={() => { setOpen(null); load() }} />
    return (
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
            <div>
                <Link href="/assets" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Assets</Link>
                <h1 className="text-[22px] font-bold text-[var(--text)] mt-1">Physical verification</h1>
                <p className="text-[12.5px] text-[var(--text3)]">Count what is in the store against the system, then close — optionally setting stock to the count.</p>
            </div>
            <div className="flex flex-wrap items-end gap-2 bg-white border border-[var(--border)] rounded-[12px] p-3">
                <label className="text-[11px] font-semibold uppercase text-[var(--text3)] flex-1 min-w-[220px]">Name<input value={name} onChange={e => setName(e.target.value)} className={`${box} w-full`} /></label>
                <label className="text-[11px] font-semibold uppercase text-[var(--text3)]">Assets<select value={siteId} onChange={e => setSiteId(e.target.value)} className={`${box} block`}><option value="">All active assets</option>{sites.map(s => <option key={s.id} value={s.id}>Set to {s.name}</option>)}</select></label>
                <button onClick={start} disabled={busy || !name.trim()} className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><Plus size={14} /> Start count</button>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full min-w-[640px]">
                    <thead><tr><th className={th}>Verification</th><th className={th}>Assets</th><th className={th}>Counted</th><th className={th}>Differences</th><th className={th}>Status</th><th className={th}></th></tr></thead>
                    <tbody>
                        {!list && <tr><td className={td} colSpan={6}><Loader2 size={14} className="inline animate-spin" /> Loading…</td></tr>}
                        {list && !list.length && <tr><td className={`${td} text-center text-[var(--text3)] py-8`} colSpan={6}>No verifications yet.</td></tr>}
                        {list?.map(v => (
                            <tr key={v.id}>
                                <td className={td}><b>{v.name}</b><span className="block text-[11px] text-[var(--text3)] font-mono">{v.verificationNo} · {new Date(v.startedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}{v.siteName ? ` · ${v.siteName}` : ""}</span></td>
                                <td className={td}>{v.lines}</td>
                                <td className={td}>{v.counted} / {v.lines}</td>
                                <td className={`${td} ${v.differences ? "text-red-600 font-semibold" : ""}`}>{v.differences}</td>
                                <td className={td}><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${v.status === "OPEN" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>{v.status === "OPEN" ? "Counting" : "Closed"}</span></td>
                                <td className={`${td} text-right`}><button onClick={() => setOpen(v.id)} className="text-[12px] font-semibold text-[var(--accent)]">{v.status === "OPEN" ? "Count" : "View"}</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function CountView({ id, onBack }: { id: string; onBack: () => void }) {
    const [d, setD] = useState<Detail | null>(null)
    const [edits, setEdits] = useState<Record<string, { countedQty?: string; condition?: string; note?: string }>>({})
    const [busy, setBusy] = useState(false)
    const [q, setQ] = useState("")
    const [diffOnly, setDiffOnly] = useState(false)
    const load = useCallback(() => { api<Detail>(`/api/assets/verifications/${id}`).then(x => { setD(x); setEdits({}) }).catch(e => toast.error(e.message)) }, [id])
    useEffect(() => { load() }, [load])
    const val = (l: L) => edits[l.id]?.countedQty ?? (l.countedQty != null ? String(l.countedQty) : "")
    const isOpen = d?.status === "OPEN"
    const rows = useMemo(() => {
        const t = q.trim().toLowerCase()
        return (d?.lines ?? []).filter(l => (!t || [l.assetCode, l.name, l.category].some(v => v.toLowerCase().includes(t))) && (!diffOnly || (val(l) !== "" && Number(val(l)) !== l.expectedQty)))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [d, q, diffOnly, edits])
    const pending = Object.keys(edits).length
    const counted = (d?.lines ?? []).filter(l => val(l) !== "").length
    const diffs = (d?.lines ?? []).filter(l => val(l) !== "" && Number(val(l)) !== l.expectedQty)

    async function save() {
        setBusy(true)
        try {
            const counts = Object.entries(edits).map(([lineId, e]) => { const l = d!.lines.find(x => x.id === lineId)!; return { lineId, countedQty: e.countedQty !== undefined ? (e.countedQty === "" ? null : Number(e.countedQty)) : l.countedQty, condition: e.condition ?? l.condition, note: e.note ?? l.note } })
            const r = await api<{ saved: number }>(`/api/assets/verifications/${id}`, { method: "PUT", body: { counts } })
            toast.success(`${r.saved} count(s) saved`); load()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    async function close(adjust: boolean) {
        if (pending) { toast.error("Save your counts first"); return }
        if (!confirm(adjust ? `Close and set stock to the count for ${counted} asset(s)? ${diffs.length} difference(s) will be posted to the stock ledger.` : "Close without changing stock?")) return
        setBusy(true)
        try { const r = await api<{ counted: number; adjusted: number }>(`/api/assets/verifications/${id}`, { method: "POST", body: { close: true, adjust } }); toast.success(`Closed · ${r.adjusted} stock adjustment(s)`); load() }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    async function download() {
        if (!d) return
        const mod: any = await import("exceljs"); const ExcelJS = mod.default ?? mod
        const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Count")
        ws.columns = [{ header: "Asset Code", key: "c", width: 12 }, { header: "Name", key: "n", width: 26 }, { header: "Size", key: "s", width: 8 }, { header: "System", key: "e", width: 9 }, { header: "Counted", key: "q", width: 9 }, { header: "Difference", key: "d", width: 11 }, { header: "Condition", key: "k", width: 11 }, { header: "Note", key: "o", width: 30 }]
        for (const l of d.lines) ws.addRow({ c: l.assetCode, n: l.name, s: l.size ?? "", e: l.expectedQty, q: l.countedQty ?? "", d: l.countedQty != null ? l.countedQty - l.expectedQty : "", k: l.condition ?? "", o: l.note ?? "" })
        ws.getRow(1).font = { bold: true }
        const buf = await wb.xlsx.writeBuffer(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf])); a.download = `${d.verificationNo}_${d.name.replace(/[^\w]+/g, "_")}.xlsx`; a.click()
    }

    if (!d) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <button onClick={onBack} className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Verifications</button>
                    <h1 className="text-[20px] font-bold text-[var(--text)] mt-1">{d.name} <span className="font-mono text-[13px] text-[var(--text3)]">{d.verificationNo}</span></h1>
                    <p className="text-[12.5px] text-[var(--text3)]">{counted} of {d.lines.length} counted · <span className={diffs.length ? "text-red-600 font-semibold" : ""}>{diffs.length} difference(s)</span>{d.siteName ? ` · ${d.siteName}` : ""}{isOpen ? "" : " · closed"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={download} className="h-9 px-3 rounded-[9px] border border-[var(--border)] bg-white text-[13px] inline-flex items-center gap-1.5"><Download size={14} /> Excel</button>
                    {isOpen && <button onClick={save} disabled={!pending || busy} className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50">Save counts {pending ? `(${pending})` : ""}</button>}
                    {isOpen && <button onClick={() => close(true)} disabled={busy || !counted} className="h-9 px-3 rounded-[9px] border border-[var(--accent)] text-[var(--accent)] bg-white text-[13px] font-semibold disabled:opacity-50">Close &amp; set stock to count</button>}
                    {isOpen && <button onClick={() => close(false)} disabled={busy || !counted} className="h-9 px-3 rounded-[9px] border border-[var(--border)] bg-white text-[13px] disabled:opacity-50">Close only</button>}
                </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search code or name" className={`${box} flex-1 min-w-[200px]`} />
                <label className="text-[12.5px] text-[var(--text2)] inline-flex items-center gap-1.5"><input type="checkbox" checked={diffOnly} onChange={e => setDiffOnly(e.target.checked)} /> Only differences</label>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full min-w-[820px]">
                    <thead><tr><th className={th}>Asset</th><th className={`${th} !text-right`}>System</th><th className={th}>Counted</th><th className={`${th} !text-right`}>Difference</th><th className={th}>Condition</th><th className={th}>Note</th></tr></thead>
                    <tbody>
                        {rows.map(l => {
                            const v = val(l), diff = v === "" ? null : Number(v) - l.expectedQty
                            const set = (p: { countedQty?: string; condition?: string; note?: string }) => setEdits(e => ({ ...e, [l.id]: { ...e[l.id], ...p } }))
                            return (
                                <tr key={l.id}>
                                    <td className={td}><b>{l.name}</b>{l.size ? ` · ${l.size}` : ""}<span className="block text-[11px] font-mono text-[var(--accent)]">{l.assetCode}</span></td>
                                    <td className={`${td} text-right tabular-nums`}>{l.expectedQty}{l.availableNow !== l.expectedQty && isOpen && <span className="block text-[10.5px] text-[var(--text3)]">now {l.availableNow}</span>}</td>
                                    <td className={td}><input type="number" min={0} disabled={!isOpen} value={v} onChange={e => set({ countedQty: e.target.value })} className={`${box} w-24 text-right`} aria-label={`Counted ${l.assetCode}`} /></td>
                                    <td className={`${td} text-right tabular-nums font-semibold ${diff == null ? "" : diff === 0 ? "text-green-700" : "text-red-600"}`}>{diff == null ? "—" : diff > 0 ? `+${diff}` : diff}</td>
                                    <td className={td}><select disabled={!isOpen} value={edits[l.id]?.condition ?? l.condition ?? ""} onChange={e => set({ condition: e.target.value })} className={box} aria-label={`Condition ${l.assetCode}`}><option value="">—</option><option>Good</option><option>Fair</option><option>Damaged</option></select></td>
                                    <td className={td}><input disabled={!isOpen} value={edits[l.id]?.note ?? l.note ?? ""} onChange={e => set({ note: e.target.value })} className={`${box} w-full min-w-[160px]`} aria-label={`Note ${l.assetCode}`} /></td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
