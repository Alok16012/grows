"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
    Search, Loader2, ClipboardList, Check, XCircle, Ban, PackageCheck, Eye, Paperclip, History, Info, Calendar,
} from "lucide-react"
import { format } from "date-fns"
import {
    AssetRequest, AssetIssue, AuditEntry, RequestItem, RequestStatus, StockItem,
    REQUEST_STATUS, FULFILMENT_STATUS, ISSUE_STATUS, REASON_LABEL,
    Pill, api, qs, useApiError, Drawer, Modal, Card, Loading, Empty, Pager, Label, UploadField, Stat,
    inputCls, filterCls, btnPrimary, btnGhost, btnDanger, btnSmall, btnSmallAccent, thCls, tdCls,
    fmtDate, fullName, employeesSummary, assetsSummary, sumBy, remainingOf, newKey,
} from "./shared"

type StatusTab = RequestStatus | "ALL"
const STATUS_TABS: { id: StatusTab; label: string }[] = [
    { id: "SUBMITTED", label: "Pending" },
    { id: "APPROVED", label: "Approved" },
    { id: "PARTIALLY_APPROVED", label: "Partially approved" },
    { id: "REJECTED", label: "Rejected" },
    { id: "CANCELLED", label: "Cancelled" },
    { id: "ALL", label: "All" },
]

type ListResponse = { requests: AssetRequest[]; total: number; counts: Partial<Record<RequestStatus | "all", number>> }

const isApproved = (r: AssetRequest) => r.status === "APPROVED" || r.status === "PARTIALLY_APPROVED"
const issuableItems = (r: AssetRequest) => isApproved(r) ? r.items.filter(i => remainingOf(i) > 0) : []

// ─── Requests / Approval & Fulfilment tab ────────────────────────────────────

