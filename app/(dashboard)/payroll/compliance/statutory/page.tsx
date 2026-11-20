"use client"

// Payroll → Compliance → Statutory Applicability.
// PF / PF Pension (EPS) / ESIC switches for many employees at once — the same
// switches as Employee Master → Basic Info. Applied the next time payroll is
// processed; locked months are not recalculated.

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { ChevronRight, Loader2, Search, ShieldCheck, Info } from "lucide-react"
import { can } from "@/lib/can"
import { StatCard, statGridClass } from "@/components/StatCard"

type Row = {
    id: string; employeeId: string; name: string; designation: string | null
    site: { id: string; name: string } | null; compliance: string
    pfApplicable: boolean; pensionApplicable: boolean; esicApplicable: boolean
}
type Flag = "pfApplicable" | "pensionApplicable" | "esicApplicable"
const FLAG_LABEL: Record<Flag, string> = { pfApplicable: "PF", pensionApplicable: "PF Pension (EPS)", esicApplicable: "ESIC" }

const inputCls = "h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? "bg-[var(--success-strong)]" : "bg-[var(--border2)]"} ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
        </button>
    )
}

export default function StatutoryApplicabilityPage() {
    const { data: session } = useSession()
    const canEdit = can(session, "employees.edit")
    const [rows, setRows] = useState<Row[]>([])
    const [installed, setInstalled] = useState(true)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [q, setQ] = useState("")
    const [site, setSite] = useState("")
    const [designation, setDesignation] = useState("")
    const [show, setShow] = useState<"all" | "noPf" | "noPension" | "noEsic">("all")
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [saving, setSaving] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/employees/statutory")
            const d = await res.json().catch(() => null)
            if (!res.ok) { setError(d?.error || "Could not load employees."); return }
            setError(null); setInstalled(d.installed !== false); setRows(d.employees ?? [])
        } catch { setError("Could not load employees. Check your connection.") }
        finally { setLoading(false) }
    }, [])
    useEffect(() => { load() }, [load])

    const sites = useMemo(() => Array.from(new Map(rows.filter(r => r.site).map(r => [r.site!.id, r.site!.name])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [rows])
    // Grouped ignoring case and spacing: "Quality inspector" and "QUALITY INSPECTOR"
    // are the same designation. Keyed lower-case, shown as the most common spelling.
    const desKey = (d: string | null) => (d ?? "").trim().replace(/\s+/g, " ").toLowerCase()
    const designations = useMemo(() => {
        const by = new Map<string, Map<string, number>>()
        for (const r of rows) {
            const k = desKey(r.designation); if (!k) continue
            const spell = (r.designation ?? "").trim().replace(/\s+/g, " ")
            const m = by.get(k) ?? new Map<string, number>(); m.set(spell, (m.get(spell) ?? 0) + 1); by.set(k, m)
        }
        return Array.from(by.entries())
            .map(([key, m]) => ({ key, label: Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0][0], n: Array.from(m.values()).reduce((a, b) => a + b, 0) }))
            .sort((a, b) => a.label.localeCompare(b.label))
    }, [rows])
    const shown = useMemo(() => {
        const s = q.trim().toLowerCase()
        return rows.filter(r =>
            (!s || r.name.toLowerCase().includes(s) || r.employeeId.toLowerCase().includes(s)) &&
            (!site || r.site?.id === site) &&
            (!designation || desKey(r.designation) === designation) &&
            (show === "all" || (show === "noPf" && !r.pfApplicable) || (show === "noPension" && !r.pensionApplicable) || (show === "noEsic" && !r.esicApplicable)))
    }, [rows, q, site, designation, show])
    const allShownSelected = shown.length > 0 && shown.every(r => selected.has(r.id))

    async function apply(ids: string[], patch: Partial<Record<Flag, boolean>>) {
        if (!ids.length) return
        setSaving(true)
        try {
            const res = await fetch("/api/employees/statutory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeIds: ids, ...patch }) })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(d?.error || "Could not save")
            // Mirror the server rules locally: no PF → no pension; pension only with PF.
            setRows(prev => prev.map(r => {
                if (!ids.includes(r.id)) return r
                const next = { ...r, ...patch }
                if (patch.pfApplicable === false) next.pensionApplicable = false
                if (patch.pensionApplicable === true && !next.pfApplicable) next.pensionApplicable = false
                return next
            }))
            const what = Object.entries(patch).map(([k, v]) => `${FLAG_LABEL[k as Flag]} ${v ? "on" : "off"}`).join(", ")
            toast.success(`${what} for ${d.updated} employee${d.updated === 1 ? "" : "s"}${d.skippedPension ? ` (${d.skippedPension} without PF kept pension off)` : ""}`)
        } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save") }
        finally { setSaving(false) }
    }
    const bulk = (patch: Partial<Record<Flag, boolean>>) => apply(Array.from(selected), patch)

    const counts = { total: rows.length, noPf: rows.filter(r => !r.pfApplicable).length, noPension: rows.filter(r => !r.pensionApplicable).length, noEsic: rows.filter(r => !r.esicApplicable).length }
    const btn = "h-8 px-3 rounded-[8px] border text-[12.5px] font-semibold disabled:opacity-50"

    return (
        <div className="p-4 lg:p-0 flex flex-col gap-4">
            <div className="flex items-center gap-1.5 text-[12px] text-[var(--text3)]">
                <Link href="/payroll" className="hover:text-[var(--accent)]">Payroll</Link><ChevronRight size={11} />
                <Link href="/payroll/compliance" className="hover:text-[var(--accent)]">Compliance</Link><ChevronRight size={11} />
                <span className="font-semibold text-[var(--text2)]">Statutory Applicability</span>
            </div>
            <div>
                <h1 className="flex items-center gap-2 text-[22px] font-extrabold text-[var(--text)]"><ShieldCheck size={20} className="text-[var(--accent)]" /> Statutory Applicability</h1>
                <p className="text-[13px] text-[var(--text3)] mt-1">Who is covered by PF, PF Pension (EPS) and ESIC. Set it for many employees at once.</p>
            </div>

            <div className="flex gap-2 items-start rounded-[10px] border border-[#bfdbfe] bg-[#eff6ff] px-3.5 py-2.5 text-[12.5px] text-[#1e40af]">
                <Info size={14} className="mt-0.5 shrink-0" />
                <span>Changes apply the next time payroll is processed; locked months aren&apos;t recalculated. <b>Pension off</b> = zero EPS: the employer&apos;s 8.33% goes to EPF instead (same total). <b>PF off</b> also turns pension off. CALL (contract) staff never get PF or ESIC, whatever is set here.</span>
            </div>

            {!installed && (
                <div className="rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[12.5px] text-[#92400e]">
                    These switches aren&apos;t set up on the database yet (scripts/employee-statutory.sql). Until then everyone is PF, pension and ESIC applicable.
                </div>
            )}

            <div className={statGridClass(4)}>
                <StatCard label="Employees" value={counts.total} tone="blue" icon={<ShieldCheck size={20} />} loading={loading} onClick={() => setShow("all")} active={show === "all"} seed={0} />
                <StatCard label="PF off" value={counts.noPf} tone="slate" icon={<ShieldCheck size={20} />} loading={loading} onClick={() => setShow("noPf")} active={show === "noPf"} seed={1} />
                <StatCard label="Pension (EPS) off" value={counts.noPension} tone="amber" icon={<ShieldCheck size={20} />} loading={loading} onClick={() => setShow("noPension")} active={show === "noPension"} seed={2} />
                <StatCard label="ESIC off" value={counts.noEsic} tone="rose" icon={<ShieldCheck size={20} />} loading={loading} onClick={() => setShow("noEsic")} active={show === "noEsic"} seed={3} />
            </div>

            <div className="flex flex-wrap gap-2 items-center">
                <label className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input id="stat-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or employee ID" className={`${inputCls} w-full pl-8`} />
                </label>
                <select id="stat-site" value={site} onChange={e => setSite(e.target.value)} className={inputCls} aria-label="Site">
                    <option value="">All sites</option>
                    {sites.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <select id="stat-designation" value={designation} onChange={e => setDesignation(e.target.value)} className={inputCls} aria-label="Designation">
                    <option value="">All designations</option>
                    {designations.map(d => <option key={d.key} value={d.key}>{d.label} ({d.n})</option>)}
                </select>
            </div>

            {canEdit && selected.size > 0 && (
                <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-[12px] border border-[var(--accent)] bg-[var(--surface)] px-3.5 py-2.5 shadow-[var(--shadow-lg)]">
                    <span className="text-[13px] font-semibold text-[var(--text)] mr-1">{selected.size} selected:</span>
                    {(["pfApplicable", "pensionApplicable", "esicApplicable"] as Flag[]).map(f => (
                        <span key={f} className="inline-flex items-center gap-1">
                            <span className="text-[12px] text-[var(--text2)]">{FLAG_LABEL[f]}</span>
                            <button disabled={saving} onClick={() => bulk({ [f]: true })} className={`${btn} border-[var(--success-border)] text-[var(--success)] bg-[var(--success-light)]`}>On</button>
                            <button disabled={saving} onClick={() => bulk({ [f]: false })} className={`${btn} border-[var(--border)] text-[var(--text2)] bg-[var(--surface2)]`}>Off</button>
                        </span>
                    ))}
                    {saving && <Loader2 size={14} className="animate-spin text-[var(--text3)]" />}
                    <button onClick={() => setSelected(new Set())} className="ml-auto text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]">Clear selection</button>
                </div>
            )}

            <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
                <table className="w-full text-[13px] min-w-[760px]">
                    <thead className="bg-[var(--surface2)] text-[11px] uppercase tracking-wide text-[var(--text3)]">
                        <tr>
                            <th className="w-10 px-3 py-2.5 text-left">
                                {canEdit && <input type="checkbox" aria-label="Select all shown" checked={allShownSelected} disabled={!shown.length}
                                    onChange={e => setSelected(prev => { const n = new Set(prev); shown.forEach(r => e.target.checked ? n.add(r.id) : n.delete(r.id)); return n })} className="accent-[var(--accent)]" />}
                            </th>
                            <th className="px-3 py-2.5 text-left">Employee</th>
                            <th className="px-3 py-2.5 text-left">Designation</th>
                            <th className="px-3 py-2.5 text-left">Site</th>
                            <th className="px-3 py-2.5 text-center">PF</th>
                            <th className="px-3 py-2.5 text-center">Pension (EPS)</th>
                            <th className="px-3 py-2.5 text-center">ESIC</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            [0, 1, 2, 3, 4].map(i => <tr key={i}><td colSpan={7} className="px-3 py-2"><div className="h-6 rounded bg-muted animate-pulse" /></td></tr>)
                        ) : error ? (
                            <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--red)]">{error}</td></tr>
                        ) : shown.length === 0 ? (
                            <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--text3)]">No employees match these filters.</td></tr>
                        ) : shown.slice(0, 500).map(r => (
                            <tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--surface2)]">
                                <td className="px-3 py-2">
                                    {canEdit && <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)}
                                        onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(r.id) : n.delete(r.id); return n })} className="accent-[var(--accent)]" />}
                                </td>
                                <td className="px-3 py-2">
                                    <p className="font-medium text-[var(--text)]">{r.name}</p>
                                    <p className="text-[11.5px] text-[var(--text3)]">{r.employeeId}{r.compliance === "CALL" ? " · CALL" : ""}</p>
                                </td>
                                <td className="px-3 py-2 text-[var(--text2)]">{r.designation || "—"}</td>
                                <td className="px-3 py-2 text-[var(--text2)]">{r.site?.name || "—"}</td>
                                <td className="px-3 py-2 text-center"><Switch label={`PF for ${r.name}`} on={r.pfApplicable} disabled={!canEdit || saving || !installed} onChange={v => apply([r.id], { pfApplicable: v })} /></td>
                                <td className="px-3 py-2 text-center"><Switch label={`Pension for ${r.name}`} on={r.pensionApplicable} disabled={!canEdit || saving || !installed || !r.pfApplicable} onChange={v => apply([r.id], { pensionApplicable: v })} /></td>
                                <td className="px-3 py-2 text-center"><Switch label={`ESIC for ${r.name}`} on={r.esicApplicable} disabled={!canEdit || saving || !installed} onChange={v => apply([r.id], { esicApplicable: v })} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {shown.length > 500 && <p className="px-3 py-2 text-[12px] text-[var(--text3)] border-t border-[var(--border)]">Showing the first 500 of {shown.length}. Use the filters to narrow it down; &quot;select all&quot; still covers all {shown.length}.</p>}
            </div>
        </div>
    )
}
