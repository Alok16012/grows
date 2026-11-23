"use client"

// Onboarding → HR letters. Which letter goes to whom and when (rules, e.g. the
// Appointment Letter on joining, the Confirmation Letter 6 months after joining,
// the Increment Letter on each salary revision, the Transfer Letter on each site
// change, exit letters once the person has left), and for each employee whether
// it was sent, is waiting for approval, overdue or acknowledged.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, CheckCircle2, Download, FilePlus2, Loader2, Play, Plus, Send, Sparkles, Trash2 } from "lucide-react"
import { LETTER_STATUS, LETTER_TRIGGERS, STANDARD_LETTERS, TRIGGER_VARIABLES, ruleText, type LetterRule, type LetterSettings, type LetterStatus } from "@/lib/letter-schedule"
import { EMPLOYMENT_TYPES } from "@/lib/employment-type"

type Row = {
    ruleId: string; typeId: string; typeName: string; employeeId: string; code: string; name: string; designation: string | null; employmentType: string
    siteId: string | null; site: string | null; eventKey: string; event: string | null; triggerDate: string; dueDate: string; daysLate: number; status: LetterStatus
    doc: { id: string; docNumber: string; status: string; issuedAt: string | null; acknowledgedAt: string | null } | null
    skip: { reason: string; by: string; at: string } | null
}
type Data = {
    canEdit: boolean; settings: LetterSettings; rows: Row[]
    types: { id: string; name: string; requiresApproval: boolean; isActive: boolean; hasTemplate: boolean }[]
    signers: { id: string; name: string }[]; sites: { id: string; name: string }[]
}

