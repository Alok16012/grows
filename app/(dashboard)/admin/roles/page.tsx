"use client"
// Roles — one card per role: what it is for, which records it sees, who holds
// it. Open goes to the full-page editor (/admin/roles/[id]).

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Search, Shield, Trash2, Columns3, X } from "lucide-react"
import { MODULES, ACTION_SHORT, modulePermission, SPECIAL_ACTIONS, SENSITIVE_FIELDS } from "@/lib/permission-catalogue"
import {
    api, ApiError, Loading, Empty, Modal, btnPrimary, btnGhost, btnDanger, inputCls,
    PageHead, Stat, ScopeBadge, NotSetUp, NoAccess, type RoleCard,
} from "../_access/ui"

type Payload = {
    roles: RoleCard[]
    stats: { roles: number; usersWithRole: number; usersWithoutRole: number; changesLast30Days: number | null }
    canCreate: boolean; canEdit: boolean; canDelete: boolean
}

export default function RolesPage() {
    const router = useRouter()
    const [data, setData] = useState<Payload | null>(null)
    const [forbidden, setForbidden] = useState(false)
    const [q, setQ] = useState("")
    const [comparing, setComparing] = useState(false)
    const [picked, setPicked] = useState<string[]>([])
    const [deleting, setDeleting] = useState<RoleCard | null>(null)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        try {
            setData(await api<Payload>("/api/admin/roles?full=1"))
        } catch (e) {
            if (e instanceof ApiError && e.status === 403) setForbidden(true)
            else toast.error(e instanceof Error ? e.message : "Couldn't load roles")
        }
    }, [])
    useEffect(() => { load() }, [load])

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase()
        const list = data?.roles ?? []
        return s ? list.filter(r => r.name.toLowerCase().includes(s) || (r.description ?? "").toLowerCase().includes(s)) : list
    }, [data, q])

    const notSetUp = !!data && data.stats.changesLast30Days === null

    async function duplicate(r: RoleCard) {
        router.push(`/admin/roles/new?from=${encodeURIComponent(r.id)}`)
    }

    async function confirmDelete() {
        if (!deleting) return
        setBusy(true)
        try {
            await api(`/api/admin/roles/${deleting.id}`, { method: "DELETE" })
            toast.success(`${deleting.name} deleted`)
            setDeleting(null)
            load()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't delete the role")
        } finally {
            setBusy(false)
        }
    }

    function togglePick(id: string) {
        setPicked(p => p.includes(id) ? p.filter(x => x !== id) : p.length >= 3 ? p : [...p, id])
    }

    if (forbidden) return <div className="p-4 lg:p-0"><NoAccess what="Roles" perm="roles.view" /></div>

    return (
        <div className="flex flex-col gap-5 p-4 lg:p-0">
            <PageHead
                title="Roles"
                sub="Each role sets what people can do and which records they can see."
                right={<>
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search roles" aria-label="Search roles"
                            className={inputCls("pl-9 w-56 bg-[var(--surface)] h-10")} />
                    </div>
                    <button type="button" className={btnGhost} onClick={() => { setComparing(c => !c); setPicked([]) }} aria-pressed={comparing}>
                        <Columns3 size={15} /> {comparing ? "Done comparing" : "Compare roles"}
                    </button>
                    {data?.canCreate && (
                        <Link href="/admin/roles/new" className={btnPrimary}><Plus size={15} /> Create role</Link>
                    )}
                </>}
            />

            {notSetUp && <NotSetUp />}

            {!data ? <Loading /> : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Stat label="Roles" value={data.stats.roles} />
                        <Stat label="Users with a role" value={data.stats.usersWithRole} />
                        <Stat label="Users waiting for a role" value={data.stats.usersWithoutRole} warn={data.stats.usersWithoutRole > 0}
                            onClick={() => router.push("/admin/users?role=none")} />
                        <Stat label="Role changes, last 30 days" value={data.stats.changesLast30Days} />
                    </div>

                    {comparing && (
                        <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-light)] px-4 py-3 text-[13px] text-[var(--accent-text)]">
                            Pick two or three roles to compare side by side. {picked.length > 0 && <b>{picked.length} picked.</b>}
                        </div>
                    )}

                    {shown.length === 0 ? (
                        <Empty icon={<Shield size={36} />} title="No roles match" sub="Try another search." />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {shown.map(r => (
                                <RoleCardView key={r.id} role={r}
                                    comparing={comparing} picked={picked.includes(r.id)} onPick={() => togglePick(r.id)}
                                    canCreate={data.canCreate} canDelete={data.canDelete}
                                    onDuplicate={() => duplicate(r)} onDelete={() => setDeleting(r)} />
                            ))}
                        </div>
                    )}

                    <p className="text-[12px] text-[var(--text3)]">Delete stays disabled while a role has users. Move them to another role first.</p>

                    {comparing && picked.length >= 2 && (
                        <CompareTable roles={picked.map(id => data.roles.find(r => r.id === id)!).filter(Boolean)} onClose={() => setPicked([])} />
                    )}
                </>
            )}

            {deleting && (
                <Modal title={`Delete ${deleting.name}?`} onClose={() => setDeleting(null)}
                    footer={<>
                        <button className={btnGhost} onClick={() => setDeleting(null)}>Cancel</button>
                        <button className={btnDanger} onClick={confirmDelete} disabled={busy}>Delete role</button>
                    </>}>
                    <p className="p-5 text-[13.5px] text-[var(--text2)]">The role is removed for good. Nobody holds it, so no one loses access. This is written to the audit log.</p>
                </Modal>
            )}
        </div>
    )
}

