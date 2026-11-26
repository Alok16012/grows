"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Play, Save } from "lucide-react"
import { toast } from "sonner"

// Approvals → Settings. Every limit for approval timing, customer alerts,
// customer summaries and draft clean-up — editable by the approvals team.

type S = {
    approval: { targetHours: number; escalateAfterHours: number; remindApprovers: boolean; autoSignature: boolean }
    alerts: { enabled: boolean; rejectedPct: number; rejectedQty: number; reworkPct: number }
    summary: { frequency: "off" | "daily" | "weekly"; weekday: number }
    ncr: { autoOpen: boolean; rejectedPct: number; rejectedQty: number; onCritical: boolean; dueDays: number }
    drafts: { remindAfterDays: number; deleteEmptyAfterDays: number }
    form: { defectMatch: "exact" | "atLeast" }
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function Card({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
    return (
        <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
            <p className="text-[14px] font-semibold text-[var(--text)]">{title}</p>
            <p className="text-[12px] text-[var(--text3)] mt-0.5 mb-4">{hint}</p>
            <div className="space-y-3.5">{children}</div>
        </div>
    )
}

function NumRow({ label, hint, value, unit, onChange, step = 1 }: { label: string; hint?: string; value: number; unit: string; onChange: (n: number) => void; step?: number }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
                <p className="text-[13px] text-[var(--text)]">{label}</p>
                {hint && <p className="text-[11.5px] text-[var(--text3)]">{hint}</p>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
                <input type="number" min={0} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
                    className="w-[90px] h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] text-right outline-none focus:border-[var(--accent)]" />
                <span className="w-[42px] text-[12px] text-[var(--text3)]">{unit}</span>
            </div>
        </div>
    )
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (b: boolean) => void }) {
    return (
        <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div className="min-w-0">
                <p className="text-[13px] text-[var(--text)]">{label}</p>
                {hint && <p className="text-[11.5px] text-[var(--text3)]">{hint}</p>}
            </div>
            <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--accent)] shrink-0" />
        </label>
    )
}

