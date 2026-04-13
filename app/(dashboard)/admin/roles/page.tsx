"use client"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Shield, Users, ChevronRight, X, Check, Loader2, Search } from "lucide-react"

// ─── Permission Definitions ───────────────────────────────────────────────────

const PERMISSION_GROUPS = [
    {
        group: "Employees",
        key: "employees",
        permissions: [
            { key: "employees.view",   label: "View Employees" },
            { key: "employees.create", label: "Add Employee" },
            { key: "employees.edit",   label: "Edit Employee" },
            { key: "employees.delete", label: "Delete Employee" },
        ]
    },
    {
        group: "Attendance",
        key: "attendance",
        permissions: [
            { key: "attendance.view",   label: "View Attendance" },
            { key: "attendance.manage", label: "Mark / Edit Attendance" },
        ]
    },
    {
        group: "Leaves",
        key: "leaves",
        permissions: [
            { key: "leaves.view",    label: "View Leaves" },
            { key: "leaves.manage",  label: "Manage Leaves" },
            { key: "leaves.approve", label: "Approve / Reject Leaves" },
        ]
    },
    {
        group: "Payroll",
        key: "payroll",
        permissions: [
            { key: "payroll.view",   label: "View Payroll" },
            { key: "payroll.manage", label: "Process Payroll" },
        ]
    },
    {
        group: "Documents",
        key: "documents",
        permissions: [
            { key: "documents.view",   label: "View Documents" },
            { key: "documents.upload", label: "Upload Documents" },
            { key: "documents.verify", label: "Verify Documents" },
        ]
    },
    {
        group: "Onboarding",
        key: "onboarding",
        permissions: [
            { key: "onboarding.view",   label: "View Onboarding" },
            { key: "onboarding.manage", label: "Manage Onboarding" },
        ]
    },
    {
        group: "Performance",
        key: "performance",
        permissions: [
            { key: "performance.view",   label: "View Performance" },
            { key: "performance.manage", label: "Manage Reviews & KPIs" },
        ]
    },
    {
        group: "Assets",
        key: "assets",
        permissions: [
            { key: "assets.view",   label: "View Assets" },
            { key: "assets.manage", label: "Assign / Return Assets" },
        ]
    },
    {
        group: "Recruitment",
        key: "recruitment",
        permissions: [
            { key: "recruitment.view",   label: "View Recruitment" },
            { key: "recruitment.manage", label: "Manage Candidates" },
        ]
    },
    {
        group: "Reports",
        key: "reports",
        permissions: [
            { key: "reports.view",   label: "View Reports" },
            { key: "reports.export", label: "Export Reports" },
        ]
    },
    {
        group: "Helpdesk",
        key: "helpdesk",
        permissions: [
            { key: "helpdesk.view",   label: "View Tickets" },
            { key: "helpdesk.manage", label: "Manage Tickets" },
        ]
    },
    {
        group: "LMS",
        key: "lms",
        permissions: [
            { key: "lms.view",   label: "View Courses" },
            { key: "lms.manage", label: "Manage Courses & Enrollments" },
        ]
    },
]

const ROLE_COLORS = [
    "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
    "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#64748b",
]

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomRole = {
    id: string
    name: string
    description: string | null
    permissions: string[]
    color: string
    isActive: boolean
    createdAt: string
    _count: { users: number }
}

type RoleForm = {
    name: string
    description: string
    permissions: string[]
    color: string
}

const EMPTY_FORM: RoleForm = { name: "", description: "", permissions: [], color: "#6366f1" }

// ─── Role Form Modal ──────────────────────────────────────────────────────────

