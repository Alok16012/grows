"use client"
// Role editor — full page so the permission matrix fits. /admin/roles/new
// creates (?from=<id> copies a role), /admin/roles/<id> edits. Admin is shown
// read-only: it holds everything and cannot be changed.

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, Lock, Loader2 } from "lucide-react"
import {
    MODULES, ACTIONS, ACTION_LABELS, SPECIAL_ACTIONS, SENSITIVE_FIELDS, SCOPES, SCOPE_INFO,
    modulePermission, normalizePermissions, toCataloguePermissions, isCataloguePermission,
    type Action, type DataScope,
} from "@/lib/permission-catalogue"
import {
    api, ApiError, Loading, Modal, Label, inputCls, btnPrimary, btnGhost,
    PageHead, NoAccess, type RoleCard,
} from "../../_access/ui"

const COLORS = ["#6366f1", "#3b82f6", "#0ea5e9", "#06b6d4", "#10b981", "#22c55e", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#64748b"]

type Form = { name: string; description: string; color: string; scope: DataScope | null; permissions: string[]; isActive: boolean }
const EMPTY: Form = { name: "", description: "", color: COLORS[0], scope: null, permissions: ["self.view"], isActive: true }

export default function RoleEditorPage() {
    const { id } = useParams<{ id: string }>()
    const search = useSearchParams()
    const router = useRouter()
    const isNew = id === "new"

    const [role, setRole] = useState<RoleCard | null>(null)
    const [editable, setEditable] = useState(isNew)
    const [form, setForm] = useState<Form | null>(isNew && !search.get("from") ? EMPTY : null)
    const [initial, setInitial] = useState<Form | null>(isNew && !search.get("from") ? EMPTY : null)
    const [held, setHeld] = useState<Set<string> | null>(null)
    const [isAdmin, setIsAdmin] = useState(false)
    const [forbidden, setForbidden] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [saving, setSaving] = useState(false)

    // What the signed-in user holds: you cannot grant what you don't have.
    useEffect(() => {
        api<{ isAdmin: boolean; permissions: string[] }>("/api/me/permissions").then(me => {
            setIsAdmin(me.isAdmin)
            const s = new Set(toCataloguePermissions(me.permissions))
            for (const p of me.permissions) if (isCataloguePermission(p)) s.add(p)
            setHeld(s)
        }).catch(() => setHeld(new Set()))
    }, [])

    useEffect(() => {
        const from = search.get("from")
        const target = isNew ? from : id
        if (!target) return
        api<{ role: RoleCard; editable: boolean }>(`/api/admin/roles/${target}`).then(d => {
            const f: Form = {
                name: isNew ? `${d.role.name} (copy)` : d.role.name,
                description: d.role.description ?? "",
                color: d.role.color,
                scope: d.role.scope,
                permissions: d.role.permissions,
                isActive: d.role.isActive,
            }
            if (isNew) { setForm(f); setInitial(EMPTY) } else { setRole(d.role); setEditable(d.editable); setForm(f); setInitial(f) }
        }).catch(e => {
            if (e instanceof ApiError && e.status === 403) setForbidden(true)
            else toast.error(e instanceof Error ? e.message : "Couldn't load the role")
        })
    }, [id, isNew, search])

    const dirty = useMemo(() => !!form && !!initial && JSON.stringify(form) !== JSON.stringify(initial), [form, initial])

    // Unsaved changes trigger a leave-page warning.
    useEffect(() => {
        if (!dirty) return
        const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
        window.addEventListener("beforeunload", h)
        return () => window.removeEventListener("beforeunload", h)
    }, [dirty])

    const readOnly = !editable || !!role?.isSystem
    const perms = useMemo(() => new Set(form?.permissions ?? []), [form])
    const canGrant = useCallback((p: string) => isAdmin || !held || held.has(p) || perms.has(p), [isAdmin, held, perms])

    const set = (patch: Partial<Form>) => setForm(f => (f ? { ...f, ...patch } : f))
    const setPerms = (next: Set<string>) => set({ permissions: normalizePermissions(Array.from(next)) })

    function toggleAction(module: string, action: Action, on: boolean) {
        const next = new Set(perms)
        const key = modulePermission(module, action)
        if (on) {
            next.add(key)
        } else {
            next.delete(key)
            // Unticking view clears the whole row.
            if (action === "view") for (const a of ACTIONS) next.delete(modulePermission(module, a))
        }
        setPerms(next)
    }

    function toggleRow(module: string, on: boolean) {
        const m = MODULES.find(x => x.key === module)!
        const next = new Set(perms)
        for (const a of m.actions) {
            const k = modulePermission(module, a)
            if (on) { if (canGrant(k)) next.add(k) } else next.delete(k)
        }
        setPerms(next)
    }

    function toggleKey(key: string, on: boolean) {
        const next = new Set(perms)
        if (on) next.add(key); else next.delete(key)
        setPerms(next)
    }

    const summary = useMemo(() => {
        if (!form || !initial) return null
        const before = new Set(initial.permissions), after = new Set(form.permissions)
        const added = form.permissions.filter(p => !before.has(p) && p !== "self.view")
        const removed = initial.permissions.filter(p => !after.has(p) && p !== "self.view")
        const parts: string[] = []
        if (added.length) parts.push(`+${added.length} permission${added.length === 1 ? "" : "s"}`)
        if (removed.length) parts.push(`−${removed.length} permission${removed.length === 1 ? "" : "s"}`)
        if (!isNew && initial.scope !== form.scope) parts.push(`scope ${initial.scope ? SCOPE_INFO[initial.scope].label : "All (not set)"} → ${form.scope ? SCOPE_INFO[form.scope].label : "—"}`)
        if (initial.name !== form.name && !isNew) parts.push(`renamed to “${form.name}”`)
        if (initial.isActive !== form.isActive) parts.push(form.isActive ? "switched on" : "switched off")
        if (!isNew) parts.push(`affects ${role?.users ?? 0} user${role?.users === 1 ? "" : "s"}`)
        return { added, removed, text: parts.join(", ") || "No permission changes" }
    }, [form, initial, isNew, role])

    function validate(): string | null {
        if (!form) return "Still loading"
        if (!form.name.trim()) return "Role name is required"
        if (!form.description.trim()) return "Description is required"
        if (!form.scope) return "Pick which records this role can see"
        return null
    }

    async function save() {
        if (!form) return
        setSaving(true)
        try {
            const body = { ...form, name: form.name.trim(), description: form.description.trim() }
            if (isNew) {
                const r = await api<{ id: string }>("/api/admin/roles", { body })
                toast.success(`${body.name} created`)
                setInitial(form)
                router.replace(`/admin/roles/${r.id}`)
            } else {
                await api(`/api/admin/roles/${id}`, { method: "PATCH", body })
                toast.success("Role saved. Its users get the change on their next request.")
                setInitial(form)
                setConfirming(false)
                setRole(r => (r ? { ...r, name: form.name, scope: form.scope, permissions: form.permissions } : r))
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't save the role")
        } finally {
            setSaving(false)
        }
    }

    function requestSave() {
        const err = validate()
        if (err) { toast.error(err); return }
        setConfirming(true)
    }

    function leave(e: React.MouseEvent) {
        if (dirty && !window.confirm("Discard your unsaved changes?")) e.preventDefault()
    }

    if (forbidden) return <div className="p-4 lg:p-0"><NoAccess what="Roles" perm="roles.view" /></div>
    if (!form) return <Loading />

    const groups = Array.from(new Set(MODULES.map(m => m.group)))
    const title = isNew ? (search.get("from") ? "Duplicate role" : "Create role") : form.name || role?.name || "Role"

    return (
        <div className="flex flex-col gap-4 p-4 lg:p-0 max-w-[1100px] w-full pb-28">
            <div onClickCapture={e => { if ((e.target as HTMLElement).closest("a")) leave(e) }}>
                <PageHead
                    back={{ href: "/admin/roles", label: "All roles" }}
                    title={title}
                    sub={!isNew && role ? <>
                        {role.permissionCount} permissions · <Link href={`/admin/users?role=${role.id}`} className="text-[var(--accent)] hover:underline">{role.users} user{role.users === 1 ? "" : "s"} have this role</Link>
                    </> : "Set what people with this role can do and which records they see."}
                />
            </div>

            {role?.isSystem && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 flex gap-2.5 text-[13px] text-[var(--text2)]">
                    <Lock size={16} className="shrink-0 mt-0.5" /> Admin is the system role. It keeps every permission, cannot be edited or deleted, and only an Admin can give it to someone.
                </div>
            )}
            {role?.legacy && editable && (
                <div className="rounded-2xl border border-[#f6d9a8] bg-[#fff8ee] px-4 py-3 flex gap-2.5 text-[13px] text-[#7c4a03]">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <span>This role was saved before the permission catalogue. Its old permissions are shown converted below. Check them, <b>pick a data scope</b> and save to switch it over. Until then it keeps working as before.</span>
                </div>
            )}

            {/* Details */}
            <Section title="Details">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label>Role name *</Label>
                        <input className={inputCls("bg-[var(--surface)]")} value={form.name} disabled={readOnly} maxLength={60}
                            onChange={e => set({ name: e.target.value })} placeholder="e.g. Site Supervisor" />
                    </div>
                    <div>
                        <Label>Description *</Label>
                        <input className={inputCls("bg-[var(--surface)]")} value={form.description} disabled={readOnly} maxLength={240}
                            onChange={e => set({ description: e.target.value })} placeholder="What this role is for, in one line" />
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                    <div>
                        <Label>Colour</Label>
                        <div className="flex flex-wrap gap-1.5">
                            {COLORS.map(c => (
                                <button key={c} type="button" disabled={readOnly} onClick={() => set({ color: c })} aria-label={`Colour ${c}`}
                                    className={`h-7 w-7 rounded-full border-2 ${form.color === c ? "border-[var(--text)]" : "border-transparent"}`} style={{ background: c }} />
                            ))}
                        </div>
                    </div>
                    {!isNew && !role?.isSystem && (
                        <label className="flex items-center gap-2 text-[13px] text-[var(--text2)] mt-4">
                            <input type="checkbox" checked={form.isActive} disabled={readOnly} onChange={e => set({ isActive: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
                            Role is on (off = its users keep only self-service)
                        </label>
                    )}
                </div>
            </Section>

            {/* Data scope */}
            <Section title="Which records can they see?" sub="Applies to every list, count, dashboard and export for this role.">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {SCOPES.map(s => (
                        <label key={s} className={`flex gap-2.5 rounded-xl border p-3 cursor-pointer ${form.scope === s ? "border-[var(--accent)] bg-[var(--accent-light)]" : "border-[var(--border)] bg-[var(--surface)]"} ${readOnly ? "cursor-default opacity-90" : ""}`}>
                            <input type="radio" name="scope" checked={form.scope === s} disabled={readOnly} onChange={() => set({ scope: s })} className="mt-0.5 accent-[var(--accent)]" />
                            <span>
                                <span className="block text-[13px] font-semibold text-[var(--text)]">{SCOPE_INFO[s].label}</span>
                                <span className="block text-[11.5px] text-[var(--text2)]">{SCOPE_INFO[s].hint}</span>
                            </span>
                        </label>
                    ))}
                </div>
                <p className="text-[11.5px] text-[var(--text3)] mt-2">Each user&apos;s sites are picked on their user record. <Link href="/admin/users" className="text-[var(--accent)] hover:underline">See the user form</Link>.</p>
            </Section>

            {/* Permission matrix */}
            <Section title="What can they do?" sub="Ticking any action also ticks View. A dash means the action doesn't exist for that module."
                right={!readOnly && <button type="button" className="text-[12px] text-[var(--text2)] border border-[var(--border)] rounded-lg px-2.5 py-1 hover:bg-[var(--surface2)]" onClick={() => setPerms(new Set(["self.view"]))}>Clear all</button>}>
                <div className="overflow-x-auto -mx-4">
                    <table className="w-full min-w-[720px] text-[12.5px]">
                        <thead>
                            <tr className="text-[11px] text-[var(--text3)]">
                                <th className="text-left font-semibold px-4 py-2">Module</th>
                                {ACTIONS.map(a => <th key={a} className="font-semibold px-2 py-2 w-[70px]">{ACTION_LABELS[a]}</th>)}
                                <th className="font-semibold px-2 py-2 w-[60px]">All</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map(g => (
                                <MatrixGroup key={g} group={g} perms={perms} readOnly={readOnly} canGrant={canGrant}
                                    onAction={toggleAction} onRow={toggleRow} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>

            {/* Special actions */}
            <Section title="Special actions" sub="Single actions that need their own switch.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {SPECIAL_ACTIONS.map(s => (
                        <Toggle key={s.key} label={s.label} hint={s.hint} warn={s.warn} checked={perms.has(s.key)}
                            disabled={readOnly || (!perms.has(s.key) && !canGrant(s.key))} onChange={on => toggleKey(s.key, on)} />
                    ))}
                </div>
            </Section>

            {/* Sensitive fields */}
            <section className="rounded-2xl border border-[#f6d9a8] bg-[#fffaf2] p-4">
                <h3 className="text-[14px] font-semibold text-[#9a5b06]">Sensitive fields</h3>
                <p className="text-[12px] text-[#9a5b06]/80 mt-0.5 mb-3">Off means the server never sends these fields to this role. They show masked, like XXXX XXXX 1234.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {SENSITIVE_FIELDS.map(s => (
                        <Toggle key={s.key} label={s.label} hint={s.hint} checked={perms.has(s.key)}
                            disabled={readOnly || (!perms.has(s.key) && !canGrant(s.key))} onChange={on => toggleKey(s.key, on)} />
                    ))}
                </div>
            </section>

            {/* Footer */}
            {!readOnly && (
                <div className="fixed bottom-0 left-0 right-0 md:left-[264px] z-30 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur px-4 lg:px-8 py-3">
                    <div className="max-w-[1100px] flex items-center justify-between gap-3">
                        <p className="text-[12.5px] text-[var(--text2)] truncate">{dirty ? summary?.text : "No changes yet."}</p>
                        <div className="flex gap-2 shrink-0">
                            <button type="button" className={btnGhost} disabled={!dirty || saving} onClick={() => setForm(initial)}>Discard</button>
                            <button type="button" className={btnPrimary} disabled={!dirty || saving} onClick={requestSave}>
                                {saving && <Loader2 size={14} className="animate-spin" />} {isNew ? "Create role" : "Save changes"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirming && summary && (
                <Modal title={isNew ? `Create ${form.name.trim()}?` : `Save ${form.name.trim()}?`} onClose={() => setConfirming(false)}
                    footer={<>
                        <button className={btnGhost} onClick={() => setConfirming(false)}>Back</button>
                        <button className={btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} {isNew ? "Create role" : "Save changes"}</button>
                    </>}>
                    <div className="p-5 flex flex-col gap-3 text-[13px] text-[var(--text2)]">
                        <p className="font-semibold text-[var(--text)]">{summary.text}</p>
                        {summary.added.length > 0 && <Diff tone="add" items={summary.added} />}
                        {summary.removed.length > 0 && <Diff tone="remove" items={summary.removed} />}
                        {!isNew && (role?.users ?? 0) > 0 && <p>People on this role get the change on their next request — no need to sign out.</p>}
                        <p className="text-[12px] text-[var(--text3)]">Written to the audit log with the before and after.</p>
                    </div>
                </Modal>
            )}
        </div>
    )
}

function Section({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                    <h3 className="text-[14px] font-semibold text-[var(--text)]">{title}</h3>
                    {sub && <p className="text-[12px] text-[var(--text3)] mt-0.5">{sub}</p>}
                </div>
                {right}
            </div>
            {children}
        </section>
    )
}

function MatrixGroup({ group, perms, readOnly, canGrant, onAction, onRow }: {
    group: string; perms: Set<string>; readOnly: boolean; canGrant: (p: string) => boolean
    onAction: (m: string, a: Action, on: boolean) => void; onRow: (m: string, on: boolean) => void
}) {
    const modules = MODULES.filter(m => m.group === group)
    return (
        <>
            <tr><td colSpan={ACTIONS.length + 2} className="px-4 pt-3 pb-1 text-[10.5px] font-bold uppercase tracking-[0.6px] text-[var(--text3)]">{group}</td></tr>
            {modules.map(m => {
                const all = m.actions.every(a => perms.has(modulePermission(m.key, a)))
                return (
                    <tr key={m.key} className="border-t border-[var(--border)] hover:bg-[var(--surface2)]/60">
                        <td className="px-4 py-2 text-[var(--text)]">{m.label}</td>
                        {ACTIONS.map(a => {
                            if (!m.actions.includes(a)) return <td key={a} className="text-center text-[var(--text3)]">–</td>
                            const k = modulePermission(m.key, a)
                            const on = perms.has(k)
                            const blocked = !on && !canGrant(k)
                            return (
                                <td key={a} className="text-center">
                                    <input type="checkbox" checked={on} disabled={readOnly || blocked}
                                        title={blocked ? "You can't grant a permission you don't hold" : `${m.label}: ${ACTION_LABELS[a]}`}
                                        aria-label={`${m.label} ${ACTION_LABELS[a]}`}
                                        onChange={e => onAction(m.key, a, e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                                </td>
                            )
                        })}
                        <td className="text-center">
                            <input type="checkbox" checked={all} disabled={readOnly} aria-label={`${m.label} all actions`}
                                onChange={e => onRow(m.key, e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                        </td>
                    </tr>
                )
            })}
        </>
    )
}

function Toggle({ label, hint, warn, checked, disabled, onChange }: { label: string; hint: string; warn?: boolean; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
    return (
        <label className={`flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 ${disabled ? "opacity-70" : "cursor-pointer hover:border-[var(--accent)]/50"}`}>
            <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
            <span className="min-w-0">
                <span className="flex items-center gap-1 text-[13px] font-medium text-[var(--text)]">{label}{warn && <AlertTriangle size={12} className="text-[#d97706]" />}</span>
                <span className="block text-[11.5px] text-[var(--text3)]">{hint}</span>
            </span>
        </label>
    )
}

function labelOf(p: string) {
    const special = [...SPECIAL_ACTIONS, ...SENSITIVE_FIELDS].find(x => x.key === p)
    if (special) return special.label
    const [mod, act] = p.split(".")
    const m = MODULES.find(x => x.key === mod)
    return m ? `${m.label}: ${ACTION_LABELS[act as Action] ?? act}` : p
}

function Diff({ tone, items }: { tone: "add" | "remove"; items: string[] }) {
    return (
        <div className={`rounded-xl border px-3 py-2 ${tone === "add" ? "border-[var(--success-border)] bg-[#f0fdf4]" : "border-[#fecaca] bg-[var(--red-light)]"}`}>
            <p className={`text-[11.5px] font-semibold mb-1 ${tone === "add" ? "text-[var(--success)]" : "text-[var(--red)]"}`}>{tone === "add" ? "Added" : "Removed"}</p>
            <ul className="text-[12px] text-[var(--text2)] grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                {items.map(p => <li key={p}>{labelOf(p)}</li>)}
            </ul>
        </div>
    )
}
