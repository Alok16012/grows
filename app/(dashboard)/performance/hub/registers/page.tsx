"use client"
// My registers — the logs my register-sourced KPIs are calculated from.
// One tab per register; pick a date, add an entry, see the week's entries.
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { addDays, endOfWeek, format, startOfWeek } from "date-fns"
import { Database, Loader2, Pencil, Trash2, Plus, Save, X, ChevronLeft, ChevronRight } from "lucide-react"
import { fetchAllEmployees } from "@/lib/fetch-all-employees"
import { HubShell, useHubPerms } from "../_components/HubNav"
import {
    api, useHub, Card, CardHead, Loading, Empty, Label, inputCls, filterCls, fullName, qs, isoDay, fmtNum,
    FREQ_LABEL, btnPrimary, btnGhost, btnIcon, thCls, tdCls,
    type Register, type RegisterEntry, type RegisterField, type EmpLite,
} from "../_components/shared"

type Values = Record<string, unknown>

export default function MyRegistersPage() {
    const { status, canView } = useHubPerms()
    const { missing, fail } = useHub()
    const [registers, setRegisters] = useState<Register[]>([])
    const [loading, setLoading] = useState(true)
    const [activeId, setActiveId] = useState<string>("")
    const [date, setDate] = useState(isoDay(new Date()))
    const [employees, setEmployees] = useState<EmpLite[]>([])
    const [employeeId, setEmployeeId] = useState("")

    useEffect(() => {
        if (status !== "authenticated") return
        ; (async () => {
            setLoading(true)
            try {
                const mine = (await api<{ registers: Register[] }>("/my-registers")).registers ?? []
                let list = mine
                if (canView) {
                    // Managers also see every active register, to check their team's logs.
                    const all = (await api<{ registers: Register[] }>("/registers").catch(() => ({ registers: [] as Register[] }))).registers ?? []
                    const ids = new Set(mine.map(r => r.id))
                    list = [...mine, ...all.filter(r => r.isActive && !ids.has(r.id))]
                }
                setRegisters(list)
                setActiveId(id => id || list[0]?.id || "")
            } catch (e) { fail(e, "Could not load registers") }
            finally { setLoading(false) }
        })()
    }, [status, canView, fail])

    useEffect(() => {
        if (!canView) return
        fetchAllEmployees<EmpLite & { status?: string }>()
            .then(r => setEmployees(r.employees.filter(e => !e.status || e.status === "ACTIVE")))
            .catch(() => { })
    }, [canView])

    const reg = registers.find(r => r.id === activeId) ?? null

    return (
        <HubShell title="Registers" subtitle="Log your work here — KPIs marked AUTO in your reports are calculated from these entries." missing={missing}>
            {loading ? <Card><Loading /></Card> : registers.length === 0 ? (
                <Card><Empty icon={<Database size={40} />} title="No registers to fill" sub="None of the KPIs in your template are calculated from a register." /></Card>
            ) : (<>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <div className="z-tabs-wrap"><div className="z-tabs" role="tablist">
                        {registers.map(r => (
                            <button key={r.id} role="tab" aria-selected={r.id === activeId} className={`z-tab ${r.id === activeId ? "is-active" : ""}`} onClick={() => setActiveId(r.id)}>
                                {r.name}
                            </button>
                        ))}
                    </div></div>
                    <div className="flex-1" />
                    {canView && (
                        <select className={filterCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)} aria-label="Employee">
                            <option value="">My entries</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{fullName(e)} ({e.employeeId})</option>)}
                        </select>
                    )}
                </div>
                {reg && <RegisterPanel key={reg.id + employeeId} reg={reg} date={date} setDate={setDate} employeeId={employeeId} fail={fail} />}
            </>)}
        </HubShell>
    )
}

function emptyValues(fields: RegisterField[]): Values {
    const v: Values = {}
    for (const f of fields) v[f.key] = f.type === "yesno" ? "" : ""
    return v
}

