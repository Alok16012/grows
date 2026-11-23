"use client"
import { ModuleTabs } from "@/components/ModuleTabs"

// People → Login roles. Which login role each designation gets: new logins get
// it automatically, a designation change moves the role along, and existing
// staff whose role doesn't match can be fixed after a preview.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Download, Loader2 } from "lucide-react"
import type { AutoRoleSettings } from "@/lib/auto-role"

type Role = { id: string; name: string; color: string }
type Des = { key: string; name: string; people: number; inMaster: boolean; roleId: string | null; effectiveRoleId: string | null; now: { role: string; n: number }[] }
type Mis = { employeeId: string; code: string; name: string; designation: string | null; site: string | null; current: string | null; currentName: string | null; target: string | null; targetName: string | null; locked: string | null }
type Data = { settings: AutoRoleSettings; roles: Role[]; designations: Des[]; mismatches: Mis[]; canEdit: boolean }

const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)] whitespace-nowrap"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px] align-top"
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const btn2 = "h-9 px-3 rounded-[9px] border border-[var(--border)] bg-white text-[12.5px] font-semibold text-[var(--text2)] inline-flex items-center gap-1.5 disabled:opacity-50"

export default function LoginRolesPage() {
    const [d, setD] = useState<Data | null>(null)
    const [tab, setTab] = useState<"map" | "fix">("map")
    const load = useCallback(() => { fetch("/api/employees/roles").then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [])
    useEffect(() => { load() }, [load])
    if (!d) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    const open = d.mismatches.filter(m => !m.locked).length
    return (
        <div className="max-w-[1200px] mx-auto p-4 md:p-6 lg:p-0 space-y-4">
            <ModuleTabs group="access" />
            <div>
                <h2 className="text-[17px] font-bold text-[var(--text)]">Login role by designation</h2>
                <p className="text-[12.5px] text-[var(--text3)]">Each designation gets a login role. New logins get it automatically and it follows promotions; roles given by hand, protected roles and Admin logins are left alone.</p>
            </div>
            <div className="flex gap-1 border-b border-[var(--border)]">
                {([["map", "Designation → role"], ["fix", `Fix existing staff (${open})`]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>
            {tab === "map" ? <MapTab d={d} onSaved={load} /> : <FixTab d={d} onDone={load} />}
        </div>
    )
}

function MapTab({ d, onSaved }: { d: Data; onSaved: () => void }) {
    const [s, setS] = useState<AutoRoleSettings>(d.settings)
    const [busy, setBusy] = useState(false)
    const can = d.canEdit
    const setMap = (k: string, roleId: string) => setS(x => { const m = { ...x.map }; if (roleId) m[k] = roleId; else delete m[k]; return { ...x, map: m } })
    function fillFromCurrent() {
        const byName = new Map(d.roles.map(r => [r.name, r.id]))
        setS(x => { const m = { ...x.map }; for (const des of d.designations) { if (m[des.key]) continue; const top = des.now.find(n => byName.has(n.role)); if (top) m[des.key] = byName.get(top.role)! } return { ...x, map: m } })
        toast.info("Filled empty rows with the role most of their people hold now — check and change before saving")
    }
    async function save() {
        setBusy(true)
        try {
            const r = await fetch("/api/employees/roles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not save")
            toast.success("Login roles saved"); onSaved()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const roleName = new Map(d.roles.map(r => [r.id, r.name]))
    return (
        <div className="space-y-3">
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 grid md:grid-cols-2 gap-3 text-[13px]">
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" disabled={!can} checked={s.enabled} onChange={e => setS(x => ({ ...x, enabled: e.target.checked }))} /> Give logins the role of their designation automatically</label>
                <label className="flex items-center gap-2"><input type="checkbox" disabled={!can} checked={s.followDesignation} onChange={e => setS(x => ({ ...x, followDesignation: e.target.checked }))} /> When the designation changes (promotion, edit), move the role too</label>
                <label className="flex items-center gap-2">Designations with no role below get
                    <select disabled={!can} value={s.defaultRoleId ?? ""} onChange={e => setS(x => ({ ...x, defaultRoleId: e.target.value || null }))} className={box}><option value="">no role (admin assigns)</option>{d.roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
                <div>
                    <p className="mb-1">Never change these roles automatically (Admin logins are never changed):</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">{d.roles.map(r => <label key={r.id} className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" disabled={!can} checked={s.protectedRoleIds.includes(r.id)} onChange={e => setS(x => ({ ...x, protectedRoleIds: e.target.checked ? [...x.protectedRoleIds, r.id] : x.protectedRoleIds.filter(y => y !== r.id) }))} /> {r.name}</label>)}</div>
                </div>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full min-w-[820px]">
                    <thead><tr><th className={th}>Designation</th><th className={th}>People</th><th className={th}>Roles they hold now</th><th className={th}>Login role for this designation</th></tr></thead>
                    <tbody>
                        {d.designations.map(des => (
                            <tr key={des.key}>
                                <td className={td}><b>{des.name}</b>{!des.inMaster && des.name !== "(no designation)" && <span className="block text-[11px] text-amber-700">not in the designation list</span>}</td>
                                <td className={`${td} tabular-nums`}>{des.people}</td>
                                <td className={`${td} text-[11.5px] text-[var(--text2)]`}>{des.now.map(n => `${n.role} ${n.n}`).join(" · ")}</td>
                                <td className={td}>
                                    <select disabled={!can} value={s.map[des.key] ?? ""} onChange={e => setMap(des.key, e.target.value)} className={`${box} w-full max-w-[260px]`} aria-label={`Login role for ${des.name}`}>
                                        <option value="">{s.defaultRoleId ? `Default (${roleName.get(s.defaultRoleId) ?? "—"})` : "— no role —"}</option>
                                        {d.roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {can && <div className="flex flex-wrap gap-2"><button onClick={fillFromCurrent} className={btn2}>Fill empty rows from current roles</button><button onClick={save} disabled={busy} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Save</button></div>}
            <p className="text-[12px] text-[var(--text3)]">Saving changes nobody&apos;s role. New logins and designation changes use it from now on; to move existing staff, use “Fix existing staff”.</p>
        </div>
    )
}

function FixTab({ d, onDone }: { d: Data; onDone: () => void }) {
    const [sel, setSel] = useState<Set<string>>(new Set())
    const [busy, setBusy] = useState(false)
    const [q, setQ] = useState(""), [des, setDes] = useState(""), [to, setTo] = useState("")
    const rows = useMemo(() => d.mismatches.filter(m => (!des || (m.designation ?? "") === des) && (!to || m.targetName === to) && (!q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase()) || m.code.toLowerCase().includes(q.trim().toLowerCase()))), [d.mismatches, q, des, to])
    const choosable = rows.filter(r => !r.locked)
    async function apply() {
        const ids = choosable.filter(r => sel.has(r.employeeId)).map(r => r.employeeId)
        if (!ids.length) return
        if (!confirm(`Change the login role of ${ids.length} person(s) to their designation's role?\n\nTheir access changes on their next page load. Every change is in the audit log.`)) return
        setBusy(true)
        try {
            const r = await fetch("/api/employees/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeIds: ids }) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not save")
            toast.success(`${j.changed} role(s) changed`); setSel(new Set()); onDone()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    async function exportXlsx() {
        const mod: any = await import("exceljs"); const ExcelJS = mod.default ?? mod
        const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Role mismatches")
        ws.columns = [{ header: "Emp Code", key: "c", width: 18 }, { header: "Employee", key: "n", width: 26 }, { header: "Designation", key: "d", width: 26 }, { header: "Site", key: "s", width: 22 }, { header: "Role now", key: "r", width: 20 }, { header: "Designation's role", key: "t", width: 20 }, { header: "Note", key: "l", width: 16 }]
        for (const r of rows) ws.addRow({ c: r.code, n: r.name, d: r.designation ?? "", s: r.site ?? "", r: r.currentName ?? "No role", t: r.targetName ?? "", l: r.locked ?? "" })
        ws.getRow(1).font = { bold: true }
        const buf = await wb.xlsx.writeBuffer(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf])); a.download = `Login_Role_Mismatches_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
    }
    const desList = Array.from(new Set(d.mismatches.map(m => m.designation ?? ""))).sort()
    const toList = Array.from(new Set(d.mismatches.map(m => m.targetName ?? ""))).filter(Boolean).sort()
    if (!d.mismatches.length) return <p className="text-[13px] text-[var(--text3)] bg-white border border-[var(--border)] rounded-[12px] p-6 text-center">Everyone&apos;s role matches their designation&apos;s role (or no designation has a role yet — set them in the first tab).</p>
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or code" className={`${box} min-w-[180px]`} />
                <select value={des} onChange={e => setDes(e.target.value)} className={box} aria-label="Designation"><option value="">All designations</option>{desList.map(x => <option key={x} value={x}>{x || "(none)"}</option>)}</select>
                <select value={to} onChange={e => setTo(e.target.value)} className={box} aria-label="New role"><option value="">Any new role</option>{toList.map(x => <option key={x}>{x}</option>)}</select>
                <button onClick={exportXlsx} className={btn2}><Download size={14} /> Excel</button>
                {d.canEdit && <button onClick={apply} disabled={busy || !choosable.some(r => sel.has(r.employeeId))} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Change {choosable.filter(r => sel.has(r.employeeId)).length} role(s)</button>}
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full min-w-[860px]">
                    <thead><tr>
                        <th className={th}>{d.canEdit && <input type="checkbox" aria-label="Select all" checked={choosable.length > 0 && choosable.every(r => sel.has(r.employeeId))} onChange={e => setSel(e.target.checked ? new Set(choosable.map(r => r.employeeId)) : new Set())} />}</th>
                        <th className={th}>Employee</th><th className={th}>Designation</th><th className={th}>Site</th><th className={th}>Role now</th><th className={th}>Would become</th>
                    </tr></thead>
                    <tbody>
                        {rows.slice(0, 600).map(r => (
                            <tr key={r.employeeId} className={r.locked ? "opacity-60" : ""}>
                                <td className={td}>{d.canEdit && !r.locked && <input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.employeeId)} onChange={e => setSel(s => { const n = new Set(s); if (e.target.checked) n.add(r.employeeId); else n.delete(r.employeeId); return n })} />}</td>
                                <td className={td}><b>{r.name}</b><span className="block text-[11px] text-[var(--text3)]">{r.code}</span></td>
                                <td className={td}>{r.designation ?? "—"}</td>
                                <td className={`${td} text-[var(--text2)]`}>{r.site ?? "—"}</td>
                                <td className={td}>{r.currentName ?? <span className="text-amber-700">No role</span>}</td>
                                <td className={td}><b>{r.targetName ?? "—"}</b>{r.locked && <span className="block text-[11px] text-[var(--text3)]">{r.locked} — not changed</span>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length > 600 && <p className="p-3 text-[12px] text-[var(--text3)]">Showing 600 of {rows.length} — filter or use Excel.</p>}
            </div>
        </div>
    )
}
