"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Search, Loader2, Users, RotateCcw, AlertTriangle, Repeat, MoreHorizontal, Calendar, CheckCircle2, Clock } from "lucide-react"
import { Avatar } from "@/components/Avatar"
import {
    AssetIssue, IssueStatus, ISSUE_STATUS, RequestPrefill, StockItem, PickerEmployee,
    Pill, api, qs, useApiError, Modal, Card, Loading, Empty, Pager, Label,
    inputCls, selectCls, filterCls, btnPrimary, btnGhost, btnDanger, btnSmall, thCls, tdCls,
    fmtDate, fullName, newKey,
} from "./shared"

const STATUS_FILTERS: (IssueStatus | "ALL")[] = ["ACTIVE", "RETURNED", "REPLACED", "LOST", "DAMAGED", "WRITTEN_OFF", "ALL"]

type Action = "RETURN" | "LOSS" | "REPLACE"

export function IssuedTab({ refreshKey, canIssue, canRequest, onChanged, onReplace }: {
    refreshKey: number
    canIssue: boolean
    canRequest: boolean
    onChanged: () => void
    onReplace: (p: RequestPrefill) => void
}) {
    const onError = useApiError()
    const [status, setStatus] = useState<IssueStatus | "ALL">("ACTIVE")
    const [search, setSearch] = useState("")
    const [from, setFrom] = useState("")
    const [to, setTo] = useState("")
    const [page, setPage] = useState(1)
    const [data, setData] = useState<{ issues: AssetIssue[]; total: number } | null>(null)
    const [loading, setLoading] = useState(true)
    const [target, setTarget] = useState<{ issue: AssetIssue; action: Action } | null>(null)
    const [menu, setMenu] = useState<string | null>(null)
    const pageSize = 25

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setData(await api(`/api/assets/issues?${qs({ status: status === "ALL" ? "" : status, search, from, to, page, pageSize })}`))
        } catch (e) { onError(e, "Couldn't load issued items") }
        finally { setLoading(false) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, search, from, to, page, refreshKey])
    useEffect(() => { const t = setTimeout(load, search ? 250 : 0); return () => clearTimeout(t) }, [load, search])
    useEffect(() => { setPage(1) }, [status, search, from, to])

    const rows = data?.issues ?? []
    const done = () => { setTarget(null); load(); onChanged() }
    const [acking, setAcking] = useState<string | null>(null)
    async function acknowledge(s: AssetIssue) {
        setAcking(s.id)
        try {
            await api(`/api/assets/issues/${s.id}`, { method: "PATCH", body: { action: "ACKNOWLEDGE" } })
            toast.success(`${s.issueNo} marked acknowledged`)
            load()
        } catch (e) { onError(e) } finally { setAcking(null) }
    }

    return (
        <>
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-3 mb-4 space-y-3">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    {STATUS_FILTERS.map(s => (
                        <button key={s} onClick={() => setStatus(s)}
                            className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${status === s ? "bg-[var(--accent)] text-white" : "bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--border)]"}`}>
                            {s === "ALL" ? "All" : ISSUE_STATUS[s].label}
                        </button>
                    ))}
                </div>
                <div className="filter-bar">
                    <div className="filter-search flex items-center gap-1.5 flex-1 sm:min-w-[200px] h-8 rounded-[8px] border border-[var(--border)] bg-white px-2">
                        <Search size={13} className="text-[var(--text3)] shrink-0" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search issue no, employee, asset, serial…"
                            className="flex-1 min-w-0 text-[12px] text-[var(--text)] bg-transparent outline-none placeholder:text-[var(--text3)]" />
                    </div>
                    <div className="filter-full flex items-center gap-1">
                        <Calendar size={13} className="text-[var(--text3)] shrink-0" />
                        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={filterCls} aria-label="Issued from" />
                        <span className="text-[var(--text3)] text-[12px]">–</span>
                        <input type="date" value={to} onChange={e => setTo(e.target.value)} className={filterCls} aria-label="Issued to" />
                    </div>
                </div>
            </div>

            <Card>
                {loading && !data ? <Loading /> : rows.length === 0 ? (
                    <Empty icon={<Users size={40} />} title="No issued items found" />
                ) : (
                    <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
                        <table className="w-full min-w-[1180px] text-[13px]">
                            <thead>
                                <tr className="border-b border-[var(--border)] bg-[var(--surface2)]">
                                    <th className={thCls}>Issue No</th><th className={thCls}>Employee</th><th className={thCls}>Asset</th>
                                    <th className={`${thCls} !text-right`}>Qty</th><th className={thCls}>Size</th><th className={thCls}>Serial</th>
                                    <th className={thCls}>Request ID</th><th className={thCls}>Issued on</th><th className={thCls}>Acknowledged</th>
                                    <th className={thCls}>Status</th><th className={`${thCls} !text-right`}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {rows.map(s => {
                                    const outstanding = s.quantity - (s.returnedQty ?? 0)
                                    const active = s.status === "ACTIVE" && outstanding > 0
                                    return (
                                        <tr key={s.id} className="hover:bg-[var(--surface2)]/50 transition-colors">
                                            <td className={`${tdCls} font-mono text-[12px] font-semibold text-[var(--accent)]`}>{s.issueNo}</td>
                                            <td className={tdCls}>
                                                <div className="flex items-center gap-2.5">
                                                    <Avatar firstName={s.employee.firstName} lastName={s.employee.lastName} size={30} />
                                                    <div>
                                                        <p className="font-medium text-[var(--text)] whitespace-nowrap">{fullName(s.employee)}</p>
                                                        <p className="text-[11px] text-[var(--text3)]">{s.employee.employeeId}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={tdCls}>
                                                <p className="text-[var(--text)]">{s.asset.name}</p>
                                                <p className="text-[11px] font-mono text-[var(--accent)]">{s.asset.assetCode}</p>
                                            </td>
                                            <td className={`${tdCls} text-right tabular-nums`}>
                                                {s.quantity}
                                                {s.returnedQty > 0 && <p className="text-[10.5px] text-[var(--text3)]">{s.returnedQty} returned</p>}
                                            </td>
                                            <td className={`${tdCls} text-[var(--text2)]`}>{s.size || "—"}</td>
                                            <td className={`${tdCls} text-[var(--text2)] font-mono text-[11.5px]`}>{s.serialNo || "—"}</td>
                                            <td className={`${tdCls} font-mono text-[11.5px]`}>{s.request?.requestNo ?? <span className="text-[var(--text3)] font-sans">Direct</span>}</td>
                                            <td className={`${tdCls} text-[var(--text2)] whitespace-nowrap`}>{fmtDate(s.issuedAt)}<p className="text-[10.5px] text-[var(--text3)]">by {s.issuedBy?.name}</p></td>
                                            <td className={tdCls}>
                                                {s.acknowledgedAt
                                                    ? <span className="inline-flex items-center gap-1 text-[12px] text-green-700"><CheckCircle2 size={12} />{fmtDate(s.acknowledgedAt, "dd MMM")}</span>
                                                    : (
                                                        <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-600">
                                                            <Clock size={12} />Pending
                                                            {canIssue && s.status === "ACTIVE" && (
                                                                <button onClick={() => acknowledge(s)} disabled={acking === s.id}
                                                                    title="Mark acknowledged on the employee's behalf (e.g. signed receipt)"
                                                                    className="text-[11px] text-[var(--accent)] hover:underline disabled:opacity-50">
                                                                    {acking === s.id ? "…" : "Mark"}
                                                                </button>
                                                            )}
                                                        </span>
                                                    )}
                                            </td>
                                            <td className={tdCls}><Pill tone={ISSUE_STATUS[s.status] ?? ISSUE_STATUS.ACTIVE} /></td>
                                            <td className={`${tdCls} text-right`}>
                                                {canIssue && active && (
                                                    <div className="relative inline-flex items-center gap-1">
                                                        <button className={btnSmall} onClick={() => setTarget({ issue: s, action: "RETURN" })}><RotateCcw size={12} />Return</button>
                                                        <button className={`${btnSmall} !px-1.5`} aria-label="More actions" onClick={() => setMenu(m => m === s.id ? null : s.id)}><MoreHorizontal size={14} /></button>
                                                        {menu === s.id && (
                                                            <>
                                                                <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                                                                <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-white border border-[var(--border)] rounded-xl shadow-lg py-1 text-left">
                                                                    <button className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] hover:bg-[var(--surface2)]"
                                                                        onClick={() => { setMenu(null); setTarget({ issue: s, action: "LOSS" }) }}>
                                                                        <AlertTriangle size={13} className="text-red-500" />Mark lost / damaged / written off
                                                                    </button>
                                                                    <button className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] hover:bg-[var(--surface2)]"
                                                                        onClick={() => { setMenu(null); setTarget({ issue: s, action: "REPLACE" }) }}>
                                                                        <Repeat size={13} className="text-[var(--accent)]" />Replace
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <Pager page={page} pageSize={pageSize} total={data?.total ?? 0} onPage={setPage} />
            </Card>

            {target?.action === "RETURN" && <ReturnIssueModal issue={target.issue} onClose={() => setTarget(null)} onDone={done} />}
            {target?.action === "LOSS" && <LossModal issue={target.issue} onClose={() => setTarget(null)} onDone={done} />}
            {target?.action === "REPLACE" && (
                <ReplaceModal issue={target.issue} canRequest={canRequest} onClose={() => setTarget(null)}
                    onDone={p => { done(); if (p) onReplace(p) }} />
            )}
        </>
    )
}

function ReturnIssueModal({ issue, onClose, onDone }: { issue: AssetIssue; onClose: () => void; onDone: () => void }) {
    const onError = useApiError()
    const outstanding = issue.quantity - (issue.returnedQty ?? 0)
    const [quantity, setQuantity] = useState(String(outstanding))
    const [condition, setCondition] = useState<"GOOD" | "FAIR" | "DAMAGED">("GOOD")
    const [note, setNote] = useState("")
    const [busy, setBusy] = useState(false)
    async function submit() {
        const q = Number(quantity)
        if (!Number.isInteger(q) || q < 1 || q > outstanding) { toast.error(`Return between 1 and ${outstanding}`); return }
        setBusy(true)
        try {
            await api(`/api/assets/issues/${issue.id}`, { method: "PATCH", body: { action: "RETURN", quantity: q, condition, note: note.trim() || undefined } })
            toast.success(`${q} × ${issue.asset.name} returned`)
            onDone()
        } catch (e) { onError(e) } finally { setBusy(false) }
    }
    return (
        <Modal onClose={onClose} title="Return asset" subtitle={`${issue.issueNo} · ${issue.asset.name} — ${fullName(issue.employee)}`}>
            <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Label>Quantity * <span className="text-[var(--text3)] font-normal">(max {outstanding})</span></Label>
                        <input type="number" min={1} max={outstanding} value={quantity} onChange={e => setQuantity(e.target.value)} className={inputCls()} />
                    </div>
                    <div>
                        <Label>Condition *</Label>
                        <select value={condition} onChange={e => setCondition(e.target.value as typeof condition)} className={selectCls()}>
                            <option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option>
                        </select>
                    </div>
                </div>
                <div>
                    <Label>Note</Label>
                    <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={inputCls()} placeholder="Optional" />
                </div>
                <div className="flex justify-end gap-2">
                    <button className={btnGhost} onClick={onClose}>Cancel</button>
                    <button className={btnPrimary} onClick={submit} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}Confirm return</button>
                </div>
            </div>
        </Modal>
    )
}

function LossModal({ issue, onClose, onDone }: { issue: AssetIssue; onClose: () => void; onDone: () => void }) {
    const onError = useApiError()
    const [action, setAction] = useState<"LOST" | "DAMAGED" | "WRITTEN_OFF">("LOST")
    const [note, setNote] = useState("")
    const [busy, setBusy] = useState(false)
    async function submit() {
        if (!note.trim()) { toast.error("A note is required"); return }
        setBusy(true)
        try {
            await api(`/api/assets/issues/${issue.id}`, { method: "PATCH", body: { action, note: note.trim() } })
            toast.success(`${issue.issueNo} marked ${ISSUE_STATUS[action].label.toLowerCase()}`)
            onDone()
        } catch (e) { onError(e) } finally { setBusy(false) }
    }
    return (
        <Modal onClose={onClose} title="Mark lost / damaged / written off" subtitle={`${issue.issueNo} · ${issue.asset.name} — ${fullName(issue.employee)}`}>
            <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                    {(["LOST", "DAMAGED", "WRITTEN_OFF"] as const).map(a => (
                        <button key={a} type="button" onClick={() => setAction(a)}
                            className={`px-3 py-2 rounded-xl text-[12.5px] font-medium border transition-colors ${action === a ? "border-red-400 bg-red-50 text-red-700" : "border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"}`}>
                            {ISSUE_STATUS[a].label}
                        </button>
                    ))}
                </div>
                <div>
                    <Label>Note *</Label>
                    <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className={inputCls()} placeholder="What happened? Any recovery to make?" autoFocus />
                </div>
                <div className="flex justify-end gap-2">
                    <button className={btnGhost} onClick={onClose}>Cancel</button>
                    <button className={btnDanger} onClick={submit} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}Mark {ISSUE_STATUS[action].label.toLowerCase()}</button>
                </div>
            </div>
        </Modal>
    )
}

function ReplaceModal({ issue, canRequest, onClose, onDone }: {
    issue: AssetIssue; canRequest: boolean; onClose: () => void; onDone: (p: RequestPrefill | null) => void
}) {
    const onError = useApiError()
    const [reason, setReason] = useState("")
    const [busy, setBusy] = useState(false)
    async function submit() {
        if (!reason.trim()) { toast.error("Give a reason for the replacement"); return }
        setBusy(true)
        try {
            const d = await api<{ replaceRequestPrefill?: Omit<RequestPrefill, "employee"> }>(`/api/assets/issues/${issue.id}`, {
                method: "PATCH", body: { action: "REPLACE", reason: reason.trim() },
            })
            toast.success(`${issue.issueNo} marked for replacement`)
            const p = d?.replaceRequestPrefill
            onDone(p && canRequest ? { ...p, employee: issue.employee, remarks: `Replacement for ${issue.issueNo}: ${reason.trim()}` } : null)
        } catch (e) { onError(e) } finally { setBusy(false) }
    }
    return (
        <Modal onClose={onClose} title="Replace asset" subtitle={`${issue.issueNo} · ${issue.asset.name} — ${fullName(issue.employee)}`}>
            <div className="p-5 space-y-4">
                <p className="text-[12.5px] text-[var(--text2)]">
                    The current issue is closed as replaced{canRequest ? " and a replacement request opens pre-filled for you to submit" : ""}.
                </p>
                <div>
                    <Label>Reason *</Label>
                    <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className={inputCls()} placeholder="e.g. Uniform torn, size change" autoFocus />
                </div>
                <div className="flex justify-end gap-2">
                    <button className={btnGhost} onClick={onClose}>Cancel</button>
                    <button className={btnPrimary} onClick={submit} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}Replace</button>
                </div>
            </div>
        </Modal>
    )
}

// ─── Direct issue (no request) from the Inventory tab ────────────────────────

export function DirectIssueModal({ asset, employees, onClose, onDone }: {
    asset: StockItem
    employees: PickerEmployee[]
    onClose: () => void
    onDone: () => void
}) {
    const onError = useApiError()
    const idempotencyKey = useRef(newKey()).current
    const [employeeId, setEmployeeId] = useState("")
    const [empSearch, setEmpSearch] = useState("")
    const [quantity, setQuantity] = useState("1")
    const [serialNo, setSerialNo] = useState("")
    const [remarks, setRemarks] = useState("")
    const [busy, setBusy] = useState(false)
    const q = empSearch.trim().toLowerCase()
    const shown = (q ? employees.filter(e => `${fullName(e)} ${e.employeeId}`.toLowerCase().includes(q)) : employees).slice(0, 200)

    async function submit() {
        const n = asset.trackSerial ? 1 : Number(quantity)
        if (!employeeId) { toast.error("Select an employee"); return }
        if (!Number.isInteger(n) || n < 1 || n > asset.available) { toast.error(`Quantity must be 1–${asset.available}`); return }
        if (asset.trackSerial && !serialNo.trim()) { toast.error("Serial / asset tag is required for this asset"); return }
        setBusy(true)
        try {
            await api("/api/assets/issues/direct", {
                body: { employeeId, assetId: asset.id, quantity: n, serialNo: serialNo.trim() || undefined, remarks: remarks.trim() || undefined, idempotencyKey },
            })
            toast.success(`${asset.name} issued`)
            onDone()
        } catch (e) { onError(e) } finally { setBusy(false) }
    }

    return (
        <Modal onClose={onClose} title="Issue directly" subtitle={`${asset.assetCode} — ${asset.name} · ${asset.available} in stock`}>
            <div className="p-5 space-y-4">
                <p className="text-[12px] text-[var(--text3)]">For urgent hand-overs without a request. It still lands in Issued Items and the ledger.</p>
                <div>
                    <Label>Employee *</Label>
                    <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Filter by name or ID…" className={inputCls("mb-1.5")} />
                    <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className={selectCls()} size={5}>
                        {shown.map(e => <option key={e.id} value={e.id}>{fullName(e)} — {e.employeeId}{e.designation ? ` (${e.designation})` : ""}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Label>Quantity *</Label>
                        <input type="number" min={1} max={asset.trackSerial ? 1 : asset.available} value={asset.trackSerial ? "1" : quantity}
                            disabled={asset.trackSerial} onChange={e => setQuantity(e.target.value)} className={inputCls()} />
                    </div>
                    <div>
                        <Label>Serial / Asset tag{asset.trackSerial ? " *" : ""}</Label>
                        <input value={serialNo} onChange={e => setSerialNo(e.target.value)} className={inputCls()} placeholder={asset.trackSerial ? "Required" : "Optional"} />
                    </div>
                </div>
                <div>
                    <Label>Remarks</Label>
                    <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} className={inputCls()} placeholder="Why no request? (optional)" />
                </div>
                <div className="flex justify-end gap-2">
                    <button className={btnGhost} onClick={onClose}>Cancel</button>
                    <button className={btnPrimary} onClick={submit} disabled={busy || asset.available === 0}>{busy && <Loader2 size={14} className="animate-spin" />}Issue</button>
                </div>
            </div>
        </Modal>
    )
}
