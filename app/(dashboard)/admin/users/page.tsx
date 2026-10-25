"use client"
// Users — who can sign in, with which role, for which sites. Search, filters
// and paging run on the server (50 a page). Create and edit open the user form
// (/admin/users/new, /admin/users/[id]).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Search, Pencil, RotateCcw, History, ChevronLeft, ChevronRight, Users as UsersIcon, Loader2, Ban, CheckCircle2 } from "lucide-react"
import { liveSearchParam } from "@/lib/utils"
import {
    api, ApiError, Loading, Empty, Modal, Label, inputCls, filterCls, btnPrimary, btnGhost, btnDanger,
    PageHead, Stat, RoleChip, StatusChip, NotSetUp, NoAccess, SitePicker, maskMobile, ago, initials, fmtDate,
} from "../_access/ui"

type Row = {
    id: string; name: string; employeeCode: string | null; employeeId: string | null; designation: string | null
    mobile: string | null; email: string | null
    role: { id: string; name: string; color: string; system: boolean; off?: boolean } | null
    scope: string | null; sites: { id: string; name: string }[]
    isActive: boolean; loginMethod: string; lastLoginAt: string | null; createdAt: string
}
type Payload = {
    users: Row[]; total: number; page: number; pageSize: number; totalPages: number
    stats: { total: number; active: number; disabled: number; neverLoggedIn: number | null; withoutRole: number }
    accessReady: boolean
    can: { create: boolean; edit: boolean; resetLogin: boolean; deactivate: boolean; export: boolean; admin: boolean }
}
type RoleOpt = { id: string; name: string; color: string; isActive: boolean }
type SiteOpt = { id: string; name: string }
type Filters = { q: string; role: string; site: string; status: string; login: string; lastLogin: string }
type Bulk = { action: "role" | "sites" | "disable" | "enable"; roleId: string; siteIds: string[]; typed: string }

const CONFIRM_ABOVE = 20

