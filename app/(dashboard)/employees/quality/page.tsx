"use client"

// People → Data quality. Every gap, wrong format and duplicate in the employee
// master, fixable in place; completeness per employee and site; which fields
// are required per employment type is a setting.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { ArrowLeft, Bell, Download, Loader2, Settings2, X } from "lucide-react"
import { Q_FIELDS, Q_FIELD, SELF_SERVICE_FIELDS, type PeopleSettings } from "@/lib/people-quality"
import { EMPLOYMENT_TYPES } from "@/lib/employment-type"

type Issue = { field: string; label: string; kind: "missing" | "invalid"; message: string; locked: boolean }
type Row = { id: string; code: string; name: string; employmentType: string; siteId: string | null; site: string | null; kycVerified: boolean; pct: number; esicNotNeeded: boolean; values: Record<string, any>; issues: Issue[]; duplicates: string[] }
type Data = {
    settings: PeopleSettings; departments: { id: string; name: string }[]; locked: string[]; canEdit: boolean
    summary: { total: number; complete: number; avgPct: number; withMissing: number; withInvalid: number; duplicateGroups: number; kycNotVerified: number; missingByField: Record<string, number>; invalidByField: Record<string, number> }
    bySite: { site: string; employees: number; avgPct: number; complete: number; issues: number }[]
    employees: Row[]
    duplicates: { field: string; label: string; groups: { employees: { id: string; code: string; name: string; status: string }[] }[] }[]
}

const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)] whitespace-nowrap"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px] align-top"
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"

function Bar({ pct }: { pct: number }) {
    const c = pct >= 100 ? "#16a34a" : pct >= 80 ? "#2563eb" : pct >= 60 ? "#d97706" : "#dc2626"
    return <div className="flex items-center gap-2 min-w-[110px]"><div className="h-1.5 flex-1 rounded-full bg-[var(--surface2)] overflow-hidden"><div style={{ width: `${pct}%`, background: c }} className="h-full" /></div><span className="text-[11.5px] font-semibold tabular-nums" style={{ color: c }}>{pct}%</span></div>
}

