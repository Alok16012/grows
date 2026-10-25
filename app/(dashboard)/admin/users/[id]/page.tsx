"use client"
// Create user (/admin/users/new) and Edit user (/admin/users/<id>).
// Employees sign in with an OTP to their mobile, then set a 4-digit MPIN; a
// password is only for office or non-employee accounts.

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, RotateCcw, History, Search, X } from "lucide-react"
import {
    api, ApiError, Loading, Modal, Label, inputCls, btnPrimary, btnGhost,
    PageHead, NoAccess, NotSetUp, SitePicker, ago, fmtDate,
} from "../../_access/ui"

type RoleOpt = { id: string; name: string; color: string; isActive: boolean; scope: string | null }
type SiteOpt = { id: string; name: string }
type EmpHit = { id: string; employeeId: string; name: string; mobile: string | null; email: string | null; designation: string | null; status: string; hasLogin: boolean; reportsTo: { id: string; name: string | null } | null }
type Detail = {
    user: {
        id: string; name: string; mobile: string | null; email: string | null; loginId: string; roleId: string | null
        isActive: boolean; createdAt: string; employee: { id: string; employeeId: string; name: string; designation: string | null } | null
        reportsTo: { id: string; name: string } | null; sites: { id: string; name: string }[]; loginMethod: "OTP" | "PASSWORD"
        mustChangePassword: boolean; lastLoginAt: string | null; createdBy: { id: string; name: string } | null
    }
    can: { edit: boolean; resetLogin: boolean; deactivate: boolean; admin: boolean }
}
type Form = {
    employee: { id: string; label: string } | null
    name: string; mobile: string; email: string; roleId: string; siteIds: string[]
    reportsTo: string; loginMethod: "OTP" | "PASSWORD"; password: string; isActive: boolean
}

