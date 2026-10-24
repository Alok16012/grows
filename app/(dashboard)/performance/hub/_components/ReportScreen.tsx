"use client"
// Daily / Weekly / Monthly report screen — fill (employee) or review (reviewer).
//
// Achievement, RAG and the score are recomputed client-side as the user types
// (mirroring the server formula in shared.tsx); after a save the server's
// numbers replace them.
import { useCallback, useEffect, useMemo, useState } from "react"
import type React from "react"
import { toast } from "sonner"
import {
    RefreshCw, Link2, Loader2, Save, Send, CheckCircle2, RotateCcw, AlertTriangle, ClipboardList, History, Info,
} from "lucide-react"
import { HubShell, queueChanged } from "./HubNav"
import {
    api, useHub, Card, CardHead, Loading, Empty, Pill, Modal, Label, inputCls, ScoreRing, AutoPill, PtsPill, RagDot, PctText,
    UploadButton, REPORT_STATUS, FREQ_LABEL, KRA_COLORS, btnPrimary, btnGhost, btnSuccess, btnSmall, thCls, tdCls,
    achievementOf, ragOf, scoreOf, toNum, fmtNum, fmtDate, fullName, periodLabel, isoDay,
    type ReportDetail, type KPI, type KpiValue, type Rag,
} from "./shared"

type RKpi = KPI & { value: KpiValue | null }
type Draft = { actual: string; remark: string; evidenceUrl: string }

function draftOf(k: RKpi): Draft {
    const a = k.value?.actual
    return { actual: a === null || a === undefined ? "" : String(a), remark: k.value?.remark ?? "", evidenceUrl: k.value?.evidenceUrl ?? "" }
}

// A computed value wins on the server; when a register/system KPI has none yet
// the employee may type it in as a fallback.
const isAutoKpi = (k: RKpi) => !!k.value?.isAuto && k.value.actual !== null
const isSourced = (k: RKpi) => k.sourceType !== "MANUAL"

const ACTION_LABEL: Record<string, string> = {
    CREATED: "Created", SAVE: "Saved draft", SAVED: "Saved draft", SUBMIT: "Submitted", SUBMITTED: "Submitted",
    APPROVE: "Approved", APPROVED: "Approved", RETURN: "Returned", RETURNED: "Returned", REFRESH_AUTO: "Refreshed auto values",
}

