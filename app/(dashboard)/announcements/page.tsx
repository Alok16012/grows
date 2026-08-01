"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { format } from "date-fns"
import {
    Megaphone, CalendarDays, Pin, Plus, X, Loader2,
    Trash2, AlertCircle, PartyPopper, FileText, Bell, Users,
    Cake, Gift, ArrowRight, Clock, Award,
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

type Birthday = {
    id: string
    name: string
    photo: string | null
    designation: string | null
    department: string | null
    phone: string | null
    day: number
    month: number
    isToday: boolean
    inDays: number
}

type Anniversary = {
    id: string
    name: string
    photo: string | null
    designation: string | null
    department: string | null
    phone: string | null
    day: number
    month: number
    years: number
    isToday: boolean
    inDays: number
}

type Site = { id: string; name: string }
type Role = { id: string; name: string }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

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
    const [birthdays, setBirthdays] = useState<Birthday[]>([])
    const [anniversaries, setAnniversaries] = useState<Anniversary[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [roles, setRoles] = useState<Role[]>([])
    const [loading, setLoading] = useState(true)

    const [showAnnForm, setShowAnnForm] = useState(false)
    const [showHolForm, setShowHolForm] = useState(false)

    const load = useCallback(async () => {
        try {
            const [aRes, hRes, bRes, anRes] = await Promise.all([
                fetch("/api/announcements"),
                fetch(`/api/holidays?year=${new Date().getFullYear()}`),
                fetch("/api/birthdays?days=21"),
                fetch("/api/anniversaries?days=21"),
            ])
            setAnnouncements(aRes.ok ? await aRes.json() : [])
            setHolidays(hRes.ok ? await hRes.json() : [])
            const bData = bRes.ok ? await bRes.json() : { birthdays: [] }
            setBirthdays(Array.isArray(bData?.birthdays) ? bData.birthdays : [])
            const anData = anRes.ok ? await anRes.json() : { anniversaries: [] }
            setAnniversaries(Array.isArray(anData?.anniversaries) ? anData.anniversaries : [])
        } catch {
            setAnnouncements([])
            setHolidays([])
            setBirthdays([])
            setAnniversaries([])
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

    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0))
    const todaysBirthdays = birthdays.filter(b => b.isToday)
    const criticalAnns = announcements.filter(a => a.category === "URGENT" || a.pinned)
    const upcomingHolidays = holidays.filter(h => new Date(h.date) >= startOfToday)

    return (
        <div className="max-w-[1180px] mx-auto px-4 lg:px-1">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-[26px] font-bold text-[var(--text)] tracking-[-0.5px]">Announcements</h1>
                    <p className="text-[13.5px] text-[var(--text3)] mt-1">Company notices &amp; holiday calendar.</p>
                </div>
                {canManage && (
                    <div className="flex flex-wrap gap-2.5">
                        <button onClick={() => setShowHolForm(true)}
                            className="inline-flex items-center gap-2 h-[42px] px-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)] text-[13px] font-semibold hover:bg-[var(--surface2)] transition-colors">
                            <Plus size={16} /> Add Holiday
                        </button>
                        <button onClick={() => setShowAnnForm(true)}
                            className="inline-flex items-center gap-2 h-[42px] px-5 rounded-[10px] bg-[var(--accent)] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
                            style={{ boxShadow: "0 1px 3px rgba(26,158,110,0.35)" }}>
                            <Plus size={16} /> New Notice
                        </button>
                    </div>
                )}
            </div>

            {/* ── Stat cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <StatCard icon={<Megaphone size={18} />} tint="#3b82f6" value={announcements.length} label="Total Announcements" sub="All notices" />
                <StatCard icon={<AlertCircle size={18} />} tint="#dc2626" value={criticalAnns.length} label="Critical / Pinned" sub="Need attention" />
                <StatCard icon={<Cake size={18} />} tint="#d97706" value={todaysBirthdays.length} label="Birthdays Today" sub="Wish your colleagues" />
                <StatCard icon={<CalendarDays size={18} />} tint="#1a9e6e" value={upcomingHolidays.length} label="Upcoming Holidays" sub={`${new Date().getFullYear()}`} />
            </div>

            {/* ── Critical banner ── */}
            {criticalAnns.length > 0 && (
                <div className="mb-5 rounded-[12px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                        <AlertCircle size={15} className="text-[#dc2626]" />
                        <span className="text-[12px] font-bold text-[#dc2626] uppercase tracking-[0.5px]">Critical Announcements</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                        {criticalAnns.slice(0, 4).map(a => (
                            <span key={a.id} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text2)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#dc2626]" /> {a.title}
                            </span>
                        ))}
                    </div>
                </div>
            )}

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
                                                className="p-2 md:p-1 text-[var(--text3)] hover:text-[var(--red)] rounded-md hover:bg-[var(--surface2)] shrink-0">
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

                {/* ── Right column: Birthday Corner + Holidays ── */}
                <div className="space-y-5">

                {/* Birthday Corner */}
                <div>
                    <h2 className="text-[13px] font-semibold text-[var(--text2)] uppercase tracking-[0.5px] mb-3 flex items-center gap-1.5">
                        <Cake size={14} className="text-[#d97706]" /> Birthday Corner
                    </h2>
                    {birthdays.length === 0 ? (
                        <div className="rounded-[12px] border border-dashed border-[var(--border)] py-10 text-center">
                            <Gift size={26} className="mx-auto text-[var(--text3)] mb-2" />
                            <p className="text-[13px] text-[var(--text3)]">No birthdays in the next 3 weeks.</p>
                        </div>
                    ) : (
                        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)] overflow-hidden">
                            {birthdays.slice(0, 8).map(b => (
                                <div key={b.id} className={`flex items-center gap-3 p-3 ${b.isToday ? "bg-[#fff8ec]" : ""}`}>
                                    <div className="relative shrink-0">
                                        {b.photo ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={b.photo} alt={b.name} className="w-12 h-12 rounded-full object-cover" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[13px] font-bold text-[var(--accent-text)]">
                                                {b.name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("")}
                                            </div>
                                        )}
                                        {b.isToday && <span className="absolute -top-1 -right-1 text-[12px]">🎂</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium text-[var(--text)] truncate">{b.name}</p>
                                        <p className="text-[11px] text-[var(--text3)] truncate">
                                            {b.designation || b.department || "Employee"} · {b.day} {MONTHS[b.month]}
                                        </p>
                                    </div>
                                    {b.isToday ? (
                                        <button onClick={() => wish(b)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[var(--accent)] text-white text-[11px] font-semibold hover:opacity-90 transition-opacity shrink-0">
                                            <PartyPopper size={12} /> Wish
                                        </button>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text3)] shrink-0">
                                            <Clock size={11} /> {b.inDays}d
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Work Anniversaries */}
                <div>
                    <h2 className="text-[13px] font-semibold text-[var(--text2)] uppercase tracking-[0.5px] mb-3 flex items-center gap-1.5">
                        <Award size={14} className="text-[#7c3aed]" /> Work Anniversaries
                    </h2>
                    {anniversaries.length === 0 ? (
                        <div className="rounded-[12px] border border-dashed border-[var(--border)] py-10 text-center">
                            <Award size={26} className="mx-auto text-[var(--text3)] mb-2" />
                            <p className="text-[13px] text-[var(--text3)]">No work anniversaries in the next 3 weeks.</p>
                        </div>
                    ) : (
                        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)] overflow-hidden">
                            {anniversaries.slice(0, 8).map(a => (
                                <div key={a.id} className={`flex items-center gap-3 p-3 ${a.isToday ? "bg-[#f6f1ff]" : ""}`}>
                                    <div className="relative shrink-0">
                                        {a.photo ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={a.photo} alt={a.name} className="w-12 h-12 rounded-full object-cover" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-[#efe7fb] flex items-center justify-center text-[13px] font-bold text-[#7c3aed]">
                                                {a.name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("")}
                                            </div>
                                        )}
                                        {a.isToday && <span className="absolute -top-1 -right-1 text-[12px]">🎉</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium text-[var(--text)] truncate">{a.name}</p>
                                        <p className="text-[11px] text-[var(--text3)] truncate">
                                            <span className="font-semibold text-[#7c3aed]">{a.years} {a.years === 1 ? "year" : "years"}</span> · {a.designation || a.department || "Employee"}
                                        </p>
                                    </div>
                                    {a.isToday ? (
                                        <button onClick={() => congratulate(a)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-white text-[11px] font-semibold hover:opacity-90 transition-opacity shrink-0"
                                            style={{ backgroundColor: "#7c3aed" }}>
                                            <PartyPopper size={12} /> Congrats
                                        </button>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text3)] shrink-0">
                                            <Clock size={11} /> {a.inDays}d
                                        </span>
                                    )}
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
                                                className="p-2 md:p-1 text-[var(--text3)] hover:text-[var(--red)] rounded-md hover:bg-[var(--surface2)] shrink-0">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
                </div>{/* /right column */}
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

    // Wish a colleague — open WhatsApp with a prefilled message when a phone is
    // available (managers/HR), otherwise just a cheerful confirmation toast.
    function wish(b: Birthday) {
        const msg = `Happy Birthday ${b.name}! 🎉🎂 Wishing you a wonderful year ahead.`
        if (b.phone) {
            const digits = b.phone.replace(/\D/g, "")
            const num = digits.length === 10 ? `91${digits}` : digits
            window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank")
        } else {
            toast.success(`🎉 Birthday wish sent to ${b.name}!`)
        }
    }

    // Congratulate a colleague on their work anniversary.
    function congratulate(a: Anniversary) {
        const msg = `Congratulations ${a.name} on completing ${a.years} ${a.years === 1 ? "year" : "years"} with Growus! 🎉 Thank you for your contribution.`
        if (a.phone) {
            const digits = a.phone.replace(/\D/g, "")
            const num = digits.length === 10 ? `91${digits}` : digits
            window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank")
        } else {
            toast.success(`🎉 Anniversary wish sent to ${a.name}!`)
        }
    }
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon, tint, value, label, sub }: { icon: React.ReactNode; tint: string; value: number; label: string; sub: string }) {
    return (
        <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-[18px] flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0"
                style={{ color: tint, backgroundColor: tint + "1a" }}>
                {icon}
            </div>
            <div className="min-w-0">
                <p className="text-[12px] text-[var(--text3)] truncate">{label}</p>
                <p className="text-[24px] font-bold leading-tight tabular-nums" style={{ color: tint }}>{value}</p>
                <p className="text-[11px] text-[var(--text3)] truncate">{sub}</p>
            </div>
        </div>
    )
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
                    <button onClick={onClose} className="p-2 md:p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)]"><X size={18} /></button>
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
