"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
    ClipboardList, Plus, Trash2, Lock, Unlock, Loader2, CheckCircle2, EyeOff, ArrowUp, ArrowDown, X,
    BarChart3, Pencil, Send, Download, Star,
} from "lucide-react"
import {
    Drawer, Field, FormFooter, AudiencePicker, inputClass, deadlineLabel, StatusPill, EmptyState,
    type Site, type Role,
} from "./ui"

type QType = "single" | "multi" | "rating" | "yesno" | "text"
type Question = { id: string; type: QType; label: string; required: boolean; options?: string[] }
type SurveyRow = {
    id: string; title: string; description: string | null; anonymous: boolean
    status: string; open: boolean; closesAt: string | null; createdAt: string
    targetSiteIds: string[]; targetRoleIds: string[]
    questionCount: number; respondedAt: string | null; responseCount: number | null
}
type Summary = { questionId: string; answered: number; counts?: Record<string, number>; average?: number | null; texts?: string[] }
type SurveyDetail = SurveyRow & {
    questions: Question[]; rawStatus: string; myAnswers: Record<string, unknown> | null
    summary?: Summary[]; responses?: { respondent: string; submittedAt: string; answers: Record<string, unknown> }[]
}

const TYPE_LABEL: Record<QType, string> = {
    single: "One choice", multi: "Several choices", rating: "Rating 1–5", yesno: "Yes / No", text: "Written answer",
}

const newId = () => Math.random().toString(36).slice(2, 10)

export default function SurveysPanel({ canManage, sites, roles, audienceLabel, onPending }: {
    canManage: boolean; sites: Site[]; roles: Role[]
    audienceLabel: (siteIds?: string[], roleIds?: string[]) => string
    /** Open surveys the viewer hasn't answered, for the tab badge. */
    onPending?: (n: number) => void
}) {
    const [surveys, setSurveys] = useState<SurveyRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState<"open" | "draft" | "closed" | "all">("open")
    const [builder, setBuilder] = useState<{ edit?: SurveyDetail } | null>(null)
    const [taking, setTaking] = useState<string | null>(null)
    const [results, setResults] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/surveys")
            const data = await res.json().catch(() => null)
            if (!res.ok) { setError(data?.error || "Could not load surveys."); setSurveys([]); return }
            setError(null)
            setSurveys(Array.isArray(data) ? data : [])
        } catch {
            setError("Could not load surveys. Check your connection and try again.")
        } finally {
            setLoading(false)
        }
    }, [])
    useEffect(() => { load() }, [load])
    useEffect(() => { onPending?.(surveys.filter(s => s.open && !s.respondedAt).length) }, [surveys, onPending])

    const match = (s: SurveyRow) => filter === "all" || (filter === "open" ? s.open : filter === "draft" ? s.status === "DRAFT" : s.status === "CLOSED")
    const shown = surveys.filter(match)
    const filters = (canManage ? ["open", "draft", "closed", "all"] : ["open", "closed", "all"]) as typeof filter[]
    const count = (f: typeof filter) => surveys.filter(s => f === "all" || (f === "open" ? s.open : f === "draft" ? s.status === "DRAFT" : s.status === "CLOSED")).length

    async function openEditor(id: string) {
        const res = await fetch(`/api/surveys/${id}`)
        const data = await res.json().catch(() => null)
        if (!res.ok) { toast.error(data?.error || "Could not open the survey"); return }
        setBuilder({ edit: data })
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="z-tabs-wrap"><div className="z-tabs" role="tablist" aria-label="Filter surveys">
                    {filters.map(f => (
                        <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`z-tab ${filter === f ? "is-active" : ""}`}>
                            {f[0].toUpperCase() + f.slice(1)} <span className="opacity-60">{count(f)}</span>
                        </button>
                    ))}
                </div></div>
                {canManage && (
                    <button onClick={() => setBuilder({})}
                        className="inline-flex items-center gap-2 h-[40px] px-4 rounded-[10px] bg-[var(--accent)] text-white text-[13px] font-semibold hover:opacity-90">
                        <Plus size={16} /> New survey
                    </button>
                )}
            </div>

            {loading ? (
                <div className="space-y-3">{[0, 1].map(i => <div key={i} className="h-28 rounded-[12px] bg-muted animate-pulse" />)}</div>
            ) : error ? (
                <EmptyState icon={<ClipboardList size={28} />} title={error} />
            ) : shown.length === 0 ? (
                <EmptyState icon={<ClipboardList size={28} />}
                    title={filter === "open" ? "No open surveys right now" : filter === "draft" ? "No drafts" : filter === "closed" ? "No closed surveys yet" : "No surveys yet"}
                    hint={canManage ? "Build a survey to collect feedback with several questions." : "Surveys from HR will appear here."} />
            ) : (
                <div className="space-y-3">
                    {shown.map(s => (
                        <SurveyCard key={s.id} survey={s} canManage={canManage} audience={audienceLabel(s.targetSiteIds, s.targetRoleIds)}
                            onTake={() => setTaking(s.id)} onResults={() => setResults(s.id)} onEdit={() => openEditor(s.id)} onChanged={load} />
                    ))}
                </div>
            )}

            {builder && <SurveyBuilder sites={sites} roles={roles} edit={builder.edit} onClose={() => setBuilder(null)} onSaved={() => { setBuilder(null); load() }} />}
            {taking && <TakeSurvey id={taking} onClose={() => setTaking(null)} onDone={() => { setTaking(null); load() }} />}
            {results && <SurveyResults id={results} onClose={() => setResults(null)} />}
        </div>
    )
}

