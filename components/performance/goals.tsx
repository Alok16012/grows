"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Plus, Loader2, Trash2, Check, RefreshCw, Settings, AlertTriangle, TrendingUp, TrendingDown, X, Save, RotateCcw, Users } from "lucide-react"
import { scoreReview, bandFor, cleanDescription, kpiDirection, DEFAULT_BANDS, type Band, type Direction } from "@/lib/performance-score"

// Goal sheet for one review: KRAs (weights total 100) → KPIs (weights total 100
// per KRA) → achievement → 1–5 score → KRA score → overall score and band.
// Scores are worked out with the same lib the server uses on submit.

type KPI = { id: string; reviewId: string; kraId?: string | null; title: string; description?: string | null; target: number | string; actual?: number | string | null; weightage: number; rating?: number | null }
type KRA = { id: string; title: string; weightage: number; kpis: KPI[] }
type Review = { id: string; status: string; kras: KRA[]; kpis: KPI[]; employee: { designation?: string | null } }

const btn = "inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12.5px] font-semibold disabled:opacity-50"
const inp = "h-8 rounded-[7px] border border-[var(--border2)] bg-[var(--surface)] px-2 text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v))

async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!res.ok) throw new Error((await res.text()) || "Request failed")
    return res.json().catch(() => ({}))
}

export function useBands() {
    const [bands, setBands] = useState<Band[]>(DEFAULT_BANDS)
    useEffect(() => { fetch("/api/performance/policy").then(r => r.ok ? r.json() : null).then(d => d?.bands && setBands(d.bands)).catch(() => {}) }, [])
    return bands
}

function ScoreChip({ score }: { score: number | null }) {
    if (score === null) return <span className="text-[11.5px] text-[var(--text3)]">—</span>
    const c = score >= 4 ? "#15803d" : score >= 3 ? "#b45309" : "#b91c1c"
    return <span className="inline-flex items-center justify-center min-w-[34px] h-6 px-1.5 rounded-[6px] text-[12px] font-bold" style={{ color: c, background: `${c}14` }}>{score.toFixed(score % 1 ? 1 : 0)}</span>
}

