"use client"

// People → Masters. Standard designations (merge the spellings in use into
// one name each; old spellings become aliases so imports and forms map to the
// standard), departments (add / rename, assign in bulk, default department per
// designation) and employment-type spellings.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Plus } from "lucide-react"

type M = { name: string; departmentId: string | null; aliases: string[]; employees: number }
type Raw = { value: string; count: number; standard: string | null }
type Sug = { to: string; from: string[]; employees: number }
type Dept = { id: string; name: string; isActive: boolean; description: string | null; employees: number }
type Data = { master: M[]; raw: Raw[]; suggestions: Sug[]; departments: Dept[]; noDepartment: number; employmentTypes: { value: string; count: number; canonical: string }[]; canEdit: boolean }

const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)] whitespace-nowrap"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px] align-top"
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const small = "h-7 px-2.5 rounded-[7px] border border-[var(--border)] bg-white text-[11.5px] font-semibold text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"

async function post(body: unknown) {
    const r = await fetch("/api/employees/masters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d?.error || "Could not save")
    return d
}

export default function MastersPage() {
    const [d, setD] = useState<Data | null>(null)
    const [tab, setTab] = useState<"designations" | "departments" | "types">("designations")
    const [busy, setBusy] = useState(false)
    const load = useCallback(() => { fetch("/api/employees/masters").then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [])
    useEffect(() => { load() }, [load])
    const run = async (body: unknown, ok: (r: any) => string) => {
        setBusy(true)
        try { const r = await post(body); toast.success(ok(r)); load() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }

    if (!d) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    const ro = !d.canEdit
    const mixedTypes = d.employmentTypes.filter(t => t.value !== t.canonical)
    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
            <div>
                <Link href="/employees" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Employees</Link>
                <h1 className="text-[22px] font-bold text-[var(--text)] mt-1">Employee masters</h1>
                <p className="text-[12.5px] text-[var(--text3)]">{d.raw.length} designation spellings in use · {d.master.length} standard · {d.noDepartment} active employees without a department · {mixedTypes.reduce((s, t) => s + t.count, 0)} with an old employment-type spelling</p>
                <p className="text-[12.5px] mt-1"><Link href="/employees/roles" className="text-[var(--accent)] font-semibold">Login role for each designation →</Link></p>
            </div>
            <div className="flex gap-1 border-b border-[var(--border)]">
                {([["designations", "Designations"], ["departments", "Departments"], ["types", "Employment types"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>
            {tab === "designations" && <DesignationsTab d={d} ro={ro} busy={busy} run={run} />}
            {tab === "departments" && <DepartmentsTab d={d} ro={ro} busy={busy} run={run} />}
            {tab === "types" && (
                <div className="space-y-3">
                    <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                        <table className="w-full"><thead><tr><th className={th}>Spelling in use</th><th className={th}>Becomes</th><th className={`${th} !text-right`}>Employees</th></tr></thead>
                            <tbody>{d.employmentTypes.map(t => (
                                <tr key={t.value}><td className={td}>{t.value}</td><td className={`${td} ${t.value !== t.canonical ? "text-[var(--accent)] font-semibold" : "text-[var(--text3)]"}`}>{t.value !== t.canonical ? t.canonical : "— already standard"}</td><td className={`${td} text-right tabular-nums`}>{t.count}</td></tr>
                            ))}</tbody></table>
                    </div>
                    {!ro && mixedTypes.length > 0 && <button className={btn} disabled={busy} onClick={() => confirm(`Change ${mixedTypes.reduce((s, t) => s + t.count, 0)} employees to the standard spellings (Full-time, Part-time, Contract, Daily Wage)?`) && run({ action: "normaliseEmploymentTypes" }, r => `${r.updated} employee(s) updated`)}>Normalise all</button>}
                    {!mixedTypes.length && <p className="text-[13px] text-[var(--text3)]">Every employment type is already spelt the standard way.</p>}
                </div>
            )}
        </div>
    )
}

function DesignationsTab({ d, ro, busy, run }: { d: Data; ro: boolean; busy: boolean; run: (b: unknown, ok: (r: any) => string) => void }) {
    const [newName, setNewName] = useState("")
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [mergeTo, setMergeTo] = useState("")
    const [q, setQ] = useState("")
    const deptName = useMemo(() => new Map(d.departments.map(x => [x.id, x.name])), [d.departments])
    const raw = d.raw.filter(r => !q.trim() || r.value.toLowerCase().includes(q.trim().toLowerCase()))
    const pickedList = Array.from(picked)
    return (
        <div className="space-y-4">
            {d.suggestions.length > 0 && (
                <div className="bg-white border border-[var(--border)] rounded-[12px] p-3">
                    <p className="text-[13px] font-semibold text-[var(--text)]">Suggested merges ({d.suggestions.length})</p>
                    <p className="text-[11.5px] text-[var(--text3)] mb-2">Spellings that differ only in capitals, spaces or punctuation. Merge sets everyone to the first spelling and remembers the others.</p>
                    <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                        {d.suggestions.map(s => (
                            <div key={s.to} className="flex flex-wrap items-center gap-2 text-[12.5px] border-b border-[var(--border)] pb-1.5">
                                <span className="text-[var(--text3)]">{s.from.filter(f => f !== s.to).join(" · ")}</span><span>→</span><b>{s.to}</b><span className="text-[var(--text3)]">({s.employees})</span>
                                {!ro && <button className={`${small} ml-auto`} disabled={busy} onClick={() => run({ action: "merge", from: s.from, to: s.to }, r => `${r.moved} employee(s) now "${s.to}"`)}>Merge</button>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-white border border-[var(--border)] rounded-[12px]">
                    <div className="p-3 border-b border-[var(--border)] space-y-2">
                        <p className="text-[13px] font-semibold">In use ({d.raw.length})</p>
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className={`${box} w-full`} />
                        {!ro && picked.size > 0 && (
                            <div className="flex flex-wrap gap-2 items-center rounded-[9px] bg-[var(--accent)]/5 border border-[var(--accent)] p-2">
                                <span className="text-[12px] font-semibold">{picked.size} ticked → merge into</span>
                                <input list="std-des" value={mergeTo} onChange={e => setMergeTo(e.target.value)} placeholder="Standard name" className={`${box} flex-1 min-w-[140px]`} />
                                <datalist id="std-des">{d.master.map(m => <option key={m.name} value={m.name} />)}</datalist>
                                <button className={small} disabled={busy || !mergeTo.trim()} onClick={() => { run({ action: "merge", from: pickedList, to: mergeTo.trim() }, r => `${r.moved} employee(s) now "${mergeTo.trim()}"`); setPicked(new Set()); setMergeTo("") }}>Merge</button>
                            </div>
                        )}
                    </div>
                    <div className="max-h-[520px] overflow-y-auto">
                        <table className="w-full"><tbody>
                            {raw.map(r => (
                                <tr key={r.value}>
                                    {!ro && <td className={`${td} w-8`}><input type="checkbox" aria-label={`Tick ${r.value}`} checked={picked.has(r.value)} onChange={() => setPicked(p => { const n = new Set(p); n.has(r.value) ? n.delete(r.value) : n.add(r.value); return n })} /></td>}
                                    <td className={td}>{r.value}{r.standard && r.standard !== r.value && <span className="block text-[11px] text-[var(--accent)]">→ {r.standard}</span>}{r.standard === r.value && <span className="ml-1.5 text-[10.5px] text-green-700 font-semibold">standard</span>}</td>
                                    <td className={`${td} text-right tabular-nums`}>{r.count}</td>
                                </tr>
                            ))}
                        </tbody></table>
                    </div>
                </div>
                <div className="bg-white border border-[var(--border)] rounded-[12px]">
                    <div className="p-3 border-b border-[var(--border)] space-y-2">
                        <p className="text-[13px] font-semibold">Standard list ({d.master.length})</p>
                        {!ro && <div className="flex gap-2"><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Add a standard designation" className={`${box} flex-1`} /><button className={btn} disabled={busy || !newName.trim()} onClick={() => { run({ action: "addDesignation", name: newName }, () => "Added"); setNewName("") }}><Plus size={14} /></button></div>}
                        {!ro && d.master.some(m => m.departmentId) && <button className={small} disabled={busy} onClick={() => run({ action: "applyDepartments" }, r => `Department set for ${r.updated} employee(s) without one`)}>Fill blank departments from designations</button>}
                    </div>
                    <div className="max-h-[520px] overflow-y-auto">
                        <table className="w-full"><thead><tr><th className={th}>Designation</th><th className={th}>Default department</th><th className={`${th} !text-right`}>Emp.</th><th className={th}></th></tr></thead><tbody>
                            {!d.master.length && <tr><td className={`${td} text-center text-[var(--text3)] py-6`} colSpan={4}>Merge spellings or add names to build the list.</td></tr>}
                            {d.master.map(m => (
                                <tr key={m.name}>
                                    <td className={td}><b>{m.name}</b>{m.aliases.length > 0 && <span className="block text-[11px] text-[var(--text3)]" title={m.aliases.join(", ")}>also: {m.aliases.slice(0, 3).join(", ")}{m.aliases.length > 3 ? ` +${m.aliases.length - 3}` : ""}</span>}</td>
                                    <td className={td}>
                                        <select disabled={ro || busy} value={m.departmentId ?? ""} onChange={e => run({ action: "updateDesignation", name: m.name, departmentId: e.target.value || null }, () => `Default department ${e.target.value ? `set to ${deptName.get(e.target.value)}` : "cleared"}`)} className={`${box} h-8 text-[12px]`} aria-label={`Default department for ${m.name}`}>
                                            <option value="">—</option>{d.departments.filter(x => x.isActive).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                                        </select>
                                    </td>
                                    <td className={`${td} text-right tabular-nums`}>{m.employees}</td>
                                    <td className={`${td} text-right whitespace-nowrap`}>
                                        {!ro && <button className="text-[12px] font-semibold text-[var(--accent)] mr-2" onClick={() => { const n = prompt(`Rename "${m.name}" (employees move with it)`, m.name); if (n && n.trim() && n.trim() !== m.name) run({ action: "updateDesignation", name: m.name, newName: n.trim() }, r => `Renamed — ${r.moved} employee(s) updated`) }}>Rename</button>}
                                        {!ro && <button className="text-[12px] font-semibold text-red-600" onClick={() => confirm(`Remove "${m.name}" from the list? Employees keep their designation.`) && run({ action: "deleteDesignation", name: m.name }, () => "Removed from the list")}>Remove</button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody></table>
                    </div>
                </div>
            </div>
        </div>
    )
}

function DepartmentsTab({ d, ro, busy, run }: { d: Data; ro: boolean; busy: boolean; run: (b: unknown, ok: (r: any) => string) => void }) {
    const [name, setName] = useState("")
    const [deptId, setDeptId] = useState("")
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [onlyBlank, setOnlyBlank] = useState(true)
    return (
        <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white border border-[var(--border)] rounded-[12px]">
                <div className="p-3 border-b border-[var(--border)] space-y-2">
                    <p className="text-[13px] font-semibold">Departments ({d.departments.length})</p>
                    {!ro && <div className="flex gap-2"><input value={name} onChange={e => setName(e.target.value)} placeholder="New department" className={`${box} flex-1`} /><button className={btn} disabled={busy || !name.trim()} onClick={() => { run({ action: "addDepartment", name }, () => "Department added"); setName("") }}><Plus size={14} /></button></div>}
                </div>
                <table className="w-full"><thead><tr><th className={th}>Department</th><th className={`${th} !text-right`}>Active emp.</th><th className={th}></th></tr></thead><tbody>
                    {d.departments.map(x => (
                        <tr key={x.id} className={x.isActive ? "" : "opacity-50"}>
                            <td className={td}><b>{x.name}</b>{!x.isActive && <span className="ml-1 text-[11px]">(inactive)</span>}</td>
                            <td className={`${td} text-right tabular-nums`}>{x.employees}</td>
                            <td className={`${td} text-right whitespace-nowrap`}>
                                {!ro && <button className="text-[12px] font-semibold text-[var(--accent)] mr-2" onClick={() => { const n = prompt("Rename department", x.name); if (n && n.trim() && n.trim() !== x.name) run({ action: "updateDepartment", id: x.id, name: n.trim() }, () => "Renamed") }}>Rename</button>}
                                {!ro && <button className="text-[12px] font-semibold text-[var(--text3)]" onClick={() => run({ action: "updateDepartment", id: x.id, isActive: !x.isActive }, () => x.isActive ? "Deactivated" : "Activated")}>{x.isActive ? "Deactivate" : "Activate"}</button>}
                            </td>
                        </tr>
                    ))}
                    <tr><td className={`${td} text-amber-700`}>No department</td><td className={`${td} text-right tabular-nums font-semibold text-amber-700`}>{d.noDepartment}</td><td className={td}></td></tr>
                </tbody></table>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px]">
                <div className="p-3 border-b border-[var(--border)] space-y-2">
                    <p className="text-[13px] font-semibold">Assign a department by designation</p>
                    <p className="text-[11.5px] text-[var(--text3)]">Tick designations, pick the department, assign. Tip: merge designation spellings first.</p>
                    {!ro && (
                        <div className="flex flex-wrap gap-2 items-center">
                            <select value={deptId} onChange={e => setDeptId(e.target.value)} className={`${box} flex-1 min-w-[160px]`} aria-label="Department"><option value="">Pick department…</option>{d.departments.filter(x => x.isActive).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                            <label className="text-[12px] inline-flex items-center gap-1.5"><input type="checkbox" checked={onlyBlank} onChange={e => setOnlyBlank(e.target.checked)} /> only those without one</label>
                            <button className={btn} disabled={busy || !deptId || !picked.size} onClick={() => { run({ action: "assignDepartment", departmentId: deptId, designations: Array.from(picked), onlyBlank }, r => `Department set for ${r.updated} employee(s)`); setPicked(new Set()) }}>Assign ({picked.size})</button>
                        </div>
                    )}
                </div>
                <div className="max-h-[520px] overflow-y-auto">
                    <table className="w-full"><tbody>
                        {d.raw.map(r => (
                            <tr key={r.value}>
                                {!ro && <td className={`${td} w-8`}><input type="checkbox" aria-label={`Tick ${r.value}`} checked={picked.has(r.value)} onChange={() => setPicked(p => { const n = new Set(p); n.has(r.value) ? n.delete(r.value) : n.add(r.value); return n })} /></td>}
                                <td className={td}>{r.value}</td><td className={`${td} text-right tabular-nums`}>{r.count}</td>
                            </tr>
                        ))}
                    </tbody></table>
                </div>
            </div>
        </div>
    )
}
