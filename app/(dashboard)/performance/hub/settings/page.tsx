"use client"
// DWM Settings — deadlines, lock, reminders, review timing, default reviewer and
// role groups for daily / weekly / monthly KPI reports. Nothing is fixed in code.
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, Play, Plus, Save, Settings2, Trash2, X } from "lucide-react"
import { HubShell, useHubPerms } from "../_components/HubNav"
import { api, useHub, Card, CardHead, Loading, Empty, inputCls, btnPrimary, btnGhost, btnSmall, type TemplateSummary } from "../_components/shared"

type RoleGroup = { name: string; designations: string[]; templateFamilyId: string | null }
type Settings = {
    reviewer: { defaultFromManager: boolean }
    deadlines: { dailyGraceDays: number; weeklyGraceDays: number; monthlyGraceDays: number; lockAfterDue: boolean }
    reminders: { employee: boolean; reviewerMissedList: boolean }
    review: { targetDays: number; escalateAfterDays: number; autoApproveAfterDays: number }
    roleGroups: RoleGroup[]
}
type Desig = { designation: string; count: number }

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
                <p className="text-[13px] text-[var(--text)]">{label}</p>
                {hint && <p className="text-[11.5px] text-[var(--text3)]">{hint}</p>}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    )
}
function Days({ value, onChange, unit = "days" }: { value: number; onChange: (n: number) => void; unit?: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <input type="number" min={0} value={value} onChange={e => onChange(Number(e.target.value))}
                className="w-[76px] h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] text-right outline-none focus:border-[var(--accent)]" />
            <span className="w-[34px] text-[12px] text-[var(--text3)]">{unit}</span>
        </span>
    )
}
const Check = ({ value, onChange }: { value: boolean; onChange: (b: boolean) => void }) =>
    <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />

export default function DwmSettingsPage() {
    const { status, canManage } = useHubPerms()
    const { missing, fail } = useHub()
    const [s, setS] = useState<Settings | null>(null)
    const [desigs, setDesigs] = useState<Desig[]>([])
    const [families, setFamilies] = useState<TemplateSummary[]>([])
    const [saving, setSaving] = useState(false)
    const [running, setRunning] = useState(false)
    const [result, setResult] = useState<string | null>(null)

    useEffect(() => {
        if (status !== "authenticated" || !canManage) return
        api<{ settings: Settings; designations: Desig[] }>("/settings").then(d => { setS(d.settings); setDesigs(d.designations ?? []) }).catch(e => fail(e, "Could not load settings"))
        api<{ templates: TemplateSummary[] }>("/templates").then(d => {
            const best = new Map<string, TemplateSummary>()
            for (const t of d.templates ?? []) {
                if (t.status === "ARCHIVED") continue
                const cur = best.get(t.familyId)
                // Prefer the published version; otherwise the newest draft.
                if (!cur || (t.status === "PUBLISHED" && cur.status !== "PUBLISHED") || (t.status === cur.status && t.version > cur.version)) best.set(t.familyId, t)
            }
            setFamilies(Array.from(best.values()).sort((a, b) => a.name.localeCompare(b.name)))
        }).catch(e => fail(e))
    }, [status, canManage, fail])

    const set = <K extends keyof Settings>(k: K, patch: Partial<Settings[K]>) => setS(p => p ? { ...p, [k]: { ...(p[k] as object), ...patch } } : p)
    const setGroup = (i: number, patch: Partial<RoleGroup>) => setS(p => p ? { ...p, roleGroups: p.roleGroups.map((g, j) => j === i ? { ...g, ...patch } : g) } : p)

    // Designations not in any group yet.
    const grouped = useMemo(() => new Set((s?.roleGroups ?? []).flatMap(g => g.designations.map(d => d.toLowerCase()))), [s])
    const free = desigs.filter(d => !grouped.has(d.designation.toLowerCase()))
    const countOf = (d: string) => desigs.filter(x => x.designation.toLowerCase() === d.toLowerCase()).reduce((n, x) => n + x.count, 0)

    async function save() {
        if (!s) return
        if (s.roleGroups.some(g => !g.name.trim())) { toast.error("Give every role group a name"); return }
        setSaving(true)
        try { const d = await api<{ settings: Settings }>("/settings", { method: "PUT", body: s }); setS(d.settings); toast.success("Settings saved") }
        catch (e) { fail(e) } finally { setSaving(false) }
    }
    async function runNow() {
        setRunning(true); setResult(null)
        try {
            const d = await api<any>("/api/cron/dwm-daily", { method: "POST", body: {} })
            setResult(`Employee reminders: ${d.employeeReminders} · Missed deadlines: ${d.missed} (${d.missedLists} lists) · Review reminders: ${d.reviewReminders} · Escalated: ${d.escalated} · Auto-approved: ${d.autoApproved}`)
        } catch (e) { fail(e) } finally { setRunning(false) }
    }

    if (status === "authenticated" && !canManage) {
        return <HubShell title="DWM Settings" missing={missing}><Card><Empty icon={<Settings2 size={40} />} title="You don't have access to DWM Settings" /></Card></HubShell>
    }

    return (
        <HubShell title="DWM Settings" subtitle="Deadlines, reminders, review timing and role groups for daily, weekly and monthly KPI reports." missing={missing}
            actions={<button className={btnPrimary} onClick={save} disabled={saving || !s}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save</button>}>
            {!s ? <Card><Loading /></Card> : (
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHead title="Deadlines" sub="How long after the period ends a report still counts as on time." />
                        <div className="px-4 pb-3 divide-y divide-[var(--border)]">
                            <Row label="Daily report" hint="1 = yesterday's report is due today."><Days value={s.deadlines.dailyGraceDays} onChange={n => set("deadlines", { dailyGraceDays: n })} /></Row>
                            <Row label="Weekly report" hint="Days after Sunday."><Days value={s.deadlines.weeklyGraceDays} onChange={n => set("deadlines", { weeklyGraceDays: n })} /></Row>
                            <Row label="Monthly report" hint="Days after the month ends."><Days value={s.deadlines.monthlyGraceDays} onChange={n => set("deadlines", { monthlyGraceDays: n })} /></Row>
                            <Row label="Lock reports after the deadline" hint="The employee can't fill a draft past its deadline. HR still can. Returned reports stay open."><Check value={s.deadlines.lockAfterDue} onChange={b => set("deadlines", { lockAfterDue: b })} /></Row>
                        </div>
                    </Card>

                    <Card>
                        <CardHead title="Reminders" sub="Sent every morning by the daily job, as in-app notifications." />
                        <div className="px-4 pb-3 divide-y divide-[var(--border)]">
                            <Row label="Remind employees about due reports" hint="On each grace day until the report is submitted. Needs at least 1 grace day."><Check value={s.reminders.employee} onChange={b => set("reminders", { employee: b })} /></Row>
                            <Row label="Tell reviewers who missed a deadline" hint="One list per reviewer the morning after a deadline. HR gets it for people with no reviewer."><Check value={s.reminders.reviewerMissedList} onChange={b => set("reminders", { reviewerMissedList: b })} /></Row>
                        </div>
                    </Card>

                    <Card>
                        <CardHead title="Review timing" sub="What happens to submitted reports nobody reviews. 0 = off." />
                        <div className="px-4 pb-3 divide-y divide-[var(--border)]">
                            <Row label="Remind the reviewer after"><Days value={s.review.targetDays} onChange={n => set("review", { targetDays: n })} /></Row>
                            <Row label="Escalate to HR after"><Days value={s.review.escalateAfterDays} onChange={n => set("review", { escalateAfterDays: n })} /></Row>
                            <Row label="Approve automatically after" hint="Only reports with no RED KPI. Leave 0 to always need a person."><Days value={s.review.autoApproveAfterDays} onChange={n => set("review", { autoApproveAfterDays: n })} /></Row>
                        </div>
                    </Card>

                    <Card>
                        <CardHead title="Reviewer" sub="Who approves an employee's reports when nobody is picked." />
                        <div className="px-4 pb-3 divide-y divide-[var(--border)]">
                            <Row label="New assignments use the employee's manager" hint="The manager on their HR record, if that login is active. Otherwise HR reviews."><Check value={s.reviewer.defaultFromManager} onChange={b => set("reviewer", { defaultFromManager: b })} /></Row>
                        </div>
                        <div className="px-4 pb-4 pt-1 border-t border-[var(--border)]">
                            <p className="text-[12.5px] font-medium text-[var(--text)] mt-3 mb-1">Daily job</p>
                            <p className="text-[11.5px] text-[var(--text3)] mb-2">Runs every morning at 9:05 IST. Save first, then you can run it now.</p>
                            <button className={btnGhost} onClick={runNow} disabled={running}>{running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run now</button>
                            {result && <p className="text-[12px] text-[var(--text2)] mt-2">{result}</p>}
                        </div>
                    </Card>

                    <Card className="lg:col-span-2">
                        <CardHead title="Role groups" sub="Group the different spellings of a role (e.g. Quality Inspector, Inspector, QA) and give the group a template. Then use “Assign by role” in People & Roles."
                            right={<button className={btnSmall} onClick={() => setS(p => p ? { ...p, roleGroups: [...p.roleGroups, { name: "", designations: [], templateFamilyId: null }] } : p)}><Plus size={12} /> Add group</button>} />
                        <div className="px-4 pb-4 space-y-3">
                            {s.roleGroups.length === 0 && <p className="text-[12.5px] text-[var(--text3)]">No role groups yet.</p>}
                            {s.roleGroups.map((g, i) => {
                                const people = g.designations.reduce((n, d) => n + countOf(d), 0)
                                return (
                                    <div key={i} className="rounded-xl border border-[var(--border)] p-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <input className={inputCls("!w-[240px]")} value={g.name} placeholder="Group name, e.g. Quality Inspector" onChange={e => setGroup(i, { name: e.target.value })} />
                                            <select className={inputCls("!w-[300px]")} value={g.templateFamilyId ?? ""} onChange={e => setGroup(i, { templateFamilyId: e.target.value || null })}>
                                                <option value="">— Template —</option>
                                                {families.map(t => <option key={t.familyId} value={t.familyId}>{t.name}{t.status !== "PUBLISHED" ? " (draft — publish before assigning)" : ` (v${t.version})`}</option>)}
                                            </select>
                                            <span className="text-[12px] text-[var(--text2)]"><b className="font-mono">{people}</b> people</span>
                                            <div className="flex-1" />
                                            <button className={btnSmall} onClick={() => setS(p => p ? { ...p, roleGroups: p.roleGroups.filter((_, j) => j !== i) } : p)}><Trash2 size={12} /> Remove</button>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {g.designations.map(d => (
                                                <span key={d} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-[var(--accent-light)] text-[var(--accent)] text-[12px]">
                                                    {d} <span className="font-mono text-[11px] opacity-70">{countOf(d)}</span>
                                                    <button onClick={() => setGroup(i, { designations: g.designations.filter(x => x !== d) })} className="w-5 h-5 inline-flex items-center justify-center rounded-full hover:bg-white/60" aria-label={`Remove ${d}`}><X size={11} /></button>
                                                </span>
                                            ))}
                                            <select className="h-7 rounded-full border border-dashed border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text2)]" value=""
                                                onChange={e => e.target.value && setGroup(i, { designations: [...g.designations, e.target.value] })}>
                                                <option value="">+ Add designation</option>
                                                {free.map(d => <option key={d.designation} value={d.designation}>{d.designation} ({d.count})</option>)}
                                            </select>
                                        </div>
                                    </div>
                                )
                            })}
                            {free.length > 0 && s.roleGroups.length > 0 && (
                                <p className="text-[11.5px] text-[var(--text3)]">{free.length} designations ({free.reduce((n, d) => n + d.count, 0)} people) aren&apos;t in any group yet.</p>
                            )}
                        </div>
                    </Card>
                </div>
            )}
        </HubShell>
    )
}