function KpiLine({ kpi, editable, onChanged, self }: { kpi: KPI; editable: boolean; onChanged: () => void; self?: SelfEntry }) {
    const [actual, setActual] = useState(kpi.actual ?? "")
    const [rating, setRating] = useState<number>(kpi.rating ?? 0)
    const [busy, setBusy] = useState(false)
    useEffect(() => { setActual(kpi.actual ?? ""); setRating(kpi.rating ?? 0) }, [kpi.actual, kpi.rating])
    const dirty = String(actual) !== String(kpi.actual ?? "") || rating !== (kpi.rating ?? 0)
    const res = scoreReview([], [{ ...kpi, target: Number(kpi.target) || 0, actual: n(actual), rating: rating || null, kraId: null }]).kras[0]?.kpis[0]
    const dir = kpiDirection(kpi)

    const save = async () => {
        setBusy(true)
        try { await call(`/api/performance/${kpi.reviewId}/kpis/${kpi.id}`, "PUT", { actual: actual === "" ? null : actual, rating: rating || null }); onChanged() }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save") } finally { setBusy(false) }
    }
    const flip = async () => {
        try { await call(`/api/performance/${kpi.reviewId}/kpis/${kpi.id}`, "PUT", { direction: dir === "lower" ? "higher" : "lower" }); onChanged() }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
    }
    const remove = async () => {
        if (!confirmDelete(`Remove KPI "${kpi.title}"?`)) return
        try { await call(`/api/performance/${kpi.reviewId}/kpis/${kpi.id}`, "DELETE"); onChanged() }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
    }

    return (
        <div className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,1fr)_70px_86px_120px_70px_auto] gap-2 items-center py-2.5 border-b border-[var(--border)] last:border-b-0">
            <div className="min-w-0 col-span-2 md:col-span-1">
                <p className="text-[13px] font-semibold text-[var(--text)] truncate">{kpi.title}</p>
                <p className="text-[11.5px] text-[var(--text3)] flex items-center gap-1.5 flex-wrap">
                    <button type="button" onClick={editable ? flip : undefined} disabled={!editable} title={editable ? "Switch direction" : undefined}
                        className={`inline-flex items-center gap-0.5 ${editable ? "hover:text-[var(--accent)]" : ""}`}>
                        {dir === "lower" ? <TrendingDown size={12} /> : <TrendingUp size={12} />}{dir === "lower" ? "lower is better" : "higher is better"}
                    </button>
                    · target {kpi.target} · weight {kpi.weightage}%{cleanDescription(kpi.description) ? ` · ${cleanDescription(kpi.description)}` : ""}
                </p>
                {self && (self.actual !== null || self.rating || self.comment) && (
                    <p className="text-[11.5px] text-[#6d28d9] mt-0.5" title={self.comment || undefined}>
                        Employee: {self.actual !== null ? `actual ${self.actual}` : "no actual"}{self.rating ? ` · self ${self.rating}/5` : ""}{self.comment ? ` · “${self.comment.length > 70 ? self.comment.slice(0, 70) + "…" : self.comment}”` : ""}
                    </p>
                )}
            </div>
            <div className="text-[11px] text-[var(--text3)] md:text-center md:order-none">
                <span className="md:hidden">Weight </span>{kpi.weightage}%
            </div>
            <input value={actual} onChange={e => setActual(e.target.value)} disabled={!editable} inputMode="decimal" placeholder="Actual" className={`${inp} w-full`} />
            <div className="flex items-center gap-0.5" title="Manager rating overrides the calculated score">
                {[1, 2, 3, 4, 5].map(i => (
                    <button key={i} type="button" disabled={!editable} onClick={() => setRating(rating === i ? 0 : i)}
                        className={`w-[22px] h-[22px] rounded-[5px] text-[11px] font-bold ${rating >= i ? "bg-[#fbbf24] text-white" : "bg-[var(--surface2)] text-[var(--text3)]"}`}>{i}</button>
                ))}
            </div>
            <div className="text-right md:text-center">
                <ScoreChip score={res?.score ?? null} />
                <p className="text-[10.5px] text-[var(--text3)]">{res?.achievement != null ? `${res.achievement}%` : ""}{res?.source === "manager" ? " · rated" : res?.source === "auto" ? " · auto" : ""}</p>
            </div>
            {editable ? (
                <div className="flex items-center gap-1">
                    <button onClick={save} disabled={!dirty || busy} title="Save" className="w-8 h-8 rounded-[7px] border border-[var(--border)] flex items-center justify-center disabled:opacity-40">
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} className="text-[#16a34a]" />}
                    </button>
                    <button onClick={remove} title="Remove KPI" className="w-8 h-8 rounded-[7px] border border-[var(--border)] flex items-center justify-center text-[var(--text3)] hover:text-[var(--red)]"><Trash2 size={13} /></button>
                </div>
            ) : <span />}
        </div>
    )
}

function confirmDelete(msg: string) {
    // Plain confirm keeps this dependency-free; deletes are rare and reversible by re-adding.
    return typeof window === "undefined" ? false : window.confirm(msg)
}