export default function InspectionSettingsPage() {
    const [s, setS] = useState<S | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [running, setRunning] = useState(false)
    const [result, setResult] = useState<string | null>(null)

    useEffect(() => {
        fetch("/api/inspections/settings").then(async r => {
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Could not load settings")
            setS(d.settings)
        }).catch(e => setError(e.message))
    }, [])

    const set = <K extends keyof S>(k: K, patch: Partial<S[K]>) => setS(p => p ? { ...p, [k]: { ...p[k], ...patch } } : p)

    const save = async () => {
        if (!s) return
        setSaving(true)
        try {
            const r = await fetch("/api/inspections/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Could not save")
            setS(d.settings ?? s)
            toast.success("Settings saved")
        } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
    }

    const runNow = async () => {
        setRunning(true); setResult(null)
        try {
            const r = await fetch("/api/cron/inspection-daily", { method: "POST" })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Could not run")
            setResult(`Overdue reminders: ${d.overdue ?? 0} · Escalated: ${d.escalated ?? 0} · Draft reminders: ${d.draftReminders ?? 0} · Empty drafts deleted: ${d.draftsDeleted ?? 0} · Customer summaries: ${d.summaries ?? 0} (${d.summaryMessages ?? 0} messages) · Overdue NCRs: ${d.ncrOverdue ?? 0}`)
        } catch (e: any) { toast.error(e.message) } finally { setRunning(false) }
    }

    if (error) return <div className="p-6 text-[13px] text-[#dc2626]">{error}</div>
    if (!s) return <div className="p-6 flex items-center gap-2 text-[13px] text-[var(--text3)]"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>

    return (
        <div className="max-w-[820px] mx-auto space-y-4 pb-10">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link href="/approvals" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Approvals</Link>
                    <h1 className="text-[24px] font-bold tracking-[-0.5px] text-[var(--text)] mt-1">Inspection settings</h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">Approval timing, customer alerts and summaries, and draft clean-up.</p>
                </div>
                <button onClick={save} disabled={saving}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-medium disabled:opacity-60">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                </button>
            </div>

            <Card title="Approval timing" hint="When a submitted report counts as overdue, and who is told.">
                <NumRow label="Approve within" hint="Older pending reports show as overdue in the inbox." value={s.approval.targetHours} unit="hours" onChange={n => set("approval", { targetHours: n })} />
                <NumRow label="Escalate to admins after" hint="0 = never escalate." value={s.approval.escalateAfterHours} unit="hours" onChange={n => set("approval", { escalateAfterHours: n })} />
                <Toggle label="Remind approvers daily about overdue reports" value={s.approval.remindApprovers} onChange={b => set("approval", { remindApprovers: b })} />
                <Toggle label="Stamp the approver's signature on approval" hint="Uses the signature saved on the approver's profile." value={s.approval.autoSignature} onChange={b => set("approval", { autoSignature: b })} />
            </Card>

            <Card title="Customer rework / rejection alert" hint="Sent to the site's customer contacts when an approved report crosses any limit below. 0 = that limit is not used. The 'Rework alert' event must also be on in the Communication Center.">
                <Toggle label="Send the alert" value={s.alerts.enabled} onChange={b => set("alerts", { enabled: b })} />
                <NumRow label="Rejected at or above" value={s.alerts.rejectedPct} unit="%" step={0.1} onChange={n => set("alerts", { rejectedPct: n })} />
                <NumRow label="Rejected pieces at or above" value={s.alerts.rejectedQty} unit="pcs" onChange={n => set("alerts", { rejectedQty: n })} />
                <NumRow label="Rework at or above" value={s.alerts.reworkPct} unit="%" step={0.1} onChange={n => set("alerts", { reworkPct: n })} />
            </Card>

            <Card title="Customer summary" hint="A summary of approved reports (inspected, rework, rejected, PPM, top defects) to each site's customer contacts. The 'Customer summary' event must also be on in the Communication Center.">
                <div className="flex items-center justify-between gap-4">
                    <p className="text-[13px] text-[var(--text)]">Send</p>
                    <select value={s.summary.frequency} onChange={e => set("summary", { frequency: e.target.value as S["summary"]["frequency"] })}
                        className="h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white">
                        <option value="off">Off</option>
                        <option value="daily">Daily (yesterday's reports)</option>
                        <option value="weekly">Weekly (last 7 days)</option>
                    </select>
                </div>
                {s.summary.frequency === "weekly" && (
                    <div className="flex items-center justify-between gap-4">
                        <p className="text-[13px] text-[var(--text)]">On</p>
                        <select value={s.summary.weekday} onChange={e => set("summary", { weekday: Number(e.target.value) })}
                            className="h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white">
                            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                        </select>
                    </div>
                )}
            </Card>

            <Card title="Inspection form" hint="Rules inspectors must meet before they can move on.">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[13px] text-[var(--text)]">Defect Distribution total</p>
                        <p className="text-[11.5px] text-[var(--text3)]">Compared with Rework Qty + Rejected Qty. Next stays blocked until it meets this.</p>
                    </div>
                    <select value={s.form?.defectMatch ?? "exact"} onChange={e => set("form", { defectMatch: e.target.value as S["form"]["defectMatch"] })}
                        className="h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white">
                        <option value="exact">Must equal Rework + Rejected</option>
                        <option value="atLeast">Must be at least Rework + Rejected</option>
                    </select>
                </div>
            </Card>

            <Card title="Non-conformance (NCR / 8D)" hint="Open an NCR automatically when an approved report crosses any limit below. It's owned by the approver, who fills the 8D steps in Quality → NCR / 8D. 0 = that limit is not used.">
                <Toggle label="Open NCRs automatically" value={s.ncr.autoOpen} onChange={b => set("ncr", { autoOpen: b })} />
                <NumRow label="Rejected at or above" value={s.ncr.rejectedPct} unit="%" step={0.1} onChange={n => set("ncr", { rejectedPct: n })} />
                <NumRow label="Rejected pieces at or above" value={s.ncr.rejectedQty} unit="pcs" onChange={n => set("ncr", { rejectedQty: n })} />
                <Toggle label="Any critical defect opens an NCR" hint="Defects marked Critical in Quality → Defect library." value={s.ncr.onCritical} onChange={b => set("ncr", { onCritical: b })} />
                <NumRow label="Days to close" hint="Owners are reminded every morning once it's overdue." value={s.ncr.dueDays} unit="days" onChange={n => set("ncr", { dueDays: n })} />
            </Card>

            <Card title="Drafts" hint="Reports started but not submitted.">
                <NumRow label="Remind the inspector after" hint="0 = no reminders." value={s.drafts.remindAfterDays} unit="days" onChange={n => set("drafts", { remindAfterDays: n })} />
                <NumRow label="Delete empty drafts after" hint="Only drafts with nothing filled in and no photo. 0 = never delete." value={s.drafts.deleteEmptyAfterDays} unit="days" onChange={n => set("drafts", { deleteEmptyAfterDays: n })} />
            </Card>

            <Card title="Daily job" hint="Runs every morning at 9:00 IST. You can also run it now (save first).">
                <button onClick={runNow} disabled={running}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[9px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text2)] disabled:opacity-60">
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
                </button>
                {result && <p className="text-[12.5px] text-[var(--text2)]">{result}</p>}
            </Card>
        </div>
    )
}