export function ReportScreen({ id, back }: { id: string; back: { href: string; label: string } }) {
    const { missing, fail } = useHub()
    const [report, setReport] = useState<ReportDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [drafts, setDrafts] = useState<Record<string, Draft>>({})
    const [busy, setBusy] = useState<null | "save" | "submit" | "refresh" | "approve" | "return">(null)
    const [note, setNote] = useState("")
    const [evidenceFor, setEvidenceFor] = useState<RKpi | null>(null)
    const [returnOpen, setReturnOpen] = useState(false)

    const allKpis = useMemo(() => (report?.kras ?? []).flatMap(k => k.kpis), [report])

    const load = useCallback(async () => {
        try {
            const d = await api<{ report: ReportDetail }>(`/reports/${id}`)
            setReport(d.report)
            const next: Record<string, Draft> = {}
            for (const kra of d.report.kras) for (const k of kra.kpis) next[k.id] = draftOf(k)
            setDrafts(next)
        } catch (e) { fail(e, "Could not load report") }
        finally { setLoading(false) }
    }, [id, fail])

    useEffect(() => { load() }, [load])

    const changed = useMemo(() => allKpis.filter(k => {
        const a = drafts[k.id], b = draftOf(k)
        return a && (a.actual !== b.actual || a.remark !== b.remark || a.evidenceUrl !== b.evidenceUrl)
    }), [allKpis, drafts])
    const dirty = changed.length > 0

    useEffect(() => {
        if (!dirty) return
        const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
        window.addEventListener("beforeunload", h)
        return () => window.removeEventListener("beforeunload", h)
    }, [dirty])

    // Live view of each KPI: server numbers unless the user changed the actual.
    const live = useMemo(() => {
        const m: Record<string, { actual: number | null; ach: number | null; rag: Rag | null }> = {}
        for (const k of allKpis) {
            const d = drafts[k.id]
            const auto = isAutoKpi(k)
            const serverActual = k.value?.actual ?? null
            if (auto || !d || d.actual === draftOf(k).actual) {
                const ach = k.value?.achievementPct ?? achievementOf(k, serverActual)
                m[k.id] = { actual: serverActual, ach: serverActual === null ? null : ach, rag: serverActual === null ? null : (k.value?.rag ?? ragOf(k, ach)) }
            } else {
                const a = toNum(d.actual)
                const ach = achievementOf(k, a)
                m[k.id] = { actual: a, ach, rag: ragOf(k, ach) }
            }
        }
        return m
    }, [allKpis, drafts])

    const withValues = allKpis.filter(k => live[k.id]?.actual !== null && live[k.id]?.actual !== undefined).length
    const score = dirty ? scoreOf(allKpis.map(k => ({ ach: live[k.id]?.ach ?? null, weight: Number(k.weightage) || 0 }))) : (report?.score ?? null)
    const redCount = allKpis.filter(k => live[k.id]?.rag === "RED").length

    const setDraft = (kpiId: string, patch: Partial<Draft>) => setDrafts(p => ({ ...p, [kpiId]: { ...p[kpiId], ...patch } }))

    async function save(silent = false): Promise<boolean> {
        if (!report) return false
        if (!dirty) return true
        const values = []
        for (const k of changed) {
            const d = drafts[k.id]
            const v: { kpiId: string; actual?: number | null; remark?: string | null; evidenceUrl?: string | null } = {
                kpiId: k.id, remark: d.remark.trim() || null, evidenceUrl: d.evidenceUrl.trim() || null,
            }
            if (!isAutoKpi(k)) {
                const n = toNum(d.actual)
                if (d.actual.trim() !== "" && n === null) { toast.error(`"${k.name}": actual must be a number`); return false }
                v.actual = n
            }
            values.push(v)
        }
        setBusy("save")
        try {
            await api(`/reports/${report.id}`, { method: "PATCH", body: { action: "SAVE", values } })
            if (!silent) toast.success("Draft saved")
            await load()
            return true
        } catch (e) { fail(e); return false }
        finally { setBusy(null) }
    }

    async function refreshAuto() {
        if (!report) return
        if (dirty && !(await save(true))) return
        setBusy("refresh")
        try {
            await api(`/reports/${report.id}`, { method: "PATCH", body: { action: "REFRESH_AUTO" } })
            toast.success("Auto values refreshed")
            await load()
        } catch (e) { fail(e) } finally { setBusy(null) }
    }

    async function submit() {
        if (!report) return
        const missingRemark = allKpis.filter(k => live[k.id]?.rag === "RED" && !drafts[k.id]?.remark.trim())
        if (missingRemark.length) { toast.error(`Add a remark / action plan for every RED KPI (${missingRemark.length} missing)`); return }
        // Register / Growus KPIs are recalculated by the server on submit, so only manual ones are checked here.
        const noValue = allKpis.filter(k => !isSourced(k) && (live[k.id]?.actual === null || live[k.id]?.actual === undefined))
        if (noValue.length) { toast.error(`Enter a value for: ${noValue.map(k => k.name).join(", ")}`); return }
        const missingEvidence = allKpis.filter(k => k.evidenceRequired && !drafts[k.id]?.evidenceUrl.trim())
        if (missingEvidence.length) { toast.error(`Evidence link required for: ${missingEvidence.map(k => k.name).join(", ")}`); return }
        if (dirty && !(await save(true))) return
        setBusy("submit")
        try {
            await api(`/reports/${report.id}`, { method: "PATCH", body: { action: "SUBMIT" } })
            toast.success("Submitted for approval")
            await load()
        } catch (e) { fail(e) } finally { setBusy(null) }
    }

    async function decide(action: "APPROVE" | "RETURN", text: string) {
        if (!report) return
        if (action === "RETURN" && !text.trim()) { toast.error("Add a note telling them what to fix"); return }
        setBusy(action === "APPROVE" ? "approve" : "return")
        try {
            await api(`/reports/${report.id}`, { method: "PATCH", body: { action, note: text.trim() || undefined } })
            toast.success(action === "APPROVE" ? "Report approved" : "Report returned")
            queueChanged()
            setNote(""); setReturnOpen(false)
            await load()
        } catch (e) { fail(e) } finally { setBusy(null) }
    }

    if (loading) return <HubShell title="Report" back={back} missing={missing}><Card><Loading /></Card></HubShell>
    if (!report) return <HubShell title="Report" back={back} missing={missing}><Card><Empty icon={<ClipboardList size={40} />} title="Report not found" /></Card></HubShell>

    const editable = report.canEdit
    const title = `${FREQ_LABEL[report.frequency]} report · ${report.frequency === "DAILY" ? isoDay(report.periodStart) : periodLabel(report)}`
    const subtitle = (
        <span>
            {fullName(report.employee)} <span className="font-mono">({report.employee.employeeId})</span> · {report.template.name} <span className="font-mono">v{report.template.version}</span> · {fmtDate(report.periodStart)}{report.frequency !== "DAILY" && <> – {fmtDate(report.periodEnd)}</>}
        </span>
    )
    const showReview = report.canReview && report.status === "SUBMITTED"
    const showBar = editable || showReview

    return (
        <HubShell title={title} subtitle={subtitle} back={back} missing={missing}>
            {/* Summary */}
            <Card className="mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4">
                    <ScoreRing score={score} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Pill tone={REPORT_STATUS[report.status]} />
                            <span className="text-[13px] text-[var(--text2)]"><b className="font-mono text-[var(--text)]">{withValues}</b> of <b className="font-mono text-[var(--text)]">{allKpis.length}</b> KPIs have values</span>
                            {redCount > 0 && <span className="text-[12px] font-semibold" style={{ color: "var(--red)" }}>· {redCount} RED</span>}
                            {dirty && <span className="text-[11.5px] font-medium text-[var(--amber)]">· unsaved changes</span>}
                        </div>
                        <p className="text-[12px] text-[var(--text3)] mt-1.5 flex items-start gap-1.5">
                            <Info size={13} className="shrink-0 mt-[1px]" />
                            <span>KPIs marked <AutoPill /> are calculated from your registers. Add a remark / action plan for every RED KPI before submitting.</span>
                        </p>
                    </div>
                    {editable && allKpis.some(isSourced) && (
                        <button className={btnSmall} onClick={refreshAuto} disabled={!!busy}>
                            <RefreshCw size={12} className={busy === "refresh" ? "animate-spin" : ""} /> Refresh auto values
                        </button>
                    )}
                </div>
            </Card>

            {report.status === "RETURNED" && report.decisionNote && (
                <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <div><p className="font-semibold">Returned by your reviewer</p><p className="mt-0.5 whitespace-pre-wrap">{report.decisionNote}</p></div>
                </div>
            )}
            {report.status === "APPROVED" && report.decisionNote && (
                <div className="mb-4 rounded-2xl border border-[var(--success-border)] bg-[var(--success-light)] px-4 py-3 text-[13px] text-[var(--success)]">
                    <span className="font-semibold">Reviewer note:</span> {report.decisionNote}
                </div>
            )}

            {/* KRA cards */}
            <div className="space-y-4">
                {report.kras.map((kra, i) => {
                    const kraScore = scoreOf(kra.kpis.map(k => ({ ach: live[k.id]?.ach ?? null, weight: Number(k.weightage) || 0 })))
                    return (
                        <Card key={kra.id}>
                            <CardHead accent={KRA_COLORS[i % KRA_COLORS.length]} title={kra.title}
                                sub={<span>Weight <span className="font-mono">{fmtNum(kra.weight)}</span> · {kra.kpis.length} KPI{kra.kpis.length === 1 ? "" : "s"}</span>}
                                right={<span className="text-[12px] text-[var(--text3)]">KRA <PctText value={kraScore} /></span>} />
                            <div className="overflow-x-auto">
                                <table className="w-full text-[13px] min-w-[860px]">
                                    <thead><tr>
                                        <th className={thCls}>KPI</th>
                                        <th className={thCls}>Target</th>
                                        <th className={`${thCls} w-[150px]`}>Actual</th>
                                        <th className={`${thCls} text-right w-[72px]`}>Achv.</th>
                                        <th className={`${thCls} text-center w-[52px]`}>RAG</th>
                                        <th className={`${thCls} min-w-[220px]`}>Remark / action</th>
                                        <th className={`${thCls} w-[44px]`} />
                                    </tr></thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        {kra.kpis.map(k => (
                                            <KpiRow key={k.id} k={k} draft={drafts[k.id] ?? draftOf(k)} live={live[k.id]} editable={editable}
                                                busy={busy === "refresh"} onChange={p => setDraft(k.id, p)} onRefresh={refreshAuto} onEvidence={() => setEvidenceFor(k)} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )
                })}
            </div>

            {/* Activity */}
            <Card className="mt-4">
                <CardHead title={<span className="inline-flex items-center gap-2"><History size={14} className="text-[var(--text3)]" /> Activity</span>} />
                {report.activity.length === 0 ? (
                    <p className="px-4 py-5 text-[12.5px] text-[var(--text3)]">No activity yet.</p>
                ) : (
                    <ol className="px-4 py-3 space-y-3">
                        {[...report.activity].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((a, i) => (
                            <li key={i} className="flex gap-3">
                                <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: /APPROV/.test(a.action) ? "var(--success-strong)" : /RETURN/.test(a.action) ? "var(--red)" : /SUBMIT/.test(a.action) ? "var(--amber)" : "var(--border2)" }} />
                                <div className="min-w-0 text-[12.5px]">
                                    <p className="text-[var(--text)]"><b>{ACTION_LABEL[a.action] ?? a.action}</b> <span className="text-[var(--text2)]">by {a.user?.name ?? "System"}</span></p>
                                    {a.note && <p className="text-[var(--text2)] whitespace-pre-wrap mt-0.5">{a.note}</p>}
                                    <p className="text-[11px] text-[var(--text3)] mt-0.5">{fmtDate(a.createdAt, "dd MMM yyyy, HH:mm")}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </Card>

            {/* Sticky action bar */}
            {showBar && (
                <div className="sticky bottom-0 z-20 mt-4 -mx-4 sm:-mx-7 px-4 sm:px-7 py-3 bg-[var(--surface)]/95 backdrop-blur border-t border-[var(--border)] shadow-[0_-6px_16px_-12px_rgba(15,23,41,0.35)]">
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                        {editable && (<>
                            <span className="mr-auto text-[12px] text-[var(--text3)] hidden sm:inline">
                                {dirty ? <span className="text-[var(--amber)] font-medium">{changed.length} unsaved change{changed.length === 1 ? "" : "s"}</span> : "All changes saved"}
                            </span>
                            <button className={btnGhost} onClick={() => save()} disabled={!!busy || !dirty}>
                                {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save draft
                            </button>
                            {report.canSubmit && (
                                <button className={btnPrimary} onClick={submit} disabled={!!busy}>
                                    {busy === "submit" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Submit for approval
                                </button>
                            )}
                        </>)}
                        {showReview && (<>
                            <input className={inputCls("!bg-white sm:max-w-[320px] flex-1 min-w-[180px]")} value={note} onChange={e => setNote(e.target.value)} placeholder="Note to the employee (required to return)" />
                            <button className={`${btnGhost} !text-red-600 hover:!bg-red-50`} onClick={() => note.trim() ? decide("RETURN", note) : setReturnOpen(true)} disabled={!!busy}>
                                {busy === "return" ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Return
                            </button>
                            <button className={btnSuccess} onClick={() => decide("APPROVE", note)} disabled={!!busy}>
                                {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
                            </button>
                        </>)}
                    </div>
                </div>
            )}

            {evidenceFor && (
                <EvidenceModal kpi={evidenceFor} url={drafts[evidenceFor.id]?.evidenceUrl ?? ""} editable={editable}
                    onClose={() => setEvidenceFor(null)} onSave={u => { setDraft(evidenceFor.id, { evidenceUrl: u }); setEvidenceFor(null) }} />
            )}
            {returnOpen && <ReturnModal busy={busy === "return"} onClose={() => setReturnOpen(false)} onReturn={t => decide("RETURN", t)} />}
        </HubShell>
    )
}

function KpiRow({ k, draft, live, editable, busy, onChange, onRefresh, onEvidence }: {
    k: RKpi; draft: Draft; live: { actual: number | null; ach: number | null; rag: Rag | null } | undefined
    editable: boolean; busy: boolean; onChange: (p: Partial<Draft>) => void; onRefresh: () => void; onEvidence: () => void
}) {
    const auto = isAutoKpi(k)
    const red = live?.rag === "RED"
    const needRemark = red && !draft.remark.trim()
    const unit = k.valueType === "PERCENT" ? "%" : k.valueType === "CURRENCY" ? "₹" : ""
    const fmtActual = (n: number | null) => n === null ? "—" : k.valueType === "YESNO" ? (n >= 1 ? "Yes" : "No") : k.valueType === "CURRENCY" ? `₹${fmtNum(n)}` : `${fmtNum(n)}${unit === "%" ? "%" : ""}`

    const refreshBtn = editable && isSourced(k) ? (
        <button className="text-[var(--text3)] hover:text-[var(--accent)] shrink-0" title="Recalculate from registers / Growus data" onClick={onRefresh} disabled={busy} aria-label="Refresh auto value">
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
        </button>
    ) : null

    let actualCell: React.ReactNode
    if (auto) {
        actualCell = (
            <span className="inline-flex items-center gap-1.5">
                <span className="font-mono font-semibold text-[var(--text)]">{fmtActual(live?.actual ?? null)}</span>
                <AutoPill />
                {refreshBtn}
            </span>
        )
    } else if (!editable) {
        actualCell = <span className="font-mono font-semibold text-[var(--text)]">{fmtActual(live?.actual ?? null)}</span>
    } else if (k.valueType === "YESNO") {
        actualCell = (
            <select className={inputCls("!py-1.5 !bg-white")} value={draft.actual} onChange={e => onChange({ actual: e.target.value })}>
                <option value="">—</option><option value="1">Yes</option><option value="0">No</option>
            </select>
        )
    } else {
        actualCell = (
            <div className="relative">
                {unit === "₹" && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[var(--text3)]">₹</span>}
                <input className={inputCls(`!py-1.5 !bg-white font-mono text-right ${unit === "₹" ? "!pl-6" : ""} ${unit === "%" ? "!pr-6" : ""}`)} inputMode="decimal"
                    value={draft.actual} placeholder="—" onChange={e => onChange({ actual: e.target.value })} aria-label={`Actual for ${k.name}`} />
                {unit === "%" && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[var(--text3)]">%</span>}
            </div>
        )
    }

    if (!auto && editable && refreshBtn) {
        actualCell = (
            <div>
                <div className="flex items-center gap-1.5">{actualCell}{refreshBtn}</div>
                <p className="text-[10.5px] text-[var(--text3)] mt-0.5">No auto value yet — enter it or refresh</p>
            </div>
        )
    }

    return (
        <tr className="align-top">
            <td className={tdCls}>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-[var(--text)]">{k.name}</span>
                    <PtsPill pts={Number(k.weightage) || 0} />
                </div>
                {k.measurable && <p className="text-[11.5px] text-[var(--text3)] mt-0.5">{k.measurable}</p>}
            </td>
            <td className={`${tdCls} font-mono text-[12.5px] text-[var(--text2)] whitespace-nowrap`}>{k.targetLabel || fmtActual(toNum(k.target))}</td>
            <td className={tdCls}>{actualCell}</td>
            <td className={`${tdCls} text-right`}><PctText value={live?.ach ?? null} /></td>
            <td className={`${tdCls} text-center`}><span className="inline-flex justify-center w-full pt-1"><RagDot rag={live?.rag ?? null} size={11} /></span></td>
            <td className={tdCls}>
                {editable ? (<>
                    <input className={inputCls(`!py-1.5 !bg-white ${needRemark ? "!border-red-400 focus:!border-red-500" : ""}`)} value={draft.remark}
                        placeholder={red ? "Why RED, and the action plan" : "Remark (optional)"} onChange={e => onChange({ remark: e.target.value })} aria-label={`Remark for ${k.name}`} />
                    {needRemark && <p className="text-[10.5px] font-medium text-red-600 mt-0.5">required</p>}
                </>) : (
                    <span className={`text-[12.5px] ${draft.remark ? "text-[var(--text2)]" : "text-[var(--text3)]"}`}>{draft.remark || "—"}</span>
                )}
            </td>
            <td className={`${tdCls} text-center`}>
                {(k.evidenceRequired || draft.evidenceUrl) && (
                    <button onClick={onEvidence} title={draft.evidenceUrl ? "Evidence attached" : "Evidence link required"} aria-label="Evidence"
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${draft.evidenceUrl ? "text-[var(--accent)] bg-[var(--accent-light)]" : k.evidenceRequired && live?.actual !== null ? "text-red-500 hover:bg-red-50" : "text-[var(--text3)] hover:bg-[var(--surface2)]"}`}>
                        <Link2 size={14} />
                    </button>
                )}
            </td>
        </tr>
    )
}

function EvidenceModal({ kpi, url, editable, onClose, onSave }: { kpi: RKpi; url: string; editable: boolean; onClose: () => void; onSave: (u: string) => void }) {
    const [v, setV] = useState(url)
    return (
        <Modal title="Evidence" subtitle={kpi.name} onClose={onClose}
            footer={editable ? <>
                <button className={btnGhost} onClick={onClose}>Cancel</button>
                <button className={btnPrimary} onClick={() => {
                    if (v.trim() && !/^(https?:\/\/|\/)/i.test(v.trim())) { toast.error("Enter a full link (https://…)"); return }
                    onSave(v.trim())
                }}>Done</button>
            </> : <button className={btnGhost} onClick={onClose}>Close</button>}>
            <div className="p-5 space-y-3">
                {editable ? (<>
                    <div>
                        <Label hint="A link to a photo, sheet or document that backs up the value">Evidence link</Label>
                        <input className={inputCls()} value={v} onChange={e => setV(e.target.value)} placeholder="https://…" autoFocus />
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[12px] text-[var(--text3)]">or</span>
                        <UploadButton onUploaded={setV} />
                    </div>
                </>) : null}
                {v ? <a href={v} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--accent)] hover:underline break-all"><Link2 size={13} /> {v}</a>
                    : !editable && <p className="text-[13px] text-[var(--text3)]">No evidence attached.</p>}
            </div>
        </Modal>
    )
}

function ReturnModal({ busy, onClose, onReturn }: { busy: boolean; onClose: () => void; onReturn: (note: string) => void }) {
    const [t, setT] = useState("")
    return (
        <Modal title="Return report" subtitle="The employee sees this note and can fix and resubmit." onClose={onClose}
            footer={<>
                <button className={btnGhost} onClick={onClose}>Cancel</button>
                <button className={`${btnPrimary} !bg-red-600`} onClick={() => onReturn(t)} disabled={busy || !t.trim()}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Return
                </button>
            </>}>
            <div className="p-5">
                <Label>Note *</Label>
                <textarea className={inputCls("min-h-[100px]")} value={t} onChange={e => setT(e.target.value)} placeholder="What needs to change?" autoFocus />
            </div>
        </Modal>
    )
}