function KraCard({ kra, reviewId, result, canEditGoals, canScore, onChanged, self }: {
    kra: KRA; reviewId: string; result?: { score: number | null; kpiWeightTotal: number }
    canEditGoals: boolean; canScore: boolean; onChanged: () => void; self?: Record<string, SelfEntry>
}) {
    const [w, setW] = useState(String(kra.weightage))
    const [adding, setAdding] = useState(false)
    const [f, setF] = useState<{ title: string; target: string; weightage: string; direction: Direction }>({ title: "", target: "", weightage: "", direction: "higher" })
    useEffect(() => setW(String(kra.weightage)), [kra.weightage])
    const kpiTotal = result?.kpiWeightTotal ?? kra.kpis.reduce((t, k) => t + k.weightage, 0)

    const saveWeight = async () => {
        if (Number(w) === kra.weightage) return
        try { await call(`/api/performance/${reviewId}/kras/${kra.id}`, "PUT", { weightage: Number(w) }); onChanged() }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
    }
    const remove = async () => {
        if (!confirmDelete(`Remove KRA "${kra.title}" and its ${kra.kpis.length} KPI(s)?`)) return
        try { await call(`/api/performance/${reviewId}/kras/${kra.id}`, "DELETE"); onChanged() }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
    }
    const addKpi = async () => {
        if (!f.title.trim() || f.target === "") return toast.error("KPI title and target are required")
        try {
            await call(`/api/performance/${reviewId}/kpis`, "POST", { ...f, kraId: kra.id, weightage: Number(f.weightage) || Math.max(0, 100 - kpiTotal) || 10 })
            setF({ title: "", target: "", weightage: "", direction: "higher" }); setAdding(false); onChanged()
        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to add KPI") }
    }

    return (
        <div className="border border-[var(--border)] rounded-[12px] overflow-hidden mb-3">
            <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 bg-[var(--surface2)]">
                <p className="text-[13.5px] font-bold text-[var(--text)] flex-1 min-w-[140px]">{kra.title}</p>
                <label className="flex items-center gap-1 text-[11.5px] text-[var(--text3)]">
                    Weight
                    <input value={w} onChange={e => setW(e.target.value)} onBlur={saveWeight} disabled={!canEditGoals} inputMode="decimal" className={`${inp} w-[54px] text-center`} />%
                </label>
                <span className={`text-[11px] font-semibold ${Math.abs(kpiTotal - 100) > 0.5 ? "text-[#b45309]" : "text-[var(--text3)]"}`} title="KPI weights in this KRA">KPIs {kpiTotal}%</span>
                <ScoreChip score={result?.score ?? null} />
                {canEditGoals && (
                    <>
                        <button onClick={() => setAdding(v => !v)} className={`${btn} bg-[var(--accent)] text-white h-7`}><Plus size={12} /> KPI</button>
                        <button onClick={remove} title="Remove KRA" className="w-7 h-7 rounded-[7px] flex items-center justify-center text-[var(--text3)] hover:text-[var(--red)]"><Trash2 size={13} /></button>
                    </>
                )}
            </div>
            {adding && (
                <div className="flex flex-wrap gap-2 px-3.5 py-2.5 border-b border-[var(--border)] bg-[var(--accent-light)]/40">
                    <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="KPI, e.g. Inspections per day" className={`${inp} flex-1 min-w-[180px]`} />
                    <input value={f.target} onChange={e => setF({ ...f, target: e.target.value })} placeholder="Target" inputMode="decimal" className={`${inp} w-[80px]`} />
                    <input value={f.weightage} onChange={e => setF({ ...f, weightage: e.target.value })} placeholder={`Wt ${Math.max(0, 100 - kpiTotal)}`} inputMode="decimal" className={`${inp} w-[70px]`} />
                    <select value={f.direction} onChange={e => setF({ ...f, direction: e.target.value as Direction })} className={inp}>
                        <option value="higher">Higher is better</option>
                        <option value="lower">Lower is better</option>
                    </select>
                    <button onClick={addKpi} className={`${btn} bg-[var(--accent)] text-white`}>Add</button>
                </div>
            )}
            <div className="px-3.5">
                {kra.kpis.length === 0 && <p className="py-3 text-[12px] text-[var(--text3)]">No KPIs yet.</p>}
                {kra.kpis.map(k => <KpiLine key={k.id} kpi={k} editable={canScore} onChanged={onChanged} self={self?.[k.id]} />)}
            </div>
        </div>
    )
}

export function GoalsPanel({ review, isManager, onChanged }: { review: Review; isManager: boolean; onChanged: () => void }) {
    const bands = useBands()
    const [roles, setRoles] = useState<string[]>([])
    const [newKra, setNewKra] = useState({ title: "", weightage: "" })
    const [busy, setBusy] = useState<string | null>(null)
    const canEditGoals = isManager && review.status === "DRAFT"
    const canScore = isManager && (review.status === "DRAFT" || review.status === "SUBMITTED")
    const selfData = useSelfAssessment(review.id).data

    useEffect(() => {
        if (!isManager) return
        fetch("/api/performance/templates").then(r => r.ok ? r.json() : []).then((t: { role: string }[]) => setRoles(Array.from(new Set(t.map(x => x.role))))).catch(() => {})
    }, [isManager])

    const kpis = useMemo(() => [...review.kras.flatMap(k => k.kpis.map(p => ({ ...p, kraId: k.id }))), ...review.kpis.filter(p => !p.kraId)], [review])
    const score = useMemo(() => scoreReview(
        review.kras.map(k => ({ id: k.id, title: k.title, weightage: k.weightage })),
        kpis.map(p => ({ ...p, target: Number(p.target) || 0, actual: n(p.actual) })),
    ), [review, kpis])
    const band = bandFor(score.overall, bands)
    const kraWeightTotal = review.kras.reduce((t, k) => t + k.weightage, 0)

    const loadTemplate = async (role: string) => {
        setBusy(role)
        try { const r = await call(`/api/performance/${review.id}/template`, "POST", { role }); toast.success(`Added ${r.added} KRA(s) from ${role.replace(/_/g, " ").toLowerCase()}`); onChanged() }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed") } finally { setBusy(null) }
    }
    const addKra = async () => {
        if (!newKra.title.trim()) return
        try { await call(`/api/performance/${review.id}/kras`, "POST", { title: newKra.title, weightage: Number(newKra.weightage) || Math.max(0, 100 - kraWeightTotal) }); setNewKra({ title: "", weightage: "" }); onChanged() }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
    }
    const sync = async () => {
        setBusy("sync")
        try { const r = await call(`/api/performance/${review.id}/sync`, "POST"); toast.success(`${r.syncedCount ?? 0} KPI actual(s) pulled from attendance / inspections / recruitment`); onChanged() }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed") } finally { setBusy(null) }
    }

    return (
        <div className="space-y-4">
            {/* Score summary */}
            <div className="rounded-[12px] border border-[var(--border)] p-4 flex flex-wrap items-center gap-4" style={{ background: band ? `${band.color}0d` : "var(--surface2)" }}>
                <div>
                    <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Calculated score</p>
                    <p className="text-[28px] font-bold leading-none" style={{ color: band?.color ?? "var(--text)" }}>{score.overall?.toFixed(2) ?? "—"}<span className="text-[13px] text-[var(--text3)] font-medium"> / 5</span></p>
                </div>
                {band && (
                    <div className="text-[12.5px] text-[var(--text2)] space-y-0.5">
                        <p className="font-semibold" style={{ color: band.color }}>{band.label}</p>
                        <p>Suggested increment {band.increment}% · bonus {band.bonus}%{band.pip ? " · PIP recommended" : ""}</p>
                    </div>
                )}
                <div className="ml-auto text-right text-[11.5px] text-[var(--text3)]">
                    <p>KRA weights: <b className={Math.abs(kraWeightTotal - 100) > 0.5 ? "text-[#b45309]" : "text-[var(--text)]"}>{kraWeightTotal}%</b> of 100%</p>
                    <p>{review.kras.length} KRA · {kpis.length} KPI</p>
                    {isManager && <p>Self-assessment: <b className="text-[var(--text)]">{selfData?.submittedAt ? "submitted" : "pending"}</b></p>}
                </div>
            </div>

            {score.issues.length > 0 && review.status === "DRAFT" && (
                <div className="rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[12.5px] text-[#92400e] space-y-1">
                    {score.issues.map(i => <p key={i} className="flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-px" />{i}</p>)}
                    <p className="text-[11.5px] opacity-80">These need fixing before the manager can submit the review.</p>
                </div>
            )}

            {isManager && (
                <div className="flex flex-wrap items-center gap-2">
                    {canEditGoals && roles.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[12px] text-[var(--text3)] flex items-center gap-1"><Settings size={13} /> Template:</span>
                            {roles.map(r => (
                                <button key={r} onClick={() => loadTemplate(r)} disabled={!!busy} className={`${btn} border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] h-7`}>
                                    {busy === r && <Loader2 size={12} className="animate-spin" />}{r.replace(/_/g, " ").toLowerCase()}
                                </button>
                            ))}
                        </div>
                    )}
                    {canScore && (
                        <button onClick={sync} disabled={!!busy} className={`${btn} border border-[var(--accent)] text-[var(--accent)] ml-auto`}>
                            {busy === "sync" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Pull actuals
                        </button>
                    )}
                </div>
            )}

            {review.kras.length === 0 && kpis.length === 0 && (
                <p className="text-center text-[13px] text-[var(--text3)] py-8">No goals yet. {canEditGoals ? "Load a template above or add a KRA." : ""}</p>
            )}

            {review.kras.map(k => (
                <KraCard key={k.id} kra={k} reviewId={review.id} result={score.kras.find(r => r.id === k.id)} canEditGoals={canEditGoals} canScore={canScore} onChanged={onChanged} self={selfData?.entries} />
            ))}

            {review.kpis.filter(p => !p.kraId).length > 0 && (
                <div className="border border-dashed border-[var(--border2)] rounded-[12px] px-3.5 py-2">
                    <p className="text-[12px] font-semibold text-[var(--text3)] py-1">KPIs outside a KRA (each counts with its own weight)</p>
                    {review.kpis.filter(p => !p.kraId).map(p => <KpiLine key={p.id} kpi={p} editable={canScore} onChanged={onChanged} self={selfData?.entries?.[p.id]} />)}
                </div>
            )}

            {canEditGoals && (
                <div className="flex flex-wrap gap-2 items-center">
                    <input value={newKra.title} onChange={e => setNewKra({ ...newKra, title: e.target.value })} placeholder="New KRA, e.g. Quality of work" className={`${inp} flex-1 min-w-[200px] h-9`} />
                    <input value={newKra.weightage} onChange={e => setNewKra({ ...newKra, weightage: e.target.value })} placeholder={`Wt ${Math.max(0, 100 - kraWeightTotal)}`} inputMode="decimal" className={`${inp} w-[80px] h-9`} />
                    <button onClick={addKra} className={`${btn} h-9 bg-[var(--accent)] text-white`}><Plus size={14} /> Add KRA</button>
                </div>
            )}

            <details className="text-[12px] text-[var(--text3)]">
                <summary className="cursor-pointer font-medium text-[var(--text2)]">How the score is worked out</summary>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>Achievement = actual ÷ target (inverted for lower-is-better KPIs), capped at 150%.</li>
                    <li>KPI score: ≥120% → 5, ≥100% → 4, ≥85% → 3, ≥70% → 2, below → 1. A manager rating replaces it.</li>
                    <li>KRA score = weighted average of its KPI scores; overall = weighted average of KRA scores.</li>
                    <li>The band, suggested increment, bonus and PIP flag come from the rating bands set by HR.</li>
                </ul>
            </details>
        </div>
    )
}

// ─── Start a review cycle for many employees ─────────────────────────────────

export function BulkCycleModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
    const today = new Date()
    const q = Math.floor(today.getMonth() / 3)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const [f, setF] = useState({
        cycle: "QUARTERLY",
        periodStart: iso(new Date(Date.UTC(today.getFullYear(), q * 3, 1))),
        periodEnd: iso(new Date(Date.UTC(today.getFullYear(), q * 3 + 3, 0))),
        departmentId: "", designation: "", template: "auto",
    })
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
    const [roles, setRoles] = useState<string[]>([])
    const [preview, setPreview] = useState<{ matched: number; toCreate: number; skipped: number; withTemplate: number } | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (!open) return
        fetch("/api/departments").then(r => r.ok ? r.json() : []).then(d => setDepartments(Array.isArray(d) ? d : d.departments ?? [])).catch(() => {})
        fetch("/api/performance/templates").then(r => r.ok ? r.json() : []).then((t: { role: string }[]) => setRoles(Array.from(new Set(t.map(x => x.role))))).catch(() => {})
    }, [open])

    const run = useCallback(async (dryRun: boolean) => {
        setBusy(true)
        try {
            const r = await call("/api/performance/bulk", "POST", { ...f, dryRun })
            if (dryRun) setPreview(r)
            else { toast.success(`${r.created} review(s) created${r.templated ? `, ${r.templated} with goals from templates` : ""}${r.skipped ? ` · ${r.skipped} already had one` : ""}`); onDone(); onClose() }
        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed") } finally { setBusy(false) }
    }, [f, onClose, onDone])

    useEffect(() => { if (open) { setPreview(null); const t = setTimeout(() => run(true), 300); return () => clearTimeout(t) } }, [open, f]) // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null
    const field = "w-full h-9 rounded-[8px] border border-[var(--border2)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/40">
            <div className="bg-[var(--surface)] rounded-[16px] border border-[var(--border)] w-full max-w-lg shadow-xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <div>
                        <h2 className="text-[15px] font-semibold text-[var(--text)]">Start a review cycle</h2>
                        <p className="text-[12px] text-[var(--text3)]">Creates a draft review for each employee, with goals from the matching template.</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)] hover:text-[var(--text)]"><X size={18} /></button>
                </div>
                <div className="p-5 grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Cycle</label>
                        <select value={f.cycle} onChange={e => setF({ ...f, cycle: e.target.value })} className={field}>
                            <option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="HALF_YEARLY">Half-yearly</option><option value="ANNUAL">Annual</option>
                        </select>
                    </div>
                    <div><label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Period from</label><input type="date" value={f.periodStart} onChange={e => setF({ ...f, periodStart: e.target.value })} className={field} /></div>
                    <div><label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Period to</label><input type="date" value={f.periodEnd} onChange={e => setF({ ...f, periodEnd: e.target.value })} className={field} /></div>
                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Department</label>
                        <select value={f.departmentId} onChange={e => setF({ ...f, departmentId: e.target.value })} className={field}>
                            <option value="">All departments</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div><label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Designation contains</label><input value={f.designation} onChange={e => setF({ ...f, designation: e.target.value })} placeholder="e.g. Inspector" className={field} /></div>
                    <div className="col-span-2">
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Goals</label>
                        <select value={f.template} onChange={e => setF({ ...f, template: e.target.value })} className={field}>
                            <option value="auto">Match a template to each designation</option>
                            {roles.map(r => <option key={r} value={r}>Everyone gets: {r.replace(/_/g, " ").toLowerCase()}</option>)}
                            <option value="none">No goals — set them per review</option>
                        </select>
                    </div>
                    <div className="col-span-2 rounded-[10px] bg-[var(--surface2)] border border-[var(--border)] px-3.5 py-2.5 text-[12.5px] text-[var(--text2)] flex items-center gap-2">
                        <Users size={14} />
                        {!preview ? <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Counting…</span>
                            : <span><b className="text-[var(--text)]">{preview.toCreate}</b> review(s) will be created{preview.withTemplate ? `, ${preview.withTemplate} with template goals` : ""}{preview.skipped ? ` · ${preview.skipped} skipped (already have one for this period)` : ""}.</span>}
                    </div>
                </div>
                <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
                    <button onClick={onClose} className="h-9 px-4 rounded-[8px] text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)]">Cancel</button>
                    <button onClick={() => run(false)} disabled={busy || !preview?.toCreate} className="inline-flex items-center gap-2 h-9 px-5 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50">
                        {busy && <Loader2 size={14} className="animate-spin" />} Create {preview?.toCreate ?? ""} review(s)
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Rating bands (HR) ────────────────────────────────────────────────────────