function RoleCardView({ role: r, comparing, picked, onPick, canCreate, canDelete, onDuplicate, onDelete }: {
    role: RoleCard; comparing: boolean; picked: boolean; onPick: () => void
    canCreate: boolean; canDelete: boolean; onDuplicate: () => void; onDelete: () => void
}) {
    const deleteBlocked = r.isSystem ? "The Admin role cannot be deleted" : r.users > 0 ? `Move the ${r.users} user${r.users === 1 ? "" : "s"} first` : ""
    return (
        <div className={`rounded-2xl border bg-[var(--surface)] p-4 flex flex-col gap-3 ${picked ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : "border-[var(--border)]"}`}>
            <div className="flex items-start gap-3">
                <div className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center" style={{ background: `${r.color}1a`, color: r.color }}>
                    <Shield size={18} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-[15.5px] font-semibold text-[var(--text)]">{r.name}</h3>
                        {r.isSystem && <span className="rounded-full bg-[#0f172a] px-2 py-0.5 text-[10.5px] font-bold text-white">System</span>}
                        {!r.isActive && <span className="rounded-full bg-[var(--surface2)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--text2)]">Off</span>}
                        {r.legacy && <span title="Saved before the permission catalogue. Open and save it to convert it and set its data scope."
                            className="rounded-full bg-[#fff1e0] px-2 py-0.5 text-[10.5px] font-semibold text-[#b45309]">Not converted</span>}
                    </div>
                    <p className="text-[12.5px] text-[var(--text2)] mt-0.5 line-clamp-2">{r.description || "No description yet."}</p>
                </div>
                {comparing && (
                    <input type="checkbox" checked={picked} onChange={onPick} aria-label={`Compare ${r.name}`} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                )}
            </div>
            <div className="flex flex-wrap gap-1.5">
                <ScopeBadge scope={r.scope} />
                <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface2)] px-2.5 py-0.5 text-[11.5px] text-[var(--text2)]">
                    {r.users.toLocaleString("en-IN")} user{r.users === 1 ? "" : "s"}{r.users !== r.activeUsers ? ` · ${r.activeUsers} active` : ""}
                </span>
                {!r.isSystem && <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface2)] px-2.5 py-0.5 text-[11.5px] text-[var(--text2)]">{r.permissionCount} permissions</span>}
            </div>
            <div className="mt-auto flex items-center gap-2 border-t border-[var(--border)] pt-3">
                <Link href={`/admin/roles/${r.id}`} className="flex-1 inline-flex justify-center rounded-xl bg-[var(--accent-light)] px-3 py-2 text-[13px] font-semibold text-[var(--accent-text)] hover:opacity-90">Open</Link>
                {canCreate && !r.isSystem && (
                    <button type="button" onClick={onDuplicate} className="flex-1 inline-flex justify-center rounded-xl border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)]">Duplicate</button>
                )}
                {canDelete && (
                    <button type="button" onClick={onDelete} disabled={!!deleteBlocked} title={deleteBlocked || "Delete role"} aria-label={`Delete ${r.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text3)] hover:text-[var(--red)] hover:border-[var(--red)] disabled:opacity-40 disabled:hover:text-[var(--text3)] disabled:hover:border-[var(--border)] disabled:cursor-not-allowed">
                        <Trash2 size={15} />
                    </button>
                )}
            </div>
        </div>
    )
}

// Two or three roles side by side; rows where they differ are highlighted.
function CompareTable({ roles, onClose }: { roles: RoleCard[]; onClose: () => void }) {
    const sets = roles.map(r => new Set(r.permissions))
    const rows = [
        ...MODULES.map(m => ({
            key: m.key, label: m.label,
            cells: sets.map(s => m.actions.filter(a => s.has(modulePermission(m.key, a))).map(a => ACTION_SHORT[a]).join(" ") || "—"),
        })),
        ...[...SPECIAL_ACTIONS, ...SENSITIVE_FIELDS].map(x => ({
            key: x.key, label: x.label, cells: sets.map(s => (s.has(x.key) ? "✓" : "—")),
        })),
    ]
    const scopeRow = { key: "scope", label: "Data scope", cells: roles.map(r => r.scope ?? "ALL") }
    const all = [scopeRow, ...rows]
    const [onlyDiff, setOnlyDiff] = useState(false)
    const visible = onlyDiff ? all.filter(r => new Set(r.cells).size > 1) : all
    return (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border)]">
                <h3 className="text-[14px] font-semibold text-[var(--text)]">Compare roles</h3>
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--text2)]">
                        <input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} className="accent-[var(--accent)]" /> Only differences
                    </label>
                    <button onClick={onClose} aria-label="Close comparison" className="text-[var(--text3)] hover:text-[var(--text)]"><X size={16} /></button>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                    <thead>
                        <tr className="bg-[var(--surface2)]">
                            <th className="text-left px-3 py-2 font-semibold text-[var(--text3)]">Module</th>
                            {roles.map(r => <th key={r.id} className="text-left px-3 py-2 font-semibold text-[var(--text)]">{r.name}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map(row => {
                            const differs = new Set(row.cells).size > 1
                            return (
                                <tr key={row.key} className={`border-t border-[var(--border)] ${differs ? "bg-[#fffbeb]" : ""}`}>
                                    <td className="px-3 py-1.5 text-[var(--text2)]">{row.label}</td>
                                    {row.cells.map((c, i) => <td key={i} className={`px-3 py-1.5 font-mono ${differs ? "text-[#92400e] font-semibold" : "text-[var(--text2)]"}`}>{c}</td>)}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
