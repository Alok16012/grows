"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { BarChart3, Plus, Trash2, Lock, Unlock, Loader2, CheckCircle2, Users, EyeOff, ChevronDown, X } from "lucide-react"
import {
    Drawer, Field, FormFooter, AudiencePicker, inputClass, deadlineLabel, StatusPill, EmptyState,
    type Site, type Role,
} from "./ui"

export type EngagementPerms = { view: boolean; create: boolean; edit: boolean; delete: boolean; export?: boolean }

type PollOption = { id: string; label: string; votes: number | null; voters?: string[] }
type Poll = {
    id: string; question: string; description: string | null
    allowMultiple: boolean; anonymous: boolean; resultsVisibility: string
    status: string; open: boolean; closesAt: string | null; createdAt: string
    targetSiteIds: string[]; targetRoleIds: string[]
    myVote: string[] | null; showResults: boolean; totalVoters: number | null
    options: PollOption[]
}

const VISIBILITY_LABEL: Record<string, string> = {
    AFTER_VOTE: "Voters see results after voting",
    AFTER_CLOSE: "Results shown when the poll closes",
    MANAGERS: "Only HR / managers see results",
}

export default function PollsPanel({ perms, sites, roles, audienceLabel, onPending }: {
    /** From Settings → Roles → Polls. Voting needs none of these. */
    perms: EngagementPerms; sites: Site[]; roles: Role[]
    audienceLabel: (siteIds?: string[], roleIds?: string[]) => string
    /** Number of open polls the viewer hasn't voted on, for the tab badge. */
    onPending?: (n: number) => void
}) {
    const [polls, setPolls] = useState<Poll[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState<"open" | "closed" | "all">("open")
    const [showForm, setShowForm] = useState(false)

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/polls")
            const data = await res.json().catch(() => null)
            if (!res.ok) { setError(data?.error || "Could not load polls."); setPolls([]); return }
            setError(null)
            setPolls(Array.isArray(data) ? data : [])
        } catch {
            setError("Could not load polls. Check your connection and try again.")
        } finally {
            setLoading(false)
        }
    }, [])
    useEffect(() => { load() }, [load])
    useEffect(() => { onPending?.(polls.filter(p => p.open && !p.myVote).length) }, [polls, onPending])

    const shown = polls.filter(p => filter === "all" || (filter === "open" ? p.open : !p.open))
    const counts = { open: polls.filter(p => p.open).length, closed: polls.filter(p => !p.open).length, all: polls.length }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="z-tabs-wrap"><div className="z-tabs" role="tablist" aria-label="Filter polls">
                    {(["open", "closed", "all"] as const).map(f => (
                        <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                            className={`z-tab ${filter === f ? "is-active" : ""}`}>
                            {f === "open" ? "Open" : f === "closed" ? "Closed" : "All"} <span className="opacity-60">{counts[f]}</span>
                        </button>
                    ))}
                </div></div>
                {perms.create && (
                    <button onClick={() => setShowForm(true)}
                        className="inline-flex items-center gap-2 h-[40px] px-4 rounded-[10px] bg-[var(--accent)] text-white text-[13px] font-semibold hover:opacity-90">
                        <Plus size={16} /> New poll
                    </button>
                )}
            </div>

            {loading ? (
                <div className="space-y-3">{[0, 1].map(i => <div key={i} className="h-40 rounded-[12px] bg-muted animate-pulse" />)}</div>
            ) : error ? (
                <EmptyState icon={<BarChart3 size={28} />} title={error} />
            ) : shown.length === 0 ? (
                <EmptyState icon={<BarChart3 size={28} />}
                    title={filter === "open" ? "No open polls right now" : filter === "closed" ? "No closed polls yet" : "No polls yet"}
                    hint={perms.create ? "Create a poll to get a quick answer from your team." : "Polls from HR will appear here."} />
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {shown.map(p => <PollCard key={p.id} poll={p} perms={perms} audience={audienceLabel(p.targetSiteIds, p.targetRoleIds)} onChanged={load} />)}
                </div>
            )}

            {showForm && <PollForm sites={sites} roles={roles} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); setFilter("open"); load() }} />}
        </div>
    )
}

