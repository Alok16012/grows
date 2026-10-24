"use client"
// People & Roles — which KRA/KPI template and reviewer each employee has.
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Search, UserCog, Target, UserCheck, Loader2, X } from "lucide-react"
import { HubShell, useHubPerms } from "../_components/HubNav"
import {
    api, useHub, Card, Loading, Empty, Modal, Label, inputCls, fullName, fmtDate, qs,
    btnPrimary, btnGhost, btnSmall, thCls, tdCls,
    type EmpLite, type TemplateSummary, type Fail,
} from "../_components/shared"

type Row = {
    employee: EmpLite
    assignment: { templateFamilyId: string; templateName: string; reviewer: { id: string; name: string } | null; effectiveFrom: string | null } | null
}
type UserOpt = { id: string; name: string | null; employeeId?: string | null; designation?: string | null }

export default function PeoplePage() {
    const { status, canManage } = useHubPerms()
    const { missing, fail } = useHub()
    const [rows, setRows] = useState<Row[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [q, setQ] = useState("")
    const [filter, setFilter] = useState<"all" | "unassigned" | "noreviewer">("all")
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [modal, setModal] = useState<"template" | "reviewer" | null>(null)

    useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t) }, [search])

    const load = useCallback(async () => {
        setLoading(true)
        try { setRows((await api<{ rows: Row[] }>(`/assignments${qs({ search: q })}`)).rows ?? []) }
        catch (e) { fail(e, "Could not load people") }
        finally { setLoading(false) }
    }, [q, fail])

    useEffect(() => { if (status === "authenticated") load() }, [status, load])

    const shown = useMemo(() => rows.filter(r =>
        filter === "unassigned" ? !r.assignment : filter === "noreviewer" ? !r.assignment?.reviewer : true), [rows, filter])
    const allPicked = shown.length > 0 && shown.every(r => picked.has(r.employee.id))
    const togglePick = (id: string) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
    const toggleAll = () => setPicked(p => {
        const n = new Set(p)
        if (allPicked) shown.forEach(r => n.delete(r.employee.id)); else shown.forEach(r => n.add(r.employee.id))
        return n
    })

    if (status === "authenticated" && !canManage) {
        return <HubShell title="People & Roles" missing={missing}><Card><Empty icon={<UserCog size={40} />} title="You don't have access to People & Roles" /></Card></HubShell>
    }

    const unassigned = rows.filter(r => !r.assignment).length

    return (
        <HubShell title="People & Roles" subtitle="Assign a KRA/KPI template and a reviewer to each employee." missing={missing}>
            <Card>
                <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                        <input className={inputCls("!pl-8")} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, code, designation…" />
                    </div>
                    <div className="z-tabs-wrap"><div className="z-tabs z-tabs--inset">
                        <button className={`z-tab ${filter === "all" ? "is-active" : ""}`} onClick={() => setFilter("all")}>All <span className="font-mono">{rows.length}</span></button>
                        <button className={`z-tab ${filter === "unassigned" ? "is-active" : ""}`} onClick={() => setFilter("unassigned")}>No template <span className="font-mono">{unassigned}</span></button>
                        <button className={`z-tab ${filter === "noreviewer" ? "is-active" : ""}`} onClick={() => setFilter("noreviewer")}>No reviewer</button>
                    </div></div>
                    <div className="flex-1" />
                    {picked.size > 0 && <span className="text-[12px] text-[var(--text2)]"><b className="font-mono">{picked.size}</b> selected <button className="ml-1 text-[var(--text3)] hover:text-[var(--text)] align-middle" onClick={() => setPicked(new Set())} aria-label="Clear selection"><X size={12} /></button></span>}
                    <button className={btnSmall} disabled={picked.size === 0} onClick={() => setModal("template")}><Target size={12} /> Assign template</button>
                    <button className={btnSmall} disabled={picked.size === 0} onClick={() => setModal("reviewer")}><UserCheck size={12} /> Set reviewer</button>
                </div>
                {loading ? <Loading /> : shown.length === 0 ? (
                    <Empty icon={<UserCog size={40} />} title="No employees match" />
                ) : (
                    <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                        <table className="w-full text-[13px]">
                            <thead className="sticky top-0 z-[1]"><tr>
                                <th className={`${thCls} w-10`}><input type="checkbox" className="accent-[var(--accent)]" checked={allPicked} onChange={toggleAll} aria-label="Select all" /></th>
                                <th className={thCls}>Employee</th><th className={thCls}>Template</th><th className={thCls}>Reviewer</th><th className={thCls}>Since</th>
                            </tr></thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {shown.map(r => (
                                    <tr key={r.employee.id} className={`cursor-pointer ${picked.has(r.employee.id) ? "bg-[var(--accent-light)]/60" : "hover:bg-[var(--surface2)]/60"}`} onClick={() => togglePick(r.employee.id)}>
                                        <td className={tdCls} onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" className="accent-[var(--accent)]" checked={picked.has(r.employee.id)} onChange={() => togglePick(r.employee.id)} aria-label={`Select ${fullName(r.employee)}`} />
                                        </td>
                                        <td className={tdCls}>
                                            <p className="font-semibold text-[var(--text)]">{fullName(r.employee)}</p>
                                            <p className="text-[11.5px] text-[var(--text3)]"><span className="font-mono">{r.employee.employeeId}</span>{r.employee.designation ? ` · ${r.employee.designation}` : ""}</p>
                                        </td>
                                        <td className={tdCls}>{r.assignment ? <span className="text-[var(--text)]">{r.assignment.templateName}</span> : <span className="text-[var(--amber)] text-[12px] font-medium">Not assigned</span>}</td>
                                        <td className={tdCls}>{r.assignment?.reviewer?.name ?? <span className="text-[var(--text3)]">—</span>}</td>
                                        <td className={`${tdCls} text-[12px] text-[var(--text2)]`}>{fmtDate(r.assignment?.effectiveFrom)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {modal && (
                <AssignModal mode={modal} employeeIds={Array.from(picked)} fail={fail}
                    onClose={() => setModal(null)} onDone={() => { setModal(null); setPicked(new Set()); load() }} />
            )}
        </HubShell>
    )
}

function AssignModal({ mode, employeeIds, onClose, onDone, fail }: {
    mode: "template" | "reviewer"; employeeIds: string[]; onClose: () => void; onDone: () => void; fail: Fail
}) {
    const [families, setFamilies] = useState<TemplateSummary[]>([])
    const [users, setUsers] = useState<UserOpt[]>([])
    const [value, setValue] = useState("")
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (mode === "template") {
            api<{ templates: TemplateSummary[] }>("/templates").then(d => {
                // One option per family: its latest published version.
                const best = new Map<string, TemplateSummary>()
                for (const t of d.templates ?? []) {
                    if (t.status !== "PUBLISHED") continue
                    const cur = best.get(t.familyId)
                    if (!cur || t.version > cur.version) best.set(t.familyId, t)
                }
                setFamilies(Array.from(best.values()).sort((a, b) => a.name.localeCompare(b.name)))
            }).catch(e => fail(e))
        } else {
            api<{ users: UserOpt[] }>("/reviewers")
                .then(d => setUsers(d.users ?? []))
                .catch(e => fail(e, "Could not load reviewers"))
        }
    }, [mode, fail])

    async function save() {
        setSaving(true)
        try {
            // Send only the field being changed so the other one is left as is.
            const body = mode === "template"
                ? { employeeIds, templateFamilyId: value || null }
                : { employeeIds, reviewerUserId: value || null }
            await api("/assignments", { method: "PUT", body })
            toast.success(mode === "template" ? "Template assigned" : "Reviewer set")
            onDone()
        } catch (e) { fail(e) } finally { setSaving(false) }
    }

    return (
        <Modal title={mode === "template" ? "Assign template" : "Set reviewer"}
            subtitle={`${employeeIds.length} employee${employeeIds.length === 1 ? "" : "s"} selected`} onClose={onClose}
            footer={<>
                <button className={btnGhost} onClick={onClose}>Cancel</button>
                <button className={btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} {value ? "Apply" : mode === "template" ? "Remove template" : "Clear reviewer"}</button>
            </>}>
            <div className="p-5">
                {mode === "template" ? (<>
                    <Label hint="Only published templates can be assigned. New reports use the latest published version.">Template</Label>
                    <select className={inputCls()} value={value} onChange={e => setValue(e.target.value)}>
                        <option value="">— No template —</option>
                        {families.map(t => <option key={t.familyId} value={t.familyId}>{t.name}{t.roleLabel ? ` · ${t.roleLabel}` : ""} (v{t.version})</option>)}
                    </select>
                </>) : (<>
                    <Label hint="Approves their daily, weekly and monthly reports">Reviewer</Label>
                    <select className={inputCls()} value={value} onChange={e => setValue(e.target.value)}>
                        <option value="">— No reviewer —</option>
                        {users.map(u => <option key={u.id} value={u.id}>{[u.name || u.id, u.designation, u.employeeId].filter(Boolean).join(" · ")}</option>)}
                    </select>
                </>)}
            </div>
        </Modal>
    )
}
