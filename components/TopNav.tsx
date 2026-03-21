"use client"

import { useState, useEffect, useRef } from "react"
import { Search, Menu, X, Building2, Folder, ClipboardCheck, Loader2, UserCircle, LogOut, ChevronDown, Bell, Settings, HelpCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

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
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const pathname = usePathname()

    const isAdminOrManager = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER"

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.length >= 2) {
                setLoading(true)
                try {
                    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
                    const data = await res.json()
                    setResults(data)
                    setIsOpen(true)
                } catch (error) {
                    console.error("Search fetch failed", error)
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
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setIsProfileOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    useEffect(() => {
        setIsOpen(false)
        setIsProfileOpen(false)
        setQuery("")
    }, [pathname])

    return (
        <div className="sticky top-0 z-30 flex h-[54px] items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-3 md:px-6 shrink-0 gap-2">
            {/* Left: Mobile Menu & Breadcrumb */}
            <div className="flex items-center gap-2 shrink-0">
                <button
                    onClick={onMenuClick}
                    suppressHydrationWarning
                    className="inline-flex items-center justify-center rounded-[10px] w-9 h-9 text-[var(--text2)] hover:bg-[var(--surface2)] active:bg-[var(--surface2)] md:hidden transition-colors"
                >
                    <Menu size={20} />
                </button>

                <div className="hidden md:flex items-center gap-2 text-[13px]">
                    <span className="text-[var(--text2)] hover:text-[var(--text)] cursor-pointer transition-colors">Safety records</span>
                    <span className="text-[var(--text3)] text-[10px]">›</span>
                    <span className="text-[var(--text)] font-medium">Inspections</span>
                </div>
            </div>

            {/* Center: Search Bar */}
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
                    {loading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text3)]" />
                        </div>
                    )}
                </div>

                {/* Search Results Dropdown */}
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
                                    <Link key={p.id} href={`/companies/${p.companyId}`} className="flex flex-col gap-0 px-3 py-1.5 rounded-[8px] hover:bg-[var(--surface2)] transition-colors">
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
                                    <Link key={i.id} href={`/approvals/${i.id}`} className="flex flex-col gap-0 px-3 py-1.5 rounded-[8px] hover:bg-[var(--surface2)] transition-colors">
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
                        <p className="text-[13px] text-[var(--text3)]">No results found for &quot;{query}&quot;</p>
                    </div>
                ) : null}
            </div>

            {/* Right: Actions & Profile */}
            <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2">
                    <button className="h-[34px] w-[34px] rounded-full flex items-center justify-center bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] transition-colors">
                        <HelpCircle size={18} />
                    </button>
                    <button className="h-[34px] w-[34px] rounded-full flex items-center justify-center bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] transition-colors relative">
                        <Bell size={18} />
                        <span className="absolute top-[8px] right-[8px] h-1.5 w-1.5 rounded-full bg-[var(--red)] border border-white"></span>
                    </button>
                    <button className="h-[34px] w-[34px] rounded-full flex items-center justify-center bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] transition-colors">
                        <Settings size={18} />
                    </button>
                </div>

                <div className="h-6 w-px bg-[var(--border)] mx-1 hidden sm:block"></div>

                <div className="relative" ref={profileRef}>
                    <button
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="flex items-center gap-2 p-1 rounded-full hover:bg-[var(--surface2)] transition-all"
                    >
                        <div className="h-[34px] w-[34px] rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-[13px] font-bold overflow-hidden shadow-sm">
                            {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : <UserCircle size={20} />}
                        </div>
                        <ChevronDown size={14} className={cn("text-[var(--text3)] transition-transform duration-200", isProfileOpen && "rotate-180")} />
                    </button>

                    {isProfileOpen && (
                        <div className="absolute right-0 mt-2 w-56 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-4 border-b border-[var(--border)] bg-[var(--surface2)]/50">
                                <p className="text-[13px] font-semibold text-[var(--text)] truncate">{session?.user?.name || "User"}</p>
                                <p className="text-[11px] text-[var(--text3)] truncate">{session?.user?.email}</p>
                                <div className="mt-2">
                                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent-text)] border border-[var(--accent-text)]/10">
                                        {session?.user?.role?.replace("_", " ") || "USER"}
                                    </span>
                                </div>
                            </div>

                            <div className="p-1">
                                <Link
                                    href="/profile"
                                    className="flex items-center gap-3 px-3 py-2 text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] rounded-[8px] transition-colors"
                                >
                                    <UserCircle size={16} />
                                    <span>Profile Settings</span>
                                </Link>
                                <button
                                    onClick={() => signOut({ redirect: true, callbackUrl: `/login?v=${Date.now()}` })}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-[var(--red)] hover:bg-[var(--red-light)] rounded-[8px] transition-colors mt-0.5"
                                >
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