function RoleModal({ open, onClose, onSaved, editing }: {
    open: boolean
    onClose: () => void
    onSaved: () => void
    editing: CustomRole | null
}) {
    const [form, setForm] = useState<RoleForm>(EMPTY_FORM)
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState("")

    useEffect(() => {
        if (open) {
            setForm(editing ? {
                name: editing.name,
                description: editing.description || "",
                permissions: editing.permissions,
                color: editing.color,
            } : EMPTY_FORM)
            setSearch("")
        }
    }, [open, editing])

    const togglePermission = (key: string) => {
        setForm(f => ({
            ...f,
            permissions: f.permissions.includes(key)
                ? f.permissions.filter(p => p !== key)
                : [...f.permissions, key]
        }))
    }

    const toggleGroup = (groupPerms: string[]) => {
        const allSelected = groupPerms.every(p => form.permissions.includes(p))
        if (allSelected) {
            setForm(f => ({ ...f, permissions: f.permissions.filter(p => !groupPerms.includes(p)) }))
        } else {
            setForm(f => ({ ...f, permissions: [...new Set([...f.permissions, ...groupPerms])] }))
        }
    }

    const handleSubmit = async () => {
        if (!form.name.trim()) { toast.error("Role name is required"); return }
        setSaving(true)
        try {
            const url = editing ? `/api/admin/roles/${editing.id}` : "/api/admin/roles"
            const method = editing ? "PUT" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(editing ? "Role updated!" : "Role created!")
            onSaved()
            onClose()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to save")
        } finally {
            setSaving(false)
        }
    }

    if (!open) return null

    const filteredGroups = search
        ? PERMISSION_GROUPS.map(g => ({
            ...g,
            permissions: g.permissions.filter(p => p.label.toLowerCase().includes(search.toLowerCase()))
        })).filter(g => g.permissions.length > 0)
        : PERMISSION_GROUPS

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 9, background: form.color + "22", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Shield size={17} style={{ color: form.color }} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>{editing ? "Edit Role" : "Create New Role"}</h2>
                            <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>{form.permissions.length} permissions selected</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "none", cursor: "pointer", color: "var(--text3)" }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ display: "flex", gap: 0, flex: 1, overflow: "hidden" }}>
                    {/* Left — basic info */}
                    <div style={{ width: 220, padding: "20px 16px", borderRight: "1px solid var(--border)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.4px" }}>Role Name *</label>
                            <input
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. HR Executive"
                                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, background: "#fff", color: "var(--text)", boxSizing: "border-box", outline: "none" }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.4px" }}>Description</label>
                            <textarea
                                value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="What does this role do?"
                                rows={3}
                                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, background: "#fff", color: "var(--text)", resize: "none", boxSizing: "border-box", outline: "none" }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.4px" }}>Color</label>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {ROLE_COLORS.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setForm(f => ({ ...f, color: c }))}
                                        style={{ width: 24, height: 24, borderRadius: 6, background: c, border: form.color === c ? "2.5px solid #000" : "2px solid transparent", cursor: "pointer", outline: "none" }}
                                    />
                                ))}
                            </div>
                        </div>
                        <div style={{ marginTop: "auto" }}>
                            <button
                                onClick={() => setForm(f => ({ ...f, permissions: PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key)) }))}
                                style={{ width: "100%", padding: "6px 0", borderRadius: 8, border: "1px solid var(--border)", background: "none", cursor: "pointer", fontSize: 12, color: "var(--text3)", marginBottom: 6 }}
                            >
                                Select All Permissions
                            </button>
                            <button
                                onClick={() => setForm(f => ({ ...f, permissions: [] }))}
                                style={{ width: "100%", padding: "6px 0", borderRadius: 8, border: "1px solid var(--border)", background: "none", cursor: "pointer", fontSize: 12, color: "var(--text3)" }}
                            >
                                Clear All
                            </button>
                        </div>
                    </div>

                    {/* Right — permissions */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
                                <Search size={13} style={{ color: "var(--text3)", flexShrink: 0 }} />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search permissions…"
                                    style={{ flex: 1, border: "none", background: "none", fontSize: 13, color: "var(--text)", outline: "none" }}
                                />
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
                            {filteredGroups.map(group => {
                                const groupKeys = group.permissions.map(p => p.key)
                                const allChecked = groupKeys.every(k => form.permissions.includes(k))
                                const someChecked = groupKeys.some(k => form.permissions.includes(k))
                                return (
                                    <div key={group.key}>
                                        <div
                                            onClick={() => toggleGroup(groupKeys)}
                                            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}
                                        >
                                            <div style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid", borderColor: allChecked ? "var(--accent)" : someChecked ? "var(--accent)" : "var(--border)", background: allChecked ? "var(--accent)" : someChecked ? "var(--accent)22" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                {allChecked && <Check size={10} style={{ color: "#fff" }} />}
                                                {someChecked && !allChecked && <div style={{ width: 8, height: 2, background: "var(--accent)", borderRadius: 2 }} />}
                                            </div>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{group.group}</span>
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 8 }}>
                                            {group.permissions.map(perm => (
                                                <label key={perm.key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "5px 8px", borderRadius: 6, background: form.permissions.includes(perm.key) ? "var(--accent-light, #eef2ff)" : "transparent" }}>
                                                    <div
                                                        onClick={() => togglePermission(perm.key)}
                                                        style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid", borderColor: form.permissions.includes(perm.key) ? "var(--accent)" : "var(--border)", background: form.permissions.includes(perm.key) ? "var(--accent)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}
                                                    >
                                                        {form.permissions.includes(perm.key) && <Check size={10} style={{ color: "#fff" }} />}
                                                    </div>
                                                    <span style={{ fontSize: 13, color: "var(--text)" }}>{perm.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 9, border: "1px solid var(--border)", background: "none", cursor: "pointer", fontSize: 13, color: "var(--text)" }}>
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        style={{ padding: "8px 20px", borderRadius: 9, background: "var(--accent)", color: "#fff", border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}
                    >
                        {saving && <Loader2 size={13} className="animate-spin" />}
                        {editing ? "Save Changes" : "Create Role"}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteModal({ role, onClose, onDeleted }: { role: CustomRole; onClose: () => void; onDeleted: () => void }) {
    const [deleting, setDeleting] = useState(false)
    const handleDelete = async () => {
        setDeleting(true)
        try {
            const res = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Role deleted")
            onDeleted()
            onClose()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to delete")
        } finally {
            setDeleting(false)
        }
    }
    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 380 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                    <Trash2 size={20} style={{ color: "#dc2626" }} />
                </div>
                <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", margin: "0 0 6px" }}>Delete &quot;{role.name}&quot;?</h3>
                <p style={{ fontSize: 13, color: "var(--text3)", margin: "0 0 20px" }}>
                    This role will be unassigned from <strong>{role._count.users}</strong> user{role._count.users !== 1 ? "s" : ""}. This action cannot be undone.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={onClose} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid var(--border)", background: "none", cursor: "pointer", fontSize: 13 }}>Cancel</button>
                    <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "#dc2626", color: "#fff", border: "none", cursor: deleting ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: deleting ? 0.7 : 1 }}>
                        {deleting ? "Deleting…" : "Delete Role"}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RolesPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [roles, setRoles] = useState<CustomRole[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editing, setEditing] = useState<CustomRole | null>(null)
    const [deleting, setDeleting] = useState<CustomRole | null>(null)
    const [selectedRole, setSelectedRole] = useState<CustomRole | null>(null)

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        if (status === "authenticated" && session?.user?.role !== "ADMIN") router.push("/")
    }, [status, session, router])

    const fetchRoles = async () => {
        setLoading(true)
        try {
            const r = await fetch("/api/admin/roles")
            if (r.ok) setRoles(await r.json())
        } catch { /* ignore */ }
        finally { setLoading(false) }
    }

    useEffect(() => { fetchRoles() }, [])

    const allPermCount = PERMISSION_GROUPS.reduce((s, g) => s + g.permissions.length, 0)

    return (
        <div style={{ padding: "28px 32px", minHeight: "100vh", background: "var(--bg)" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Role Management</h1>
                    <p style={{ fontSize: 13, color: "var(--text3)", margin: "3px 0 0" }}>Create roles and define what each role can access</p>
                </div>
                <button
                    onClick={() => { setEditing(null); setShowModal(true) }}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                >
                    <Plus size={15} /> Create Role
                </button>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 14, marginBottom: 28, flexWrap: "wrap" }}>
                {[
                    { label: "Total Roles", value: roles.length, color: "#6366f1" },
                    { label: "Total Permissions", value: allPermCount, color: "#8b5cf6" },
                    { label: "Users with Custom Role", value: roles.reduce((s, r) => s + r._count.users, 0), color: "#0ea5e9" },
                ].map(s => (
                    <div key={s.label} style={{ flex: "1 1 160px", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px" }}>
                        <p style={{ fontSize: 24, fontWeight: 800, color: s.color, margin: "0 0 3px" }}>{s.value}</p>
                        <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Content */}
            {loading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
                    <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent)" }} />
                </div>
            ) : roles.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80, gap: 12, background: "#fff", borderRadius: 14, border: "1px solid var(--border)" }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Shield size={28} style={{ color: "#6366f1" }} />
                    </div>
                    <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: 0 }}>No roles created yet</p>
                    <p style={{ fontSize: 13, color: "var(--text3)", margin: 0 }}>Create your first role to manage employee access</p>
                    <button
                        onClick={() => { setEditing(null); setShowModal(true) }}
                        style={{ marginTop: 8, padding: "9px 20px", borderRadius: 9, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                    >
                        Create First Role
                    </button>
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
                    {/* Roles list */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {roles.map(role => (
                            <div
                                key={role.id}
                                onClick={() => setSelectedRole(role.id === selectedRole?.id ? null : role)}
                                style={{ background: "#fff", border: `1.5px solid ${selectedRole?.id === role.id ? role.color : "var(--border)"}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "border-color 0.15s" }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 10, background: role.color + "20", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <Shield size={18} style={{ color: role.color }} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>{role.name}</p>
                                            {!role.isActive && (
                                                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#fee2e2", color: "#dc2626", fontWeight: 600 }}>Inactive</span>
                                            )}
                                        </div>
                                        {role.description && <p style={{ fontSize: 12, color: "var(--text3)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{role.description}</p>}
                                        <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                                            <span style={{ fontSize: 11, color: "var(--text3)", display: "flex", alignItems: "center", gap: 4 }}>
                                                <Shield size={11} /> {role.permissions.length} permissions
                                            </span>
                                            <span style={{ fontSize: 11, color: "var(--text3)", display: "flex", alignItems: "center", gap: 4 }}>
                                                <Users size={11} /> {role._count.users} user{role._count.users !== 1 ? "s" : ""}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <button
                                            onClick={e => { e.stopPropagation(); setEditing(role); setShowModal(true) }}
                                            style={{ padding: 7, borderRadius: 7, border: "1px solid var(--border)", background: "none", cursor: "pointer", color: "var(--text3)" }}
                                        >
                                            <Pencil size={13} />
                                        </button>
                                        <button
                                            onClick={e => { e.stopPropagation(); setDeleting(role) }}
                                            style={{ padding: 7, borderRadius: 7, border: "1px solid #fee2e2", background: "none", cursor: "pointer", color: "#dc2626" }}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                        <ChevronRight size={16} style={{ color: "var(--text3)", alignSelf: "center", transform: selectedRole?.id === role.id ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Permission detail panel */}
                    {selectedRole ? (
                        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px", position: "sticky", top: 24 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 9, background: selectedRole.color + "20", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <Shield size={16} style={{ color: selectedRole.color }} />
                                </div>
                                <div>
                                    <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>{selectedRole.name}</p>
                                    <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>{selectedRole.permissions.length} of {allPermCount} permissions granted</p>
                                </div>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                {PERMISSION_GROUPS.map(group => {
                                    const granted = group.permissions.filter(p => selectedRole.permissions.includes(p.key))
                                    if (granted.length === 0) return null
                                    return (
                                        <div key={group.key}>
                                            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>{group.group}</p>
                                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                                {granted.map(p => (
                                                    <span key={p.key} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, background: selectedRole.color + "15", color: selectedRole.color, fontWeight: 600 }}>
                                                        {p.label}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                                {selectedRole.permissions.length === 0 && (
                                    <p style={{ fontSize: 13, color: "var(--text3)", margin: 0 }}>No permissions assigned to this role.</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ background: "#f8fafc", border: "1px dashed var(--border)", borderRadius: 14, padding: 40, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <Shield size={28} style={{ color: "var(--text3)" }} />
                            <p style={{ fontSize: 13, color: "var(--text3)", margin: 0 }}>Click a role to see its permissions</p>
                        </div>
                    )}
                </div>
            )}

            {showModal && (
                <RoleModal
                    open={showModal}
                    onClose={() => setShowModal(false)}
                    onSaved={fetchRoles}
                    editing={editing}
                />
            )}
            {deleting && (
                <DeleteModal
                    role={deleting}
                    onClose={() => setDeleting(null)}
                    onDeleted={fetchRoles}
                />
            )}
        </div>
    )
}