function SurveyCard({ survey: s, canManage, audience, onTake, onResults, onEdit, onChanged }: {
    survey: SurveyRow; canManage: boolean; audience: string
    onTake: () => void; onResults: () => void; onEdit: () => void; onChanged: () => void
}) {
    const [busy, setBusy] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const deadline = deadlineLabel(s.closesAt, s.open)

    async function setStatus(status: string, done: string) {
        setBusy(true)
        try {
            const res = await fetch(`/api/surveys/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
            const data = await res.json().catch(() => null)
            if (!res.ok) { toast.error(data?.error || "Could not update the survey"); return }
            toast.success(done)
            onChanged()
        } finally { setBusy(false) }
    }
    async function remove() {
        setBusy(true)
        try {
            const res = await fetch(`/api/surveys/${s.id}`, { method: "DELETE" })
            if (!res.ok) { toast.error("Could not delete the survey"); return }
            toast.success("Survey deleted")
            onChanged()
        } finally { setBusy(false) }
    }

    const iconBtn = "p-1.5 rounded-md text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)]"
    return (
        <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <StatusPill status={s.status} />
                        {deadline && <span className="text-[11.5px] text-[var(--text3)]">{deadline}</span>}
                        <span className="text-[11.5px] text-[var(--text3)]">· {s.questionCount} question{s.questionCount === 1 ? "" : "s"}</span>
                        {s.anonymous && <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text3)]"><EyeOff size={11} /> Anonymous</span>}
                    </div>
                    <h3 className="text-[15px] font-semibold text-[var(--text)] break-words">{s.title}</h3>
                    {s.description && <p className="text-[13px] text-[var(--text2)] mt-1 line-clamp-2 break-words">{s.description}</p>}
                    {canManage && (
                        <p className="text-[12px] text-[var(--text3)] mt-1.5">
                            {s.responseCount ?? 0} response{s.responseCount === 1 ? "" : "s"} · {audience}
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {s.respondedAt ? (
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--success)]">
                            <CheckCircle2 size={15} /> Answered {new Date(s.respondedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                    ) : s.open ? (
                        <button onClick={onTake} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold">
                            Start survey
                        </button>
                    ) : null}
                    {canManage && (
                        <>
                            <button onClick={onResults} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[9px] border border-[var(--border)] text-[13px] font-medium text-[var(--text)] hover:bg-[var(--surface2)]">
                                <BarChart3 size={14} /> Results
                            </button>
                            {s.status === "DRAFT" && (
                                <button onClick={() => setStatus("ACTIVE", "Survey published")} disabled={busy}
                                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[9px] border border-[var(--accent)] text-[13px] font-semibold text-[var(--accent)]">
                                    <Send size={14} /> Publish
                                </button>
                            )}
                            {(s.status === "DRAFT" || !s.responseCount) && (
                                <button onClick={onEdit} title="Edit survey" aria-label="Edit survey" className={iconBtn}><Pencil size={15} /></button>
                            )}
                            {s.status !== "DRAFT" && (
                                <button onClick={() => setStatus(s.open ? "CLOSED" : "ACTIVE", s.open ? "Survey closed" : "Survey reopened")} disabled={busy}
                                    title={s.open ? "Close survey" : "Reopen survey"} aria-label={s.open ? "Close survey" : "Reopen survey"} className={iconBtn}>
                                    {s.open ? <Lock size={15} /> : <Unlock size={15} />}
                                </button>
                            )}
                            <button onClick={() => setConfirmDelete(true)} disabled={busy} title="Delete survey" aria-label="Delete survey"
                                className="p-1.5 rounded-md text-[var(--text3)] hover:text-[var(--red)] hover:bg-[var(--red-light)]"><Trash2 size={15} /></button>
                        </>
                    )}
                </div>
            </div>
            {confirmDelete && (
                <div className="rounded-[10px] border border-[#fecaca] bg-[var(--red-light)] px-3 py-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--red)]">
                    <span className="flex-1 min-w-0">Delete this survey and all {s.responseCount ?? 0} responses? This can&apos;t be undone.</span>
                    <button onClick={() => setConfirmDelete(false)} className="h-8 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]">Keep</button>
                    <button onClick={remove} disabled={busy} className="h-8 px-3 rounded-[8px] bg-[var(--red)] text-white font-semibold">Delete</button>
                </div>
            )}
        </div>
    )
}

// ─── Builder ─────────────────────────────────────────────────────────────────

function SurveyBuilder({ sites, roles, edit, onClose, onSaved }: { sites: Site[]; roles: Role[]; edit?: SurveyDetail; onClose: () => void; onSaved: () => void }) {
    const [title, setTitle] = useState(edit?.title ?? "")
    const [description, setDescription] = useState(edit?.description ?? "")
    const [anonymous, setAnonymous] = useState(edit?.anonymous ?? false)
    const [closesAt, setClosesAt] = useState(edit?.closesAt && new Date(edit.closesAt) > new Date() ? toLocalInput(edit.closesAt) : "")
    const [targetSiteIds, setTargetSiteIds] = useState<string[]>(edit?.targetSiteIds ?? [])
    const [targetRoleIds, setTargetRoleIds] = useState<string[]>(edit?.targetRoleIds ?? [])
    const [questions, setQuestions] = useState<Question[]>(edit?.questions?.length ? edit.questions : [{ id: newId(), type: "rating", label: "", required: true }])
    const [saving, setSaving] = useState(false)
    const isDraft = !edit || edit.rawStatus === "DRAFT"

    const update = (i: number, patch: Partial<Question>) => setQuestions(prev => prev.map((q, j) => j === i ? { ...q, ...patch } : q))
    const move = (i: number, d: -1 | 1) => setQuestions(prev => {
        const next = [...prev]; const j = i + d
        if (j < 0 || j >= next.length) return prev
        ;[next[i], next[j]] = [next[j], next[i]]
        return next
    })
    const setType = (i: number, type: QType) => update(i, { type, options: type === "single" || type === "multi" ? (questions[i].options?.length ? questions[i].options : ["", ""]) : undefined })

    async function save(status: "DRAFT" | "ACTIVE") {
        if (!title.trim()) { toast.error("Give the survey a title"); return }
        if (questions.some(q => !q.label.trim())) { toast.error("Every question needs text"); return }
        const cleaned = questions.map(q => ({ ...q, label: q.label.trim(), options: q.options?.map(o => o.trim()).filter(Boolean) }))
        if (cleaned.some(q => (q.type === "single" || q.type === "multi") && (q.options?.length ?? 0) < 2)) { toast.error("Choice questions need at least two choices"); return }
        setSaving(true)
        try {
            const body = { title, description, anonymous, status, closesAt: closesAt ? new Date(closesAt).toISOString() : null, targetSiteIds, targetRoleIds, questions: cleaned }
            const res = await fetch(edit ? `/api/surveys/${edit.id}` : "/api/surveys", {
                method: edit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) { toast.error(data?.error || "Could not save the survey"); return }
            toast.success(status === "ACTIVE" ? (isDraft ? "Survey published" : "Survey saved") : "Draft saved")
            onSaved()
        } finally { setSaving(false) }
    }

    return (
        <Drawer title={edit ? "Edit survey" : "New survey"} onClose={onClose} wide>
            <div className="space-y-4">
                <Field label="Title *">
                    <input id="survey-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Canteen feedback, November" className={inputClass} />
                </Field>
                <Field label="Introduction (optional)">
                    <textarea id="survey-description" value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={2000} className={`${inputClass} resize-none`} />
                </Field>

                <div className="space-y-3">
                    <p className="text-[12px] font-medium text-[var(--text2)]">Questions</p>
                    {questions.map((q, i) => (
                        <div key={q.id} className="rounded-[12px] border border-[var(--border)] bg-[var(--surface2)] p-3 space-y-2.5">
                            <div className="flex items-center gap-2">
                                <span className="text-[12px] font-semibold text-[var(--text3)] w-6 shrink-0">Q{i + 1}</span>
                                <select id={`q-${q.id}-type`} value={q.type} onChange={e => setType(i, e.target.value as QType)} className={`${inputClass} w-auto flex-1`}>
                                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move question up" className="p-1.5 rounded-md text-[var(--text3)] hover:bg-[var(--surface)] disabled:opacity-30"><ArrowUp size={14} /></button>
                                <button onClick={() => move(i, 1)} disabled={i === questions.length - 1} aria-label="Move question down" className="p-1.5 rounded-md text-[var(--text3)] hover:bg-[var(--surface)] disabled:opacity-30"><ArrowDown size={14} /></button>
                                {questions.length > 1 && (
                                    <button onClick={() => setQuestions(prev => prev.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`} className="p-1.5 rounded-md text-[var(--text3)] hover:text-[var(--red)] hover:bg-[var(--red-light)]"><Trash2 size={14} /></button>
                                )}
                            </div>
                            <input id={`q-${q.id}-label`} value={q.label} onChange={e => update(i, { label: e.target.value })} maxLength={300} placeholder="Question text" className={inputClass} />
                            {(q.type === "single" || q.type === "multi") && (
                                <div className="space-y-1.5 pl-8">
                                    {(q.options ?? []).map((o, k) => (
                                        <div key={k} className="flex gap-2">
                                            <input id={`q-${q.id}-opt-${k}`} value={o} maxLength={120} placeholder={`Choice ${k + 1}`}
                                                onChange={e => update(i, { options: (q.options ?? []).map((x, m) => m === k ? e.target.value : x) })} className={inputClass} />
                                            {(q.options?.length ?? 0) > 2 && (
                                                <button onClick={() => update(i, { options: (q.options ?? []).filter((_, m) => m !== k) })} aria-label={`Remove choice ${k + 1}`}
                                                    className="px-2 rounded-[8px] text-[var(--text3)] hover:text-[var(--red)]"><X size={14} /></button>
                                            )}
                                        </div>
                                    ))}
                                    {(q.options?.length ?? 0) < 15 && (
                                        <button onClick={() => update(i, { options: [...(q.options ?? []), ""] })} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--accent)]"><Plus size={13} /> Add choice</button>
                                    )}
                                </div>
                            )}
                            <label className="flex items-center gap-2 pl-8 cursor-pointer">
                                <input id={`q-${q.id}-req`} type="checkbox" checked={q.required} onChange={e => update(i, { required: e.target.checked })} className="accent-[var(--accent)]" />
                                <span className="text-[12.5px] text-[var(--text2)]">Answer required</span>
                            </label>
                        </div>
                    ))}
                    {questions.length < 30 && (
                        <button onClick={() => setQuestions(prev => [...prev, { id: newId(), type: "single", label: "", required: true, options: ["", ""] }])}
                            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[9px] border border-dashed border-[var(--border2)] text-[13px] font-medium text-[var(--accent)] w-full justify-center hover:bg-[var(--surface2)]">
                            <Plus size={14} /> Add question
                        </button>
                    )}
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                    <input id="survey-anon" type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} className="accent-[var(--accent)]" />
                    <span className="text-[13px] text-[var(--text2)]">Anonymous: don&apos;t show who gave which answers</span>
                </label>
                <Field label="Closes on (optional)" hint="Leave empty to keep it open until you close it.">
                    <input id="survey-closes" type="datetime-local" value={closesAt} onChange={e => setClosesAt(e.target.value)} className={inputClass} />
                </Field>
                <AudiencePicker sites={sites} roles={roles} siteIds={targetSiteIds} roleIds={targetRoleIds} setSiteIds={setTargetSiteIds} setRoleIds={setTargetRoleIds} />
            </div>
            {isDraft
                ? <FormFooter saving={saving} onClose={onClose} onSubmit={() => save("ACTIVE")} label="Publish" secondary={{ label: "Save draft", onClick: () => save("DRAFT") }} />
                : <FormFooter saving={saving} onClose={onClose} onSubmit={() => save("ACTIVE")} label="Save changes" />}
        </Drawer>
    )
}

