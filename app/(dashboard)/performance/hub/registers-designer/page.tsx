"use client"
// Register Designer — the daily/weekly logs employees fill in, from which
// register-sourced KPIs are calculated.
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Loader2, TableProperties, ArrowUp, ArrowDown, X, Power } from "lucide-react"
import { HubShell, useHubPerms } from "../_components/HubNav"
import {
    api, useHub, Card, Loading, Empty, Pill, Drawer, Label, inputCls, slugKey,
    FREQ_LABEL, btnPrimary, btnGhost, btnSmall, btnIcon, thCls, tdCls,
    type Register, type RegisterField, type Frequency, type Fail,
} from "../_components/shared"

const FIELD_TYPES: { key: RegisterField["type"]; label: string }[] = [
    { key: "number", label: "Number" }, { key: "text", label: "Text" }, { key: "date", label: "Date" },
    { key: "select", label: "Dropdown" }, { key: "yesno", label: "Yes / No" },
]

export default function RegisterDesignerPage() {
    const { status, canManage } = useHubPerms()
    const { missing, fail } = useHub()
    const [rows, setRows] = useState<Register[]>([])
    const [loading, setLoading] = useState(true)
    const [editing, setEditing] = useState<Register | "new" | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try { setRows((await api<{ registers: Register[] }>("/registers")).registers ?? []) }
        catch (e) { fail(e, "Could not load registers") }
        finally { setLoading(false) }
    }, [fail])

    useEffect(() => { if (status === "authenticated") load() }, [status, load])

    async function toggle(r: Register) {
        try {
            await api(`/registers/${r.id}`, { method: "PUT", body: { isActive: !r.isActive } })
            toast.success(r.isActive ? "Register deactivated" : "Register activated")
            load()
        } catch (e) { fail(e) }
    }

    async function remove(r: Register) {
        if (!confirm(`Delete register "${r.name}"?`)) return
        try { await api(`/registers/${r.id}`, { method: "DELETE" }); toast.success("Register deleted"); load() } catch (e) { fail(e) }
    }

    if (status === "authenticated" && !canManage) {
        return <HubShell title="Register Designer" missing={missing}><Card><Empty icon={<TableProperties size={40} />} title="You don't have access to the Register Designer" /></Card></HubShell>
    }

    return (
        <HubShell
            title="Register Designer"
            subtitle="Registers are simple logs (visits, complaints, trainings…) that KPIs can be calculated from."
            missing={missing}
            actions={<button className={btnPrimary} onClick={() => setEditing("new")}><Plus size={15} /> New register</button>}
        >
            <Card>
                {loading ? <Loading /> : rows.length === 0 ? (
                    <Empty icon={<TableProperties size={40} />} title="No registers yet" sub="Create a register, then point a KPI at it with “Calculate from a register”."
                        action={<button className={btnPrimary} onClick={() => setEditing("new")}><Plus size={15} /> New register</button>} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead><tr>
                                <th className={thCls}>Register</th><th className={thCls}>Code</th><th className={thCls}>Frequency</th>
                                <th className={thCls}>Fields</th><th className={`${thCls} text-right`}>Entries</th><th className={thCls}>Status</th>
                                <th className={`${thCls} text-right`}>Actions</th>
                            </tr></thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {rows.map(r => (
                                    <tr key={r.id} className={`hover:bg-[var(--surface2)]/60 ${r.isActive ? "" : "opacity-60"}`}>
                                        <td className={tdCls}>
                                            <p className="font-semibold text-[var(--text)]">{r.name}</p>
                                            {r.description && <p className="text-[11.5px] text-[var(--text3)] line-clamp-1">{r.description}</p>}
                                        </td>
                                        <td className={`${tdCls} font-mono text-[12px]`}>{r.code}</td>
                                        <td className={tdCls}>{FREQ_LABEL[r.frequency]}</td>
                                        <td className={`${tdCls} text-[12px] text-[var(--text2)]`}>
                                            <span className="line-clamp-1">{r.fields.map(f => f.label).join(", ") || "—"}</span>
                                        </td>
                                        <td className={`${tdCls} text-right font-mono`}>{r.entryCount}</td>
                                        <td className={tdCls}>
                                            <Pill tone={r.isActive ? { label: "Active", bg: "#dcfce7", color: "#15803d" } : { label: "Inactive", bg: "#f3f4f6", color: "#6b7280" }} />
                                        </td>
                                        <td className={`${tdCls} text-right`}>
                                            <div className="inline-flex gap-1.5">
                                                <button className={btnSmall} onClick={() => setEditing(r)}><Pencil size={12} /> Edit</button>
                                                <button className={btnSmall} onClick={() => toggle(r)}><Power size={12} /> {r.isActive ? "Deactivate" : "Activate"}</button>
                                                {r.entryCount === 0 && <button className={`${btnSmall} hover:!text-red-600 hover:!border-red-300`} onClick={() => remove(r)}><Trash2 size={12} /></button>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {editing && <RegisterDrawer reg={editing === "new" ? null : editing} fail={fail} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
        </HubShell>
    )
}

type FieldDraft = RegisterField & { _id: string; _keyTouched: boolean; _optionsText: string }

function RegisterDrawer({ reg, onClose, onSaved, fail }: { reg: Register | null; onClose: () => void; onSaved: () => void; fail: Fail }) {
    const [name, setName] = useState(reg?.name ?? "")
    const [code, setCode] = useState(reg?.code ?? "")
    const [frequency, setFrequency] = useState<Frequency>(reg?.frequency ?? "DAILY")
    const [description, setDescription] = useState(reg?.description ?? "")
    const [fields, setFields] = useState<FieldDraft[]>(() => (reg?.fields ?? []).map((f, i) => ({
        ...f, _id: `${i}-${f.key}`, _keyTouched: true, _optionsText: (f.options ?? []).join(", "),
    })))
    const [saving, setSaving] = useState(false)
    const hasEntries = (reg?.entryCount ?? 0) > 0

    const upd = (id: string, patch: Partial<FieldDraft>) => setFields(fs => fs.map(f => f._id === id ? { ...f, ...patch } : f))
    const move = (i: number, d: -1 | 1) => setFields(fs => {
        const j = i + d; if (j < 0 || j >= fs.length) return fs
        const c = [...fs];[c[i], c[j]] = [c[j], c[i]]; return c
    })
    const add = () => setFields(fs => [...fs, { _id: `${Date.now()}`, key: "", label: "", type: "number", required: false, _keyTouched: false, _optionsText: "" }])

    async function save() {
        if (!name.trim()) { toast.error("Register name is required"); return }
        if (!code.trim()) { toast.error("Code is required"); return }
        if (fields.length === 0) { toast.error("Add at least one field"); return }
        const out: RegisterField[] = []
        const seen = new Set<string>()
        for (const f of fields) {
            const key = f.key || slugKey(f.label)
            if (!f.label.trim() || !key) { toast.error("Every field needs a label"); return }
            if (seen.has(key)) { toast.error(`Duplicate field key "${key}"`); return }
            seen.add(key)
            const options = f.type === "select" ? f._optionsText.split(",").map(s => s.trim()).filter(Boolean) : undefined
            if (f.type === "select" && (!options || options.length === 0)) { toast.error(`Add options for "${f.label}"`); return }
            out.push({ key, label: f.label.trim(), type: f.type, ...(options ? { options } : {}), required: !!f.required })
        }
        setSaving(true)
        try {
            const body = { name: name.trim(), code: code.trim().toUpperCase(), frequency, description: description.trim() || null, fields: out }
            if (reg) await api(`/registers/${reg.id}`, { method: "PUT", body })
            else await api("/registers", { method: "POST", body })
            toast.success(reg ? "Register updated" : "Register created")
            onSaved()
        } catch (e) { fail(e) } finally { setSaving(false) }
    }

    return (
        <Drawer width="max-w-2xl" onClose={onClose}
            header={<><h2 className="text-[16px] font-semibold text-[var(--text)]">{reg ? "Edit register" : "New register"}</h2>
                <p className="text-[12px] text-[var(--text3)]">Employees fill one entry per {frequency === "DAILY" ? "day" : frequency === "WEEKLY" ? "week" : "month"} or as often as they need.</p></>}
            footer={<div className="flex justify-end gap-2">
                <button className={btnGhost} onClick={onClose}>Cancel</button>
                <button className={btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Save register</button>
            </div>}>
            <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px] gap-3">
                    <div><Label>Name *</Label><input className={inputCls()} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Site visit log" autoFocus /></div>
                    <div><Label>Code *</Label><input className={inputCls("font-mono uppercase")} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="SITE-VISIT" /></div>
                    <div><Label>Frequency</Label>
                        <select className={inputCls()} value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}>
                            <option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
                        </select>
                    </div>
                </div>
                <div><Label>Description</Label><textarea className={inputCls("min-h-[64px]")} value={description} onChange={e => setDescription(e.target.value)} placeholder="What goes in this register" /></div>

                <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.5px] text-[var(--text3)]">Fields</p>
                        <button className={btnSmall} onClick={add}><Plus size={12} /> Add field</button>
                    </div>
                    {hasEntries && <p className="text-[11.5px] text-[var(--amber)] mb-2">This register already has entries — renaming a field key will hide old values for it.</p>}
                    {fields.length === 0 && <p className="text-[12.5px] text-[var(--text3)] py-4 text-center border border-dashed border-[var(--border2)] rounded-xl">No fields yet.</p>}
                    <div className="space-y-2">
                        {fields.map((f, i) => (
                            <div key={f._id} className="rounded-xl border border-[var(--border)] bg-[var(--surface2)]/50 p-3">
                                <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_130px_auto] gap-2 items-end">
                                    <div>
                                        <Label>Label</Label>
                                        <input className={inputCls("!bg-white")} value={f.label} placeholder="e.g. Guards present"
                                            onChange={e => upd(f._id, { label: e.target.value, ...(f._keyTouched ? {} : { key: slugKey(e.target.value) }) })} />
                                    </div>
                                    <div>
                                        <Label>Key</Label>
                                        <input className={inputCls("!bg-white font-mono text-[12px]")} value={f.key}
                                            onChange={e => upd(f._id, { key: slugKey(e.target.value), _keyTouched: true })} />
                                    </div>
                                    <div>
                                        <Label>Type</Label>
                                        <select className={inputCls("!bg-white")} value={f.type} onChange={e => upd(f._id, { type: e.target.value as RegisterField["type"] })}>
                                            {FIELD_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-0.5 pb-1">
                                        <button className={btnIcon} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                                        <button className={btnIcon} aria-label="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                                        <button className={`${btnIcon} hover:!text-red-600`} aria-label="Remove field" onClick={() => setFields(fs => fs.filter(x => x._id !== f._id))}><X size={14} /></button>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-4 mt-2">
                                    <label className="flex items-center gap-1.5 text-[12px] text-[var(--text2)] cursor-pointer">
                                        <input type="checkbox" className="accent-[var(--accent)]" checked={!!f.required} onChange={e => upd(f._id, { required: e.target.checked })} /> Required
                                    </label>
                                    {f.type === "select" && (
                                        <input className={inputCls("!bg-white flex-1 min-w-[200px]")} value={f._optionsText} placeholder="Options, comma separated"
                                            onChange={e => upd(f._id, { _optionsText: e.target.value })} />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Drawer>
    )
}