export default function UserFormPage() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()
    const isNew = id === "new"
    const [roles, setRoles] = useState<RoleOpt[]>([])
    const [sites, setSites] = useState<SiteOpt[]>([])
    const [me, setMe] = useState<{ isAdmin: boolean; permissions: string[] } | null>(null)
    const [detail, setDetail] = useState<Detail | null>(null)
    const [form, setForm] = useState<Form | null>(isNew ? {
        employee: null, name: "", mobile: "", email: "", roleId: "", siteIds: [], reportsTo: "",
        loginMethod: "OTP", password: "", isActive: true,
    } : null)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState(false)
    const [forbidden, setForbidden] = useState(false)
    const [notSetUp, setNotSetUp] = useState(false)
    const [resetting, setResetting] = useState(false)

    useEffect(() => {
        api<RoleOpt[]>("/api/admin/roles").then(setRoles).catch(() => {})
        fetch("/api/sites?isActive=true").then(r => (r.ok ? r.json() : [])).then(d => {
            const list = Array.isArray(d) ? d : (d.sites ?? [])
            setSites(list.map((s: SiteOpt) => ({ id: s.id, name: s.name })))
        }).catch(() => {})
        api<{ isAdmin: boolean; permissions: string[] }>("/api/me/permissions").then(setMe).catch(() => {})
    }, [])

    useEffect(() => {
        if (isNew) return
        api<Detail>(`/api/admin/users/${id}`).then(d => {
            setDetail(d)
            const u = d.user
            setForm({
                employee: u.employee ? { id: u.employee.id, label: `${u.employee.name} · ${u.employee.employeeId}` } : null,
                name: u.name, mobile: u.mobile ?? "", email: u.email ?? "", roleId: u.roleId ?? "",
                siteIds: u.sites.map(s => s.id), reportsTo: u.reportsTo?.name ?? "",
                loginMethod: u.loginMethod, password: "", isActive: u.isActive,
            })
        }).catch(e => {
            if (e instanceof ApiError && e.status === 403) setForbidden(true)
            else toast.error(e instanceof Error ? e.message : "Couldn't load the user")
        })
    }, [id, isNew])

    // Sites from the user record, plus any assigned site no longer in the active list.
    const siteOptions = useMemo(() => {
        const extra = (detail?.user.sites ?? []).filter(s => !sites.some(x => x.id === s.id))
        return [...sites, ...extra]
    }, [sites, detail])

    const selectedRole = roles.find(r => r.id === form?.roleId)
    const showSites = selectedRole?.scope === "ASSIGNED_SITES" || (form?.siteIds.length ?? 0) > 0
    const canEdit = isNew || !!detail?.can.edit
    const canDeactivate = isNew || !!detail?.can.deactivate
    const isAdmin = !!me?.isAdmin

    const set = (patch: Partial<Form>) => { setForm(f => (f ? { ...f, ...patch } : f)); setErrors({}) }

    function validate(f: Form) {
        const e: Record<string, string> = {}
        if (!f.name.trim()) e.name = "Full name is required"
        const m = f.mobile.replace(/\D/g, "")
        if (!/^[6-9]\d{9}$/.test(m)) e.mobile = "10 digits, starting with 6, 7, 8 or 9"
        if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Enter a real email address, or leave it empty"
        if (!f.roleId) e.roleId = "Choose a role"
        if (selectedRole?.scope === "ASSIGNED_SITES" && f.siteIds.length === 0) e.siteIds = "Pick at least one site — this role sees assigned sites only"
        const needsPassword = f.loginMethod === "PASSWORD" && (isNew || detail?.user.loginMethod !== "PASSWORD" || f.password)
        if (needsPassword && f.password.length < 10) e.password = "At least 10 characters"
        return e
    }

    async function submit() {
        if (!form) return
        const e = validate(form)
        setErrors(e)
        if (Object.keys(e).length) { toast.error(Object.values(e)[0]); return }
        setSaving(true)
        try {
            const body: Record<string, unknown> = {
                name: form.name.trim(), mobile: form.mobile.replace(/\D/g, ""), email: form.email.trim(),
                roleId: form.roleId, siteIds: form.siteIds, loginMethod: form.loginMethod,
                ...(form.password ? { password: form.password } : {}),
                ...(canDeactivate ? { isActive: form.isActive } : {}),
            }
            if (isNew) {
                body.employeeId = form.employee?.id ?? null
                const r = await api<{ id: string }>("/api/admin/users", { body })
                toast.success(`${form.name.trim()} created`)
                router.replace(`/admin/users/${r.id}`)
            } else {
                const r = await api<{ unchanged?: boolean }>(`/api/admin/users/${id}`, { method: "PATCH", body })
                toast.success(r?.unchanged ? "Nothing to save" : "User saved")
                router.push("/admin/users")
            }
        } catch (err) {
            if (err instanceof ApiError && err.status === 503) setNotSetUp(true)
            toast.error(err instanceof Error ? err.message : "Couldn't save the user")
        } finally {
            setSaving(false)
        }
    }

    async function resetLogin() {
        try {
            await api(`/api/admin/users/${id}/reset-login`, { body: {} })
            toast.success("Login reset — next sign-in is by OTP")
            setResetting(false)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't reset the login")
        }
    }

    if (forbidden) return <div className="p-4 lg:p-0"><NoAccess what="Users" perm="users.view" /></div>
    if (!form) return <Loading />

    const err = (k: string) => errors[k] ? <p className="text-[11.5px] text-[var(--red)] mt-1">{errors[k]}</p> : null
    const disabled = !canEdit

    return (
        <div className="p-4 lg:p-0 flex justify-center">
            <div className="w-full max-w-[720px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 flex flex-col gap-5">
                <PageHead back={{ href: "/admin/users", label: "Users" }} title={isNew ? "Create user" : `Edit ${detail?.user.name ?? "user"}`}
                    sub="Employees sign in with an OTP to this mobile, then set a 4-digit MPIN." />

                {notSetUp && <NotSetUp />}

                {!isNew && detail && (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-[var(--surface2)] px-4 py-2.5 text-[12.5px] text-[var(--text2)]">
                        <span>Last login: <b className="text-[var(--text)]">{ago(detail.user.lastLoginAt)}</b></span>
                        <span>Created {fmtDate(detail.user.createdAt)}{detail.user.createdBy ? ` by ${detail.user.createdBy.name}` : ""}</span>
                        <Link href={`/admin/audit?target=${detail.user.id}`} className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"><History size={13} /> Audit history</Link>
                        {detail.can.resetLogin && (
                            <button type="button" onClick={() => setResetting(true)} className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"><RotateCcw size={13} /> Reset login</button>
                        )}
                    </div>
                )}

                <div>
                    <Label>Link to employee</Label>
                    {isNew ? (
                        <EmployeeSearch value={form.employee} onPick={e => {
                            if (!e) { set({ employee: null }); return }
                            set({
                                employee: { id: e.id, label: `${e.name} · ${e.employeeId}` },
                                name: e.name, mobile: e.mobile ?? form.mobile, email: e.email ?? form.email,
                                reportsTo: e.reportsTo?.name ?? "",
                            })
                        }} />
                    ) : (
                        <input className={inputCls("bg-[var(--surface)]")} disabled value={form.employee?.label ?? "Not linked — non-employee account"} />
                    )}
                    <p className="text-[11.5px] text-[var(--text3)] mt-1">Fills name, mobile and manager. Leave empty only for a non-employee account.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label>Full name *</Label>
                        <input className={inputCls("bg-[var(--surface)]")} value={form.name} disabled={disabled} onChange={e => set({ name: e.target.value })} />
                        {err("name")}
                    </div>
                    <div>
                        <Label>Mobile *</Label>
                        <input className={inputCls("bg-[var(--surface)] tabular-nums")} value={form.mobile} disabled={disabled} inputMode="numeric" maxLength={14}
                            onChange={e => set({ mobile: e.target.value })} placeholder="10-digit mobile" />
                        {err("mobile")}
                    </div>
                </div>

                <div>
                    <Label>Email (optional)</Label>
                    <input className={inputCls("bg-[var(--surface)]")} value={form.email} disabled={disabled} type="email" placeholder="name@company.com"
                        onChange={e => set({ email: e.target.value })} />
                    <p className="text-[11.5px] text-[var(--text3)] mt-1">Real email addresses only. Never a phone number.</p>
                    {err("email")}
                </div>

                <div>
                    <Label>Role *</Label>
                    <select className={inputCls("bg-[var(--surface)]")} value={form.roleId} disabled={disabled} onChange={e => set({ roleId: e.target.value })}>
                        <option value="">Choose a role</option>
                        {(isAdmin || form.roleId === "admin") && <option value="admin">Administrator</option>}
                        {roles.filter(r => r.isActive || r.id === form.roleId).map(r => <option key={r.id} value={r.id}>{r.name}{r.isActive ? "" : " (off)"}</option>)}
                    </select>
                    <p className="text-[11.5px] text-[var(--text3)] mt-1">No role is picked for you. Administrator appears only when an Admin is signed in.</p>
                    {err("roleId")}
                </div>

                {showSites && (
                    <div>
                        <Label hint={selectedRole?.scope === "ASSIGNED_SITES" ? "This role sees only the sites picked here." : "Site team membership."}>Assigned sites</Label>
                        <SitePicker sites={siteOptions} value={form.siteIds} onChange={siteIds => set({ siteIds })} />
                        {err("siteIds")}
                    </div>
                )}

                <div>
                    <Label>Reports to</Label>
                    <input className={inputCls("bg-[var(--surface)]")} disabled value={form.reportsTo} placeholder="Filled from the employee record" />
                </div>

                <div>
                    <Label>Sign-in method</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {([["OTP", "OTP and MPIN", "Recommended for employees"], ["PASSWORD", "Password", "For office or non-employee accounts"]] as const).map(([v, l, h]) => (
                            <label key={v} className={`flex gap-3 rounded-xl border-2 p-3.5 ${form.loginMethod === v ? "border-[var(--accent)] bg-[var(--accent-light)]" : "border-[var(--border)]"} ${disabled ? "" : "cursor-pointer"}`}>
                                <input type="radio" name="login" checked={form.loginMethod === v} disabled={disabled} onChange={() => set({ loginMethod: v, password: "" })} className="mt-0.5 accent-[var(--accent)]" />
                                <span><span className="block text-[13.5px] font-medium text-[var(--text)]">{l}</span><span className="block text-[12px] text-[var(--text2)]">{h}</span></span>
                            </label>
                        ))}
                    </div>
                </div>

                {form.loginMethod === "PASSWORD" && (
                    <div>
                        <Label hint={!isNew && detail?.user.loginMethod === "PASSWORD" ? "Leave empty to keep the current password." : "They must change it at first sign-in."}>Initial password</Label>
                        <input className={inputCls("bg-[var(--surface)]")} type="password" autoComplete="new-password" value={form.password} disabled={disabled}
                            onChange={e => set({ password: e.target.value })} placeholder="At least 10 characters" />
                        {err("password")}
                    </div>
                )}

                {!isNew && canDeactivate && (
                    <label className="flex items-center gap-2 text-[13px] text-[var(--text2)]">
                        <input type="checkbox" checked={form.isActive} onChange={e => set({ isActive: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
                        Active — can sign in
                    </label>
                )}

                <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
                    <Link href="/admin/users" className={btnGhost}>Cancel</Link>
                    {canEdit && (
                        <button type="button" className={btnPrimary} onClick={submit} disabled={saving}>
                            {saving && <Loader2 size={14} className="animate-spin" />} {isNew ? "Create user" : "Save changes"}
                        </button>
                    )}
                </div>
            </div>

            {resetting && (
                <Modal title="Reset this login?" onClose={() => setResetting(false)}
                    footer={<><button className={btnGhost} onClick={() => setResetting(false)}>Cancel</button><button className={btnPrimary} onClick={resetLogin}>Reset login</button></>}>
                    <p className="p-5 text-[13.5px] text-[var(--text2)]">Their password and MPIN are cleared. Next time they sign in with an OTP to their mobile and set a new MPIN.</p>
                </Modal>
            )}
        </div>
    )
}

function EmployeeSearch({ value, onPick }: { value: { id: string; label: string } | null; onPick: (e: EmpHit | null) => void }) {
    const [q, setQ] = useState("")
    const [hits, setHits] = useState<EmpHit[]>([])
    const [open, setOpen] = useState(false)
    useEffect(() => {
        if (q.trim().length < 2) { setHits([]); return }
        const t = setTimeout(() => {
            api<EmpHit[]>(`/api/admin/users/employee-lookup?q=${encodeURIComponent(q.trim())}`).then(h => { setHits(h); setOpen(true) }).catch(() => setHits([]))
        }, 250)
        return () => clearTimeout(t)
    }, [q])

    if (value) {
        return (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-[13px]">
                <span className="text-[var(--text)]">{value.label}</span>
                <button type="button" onClick={() => onPick(null)} aria-label="Unlink employee" className="text-[var(--text3)] hover:text-[var(--text)]"><X size={15} /></button>
            </div>
        )
    }
    return (
        <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input className={inputCls("pl-9 bg-[var(--surface)]")} value={q} onChange={e => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)}
                placeholder="Search name or EMP ID" aria-label="Search employee" />
            {open && hits.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg max-h-72 overflow-y-auto">
                    {hits.map(h => (
                        <button key={h.id} type="button" disabled={h.hasLogin}
                            onClick={() => { onPick(h); setOpen(false); setQ("") }}
                            className="w-full text-left px-3 py-2 hover:bg-[var(--surface2)] disabled:opacity-50 disabled:cursor-not-allowed">
                            <p className="text-[13px] font-medium text-[var(--text)]">{h.name} <span className="text-[var(--text3)] font-normal">· {h.employeeId}</span></p>
                            <p className="text-[11.5px] text-[var(--text3)]">{h.designation ?? "—"}{h.hasLogin ? " · already has a login" : ""}</p>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
