"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import {
    KeyRound, Search, Loader2, Copy, Eye, EyeOff, Pencil, Check, X, UserPlus, ShieldCheck, RefreshCw,
} from "lucide-react"

type Row = {
    employeeId: string
    empCode: string
    name: string
    designation: string | null
    phone: string | null
    department: string | null
    site: string | null
    hasLogin: boolean
    userId: string | null
    loginEmail: string | null
    password: string | null
    isActive: boolean | null
    systemRole: string | null
    customRole: { id: string; name: string; color: string } | null
}

type CustomRole = { id: string; name: string; color: string }

export default function EmployeeLoginsPage() {
    const [rows, setRows] = useState<Row[]>([])
    const [roles, setRoles] = useState<CustomRole[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [roleFilter, setRoleFilter] = useState("ALL")
    const [siteFilter, setSiteFilter] = useState("ALL")
    const [deptFilter, setDeptFilter] = useState("ALL")
    const [reveal, setReveal] = useState<Record<string, boolean>>({})
    const [generating, setGenerating] = useState(false)

    // Edit modal
    const [editing, setEditing] = useState<Row | null>(null)
    const [form, setForm] = useState({ loginEmail: "", password: "", customRoleId: "" })
    const [saving, setSaving] = useState(false)

    const fetchData = async () => {
        setLoading(true)
        try {
            const [r1, r2] = await Promise.all([
                fetch("/api/admin/employee-logins"),
                fetch("/api/admin/roles"),
            ])
            const data = await r1.json()
            const rolesData = r2.ok ? await r2.json() : []
            setRows(Array.isArray(data) ? data : [])
            setRoles(Array.isArray(rolesData) ? rolesData : [])
        } catch {
            toast.error("Failed to load employee logins")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [])

    const copy = (text: string, label: string) => {
        navigator.clipboard.writeText(text)
        toast.success(`${label} copied`)
    }

    const generateMissing = async () => {
        setGenerating(true)
        let created = 0, linked = 0, reset = 0, failed = 0
        let prevRemaining = Infinity
        try {
            // The server processes one batch per call and reports how many
            // employees still need a login. Keep calling until none remain so a
            // large list (hundreds) completes without hitting the function timeout.
            while (true) {
                const res = await fetch("/api/admin/employee-logins", { method: "POST" })
                const raw = await res.text()
                let data: any = {}
                try { data = raw ? JSON.parse(raw) : {} } catch { data = {} }
                if (!res.ok) {
                    throw new Error(data.error || data.message || raw.slice(0, 160) || `Failed (${res.status})`)
                }
                created += data.created || 0
                linked += data.linked || 0
                reset += data.reset || 0
                failed += data.failed || 0
                const remaining = data.remaining ?? 0
                if (remaining <= 0) break
                // Safety: if a batch made no dent (all failures), stop instead of looping forever.
                if (remaining >= prevRemaining) break
                prevRemaining = remaining
                toast.loading(`Generating logins… ${remaining} left`, { id: "gen-logins" })
            }
            toast.success(`Created ${created}, linked ${linked}, ${reset} password${reset === 1 ? "" : "s"} reset${failed ? `, ${failed} failed` : ""}`, { id: "gen-logins" })
            fetchData()
        } catch (e: any) {
            toast.error(e.message, { id: "gen-logins" })
        } finally {
            setGenerating(false)
        }
    }

    const openEdit = (row: Row) => {
        setEditing(row)
        setForm({ loginEmail: row.loginEmail || "", password: "", customRoleId: row.customRole?.id || "" })
    }

    const saveEdit = async () => {
        if (!editing) return
        setSaving(true)
        try {
            const res = await fetch(`/api/admin/employee-logins/${editing.employeeId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    loginEmail: form.loginEmail || undefined,
                    password: form.password || undefined,
                    customRoleId: form.customRoleId || null,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed to save")
            toast.success(editing.hasLogin ? "Login updated" : "Login created")
            setEditing(null)
            fetchData()
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setSaving(false)
        }
    }

    const roleBadge = (row: Row) => {
        if (row.customRole) {
            const c = row.customRole.color || "#6366f1"
            return (
                <span className="px-[9px] py-0.5 rounded-[20px] text-[11px] font-medium"
                    style={{ background: `${c}20`, color: c }}>
                    {row.customRole.name}
                </span>
            )
        }
        if (!row.hasLogin) return <span className="text-[12px] text-[#9e9b95]">—</span>
        return <span className="px-[9px] py-0.5 rounded-[20px] text-[11px] font-medium bg-[#f9f8f5] text-[#9e9b95]">No role</span>
    }

    // Filter option lists derived from the loaded rows.
    const siteOptions = Array.from(new Set(rows.map(r => r.site).filter(Boolean) as string[])).sort()
    const deptOptions = Array.from(new Set(rows.map(r => r.department).filter(Boolean) as string[])).sort()

    const filtered = rows.filter(r => {
        const q = search.toLowerCase()
        const matchesSearch = !q ||
            r.name.toLowerCase().includes(q) ||
            (r.loginEmail || "").toLowerCase().includes(q) ||
            (r.empCode || "").toLowerCase().includes(q)
        if (!matchesSearch) return false

        if (roleFilter !== "ALL") {
            if (roleFilter === "NONE") { if (r.customRole) return false }
            else if (r.customRole?.id !== roleFilter) return false
        }
        if (siteFilter !== "ALL" && (r.site || "") !== siteFilter) return false
        if (deptFilter !== "ALL" && (r.department || "") !== deptFilter) return false
        return true
    })

    const missingCount = rows.filter(r => !r.hasLogin || !r.password).length

    if (loading && rows.length === 0) {
        return (
            <div className="p-6 lg:p-7 flex h-[70vh] items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-[#1a9e6e]" />
            </div>
        )
    }

    return (
        <div className="p-6 lg:p-7">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a18]">Employee Logins</h1>
                    <p className="text-[13px] text-[#6b6860] mt-[3px]">Every employee&apos;s login id, password and role — view, copy and update</p>
                </div>
                <button
                    onClick={generateMissing}
                    disabled={generating || missingCount === 0}
                    className="px-3.5 h-9 bg-[#1a9e6e] text-white rounded-[9px] text-[13px] font-medium flex items-center gap-2 hover:bg-[#158a5e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    Generate logins &amp; passwords{missingCount > 0 ? ` (${missingCount})` : ""}
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="relative flex-1 min-w-[220px] max-w-[400px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95]" />
                    <input
                        placeholder="Search name, login id or code..."
                        className="w-full pl-9 pr-4 py-[9px] bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:outline-none focus:border-[#1a9e6e] focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] transition-shadow"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                {(() => {
                    const selCls = "h-9 px-2.5 bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] focus:outline-none focus:border-[#1a9e6e] cursor-pointer max-w-[170px]"
                    return (
                        <>
                            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={selCls} title="Filter by role">
                                <option value="ALL">All roles</option>
                                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                <option value="NONE">No role</option>
                            </select>
                            <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} className={selCls} title="Filter by site">
                                <option value="ALL">All sites</option>
                                {siteOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className={selCls} title="Filter by department">
                                <option value="ALL">All departments</option>
                                {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </>
                    )
                })()}
                {(roleFilter !== "ALL" || siteFilter !== "ALL" || deptFilter !== "ALL" || search) && (
                    <button
                        onClick={() => { setSearch(""); setRoleFilter("ALL"); setSiteFilter("ALL"); setDeptFilter("ALL") }}
                        className="h-9 px-3 rounded-[9px] bg-white border border-[#e8e6e1] text-[12px] font-medium text-[#6b6860] hover:bg-[#f9f8f5] transition-colors"
                    >
                        Clear
                    </button>
                )}
                <span className="text-[12px] text-[#9e9b95] ml-auto">{filtered.length} of {rows.length}</span>
                <button onClick={fetchData} className="h-9 w-9 rounded-[9px] bg-white border border-[#e8e6e1] flex items-center justify-center hover:bg-[#f9f8f5] transition-colors" title="Refresh">
                    <RefreshCw className="h-4 w-4 text-[#6b6860]" />
                </button>
            </div>

            <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[2fr_1.2fr_1.6fr_1.4fr_auto] gap-3 px-5 py-3 border-b border-[#e8e6e1] bg-[#faf9f7]">
                    <span className="text-[11px] font-semibold text-[#6b6860] uppercase tracking-wide">Employee</span>
                    <span className="text-[11px] font-semibold text-[#6b6860] uppercase tracking-wide">Role</span>
                    <span className="text-[11px] font-semibold text-[#6b6860] uppercase tracking-wide">Login ID</span>
                    <span className="text-[11px] font-semibold text-[#6b6860] uppercase tracking-wide">Password</span>
                    <span className="text-[11px] font-semibold text-[#6b6860] uppercase tracking-wide text-right">Actions</span>
                </div>

                {filtered.map((row, idx) => (
                    <div
                        key={row.employeeId}
                        className={`grid grid-cols-[2fr_1.2fr_1.6fr_1.4fr_auto] gap-3 px-5 py-3.5 items-center hover:bg-[#f9f8f5] transition-colors ${idx !== filtered.length - 1 ? "border-b border-[#e8e6e1]" : ""}`}
                    >
                        {/* Employee */}
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-[#f0efe9] flex items-center justify-center text-[13px] font-semibold text-[#6b6860] shrink-0"
                                style={row.customRole ? { background: `${row.customRole.color}20`, color: row.customRole.color } : {}}>
                                {row.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <div className="text-[13.5px] font-medium text-[#1a1a18] truncate">{row.name}</div>
                                <div className="text-[11.5px] text-[#9e9b95]">{row.empCode}</div>
                            </div>
                        </div>

                        {/* Role */}
                        <div>{roleBadge(row)}</div>

                        {/* Login ID */}
                        <div className="min-w-0">
                            {row.hasLogin && row.loginEmail ? (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[12.5px] text-[#1a1a18] truncate font-mono">{row.loginEmail}</span>
                                    <button onClick={() => copy(row.loginEmail!, "Login ID")} className="shrink-0 text-[#9e9b95] hover:text-[#1a9e6e]" title="Copy">
                                        <Copy className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <span className="text-[12px] text-[#c0392b]">No login</span>
                            )}
                        </div>

                        {/* Password */}
                        <div className="min-w-0">
                            {row.hasLogin && row.password ? (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[12.5px] text-[#1a1a18] truncate font-mono">
                                        {reveal[row.employeeId] ? row.password : "••••••••"}
                                    </span>
                                    <button onClick={() => setReveal(s => ({ ...s, [row.employeeId]: !s[row.employeeId] }))} className="shrink-0 text-[#9e9b95] hover:text-[#1a9e6e]" title="Show / hide">
                                        {reveal[row.employeeId] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    </button>
                                    <button onClick={() => copy(row.password!, "Password")} className="shrink-0 text-[#9e9b95] hover:text-[#1a9e6e]" title="Copy">
                                        <Copy className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ) : row.hasLogin ? (
                                <span className="text-[12px] text-[#9e9b95]">set via edit</span>
                            ) : (
                                <span className="text-[12px] text-[#9e9b95]">—</span>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-1.5">
                            <button
                                onClick={() => openEdit(row)}
                                className="h-[30px] px-2.5 rounded-[7px] bg-[#f9f8f5] border border-[#e8e6e1] flex items-center gap-1.5 text-[12px] text-[#6b6860] hover:bg-[#eff6ff] hover:text-[#1d4ed8] hover:border-[#93c5fd] transition-colors"
                                title={row.hasLogin ? "Edit login" : "Create login"}
                            >
                                {row.hasLogin ? <Pencil className="h-[13px] w-[13px]" /> : <KeyRound className="h-[13px] w-[13px]" />}
                                {row.hasLogin ? "Edit" : "Create"}
                            </button>
                        </div>
                    </div>
                ))}

                {filtered.length === 0 && (
                    <div className="py-[60px] text-center">
                        <div className="w-[56px] h-[56px] bg-[#e8f7f1] rounded-full flex items-center justify-center mx-auto mb-4">
                            <KeyRound className="h-6 w-6 text-[#1a9e6e]" />
                        </div>
                        <h3 className="text-[15px] font-semibold text-[#1a1a18] mb-1.5">No employees found</h3>
                        <p className="text-[13px] text-[#6b6860]">Try a different search.</p>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-[440px] max-w-[95vw] p-7 shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
                        <div className="flex items-start justify-between mb-5">
                            <div>
                                <h2 className="text-[17px] font-semibold text-[#1a1a18]">{editing.hasLogin ? "Edit Login" : "Create Login"}</h2>
                                <p className="text-[13px] text-[#6b6860] mt-1">{editing.name} · {editing.empCode}</p>
                            </div>
                            <button onClick={() => setEditing(null)} className="h-[30px] w-[30px] rounded-[8px] bg-[#f9f8f5] border border-[#e8e6e1] text-[#6b6860] hover:bg-[#fef2f2] hover:text-[#dc2626] hover:border-[#fca5a5] transition-colors flex items-center justify-center">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="border-t border-[#e8e6e1] mb-5" />
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Login ID (email)</label>
                                <input
                                    type="text"
                                    value={form.loginEmail}
                                    onChange={e => setForm({ ...form, loginEmail: e.target.value })}
                                    placeholder="name@cims.app"
                                    className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] font-mono focus:outline-none focus:border-[#1a9e6e] focus:bg-white"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">
                                    {editing.hasLogin ? "New Password (leave blank to keep)" : "Password (blank = auto Grow@xxxx)"}
                                </label>
                                <input
                                    type="text"
                                    value={form.password}
                                    onChange={e => setForm({ ...form, password: e.target.value })}
                                    placeholder={editing.hasLogin ? "Enter new password" : "Auto-generated if blank"}
                                    className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] font-mono focus:outline-none focus:border-[#1a9e6e] focus:bg-white"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Role</label>
                                <select
                                    value={form.customRoleId}
                                    onChange={e => setForm({ ...form, customRoleId: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] focus:outline-none focus:border-[#1a9e6e] focus:bg-white appearance-none cursor-pointer"
                                >
                                    <option value="">— No role —</option>
                                    {roles.map(r => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-[#9e9b95] flex items-center gap-1 pt-0.5">
                                    <ShieldCheck className="h-3 w-3" /> Access is decided by the assigned role&apos;s permissions
                                </p>
                            </div>
                            <div className="border-t border-[#e8e6e1] pt-4">
                                <button
                                    onClick={saveEdit}
                                    disabled={saving}
                                    className="w-full py-3 bg-[#1a9e6e] text-white rounded-[9px] text-[13.5px] font-medium hover:bg-[#158a5e] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Check className="h-4 w-4" /> {editing.hasLogin ? "Save Changes" : "Create Login"}</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