export function BandsEditor() {
    const [bands, setBands] = useState<Band[] | null>(null)
    const [saved, setSaved] = useState<string>("")
    const [busy, setBusy] = useState(false)
    useEffect(() => { fetch("/api/performance/policy").then(r => r.json()).then(d => { setBands(d.bands); setSaved(JSON.stringify(d.bands)) }).catch(() => setBands(DEFAULT_BANDS)) }, [])
    if (!bands) return <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-[var(--accent)]" /></div>
    const set = (i: number, patch: Partial<Band>) => setBands(bands.map((b, j) => (j === i ? { ...b, ...patch } : b)))
    const save = async () => {
        setBusy(true)
        try { const d = await call("/api/performance/policy", "PUT", { bands }); setBands(d.bands); setSaved(JSON.stringify(d.bands)); toast.success("Rating bands saved") }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed") } finally { setBusy(false) }
    }
    return (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)]">
                <h3 className="text-[14px] font-semibold text-[var(--text)]">Rating bands</h3>
                <p className="text-[12px] text-[var(--text3)]">Which overall score earns which rating, and the increment, bonus and PIP suggested on submit. Managers can still change them per review.</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[12.5px]">
                    <thead><tr className="bg-[var(--surface2)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">
                        {["Score from", "Label", "Rank", "Increment %", "Bonus %", "PIP", ""].map(h => <th key={h} className="text-left px-3 py-2.5">{h}</th>)}
                    </tr></thead>
                    <tbody>
                        {bands.map((b, i) => (
                            <tr key={i} className="border-t border-[var(--border)]">
                                <td className="px-3 py-2"><input value={b.min} onChange={e => set(i, { min: Number(e.target.value) })} inputMode="decimal" className={`${inp} w-[70px]`} /></td>
                                <td className="px-3 py-2"><input value={b.label} onChange={e => set(i, { label: e.target.value })} className={`${inp} w-[180px]`} /></td>
                                <td className="px-3 py-2">
                                    <select value={b.rank} onChange={e => set(i, { rank: e.target.value as Band["rank"] })} className={inp}>
                                        <option value="TOP_PERFORMER">Top performer</option><option value="HIGH_PERFORMER">High performer</option><option value="AVERAGE">Average</option><option value="LOW_PERFORMER">Low performer</option>
                                    </select>
                                </td>
                                <td className="px-3 py-2"><input value={b.increment} onChange={e => set(i, { increment: Number(e.target.value) })} inputMode="decimal" className={`${inp} w-[70px]`} /></td>
                                <td className="px-3 py-2"><input value={b.bonus} onChange={e => set(i, { bonus: Number(e.target.value) })} inputMode="decimal" className={`${inp} w-[70px]`} /></td>
                                <td className="px-3 py-2"><input type="checkbox" checked={b.pip} onChange={e => set(i, { pip: e.target.checked })} className="accent-[var(--accent)] w-4 h-4" /></td>
                                <td className="px-3 py-2"><span className="inline-block w-4 h-4 rounded-full" style={{ background: b.color }} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
                <button onClick={() => setBands(DEFAULT_BANDS)} className={`${btn} h-9 text-[var(--text2)] hover:bg-[var(--surface2)]`}><RotateCcw size={13} /> Defaults</button>
                <button onClick={save} disabled={busy || JSON.stringify(bands) === saved} className={`${btn} h-9 bg-[var(--accent)] text-white`}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save bands</button>
            </div>
        </div>
    )
}

// ─── Employee self-assessment, KPI by KPI ────────────────────────────────────

type SelfEntry = { actual: number | null; rating: number | null; comment: string }
type SelfData = { submittedAt: string | null; entries: Record<string, SelfEntry> }

export function useSelfAssessment(reviewId: string) {
    const [data, setData] = useState<SelfData | null>(null)
    const load = useCallback(() => {
        fetch(`/api/performance/${reviewId}/self`).then(r => r.ok ? r.json() : null).then(setData).catch(() => setData(null))
    }, [reviewId])
    useEffect(() => { load() }, [load])
    return { data, reload: load, setData }
}

export function SelfAssessmentPanel({ review, isOwner, onChanged }: { review: Review; isOwner: boolean; onChanged: () => void }) {
    const { data, setData } = useSelfAssessment(review.id)
    const [draft, setDraft] = useState<Record<string, { actual: string; rating: number; comment: string }>>({})
    const [busy, setBusy] = useState<"save" | "submit" | null>(null)

    useEffect(() => {
        if (!data) return
        const d: Record<string, { actual: string; rating: number; comment: string }> = {}
        for (const [id, e] of Object.entries(data.entries)) d[id] = { actual: e.actual === null ? "" : String(e.actual), rating: e.rating ?? 0, comment: e.comment ?? "" }
        setDraft(d)
    }, [data])

    const groups = useMemo(() => [
        ...review.kras.map(k => ({ id: k.id, title: k.title, weightage: k.weightage, kpis: k.kpis })),
        ...(review.kpis.filter(p => !p.kraId).length ? [{ id: "other", title: "Other KPIs", weightage: 0, kpis: review.kpis.filter(p => !p.kraId) }] : []),
    ], [review])
    const allKpis = groups.flatMap(g => g.kpis)
    const editable = isOwner && review.status === "DRAFT" && !data?.submittedAt
    const rated = allKpis.filter(k => draft[k.id]?.rating).length
    const set = (id: string, patch: Partial<{ actual: string; rating: number; comment: string }>) =>
        setDraft(d => ({ ...d, [id]: { ...(d[id] ?? { actual: "", rating: 0, comment: "" }), ...patch } }))

    const save = async (submit: boolean) => {
        setBusy(submit ? "submit" : "save")
        try {
            const entries = Object.fromEntries(Object.entries(draft).map(([id, e]) => [id, { actual: e.actual, rating: e.rating || null, comment: e.comment }]))
            const d = await call(`/api/performance/${review.id}/self`, "PUT", { entries, submit })
            setData(d)
            toast.success(submit ? "Self-assessment submitted to your manager" : "Saved")
            onChanged()
        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save") } finally { setBusy(null) }
    }

    if (!data) return <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-[var(--accent)]" /></div>
    if (!allKpis.length) return <p className="text-[13px] text-[var(--text3)] py-6 text-center">Your manager hasn&apos;t set your KRAs / KPIs for this review yet.</p>

    return (
        <div className="space-y-4">
            <div className={`rounded-[10px] px-3.5 py-2.5 text-[12.5px] border ${data.submittedAt ? "bg-[#f0fdf4] border-[#bbf7d0] text-[#166534]" : "bg-[var(--surface2)] border-[var(--border)] text-[var(--text2)]"}`}>
                {data.submittedAt
                    ? <>Self-assessment submitted on {new Date(data.submittedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}.{isOwner ? " Your manager will now evaluate it." : ""}</>
                    : isOwner
                        ? <>For each KPI, enter what you achieved, rate yourself 1–5 and add a note or evidence. Rated {rated} of {allKpis.length}.</>
                        : <>The employee hasn&apos;t submitted their self-assessment yet{rated ? ` (${rated} of ${allKpis.length} filled so far)` : ""}.</>}
            </div>

            {groups.map(g => (
                <div key={g.id} className="border border-[var(--border)] rounded-[12px] overflow-hidden">
                    <div className="px-3.5 py-2.5 bg-[var(--surface2)] flex items-center justify-between">
                        <p className="text-[13.5px] font-bold text-[var(--text)]">{g.title}</p>
                        {g.weightage > 0 && <span className="text-[11.5px] text-[var(--text3)]">Weight {g.weightage}%</span>}
                    </div>
                    {g.kpis.map(k => {
                        const e = draft[k.id] ?? { actual: "", rating: 0, comment: "" }
                        const dir = kpiDirection(k)
                        return (
                            <div key={k.id} className="px-3.5 py-3 border-t border-[var(--border)] first:border-t-0 space-y-2">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <p className="text-[13px] font-semibold text-[var(--text)]">{k.title}</p>
                                    <p className="text-[11.5px] text-[var(--text3)]">Target {k.target} · {dir === "lower" ? "lower is better" : "higher is better"} · weight {k.weightage}%</p>
                                </div>
                                {cleanDescription(k.description) && <p className="text-[11.5px] text-[var(--text3)]">{cleanDescription(k.description)}</p>}
                                <div className="flex flex-wrap items-center gap-3">
                                    <label className="flex items-center gap-1.5 text-[12px] text-[var(--text2)]">
                                        My actual
                                        <input value={e.actual} onChange={ev => set(k.id, { actual: ev.target.value })} disabled={!editable} inputMode="decimal" placeholder="—" className={`${inp} w-[90px]`} />
                                    </label>
                                    <div className="flex items-center gap-1 text-[12px] text-[var(--text2)]">
                                        My rating
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <button key={i} type="button" disabled={!editable} onClick={() => set(k.id, { rating: e.rating === i ? 0 : i })}
                                                className={`w-[24px] h-[24px] rounded-[6px] text-[11.5px] font-bold ${e.rating >= i ? "bg-[#fbbf24] text-white" : "bg-[var(--surface2)] text-[var(--text3)]"}`}>{i}</button>
                                        ))}
                                    </div>
                                </div>
                                <textarea value={e.comment} onChange={ev => set(k.id, { comment: ev.target.value })} disabled={!editable} rows={2} maxLength={1000}
                                    placeholder={editable ? "What did you do? Add evidence — numbers, reports, examples…" : "—"}
                                    className="w-full rounded-[8px] border border-[var(--border2)] bg-[var(--surface)] px-3 py-2 text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent)] resize-y disabled:bg-[var(--surface2)]" />
                            </div>
                        )
                    })}
                </div>
            ))}

            {editable && (
                <div className="flex flex-wrap justify-end gap-2">
                    <button onClick={() => save(false)} disabled={!!busy} className={`${btn} h-9 border border-[var(--border)] text-[var(--text2)]`}>{busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save draft</button>
                    <button onClick={() => save(true)} disabled={!!busy || rated < allKpis.length} title={rated < allKpis.length ? "Rate every KPI first" : undefined} className={`${btn} h-9 bg-[var(--accent)] text-white`}>
                        {busy === "submit" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Submit to manager
                    </button>
                </div>
            )}
        </div>
    )
}
