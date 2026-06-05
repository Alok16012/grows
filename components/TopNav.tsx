"use client"

import { useState, useEffect, useRef } from "react"
import { Search, Menu, X, Building2, Folder, ClipboardCheck, Loader2, UserCircle, LogOut, ChevronDown, Bell, Settings, HelpCircle, CheckCheck, ExternalLink } from "lucide-react"
import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"

interface SearchResults {
    companies: any[]
    projects: any[]
    inspections: any[]
}

export function TopNav({ onMenuClick }: { onMenuClick: () => void }) {
    const { data: session } = useSession()
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<SearchResults | null>(null)
    const [loading, setLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const profileRef = useRef<HTMLDivElement>(null)
    const notifRef = useRef<HTMLDivElement>(null)
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [isNotifOpen, setIsNotifOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const pathname = usePathname()

    const [notifications, setNotifications] = useState<any[]>([])
    const [unreadCount, setUnreadCount] = useState(0)

    useEffect(() => { setMounted(true) }, [])

    const fetchNotifs = async () => {
        try {
            const res = await fetch("/api/notifications")
            if (res.ok) {
                const data = await res.json()
                setNotifications(data.notifications || [])
                setUnreadCount(data.unreadCount || 0)
            }
        } catch { }
    }

    useEffect(() => {
        fetchNotifs()
        const interval = setInterval(fetchNotifs, 30000) // poll every 30s
        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.length >= 2) {
                setLoading(true)
                try {
                    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
                    const data = await res.json()
                    setResults(data)
                    setIsOpen(true)
                } catch {
                    console.error("Search fetch failed")
                } finally {
                    setLoading(false)
                }
            } else {
                setResults(null)
                setIsOpen(false)
            }
        }, 300)
        return () => clearTimeout(timer)
    }, [query])

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false)
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) setIsProfileOpen(false)
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) setIsNotifOpen(false)
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    useEffect(() => {
        setIsOpen(false)
        setIsProfileOpen(false)
        setIsNotifOpen(false)
        setQuery("")
    }, [pathname])

    const markAllRead = async () => {
        await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAllRead: true }) })
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
        setUnreadCount(0)
    }

    const markRead = async (id: string) => {
        await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
        setUnreadCount(prev => Math.max(0, prev - 1))
    }

    const notifTypeColor = (type: string) => {
        if (type === "report_approved") return "bg-green-100 text-green-700"
        if (type === "report_rejected") return "bg-red-100 text-red-700"
        if (type === "send_back") return "bg-orange-100 text-orange-700"
        if (type === "approval_needed") return "bg-yellow-100 text-yellow-700"
        if (type === "risk_alert") return "bg-red-100 text-red-700"
        return "bg-blue-100 text-blue-700"
    }

    return (
        <div className="sticky top-0 z-30 flex h-[54px] items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-3 md:px-6 shrink-0 gap-2">
            {/* Left */}
            <div className="flex items-center gap-2 shrink-0">
                <button onClick={onMenuClick} className="inline-flex items-center justify-center rounded-[10px] w-9 h-9 text-[var(--text2)] hover:bg-[var(--surface2)] md:hidden transition-colors">
                    <Menu size={20} />
                </button>
            </div>

            {/* Center: Search */}
            <div className="flex-1 max-w-[200px] sm:max-w-[400px] relative" ref={dropdownRef}>
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text3)] group-focus-within:text-[var(--accent)] transition-colors" />
                    <input
                        type="text"
                        placeholder="Search for anything..."
                        className="w-full h-9 pl-9 pr-4 bg-[var(--surface2)] border border-[var(--border)] rounded-[10px] text-[13px] text-[var(--text)] placeholder-[var(--text3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] focus:bg-[var(--surface)] transition-all"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => query.length >= 2 && setIsOpen(true)}
                    />
                    {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2"><Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text3)]" /></div>}
                </div>

                {isOpen && (results?.companies.length || results?.projects.length || results?.inspections.length) ? (
                    <div className="absolute top-full left-0 mt-2 w-full max-h-[400px] overflow-y-auto rounded-[12px] border border-[var(--border)] bg-[var(--surface)] shadow-xl z-50 p-2 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                        {results.companies.length > 0 && (
                            <section>
                                <h3 className="px-2 py-1 text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider mb-1">Companies</h3>
                                {results.companies.map(c => (
                                    <Link key={c.id} href={`/companies/${c.id}`} className="flex items-center gap-3 px-3 py-1.5 rounded-[8px] hover:bg-[var(--surface2)] transition-colors">
                                        <Building2 size={16} className="text-[var(--accent)]" />
                                        <span className="text-[13px] font-medium text-[var(--text)]">{c.name}</span>
                                    </Link>
                                ))}
                            </section>
                        )}
                        {results.projects.length > 0 && (
                            <section>
                                <h3 className="px-2 py-1 text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider mb-1">Projects</h3>
                                {results.projects.map(p => (
                                    <Link key={p.id} href={`/companies/${p.companyId}`} className="flex flex-col px-3 py-1.5 rounded-[8px] hover:bg-[var(--surface2)] transition-colors">
                                        <div className="flex items-center gap-3">
                                            <Folder size={16} className="text-blue-500" />
                                            <span className="text-[13px] font-medium text-[var(--text)]">{p.name}</span>
                                        </div>
                                        <span className="text-[10px] text-[var(--text3)] ml-7">{p.companyName}</span>
                                    </Link>
                                ))}
                            </section>
                        )}
                        {results.inspections.length > 0 && (
                            <section>
                                <h3 className="px-2 py-1 text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider mb-1">Inspections</h3>
                                {results.inspections.map(i => (
                                    <Link key={i.id} href={`/approvals/${i.id}`} className="flex flex-col px-3 py-1.5 rounded-[8px] hover:bg-[var(--surface2)] transition-colors">
                                        <div className="flex items-center gap-3">
                                            <ClipboardCheck size={16} className="text-[var(--accent)]" />
                                            <span className="text-[13px] font-medium text-[var(--text)]">{i.projectName}</span>
                                            <Badge variant="outline" className="ml-auto text-[9px] py-0 px-1.5 h-4 border-[var(--border)] text-[var(--text2)]">{i.status}</Badge>
                                        </div>
                                        <span className="text-[10px] text-[var(--text3)] ml-7">Inspector: {i.inspectorName}</span>
                                    </Link>
                                ))}
                            </section>
                        )}
                    </div>
                ) : isOpen && query.length >= 2 && !loading ? (
                    <div className="absolute top-full left-0 mt-2 w-full rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4 text-center shadow-lg z-50">
                        <p className="text-[13px] text-[var(--text3)]">No results for &quot;{query}&quot;</p>
                    </div>
                ) : null}
            </div>

            {/* Right */}
            <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2">
                    <button className="h-[34px] w-[34px] rounded-full flex items-center justify-center bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] transition-colors">
                        <HelpCircle size={18} />
                    </button>

                    {/* Notification Bell */}
                    <div className="relative" ref={notifRef}>
                        <button
                            onClick={() => setIsNotifOpen(!isNotifOpen)}
                            className="h-[34px] w-[34px] rounded-full flex items-center justify-center bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] transition-colors relative"
                        >
                            <Bell size={18} />
                            {unreadCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                                    {unreadCount > 9 ? "9+" : unreadCount}
                                </span>
                            )}
                        </button>

                        {isNotifOpen && (
                            <div className="absolute right-0 mt-2 w-80 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface2)]/50">
                                    <h3 className="text-[13px] font-semibold text-[var(--text)]">Notifications</h3>
                                    <div className="flex items-center gap-2">
                                        {unreadCount > 0 && (
                                            <button onClick={markAllRead} className="text-[11px] text-[var(--accent)] hover:underline flex items-center gap-1">
                                                <CheckCheck size={12} /> Mark all read
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="max-h-[340px] overflow-y-auto">
                                    {notifications.length === 0 ? (
                                        <div className="p-8 text-center">
                                            <Bell className="h-8 w-8 mx-auto text-[var(--text3)] mb-2 opacity-30" />
                                            <p className="text-[12px] text-[var(--text3)]">No notifications yet</p>
                                        </div>
                                    ) : notifications.map(n => (
                                        <div
                                            key={n.id}
                                            onClick={() => { markRead(n.id); if (n.link) window.location.href = n.link }}
                                            className={cn("px-4 py-3 border-b border-[var(--border)] last:border-0 cursor-pointer hover:bg-[var(--surface2)] transition-colors", !n.isRead && "bg-blue-50/40")}
                                        >
                                            <div className="flex items-start gap-2">
                                                <span className={cn("mt-0.5 shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase", notifTypeColor(n.type))}>
                                                    {n.type.replace(/_/g, " ")}
                                                </span>
                                                {!n.isRead && <span className="h-2 w-2 rounded-full bg-blue-500 mt-1 shrink-0 ml-auto" />}
                                            </div>
                                            <p className="text-[12px] font-semibold text-[var(--text)] mt-1">{n.title}</p>
                                            <p className="text-[11px] text-[var(--text2)] mt-0.5 line-clamp-2">{n.message}</p>
                                            <p className="text-[10px] text-[var(--text3)] mt-1">
                                                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <button className="h-[34px] w-[34px] rounded-full flex items-center justify-center bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] transition-colors">
                        <Settings size={18} />
                    </button>
                </div>

                <div className="h-6 w-px bg-[var(--border)] mx-1 hidden sm:block"></div>

                {/* Profile */}
                <div className="relative" ref={profileRef}>
                    <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="flex items-center gap-2 p-1 rounded-full hover:bg-[var(--surface2)] transition-all">
                        <div className="h-[34px] w-[34px] rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-[13px] font-bold overflow-hidden shadow-sm">
                            {mounted && (session?.user as any)?.photo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={(session?.user as any).photo} alt={session?.user?.name || "Profile"} className="h-full w-full object-cover" />
                            ) : mounted && session?.user?.name ? (
                                session.user.name.charAt(0).toUpperCase()
                            ) : (
                                <UserCircle size={20} />
                            )}
                        </div>
                        <ChevronDown size={14} className={cn("text-[var(--text3)] transition-transform duration-200", isProfileOpen && "rotate-180")} />
                    </button>

                    {isProfileOpen && (
                        <div className="absolute right-0 mt-2 w-56 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-4 border-b border-[var(--border)] bg-[var(--surface2)]/50">
                                <p className="text-[13px] font-semibold text-[var(--text)] truncate">{session?.user?.name || "User"}</p>
                                <p className="text-[11px] text-[var(--text3)] truncate">{session?.user?.email}</p>
                                <div className="mt-2">
                                    {(session?.user as any)?.customRoleName ? (
                                        <span
                                            style={{
                                                color: (session?.user as any)?.customRoleColor || "#6366f1",
                                                background: `${(session?.user as any)?.customRoleColor || "#6366f1"}15`,
                                                borderColor: `${(session?.user as any)?.customRoleColor || "#6366f1"}40`,
                                            }}
                                            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                                        >
                                            {(session?.user as any).customRoleName}
                                        </span>
                                    ) : (
                                        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent-text)] border border-[var(--accent-text)]/10">
                                            {session?.user?.role?.replace("_", " ") || "USER"}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="p-1">
                                <Link href="/profile" className="flex items-center gap-3 px-3 py-2 text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] rounded-[8px] transition-colors">
                                    <UserCircle size={16} />
                                    <span>Profile Settings</span>
                                </Link>
                                <button onClick={() => signOut({ redirect: true, callbackUrl: `/login?v=${Date.now()}` })} className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-[var(--red)] hover:bg-[var(--red-light)] rounded-[8px] transition-colors mt-0.5">
                                    <LogOut size={16} />
                                    <span>Sign Out</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
