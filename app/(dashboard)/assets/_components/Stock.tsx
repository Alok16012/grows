"use client"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
    Search, Loader2, Package, Users, PackagePlus, SlidersHorizontal, Settings2, BookOpen, Edit2, Trash2, ChevronRight, MoreHorizontal,
} from "lucide-react"
import {
    StockItem, CATEGORIES, CategoryBadge, LOW_TONE, Pill, api, qs, useApiError, Modal, Drawer, Card, Loading, Empty, Label,
    inputCls, filterCls, btnPrimary, btnGhost, btnSmall, btnSmallAccent, thCls, tdCls, fmtDate,
} from "./shared"

export function StockTab({ refreshKey, canManage, canIssue, onIssue, onEdit, onDetails, onChanged, onLoaded }: {
    refreshKey: number
    canManage: boolean
    canIssue: boolean
    onIssue: (s: StockItem) => void
    onEdit: (assetId: string) => void
    onDetails: (assetId: string) => void
    onChanged: () => void
    onLoaded?: (items: StockItem[]) => void
}) {
    const onError = useApiError()
    const [category, setCategory] = useState("All")
    const [location, setLocation] = useState("")
    const [lowOnly, setLowOnly] = useState(false)
    const [search, setSearch] = useState("")
    const [items, setItems] = useState<StockItem[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [locations, setLocations] = useState<string[]>([])
    const [menu, setMenu] = useState<string | null>(null)
    const [txn, setTxn] = useState<{ item: StockItem; type: "RECEIPT" | "ADJUSTMENT" } | null>(null)
    const [settings, setSettings] = useState<StockItem | null>(null)
    const [ledger, setLedger] = useState<StockItem | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const d = await api<{ items: StockItem[] }>(`/api/assets/stock?${qs({ category: category === "All" ? "" : category, location, lowOnly, search })}`)
            const rows = d.items ?? []
            setItems(rows)
            setLocations(prev => Array.from(new Set([...prev, ...rows.map(r => r.location).filter(Boolean) as string[]])).sort())
            onLoaded?.(rows)
        } catch (e) { onError(e, "Couldn't load stock") }
        finally { setLoading(false) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, location, lowOnly, search, refreshKey])
    useEffect(() => { const t = setTimeout(load, search ? 250 : 0); return () => clearTimeout(t) }, [load, search])

    async function remove(s: StockItem) {
        if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return
        const res = await fetch(`/api/assets/${s.id}`, { method: "DELETE" })
        if (!res.ok) { toast.error(await res.text()); return }
        toast.success("Asset deleted")
        load(); onChanged()
    }

    const rows = items ?? []
    const menuItem = "w-full flex items-center gap-2 px-3 py-2 text-[12.5px] hover:bg-[var(--surface2)] text-left"

    return (
        <>
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-3 mb-4">
                <div className="filter-bar">
                    <div className="filter-search flex items-center gap-1.5 flex-1 sm:min-w-[200px] h-8 rounded-[8px] border border-[var(--border)] bg-white px-2">
                        <Search size={13} className="text-[var(--text3)] shrink-0" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or code…"
                            className="flex-1 min-w-0 text-[12px] text-[var(--text)] bg-transparent outline-none placeholder:text-[var(--text3)]" />
                    </div>
                    <select value={category} onChange={e => setCategory(e.target.value)} className={filterCls}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c === "All" ? "All categories" : c}</option>)}
                    </select>
                    <select value={location} onChange={e => setLocation(e.target.value)} className={`${filterCls} sm:max-w-[180px]`}>
                        <option value="">All locations</option>
                        {locations.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text2)] h-8 px-2 rounded-[8px] border border-[var(--border)] cursor-pointer select-none">
                        <input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} /> Low stock only
                    </label>
                </div>
            </div>

            <Card>
                {loading && !items ? <Loading /> : rows.length === 0 ? (
                    <Empty icon={<Package size={40} />} title={lowOnly ? "Nothing is low on stock" : "No assets found"} sub={lowOnly ? undefined : "Add your first asset to get started"} />
                ) : (
                    <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
                        <table className="w-full min-w-[1040px] text-[13px]">
                            <thead>
                                <tr className="border-b border-[var(--border)] bg-[var(--surface2)]">
                                    <th className={thCls}>Asset</th><th className={thCls}>Category</th><th className={thCls}>Size</th><th className={thCls}>Location</th>
                                    <th className={`${thCls} !text-right`}>Total</th><th className={`${thCls} !text-right`}>Issued</th>
                                    <th className={`${thCls} !text-right`}>Available</th><th className={`${thCls} !text-right`}>Reorder at</th>
                                    <th className={`${thCls} !text-right`}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {rows.map(s => (
                                    <tr key={s.id} className={`transition-colors ${s.low ? "bg-amber-50/50 hover:bg-amber-50" : "hover:bg-[var(--surface2)]/50"}`}>
                                        <td className={tdCls}>
                                            <button onClick={() => onDetails(s.id)} className="text-left hover:text-[var(--accent)] transition-colors">
                                                <span className="font-mono text-[11px] text-[var(--accent)] font-semibold block">{s.assetCode}</span>
                                                <span className="font-medium text-[var(--text)]">{s.name}</span>
                                                {s.trackSerial && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface2)] text-[var(--text3)] align-middle">S/N</span>}
                                            </button>
                                        </td>
                                        <td className={tdCls}><CategoryBadge category={s.category} /></td>
                                        <td className={`${tdCls} text-[var(--text2)]`}>{s.size || "—"}</td>
                                        <td className={`${tdCls} text-[var(--text2)] text-[12px]`}>{s.location || "—"}</td>
                                        <td className={`${tdCls} text-right tabular-nums`}>{s.quantity}</td>
                                        <td className={`${tdCls} text-right tabular-nums`}>{s.issued}</td>
                                        <td className={`${tdCls} text-right`}>
                                            <div className="inline-flex items-center gap-1.5">
                                                {s.low && <Pill tone={LOW_TONE} />}
                                                <span className={`font-semibold tabular-nums ${s.available === 0 ? "text-red-500" : s.low ? "text-amber-600" : "text-[var(--text)]"}`}>{s.available}</span>
                                            </div>
                                        </td>
                                        <td className={`${tdCls} text-right tabular-nums text-[var(--text2)]`}>{s.reorderLevel ?? "—"}</td>
                                        <td className={tdCls}>
                                            <div className="relative flex items-center justify-end gap-1">
                                                {canIssue && (
                                                    <button className={btnSmallAccent} onClick={() => onIssue(s)} disabled={s.available === 0} title="Issue without a request"><Users size={12} />Issue</button>
                                                )}
                                                {canIssue && (
                                                    <button className={btnSmall} onClick={() => setTxn({ item: s, type: "RECEIPT" })}><PackagePlus size={12} />Receive</button>
                                                )}
                                                <button className={`${btnSmall} !px-1.5`} aria-label="More actions" onClick={() => setMenu(m => m === s.id ? null : s.id)}><MoreHorizontal size={14} /></button>
                                                {menu === s.id && (
                                                    <>
                                                        <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                                                        <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-[var(--border)] rounded-xl shadow-lg py-1" onClick={() => setMenu(null)}>
                                                            {canIssue && <button className={menuItem} onClick={() => setTxn({ item: s, type: "ADJUSTMENT" })}><SlidersHorizontal size={13} />Adjust stock</button>}
                                                            {canManage && <button className={menuItem} onClick={() => setSettings(s)}><Settings2 size={13} />Settings</button>}
                                                            <button className={menuItem} onClick={() => setLedger(s)}><BookOpen size={13} />Ledger</button>
                                                            <button className={menuItem} onClick={() => onDetails(s.id)}><ChevronRight size={13} />Details</button>
                                                            {canManage && <button className={menuItem} onClick={() => onEdit(s.id)}><Edit2 size={13} />Edit asset</button>}
                                                            {canManage && <button className={`${menuItem} text-red-600`} onClick={() => remove(s)}><Trash2 size={13} />Delete</button>}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {txn && <StockTxnModal item={txn.item} type={txn.type} onClose={() => setTxn(null)} onDone={() => { setTxn(null); load(); onChanged() }} />}
            {settings && <MetaModal item={settings} onClose={() => setSettings(null)} onDone={() => { setSettings(null); load() }} />}
            {ledger && <LedgerDrawer item={ledger} onClose={() => setLedger(null)} />}
        </>
    )
}

function StockTxnModal({ item, type, onClose, onDone }: {
    item: StockItem; type: "RECEIPT" | "ADJUSTMENT"; onClose: () => void; onDone: () => void
}) {
    const onError = useApiError()
    const [qty, setQty] = useState("")
    const [sign, setSign] = useState<1 | -1>(1)
    const [note, setNote] = useState("")
    const [busy, setBusy] = useState(false)
    const receipt = type === "RECEIPT"
    async function submit() {
        const n = Number(qty)
        if (!Number.isInteger(n) || n < 1) { toast.error("Enter a whole quantity of at least 1"); return }
        if (!receipt && !note.trim()) { toast.error("A reason is required for an adjustment"); return }
        if (!receipt && sign === -1 && n > item.available) { toast.error(`Only ${item.available} available to adjust down`); return }
        setBusy(true)
        try {
            await api("/api/assets/stock", { body: { assetId: item.id, type, qty: receipt ? n : sign * n, note: note.trim() || undefined } })
            toast.success(receipt ? `Received ${n} × ${item.name}` : `Stock adjusted ${sign > 0 ? "+" : "−"}${n}`)
            onDone()
        } catch (e) { onError(e) } finally { setBusy(false) }
    }
    return (
        <Modal onClose={onClose} title={receipt ? "Receive stock" : "Adjust stock"} subtitle={`${item.assetCode} — ${item.name} · ${item.available} available of ${item.quantity}`}>
            <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    {!receipt && (
                        <div>
                            <Label>Direction</Label>
                            <div className="grid grid-cols-2 gap-1.5">
                                {([1, -1] as const).map(s => (
                                    <button key={s} type="button" onClick={() => setSign(s)}
                                        className={`py-2 rounded-xl text-[13px] font-semibold border ${sign === s ? (s > 0 ? "border-green-400 bg-green-50 text-green-700" : "border-red-400 bg-red-50 text-red-700") : "border-[var(--border)] text-[var(--text2)]"}`}>
                                        {s > 0 ? "+ Add" : "− Remove"}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className={receipt ? "col-span-2" : ""}>
                        <Label>Quantity *</Label>
                        <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} className={inputCls()} autoFocus />
                    </div>
                </div>
                <div>
                    <Label>{receipt ? "Note (PO / invoice / vendor)" : "Reason *"}</Label>
                    <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={inputCls()} placeholder={receipt ? "Optional" : "e.g. Stock count correction"} />
                </div>
                <div className="flex justify-end gap-2">
                    <button className={btnGhost} onClick={onClose}>Cancel</button>
                    <button className={btnPrimary} onClick={submit} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}{receipt ? "Receive" : "Adjust"}</button>
                </div>
            </div>
        </Modal>
    )
}

function MetaModal({ item, onClose, onDone }: { item: StockItem; onClose: () => void; onDone: () => void }) {
    const onError = useApiError()
    const [size, setSize] = useState(item.size ?? "")
    const [reorderLevel, setReorderLevel] = useState(item.reorderLevel != null ? String(item.reorderLevel) : "")
    const [trackSerial, setTrackSerial] = useState(item.trackSerial)
    const [busy, setBusy] = useState(false)
    async function submit() {
        const rl = reorderLevel.trim() === "" ? null : Number(reorderLevel)
        if (rl !== null && (!Number.isInteger(rl) || rl < 0)) { toast.error("Reorder level must be a whole number ≥ 0"); return }
        setBusy(true)
        try {
            await api(`/api/assets/${item.id}/meta`, { method: "PUT", body: { size: size.trim() || null, reorderLevel: rl, trackSerial } })
            toast.success("Settings saved")
            onDone()
        } catch (e) { onError(e) } finally { setBusy(false) }
    }
    return (
        <Modal onClose={onClose} title="Stock settings" subtitle={`${item.assetCode} — ${item.name}`}>
            <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Label>Default size</Label>
                        <input value={size} onChange={e => setSize(e.target.value)} className={inputCls()} placeholder="e.g. L, 42, 9" />
                    </div>
                    <div>
                        <Label>Reorder level</Label>
                        <input type="number" min={0} value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} className={inputCls()} placeholder="Flag as low at…" />
                    </div>
                </div>
                <label className="flex items-start gap-2 text-[13px] text-[var(--text)] cursor-pointer select-none">
                    <input type="checkbox" checked={trackSerial} onChange={e => setTrackSerial(e.target.checked)} className="mt-0.5" />
                    <span>Track serial numbers<span className="block text-[11.5px] text-[var(--text3)]">Every issue needs a serial / asset tag and is limited to one unit.</span></span>
                </label>
                <div className="flex justify-end gap-2">
                    <button className={btnGhost} onClick={onClose}>Cancel</button>
                    <button className={btnPrimary} onClick={submit} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}Save</button>
                </div>
            </div>
        </Modal>
    )
}

type Txn = { id: string; type: string; qty: number; balanceAfter: number; refType?: string | null; refId?: string | null; note?: string | null; createdAt: string; user: { name: string } | null }

function LedgerDrawer({ item, onClose }: { item: StockItem; onClose: () => void }) {
    const onError = useApiError()
    const [txns, setTxns] = useState<Txn[] | null>(null)
    useEffect(() => {
        api<{ txns: Txn[] }>(`/api/assets/stock/ledger?${qs({ assetId: item.id })}`)
            .then(d => setTxns(d.txns ?? []))
            .catch(e => { onError(e, "Couldn't load the ledger"); setTxns([]) })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.id])
    return (
        <Drawer onClose={onClose} width="max-w-xl" header={<>
            <p className="font-mono text-[12px] text-[var(--accent)] font-semibold">{item.assetCode}</p>
            <h2 className="text-[15px] font-semibold text-[var(--text)] mt-0.5">{item.name} — stock ledger</h2>
            <p className="text-[12px] text-[var(--text3)] mt-0.5">{item.available} available · {item.issued} issued · {item.quantity} total</p>
        </>}>
            {!txns ? <Loading /> : txns.length === 0 ? <Empty icon={<BookOpen size={36} />} title="No movements yet" /> : (
                <table className="w-full text-[12.5px]">
                    <thead className="bg-[var(--surface2)] sticky top-0">
                        <tr>
                            <th className={thCls}>Date</th><th className={thCls}>Type</th>
                            <th className={`${thCls} !text-right`}>Qty</th><th className={`${thCls} !text-right`}>Balance</th><th className={thCls}>Note</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                        {txns.map(t => (
                            <tr key={t.id}>
                                <td className="px-4 py-2.5 whitespace-nowrap text-[var(--text2)]">{fmtDate(t.createdAt, "dd MMM yy, HH:mm")}<p className="text-[10.5px] text-[var(--text3)]">{t.user?.name ?? "System"}</p></td>
                                <td className="px-4 py-2.5 text-[var(--text)]">{t.type.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase())}{t.refType ? <p className="text-[10.5px] text-[var(--text3)]">{t.refType}</p> : null}</td>
                                <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${t.qty < 0 ? "text-red-600" : "text-green-700"}`}>{t.qty > 0 ? `+${t.qty}` : t.qty}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{t.balanceAfter}</td>
                                <td className="px-4 py-2.5 text-[var(--text2)]">{t.note || "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Drawer>
    )
}