function RegisterPanel({ reg, date, setDate, employeeId, fail }: {
    reg: Register; date: string; setDate: (d: string) => void; employeeId: string; fail: (e: unknown, f?: string) => void
}) {
    const [entries, setEntries] = useState<RegisterEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [values, setValues] = useState<Values>(() => emptyValues(reg.fields))
    const [editingId, setEditingId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const day = useMemo(() => new Date(date + "T00:00:00"), [date])
    const from = isoDay(startOfWeek(day, { weekStartsOn: 1 }))
    const to = isoDay(endOfWeek(day, { weekStartsOn: 1 }))

    const load = useCallback(async () => {
        setLoading(true)
        try { setEntries((await api<{ entries: RegisterEntry[] }>(`/registers/${reg.id}/entries${qs({ employeeId, from, to })}`)).entries ?? []) }
        catch (e) { fail(e, "Could not load entries") }
        finally { setLoading(false) }
    }, [reg.id, employeeId, from, to, fail])

    useEffect(() => { load() }, [load])

    function reset() { setValues(emptyValues(reg.fields)); setEditingId(null) }

    function startEdit(en: RegisterEntry) {
        const v = emptyValues(reg.fields)
        for (const f of reg.fields) {
            const raw = en.values?.[f.key]
            v[f.key] = raw === null || raw === undefined ? "" : f.type === "yesno" ? (raw === true || raw === 1 || raw === "true" ? "yes" : "no") : String(raw)
        }
        setValues(v)
        setEditingId(en.id)
        setDate(isoDay(en.date))
    }

    async function save() {
        const out: Values = {}
        for (const f of reg.fields) {
            const raw = values[f.key]
            const empty = raw === "" || raw === null || raw === undefined
            if (f.required && empty) { toast.error(`${f.label} is required`); return }
            if (empty) { out[f.key] = null; continue }
            if (f.type === "number") {
                const n = Number(raw)
                if (isNaN(n)) { toast.error(`${f.label} must be a number`); return }
                out[f.key] = n
            } else if (f.type === "yesno") out[f.key] = raw === "yes"
            else out[f.key] = String(raw)
        }
        setSaving(true)
        try {
            if (editingId) await api(`/registers/${reg.id}/entries/${editingId}`, { method: "PUT", body: { date, values: out } })
            else await api(`/registers/${reg.id}/entries`, { method: "POST", body: { date, values: out, ...(employeeId ? { employeeId } : {}) } })
            toast.success(editingId ? "Entry updated" : "Entry added")
            reset()
            load()
        } catch (e) { fail(e) } finally { setSaving(false) }
    }

    async function remove(en: RegisterEntry) {
        if (!confirm("Delete this entry?")) return
        try { await api(`/registers/${reg.id}/entries/${en.id}`, { method: "DELETE" }); toast.success("Entry deleted"); if (editingId === en.id) reset(); load() }
        catch (e) { fail(e) }
    }

    const multi = new Set(entries.map(e => e.employee?.id)).size > 1
    const shift = (days: number) => setDate(isoDay(addDays(day, days)))
    const show = (f: RegisterField, v: unknown) => {
        if (v === null || v === undefined || v === "") return <span className="text-[var(--text3)]">—</span>
        if (f.type === "yesno") return v === true || v === 1 || v === "true" ? "Yes" : "No"
        if (f.type === "number") return <span className="font-mono">{fmtNum(Number(v))}</span>
        return String(v)
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
            <Card>
                <CardHead title={editingId ? "Edit entry" : "New entry"} sub={<span>{reg.code} · {FREQ_LABEL[reg.frequency]}</span>}
                    right={editingId ? <button className={btnIcon} onClick={reset} aria-label="Cancel edit"><X size={14} /></button> : undefined} />
                <div className="p-4 space-y-3">
                    {reg.description && <p className="text-[12px] text-[var(--text3)] -mt-1">{reg.description}</p>}
                    <div>
                        <Label>Date</Label>
                        <input type="date" className={inputCls("font-mono")} value={date} max={isoDay(new Date())} onChange={e => e.target.value && setDate(e.target.value)} />
                    </div>
                    {reg.fields.map(f => (
                        <div key={f.key}>
                            <Label>{f.label}{f.required ? " *" : ""}</Label>
                            <FieldInput field={f} value={values[f.key]} onChange={v => setValues(p => ({ ...p, [f.key]: v }))} />
                        </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                        {editingId && <button className={btnGhost} onClick={reset}>Cancel</button>}
                        <button className={`${btnPrimary} flex-1`} onClick={save} disabled={saving}>
                            {saving ? <Loader2 size={14} className="animate-spin" /> : editingId ? <Save size={14} /> : <Plus size={14} />} {editingId ? "Update entry" : "Add entry"}
                        </button>
                    </div>
                </div>
            </Card>

            <Card>
                <CardHead
                    title={`Week of ${format(new Date(from + "T00:00:00"), "dd MMM")} – ${format(new Date(to + "T00:00:00"), "dd MMM yyyy")}`}
                    sub={`${entries.length} entr${entries.length === 1 ? "y" : "ies"} · entries can be changed only for a short time after the day`}
                    right={<>
                        <button className={btnIcon} onClick={() => shift(-7)} aria-label="Previous week"><ChevronLeft size={15} /></button>
                        <button className={btnIcon} onClick={() => shift(7)} aria-label="Next week"><ChevronRight size={15} /></button>
                    </>}
                />
                {loading ? <Loading /> : entries.length === 0 ? (
                    <Empty icon={<Database size={36} />} title="No entries this week" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead><tr>
                                <th className={thCls}>Date</th>
                                {multi && <th className={thCls}>Employee</th>}
                                {reg.fields.map(f => <th key={f.key} className={`${thCls} ${f.type === "number" ? "text-right" : ""}`}>{f.label}</th>)}
                                <th className={`${thCls} w-[70px]`} />
                            </tr></thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {[...entries].sort((a, b) => b.date.localeCompare(a.date)).map(en => (
                                    <tr key={en.id} className={editingId === en.id ? "bg-[var(--accent-light)]/60" : "hover:bg-[var(--surface2)]/60"}>
                                        <td className={`${tdCls} font-mono text-[12px] whitespace-nowrap`}>{format(new Date(en.date), "EEE dd MMM")}</td>
                                        {multi && <td className={tdCls}>{fullName(en.employee)}</td>}
                                        {reg.fields.map(f => <td key={f.key} className={`${tdCls} ${f.type === "number" ? "text-right" : ""}`}>{show(f, en.values?.[f.key])}</td>)}
                                        <td className={`${tdCls} text-right whitespace-nowrap`}>
                                            <button className={btnIcon} onClick={() => startEdit(en)} aria-label="Edit entry"><Pencil size={13} /></button>
                                            <button className={`${btnIcon} hover:!text-red-600`} onClick={() => remove(en)} aria-label="Delete entry"><Trash2 size={13} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    )
}

function FieldInput({ field, value, onChange }: { field: RegisterField; value: unknown; onChange: (v: string) => void }) {
    const v = value === null || value === undefined ? "" : String(value)
    switch (field.type) {
        case "number":
            return <input className={inputCls("font-mono")} inputMode="decimal" value={v} onChange={e => onChange(e.target.value)} />
        case "date":
            return <input type="date" className={inputCls("font-mono")} value={v} onChange={e => onChange(e.target.value)} />
        case "select":
            return (
                <select className={inputCls()} value={v} onChange={e => onChange(e.target.value)}>
                    <option value="">Select…</option>
                    {(field.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            )
        case "yesno":
            return (
                <div className="z-tabs-wrap"><div className="z-tabs z-tabs--inset">
                    <button type="button" className={`z-tab ${v === "yes" ? "is-active" : ""}`} onClick={() => onChange(v === "yes" ? "" : "yes")}>Yes</button>
                    <button type="button" className={`z-tab ${v === "no" ? "is-active" : ""}`} onClick={() => onChange(v === "no" ? "" : "no")}>No</button>
                </div></div>
            )
        default:
            return <input className={inputCls()} value={v} onChange={e => onChange(e.target.value)} />
    }
}