function toLocalInput(iso: string) {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─── Answering ───────────────────────────────────────────────────────────────

function TakeSurvey({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
    const [survey, setSurvey] = useState<SurveyDetail | null>(null)
    const [answers, setAnswers] = useState<Record<string, unknown>>({})
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetch(`/api/surveys/${id}`).then(async r => {
            const d = await r.json().catch(() => null)
            if (!r.ok) setError(d?.error || "Could not open the survey."); else setSurvey(d)
        }).catch(() => setError("Could not open the survey."))
    }, [id])

    const set = (qid: string, v: unknown) => setAnswers(prev => ({ ...prev, [qid]: v }))

    async function submit() {
        if (!survey) return
        const missing = survey.questions.findIndex(q => q.required && (answers[q.id] === undefined || answers[q.id] === "" || (Array.isArray(answers[q.id]) && !(answers[q.id] as unknown[]).length)))
        if (missing >= 0) { toast.error(`Question ${missing + 1} needs an answer`); document.getElementById(`take-${survey.questions[missing].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); return }
        setSaving(true)
        try {
            const res = await fetch(`/api/surveys/${id}/respond`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }) })
            const data = await res.json().catch(() => null)
            if (!res.ok) { toast.error(data?.error || "Could not submit your answers"); return }
            toast.success("Thank you, your answers are in")
            onDone()
        } finally { setSaving(false) }
    }

    return (
        <Drawer title={survey?.title ?? "Survey"} onClose={onClose} wide>
            {error ? <p className="text-[13px] text-[var(--red)]">{error}</p> : !survey ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--text3)]" /></div>
            ) : (
                <>
                    {survey.description && <p className="text-[13.5px] text-[var(--text2)] whitespace-pre-line mb-4">{survey.description}</p>}
                    {survey.anonymous && <p className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text3)] mb-4"><EyeOff size={12} /> Your answers are anonymous.</p>}
                    <div className="space-y-5">
                        {survey.questions.map((q, i) => (
                            <fieldset key={q.id} id={`take-${q.id}`} className="space-y-2">
                                <legend className="text-[14px] font-medium text-[var(--text)] mb-2">
                                    {i + 1}. {q.label}{q.required && <span className="text-[var(--red)]"> *</span>}
                                </legend>
                                <AnswerInput q={q} value={answers[q.id]} onChange={v => set(q.id, v)} />
                            </fieldset>
                        ))}
                    </div>
                    <FormFooter saving={saving} onClose={onClose} onSubmit={submit} label="Submit answers" />
                </>
            )}
        </Drawer>
    )
}

function AnswerInput({ q, value, onChange }: { q: Question; value: unknown; onChange: (v: unknown) => void }) {
    const choice = (label: string, on: boolean, toggle: () => void, multi = false) => (
        <label key={label} className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] border cursor-pointer ${on ? "border-[var(--accent)] bg-[var(--accent-light)]" : "border-[var(--border)] hover:bg-[var(--surface2)]"}`}>
            <input type={multi ? "checkbox" : "radio"} name={`ans-${q.id}`} checked={on} onChange={toggle} className="accent-[var(--accent)]" />
            <span className="text-[13.5px] text-[var(--text)]">{label}</span>
        </label>
    )
    if (q.type === "single") return <div className="space-y-2">{q.options?.map(o => choice(o, value === o, () => onChange(o)))}</div>
    if (q.type === "yesno") return <div className="grid grid-cols-2 gap-2">{["Yes", "No"].map(o => choice(o, value === o, () => onChange(o)))}</div>
    if (q.type === "multi") {
        const arr = Array.isArray(value) ? value as string[] : []
        return <div className="space-y-2">{q.options?.map(o => choice(o, arr.includes(o), () => onChange(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o]), true))}</div>
    }
    if (q.type === "rating") {
        return (
            <div className="flex items-center gap-1" role="radiogroup" aria-label={q.label}>
                {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} out of 5`} onClick={() => onChange(n)}
                        className="p-1 rounded-md hover:bg-[var(--surface2)]">
                        <Star size={26} className={(typeof value === "number" && n <= value) ? "fill-[var(--gold)] text-[var(--gold)]" : "text-[var(--border2)]"} />
                    </button>
                ))}
                {typeof value === "number" && <span className="ml-2 text-[13px] text-[var(--text2)]">{value} / 5</span>}
            </div>
        )
    }
    return <textarea id={`ans-${q.id}`} value={typeof value === "string" ? value : ""} onChange={e => onChange(e.target.value)} rows={3} maxLength={2000} className={`${inputClass} resize-y`} />
}

// ─── Results ─────────────────────────────────────────────────────────────────

function SurveyResults({ id, onClose }: { id: string; onClose: () => void }) {
    const [survey, setSurvey] = useState<SurveyDetail | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [tab, setTab] = useState<"summary" | "responses">("summary")

    useEffect(() => {
        fetch(`/api/surveys/${id}`).then(async r => {
            const d = await r.json().catch(() => null)
            if (!r.ok) setError(d?.error || "Could not load results."); else setSurvey(d)
        }).catch(() => setError("Could not load results."))
    }, [id])

    function downloadCsv() {
        if (!survey?.responses) return
        const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
        const header = ["Respondent", "Submitted", ...survey.questions.map((q, i) => `Q${i + 1}. ${q.label}`)]
        const rows = survey.responses.map(r => [
            r.respondent, new Date(r.submittedAt).toLocaleString("en-IN"),
            ...survey.questions.map(q => { const v = r.answers?.[q.id]; return Array.isArray(v) ? v.join("; ") : v ?? "" }),
        ])
        const csv = "﻿" + [header, ...rows].map(r => r.map(esc).join(",")).join("\r\n")
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
        const a = document.createElement("a")
        a.href = url; a.download = `${survey.title.replace(/[^\w\- ]+/g, "").trim() || "survey"} - responses.csv`
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    return (
        <Drawer title={survey ? `Results: ${survey.title}` : "Results"} onClose={onClose} wide>
            {error ? <p className="text-[13px] text-[var(--red)]">{error}</p> : !survey ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--text3)]" /></div>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[13px] text-[var(--text2)]"><b className="text-[var(--text)]">{survey.responseCount ?? 0}</b> response{survey.responseCount === 1 ? "" : "s"} · <StatusPill status={survey.status} /></p>
                        <button onClick={downloadCsv} disabled={!survey.responses?.length}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] border border-[var(--border)] text-[12.5px] font-medium text-[var(--text)] hover:bg-[var(--surface2)] disabled:opacity-50">
                            <Download size={13} /> Download CSV
                        </button>
                    </div>
                    <div className="z-tabs-wrap"><div className="z-tabs z-tabs--inset" role="tablist">
                        <button role="tab" aria-selected={tab === "summary"} onClick={() => setTab("summary")} className={`z-tab ${tab === "summary" ? "is-active" : ""}`}>Summary</button>
                        <button role="tab" aria-selected={tab === "responses"} onClick={() => setTab("responses")} className={`z-tab ${tab === "responses" ? "is-active" : ""}`}>
                            {survey.anonymous ? "Responses" : "By person"}
                        </button>
                    </div></div>

                    {!survey.responseCount ? (
                        <EmptyState icon={<ClipboardList size={26} />} title="No responses yet" hint={survey.status === "DRAFT" ? "Publish the survey so people can answer." : undefined} />
                    ) : tab === "summary" ? (
                        <div className="space-y-4">
                            {survey.questions.map((q, i) => {
                                const s = survey.summary?.find(x => x.questionId === q.id)
                                return (
                                    <div key={q.id} className="rounded-[12px] border border-[var(--border)] p-4 space-y-2.5">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <p className="text-[13.5px] font-medium text-[var(--text)] min-w-0 break-words">{i + 1}. {q.label}</p>
                                            <span className="shrink-0 text-[11.5px] text-[var(--text3)]">{s?.answered ?? 0} answered</span>
                                        </div>
                                        {q.type === "rating" && s?.average != null && (
                                            <p className="flex items-center gap-1.5 text-[22px] font-bold text-[var(--text)] tabular-nums">
                                                <Star size={20} className="fill-[var(--gold)] text-[var(--gold)]" /> {s.average} <span className="text-[13px] font-normal text-[var(--text3)]">/ 5 average</span>
                                            </p>
                                        )}
                                        {s?.counts && <Bars counts={s.counts} order={q.type === "rating" ? ["5", "4", "3", "2", "1"] : undefined} suffix={q.type === "rating" ? " ★" : ""} />}
                                        {s?.texts && (
                                            s.texts.length ? (
                                                <ul className="max-h-[220px] overflow-y-auto space-y-1.5">
                                                    {s.texts.map((t, k) => <li key={k} className="text-[13px] text-[var(--text2)] bg-[var(--surface2)] rounded-[8px] px-3 py-2 whitespace-pre-line break-words">{t}</li>)}
                                                </ul>
                                            ) : <p className="text-[12.5px] text-[var(--text3)]">No written answers.</p>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {survey.responses?.map((r, k) => (
                                <div key={k} className="rounded-[12px] border border-[var(--border)] p-4">
                                    <div className="flex items-baseline justify-between gap-3 mb-2">
                                        <p className="text-[13.5px] font-semibold text-[var(--text)] min-w-0 truncate">{r.respondent}</p>
                                        <span className="shrink-0 text-[11.5px] text-[var(--text3)]">{new Date(r.submittedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                                    </div>
                                    <dl className="space-y-1.5">
                                        {survey.questions.map((q, i) => {
                                            const v = r.answers?.[q.id]
                                            return (
                                                <div key={q.id} className="text-[12.5px]">
                                                    <dt className="text-[var(--text3)]">{i + 1}. {q.label}</dt>
                                                    <dd className="text-[var(--text)] break-words">{v === undefined || v === "" ? "—" : Array.isArray(v) ? v.join(", ") : q.type === "rating" ? `${v} / 5` : String(v)}</dd>
                                                </div>
                                            )
                                        })}
                                    </dl>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </Drawer>
    )
}

function Bars({ counts, order, suffix = "" }: { counts: Record<string, number>; order?: string[]; suffix?: string }) {
    const keys = order ?? Object.keys(counts)
    const total = keys.reduce((s, k) => s + (counts[k] ?? 0), 0)
    return (
        <div className="space-y-2">
            {keys.map(k => {
                const n = counts[k] ?? 0
                const pct = total ? Math.round(n / total * 100) : 0
                return (
                    <div key={k}>
                        <div className="flex items-baseline justify-between gap-3 text-[12.5px] mb-1">
                            <span className="text-[var(--text2)] min-w-0 break-words">{k}{suffix}</span>
                            <span className="shrink-0 tabular-nums text-[var(--text2)]">{pct}% <span className="text-[var(--text3)]">· {n}</span></span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--surface2)] overflow-hidden">
                            <div className="h-full rounded-full bg-[#93b4f8]" style={{ width: `${pct}%` }} />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