export default function UsersPage() {
    const router = useRouter()
    const [filters, setFilters] = useState<Filters>({ q: "", role: "", site: "", status: "", login: "", lastLogin: "" })
    const [qInput, setQInput] = useState("")
    const [page, setPage] = useState(1)
    const [data, setData] = useState<Payload | null>(null)
    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState(false)
    const [roles, setRoles] = useState<RoleOpt[]>([])
    const [sites, setSites] = useState<SiteOpt[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [bulk, setBulk] = useState<Bulk | null>(null)
    const [busy, setBusy] = useState(false)
    const [confirmRow, setConfirmRow] = useState<{ kind: "reset" | "disable" | "enable"; row: Row } | null>(null)
    const [danger, setDanger] = useState<"reset" | "cleanup" | null>(null)
    const latest = useRef(0)

    // ?role=<id> (e.g. from a role card) pre-filters the list.
    useEffect(() => {
        const role = liveSearchParam("role")
        if (role) setFilters(f => ({ ...f, role }))
    }, [])

    useEffect(() => {
        api<RoleOpt[]>("/api/admin/roles").then(setRoles).catch(() => {})
        fetch("/api/sites?isActive=true").then(r => (r.ok ? r.json() : [])).then(d => {
            const list = Array.isArray(d) ? d : (d.sites ?? [])
            setSites(list.map((s: SiteOpt) => ({ id: s.id, name: s.name })))
        }).catch(() => {})
    }, [])

    // Debounced search box.
    useEffect(() => {
        const t = setTimeout(() => { setFilters(f => (f.q === qInput.trim() ? f : { ...f, q: qInput.trim() })); setPage(1) }, 300)
        return () => clearTimeout(t)
    }, [qInput])

    const query = useMemo(() => {
        const p = new URLSearchParams({ page: String(page) })
        for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v)
        return p.toString()
    }, [filters, page])

    const load = useCallback(async () => {
        const id = ++latest.current
        setLoading(true)
        try {
            const d = await api<Payload>(`/api/admin/users?${query}`)
            if (id === latest.current) setData(d)
        } catch (e) {
            if (e instanceof ApiError && e.status === 403) setForbidden(true)
            else toast.error(e instanceof Error ? e.message : "Couldn't load users")
        } finally {
            if (id === latest.current) setLoading(false)
        }
    }, [query])
    useEffect(() => { load() }, [load])

    const setFilter = (k: keyof Filters, v: string) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); setSelected(new Set()) }

    const rows = data?.users ?? []
    const allOnPage = rows.length > 0 && rows.every(r => selected.has(r.id))
    const toggleAll = () => setSelected(s => {
        const n = new Set(s)
        if (allOnPage) rows.forEach(r => n.delete(r.id)); else rows.forEach(r => n.add(r.id))
        return n
    })
    const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

    async function runBulk() {
        if (!bulk) return
        const ids = Array.from(selected)
        if (ids.length > CONFIRM_ABOVE && bulk.typed.trim() !== String(ids.length)) { toast.error(`Type ${ids.length} to confirm`); return }
        if (bulk.action === "role" && !bulk.roleId) { toast.error("Choose a role"); return }
        setBusy(true)
        try {
            await api("/api/admin/users/bulk", { body: { action: bulk.action, userIds: ids, roleId: bulk.roleId, siteIds: bulk.siteIds, confirm: ids.length > CONFIRM_ABOVE ? Number(bulk.typed) : undefined } })
            toast.success(`${ids.length} user${ids.length === 1 ? "" : "s"} updated`)
            setBulk(null); setSelected(new Set()); load()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Bulk change failed")
        } finally {
            setBusy(false)
        }
    }

    async function runRow() {
        if (!confirmRow) return
        setBusy(true)
        try {
            if (confirmRow.kind === "reset") {
                await api(`/api/admin/users/${confirmRow.row.id}/reset-login`, { body: {} })
                toast.success(`${confirmRow.row.name} will sign in with an OTP next time`)
            } else {
                await api(`/api/admin/users/${confirmRow.row.id}`, { method: "PATCH", body: { isActive: confirmRow.kind === "enable" } })
                toast.success(`${confirmRow.row.name} ${confirmRow.kind === "enable" ? "enabled" : "disabled"}`)
            }
            setConfirmRow(null); load()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't update the user")
        } finally {
            setBusy(false)
        }
    }

    if (forbidden) return <div className="p-4 lg:p-0"><NoAccess what="Users" perm="users.view" /></div>

    const can = data?.can
    const exportHref = `/api/admin/users?${query}&format=csv`

    return (
        <div className="flex flex-col gap-5 p-4 lg:p-0">
            <PageHead
                title="Users"
                sub="Who can sign in, with which role, for which sites."
                right={<>
                    {can?.export && <a href={exportHref} className={btnGhost}>Export</a>}
                    {can?.create && <Link href="/admin/users/new" className={btnPrimary}><Plus size={15} /> Create user</Link>}
                </>}
            />

            {data && !data.accessReady && <NotSetUp />}

            {data && (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                    <Stat label="Total" value={data.stats.total} onClick={() => setFilters({ q: "", role: "", site: "", status: "", login: "", lastLogin: "" })} />
                    <Stat label="Active" value={data.stats.active} onClick={() => setFilter("status", "active")} active={filters.status === "active"} />
                    <Stat label="Disabled" value={data.stats.disabled} onClick={() => setFilter("status", "disabled")} active={filters.status === "disabled"} />
                    <Stat label="Never logged in" value={data.stats.neverLoggedIn} onClick={data.accessReady ? () => setFilter("lastLogin", "never") : undefined} active={filters.lastLogin === "never"} />
                    <Stat label="Without a role" value={data.stats.withoutRole} warn={data.stats.withoutRole > 0} onClick={() => setFilter("role", "none")} active={filters.role === "none"} />
                </div>
            )}

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2 p-3 border-b border-[var(--border)]">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                        <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Name, EMP ID or mobile" aria-label="Search users"
                            className={inputCls("pl-9 h-10 bg-[var(--surface)]")} />
                    </div>
                    <select aria-label="Role" className={`${filterCls} h-10`} value={filters.role} onChange={e => setFilter("role", e.target.value)}>
                        <option value="">All roles</option>
                        <option value="admin">Admin</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.isActive ? "" : " (off)"}</option>)}
                        <option value="none">No role</option>
                    </select>
                    <select aria-label="Site" className={`${filterCls} h-10 max-w-[180px]`} value={filters.site} onChange={e => setFilter("site", e.target.value)}>
                        <option value="">All sites</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select aria-label="Sign-in method" className={`${filterCls} h-10`} value={filters.login} onChange={e => setFilter("login", e.target.value)} disabled={!data?.accessReady}>
                        <option value="">Any sign-in</option>
                        <option value="OTP">OTP and MPIN</option>
                        <option value="PASSWORD">Password</option>
                    </select>
                    <select aria-label="Last login" className={`${filterCls} h-10`} value={filters.lastLogin} onChange={e => setFilter("lastLogin", e.target.value)} disabled={!data?.accessReady}>
                        <option value="">Any last login</option>
                        <option value="never">Never logged in</option>
                        <option value="30d">Not in 30 days</option>
                    </select>
                    <div className="flex rounded-xl bg-[var(--surface2)] p-1" role="group" aria-label="Status">
                        {[["", "All"], ["active", "Active"], ["disabled", "Disabled"]].map(([v, l]) => (
                            <button key={v} type="button" onClick={() => setFilter("status", v)} aria-pressed={filters.status === v}
                                className={`px-3 py-1.5 rounded-lg text-[12.5px] ${filters.status === v ? "bg-[var(--surface)] shadow-sm font-semibold text-[var(--text)]" : "text-[var(--text2)]"}`}>{l}</button>
                        ))}
                    </div>
                </div>

                {/* Bulk bar */}
                {selected.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[var(--accent-light)] border-b border-[var(--border)] text-[13px]">
                        <b className="text-[var(--accent-text)]">{selected.size} selected</b>
                        {can?.edit && <button className={btnGhost} onClick={() => setBulk({ action: "role", roleId: "", siteIds: [], typed: "" })}>Change role</button>}
                        {can?.edit && <button className={btnGhost} onClick={() => setBulk({ action: "sites", roleId: "", siteIds: [], typed: "" })}>Assign sites</button>}
                        {can?.deactivate && <button className={btnGhost} onClick={() => setBulk({ action: "disable", roleId: "", siteIds: [], typed: "" })}>Disable</button>}
                        {can?.deactivate && <button className={btnGhost} onClick={() => setBulk({ action: "enable", roleId: "", siteIds: [], typed: "" })}>Enable</button>}
                        <button className="ml-auto text-[12.5px] text-[var(--text2)] hover:underline" onClick={() => setSelected(new Set())}>Clear selection</button>
                    </div>
                )}

                {/* Table */}
                {!data ? <Loading /> : rows.length === 0 ? (
                    <Empty icon={<UsersIcon size={36} />} title="No users match" sub="Change the filters or search." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1000px] text-[13px]">
                            <thead>
                                <tr className="bg-[var(--surface2)] text-[11.5px] text-[var(--text2)]">
                                    <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all on this page" className="accent-[var(--accent)]" /></th>
                                    <th className="text-left px-3 py-2.5 font-semibold">User</th>
                                    <th className="text-left px-3 py-2.5 font-semibold">Mobile</th>
                                    <th className="text-left px-3 py-2.5 font-semibold">Role</th>
                                    <th className="text-left px-3 py-2.5 font-semibold">Sites</th>
                                    <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                                    <th className="text-left px-3 py-2.5 font-semibold">Last login</th>
                                    <th className="text-left px-3 py-2.5 font-semibold">Created</th>
                                    <th className="text-left px-3 py-2.5 font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody className={loading ? "opacity-60" : ""}>
                                {rows.map(r => (
                                    <tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--surface2)]/50">
                                        <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} className="accent-[var(--accent)]" /></td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <span className="h-8 w-8 shrink-0 rounded-full bg-[var(--accent-light)] text-[var(--accent-text)] text-[11.5px] font-bold flex items-center justify-center">{initials(r.name)}</span>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-[var(--text)] truncate max-w-[200px]">{r.name}</p>
                                                    <p className="text-[11.5px] text-[var(--text3)] truncate max-w-[200px]">{r.employeeCode ?? (r.email ?? "Non-employee account")}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 tabular-nums text-[var(--text2)]" title={r.mobile ?? undefined}>{maskMobile(r.mobile)}</td>
                                        <td className="px-3 py-2.5"><RoleChip role={r.role} /></td>
                                        <td className="px-3 py-2.5 text-[12.5px] text-[var(--text2)] max-w-[180px]">
                                            {!r.role ? "—" : r.scope === "ALL" ? "All sites" : r.scope === "SELF" ? "Self only" : r.scope === "MY_TEAM" ? "My team"
                                                : r.sites.length ? <span className="line-clamp-2">{r.sites.map(s => s.name).join(", ")}</span>
                                                : r.scope === "ASSIGNED_SITES" ? <span className="text-[#b45309]">No sites set</span> : "All sites"}
                                        </td>
                                        <td className="px-3 py-2.5"><StatusChip active={r.isActive} /></td>
                                        <td className="px-3 py-2.5 text-[var(--text2)] whitespace-nowrap">{data.accessReady ? ago(r.lastLoginAt) : "—"}</td>
                                        <td className="px-3 py-2.5 text-[var(--text3)] whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-1.5">
                                                <IconBtn label="Edit" onClick={() => router.push(`/admin/users/${r.id}`)}><Pencil size={14} /></IconBtn>
                                                {can?.resetLogin && <IconBtn label="Reset login" onClick={() => setConfirmRow({ kind: "reset", row: r })}><RotateCcw size={14} /></IconBtn>}
                                                {can?.deactivate && (r.isActive
                                                    ? <IconBtn label="Disable" onClick={() => setConfirmRow({ kind: "disable", row: r })}><Ban size={14} /></IconBtn>
                                                    : <IconBtn label="Enable" onClick={() => setConfirmRow({ kind: "enable", row: r })}><CheckCircle2 size={14} /></IconBtn>)}
                                                <IconBtn label="View audit history" onClick={() => router.push(`/admin/audit?target=${r.id}`)}><History size={14} /></IconBtn>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {data && data.total > 0 && (
                    <div className="flex items-center justify-between gap-2 px-3 py-3 border-t border-[var(--border)] text-[12.5px] text-[var(--text2)]">
                        <span>Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total.toLocaleString("en-IN")}</span>
                        <div className="flex items-center gap-1.5">
                            <IconBtn label="Previous page" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></IconBtn>
                            <span className="px-2 tabular-nums">Page {data.page} of {data.totalPages}</span>
                            <IconBtn label="Next page" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></IconBtn>
                        </div>
                    </div>
                )}
            </div>

            {/* Danger zone */}
            {can?.admin && (
                <section className="rounded-2xl border border-[#fecaca] bg-[#fff5f5] p-4">
                    <h3 className="text-[15px] font-semibold text-[#b91c1c]">Danger zone</h3>
                    <p className="text-[12.5px] text-[#b91c1c]/80 mt-0.5">Admin only. Each action asks you to type a confirmation and is written to the audit log.</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                        <button className="rounded-xl border border-[#fca5a5] bg-white px-4 py-2 text-[13px] text-[#b91c1c] hover:bg-[#fef2f2]" onClick={() => setDanger("reset")}>Reset all logins…</button>
                        <button className="rounded-xl border border-[#fca5a5] bg-white px-4 py-2 text-[13px] text-[#b91c1c] hover:bg-[#fef2f2]" onClick={() => setDanger("cleanup")}>Remove non-employee logins…</button>
                    </div>
                </section>
            )}

            {bulk && <BulkDialog bulk={bulk} setBulk={setBulk} count={selected.size} roles={roles} sites={sites} busy={busy} onRun={runBulk} isAdmin={!!can?.admin} />}

            {confirmRow && (
                <Modal
                    title={confirmRow.kind === "reset" ? `Reset ${confirmRow.row.name}'s login?` : confirmRow.kind === "disable" ? `Disable ${confirmRow.row.name}?` : `Enable ${confirmRow.row.name}?`}
                    onClose={() => setConfirmRow(null)}
                    footer={<>
                        <button className={btnGhost} onClick={() => setConfirmRow(null)}>Cancel</button>
                        <button className={confirmRow.kind === "enable" ? btnPrimary : btnDanger} onClick={runRow} disabled={busy}>
                            {busy && <Loader2 size={14} className="animate-spin" />}
                            {confirmRow.kind === "reset" ? "Reset login" : confirmRow.kind === "disable" ? "Disable" : "Enable"}
                        </button>
                    </>}>
                    <p className="p-5 text-[13.5px] text-[var(--text2)]">
                        {confirmRow.kind === "reset" && "Their password and MPIN are cleared. Next time they sign in with an OTP to their mobile and set a new MPIN."}
                        {confirmRow.kind === "disable" && "They are signed out on their next request and cannot sign in until enabled again."}
                        {confirmRow.kind === "enable" && "They can sign in again with their role's access."}
                    </p>
                </Modal>
            )}

            {danger && <DangerDialog kind={danger} onClose={() => setDanger(null)} onDone={load} />}
        </div>
    )
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed">
            {children}
        </button>
    )
}