export default function DataQualityPage() {
    const [d, setD] = useState<Data | null>(null)
    const [tab, setTab] = useState<"employees" | "fields" | "duplicates" | "sites">("employees")
    const [q, setQ] = useState(""), [site, setSite] = useState(""), [etype, setEtype] = useState(""), [field, setField] = useState(""), [kind, setKind] = useState("")
    const [fix, setFix] = useState<{ row: Row; issue: Issue } | null>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [reminding, setReminding] = useState(false)
    const load = useCallback(() => { fetch("/api/employees/quality").then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [])
    useEffect(() => { load() }, [load])

    const sites = useMemo(() => Array.from(new Set((d?.employees ?? []).map(r => r.site ?? "No site"))).sort(), [d])
    const rows = useMemo(() => {
        const t = q.trim().toLowerCase()
        return (d?.employees ?? []).filter(r =>
            (!t || r.name.toLowerCase().includes(t) || r.code.toLowerCase().includes(t))
            && (!site || (r.site ?? "No site") === site)
            && (!etype || r.employmentType === etype || (etype === "Full-time" && /full/i.test(r.employmentType)) || (etype === "Contract" && /contract/i.test(r.employmentType)))
            && (!field || r.issues.some(i => i.field === field) || (field === "__dup" && r.duplicates.length > 0))
            && (!kind || (kind === "dup" ? r.duplicates.length > 0 : kind === "kyc" ? !r.kycVerified : r.issues.some(i => i.kind === kind)))
            && (kind || field || r.issues.length || r.duplicates.length))
    }, [d, q, site, etype, field, kind])

    async function exportXlsx() {
        const mod: any = await import("exceljs"); const ExcelJS = mod.default ?? mod
        const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Data quality")
        ws.columns = [{ header: "Emp Code", key: "code", width: 12 }, { header: "Employee", key: "name", width: 26 }, { header: "Site", key: "site", width: 20 }, { header: "Type", key: "type", width: 12 }, { header: "Complete %", key: "pct", width: 10 }, { header: "Missing", key: "missing", width: 50 }, { header: "Wrong format", key: "invalid", width: 40 }, { header: "Duplicate", key: "dup", width: 24 }, { header: "KYC verified", key: "kyc", width: 11 }]
        for (const r of rows) ws.addRow({ code: r.code, name: r.name, site: r.site ?? "", type: r.employmentType, pct: r.pct, missing: r.issues.filter(i => i.kind === "missing").map(i => i.label).join(", "), invalid: r.issues.filter(i => i.kind === "invalid").map(i => `${i.label}: ${i.message}`).join("; "), dup: r.duplicates.join(", "), kyc: r.kycVerified ? "Yes" : "No" })
        ws.getRow(1).font = { bold: true }
        const buf = await wb.xlsx.writeBuffer(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf])); a.download = `Employee_Data_Quality_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
    }

    // In-app reminder to the filtered employees who have gaps they can fill in My Profile.
    const selfGap = (r: Row) => r.issues.some(i => SELF_SERVICE_FIELDS.includes(i.field))
    async function remind() {
        const targets = rows.filter(selfGap)
        if (!targets.length) { toast.info("No one in this list has a gap they can fill themselves (photo, address, emergency contact …)"); return }
        if (!confirm(`Send an in-app reminder to ${targets.length} employee(s) to complete My Profile?

Each one sees only the fields missing from their own record. People reminded recently are skipped.`)) return
        setReminding(true)
        try {
            const r = await fetch("/api/employees/quality/remind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeIds: targets.map(x => x.id) }) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not send")
            const skipped = [j.noLogin && `${j.noLogin} without a login`, j.cooling && `${j.cooling} reminded in the last ${j.cooldownHours} h`].filter(Boolean).join(", ")
            toast.success(`Reminder sent to ${j.sent} employee(s)${skipped ? ` — skipped ${skipped}` : ""}`)
        } catch (e: any) { toast.error(e.message) } finally { setReminding(false) }
    }

    if (!d) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    const s = d.summary
    const cards: [string, string | number, string, () => void][] = [
        ["Average completeness", `${s.avgPct}%`, "required fields filled", () => { setTab("employees"); setKind(""); setField("") }],
        ["Complete & clean", `${s.complete} / ${s.total}`, "no gap, error or duplicate", () => {}],
        ["Missing information", s.withMissing, "employees", () => { setTab("employees"); setKind("missing"); setField("") }],
        ["Wrong format", s.withInvalid, "employees", () => { setTab("employees"); setKind("invalid"); setField("") }],
        ["Duplicates", s.duplicateGroups, "shared Aadhaar / PAN / UAN …", () => setTab("duplicates")],
        ["KYC not verified", s.kycNotVerified, "employees", () => { setTab("employees"); setKind("kyc"); setField("") }],
        ...(d.settings.requireSalary ? [["No salary structure", s.missingByField.salaryStructure ?? 0, "payroll can't pay them", () => { setTab("employees"); setKind(""); setField("salaryStructure") }] as [string, number, string, () => void]] : []),
    ]
    return (
        <div className="max-w-[1300px] mx-auto p-4 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <Link href="/employees" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Employees</Link>
                    <h1 className="text-[22px] font-bold text-[var(--text)] mt-1">Employee data quality</h1>
                    <p className="text-[12.5px] text-[var(--text3)]">{s.total} active / onboarding employees. Click a gap to fix it here.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {d.canEdit && <button onClick={remind} disabled={reminding} title="In-app reminder to the employees in the list below to fill what they can in My Profile" className="h-10 px-4 rounded-[10px] border border-[var(--border)] bg-white text-[13px] font-semibold text-[var(--text2)] inline-flex items-center gap-1.5 disabled:opacity-50">{reminding ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />} Remind to complete profile</button>}
                    <button onClick={() => setSettingsOpen(true)} className="h-10 px-4 rounded-[10px] border border-[var(--border)] bg-white text-[13px] font-semibold text-[var(--text2)] inline-flex items-center gap-1.5"><Settings2 size={15} /> Settings</button>
                    <button onClick={exportXlsx} className="h-10 px-4 rounded-[10px] bg-[var(--accent)] text-white text-[13px] font-semibold inline-flex items-center gap-1.5"><Download size={15} /> Excel</button>
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                {cards.map(([l, v, sub, go]) => (
                    <button key={l} onClick={go} className="text-left bg-white border border-[var(--border)] rounded-[12px] p-3 hover:border-[var(--accent)]">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">{l}</p>
                        <p className="text-[22px] font-bold text-[var(--text)] tabular-nums">{v}</p>
                        <p className="text-[11px] text-[var(--text3)]">{sub}</p>
                    </button>
                ))}
            </div>
            <div className="flex gap-1 border-b border-[var(--border)] overflow-x-auto">
                {([["employees", "Employees to fix"], ["fields", "By field"], ["duplicates", `Duplicates (${s.duplicateGroups})`], ["sites", "By site"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>

            {tab === "employees" && (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or code" className={`${box} flex-1 min-w-[180px]`} />
                        <select value={site} onChange={e => setSite(e.target.value)} className={box} aria-label="Site"><option value="">All sites</option>{sites.map(x => <option key={x}>{x}</option>)}</select>
                        <select value={etype} onChange={e => setEtype(e.target.value)} className={box} aria-label="Employment type"><option value="">All types</option>{EMPLOYMENT_TYPES.map(x => <option key={x}>{x}</option>)}</select>
                        <select value={field} onChange={e => setField(e.target.value)} className={box} aria-label="Field"><option value="">Any field</option>{Q_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}<option value="__dup">Any duplicate</option></select>
                        <select value={kind} onChange={e => setKind(e.target.value)} className={box} aria-label="Problem"><option value="">Any problem</option><option value="missing">Missing</option><option value="invalid">Wrong format</option><option value="dup">Duplicate</option><option value="kyc">KYC not verified</option></select>
                        <span className="text-[12px] text-[var(--text3)]">{rows.length} employee(s)</span>
                    </div>
                    <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                        <table className="w-full min-w-[900px]">
                            <thead><tr><th className={th}>Employee</th><th className={th}>Site</th><th className={th}>Complete</th><th className={th}>To fix (click)</th></tr></thead>
                            <tbody>
                                {!rows.length && <tr><td className={`${td} text-center text-[var(--text3)] py-8`} colSpan={4}>Nothing to fix with these filters.</td></tr>}
                                {rows.slice(0, 400).map(r => (
                                    <tr key={r.id}>
                                        <td className={td}><Link href={`/employees?id=${r.id}`} className="font-semibold text-[var(--text)] hover:text-[var(--accent)]">{r.name}</Link><span className="block text-[11px] text-[var(--text3)]">{r.code} · {r.employmentType}</span></td>
                                        <td className={`${td} text-[var(--text2)]`}>{r.site ?? "—"}</td>
                                        <td className={td}><Bar pct={r.pct} /></td>
                                        <td className={td}>
                                            <div className="flex flex-wrap gap-1">
                                                {r.issues.map((i, k) => i.field === "salaryStructure" ? (
                                                    <Link key={k} href="/payroll/salary-master" title="Set it in Payroll → Salary master" className="px-2 py-0.5 rounded-full text-[11.5px] font-medium border bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100">Salary structure missing →</Link>
                                                ) : (
                                                    <button key={k} disabled={!d.canEdit || i.locked || i.field === "photo"} onClick={() => setFix({ row: r, issue: i })} title={i.locked ? "You can't see this field" : i.field === "photo" ? "Add the photo on the employee's profile" : i.message}
                                                        className={`px-2 py-0.5 rounded-full text-[11.5px] font-medium border disabled:cursor-default ${i.kind === "missing" ? "bg-amber-50 text-amber-800 border-amber-200 enabled:hover:bg-amber-100" : "bg-red-50 text-red-700 border-red-200 enabled:hover:bg-red-100"}`}>
                                                        {i.kind === "missing" ? i.label : `${i.label}: wrong`}
                                                    </button>
                                                ))}
                                                {r.esicNotNeeded && d.settings.esicOnlyEligible && <span title="Above the ESIC limit in payroll settings, or ESIC switched off for them" className="px-2 py-0.5 rounded-full text-[11.5px] font-medium border bg-gray-50 text-gray-500 border-gray-200">ESIC not applicable</span>}
                                                {r.duplicates.map(x => <span key={x} className="px-2 py-0.5 rounded-full text-[11.5px] font-medium border bg-violet-50 text-violet-700 border-violet-200">Duplicate {x}</span>)}
                                                {!r.kycVerified && <span className="px-2 py-0.5 rounded-full text-[11.5px] font-medium border bg-gray-50 text-gray-600 border-gray-200">KYC not verified</span>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {rows.length > 400 && <p className="p-3 text-[12px] text-[var(--text3)]">Showing 400 of {rows.length} — narrow the filters or use Excel.</p>}
                    </div>
                </>
            )}

            {tab === "fields" && (
                <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                        <thead><tr><th className={th}>Field</th><th className={th}>Group</th><th className={`${th} !text-right`}>Missing (required)</th><th className={`${th} !text-right`}>Wrong format</th><th className={th}></th></tr></thead>
                        <tbody>
                            {Q_FIELDS.map(f => ({ f, m: s.missingByField[f.key] ?? 0, i: s.invalidByField[f.key] ?? 0 })).sort((a, b) => b.m + b.i - a.m - a.i).map(({ f, m, i }) => (
                                <tr key={f.key}>
                                    <td className={td}><b>{f.label}</b></td>
                                    <td className={`${td} text-[var(--text3)]`}>{f.group}</td>
                                    <td className={`${td} text-right tabular-nums ${m ? "text-amber-700 font-semibold" : "text-[var(--text3)]"}`}>{m || "—"}</td>
                                    <td className={`${td} text-right tabular-nums ${i ? "text-red-600 font-semibold" : "text-[var(--text3)]"}`}>{i || "—"}</td>
                                    <td className={`${td} text-right`}>{(m || i) ? <button className="text-[12px] font-semibold text-[var(--accent)]" onClick={() => { setField(f.key); setKind(""); setTab("employees") }}>Fix →</button> : null}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === "duplicates" && (
                <div className="space-y-3">
                    {!d.duplicates.length && <p className="text-[13px] text-[var(--text3)] bg-white border border-[var(--border)] rounded-[12px] p-4">No duplicates.</p>}
                    {d.duplicates.map(x => (
                        <div key={x.field} className="bg-white border border-[var(--border)] rounded-[12px] p-3">
                            <p className="text-[13px] font-semibold text-[var(--text)] mb-2">{x.label} — {x.groups.length} shared value(s)</p>
                            <div className="space-y-2">
                                {x.groups.map((g, k) => (
                                    <div key={k} className="flex flex-wrap items-center gap-2 rounded-[9px] bg-violet-50/50 border border-violet-100 px-3 py-2">
                                        {g.employees.map(e => (
                                            <Link key={e.id} href={`/employees?id=${e.id}`} className="px-2 py-0.5 rounded-full bg-white border border-[var(--border)] text-[12px] hover:border-[var(--accent)]">
                                                <b>{e.name}</b> <span className="text-[var(--text3)]">{e.code}{e.status !== "ACTIVE" ? ` · ${e.status.toLowerCase()}` : ""}</span>
                                            </Link>
                                        ))}
                                    </div>
                                ))}
                            </div>
                            <p className="text-[11.5px] text-[var(--text3)] mt-2">Open each person and correct the wrong one (or, if it is the same person twice, keep one record and remove the other).</p>
                        </div>
                    ))}
                </div>
            )}

            {tab === "sites" && (
                <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                        <thead><tr><th className={th}>Site</th><th className={`${th} !text-right`}>Employees</th><th className={th}>Average complete</th><th className={`${th} !text-right`}>Complete profiles</th><th className={`${th} !text-right`}>Open issues</th><th className={th}></th></tr></thead>
                        <tbody>
                            {d.bySite.map(x => (
                                <tr key={x.site}>
                                    <td className={td}><b>{x.site}</b></td>
                                    <td className={`${td} text-right tabular-nums`}>{x.employees}</td>
                                    <td className={td}><Bar pct={x.avgPct} /></td>
                                    <td className={`${td} text-right tabular-nums`}>{x.complete}</td>
                                    <td className={`${td} text-right tabular-nums`}>{x.issues}</td>
                                    <td className={`${td} text-right`}><button className="text-[12px] font-semibold text-[var(--accent)]" onClick={() => { setSite(x.site); setField(""); setKind(""); setTab("employees") }}>Fix →</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {fix && <FixModal row={fix.row} issue={fix.issue} departments={d.departments} onClose={() => setFix(null)} onSaved={() => { setFix(null); load() }} />}
            {settingsOpen && <SettingsModal settings={d.settings} canEdit={d.canEdit} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); load() }} />}
        </div>
    )
}

function Shell({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[92vh] flex flex-col bg-white rounded-[14px] border border-[var(--border)] shadow-xl`}>
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)]"><h3 className="text-[15px] font-semibold">{title}</h3><button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button></div>
                <div className="p-5 space-y-3 overflow-y-auto">{children}</div>
            </div>
        </div>, document.body)
}

