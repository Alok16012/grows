"use client"

// Training (LMS) → Settings: automatic assignment, defaults, reminders,
// escalation and retraining. Nothing about these rules is fixed in code.
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Play, Save } from "lucide-react"

type S = {
    autoAssign: { nightly: boolean; onChange: boolean }
    defaults: { dueDays: number; passingScore: number; maxAttempts: number }
    reminders: { beforeDays: number; overdueEveryDays: number; escalateAfterDays: number; escalateTo: "hr" | "manager" | "both" }
    retraining: { enabled: boolean; beforeDays: number }
    skills: { courseLevel: number; multiskillMinLevel: number; multiskillMinSkills: number; reviewEveryDays: number }
}

function Card({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
    return (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-5">
            <p className="text-[14px] font-semibold text-[var(--text)]">{title}</p>
            <p className="text-[12px] text-[var(--text3)] mt-0.5 mb-3">{hint}</p>
            <div className="divide-y divide-[var(--border)]">{children}</div>
        </div>
    )
}
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0"><p className="text-[13px] text-[var(--text)]">{label}</p>{hint && <p className="text-[11.5px] text-[var(--text3)]">{hint}</p>}</div>
            <div className="shrink-0">{children}</div>
        </div>
    )
}
const Num = ({ value, onChange, unit }: { value: number; onChange: (n: number) => void; unit: string }) => (
    <span className="inline-flex items-center gap-1.5">
        <input type="number" min={0} value={value} onChange={e => onChange(Number(e.target.value))}
            className="w-[76px] h-9 rounded-[9px] border border-[var(--border)] bg-white px-2.5 text-[13px] text-right outline-none focus:border-[var(--accent)]" />
        <span className="w-[44px] text-[12px] text-[var(--text3)]">{unit}</span>
    </span>
)
const Check = ({ value, onChange }: { value: boolean; onChange: (b: boolean) => void }) =>
    <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />

export default function LmsSettingsTab() {
    const [s, setS] = useState<S | null>(null)
    const [saving, setSaving] = useState(false)
    const [running, setRunning] = useState(false)
    const [result, setResult] = useState<string | null>(null)

    useEffect(() => {
        fetch("/api/lms/settings").then(r => r.json()).then(d => d?.settings ? setS(d.settings) : toast.error(d?.error || "Could not load settings")).catch(() => toast.error("Could not load settings"))
    }, [])
    const set = <K extends keyof S>(k: K, patch: Partial<S[K]>) => setS(p => p ? { ...p, [k]: { ...p[k], ...patch } } : p)

    async function save() {
        if (!s) return
        setSaving(true)
        try {
            const r = await fetch("/api/lms/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Could not save")
            setS(d.settings); toast.success("Settings saved")
        } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
    }
    async function runNow() {
        setRunning(true); setResult(null)
        try {
            const r = await fetch("/api/cron/lms-daily", { method: "POST" })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Could not run")
            setResult(`Enrolled by rules: ${d.assigned} · Refreshers assigned: ${d.renewed} · Due-soon reminders: ${d.dueReminders} · Overdue reminders: ${d.overdueReminders} · Escalated: ${d.escalated}`)
        } catch (e: any) { toast.error(e.message) } finally { setRunning(false) }
    }

    if (!s) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div>
    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-medium disabled:opacity-60">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Automatic assignment" hint="Uses each published course's assignment rules (Courses → Assignment).">
                    <Row label="Enrol matching employees every night" hint="Catches new joiners from any source (imports, onboarding, recruitment)."><Check value={s.autoAssign.nightly} onChange={b => set("autoAssign", { nightly: b })} /></Row>
                    <Row label="Enrol right away on joining or a role / site change" hint="When an employee is added, their designation changes, or they're deployed to a site."><Check value={s.autoAssign.onChange} onChange={b => set("autoAssign", { onChange: b })} /></Row>
                </Card>
                <Card title="Defaults" hint="Used when a rule or a new course doesn't set its own.">
                    <Row label="Days to finish a course"><Num value={s.defaults.dueDays} onChange={n => set("defaults", { dueDays: n })} unit="days" /></Row>
                    <Row label="Pass mark for new courses"><Num value={s.defaults.passingScore} onChange={n => set("defaults", { passingScore: n })} unit="%" /></Row>
                    <Row label="Quiz attempts for new courses" hint="0 = unlimited"><Num value={s.defaults.maxAttempts} onChange={n => set("defaults", { maxAttempts: n })} unit="tries" /></Row>
                </Card>
                <Card title="Reminders and escalation" hint="In-app notifications every morning. WhatsApp / email too once the “Training due / overdue” event is on in the Communication Center. 0 = off.">
                    <Row label="Remind learners before the due date" hint="On that day, and again the day before."><Num value={s.reminders.beforeDays} onChange={n => set("reminders", { beforeDays: n })} unit="days" /></Row>
                    <Row label="While overdue, remind every"><Num value={s.reminders.overdueEveryDays} onChange={n => set("reminders", { overdueEveryDays: n })} unit="days" /></Row>
                    <Row label="Escalate when overdue for"><Num value={s.reminders.escalateAfterDays} onChange={n => set("reminders", { escalateAfterDays: n })} unit="days" /></Row>
                    <Row label="Escalate to" hint="Manager = the manager on the employee's HR record.">
                        <select value={s.reminders.escalateTo} onChange={e => set("reminders", { escalateTo: e.target.value as S["reminders"]["escalateTo"] })}
                            className="h-9 rounded-[9px] border border-[var(--border)] bg-white px-2.5 text-[13px]">
                            <option value="hr">HR (LMS managers)</option><option value="manager">Employee&apos;s manager</option><option value="both">Both</option>
                        </select>
                    </Row>
                </Card>
                <Card title="Skill matrix" hint="How levels are counted for the matrix and the Operation Manager KPIs.">
                    <Row label="Level given when a linked course is passed" hint="1 = theory done. On-the-job sign-off sets 2–4."><Num value={s.skills.courseLevel} onChange={n => set("skills", { courseLevel: n })} unit="level" /></Row>
                    <Row label="Multiskilled = at least" hint="Number of skills…"><Num value={s.skills.multiskillMinSkills} onChange={n => set("skills", { multiskillMinSkills: n })} unit="skills" /></Row>
                    <Row label="…at this level or above"><Num value={s.skills.multiskillMinLevel} onChange={n => set("skills", { multiskillMinLevel: n })} unit="level" /></Row>
                    <Row label="Skill matrix counts as updated if reviewed within"><Num value={s.skills.reviewEveryDays} onChange={n => set("skills", { reviewEveryDays: n })} unit="days" /></Row>
                </Card>
                <Card title="Retraining" hint="For courses with a validity period (e.g. fire safety every 365 days).">
                    <Row label="Re-enrol before the certificate expires"><Check value={s.retraining.enabled} onChange={b => set("retraining", { enabled: b })} /></Row>
                    <Row label="Assign the refresher this early"><Num value={s.retraining.beforeDays} onChange={n => set("retraining", { beforeDays: n })} unit="days" /></Row>
                </Card>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-5">
                <p className="text-[14px] font-semibold text-[var(--text)]">Daily job</p>
                <p className="text-[12px] text-[var(--text3)] mt-0.5 mb-3">Runs every morning at 9:10 IST. Save first, then you can run it now.</p>
                <button onClick={runNow} disabled={running} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[9px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text2)] disabled:opacity-60">
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
                </button>
                {result && <p className="text-[12.5px] text-[var(--text2)] mt-2">{result}</p>}
            </div>
        </div>
    )
}