function BulkDialog({ bulk, setBulk, count, roles, sites, busy, onRun, isAdmin }: {
    bulk: Bulk; setBulk: (b: Bulk | null) => void; count: number; roles: RoleOpt[]; sites: SiteOpt[]; busy: boolean; onRun: () => void; isAdmin: boolean
}) {
    const title = bulk.action === "role" ? "Change role" : bulk.action === "sites" ? "Assign sites" : bulk.action === "disable" ? "Disable users" : "Enable users"
    const needTyped = count > CONFIRM_ABOVE
    return (
        <Modal title={`${title} · ${count} user${count === 1 ? "" : "s"}`} onClose={() => setBulk(null)}
            footer={<>
                <button className={btnGhost} onClick={() => setBulk(null)}>Cancel</button>
                <button className={bulk.action === "disable" ? btnDanger : btnPrimary} onClick={onRun}
                    disabled={busy || (needTyped && bulk.typed.trim() !== String(count))}>
                    {busy && <Loader2 size={14} className="animate-spin" />} Apply to {count}
                </button>
            </>}>
            <div className="p-5 flex flex-col gap-4 text-[13px] text-[var(--text2)]">
                {bulk.action === "role" && (
                    <div>
                        <Label>New role</Label>
                        <select className={inputCls("bg-[var(--surface)]")} value={bulk.roleId} onChange={e => setBulk({ ...bulk, roleId: e.target.value })}>
                            <option value="">Choose a role</option>
                            {isAdmin && <option value="admin">Admin</option>}
                            {roles.filter(r => r.isActive).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                )}
                {bulk.action === "sites" && (
                    <div>
                        <Label hint="Replaces each user's sites with this list.">Sites</Label>
                        <SitePicker sites={sites} value={bulk.siteIds} onChange={siteIds => setBulk({ ...bulk, siteIds })} />
                    </div>
                )}
                {bulk.action === "disable" && <p>They are signed out on their next request and cannot sign in until enabled again.</p>}
                {bulk.action === "enable" && <p>They can sign in again with their role&apos;s access.</p>}
                <p>One audit row is written per user.</p>
                {needTyped && (
                    <div>
                        <Label>Type <b>{count}</b> to confirm</Label>
                        <input className={inputCls("bg-[var(--surface)]")} value={bulk.typed} onChange={e => setBulk({ ...bulk, typed: e.target.value })} inputMode="numeric" autoFocus />
                    </div>
                )}
            </div>
        </Modal>
    )
}

function DangerDialog({ kind, onClose, onDone }: { kind: "reset" | "cleanup"; onClose: () => void; onDone: () => void }) {
    const phrase = kind === "reset" ? "RESET ALL LOGINS" : "DELETE ORPHAN LOGINS"
    const [typed, setTyped] = useState("")
    const [busy, setBusy] = useState(false)
    async function run() {
        setBusy(true)
        try {
            if (kind === "reset") {
                const r = await api<{ reset: number }>("/api/admin/employee-logins/reset-login", { body: { confirm: phrase } })
                toast.success(`${r.reset} logins reset — everyone signs in with an OTP next time`)
            } else {
                const r = await api<{ deleted: number; skipped: number }>("/api/admin/cleanup-users", { body: { confirm: phrase } })
                toast.success(`${r.deleted} non-employee logins removed${r.skipped ? `, ${r.skipped} kept (they own records)` : ""}`)
            }
            onClose(); onDone()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "The action failed")
        } finally {
            setBusy(false)
        }
    }
    return (
        <Modal title={kind === "reset" ? "Reset all logins" : "Remove non-employee logins"} onClose={onClose}
            footer={<>
                <button className={btnGhost} onClick={onClose}>Cancel</button>
                <button className={btnDanger} onClick={run} disabled={busy || typed !== phrase}>{busy && <Loader2 size={14} className="animate-spin" />} {kind === "reset" ? "Reset all logins" : "Remove logins"}</button>
            </>}>
            <div className="p-5 flex flex-col gap-3 text-[13px] text-[var(--text2)]">
                {kind === "reset"
                    ? <p>Every employee&apos;s password and MPIN are cleared. Each of them must sign in with an OTP and set a new MPIN. Use only when switching everyone to OTP sign-in.</p>
                    : <p>Deletes logins that are not linked to any employee and own no records (demo accounts are kept). This cannot be undone.</p>}
                <div>
                    <Label>Type <b className="font-mono">{phrase}</b> to confirm</Label>
                    <input className={inputCls("bg-[var(--surface)] font-mono")} value={typed} onChange={e => setTyped(e.target.value)} autoFocus />
                </div>
            </div>
        </Modal>
    )
}