function FixModal({ row, issue, departments, onClose, onSaved }: { row: Row; issue: Issue; departments: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
    const f = Q_FIELD.get(issue.field)!
    const initial = row.values[issue.field]
    const [v, setV] = useState<string>(initial ? (f.type === "date" ? String(initial).slice(0, 10) : String(initial)) : "")
    const [managers, setManagers] = useState<{ id: string; name: string; role: string }[]>([])
    const [busy, setBusy] = useState(false)
    const [dup, setDup] = useState<string | null>(null)
    useEffect(() => { if (f.type === "manager") fetch("/api/employees/manager-options").then(r => r.json()).then(d => setManagers(Array.isArray(d) ? d : [])).catch(() => {}) }, [f.type])
    async function save(force = false) {
        setBusy(true)
        try {
            const r = await fetch("/api/employees/quality", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: row.id, field: issue.field, value: v, force }) })
            const d = await r.json().catch(() => ({}))
            if (r.status === 409 && d.duplicate) { setDup(d.error); return }
            if (!r.ok) throw new Error(d.error || "Could not save")
            toast.success(`${f.label} saved for ${row.name}`); onSaved()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <Shell title={`${f.label} — ${row.name}`} onClose={onClose}>
            {issue.kind === "invalid" && <p className="text-[12.5px] text-red-700 bg-red-50 rounded-[8px] px-3 py-2">{issue.message}</p>}
            {f.type === "select" ? <select value={v} onChange={e => setV(e.target.value)} className={`${box} w-full`}><option value="">Pick…</option>{f.options!.map(o => <option key={o}>{o}</option>)}</select>
                : f.type === "department" ? <select value={v} onChange={e => setV(e.target.value)} className={`${box} w-full`}><option value="">Pick a department…</option>{departments.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
                    : f.type === "manager" ? <select value={v} onChange={e => setV(e.target.value)} className={`${box} w-full`}><option value="">Pick the reporting manager…</option>{managers.map(o => <option key={o.id} value={o.id}>{o.name} — {o.role}</option>)}</select>
                        : <input type={f.type === "date" ? "date" : "text"} value={v} onChange={e => { setV(e.target.value); setDup(null) }} autoFocus className={`${box} w-full`} placeholder={f.label} />}
            {dup && <p className="text-[12.5px] text-violet-800 bg-violet-50 rounded-[8px] px-3 py-2">{dup}. Save anyway only if that is correct.</p>}
            <div className="flex justify-end gap-2 pt-1">
                <button onClick={onClose} className="h-9 px-4 rounded-[9px] border border-[var(--border)] text-[13px]">Cancel</button>
                {dup ? <button onClick={() => save(true)} disabled={busy} className="h-9 px-4 rounded-[9px] bg-violet-600 text-white text-[13px] font-semibold disabled:opacity-50">Save anyway</button>
                    : <button onClick={() => save()} disabled={busy || !v.trim()} className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>}
            </div>
        </Shell>
    )
}

