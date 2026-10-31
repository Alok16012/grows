"use client"
// Optional "Also assign work" on the project team screens (Create Project and
// Edit Project → Assign Team). Off by default. The team on its own only says who
// MAY be given work; saving it never issues or withdraws a job (that used to
// happen silently and was removed). Ticking this creates assignments, after the
// project is saved, for the inspectors picked — through the same
// POST /api/assignments the Assignments wizard uses (same ASG codes, the same
// "already assigned" and resigned-employee checks). Unticking someone from the
// team still never cancels their work.

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Check, User } from "lucide-react"

export type AssignWork = {
    on: boolean
    ids: string[]
    start: string
    recur: string
    multiPart: boolean
    notes: string
}

const todayLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)

/**
 * Form state for the section. Inspectors ticked onto the team are pre-picked for
 * work, except `existing` (already on the team when the page opened); anyone
 * unticked from the team drops out.
 */
export function useAssignWork(teamIds: string[], existing: string[] = []) {
    const [value, setValue] = useState<AssignWork>(() => ({ on: false, ids: [], start: todayLocal(), recur: "none", multiPart: false, notes: "" }))
    const prevTeam = useRef<string[]>([])
    const existingKey = existing.join(",")
    useEffect(() => {
        const added = teamIds.filter(id => !prevTeam.current.includes(id) && !existing.includes(id))
        prevTeam.current = teamIds
        setValue(v => ({ ...v, ids: Array.from(new Set([...v.ids.filter(id => teamIds.includes(id)), ...added])) }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamIds, existingKey])
    return [value, setValue] as const
}

/** Why the save can't go ahead, or null. Only when the section is on. */
export function assignWorkProblem(v: AssignWork): string | null {
    if (!v.on) return null
    if (v.ids.length === 0) return "Pick at least one inspector to assign work to, or untick “Also assign work”"
    if (!v.start) return "Pick a start date for the assignments"
    return null
}

/** Creates the assignments for a saved project and reports the outcome. Never throws. */
export async function createAssignments(projectId: string, v: AssignWork): Promise<void> {
    try {
        const res = await fetch("/api/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectId,
                inspectorIds: v.ids,
                recurrenceType: v.recur,
                isMultiPart: v.multiPart,
                startDate: v.start,
                notes: v.notes || undefined,
            }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || "Couldn't create the assignments")
        const made = Array.isArray(d.created) ? d.created.length : 0
        const failed: { error?: string }[] = Array.isArray(d.failed) ? d.failed : []
        const already = failed.filter(f => f.error === "Already assigned").length
        const other = failed.length - already
        const parts = [
            made && `${made} assignment${made === 1 ? "" : "s"} created`,
            already && `${already} already assigned (skipped)`,
            other && `${other} failed`,
        ].filter(Boolean).join(" · ")
        if (other) toast.warning(parts, { duration: 8000 })
        else if (made) toast.success(parts)
        else toast.info(parts || "No new assignments")
    } catch (e) {
        toast.error(`Project saved, but no assignments were created: ${(e as Error).message}`, { duration: 8000 })
    }
}

const inputCls = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text3)]"

export function AssignWorkSection({ value, onChange, teamIds, nameOf, whenText, className }: {
    value: AssignWork
    onChange: (next: AssignWork) => void
    /** The inspectors currently ticked on the team, in display order. */
    teamIds: string[]
    nameOf: (id: string) => string
    /** "save" / "create the project" — finishes "…when you ___". */
    whenText: string
    className?: string
}) {
    const set = (patch: Partial<AssignWork>) => onChange({ ...value, ...patch })
    const togglePick = (id: string) => set({ ids: value.ids.includes(id) ? value.ids.filter(x => x !== id) : [...value.ids, id] })
    return (
        <div className={className}>
            <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={value.on} onChange={e => set({ on: e.target.checked })}
                    className="mt-[3px] h-4 w-4 accent-[var(--accent)]" />
                <span>
                    <span className="block text-[14px] font-semibold text-[var(--text)]">Also assign work</span>
                    <span className="block text-[12px] text-[var(--text3)] mt-0.5">
                        Create assignments for the inspectors you pick below when you {whenText} — the same as the Assignments screen.
                        Leaving this off only saves the team. Unticking someone from the team never cancels their work.
                    </span>
                </span>
            </label>

            {value.on && (
                <div className="mt-4 space-y-4">
                    <div>
                        <p className="text-[12px] font-medium text-[var(--text2)] mb-1.5">Assign to <span className="text-[var(--text3)] font-normal">(team inspectors · new ones are pre-ticked · anyone with an active assignment here is skipped)</span></p>
                        {teamIds.length === 0 ? (
                            <p className="text-[12px] text-[var(--text3)]">Tick inspectors in the team above first.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {teamIds.map(id => {
                                    const on = value.ids.includes(id)
                                    return (
                                        <button key={id} type="button" onClick={() => togglePick(id)} aria-pressed={on}
                                            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[12.5px] transition-colors ${on ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-text,var(--accent))]" : "border-[var(--border)] bg-white text-[var(--text2)] hover:bg-[var(--surface2)]"}`}>
                                            {on ? <Check size={13} /> : <User size={13} />} {nameOf(id)}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="assign-work-start" className="block text-[12px] font-medium text-[var(--text2)] mb-1">Start date <span className="text-[#dc2626]">*</span></label>
                            <input id="assign-work-start" type="date" value={value.start} onChange={e => set({ start: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                            <label htmlFor="assign-work-recur" className="block text-[12px] font-medium text-[var(--text2)] mb-1">Recurrence</label>
                            <select id="assign-work-recur" value={value.recur} onChange={e => set({ recur: e.target.value })} className={inputCls}>
                                <option value="none">One-time</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                            </select>
                        </div>
                    </div>
                    <label className="flex items-start gap-2.5 cursor-pointer rounded-[10px] bg-[var(--surface2)] px-3 py-2.5">
                        <input type="checkbox" checked={value.multiPart} onChange={e => set({ multiPart: e.target.checked })}
                            className="mt-[3px] h-4 w-4 accent-[var(--accent)]" />
                        <span>
                            <span className="block text-[13px] font-medium text-[var(--text)]">Multi-part inspection</span>
                            <span className="block text-[11.5px] text-[var(--text3)]">For work covered over several visits. The assignment stays on the inspector&apos;s list until you close it.</span>
                        </span>
                    </label>
                    <div>
                        <label htmlFor="assign-work-notes" className="block text-[12px] font-medium text-[var(--text2)] mb-1">Notes / Summary <span className="text-[var(--text3)] font-normal">(optional)</span></label>
                        <textarea id="assign-work-notes" value={value.notes} onChange={e => set({ notes: e.target.value.slice(0, 250) })} rows={2}
                            placeholder="e.g. Routine inspection for mechanical & safety compliance."
                            className="w-full rounded-[8px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text3)]" />
                        <p className="text-[11px] text-[var(--text3)] text-right">{value.notes.length}/250</p>
                    </div>
                </div>
            )}
        </div>
    )
}