export function RequestsTab({ mineOnly, canApprove, canIssue, meId, refreshKey, onOpen, onIssue }: {
    mineOnly: boolean
    canApprove: boolean
    canIssue: boolean
    meId?: string
    refreshKey: number
    onOpen: (id: string) => void
    onIssue: (r: AssetRequest, item: RequestItem) => void
}) {
    const onError = useApiError()
    const [status, setStatus] = useState<StatusTab>(canApprove && !mineOnly ? "SUBMITTED" : "ALL")
    const [search, setSearch] = useState("")
    const [from, setFrom] = useState("")
    const [to, setTo] = useState("")
    const [page, setPage] = useState(1)
    const [data, setData] = useState<ListResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const pageSize = 25

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const d = await api<ListResponse>(`/api/assets/requests?${qs({
                status: status === "ALL" ? "" : status, search, from, to, page, pageSize,
            })}`)
            setData(d)
        } catch (e) { onError(e, "Couldn't load requests") }
        finally { setLoading(false) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, search, from, to, page, refreshKey])

    useEffect(() => { const t = setTimeout(load, search ? 250 : 0); return () => clearTimeout(t) }, [load, search])
    useEffect(() => { setPage(1) }, [status, search, from, to])

    const counts = data?.counts ?? {}
    const rows = data?.requests ?? []

    return (
        <>
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-3 mb-4 space-y-3">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    {STATUS_TABS.map(t => {
                        const n = t.id === "ALL" ? counts.all : counts[t.id]
                        const on = status === t.id
                        return (
                            <button key={t.id} onClick={() => setStatus(t.id)}
                                className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${on ? "bg-[var(--accent)] text-white" : "bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--border)]"}`}>
                                {t.label}
                                {n !== undefined && (
                                    <span className={`text-[10.5px] font-bold px-1.5 rounded-full ${on ? "bg-white/25" : t.id === "SUBMITTED" && n > 0 ? "bg-red-500 text-white" : "bg-white"}`}>{n}</span>
                                )}
                            </button>
                        )
                    })}
                </div>
                <div className="filter-bar">
                    <div className="filter-search flex items-center gap-1.5 flex-1 sm:min-w-[200px] h-8 rounded-[8px] border border-[var(--border)] bg-white px-2">
                        <Search size={13} className="text-[var(--text3)] shrink-0" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search request ID, employee, asset…"
                            className="flex-1 min-w-0 text-[12px] text-[var(--text)] bg-transparent outline-none placeholder:text-[var(--text3)]" />
                    </div>
                    <div className="filter-full flex items-center gap-1">
                        <Calendar size={13} className="text-[var(--text3)] shrink-0" />
                        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={filterCls} aria-label="From" />
                        <span className="text-[var(--text3)] text-[12px]">–</span>
                        <input type="date" value={to} onChange={e => setTo(e.target.value)} className={filterCls} aria-label="To" />
                    </div>
                </div>
            </div>

            <Card>
                {loading && !data ? <Loading /> : rows.length === 0 ? (
                    <Empty icon={<ClipboardList size={40} />} title="No requests here" sub={status === "SUBMITTED" ? "Nothing is waiting for approval." : undefined} />
                ) : (
                    <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
                        <table className="w-full min-w-[1080px] text-[13px]">
                            <thead>
                                <tr className="border-b border-[var(--border)] bg-[var(--surface2)]">
                                    <th className={thCls}>Request ID</th><th className={thCls}>Employee(s)</th><th className={thCls}>Asset</th>
                                    <th className={`${thCls} !text-right`}>Requested</th><th className={`${thCls} !text-right`}>Approved</th><th className={`${thCls} !text-right`}>Issued</th>
                                    <th className={thCls}>Status</th><th className={thCls}>Fulfilment</th><th className={`${thCls} !text-right`}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {rows.map(r => {
                                    const mine = !!meId && r.requestedBy?.id === meId
                                    const issuable = issuableItems(r)
                                    const approvedSum = isApproved(r) ? sumBy(r.items, i => i.approvedQty) : null
                                    return (
                                        <tr key={r.id} className="hover:bg-[var(--surface2)]/50 transition-colors">
                                            <td className={tdCls}>
                                                <button onClick={() => onOpen(r.id)} className="font-mono text-[12px] font-semibold text-[var(--accent)] hover:underline">{r.requestNo}</button>
                                                <p className="text-[11px] text-[var(--text3)]">{fmtDate(r.createdAt)} · {r.requestedBy?.name}</p>
                                            </td>
                                            <td className={tdCls}>
                                                <p className="font-medium text-[var(--text)]">{employeesSummary(r.items)}</p>
                                                <p className="text-[11px] text-[var(--text3)]">{r.requestType === "MULTIPLE" ? "Multiple" : "Individual"} · {REASON_LABEL[r.reason] ?? r.reason}</p>
                                            </td>
                                            <td className={`${tdCls} text-[var(--text2)]`}>{assetsSummary(r.items)}</td>
                                            <td className={`${tdCls} text-right tabular-nums`}>{sumBy(r.items, i => i.requestedQty)}</td>
                                            <td className={`${tdCls} text-right tabular-nums`}>{approvedSum ?? "—"}</td>
                                            <td className={`${tdCls} text-right tabular-nums`}>{sumBy(r.items, i => i.issuedQty)}</td>
                                            <td className={tdCls}><Pill tone={REQUEST_STATUS[r.status]} /></td>
                                            <td className={tdCls}>{isApproved(r) ? <Pill tone={FULFILMENT_STATUS[r.fulfilmentStatus]} /> : <span className="text-[var(--text3)]">—</span>}</td>
                                            <td className={tdCls}>
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button className={btnSmall} onClick={() => onOpen(r.id)}><Eye size={12} />View</button>
                                                    {canApprove && r.status === "SUBMITTED" && !mine && (
                                                        <button className={btnSmallAccent} onClick={() => onOpen(r.id)}><Check size={12} />Approve / Reject</button>
                                                    )}
                                                    {canIssue && issuable.length > 0 && (
                                                        <button className={btnSmallAccent}
                                                            onClick={() => issuable.length === 1 ? onIssue(r, issuable[0]) : onOpen(r.id)}>
                                                            <PackageCheck size={12} />Issue
                                                        </button>
                                                    )}
                                                </div>
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
        </>
    )
}

// ─── Request drawer ──────────────────────────────────────────────────────────

type RequestDetail = AssetRequest & { issues?: AssetIssue[]; audit?: AuditEntry[] }

const AUDIT_LABEL: Record<string, string> = {
    CREATE: "Raised", CREATED: "Raised", SUBMIT: "Submitted", SUBMITTED: "Submitted",
    APPROVE: "Approved", APPROVED: "Approved", PARTIAL_APPROVE: "Partially approved", PARTIALLY_APPROVED: "Partially approved",
    REJECT: "Rejected", REJECTED: "Rejected", CANCEL: "Cancelled", CANCELLED: "Cancelled",
    ISSUE: "Issued", ISSUED: "Issued",
}

export function RequestDrawer({ id, canApprove, canIssue, meId, refreshKey, onClose, onChanged, onIssue }: {
    id: string
    canApprove: boolean
    canIssue: boolean
    meId?: string
    refreshKey: number
    onClose: () => void
    onChanged: () => void
    onIssue: (r: AssetRequest, item: RequestItem) => void
}) {
    const onError = useApiError()
    const [req, setReq] = useState<RequestDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [mode, setMode] = useState<"view" | "approve" | "reject" | "cancel">("view")
    const [qtys, setQtys] = useState<Record<string, string>>({})
    const [note, setNote] = useState("")
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const d = await api<RequestDetail>(`/api/assets/requests/${id}`)
            setReq(d)
            setQtys(Object.fromEntries(d.items.map(i => [i.id, String(i.approvedQty ?? i.requestedQty)])))
        } catch (e) { onError(e, "Couldn't load the request"); setReq(null) }
        finally { setLoading(false) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, refreshKey])
    useEffect(() => { load() }, [load])
    useEffect(() => { setMode("view"); setNote("") }, [id])

    const mine = !!req && !!meId && req.requestedBy?.id === meId
    const pending = req?.status === "SUBMITTED"
    const canDecide = canApprove && pending && !mine
    const canCancel = !!req && (
        (pending && (mine || canApprove)) ||
        (canApprove && isApproved(req) && req.fulfilmentStatus === "NOT_ISSUED")
    )

    async function act(body: Record<string, unknown>, success: string) {
        setBusy(true)
        try {
            await api(`/api/assets/requests/${id}`, { method: "PATCH", body })
            toast.success(success)
            setMode("view"); setNote("")
            await load()
            onChanged()
        } catch (e) { onError(e) }
        finally { setBusy(false) }
    }

    function approve() {
        if (!req) return
        const items = req.items.map(i => ({ id: i.id, approvedQty: Number(qtys[i.id]) }))
        const bad = items.find((it, idx) => !Number.isInteger(it.approvedQty) || it.approvedQty < 0 || it.approvedQty > req.items[idx].requestedQty)
        if (bad) { toast.error("Approved quantity must be a whole number between 0 and the requested quantity"); return }
        if (items.every(i => i.approvedQty === 0)) { toast.error("Nothing approved — use Reject instead"); return }
        act({ action: "APPROVE", items, note: note.trim() || undefined }, `${req.requestNo} approved`)
    }
    function reject() {
        if (!note.trim()) { toast.error("Give a reason for rejecting"); return }
        act({ action: "REJECT", reason: note.trim() }, `${req?.requestNo} rejected`)
    }
    function cancel() {
        act({ action: "CANCEL", reason: note.trim() || undefined }, `${req?.requestNo} cancelled`)
    }

    const footer = req && (
        mode === "view" ? (
            (canDecide || canCancel || (canApprove && pending && mine)) ? (
                <div className="space-y-2">
                    {canApprove && pending && mine && (
                        <p className="flex items-center gap-1.5 text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                            <Info size={13} /> You raised this — another approver must decide.
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2 justify-end">
                        {canCancel && <button className={btnGhost} onClick={() => setMode("cancel")}><Ban size={14} />Cancel request</button>}
                        {canDecide && <button className={btnDanger} onClick={() => setMode("reject")}><XCircle size={14} />Reject</button>}
                        {canDecide && <button className={btnPrimary} onClick={() => setMode("approve")}><Check size={14} />Approve</button>}
                    </div>
                </div>
            ) : null
        ) : (
            <div className="space-y-2">
                <div>
                    <Label>{mode === "reject" ? "Reason for rejection *" : mode === "cancel" ? "Reason (optional)" : "Note to requester (optional)"}</Label>
                    <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} autoFocus className={inputCls()}
                        placeholder={mode === "approve" ? "e.g. Size L not in stock, approved 1 of 2" : ""} />
                </div>
                <div className="flex gap-2 justify-end">
                    <button className={btnGhost} onClick={() => { setMode("view"); setNote("") }} disabled={busy}>Back</button>
                    {mode === "approve" && <button className={btnPrimary} onClick={approve} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}Confirm approval</button>}
                    {mode === "reject" && <button className={btnDanger} onClick={reject} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}Confirm reject</button>}
                    {mode === "cancel" && <button className={btnDanger} onClick={cancel} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}Cancel request</button>}
                </div>
            </div>
        )
    )

    return (
        <Drawer onClose={onClose} width="max-w-3xl" footer={footer || undefined}
            header={req ? (
                <>
                    <p className="font-mono text-[12px] text-[var(--accent)] font-semibold">{req.requestNo}</p>
                    <h2 className="text-[15px] font-semibold text-[var(--text)] mt-0.5">{employeesSummary(req.items)} · {assetsSummary(req.items)}</h2>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Pill tone={REQUEST_STATUS[req.status]} />
                        {isApproved(req) && <Pill tone={FULFILMENT_STATUS[req.fulfilmentStatus]} />}
                    </div>
                </>
            ) : <h2 className="text-[15px] font-semibold text-[var(--text)]">Asset request</h2>}>
            {loading && !req ? <Loading /> : !req ? (
                <Empty icon={<ClipboardList size={36} />} title="Request not found" />
            ) : (
                <div className="p-5 space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12.5px]">
                        {[
                            ["Type", req.requestType === "MULTIPLE" ? "Multiple" : "Individual"],
                            ["Reason", REASON_LABEL[req.reason] ?? req.reason],
                            ["Raised by", req.requestedBy?.name ?? "—"],
                            ["Raised on", fmtDate(req.createdAt, "dd MMM yyyy, HH:mm")],
                        ].map(([k, v]) => (
                            <div key={k} className="bg-[var(--surface2)] rounded-[10px] p-3">
                                <p className="text-[11px] text-[var(--text3)] mb-0.5">{k}</p>
                                <p className="font-medium text-[var(--text)]">{v}</p>
                            </div>
                        ))}
                    </div>
                    {(req.remarks || req.attachmentUrl) && (
                        <div className="bg-[var(--surface2)] rounded-[10px] p-3 text-[12.5px] space-y-1">
                            {req.remarks && <p className="text-[var(--text)]"><span className="text-[var(--text3)]">Remarks: </span>{req.remarks}</p>}
                            {req.attachmentUrl && (
                                <a href={req.attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"><Paperclip size={12} />Attachment</a>
                            )}
                        </div>
                    )}
                    {req.decidedBy && (
                        <div className={`rounded-[10px] p-3 text-[12.5px] ${req.status === "REJECTED" ? "bg-red-50 text-red-700" : req.status === "CANCELLED" ? "bg-gray-50 text-gray-700" : "bg-green-50 text-green-800"}`}>
                            <p className="font-semibold">{REQUEST_STATUS[req.status].label} by {req.decidedBy.name}{req.decidedAt ? ` · ${fmtDate(req.decidedAt, "dd MMM yyyy, HH:mm")}` : ""}</p>
                            {req.decisionNote && <p className="mt-0.5">{req.decisionNote}</p>}
                        </div>
                    )}

                    {/* Items */}
                    <div>
                        <h3 className="text-[12px] font-semibold text-[var(--text2)] uppercase tracking-[0.5px] mb-2">Items</h3>
                        <div className="border border-[var(--border)] rounded-xl overflow-x-auto">
                            <table className="w-full min-w-[640px] text-[12.5px]">
                                <thead className="bg-[var(--surface2)]">
                                    <tr>
                                        <th className={thCls}>Employee</th><th className={thCls}>Asset</th>
                                        <th className={`${thCls} !text-right`}>Requested</th><th className={`${thCls} !text-right`}>Approved</th>
                                        <th className={`${thCls} !text-right`}>Issued</th><th className={`${thCls} !text-right`}>Remaining</th><th className={thCls}></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {req.items.map(i => {
                                        const remaining = remainingOf(i)
                                        const q = Number(qtys[i.id])
                                        return (
                                            <tr key={i.id}>
                                                <td className="px-4 py-2.5">
                                                    <p className="font-medium text-[var(--text)]">{fullName(i.employee)}</p>
                                                    <p className="text-[11px] text-[var(--text3)]">{i.employee.employeeId}{i.employee.department?.name ? ` · ${i.employee.department.name}` : ""}{i.employee.siteName ? ` · ${i.employee.siteName}` : ""}</p>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <p className="text-[var(--text)]">{i.asset.name}{i.size ? <span className="text-[var(--text3)]"> · {i.size}</span> : null}</p>
                                                    <p className="text-[11px] font-mono text-[var(--accent)]">{i.asset.assetCode}</p>
                                                    {i.remarks && <p className="text-[11px] text-[var(--text3)]">{i.remarks}</p>}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">{i.requestedQty}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">
                                                    {mode === "approve" ? (
                                                        <div className="flex flex-col items-end">
                                                            <input type="number" min={0} max={i.requestedQty} value={qtys[i.id] ?? ""}
                                                                onChange={e => setQtys(s => ({ ...s, [i.id]: e.target.value }))}
                                                                className={inputCls("!w-[72px] !py-1 text-right")} aria-label={`Approved quantity for ${i.asset.name}`} />
                                                            <span className={`text-[10.5px] mt-0.5 ${q > i.asset.available ? "text-amber-600 font-semibold" : "text-[var(--text3)]"}`}>in stock: {i.asset.available}</span>
                                                        </div>
                                                    ) : (i.approvedQty ?? "—")}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">{i.issuedQty}</td>
                                                <td className={`px-4 py-2.5 text-right tabular-nums ${remaining > 0 ? "font-semibold text-amber-600" : ""}`}>{isApproved(req) ? remaining : "—"}</td>
                                                <td className="px-4 py-2.5 text-right">
                                                    {canIssue && isApproved(req) && remaining > 0 && mode === "view" && (
                                                        <button className={btnSmallAccent} onClick={() => onIssue(req, i)}><PackageCheck size={12} />Issue</button>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Issues so far */}
                    {req.issues && req.issues.length > 0 && (
                        <div>
                            <h3 className="text-[12px] font-semibold text-[var(--text2)] uppercase tracking-[0.5px] mb-2">Issued against this request</h3>
                            <div className="space-y-1.5">
                                {req.issues.map(s => (
                                    <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--surface2)] text-[12.5px]">
                                        <span className="font-mono text-[11.5px] text-[var(--accent)] font-semibold">{s.issueNo}</span>
                                        <span className="flex-1 min-w-0 truncate">{fullName(s.employee)} · {s.asset?.name} × {s.quantity}{s.serialNo ? ` · S/N ${s.serialNo}` : ""}</span>
                                        <span className="text-[var(--text3)] whitespace-nowrap">{fmtDate(s.issuedAt)}</span>
                                        <Pill tone={ISSUE_STATUS[s.status] ?? ISSUE_STATUS.ACTIVE} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Audit timeline */}
                    {req.audit && req.audit.length > 0 && (
                        <div>
                            <h3 className="text-[12px] font-semibold text-[var(--text2)] uppercase tracking-[0.5px] mb-2 flex items-center gap-1.5"><History size={13} />Timeline</h3>
                            <ol className="relative border-l border-[var(--border)] ml-1.5 space-y-3">
                                {req.audit.map((a, idx) => (
                                    <li key={idx} className="ml-4">
                                        <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                                        <p className="text-[12.5px] font-medium text-[var(--text)]">
                                            {AUDIT_LABEL[a.action] ?? a.action.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase())}
                                            {a.user?.name ? <span className="text-[var(--text3)] font-normal"> · {a.user.name}</span> : null}
                                        </p>
                                        <p className="text-[11px] text-[var(--text3)]">{fmtDate(a.createdAt, "dd MMM yyyy, HH:mm")}</p>
                                        {a.reason && <p className="text-[12px] text-[var(--text2)] mt-0.5">{a.reason}</p>}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                </div>
            )}
        </Drawer>
    )
}

// ─── Issue asset (against a request item) ────────────────────────────────────

export function IssueFromRequestModal({ request, item, onClose, onDone }: {
    request: AssetRequest
    item: RequestItem
    onClose: () => void
    onDone: () => void
}) {
    const onError = useApiError()
    // One key per modal open: a double-click or retry can't issue twice.
    const idempotencyKey = useRef(newKey()).current
    const [stock, setStock] = useState<StockItem | null>(null)
    const [stockLoading, setStockLoading] = useState(true)
    const remaining = remainingOf(item)
    const inStock = stock?.available ?? item.asset.available
    const trackSerial = !!stock?.trackSerial
    const maxQty = Math.max(0, Math.min(remaining, inStock))
    const [quantity, setQuantity] = useState(String(Math.min(1, maxQty) || 1))
    const [serialNo, setSerialNo] = useState("")
    const [acknowledged, setAcknowledged] = useState(false)
    const [attachmentUrl, setAttachmentUrl] = useState("")
    const [remarks, setRemarks] = useState("")
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        let alive = true
        api<{ items: StockItem[] }>(`/api/assets/stock?${qs({ search: item.asset.assetCode })}`)
            .then(d => { if (alive) setStock(d.items?.find(s => s.id === item.asset.id) ?? null) })
            .catch(() => { })
            .finally(() => { if (alive) setStockLoading(false) })
        return () => { alive = false }
    }, [item.asset.assetCode, item.asset.id])

    useEffect(() => {
        if (stockLoading) return
        setQuantity(trackSerial ? "1" : String(Math.max(1, maxQty)))
    }, [stockLoading, trackSerial, maxQty])

    async function submit() {
        const q = Number(quantity)
        if (!Number.isInteger(q) || q < 1) { toast.error("Enter a quantity of at least 1"); return }
        if (q > maxQty) { toast.error(maxQty === 0 ? "Nothing can be issued right now" : `You can issue at most ${maxQty}`); return }
        if (trackSerial && !serialNo.trim()) { toast.error("Serial / asset tag is required for this asset"); return }
        setSubmitting(true)
        try {
            const d = await api<{ issue: AssetIssue }>("/api/assets/issues", {
                body: {
                    requestItemId: item.id, quantity: q, serialNo: serialNo.trim() || undefined, acknowledged,
                    remarks: remarks.trim() || undefined, attachmentUrl: attachmentUrl || undefined, idempotencyKey,
                },
            })
            toast.success(`${d?.issue?.issueNo ?? "Issue"} recorded — ${q} × ${item.asset.name} to ${fullName(item.employee)}`)
            onDone()
        } catch (e) { onError(e, "Couldn't issue") }
        finally { setSubmitting(false) }
    }

    return (
        <Modal onClose={onClose} wide title="Issue asset" subtitle={`${request.requestNo} · ${fullName(item.employee)} (${item.employee.employeeId})`}>
            <div className="p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                    <span><span className="text-[var(--text3)]">Asset: </span><span className="font-medium">{item.asset.name}</span> <span className="font-mono text-[11.5px] text-[var(--accent)]">{item.asset.assetCode}</span></span>
                    <span><span className="text-[var(--text3)]">Size: </span>{item.size || stock?.size || "—"}</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    <Stat label="Requested" value={item.requestedQty} />
                    <Stat label="Approved" value={item.approvedQty ?? 0} />
                    <Stat label="Already issued" value={item.issuedQty} />
                    <Stat label="Remaining" value={remaining} tone={remaining > 0 ? "warn" : "ok"} />
                    <Stat label="In stock" value={stockLoading ? "…" : inStock} tone={inStock < remaining ? "warn" : undefined} />
                </div>
                {!stockLoading && maxQty === 0 && (
                    <p className="text-[12.5px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{remaining === 0 ? "Everything approved on this line has been issued." : "Out of stock — receive stock before issuing."}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <Label>Issue quantity * <span className="text-[var(--text3)] font-normal">(max {maxQty})</span></Label>
                        <input type="number" min={1} max={maxQty} value={quantity} disabled={trackSerial}
                            onChange={e => setQuantity(e.target.value)} className={inputCls()} />
                        {trackSerial && <p className="text-[11px] text-[var(--text3)] mt-0.5">Serial-tracked: one unit per issue.</p>}
                    </div>
                    <div>
                        <Label>Serial / Asset tag{trackSerial ? " *" : ""}</Label>
                        <input value={serialNo} onChange={e => setSerialNo(e.target.value)} placeholder={trackSerial ? "Required" : "Optional"} className={inputCls()} />
                    </div>
                    <div>
                        <Label>Issue date</Label>
                        <input value={format(new Date(), "dd MMM yyyy")} readOnly disabled className={inputCls()} />
                    </div>
                </div>
                <label className="flex items-center gap-2 text-[13px] text-[var(--text)] cursor-pointer select-none">
                    <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />
                    Employee acknowledged receipt
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <UploadField value={attachmentUrl} onChange={setAttachmentUrl} label="Signature / receipt (optional)" />
                    <div>
                        <Label>Remarks</Label>
                        <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} className={inputCls()} placeholder="Optional" />
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                    <button className={btnGhost} onClick={onClose}>Cancel</button>
                    <button className={btnPrimary} onClick={submit} disabled={submitting || stockLoading || maxQty === 0}>
                        {submitting && <Loader2 size={14} className="animate-spin" />}Issue {quantity && Number(quantity) > 0 ? quantity : ""}
                    </button>
                </div>
            </div>
        </Modal>
    )
}

// ─── Pending issue list ──────────────────────────────────────────────────────

export function PendingIssueTab({ refreshKey, onIssue, onOpen }: {
    refreshKey: number
    onIssue: (r: AssetRequest, item: RequestItem) => void
    onOpen: (id: string) => void
}) {
    const onError = useApiError()
    const [requests, setRequests] = useState<AssetRequest[] | null>(null)
    const [search, setSearch] = useState("")

    const load = useCallback(async () => {
        try {
            const [a, b] = await Promise.all(["NOT_ISSUED", "PARTIALLY_ISSUED"].map(f =>
                api<ListResponse>(`/api/assets/requests?${qs({ fulfilment: f, search, pageSize: 100 })}`)))
            const seen = new Set<string>()
            setRequests([...a.requests, ...b.requests].filter(r => isApproved(r) && !seen.has(r.id) && !!seen.add(r.id)))
        } catch (e) { onError(e, "Couldn't load pending issues"); setRequests([]) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, refreshKey])
    useEffect(() => { const t = setTimeout(load, search ? 250 : 0); return () => clearTimeout(t) }, [load, search])

    const lines = useMemo(() => (requests ?? []).flatMap(r => issuableItems(r).map(i => ({ r, i })))
        .sort((x, y) => x.r.createdAt.localeCompare(y.r.createdAt)), [requests])

    return (
        <>
            <div className="filter-bar mb-4">
                <div className="filter-search flex items-center gap-1.5 flex-1 sm:max-w-sm h-8 rounded-[8px] border border-[var(--border)] bg-white px-2">
                    <Search size={13} className="text-[var(--text3)] shrink-0" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search request ID, employee, asset…"
                        className="flex-1 min-w-0 text-[12px] text-[var(--text)] bg-transparent outline-none placeholder:text-[var(--text3)]" />
                </div>
                <span className="text-[12px] text-[var(--text3)]">{lines.length} line{lines.length === 1 ? "" : "s"} · {sumBy(lines, l => remainingOf(l.i))} unit{sumBy(lines, l => remainingOf(l.i)) === 1 ? "" : "s"} to issue</span>
            </div>
            <Card>
                {!requests ? <Loading /> : lines.length === 0 ? (
                    <Empty icon={<PackageCheck size={40} />} title="Nothing waiting to be issued" sub="Approved requests show up here until they're fulfilled." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[960px] text-[13px]">
                            <thead>
                                <tr className="border-b border-[var(--border)] bg-[var(--surface2)]">
                                    <th className={thCls}>Request ID</th><th className={thCls}>Employee</th><th className={thCls}>Asset</th><th className={thCls}>Size</th>
                                    <th className={`${thCls} !text-right`}>Approved</th><th className={`${thCls} !text-right`}>Issued</th>
                                    <th className={`${thCls} !text-right`}>Remaining</th><th className={`${thCls} !text-right`}>In stock</th><th className={`${thCls} !text-right`}></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {lines.map(({ r, i }) => (
                                    <tr key={i.id} className="hover:bg-[var(--surface2)]/50">
                                        <td className={tdCls}>
                                            <button onClick={() => onOpen(r.id)} className="font-mono text-[12px] font-semibold text-[var(--accent)] hover:underline">{r.requestNo}</button>
                                            <p className="text-[11px] text-[var(--text3)]">Approved {fmtDate(r.decidedAt)}</p>
                                        </td>
                                        <td className={tdCls}>
                                            <p className="font-medium text-[var(--text)]">{fullName(i.employee)}</p>
                                            <p className="text-[11px] text-[var(--text3)]">{i.employee.employeeId}</p>
                                        </td>
                                        <td className={tdCls}>
                                            <p className="text-[var(--text)]">{i.asset.name}</p>
                                            <p className="text-[11px] font-mono text-[var(--accent)]">{i.asset.assetCode}</p>
                                        </td>
                                        <td className={`${tdCls} text-[var(--text2)]`}>{i.size || "—"}</td>
                                        <td className={`${tdCls} text-right tabular-nums`}>{i.approvedQty ?? 0}</td>
                                        <td className={`${tdCls} text-right tabular-nums`}>{i.issuedQty}</td>
                                        <td className={`${tdCls} text-right tabular-nums font-semibold text-amber-600`}>{remainingOf(i)}</td>
                                        <td className={`${tdCls} text-right tabular-nums ${i.asset.available < remainingOf(i) ? "text-red-600 font-semibold" : ""}`}>{i.asset.available}</td>
                                        <td className={`${tdCls} text-right`}>
                                            <button className={btnSmallAccent} onClick={() => onIssue(r, i)} disabled={i.asset.available === 0}><PackageCheck size={12} />Issue</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </>
    )
}