const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)] whitespace-nowrap"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px] align-top"
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const btn2 = "h-9 px-4 rounded-[9px] border border-[var(--border)] bg-white text-[13px] font-semibold text-[var(--text2)] disabled:opacity-50 inline-flex items-center gap-1.5"
const day = (s: string | null) => s ? new Date(s.length === 10 ? `${s}T00:00:00` : s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"
const TONE: Record<LetterStatus, string> = {
    OVERDUE: "bg-red-50 text-red-700", DUE: "bg-amber-50 text-amber-800", WAITING: "bg-blue-50 text-blue-700",
    SENT: "bg-green-50 text-green-700", ACKNOWLEDGED: "bg-emerald-100 text-emerald-800", UPCOMING: "bg-gray-100 text-gray-600", SKIPPED: "bg-gray-100 text-gray-500",
}
const ORDER: LetterStatus[] = ["OVERDUE", "DUE", "WAITING", "SENT", "ACKNOWLEDGED", "UPCOMING", "SKIPPED"]

export default function JoiningLettersPage() {
    const [d, setD] = useState<Data | null>(null)
    const [tab, setTab] = useState<"tracker" | "rules">("tracker")
    const load = useCallback((first = false) => { fetch("/api/onboarding/letters").then(r => r.json()).then(j => { setD(j); if (first && !j.settings?.rules?.length) setTab("rules") }).catch(() => toast.error("Couldn't load")) }, [])
    useEffect(() => { load(true) }, [load])
    if (!d) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    return (
        <div className="max-w-[1300px] mx-auto p-4 md:p-6 space-y-4">
            <div>
                <Link href="/onboarding" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Onboarding</Link>
                <h1 className="text-[22px] font-bold text-[var(--text)] mt-1">HR letters</h1>
                <p className="text-[12.5px] text-[var(--text3)]">Joining, offer, appointment, confirmation, increment, transfer and exit letters on a schedule — and for every employee, whether it was sent.</p>
            </div>
            <div className="flex gap-1 border-b border-[var(--border)]">
                {([["tracker", "Sent or not"], ["rules", "When to send (settings)"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>
            {tab === "tracker" ? <Tracker d={d} reload={load} /> : <Rules d={d} reload={load} onSaved={() => { load(); setTab("tracker") }} />}
        </div>
    )
}

function Tracker({ d, reload }: { d: Data; reload: () => void }) {
    const [rule, setRule] = useState(""), [status, setStatus] = useState<string>("NEED"), [site, setSite] = useState(""), [q, setQ] = useState("")
    const [sel, setSel] = useState<Set<string>>(new Set())
    const [busy, setBusy] = useState(false)
    const typeName = new Map(d.types.map(t => [t.id, t.name]))
    const counts = useMemo(() => { const c: Record<string, number> = {}; for (const r of d.rows) if (!rule || r.ruleId === rule) c[r.status] = (c[r.status] ?? 0) + 1; return c }, [d.rows, rule])
    const rows = useMemo(() => {
        const t = q.trim().toLowerCase()
        return d.rows.filter(r => (!rule || r.ruleId === rule)
            && (!status || (status === "NEED" ? r.status === "OVERDUE" || r.status === "DUE" : r.status === status))
            && (!site || (r.site ?? "No site") === site)
            && (!t || r.name.toLowerCase().includes(t) || r.code.toLowerCase().includes(t)))
    }, [d.rows, rule, status, site, q])
    const key = (r: Row) => `${r.ruleId}|${r.employeeId}|${r.eventKey}`
    const picked = rows.filter(r => sel.has(key(r)))
    const sendable = picked.filter(r => !r.doc)
    const sites = Array.from(new Set(d.rows.map(r => r.site ?? "No site"))).sort()

    async function post(body: any, ok: (j: any) => string) {
        setBusy(true)
        try {
            const r = await fetch("/api/onboarding/letters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not save")
            toast.success(ok(j)); if (j.errors?.length) toast.error(j.errors.join(" · ")); setSel(new Set()); reload()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const sent = (j: any) => `${j.issued} sent${j.waiting ? `, ${j.waiting} waiting for approval` : ""}${j.failed ? `, ${j.failed} failed` : ""}`
    function send() {
        if (!sendable.length) return
        if (!confirm(`Create and send ${sendable.length} letter(s) now?\n\nLetters whose template needs approval wait in Letters & Documents until approved.`)) return
        post({ action: "issue", items: sendable.map(r => ({ employeeId: r.employeeId, ruleId: r.ruleId, eventKey: r.eventKey })) }, sent)
    }
    function skip() {
        const list = picked.filter(r => !r.doc && !r.skip); if (!list.length) return
        const reason = prompt(`Why aren't these ${list.length} letter(s) needed? (e.g. "Given on paper", "Old staff")`); if (!reason) return
        post({ action: "skip", reason, items: list.map(r => ({ employeeId: r.employeeId, typeId: r.typeId, eventKey: r.eventKey })) }, j => `${j.count} marked as not needed`)
    }
    function unskip() {
        const list = picked.filter(r => r.skip); if (!list.length) return
        post({ action: "unskip", items: list.map(r => ({ employeeId: r.employeeId, typeId: r.typeId, eventKey: r.eventKey })) }, j => `${j.count} marked as needed again`)
    }
    function runNow() {
        if (!confirm("Send every letter that is due now under the rules set to send automatically?")) return
        post({ action: "runNow" }, sent)
    }
    async function exportXlsx() {
        const mod: any = await import("exceljs"); const ExcelJS = mod.default ?? mod
        const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("HR letters")
        ws.columns = [{ header: "Emp Code", key: "code", width: 18 }, { header: "Employee", key: "name", width: 26 }, { header: "Designation", key: "des", width: 22 }, { header: "Site", key: "site", width: 22 }, { header: "Letter", key: "letter", width: 20 }, { header: "Event", key: "ev", width: 34 }, { header: "From date", key: "trig", width: 12 }, { header: "Due on", key: "due", width: 12 }, { header: "Status", key: "status", width: 20 }, { header: "Days late", key: "late", width: 9 }, { header: "Letter no.", key: "no", width: 15 }, { header: "Sent on", key: "sent", width: 12 }, { header: "Acknowledged on", key: "ack", width: 15 }, { header: "Not needed because", key: "skip", width: 30 }]
        for (const r of rows) ws.addRow({ code: r.code, name: r.name, des: r.designation ?? "", site: r.site ?? "", letter: r.typeName, ev: r.event ?? "", trig: r.triggerDate, due: r.dueDate, status: LETTER_STATUS[r.status], late: r.status === "OVERDUE" || r.status === "DUE" ? r.daysLate : "", no: r.doc?.docNumber ?? "", sent: r.doc?.issuedAt?.slice(0, 10) ?? "", ack: r.doc?.acknowledgedAt?.slice(0, 10) ?? "", skip: r.skip?.reason ?? "" })
        ws.getRow(1).font = { bold: true }
        const buf = await wb.xlsx.writeBuffer(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf])); a.download = `HR_Letters_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
    }

    if (!d.settings.rules.some(r => r.trigger !== "ON_DEMAND")) return <p className="text-[13px] text-[var(--text3)] bg-white border border-[var(--border)] rounded-[12px] p-6 text-center">No scheduled letter rules yet — set them up under “When to send”. On-demand letters (warning, appreciation) are issued from <Link href="/documents/send" className="text-[var(--accent)]">Letters &amp; Documents</Link>.</p>
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
                {ORDER.map(s => (
                    <button key={s} onClick={() => setStatus(s)} className={`text-left bg-white border rounded-[12px] p-3 ${status === s ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">{LETTER_STATUS[s]}</p>
                        <p className="text-[22px] font-bold tabular-nums text-[var(--text)]">{counts[s] ?? 0}</p>
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <select value={rule} onChange={e => setRule(e.target.value)} className={box} aria-label="Letter"><option value="">All letters</option>{d.settings.rules.filter(r => r.trigger !== "ON_DEMAND").map(r => <option key={r.id} value={r.id}>{ruleText(r, typeName.get(r.typeId) ?? "Letter")}{r.enabled ? "" : " (off)"}</option>)}</select>
                <select value={status} onChange={e => setStatus(e.target.value)} className={box} aria-label="Status"><option value="NEED">Due or overdue</option><option value="">Any status</option>{ORDER.map(s => <option key={s} value={s}>{LETTER_STATUS[s]}</option>)}</select>
                <select value={site} onChange={e => setSite(e.target.value)} className={box} aria-label="Site"><option value="">All sites</option>{sites.map(s => <option key={s}>{s}</option>)}</select>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or code" className={`${box} flex-1 min-w-[160px]`} />
                <button onClick={exportXlsx} className={btn2}><Download size={14} /> Excel</button>
                {d.canEdit && <button onClick={runNow} disabled={busy} className={btn2} title="Do now what the daily job does"><Play size={14} /> Run now</button>}
            </div>
            {d.canEdit && picked.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 bg-[var(--surface2)] border border-[var(--border)] rounded-[10px] px-3 py-2 text-[12.5px]">
                    <b>{picked.length} selected</b>
                    <button onClick={send} disabled={busy || !sendable.length} className={btn}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send now ({sendable.length})</button>
                    <button onClick={skip} disabled={busy} className={btn2}>Not needed…</button>
                    <button onClick={unskip} disabled={busy} className={btn2}>Needed again</button>
                    <button onClick={() => setSel(new Set())} className="text-[12px] text-[var(--text3)] underline">Clear</button>
                </div>
            )}
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full min-w-[980px]">
                    <thead><tr>
                        <th className={th}>{d.canEdit && <input type="checkbox" aria-label="Select all" checked={rows.length > 0 && rows.slice(0, 500).every(r => sel.has(key(r)))} onChange={e => setSel(e.target.checked ? new Set(rows.slice(0, 500).map(key)) : new Set())} />}</th>
                        <th className={th}>Employee</th><th className={th}>Site</th><th className={th}>Letter</th><th className={th}>Due on</th><th className={th}>Status</th><th className={th}>Letter / note</th>
                    </tr></thead>
                    <tbody>
                        {!rows.length && <tr><td className={`${td} text-center text-[var(--text3)] py-8`} colSpan={7}>Nothing here with these filters.</td></tr>}
                        {rows.slice(0, 500).map(r => (
                            <tr key={key(r)}>
                                <td className={td}>{d.canEdit && <input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(key(r))} onChange={e => setSel(s => { const n = new Set(s); if (e.target.checked) n.add(key(r)); else n.delete(key(r)); return n })} />}</td>
                                <td className={td}><Link href={`/employees/profile/${r.employeeId}`} className="font-semibold hover:text-[var(--accent)]">{r.name}</Link><span className="block text-[11px] text-[var(--text3)]">{r.code} · {r.designation ?? ""}</span></td>
                                <td className={`${td} text-[var(--text2)]`}>{r.site ?? "—"}</td>
                                <td className={td}>{r.typeName}{r.event && <span className="block text-[11px] text-[var(--text3)]">{r.event}</span>}</td>
                                <td className={td}>{day(r.dueDate)}<span className="block text-[11px] text-[var(--text3)]">from {day(r.triggerDate)}</span></td>
                                <td className={td}><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${TONE[r.status]}`}>{LETTER_STATUS[r.status]}</span>{(r.status === "OVERDUE" || r.status === "DUE") && r.daysLate > 0 && <span className="block text-[11px] text-red-600 mt-0.5">{r.daysLate} day(s) late</span>}</td>
                                <td className={`${td} text-[11.5px] text-[var(--text3)]`}>
                                    {r.doc ? <><Link href="/documents/send" className="font-mono text-[var(--accent)]">{r.doc.docNumber}</Link>{r.doc.issuedAt && <span className="block">sent {day(r.doc.issuedAt)}</span>}{r.doc.acknowledgedAt && <span className="block">acknowledged {day(r.doc.acknowledgedAt)}</span>}</>
                                        : r.skip ? <>Not needed: “{r.skip.reason}” — {r.skip.by}</> : "—"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length > 500 && <p className="p-3 text-[12px] text-[var(--text3)]">Showing 500 of {rows.length} — narrow the filters or use Excel.</p>}
            </div>
        </div>
    )
}

const newRule = (typeId: string, trigger: LetterRule["trigger"], offsetDays: number): LetterRule => ({
    id: `r${Math.random().toString(36).slice(2, 10)}`, typeId, enabled: false, trigger, offsetDays, periodMonths: 6, onlyIncrease: true, minChange: 0, autoIssue: true, notify: true,
    employmentTypes: [], siteIds: [], fromDate: new Date().toISOString().slice(0, 10), signerUserId: null,
})

function Rules({ d, reload, onSaved }: { d: Data; reload: () => void; onSaved: () => void }) {
    const [s, setS] = useState<LetterSettings>(d.settings)
    const [busy, setBusy] = useState(false)
    const byName = (n: string) => d.types.find(t => t.name.toLowerCase() === n)?.id
    const setRule = (id: string, p: Partial<LetterRule>) => setS(x => ({ ...x, rules: x.rules.map(r => r.id === id ? { ...r, ...p } : r) }))
    function add() {
        const used = new Set(s.rules.map(r => r.typeId))
        const appt = byName("appointment letter"), offer = byName("offer letter")
        const r = appt && !used.has(appt) ? newRule(appt, "JOINING", 15) : offer && !used.has(offer) ? newRule(offer, "CONVERTED", 0) : newRule(d.types.find(t => !used.has(t.id))?.id ?? d.types[0]?.id ?? "", "JOINING", 0)
        setS(x => ({ ...x, rules: [...x.rules, r] }))
    }
    async function save() {
        setBusy(true)
        try {
            const r = await fetch("/api/onboarding/letters", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) })
            if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Could not save")
            toast.success("Letter settings saved"); onSaved()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const lbl = "block text-[11px] font-semibold uppercase text-[var(--text3)]"
    return (
        <div className="space-y-3 max-w-4xl">
            <StandardLetters d={d} s={s} setS={setS} reload={reload} />
            {s.rules.map(r => {
                const t = d.types.find(x => x.id === r.typeId)
                const onDemand = r.trigger === "ON_DEMAND"
                const extra = TRIGGER_VARIABLES[r.trigger]
                return (
                    <div key={r.id} className="bg-white border border-[var(--border)] rounded-[12px] p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <label className="flex items-center gap-2 text-[14px] font-semibold"><input type="checkbox" disabled={!d.canEdit} checked={r.enabled} onChange={e => setRule(r.id, { enabled: e.target.checked })} /> {t ? ruleText(r, t.name) : "Pick a letter"}</label>
                            {d.canEdit && <button onClick={() => setS(x => ({ ...x, rules: x.rules.filter(y => y.id !== r.id) }))} className="text-red-600 p-1" aria-label="Remove rule"><Trash2 size={16} /></button>}
                        </div>
                        <div className="grid sm:grid-cols-5 gap-3">
                            <label className={`${lbl} sm:col-span-2`}>When<select disabled={!d.canEdit} value={r.trigger} onChange={e => setRule(r.id, { trigger: e.target.value as LetterRule["trigger"] })} className={`${box} w-full`}>{Object.entries(LETTER_TRIGGERS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                            <label className={lbl}>Letter (template)<select disabled={!d.canEdit} value={r.typeId} onChange={e => setRule(r.id, { typeId: e.target.value })} className={`${box} w-full`}>{d.types.map(x => <option key={x.id} value={x.id}>{x.name}{x.isActive ? "" : " (off)"}</option>)}</select></label>
                            {!onDemand && <>
                            <label className={lbl}>Days<input type="number" disabled={!d.canEdit} value={Math.abs(r.offsetDays)} min={0} max={365} onChange={e => setRule(r.id, { offsetDays: (r.offsetDays < 0 ? -1 : 1) * Math.abs(Number(e.target.value) || 0) })} className={`${box} w-full`} /></label>
                            <label className={lbl}>Before / after<select disabled={!d.canEdit} value={r.offsetDays < 0 ? "before" : "after"} onChange={e => setRule(r.id, { offsetDays: (e.target.value === "before" ? -1 : 1) * Math.abs(r.offsetDays) })} className={`${box} w-full`}><option value="after">after</option><option value="before">before</option></select></label>
                            </>}
                        </div>
                        {r.trigger === "CONFIRMATION" && (
                            <div className="flex flex-wrap items-center gap-2 text-[13px]">
                                <span className="font-semibold">Confirmation period</span>
                                {[6, 12].map(m => <button key={m} type="button" disabled={!d.canEdit} onClick={() => setRule(r.id, { periodMonths: m })} className={`h-8 px-3 rounded-[8px] border text-[12.5px] font-semibold ${r.periodMonths === m ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-white text-[var(--text2)]"}`}>{m === 6 ? "6 months" : "1 year"}</button>)}
                                <label className="flex items-center gap-1.5">or<input type="number" min={1} max={36} disabled={!d.canEdit} value={r.periodMonths} onChange={e => setRule(r.id, { periodMonths: Math.max(1, Math.min(36, Number(e.target.value) || 6)) })} className={`${box} w-20`} /> months from the joining date</label>
                                <span className="text-[11.5px] text-[var(--text3)] w-full">Different periods for different staff? Add a second Confirmation rule and pick the employment types for each.</span>
                            </div>
                        )}
                        {r.trigger === "SALARY_REVISION" && (
                            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!d.canEdit} checked={r.onlyIncrease} onChange={e => setRule(r.id, { onlyIncrease: e.target.checked })} /> Only when the monthly CTC goes up (untick = any change). A person&apos;s first salary structure is not counted.</label>
                        )}
                        {r.trigger === "SALARY_REVISION" && (
                            <label className="flex items-center gap-2 text-[13px]">Ignore changes smaller than ₹<input type="number" min={0} disabled={!d.canEdit} value={r.minChange} onChange={e => setRule(r.id, { minChange: Math.max(0, Number(e.target.value) || 0) })} className={`${box} w-24`} /> a month <span className="text-[11.5px] text-[var(--text3)]">(e.g. VDA / minimum-wage updates; 0 = every change)</span></label>
                        )}
                        {r.trigger === "SITE_CHANGE" && <p className="text-[12px] text-[var(--text3)]">One letter for every change of posted site (Deployments / Movements), dated the day the new posting starts.</p>}
                        {r.trigger === "EXIT" && <p className="text-[12px] text-[var(--text3)]">Only for people who are no longer working (resigned, terminated or inactive), counted from the last working date in Exit — or the date of leaving in the employee master.</p>}
                        {onDemand && <p className="text-[12px] text-[var(--text3)] bg-[var(--surface2)] rounded-[8px] px-3 py-2">Not sent on a schedule. HR issues it to a person when needed from <Link href="/documents/send" className="text-[var(--accent)]">Letters &amp; Documents → Send</Link>.</p>}
                        {extra && <p className="text-[11.5px] text-[var(--text3)]">Extra fields for this template: {extra.map(v => <code key={v} className="mr-1.5 px-1 rounded bg-[var(--surface2)] text-[var(--text2)]">{v}</code>)}</p>}
                        {!onDemand && <>
                        <div className="grid sm:grid-cols-3 gap-3">
                            <label className={lbl}>{r.trigger === "SALARY_REVISION" || r.trigger === "SITE_CHANGE" ? "Only changes recorded from" : r.trigger === "EXIT" ? "Only people who left from" : "Only for people from"}<input type="date" disabled={!d.canEdit} value={r.fromDate ?? ""} onChange={e => setRule(r.id, { fromDate: e.target.value || null })} className={`${box} w-full`} /><span className="normal-case font-normal text-[11px]">Empty = everyone, including old staff</span></label>
                            <label className={lbl}>Employment types<select multiple disabled={!d.canEdit} value={r.employmentTypes} onChange={e => setRule(r.id, { employmentTypes: Array.from(e.target.selectedOptions).map(o => o.value) })} className="w-full rounded-[9px] border border-[var(--border)] text-[13px] h-[76px]">{EMPLOYMENT_TYPES.map(x => <option key={x}>{x}</option>)}</select><span className="normal-case font-normal text-[11px]">None picked = all types</span></label>
                            <label className={lbl}>Sites<select multiple disabled={!d.canEdit} value={r.siteIds} onChange={e => setRule(r.id, { siteIds: Array.from(e.target.selectedOptions).map(o => o.value) })} className="w-full rounded-[9px] border border-[var(--border)] text-[13px] h-[76px]">{d.sites.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select><span className="normal-case font-normal text-[11px]">None picked = all sites</span></label>
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-2 items-center text-[13px]">
                            <label className="flex items-center gap-2"><input type="checkbox" disabled={!d.canEdit} checked={r.autoIssue} onChange={e => setRule(r.id, { autoIssue: e.target.checked })} /> Send automatically on the due date</label>
                            <label className="flex items-center gap-2"><input type="checkbox" disabled={!d.canEdit} checked={r.notify} onChange={e => setRule(r.id, { notify: e.target.checked })} /> Tell the employee in the app</label>
                            <label className="flex items-center gap-2">Signed by<select disabled={!d.canEdit} value={r.signerUserId ?? ""} onChange={e => setRule(r.id, { signerUserId: e.target.value || null })} className={box}><option value="">Person who sends it</option>{d.signers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                        </div>
                        </>}
                        {t && (t.requiresApproval || !t.isActive || !t.hasTemplate) && (
                            <p className="text-[12px] text-amber-700 bg-amber-50 rounded-[8px] px-3 py-1.5">
                                {!t.hasTemplate ? "This template is empty — fill it in Letters & Documents → Types first. " : ""}
                                {!t.isActive ? "This template is switched off. " : ""}
                                {t.requiresApproval ? "This template needs approval: letters wait in Letters & Documents until someone approves and issues them." : ""}
                            </p>
                        )}
                    </div>
                )
            })}
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 flex flex-wrap gap-x-5 gap-y-2 items-center text-[13px]">
                <label className="flex items-center gap-2">Overdue after<input type="number" min={0} max={90} disabled={!d.canEdit} value={s.overdueAfterDays} onChange={e => setS(x => ({ ...x, overdueAfterDays: Number(e.target.value) }))} className={`${box} w-20`} /> day(s) past the due date</label>
                <label className="flex items-center gap-2">Daily job sends at most<input type="number" min={1} max={1000} disabled={!d.canEdit} value={s.maxPerRun} onChange={e => setS(x => ({ ...x, maxPerRun: Number(e.target.value) }))} className={`${box} w-24`} /> letters per day</label>
            </div>
            <p className="text-[12px] text-[var(--text3)]">Letters are made from the templates in <Link href="/documents/types" className="text-[var(--accent)]">Letters &amp; Documents → Types</Link>, with name, designation, salary (CTC from the salary master), joining date and the fields of each event (revised salary, sites, last working date) filled in. Employees read and acknowledge them in My Profile → Letters. Nothing is sent on WhatsApp or email.</p>
            {d.canEdit && <div className="flex gap-2"><button onClick={add} className={btn2}><Plus size={14} /> Add a letter</button><button onClick={save} disabled={busy} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Save</button></div>}
        </div>
    )
}

// The client's letter sheet in one place: for each standard letter, whether the
// template exists and whether a rule is set. "Apply" adds the missing rules and
// updates the ones already there (same template) to the standard timing.
function StandardLetters({ d, s, setS, reload }: { d: Data; s: LetterSettings; setS: (f: (x: LetterSettings) => LetterSettings) => void; reload: () => void }) {
    const [busy, setBusy] = useState(false)
    const typeOf = (n: string) => d.types.find(t => t.name.trim().toLowerCase() === n.toLowerCase())
    const missing = STANDARD_LETTERS.filter(l => !typeOf(l.name))
    async function createTemplates() {
        if (!confirm(`Create ${missing.length} letter template(s) with starter wording?\n\n${missing.map(m => m.name).join(", ")}\n\nExisting templates are not changed. You can edit the wording in Letters & Documents → Types.`)) return
        setBusy(true)
        try {
            const r = await fetch("/api/onboarding/letters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createTemplates", names: missing.map(m => m.name) }) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not create")
            toast.success(j.made?.length ? `Created: ${j.made.join(", ")}` : "All templates already exist"); reload()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    function apply() {
        const today = new Date().toISOString().slice(0, 10)
        const rules = [...s.rules]
        let added = 0, updated = 0
        for (const l of STANDARD_LETTERS) {
            const t = typeOf(l.name); if (!t) continue
            const i = rules.findIndex(r => r.typeId === t.id)
            const timing = { trigger: l.trigger, offsetDays: l.offsetDays, ...(l.periodMonths ? { periodMonths: l.periodMonths } : {}) }
            if (i >= 0) { rules[i] = { ...rules[i], ...timing }; updated++ }
            else { rules.push({ ...newRule(t.id, l.trigger, l.offsetDays), ...timing, enabled: l.trigger !== "ON_DEMAND", fromDate: today }); added++ }
        }
        setS(x => ({ ...x, rules }))
        toast.success(`${added} rule(s) added, ${updated} updated — check them below, then Save`)
    }
    return (
        <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-[14px] font-semibold text-[var(--text)]">Standard HR letters</p>
                    <p className="text-[12px] text-[var(--text3)]">When the ERP makes each letter. A rule already set for a template is updated, not duplicated.</p>
                </div>
                {d.canEdit && <div className="flex flex-wrap gap-2">
                    {missing.length > 0 && <button onClick={createTemplates} disabled={busy} className={btn2}>{busy ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />} Create missing templates ({missing.length})</button>}
                    <button onClick={apply} className={btn}><Sparkles size={14} /> Apply standard timings</button>
                </div>}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                    <thead><tr><th className={th}>Letter</th><th className={th}>When the ERP makes it</th><th className={th}>Template</th><th className={th}>Rule</th></tr></thead>
                    <tbody>
                        {STANDARD_LETTERS.map(l => {
                            const t = typeOf(l.name)
                            const rule = t ? s.rules.find(r => r.typeId === t.id) : undefined
                            return (
                                <tr key={l.name}>
                                    <td className={`${td} font-semibold`}>{l.name}</td>
                                    <td className={`${td} text-[var(--text2)]`}>{l.note}</td>
                                    <td className={td}>{t ? <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 size={13} /> Ready{!t.hasTemplate ? " (empty)" : ""}</span> : <span className="text-amber-700">Missing</span>}</td>
                                    <td className={`${td} text-[11.5px]`}>{rule ? <span className={rule.enabled || rule.trigger === "ON_DEMAND" ? "text-green-700" : "text-[var(--text3)]"}>{ruleText(rule, l.name).replace(`${l.name} — `, "")}{rule.enabled || rule.trigger === "ON_DEMAND" ? "" : " (off)"}</span> : <span className="text-[var(--text3)]">Not set</span>}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
