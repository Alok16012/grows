"use client"

// Assets → Register. Every asset with its details, stock and what is out with
// employees; edit group / size / site / warranty / recovery cost; download the
// register as Excel; print QR labels for the ticked assets.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { ArrowLeft, Download, Loader2, QrCode, X } from "lucide-react"

type Row = {
    id: string; assetCode: string; name: string; category: string; description: string | null; serialNo: string | null
    quantity: number; available: number; issued: number; holders: number; condition: string
    purchaseDate: string | null; purchaseCost: number | null; vendor: string | null; location: string | null; isActive: boolean
    size: string | null; reorderLevel: number; trackSerial: boolean
    groupName: string | null; recoveryCost: number | null; warrantyUntil: string | null; siteId: string | null; siteName: string | null
}
const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)] whitespace-nowrap"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px] align-top"
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const inr = (n: number | null) => n == null ? "—" : "₹" + Math.round(n).toLocaleString("en-IN")
const day = (s: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"

function warrantyState(s: string | null): "none" | "expired" | "soon" | "ok" {
    if (!s) return "none"
    const d = new Date(s).getTime(), now = Date.now()
    if (d < now) return "expired"
    return d - now < 30 * 86_400_000 ? "soon" : "ok"
}

export default function RegisterPage() {
    const [rows, setRows] = useState<Row[] | null>(null)
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [q, setQ] = useState("")
    const [cat, setCat] = useState("")
    const [site, setSite] = useState("")
    const [warranty, setWarranty] = useState("")
    const [showInactive, setShowInactive] = useState(false)
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [edit, setEdit] = useState<Row | null>(null)
    const load = useCallback(() => { fetch("/api/assets/register").then(r => r.json()).then(d => setRows(d.assets ?? [])).catch(() => setRows([])) }, [])
    useEffect(() => {
        load()
        fetch("/api/sites?isActive=true").then(r => r.ok ? r.json() : []).then(d => { const l = Array.isArray(d) ? d : d?.sites ?? []; setSites(l.map((s: any) => ({ id: s.id, name: s.name })).sort((a: any, b: any) => a.name.localeCompare(b.name))) }).catch(() => {})
    }, [load])

    const cats = useMemo(() => Array.from(new Set((rows ?? []).map(r => r.category))).sort(), [rows])
    const list = useMemo(() => {
        const t = q.trim().toLowerCase()
        return (rows ?? []).filter(r => (showInactive || r.isActive) && (!cat || r.category === cat) && (!site || r.siteId === site)
            && (!warranty || warrantyState(r.warrantyUntil) === warranty)
            && (!t || [r.assetCode, r.name, r.serialNo ?? "", r.vendor ?? "", r.groupName ?? "", r.location ?? ""].some(v => v.toLowerCase().includes(t))))
    }, [rows, q, cat, site, warranty, showInactive])
    const value = list.reduce((s, r) => s + (r.purchaseCost ?? 0) * r.quantity, 0)

    async function download() {
        const mod: any = await import("exceljs"); const ExcelJS = mod.default ?? mod
        const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Asset register", { views: [{ state: "frozen", ySplit: 1 }] })
        ws.columns = [
            { header: "Asset Code", key: "assetCode", width: 12 }, { header: "Name", key: "name", width: 26 }, { header: "Category", key: "category", width: 16 },
            { header: "Item group", key: "groupName", width: 16 }, { header: "Size", key: "size", width: 8 }, { header: "Serial No", key: "serialNo", width: 16 },
            { header: "Site", key: "siteName", width: 18 }, { header: "Location", key: "location", width: 16 }, { header: "Owned", key: "quantity", width: 8 },
            { header: "In stock", key: "available", width: 9 }, { header: "With employees", key: "issued", width: 12 }, { header: "Employees", key: "holders", width: 10 },
            { header: "Reorder at", key: "reorderLevel", width: 10 }, { header: "Condition", key: "condition", width: 10 }, { header: "Purchase date", key: "purchaseDate", width: 13 },
            { header: "Purchase cost (₹)", key: "purchaseCost", width: 14 }, { header: "Value (₹)", key: "value", width: 13 }, { header: "Recovery cost (₹)", key: "recoveryCost", width: 14 },
            { header: "Vendor", key: "vendor", width: 18 }, { header: "Warranty until", key: "warrantyUntil", width: 13 }, { header: "Active", key: "active", width: 8 },
        ]
        for (const r of list) ws.addRow({ ...r, purchaseDate: r.purchaseDate?.slice(0, 10) ?? "", warrantyUntil: r.warrantyUntil?.slice(0, 10) ?? "", value: (r.purchaseCost ?? 0) * r.quantity, active: r.isActive ? "Yes" : "No" })
        ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
        ws.getRow(1).eachCell((c: any) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A1F4F" } } })
        for (const k of ["purchaseCost", "value", "recoveryCost"]) ws.getColumn(k).numFmt = "#,##0.00"
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 21 } }
        const buf = await wb.xlsx.writeBuffer()
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf])); a.download = `Asset_Register_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
    }
    async function printLabels() {
        const chosen = list.filter(r => picked.has(r.id))
        if (!chosen.length) return
        const QR: any = await import("qrcode")
        const toUrl = QR.toDataURL ?? QR.default?.toDataURL
        const cells = await Promise.all(chosen.map(async r => {
            const url = await toUrl(`${r.assetCode}|${r.name}${r.serialNo ? `|${r.serialNo}` : ""}`, { margin: 1, width: 180 })
            const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!))
            return `<div class="l"><img src="${url}"/><div><b>${esc(r.assetCode)}</b><br/>${esc(r.name)}${r.size ? ` · ${esc(r.size)}` : ""}${r.serialNo ? `<br/><small>S/N ${esc(r.serialNo)}</small>` : ""}${r.siteName ? `<br/><small>${esc(r.siteName)}</small>` : ""}</div></div>`
        }))
        const w = window.open("", "_blank")
        if (!w) { toast.error("Allow pop-ups to print labels"); return }
        w.document.write(`<!doctype html><html><head><title>Asset labels</title><style>body{font-family:Arial,sans-serif;margin:8mm}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.l{border:1px dashed #999;padding:3mm;display:flex;gap:3mm;align-items:center;font-size:11px;break-inside:avoid}.l img{width:24mm;height:24mm}@media print{.no{display:none}}</style></head><body><p class="no"><button onclick="print()">Print</button></p><div class="g">${cells.join("")}</div></body></html>`)
        w.document.close()
    }

    const allOn = list.length > 0 && list.every(r => picked.has(r.id))
    return (
        <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <Link href="/assets" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Assets</Link>
                    <h1 className="text-[22px] font-bold text-[var(--text)] mt-1">Asset register</h1>
                    <p className="text-[12.5px] text-[var(--text3)]">{list.length} asset(s) · value {inr(value)} at purchase cost</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={printLabels} disabled={!picked.size} className="h-10 px-4 rounded-[10px] border border-[var(--border)] bg-white text-[13px] font-semibold text-[var(--text2)] inline-flex items-center gap-1.5 disabled:opacity-50"><QrCode size={15} /> Print QR labels{picked.size ? ` (${picked.size})` : ""}</button>
                    <button onClick={download} disabled={!list.length} className="h-10 px-4 rounded-[10px] bg-[var(--accent)] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={15} /> Excel</button>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search code, name, serial, vendor" className={`${box} flex-1 min-w-[200px]`} />
                <select value={cat} onChange={e => setCat(e.target.value)} className={box} aria-label="Category"><option value="">All categories</option>{cats.map(c => <option key={c}>{c}</option>)}</select>
                <select value={site} onChange={e => setSite(e.target.value)} className={box} aria-label="Site"><option value="">All sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <select value={warranty} onChange={e => setWarranty(e.target.value)} className={box} aria-label="Warranty"><option value="">Any warranty</option><option value="soon">Ending in 30 days</option><option value="expired">Expired</option><option value="ok">Valid</option><option value="none">Not set</option></select>
                <label className="text-[12.5px] text-[var(--text2)] inline-flex items-center gap-1.5"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive</label>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full min-w-[1150px]">
                    <thead><tr>
                        <th className={`${th} w-8`}><input type="checkbox" aria-label="Tick all" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(list.map(r => r.id)))} /></th>
                        <th className={th}>Asset</th><th className={th}>Group · Size</th><th className={th}>Serial</th><th className={th}>Site</th>
                        <th className={`${th} !text-right`}>Owned</th><th className={`${th} !text-right`}>In stock</th><th className={`${th} !text-right`}>With employees</th>
                        <th className={`${th} !text-right`}>Cost</th><th className={`${th} !text-right`}>Recovery</th><th className={th}>Warranty</th><th className={th}></th>
                    </tr></thead>
                    <tbody>
                        {!rows && <tr><td className={td} colSpan={12}><Loader2 size={14} className="inline animate-spin" /> Loading…</td></tr>}
                        {rows && !list.length && <tr><td className={`${td} text-center text-[var(--text3)] py-8`} colSpan={12}>No assets match.</td></tr>}
                        {list.map(r => {
                            const w = warrantyState(r.warrantyUntil)
                            return (
                                <tr key={r.id} className={r.isActive ? "" : "opacity-50"}>
                                    <td className={td}><input type="checkbox" aria-label={`Tick ${r.assetCode}`} checked={picked.has(r.id)} onChange={() => setPicked(p => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })} /></td>
                                    <td className={td}><b className="text-[var(--text)]">{r.name}</b><span className="block text-[11px] font-mono text-[var(--accent)]">{r.assetCode}</span><span className="block text-[11px] text-[var(--text3)]">{r.category}{r.vendor ? ` · ${r.vendor}` : ""}</span></td>
                                    <td className={td}>{r.groupName ?? "—"}{r.size ? ` · ${r.size}` : ""}</td>
                                    <td className={`${td} font-mono text-[11.5px]`}>{r.serialNo ?? (r.trackSerial ? "per issue" : "—")}</td>
                                    <td className={td}>{r.siteName ?? r.location ?? "—"}</td>
                                    <td className={`${td} text-right tabular-nums`}>{r.quantity}</td>
                                    <td className={`${td} text-right tabular-nums ${r.reorderLevel > 0 && r.available <= r.reorderLevel ? "text-red-600 font-semibold" : ""}`}>{r.available}</td>
                                    <td className={`${td} text-right tabular-nums`}>{r.issued}{r.holders ? <span className="block text-[11px] text-[var(--text3)]">{r.holders} employee(s)</span> : null}</td>
                                    <td className={`${td} text-right tabular-nums`}>{inr(r.purchaseCost)}</td>
                                    <td className={`${td} text-right tabular-nums`}>{inr(r.recoveryCost)}</td>
                                    <td className={td}><span className={w === "expired" ? "text-red-600 font-semibold" : w === "soon" ? "text-amber-600 font-semibold" : ""}>{day(r.warrantyUntil)}</span></td>
                                    <td className={`${td} text-right`}><button onClick={() => setEdit(r)} className="text-[12px] font-semibold text-[var(--accent)]">Edit</button></td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            {edit && <EditModal row={edit} sites={sites} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
        </div>
    )
}

function EditModal({ row, sites, onClose, onSaved }: { row: Row; sites: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
    const [f, setF] = useState({ groupName: row.groupName ?? "", size: row.size ?? "", reorderLevel: String(row.reorderLevel || ""), siteId: row.siteId ?? "", warrantyUntil: row.warrantyUntil?.slice(0, 10) ?? "", recoveryCost: row.recoveryCost != null ? String(row.recoveryCost) : "" })
    const [busy, setBusy] = useState(false)
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
    async function save() {
        setBusy(true)
        try {
            const r = await fetch(`/api/assets/${row.id}/meta`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
                groupName: f.groupName.trim() || null, size: f.size.trim() || null, reorderLevel: Number(f.reorderLevel) || 0,
                siteId: f.siteId || null, siteName: sites.find(s => s.id === f.siteId)?.name ?? null,
                warrantyUntil: f.warrantyUntil || null, recoveryCost: f.recoveryCost === "" ? null : Number(f.recoveryCost),
            }) })
            if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Could not save")
            toast.success("Saved"); onSaved()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const lbl = "block text-[11px] font-semibold uppercase text-[var(--text3)]"
    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label="Edit asset details" className="w-full max-w-lg bg-white rounded-[14px] border border-[var(--border)] shadow-xl">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)]">
                    <h3 className="text-[15px] font-semibold">{row.name} <span className="font-mono text-[12px] text-[var(--accent)]">{row.assetCode}</span></h3>
                    <button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button>
                </div>
                <div className="p-5 grid grid-cols-2 gap-3">
                    <label className={lbl}>Item group<input value={f.groupName} onChange={e => setF({ ...f, groupName: e.target.value })} placeholder="e.g. T shirt" className={`${box} w-full`} /></label>
                    <label className={lbl}>Size<input value={f.size} onChange={e => setF({ ...f, size: e.target.value })} placeholder="e.g. M" className={`${box} w-full`} /></label>
                    <label className={lbl}>Site<select value={f.siteId} onChange={e => setF({ ...f, siteId: e.target.value })} className={`${box} w-full`}><option value="">—</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                    <label className={lbl}>Reorder at<input type="number" min={0} value={f.reorderLevel} onChange={e => setF({ ...f, reorderLevel: e.target.value })} placeholder="0 = no alert" className={`${box} w-full`} /></label>
                    <label className={lbl}>Warranty until<input type="date" value={f.warrantyUntil} onChange={e => setF({ ...f, warrantyUntil: e.target.value })} className={`${box} w-full`} /></label>
                    <label className={lbl}>Recovery cost (₹ / unit)<input type="number" min={0} value={f.recoveryCost} onChange={e => setF({ ...f, recoveryCost: e.target.value })} placeholder={row.purchaseCost != null ? `Purchase ${row.purchaseCost}` : "Blank = purchase cost"} className={`${box} w-full`} /></label>
                </div>
                <div className="flex justify-end gap-2 px-5 pb-4">
                    <button onClick={onClose} className="h-9 px-4 rounded-[9px] border border-[var(--border)] text-[13px]">Cancel</button>
                    <button onClick={save} disabled={busy} className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
                </div>
            </div>
        </div>, document.body)
}