function PollCard({ poll, perms, audience, onChanged }: { poll: Poll; perms: EngagementPerms; audience: string; onChanged: () => void }) {
    const [picked, setPicked] = useState<string[]>(poll.myVote ?? [])
    const [changing, setChanging] = useState(false)
    const [busy, setBusy] = useState(false)
    const [openVoters, setOpenVoters] = useState<string | null>(null)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const voting = poll.open && (!poll.myVote || changing)
    const total = poll.options.reduce((s, o) => s + (o.votes ?? 0), 0)
    const deadline = deadlineLabel(poll.closesAt, poll.open)

    const pick = (id: string) => setPicked(prev => poll.allowMultiple
        ? (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
        : [id])

    async function vote() {
        if (!picked.length) { toast.error("Pick an option first"); return }
        setBusy(true)
        try {
            const res = await fetch(`/api/polls/${poll.id}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optionIds: picked }) })
            const data = await res.json().catch(() => null)
            if (!res.ok) { toast.error(data?.error || "Could not save your vote"); return }
            toast.success(poll.myVote ? "Vote changed" : "Vote recorded")
            setChanging(false)
            onChanged()
        } finally { setBusy(false) }
    }

    async function setStatus(status: "ACTIVE" | "CLOSED") {
        setBusy(true)
        try {
            const res = await fetch(`/api/polls/${poll.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
            const data = await res.json().catch(() => null)
            if (!res.ok) { toast.error(data?.error || "Could not update the poll"); return }
            toast.success(status === "CLOSED" ? "Poll closed" : "Poll reopened")
            onChanged()
        } finally { setBusy(false) }
    }

    async function remove() {
        setBusy(true)
        try {
            const res = await fetch(`/api/polls/${poll.id}`, { method: "DELETE" })
            if (!res.ok) { toast.error("Could not delete the poll"); return }
            toast.success("Poll deleted")
            onChanged()
        } finally { setBusy(false) }
    }

    return (
        <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 flex flex-col gap-3 min-w-0">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <StatusPill status={poll.status} />
                        {deadline && <span className="text-[11.5px] text-[var(--text3)]">{deadline}</span>}
                        {poll.allowMultiple && <span className="text-[11.5px] text-[var(--text3)]">· Pick any</span>}
                        {poll.anonymous && <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text3)]"><EyeOff size={11} /> Anonymous</span>}
                    </div>
                    <h3 className="text-[15px] font-semibold text-[var(--text)] leading-snug break-words">{poll.question}</h3>
                    {poll.description && <p className="text-[13px] text-[var(--text2)] mt-1 whitespace-pre-line break-words">{poll.description}</p>}
                </div>
                {(perms.edit || perms.delete) && (
                    <div className="flex items-center gap-1 shrink-0">
                        {perms.edit && <button onClick={() => setStatus(poll.open ? "CLOSED" : "ACTIVE")} disabled={busy} title={poll.open ? "Close poll" : "Reopen poll"} aria-label={poll.open ? "Close poll" : "Reopen poll"}
                            className="p-1.5 rounded-md text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)]">
                            {poll.open ? <Lock size={15} /> : <Unlock size={15} />}
                        </button>}
                        {perms.delete && <button onClick={() => setConfirmDelete(true)} disabled={busy} title="Delete poll" aria-label="Delete poll"
                            className="p-1.5 rounded-md text-[var(--text3)] hover:text-[var(--red)] hover:bg-[var(--red-light)]">
                            <Trash2 size={15} />
                        </button>}
                    </div>
                )}
            </div>

            {voting ? (
                <div className="flex flex-col gap-2" role={poll.allowMultiple ? "group" : "radiogroup"} aria-label={poll.question}>
                    {poll.options.map(o => {
                        const on = picked.includes(o.id)
                        return (
                            <label key={o.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] border cursor-pointer transition-colors ${on ? "border-[var(--accent)] bg-[var(--accent-light)]" : "border-[var(--border)] hover:bg-[var(--surface2)]"}`}>
                                <input type={poll.allowMultiple ? "checkbox" : "radio"} name={`poll-${poll.id}`} checked={on} onChange={() => pick(o.id)} className="accent-[var(--accent)]" />
                                <span className="text-[13.5px] text-[var(--text)] break-words min-w-0">{o.label}</span>
                            </label>
                        )
                    })}
                    <div className="flex items-center gap-2 mt-1">
                        <button onClick={vote} disabled={busy || !picked.length}
                            className="inline-flex items-center gap-2 h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50">
                            {busy && <Loader2 size={14} className="animate-spin" />} {poll.myVote ? "Save vote" : "Vote"}
                        </button>
                        {changing && <button onClick={() => { setChanging(false); setPicked(poll.myVote ?? []) }} className="h-9 px-3 text-[13px] text-[var(--text2)]">Cancel</button>}
                    </div>
                </div>
            ) : poll.showResults ? (
                <div className="flex flex-col gap-2.5">
                    {poll.options.map(o => {
                        const n = o.votes ?? 0
                        const pct = total ? Math.round(n / total * 100) : 0
                        const mine = poll.myVote?.includes(o.id)
                        return (
                            <div key={o.id} className="min-w-0">
                                <div className="flex items-baseline justify-between gap-3 text-[13px] mb-1">
                                    <span className={`min-w-0 break-words ${mine ? "font-semibold text-[var(--text)]" : "text-[var(--text2)]"}`}>
                                        {mine && <CheckCircle2 size={13} className="inline mr-1 -mt-0.5 text-[var(--accent)]" />}{o.label}
                                    </span>
                                    <span className="shrink-0 tabular-nums text-[var(--text2)]">{pct}% <span className="text-[var(--text3)]">· {n}</span></span>
                                </div>
                                <div className="h-2 rounded-full bg-[var(--surface2)] overflow-hidden">
                                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: mine ? "var(--accent)" : "#93b4f8" }} />
                                </div>
                                {o.voters && o.voters.length > 0 && (
                                    <div className="mt-1">
                                        <button onClick={() => setOpenVoters(openVoters === o.id ? null : o.id)} className="inline-flex items-center gap-1 text-[11.5px] text-[var(--accent)]">
                                            <Users size={11} /> {o.voters.length} voter{o.voters.length === 1 ? "" : "s"} <ChevronDown size={11} className={openVoters === o.id ? "rotate-180" : ""} />
                                        </button>
                                        {openVoters === o.id && <p className="text-[12px] text-[var(--text2)] mt-1 leading-relaxed">{o.voters.join(", ")}</p>}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="rounded-[10px] bg-[var(--surface2)] px-3 py-3 text-[13px] text-[var(--text2)] flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-[var(--success)] shrink-0" />
                    {poll.myVote ? "Thanks, your vote is in. " : ""}{VISIBILITY_LABEL[poll.resultsVisibility]}.
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border)] text-[12px] text-[var(--text3)]">
                <span>
                    {poll.totalVoters != null ? `${poll.totalVoters} ${poll.totalVoters === 1 ? "person" : "people"} voted` : "Results hidden"}
                    {perms.view && <> · {audience}</>}
                </span>
                {poll.open && poll.myVote && !changing && (
                    <button onClick={() => setChanging(true)} className="text-[var(--accent)] font-medium">Change vote</button>
                )}
            </div>

            {confirmDelete && (
                <div className="rounded-[10px] border border-[#fecaca] bg-[var(--red-light)] px-3 py-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--red)]">
                    <span className="flex-1 min-w-0">Delete this poll and all its votes? This can&apos;t be undone.</span>
                    <button onClick={() => setConfirmDelete(false)} className="h-8 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]">Keep</button>
                    <button onClick={remove} disabled={busy} className="h-8 px-3 rounded-[8px] bg-[var(--red)] text-white font-semibold">Delete</button>
                </div>
            )}
        </div>
    )
}

function PollForm({ sites, roles, onClose, onSaved }: { sites: Site[]; roles: Role[]; onClose: () => void; onSaved: () => void }) {
    const [question, setQuestion] = useState("")
    const [description, setDescription] = useState("")
    const [options, setOptions] = useState<string[]>(["", ""])
    const [allowMultiple, setAllowMultiple] = useState(false)
    const [anonymous, setAnonymous] = useState(false)
    const [resultsVisibility, setResultsVisibility] = useState("AFTER_VOTE")
    const [closesAt, setClosesAt] = useState("")
    const [targetSiteIds, setTargetSiteIds] = useState<string[]>([])
    const [targetRoleIds, setTargetRoleIds] = useState<string[]>([])
    const [saving, setSaving] = useState(false)

    async function submit() {
        const opts = options.map(o => o.trim()).filter(Boolean)
        if (!question.trim()) { toast.error("Write the question"); return }
        if (opts.length < 2) { toast.error("Add at least two options"); return }
        setSaving(true)
        try {
            const res = await fetch("/api/polls", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question, description, options: opts, allowMultiple, anonymous, resultsVisibility,
                    closesAt: closesAt ? new Date(closesAt).toISOString() : null, targetSiteIds, targetRoleIds,
                }),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) { toast.error(data?.error || "Could not create the poll"); return }
            toast.success("Poll published")
            onSaved()
        } finally { setSaving(false) }
    }

    return (
        <Drawer title="New poll" onClose={onClose}>
            <div className="space-y-4">
                <Field label="Question *">
                    <input id="poll-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={300}
                        placeholder="e.g. Which day suits the safety training?" className={inputClass} />
                </Field>
                <Field label="Details (optional)">
                    <textarea id="poll-description" value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={1000}
                        className={`${inputClass} resize-none`} />
                </Field>
                <Field label="Options *" hint="2 to 10 options.">
                    <div className="space-y-2">
                        {options.map((o, i) => (
                            <div key={i} className="flex gap-2">
                                <input id={`poll-option-${i}`} value={o} maxLength={120} placeholder={`Option ${i + 1}`}
                                    onChange={e => setOptions(prev => prev.map((x, j) => j === i ? e.target.value : x))} className={inputClass} />
                                {options.length > 2 && (
                                    <button onClick={() => setOptions(prev => prev.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`}
                                        className="px-2 rounded-[8px] text-[var(--text3)] hover:text-[var(--red)] hover:bg-[var(--red-light)]"><X size={15} /></button>
                                )}
                            </div>
                        ))}
                        {options.length < 10 && (
                            <button onClick={() => setOptions(prev => [...prev, ""])} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent)]">
                                <Plus size={14} /> Add option
                            </button>
                        )}
                    </div>
                </Field>
                <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input id="poll-multi" type="checkbox" checked={allowMultiple} onChange={e => setAllowMultiple(e.target.checked)} className="accent-[var(--accent)]" />
                        <span className="text-[13px] text-[var(--text2)]">Let people pick more than one option</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input id="poll-anon" type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} className="accent-[var(--accent)]" />
                        <span className="text-[13px] text-[var(--text2)]">Anonymous: hide who voted for what</span>
                    </label>
                </div>
                <Field label="Who sees results">
                    <select id="poll-visibility" value={resultsVisibility} onChange={e => setResultsVisibility(e.target.value)} className={inputClass}>
                        {Object.entries(VISIBILITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </Field>
                <Field label="Closes on (optional)" hint="Leave empty to keep it open until you close it.">
                    <input id="poll-closes" type="datetime-local" value={closesAt} onChange={e => setClosesAt(e.target.value)} className={inputClass} />
                </Field>
                <AudiencePicker sites={sites} roles={roles} siteIds={targetSiteIds} roleIds={targetRoleIds} setSiteIds={setTargetSiteIds} setRoleIds={setTargetRoleIds} />
            </div>
            <FormFooter saving={saving} onClose={onClose} onSubmit={submit} label="Publish poll" />
        </Drawer>
    )
}
