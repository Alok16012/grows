"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { format } from "date-fns"
import {
    Megaphone, CalendarDays, Pin, Plus, X, Loader2,
    Trash2, AlertCircle, PartyPopper, FileText, Bell, Users,
} from "lucide-react"
import { can } from "@/lib/can"

// ─── Types ──────────────────────────────────────────────────────────────────

type Announcement = {
    id: string
    title: string
    body: string
    category: string
    pinned: boolean
    isActive: boolean
    publishedAt: string
    createdAt: string
    targetSiteIds?: string[]
    targetRoleIds?: string[]
}

type Holiday = {
    id: string
    name: string
    date: string
    type: string
    description?: string | null
    targetSiteIds?: string[]
    targetRoleIds?: string[]
}

type Site = { id: string; name: string }
type Role = { id: string; name: string }

// ─── Category styling ─────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
    NOTICE: { label: "Notice", color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe", icon: Bell },
    EVENT:  { label: "Event",  color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe", icon: PartyPopper },
    POLICY: { label: "Policy", color: "#1a9e6e", bg: "#e8f7f1", border: "#6ee7b7", icon: FileText },
    URGENT: { label: "Urgent", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: AlertCircle },
}

const HOLIDAY_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    PUBLIC:     { label: "Public",     color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    RESTRICTED: { label: "Restricted", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
    COMPANY:    { label: "Company",    color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
}

const CATEGORIES = ["NOTICE", "EVENT", "POLICY", "URGENT"]
const HOLIDAY_TYPES = ["PUBLIC", "RESTRICTED", "COMPANY"]

// ─── Badges ──────────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
    const c = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.NOTICE
    const Icon = c.icon
    return (
        <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[11px] font-medium"
            style={{ color: c.color, backgroundColor: c.bg, border: `1px solid ${c.border}` }}>
            <Icon size={11} /> {c.label}
        </span>
    )
}

function HolidayTypeBadge({ type }: { type: string }) {
    const c = HOLIDAY_TYPE_CONFIG[type] || HOLIDAY_TYPE_CONFIG.PUBLIC
    return (
        <span className="inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-medium"
            style={{ color: c.color, backgroundColor: c.bg, border: `1px solid ${c.border}` }}>
            {c.label}
        </span>
    )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
    const { data: session } = useSession()
    const canManage = can(session, "announcements.manage")

    const [announcements, setAnnouncements] = useState<Announcement[]>([])
    const [holidays, setHolidays] = useState<Holiday[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [roles, setRoles] = useState<Role[]>([])
    const [loading, setLoading] = useState(true)

    const [showAnnForm, setShowAnnForm] = useState(false)
    const [showHolForm, setShowHolForm] = useState(false)

    const load = useCallback(async () => {
        try {
            const [aRes, hRes] = await Promise.all([
                fetch("/api/announcements"),
                fetch(`/api/holidays?year=${new Date().getFullYear()}`),
            ])
            setAnnouncements(aRes.ok ? await aRes.json() : [])
            setHolidays(hRes.ok ? await hRes.json() : [])
        } catch {
            setAnnouncements([])
            setHolidays([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    // Managers need the site/role lists to target notices & holidays.
    useEffect(() => {
        if (!canManage) return
        fetch("/api/sites").then(r => r.ok ? r.json() : []).then(d => setSites(Array.isArray(d) ? d : [])).catch(() => {})
        fetch("/api/admin/roles").then(r => r.ok ? r.json() : []).then(d => setRoles(Array.isArray(d) ? d : [])).catch(() => {})
    }, [canManage])

    const siteName = (id: string) => sites.find(s => s.id === id)?.name || "site"
    const roleName = (id: string) => roles.find(r => r.id === id)?.name || "role"
    const audienceLabel = (siteIds?: string[], roleIds?: string[]) => {
        const parts: string[] = []
        if (siteIds?.length) parts.push(siteIds.map(siteName).join(", "))
        if (roleIds?.length) parts.push(roleIds.map(roleName).join(", "))
        return parts.length ? parts.join(" · ") : "Everyone"
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="animate-spin text-[var(--text3)]" size={28} />
            </div>
        )
    }

    return (
        <div className="max-w-[1100px] mx-auto px-1">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-[22px] font-bold text-[var(--text)] flex items-center gap-2">
                        <Megaphone size={22} className="text-[var(--accent)]" /> Announcements
                    </h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">Company notices &amp; holiday calendar</p>
                </div>
                {canManage && (
                    <div className="flex gap-2">
                        <button onClick={() => setShowAnnForm(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity">
                            <Plus size={15} /> New Notice
                        </button>
                        <button onClick={() => setShowHolForm(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-[13px] font-medium hover:bg-[var(--surface2)] transition-colors">
                            <Plus size={15} /> Add Holiday
                        </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
                {/* ── Company Notices ── */}
                <div>
                    <h2 className="text-[13px] font-semibold text-[var(--text2)] uppercase tracking-[0.5px] mb-3 flex items-center gap-1.5">
                        <Bell size={14} /> Company Notices
                    </h2>
                    {announcements.length === 0 ? (
                        <div className="rounded-[12px] border border-dashed border-[var(--border)] py-12 text-center">
                            <Megaphone size={28} className="mx-auto text-[var(--text3)] mb-2" />
                            <p className="text-[13px] text-[var(--text3)]">No announcements yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {announcements.map(a => (
                                <div key={a.id}
                                    className={`rounded-[12px] border bg-[var(--surface)] p-4 ${a.pinned ? "border-[var(--accent)]/40 bg-[var(--accent-light)]/30" : "border-[var(--border)]"}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {a.pinned && <Pin size={13} className="text-[var(--accent)]" />}
                                            <h3 className="text-[15px] font-semibold text-[var(--text)]">{a.title}</h3>
                                            <CategoryBadge category={a.category} />
                                        </div>
                                        {canManage && (
                                            <button onClick={() => handleDeleteAnn(a.id)}
                                                className="p-1 text-[var(--text3)] hover:text-[var(--red)] rounded-md hover:bg-[var(--surface2)] shrink-0">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[13px] text-[var(--text2)] mt-2 whitespace-pre-wrap leading-relaxed">{a.body}</p>
                                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                                        <p className="text-[11px] text-[var(--text3)]">
                                            {format(new Date(a.publishedAt), "dd MMM yyyy, h:mm a")}
                                        </p>
                                        {canManage && (
                                            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text3)]">
                                                <Users size={11} /> {audienceLabel(a.targetSiteIds, a.targetRoleIds)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Holiday List ── */}
                <div>
                    <h2 className="text-[13px] font-semibold text-[var(--text2)] uppercase tracking-[0.5px] mb-3 flex items-center gap-1.5">
                        <CalendarDays size={14} /> Holidays {new Date().getFullYear()}
                    </h2>
                    {holidays.length === 0 ? (
                        <div className="rounded-[12px] border border-dashed border-[var(--border)] py-12 text-center">
                            <CalendarDays size={28} className="mx-auto text-[var(--text3)] mb-2" />
                            <p className="text-[13px] text-[var(--text3)]">No holidays listed.</p>
                        </div>
                    ) : (
                        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)] overflow-hidden">
                            {holidays.map(h => {
                                const d = new Date(h.date)
                                return (
                                    <div key={h.id} className="flex items-center gap-3 p-3">
                                        <div className="flex flex-col items-center justify-center w-12 h-12 rounded-[8px] bg-[var(--surface2)] shrink-0">
                                            <span className="text-[15px] font-bold text-[var(--text)] leading-none">{format(d, "dd")}</span>
                                            <span className="text-[10px] text-[var(--text3)] uppercase mt-0.5">{format(d, "MMM")}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-[13px] font-medium text-[var(--text)] truncate">{h.name}</p>
                                                <HolidayTypeBadge type={h.type} />
                                            </div>
                                            <p className="text-[11px] text-[var(--text3)]">{format(d, "EEEE")}{h.description ? ` · ${h.description}` : ""}</p>
                                            {canManage && (
                                                <p className="inline-flex items-center gap-1 text-[11px] text-[var(--text3)] mt-0.5">
                                                    <Users size={11} /> {audienceLabel(h.targetSiteIds, h.targetRoleIds)}
                                                </p>
                                            )}
                                        </div>
                                        {canManage && (
                                            <button onClick={() => handleDeleteHoliday(h.id)}
                                                className="p-1 text-[var(--text3)] hover:text-[var(--red)] rounded-md hover:bg-[var(--surface2)] shrink-0">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {showAnnForm && <AnnouncementForm sites={sites} roles={roles} onClose={() => setShowAnnForm(false)} onSaved={() => { setShowAnnForm(false); load() }} />}
            {showHolForm && <HolidayForm sites={sites} roles={roles} onClose={() => setShowHolForm(false)} onSaved={() => { setShowHolForm(false); load() }} />}
        </div>
    )

    async function handleDeleteAnn(id: string) {
        if (!confirm("Delete this announcement?")) return
        const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" })
        if (res.ok) { toast.success("Announcement deleted"); load() }
        else toast.error("Failed to delete")
    }

    async function handleDeleteHoliday(id: string) {
        if (!confirm("Delete this holiday?")) return
        const res = await fetch(`/api/holidays/${id}`, { method: "DELETE" })
        if (res.ok) { toast.success("Holiday deleted"); load() }
        else toast.error("Failed to delete")
    }
}

// ─── Announcement create form ─────────────────────────────────────────────────

function AnnouncementForm({ sites, roles, onClose, onSaved }: { sites: Site[]; roles: Role[]; onClose: () => void; onSaved: () => void }) {
    const [title, setTitle] = useState("")
    const [body, setBody] = useState("")
    const [category, setCategory] = useState("NOTICE")
    const [pinned, setPinned] = useState(false)
    const [targetSiteIds, setTargetSiteIds] = useState<string[]>([])
    const [targetRoleIds, setTargetRoleIds] = useState<string[]>([])
    const [saving, setSaving] = useState(false)

    async function submit() {
        if (!title.trim() || !body.trim()) { toast.error("Title and body are required"); return }
        setSaving(true)
        try {
            const res = await fetch("/api/announcements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, body, category, pinned, targetSiteIds, targetRoleIds }),
            })
            if (res.ok) { toast.success("Announcement posted"); onSaved() }
            else toast.error((await res.text()) || "Failed to post")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer title="New Announcement" onClose={onClose}>
            <div className="space-y-4">
                <Field label="Title *">
                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Office closed on Diwali"
                        className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                </Field>
                <Field label="Category">
                    <select value={category} onChange={e => setCategory(e.target.value)}
                        className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors">
                        {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>)}
                    </select>
                </Field>
                <Field label="Message *">
                    <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder="Write the announcement details..."
                        className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none" />
                </Field>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="accent-[var(--accent)]" />
                    <span className="text-[13px] text-[var(--text2)]">Pin to top</span>
                </label>
                <AudiencePicker
                    sites={sites} roles={roles}
                    siteIds={targetSiteIds} roleIds={targetRoleIds}
                    setSiteIds={setTargetSiteIds} setRoleIds={setTargetRoleIds}
                />
            </div>
            <FormFooter saving={saving} onClose={onClose} onSubmit={submit} label="Post Announcement" />
        </Drawer>
    )
}

// ─── Holiday create form ──────────────────────────────────────────────────────

function HolidayForm({ sites, roles, onClose, onSaved }: { sites: Site[]; roles: Role[]; onClose: () => void; onSaved: () => void }) {
    const [name, setName] = useState("")
    const [date, setDate] = useState("")
    const [type, setType] = useState("PUBLIC")
    const [description, setDescription] = useState("")
    const [targetSiteIds, setTargetSiteIds] = useState<string[]>([])
    const [targetRoleIds, setTargetRoleIds] = useState<string[]>([])
    const [saving, setSaving] = useState(false)

    async function submit() {
        if (!name.trim() || !date) { toast.error("Name and date are required"); return }
        setSaving(true)
        try {
            const res = await fetch("/api/holidays", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, date, type, description, targetSiteIds, targetRoleIds }),
            })
            if (res.ok) { toast.success("Holiday added"); onSaved() }
            else toast.error((await res.text()) || "Failed to add")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer title="Add Holiday" onClose={onClose}>
            <div className="space-y-4">
                <Field label="Name *">
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Independence Day"
                        className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                </Field>
                <Field label="Date *">
                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                        className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                </Field>
                <Field label="Type">
                    <select value={type} onChange={e => setType(e.target.value)}
                        className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors">
                        {HOLIDAY_TYPES.map(t => <option key={t} value={t}>{HOLIDAY_TYPE_CONFIG[t].label}</option>)}
                    </select>
                </Field>
                <Field label="Description">
                    <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional note"
                        className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                </Field>
                <AudiencePicker
                    sites={sites} roles={roles}
                    siteIds={targetSiteIds} roleIds={targetRoleIds}
                    setSiteIds={setTargetSiteIds} setRoleIds={setTargetRoleIds}
                />
            </div>
            <FormFooter saving={saving} onClose={onClose} onSubmit={submit} label="Add Holiday" />
        </Drawer>
    )
}

// ─── Shared form primitives ───────────────────────────────────────────────────

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
            <div className="fixed top-0 right-0 h-full w-[420px] max-w-full z-50 bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
                    <h2 className="text-[15px] font-semibold text-[var(--text)]">{title}</h2>
                    <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)]"><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-5">{children}</div>
            </div>
        </>
    )
}

// Audience targeting picker — choose which sites/roles a notice or holiday is
// limited to. Nothing selected on a dimension = visible to everyone there.
function AudiencePicker({
    sites, roles, siteIds, roleIds, setSiteIds, setRoleIds,
}: {
    sites: Site[]; roles: Role[]
    siteIds: string[]; roleIds: string[]
    setSiteIds: (v: string[]) => void; setRoleIds: (v: string[]) => void
}) {
    const toggle = (arr: string[], id: string, set: (v: string[]) => void) =>
        set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])

    const Group = ({ label, items, selected, set }: { label: string; items: { id: string; name: string }[]; selected: string[]; set: (v: string[]) => void }) => (
        <Field label={`${label} ${selected.length ? `(${selected.length})` : "— Everyone"}`}>
            {items.length === 0 ? (
                <p className="text-[12px] text-[var(--text3)]">None available</p>
            ) : (
                <div className="max-h-[140px] overflow-y-auto rounded-[8px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
                    {items.map(it => (
                        <label key={it.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--surface2)]">
                            <input type="checkbox" checked={selected.includes(it.id)} onChange={() => toggle(selected, it.id, set)} className="accent-[var(--accent)]" />
                            <span className="text-[13px] text-[var(--text2)]">{it.name}</span>
                        </label>
                    ))}
                </div>
            )}
        </Field>
    )

    return (
        <div className="space-y-4 pt-2 mt-2 border-t border-[var(--border)]">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text2)]">
                <Users size={13} /> Audience <span className="font-normal text-[var(--text3)]">— leave blank for everyone</span>
            </div>
            <Group label="Sites" items={sites} selected={siteIds} set={setSiteIds} />
            <Group label="Roles" items={roles} selected={roleIds} set={setRoleIds} />
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-[12px] text-[var(--text2)]">{label}</label>
            {children}
        </div>
    )
}

function FormFooter({ saving, onClose, onSubmit, label }: { saving: boolean; onClose: () => void; onSubmit: () => void; label: string }) {
    return (
        <div className="flex gap-2 mt-6">
            <button onClick={onClose} disabled={saving}
                className="flex-1 py-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-[13px] font-medium hover:bg-[var(--surface2)] transition-colors">
                Cancel
            </button>
            <button onClick={onSubmit} disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} {label}
            </button>
        </div>
    )
}