function SettingsModal({ settings, canEdit, onClose, onSaved }: { settings: PeopleSettings; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
    const types = ["default", ...EMPLOYMENT_TYPES]
    const [req, setReq] = useState<Record<string, string[]>>(() => Object.fromEntries(types.map(t => [t, settings.required[t] ?? settings.required.default])))
    const [dups, setDups] = useState(settings.duplicatesAmong)
    const [esicOnly, setEsicOnly] = useState(settings.esicOnlyEligible)
    const [needSalary, setNeedSalary] = useState(settings.requireSalary)
    const [cooldown, setCooldown] = useState(String(settings.reminderCooldownHours))
    const [busy, setBusy] = useState(false)
    const toggle = (t: string, k: string) => setReq(r => ({ ...r, [t]: r[t].includes(k) ? r[t].filter(x => x !== k) : [...r[t], k] }))
    async function save() {
        setBusy(true)
        try {
            const r = await fetch("/api/employees/quality", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, required: req, duplicatesAmong: dups, esicOnlyEligible: esicOnly, requireSalary: needSalary, reminderCooldownHours: Number(cooldown) }) })
            if (!r.ok) throw new Error("Could not save")
            toast.success("Settings saved"); onSaved()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <Shell title="Data quality settings" onClose={onClose} wide>
            <p className="text-[12.5px] text-[var(--text3)]">Which fields each employment type must have. “Other types” applies to any type without its own column.</p>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead><tr><th className={th}>Field</th>{types.map(t => <th key={t} className={`${th} !text-center`}>{t === "default" ? "Other types" : t}</th>)}</tr></thead>
                    <tbody>
                        {Q_FIELDS.filter(f => f.key !== "salaryStructure").map(f => (
                            <tr key={f.key}><td className={td}>{f.label} <span className="text-[11px] text-[var(--text3)]">{f.group}</span></td>
                                {types.map(t => <td key={t} className={`${td} text-center`}><input type="checkbox" disabled={!canEdit} checked={req[t].includes(f.key)} onChange={() => toggle(t, f.key)} aria-label={`${f.label} required for ${t}`} /></td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!canEdit} checked={esicOnly} onChange={e => setEsicOnly(e.target.checked)} /> ESIC number required only when payroll deducts ESIC <span className="text-[11.5px] text-[var(--text3)]">(same limit and per-employee switch as payroll)</span></label>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!canEdit} checked={needSalary} onChange={e => setNeedSalary(e.target.checked)} /> Every employee needs a salary structure <span className="text-[11.5px] text-[var(--text3)]">(Payroll → Salary master)</span></label>
            <label className="flex items-center gap-2 text-[13px]">Remind the same employee again after
                <input type="number" min={0} max={720} disabled={!canEdit} value={cooldown} onChange={e => setCooldown(e.target.value)} className={`${box} w-20`} aria-label="Reminder cooldown in hours" /> hours</label>
            <label className="flex items-center gap-2 text-[13px]">Look for duplicates among
                <select disabled={!canEdit} value={dups} onChange={e => setDups(e.target.value as PeopleSettings["duplicatesAmong"])} className={box}><option value="active">active employees</option><option value="all">everyone, including leavers</option></select>
            </label>
            {canEdit && <div className="flex justify-end gap-2"><button onClick={onClose} className="h-9 px-4 rounded-[9px] border border-[var(--border)] text-[13px]">Cancel</button><button onClick={save} disabled={busy} className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50">Save</button></div>}
        </Shell>
    )
}
