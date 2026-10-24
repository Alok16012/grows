"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Search, Loader2, Plus, Trash2, Users, Copy, X, Info } from "lucide-react"
import { Avatar } from "@/components/Avatar"
import {
    AssetRequest, PickerEmployee, REASON_LABEL, RequestPrefill, RequestReason,
    api, ApiError, qs, useApiError, Drawer, Label, UploadField,
    inputCls, selectCls, filterCls, btnPrimary, btnGhost, btnSmall, thCls, fullName,
} from "./shared"

type PickAsset = { id: string; assetCode: string; name: string; category: string; available: number; size?: string | null }

type Row = {
    key: string
    employeeId: string
    category: string
    assetId: string
    size: string
    quantity: string
    remarks: string
}

let rowSeq = 0
const blankRow = (employeeId: string, over: Partial<Row> = {}): Row => ({
    key: `r${++rowSeq}`, employeeId, category: "", assetId: "", size: "", quantity: "1", remarks: "", ...over,
})

const MAX_QTY = 100

/**
 * Raise Asset Request — request type, employee picker (searchable table with
 * department / location / designation filters), then one item row per
 * employee × asset, plus reason / remarks / attachment.
 */
export function RaiseRequestDrawer({ prefill, onClose, onCreated }: {
    prefill?: RequestPrefill | null
    onClose: () => void
    onCreated: (r: AssetRequest) => void
}) {
    const onError = useApiError()
    const [requestType, setRequestType] = useState<"INDIVIDUAL" | "MULTIPLE">("INDIVIDUAL")
    const [reason, setReason] = useState<RequestReason | "">(prefill?.reason ?? "")
    const [remarks, setRemarks] = useState(prefill?.remarks ?? "")
    const [attachmentUrl, setAttachmentUrl] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [errors, setErrors] = useState<string[]>([])

    // ── Assets ──
    const [assets, setAssets] = useState<PickAsset[]>([])
    useEffect(() => {
        let alive = true
        ;(async () => {
            // The stock view carries size + live availability; fall back to the
            // plain asset list (GET /api/assets) if it isn't reachable.
            try {
                const d = await api<{ items: PickAsset[] }>("/api/assets/stock")
                if (alive) setAssets(d.items ?? [])
                return
            } catch (e) { if (e instanceof ApiError && e.status === 503) { onError(e); return } }
            try {
                const rows = await api<PickAsset[]>("/api/assets?isActive=true")
                if (alive) setAssets(Array.isArray(rows) ? rows : [])
            } catch { if (alive) toast.error("Couldn't load the asset list") }
        })()
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    const assetById = useMemo(() => new Map(assets.map(a => [a.id, a])), [assets])
    const categories = useMemo(() => Array.from(new Set(assets.map(a => a.category))).sort(), [assets])

    // ── Employee picker ──
    const [empRows, setEmpRows] = useState<PickerEmployee[]>([])
    const [empTotal, setEmpTotal] = useState(0)
    const [empLoading, setEmpLoading] = useState(true)
    const [selfOnly, setSelfOnly] = useState(false)
    const [search, setSearch] = useState("")
    const [deptId, setDeptId] = useState("")
    const [siteId, setSiteId] = useState("")
    const [designation, setDesignation] = useState("")
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [selected, setSelected] = useState<Map<string, PickerEmployee>>(() => {
        const m = new Map<string, PickerEmployee>()
        if (prefill?.employee) m.set(prefill.employee.id, { ...prefill.employee })
        return m
    })
    const [rows, setRows] = useState<Row[]>(() => prefill ? [blankRow(prefill.employeeId, {
        assetId: prefill.assetId, size: prefill.size ?? "", quantity: String(prefill.quantity || 1),
    })] : [])

    // Fill category for prefilled rows once assets arrive.
    useEffect(() => {
        if (!assets.length) return
        setRows(rs => rs.map(r => r.assetId && !r.category ? { ...r, category: assetById.get(r.assetId)?.category ?? "" } : r))
    }, [assets, assetById])

    useEffect(() => {
        fetch("/api/departments").then(r => r.ok ? r.json() : []).then(d => setDepartments(Array.isArray(d) ? d : [])).catch(() => { })
        fetch("/api/sites").then(r => r.ok ? r.json() : []).then(d => setSites(Array.isArray(d) ? d : (d?.sites ?? []))).catch(() => { })
    }, [])

    const loadEmployees = useCallback(async () => {
        setEmpLoading(true)
        try {
            // Asset-scoped picker: works for requesters without employees.view.
            const res = await fetch(`/api/assets/employees?${qs({ search, departmentId: deptId, siteId, pageSize: 50 })}`)
            if (res.status === 403 || res.status === 401) {
                // Requester without employees.view: they can only raise for themselves.
                const me = await fetch("/api/me/employee").then(r => r.ok ? r.json() : null).catch(() => null)
                setSelfOnly(true)
                setEmpRows(me ? [me] : [])
                setEmpTotal(me ? 1 : 0)
                if (me) {
                    setSelected(prev => prev.size ? prev : new Map([[me.id, me]]))
                    setRows(rs => rs.length ? rs : [blankRow(me.id)])
                }
                return
            }
            if (!res.ok) throw new Error("Couldn't load employees")
            const d = await res.json()
            setEmpRows(d.employees ?? [])
            setEmpTotal(d.total ?? (d.employees?.length ?? 0))
        } catch (e) { onError(e, "Couldn't load employees") }
        finally { setEmpLoading(false) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, deptId, siteId])

    useEffect(() => {
        const t = setTimeout(loadEmployees, 250)
        return () => clearTimeout(t)
    }, [loadEmployees])

    const designations = useMemo(() => Array.from(new Set(empRows.map(e => e.designation).filter(Boolean) as string[])).sort(), [empRows])
    const visibleEmps = designation ? empRows.filter(e => e.designation === designation) : empRows

    function toggleEmp(e: PickerEmployee) {
        if (selected.has(e.id)) {
            const next = new Map(selected); next.delete(e.id)
            setSelected(next)
            setRows(rs => rs.filter(r => r.employeeId !== e.id))
            return
        }
        if (requestType === "INDIVIDUAL") {
            // Individual: swap the person, keep whatever items were drafted.
            const prevIds = new Set(selected.keys())
            setSelected(new Map([[e.id, e]]))
            setRows(rs => {
                const kept = rs.filter(r => prevIds.has(r.employeeId)).map(r => ({ ...r, employeeId: e.id }))
                return kept.length ? kept : [blankRow(e.id)]
            })
            return
        }
        const next = new Map(selected); next.set(e.id, e)
        setSelected(next)
        setRows(rs => rs.some(r => r.employeeId === e.id) ? rs : [...rs, blankRow(e.id)])
    }

    function toggleAllVisible() {
        if (requestType === "INDIVIDUAL") return
        const allOn = visibleEmps.length > 0 && visibleEmps.every(e => selected.has(e.id))
        const next = new Map(selected)
        if (allOn) {
            const drop = new Set(visibleEmps.map(e => e.id))
            drop.forEach(id => next.delete(id))
            setRows(rs => rs.filter(r => !drop.has(r.employeeId)))
        } else {
            const add = visibleEmps.filter(e => !selected.has(e.id))
            add.forEach(e => next.set(e.id, e))
            const addIds = new Set(add.map(e => e.id))
            setRows(rs => [...rs.filter(r => !addIds.has(r.employeeId)), ...add.map(e => blankRow(e.id))])
        }
        setSelected(next)
    }

    function clearSelection() { setSelected(new Map()); setRows([]) }

    function switchType(t: "INDIVIDUAL" | "MULTIPLE") {
        setRequestType(t)
        if (t === "INDIVIDUAL" && selected.size > 1) {
            const first = Array.from(selected.values())[0]
            setSelected(new Map([[first.id, first]]))
            setRows(rs => rs.filter(r => r.employeeId === first.id))
        }
    }

    // ── Item rows ──
    const patchRow = (key: string, p: Partial<Row>) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...p } : r))
    function pickAsset(key: string, assetId: string) {
        const a = assetById.get(assetId)
        patchRow(key, { assetId, size: a?.size ?? "", ...(a ? { category: a.category } : {}) })
    }

    const [bulk, setBulk] = useState({ category: "", assetId: "", size: "", quantity: "1" })
    function applyAll() {
        if (!bulk.assetId) { toast.error("Pick an asset to apply"); return }
        const a = assetById.get(bulk.assetId)
        setRows(rs => rs.map(r => ({ ...r, category: a?.category ?? bulk.category, assetId: bulk.assetId, size: bulk.size || a?.size || "", quantity: bulk.quantity })))
        toast.success(`Applied to ${rows.length} row${rows.length === 1 ? "" : "s"}`)
    }

    // ── Validation & submit ──
    function validate(): string[] {
        const errs: string[] = []
        if (selected.size === 0) errs.push("Select at least one employee.")
        if (requestType === "INDIVIDUAL" && selected.size > 1) errs.push("An individual request is for one employee — switch to Multiple.")
        if (rows.length === 0 && selected.size > 0) errs.push("Add at least one item.")
        if (!reason) errs.push("Choose a reason for the request.")
        if (reason === "OTHER" && !remarks.trim()) errs.push("Remarks are required when the reason is Other.")
        const seen = new Set<string>()
        rows.forEach((r, i) => {
            const who = fullName(selected.get(r.employeeId))
            if (!r.assetId) errs.push(`Row ${i + 1} (${who}): choose an asset.`)
            const q = Number(r.quantity)
            if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) errs.push(`Row ${i + 1} (${who}): quantity must be a whole number 1–${MAX_QTY}.`)
            const k = `${r.employeeId}|${r.assetId}|${r.size.trim().toLowerCase()}`
            if (r.assetId && seen.has(k)) errs.push(`Row ${i + 1} (${who}): same asset and size listed twice — merge the quantities.`)
            seen.add(k)
        })
        return errs
    }

    async function submit() {
        const errs = validate()
        setErrors(errs)
        if (errs.length) { toast.error(errs[0]); return }
        setSubmitting(true)
        try {
            const created = await api<AssetRequest>("/api/assets/requests", {
                body: {
                    requestType, reason, remarks: remarks.trim() || undefined, attachmentUrl: attachmentUrl || undefined,
                    items: rows.map(r => ({
                        employeeId: r.employeeId, assetId: r.assetId, size: r.size.trim() || undefined,
                        quantity: Number(r.quantity), remarks: r.remarks.trim() || undefined,
                    })),
                },
            })
            toast.success(`${created?.requestNo ?? "Request"} raised`)
            onCreated(created)
        } catch (e) { onError(e, "Couldn't raise the request") }
        finally { setSubmitting(false) }
    }

    const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    const sectionTitle = "text-[12px] font-semibold text-[var(--text2)] uppercase tracking-[0.5px] mb-2"

    return (
        <Drawer
            onClose={onClose}
            width="max-w-5xl"
            header={<>
                <h2 className="text-[16px] font-semibold text-[var(--text)]">Raise asset request</h2>
                <p className="text-[12px] text-[var(--text3)] mt-0.5">Pick the employees, then the assets each of them needs.</p>
            </>}
            footer={
                <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:justify-between">
                    <p className="text-[12px] text-[var(--text3)]">
                        {selected.size} employee{selected.size === 1 ? "" : "s"} · {rows.length} item row{rows.length === 1 ? "" : "s"} · {totalQty} unit{totalQty === 1 ? "" : "s"}
                    </p>
                    <div className="flex gap-2 justify-end">
                        <button className={btnGhost} onClick={onClose}>Cancel</button>
                        <button className={btnPrimary} onClick={submit} disabled={submitting}>
                            {submitting && <Loader2 size={14} className="animate-spin" />} Submit request
                        </button>
                    </div>
                </div>
            }
        >
            <div className="p-5 space-y-6">
                {errors.length > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-700 space-y-0.5">
                        {errors.map((e, i) => <p key={i}>• {e}</p>)}
                    </div>
                )}

                {/* 1. Request type */}
                <section>
                    <p className={sectionTitle}>Request type</p>
                    <div className="z-tabs-wrap"><div className="z-tabs z-tabs--inset" role="tablist">
                        {(["INDIVIDUAL", "MULTIPLE"] as const).map(t => (
                            <button key={t} role="tab" aria-selected={requestType === t} onClick={() => switchType(t)}
                                disabled={selfOnly && t === "MULTIPLE"}
                                className={`z-tab ${requestType === t ? "is-active" : ""}`}>
                                {t === "INDIVIDUAL" ? "Individual" : "Multiple employees"}
                            </button>
                        ))}
                    </div></div>
                </section>

                {/* 2. Employees */}
                <section>
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <p className={`${sectionTitle} !mb-0`}>Employees</p>
                        {selected.size > 0 && (
                            <div className="flex items-center gap-2 text-[12px]">
                                <span className="px-2 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent)] font-semibold">{selected.size} selected</span>
                                <button onClick={clearSelection} className="text-[var(--text3)] hover:text-red-500 inline-flex items-center gap-1"><X size={12} />Clear</button>
                            </div>
                        )}
                    </div>
                    {selfOnly ? (
                        <p className="text-[12px] text-[var(--text3)] mb-2 flex items-center gap-1.5"><Info size={13} /> You can raise requests for yourself.</p>
                    ) : (
                        <div className="filter-bar mb-2">
                            <div className="filter-search flex items-center gap-1.5 flex-1 sm:min-w-[200px] h-8 rounded-[8px] border border-[var(--border)] bg-white px-2">
                                <Search size={13} className="text-[var(--text3)] shrink-0" />
                                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, ID, designation…"
                                    className="flex-1 min-w-0 text-[12px] text-[var(--text)] bg-transparent outline-none placeholder:text-[var(--text3)]" />
                            </div>
                            <select value={deptId} onChange={e => setDeptId(e.target.value)} className={filterCls}>
                                <option value="">All departments</option>
                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            <select value={siteId} onChange={e => setSiteId(e.target.value)} className={`${filterCls} sm:max-w-[180px]`}>
                                <option value="">All locations</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <select value={designation} onChange={e => setDesignation(e.target.value)} className={`${filterCls} sm:max-w-[180px]`}>
                                <option value="">All designations</option>
                                {designations.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                        <div className="max-h-[280px] overflow-auto">
                            <table className="w-full min-w-[640px] text-[12.5px]">
                                <thead className="sticky top-0 bg-[var(--surface2)] z-[1]">
                                    <tr>
                                        <th className={`${thCls} w-10`}>
                                            {requestType === "MULTIPLE" && (
                                                <input type="checkbox" aria-label="Select all shown"
                                                    checked={visibleEmps.length > 0 && visibleEmps.every(e => selected.has(e.id))}
                                                    onChange={toggleAllVisible} />
                                            )}
                                        </th>
                                        <th className={thCls}>Name</th><th className={thCls}>Employee ID</th><th className={thCls}>Department</th>
                                        <th className={thCls}>Designation</th><th className={thCls}>Location</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {empLoading ? (
                                        <tr><td colSpan={6} className="py-8 text-center"><Loader2 size={18} className="animate-spin inline text-[var(--accent)]" /></td></tr>
                                    ) : visibleEmps.length === 0 ? (
                                        <tr><td colSpan={6} className="py-8 text-center text-[var(--text3)]">No employees match.</td></tr>
                                    ) : visibleEmps.map(e => {
                                        const on = selected.has(e.id)
                                        return (
                                            <tr key={e.id} onClick={() => toggleEmp(e)} className={`cursor-pointer transition-colors ${on ? "bg-[var(--accent-light)]" : "hover:bg-[var(--surface2)]/60"}`}>
                                                <td className="px-4 py-2">
                                                    <input type={requestType === "INDIVIDUAL" ? "radio" : "checkbox"} checked={on} readOnly aria-label={`Select ${fullName(e)}`} />
                                                </td>
                                                <td className="px-4 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <Avatar firstName={e.firstName} lastName={e.lastName} photo={e.photo} size={26} />
                                                        <span className="font-medium text-[var(--text)]">{fullName(e)}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2 font-mono text-[11.5px] text-[var(--text2)]">{e.employeeId}</td>
                                                <td className="px-4 py-2 text-[var(--text2)]">{e.department?.name ?? "—"}</td>
                                                <td className="px-4 py-2 text-[var(--text2)]">{e.designation ?? "—"}</td>
                                                <td className="px-4 py-2 text-[var(--text2)]">{e.deployments?.[0]?.site?.name ?? "—"}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {!selfOnly && empTotal > empRows.length && (
                            <p className="px-4 py-2 text-[11.5px] text-[var(--text3)] border-t border-[var(--border)]">
                                Showing {empRows.length} of {empTotal} — narrow with search or filters.
                            </p>
                        )}
                    </div>
                </section>

                {/* 3. Items */}
                <section>
                    <p className={sectionTitle}>Items</p>
                    {rows.length === 0 ? (
                        <p className="text-[12.5px] text-[var(--text3)] border border-dashed border-[var(--border)] rounded-xl px-4 py-6 text-center">
                            <Users size={16} className="inline mr-1.5 -mt-0.5" />Select employees above to add item rows.
                        </p>
                    ) : (
                        <>
                            {rows.length > 1 && (
                                <div className="flex flex-wrap items-end gap-2 mb-3 p-3 rounded-xl bg-[var(--surface2)]">
                                    <div className="min-w-[140px] flex-1">
                                        <Label>Category</Label>
                                        <select value={bulk.category} onChange={e => setBulk(b => ({ ...b, category: e.target.value, assetId: "" }))} className={selectCls("bg-white")}>
                                            <option value="">All</option>
                                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="min-w-[180px] flex-[2]">
                                        <Label>Asset</Label>
                                        <select value={bulk.assetId} onChange={e => { const a = assetById.get(e.target.value); setBulk(b => ({ ...b, assetId: e.target.value, size: a?.size ?? b.size })) }} className={selectCls("bg-white")}>
                                            <option value="">Select asset…</option>
                                            {assets.filter(a => !bulk.category || a.category === bulk.category).map(a => (
                                                <option key={a.id} value={a.id}>{a.name} ({a.assetCode}) — {a.available} available</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="w-[100px]">
                                        <Label>Size</Label>
                                        <input value={bulk.size} onChange={e => setBulk(b => ({ ...b, size: e.target.value }))} className={inputCls("bg-white")} placeholder="—" />
                                    </div>
                                    <div className="w-[80px]">
                                        <Label>Qty</Label>
                                        <input type="number" min={1} max={MAX_QTY} value={bulk.quantity} onChange={e => setBulk(b => ({ ...b, quantity: e.target.value }))} className={inputCls("bg-white")} />
                                    </div>
                                    <button type="button" onClick={applyAll} className={`${btnGhost} bg-white !py-2`}><Copy size={13} />Apply same asset/size/qty to all rows</button>
                                </div>
                            )}
                            <div className="border border-[var(--border)] rounded-xl overflow-x-auto">
                                <table className="w-full min-w-[860px] text-[12.5px]">
                                    <thead className="bg-[var(--surface2)]">
                                        <tr>
                                            <th className={thCls}>Employee</th><th className={thCls}>Category</th><th className={thCls}>Asset</th>
                                            <th className={thCls}>Size</th><th className={thCls}>Qty</th><th className={thCls}>Remarks</th><th className={thCls}></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        {rows.map(r => {
                                            const emp = selected.get(r.employeeId)
                                            const a = assetById.get(r.assetId)
                                            const q = Number(r.quantity) || 0
                                            return (
                                                <tr key={r.key}>
                                                    <td className="px-4 py-2">
                                                        <p className="font-medium text-[var(--text)] whitespace-nowrap">{fullName(emp)}</p>
                                                        <p className="text-[11px] text-[var(--text3)]">{emp?.employeeId}</p>
                                                    </td>
                                                    <td className="px-2 py-2 w-[140px]">
                                                        <select value={r.category} onChange={e => patchRow(r.key, { category: e.target.value, assetId: "", size: "" })} className={selectCls("!py-1.5")}>
                                                            <option value="">All</option>
                                                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="px-2 py-2 min-w-[220px]">
                                                        <select value={r.assetId} onChange={e => pickAsset(r.key, e.target.value)} className={selectCls("!py-1.5")}>
                                                            <option value="">Select asset…</option>
                                                            {assets.filter(x => !r.category || x.category === r.category).map(x => (
                                                                <option key={x.id} value={x.id}>{x.name} ({x.assetCode}) — {x.available} available</option>
                                                            ))}
                                                        </select>
                                                        {a && q > a.available && (
                                                            <p className="text-[11px] text-amber-600 mt-0.5">Only {a.available} in stock — approval may be partial.</p>
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-2 w-[90px]">
                                                        <input value={r.size} onChange={e => patchRow(r.key, { size: e.target.value })} placeholder="—" className={inputCls("!py-1.5")} />
                                                    </td>
                                                    <td className="px-2 py-2 w-[80px]">
                                                        <input type="number" min={1} max={MAX_QTY} value={r.quantity} onChange={e => patchRow(r.key, { quantity: e.target.value })} className={inputCls("!py-1.5")} />
                                                    </td>
                                                    <td className="px-2 py-2 min-w-[140px]">
                                                        <input value={r.remarks} onChange={e => patchRow(r.key, { remarks: e.target.value })} placeholder="Optional" className={inputCls("!py-1.5")} />
                                                    </td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-right">
                                                        <button type="button" title="Add another asset for this employee" onClick={() => setRows(rs => {
                                                            const idx = rs.findIndex(x => x.key === r.key)
                                                            const copy = [...rs]; copy.splice(idx + 1, 0, blankRow(r.employeeId)); return copy
                                                        })} className={`${btnSmall} !px-1.5`}><Plus size={13} /></button>
                                                        <button type="button" title="Remove row" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}
                                                            className={`${btnSmall} !px-1.5 ml-1 hover:!border-red-300 hover:!text-red-500`}><Trash2 size={13} /></button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </section>

                {/* 4. Reason */}
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <Label>Reason *</Label>
                        <select value={reason} onChange={e => setReason(e.target.value as RequestReason)} className={selectCls()}>
                            <option value="">Select reason…</option>
                            {(Object.keys(REASON_LABEL) as RequestReason[]).map(r => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
                        </select>
                    </div>
                    <UploadField value={attachmentUrl} onChange={setAttachmentUrl} label="Attachment (optional)" />
                    <div className="sm:col-span-2">
                        <Label>Remarks{reason === "OTHER" ? " *" : ""}</Label>
                        <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} placeholder="Anything the approver should know…" className={inputCls()} />
                    </div>
                </section>
            </div>
        </Drawer>
    )
}
