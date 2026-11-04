"use client"

// Top-bar "New joiners" alert, next to the bell. A red, pulsing badge counts
// new joiners with no site yet; the panel lists them with joining date, who
// added them and how long they have waited, with an "Assign site" form on each
// row. Once a site is saved the person moves to "Recently deployed" (green,
// with the site name) and drops off after a week. Worked out live by
// /api/new-joiners — there are no messages to clear by hand.

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { UserPlus, MapPin, ArrowRight, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { NewJoiner } from "@/lib/new-joiners"
import { AssignSiteForm } from "./AssignSiteForm"
import { fmtDate, daysText, joiningText, NEW_JOINERS_CHANGED, announceNewJoinersChanged } from "./format"

type Data = { needsSite: NewJoiner[]; recentlyDeployed: NewJoiner[]; canAssign: boolean; windowDays: number; recentDays: number }
type Counts = { needsSite: number; recentlyDeployed: number }

export function NewJoinersAlert() {
    const [allowed, setAllowed] = useState(true)
    const [counts, setCounts] = useState<Counts>({ needsSite: 0, recentlyDeployed: 0 })
    const [data, setData] = useState<Data | null>(null)
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [assigning, setAssigning] = useState<string | null>(null)
    const ref = useRef<HTMLDivElement>(null)
    const pathname = usePathname()

    const fetchCounts = useCallback(async () => {
        try {
            const r = await fetch("/api/new-joiners?count=1")
            // No employees.view: this alert isn't for this user. Stop asking.
            if (r.status === 401 || r.status === 403) { setAllowed(false); return }
            if (r.ok) setCounts(await r.json())
        } catch { /* offline — keep the last count */ }
    }, [])

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const r = await fetch("/api/new-joiners")
            if (r.status === 401 || r.status === 403) { setAllowed(false); return }
            if (r.ok) {
                const d: Data = await r.json()
                setData(d)
                setCounts({ needsSite: d.needsSite.length, recentlyDeployed: d.recentlyDeployed.length })
            }
        } catch { /* keep what we had */ } finally { setLoading(false) }
    }, [])

    // Badge: on load, every 60 s while the tab is visible, and right after any
    // posting made on this page (the event from the New Joiners page / this panel).
    useEffect(() => {
        fetchCounts()
        const t = setInterval(() => { if (!document.hidden) fetchCounts() }, 60_000)
        const onVisible = () => { if (!document.hidden) fetchCounts() }
        const onChanged = () => { fetchCounts(); if (open) fetchList() }
        document.addEventListener("visibilitychange", onVisible)
        window.addEventListener(NEW_JOINERS_CHANGED, onChanged)
        return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener(NEW_JOINERS_CHANGED, onChanged) }
    }, [fetchCounts, fetchList, open])

    useEffect(() => {
        const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
        document.addEventListener("mousedown", close)
        document.addEventListener("keydown", esc)
        return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc) }
    }, [])
    useEffect(() => { setOpen(false); setAssigning(null) }, [pathname])

    if (!allowed) return null

    const red = counts.needsSite
    const label = red > 0
        ? `New joiners: ${red} need${red === 1 ? "s" : ""} a site`
        : counts.recentlyDeployed > 0 ? `New joiners: ${counts.recentlyDeployed} recently deployed` : "New joiners"

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                aria-label={label}
                title={label}
                aria-expanded={open}
                aria-controls="new-joiners-panel"
                onClick={() => { const o = !open; setOpen(o); if (o) fetchList() }}
                className={cn(
                    "h-10 w-10 md:h-11 md:w-11 rounded-full flex items-center justify-center bg-[var(--surface)] md:bg-transparent shadow-[var(--shadow-card)] md:shadow-none hover:bg-[var(--surface)] transition-colors relative",
                    red > 0 ? "text-[var(--red)]" : "text-[var(--text)] hover:text-[var(--accent)]",
                )}
            >
                <UserPlus size={21} />
                {red > 0 ? (
                    <span className="absolute top-0 right-0 h-[18px] min-w-[18px]" aria-hidden="true">
                        {/* The blink: a red halo pulsing out of the badge (still for reduced motion). */}
                        <span className="absolute inset-0 rounded-full bg-[var(--red)] opacity-75 motion-safe:animate-ping" />
                        <span className="relative h-[18px] min-w-[18px] px-1 rounded-full bg-[var(--red)] text-white text-[9.5px] font-bold flex items-center justify-center ring-2 ring-[var(--bg)]">
                            {red > 99 ? "99+" : red}
                        </span>
                    </span>
                ) : counts.recentlyDeployed > 0 ? (
                    <span className="absolute top-[7px] right-[7px] h-2.5 w-2.5 rounded-full bg-[#16a34a] ring-2 ring-[var(--bg)]" aria-hidden="true" />
                ) : null}
            </button>

            {open && (
                <div id="new-joiners-panel" role="region" aria-label="New joiners"
                    className="fixed left-3 right-3 top-[64px] sm:absolute sm:left-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[400px] rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface2)]/50">
                        <h3 className="text-[13px] font-semibold text-[var(--text)]">New joiners</h3>
                        {loading && <Loader2 size={14} className="animate-spin text-[var(--text3)]" />}
                    </div>
                    <div className="max-h-[calc(100dvh-240px)] sm:max-h-[460px] overflow-y-auto">
                        {!data ? (
                            <div className="p-6 text-center text-[12px] text-[var(--text3)]">Loading…</div>
                        ) : data.needsSite.length === 0 && data.recentlyDeployed.length === 0 ? (
                            <div className="p-8 text-center">
                                <UserPlus className="h-8 w-8 mx-auto text-[var(--text3)] mb-2 opacity-30" />
                                <p className="text-[12px] text-[var(--text3)]">No new joiners in the last {data.windowDays} days</p>
                            </div>
                        ) : (
                            <>
                                {data.needsSite.length > 0 && (
                                    <section aria-label="Needs a site">
                                        <h4 className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--red)]">Needs a site · {data.needsSite.length}</h4>
                                        {data.needsSite.map(j => (
                                            <div key={j.id} className="px-4 py-2.5 border-b border-[var(--border)] last:border-0 bg-[var(--red-light)]/60">
                                                <div className="flex items-start gap-2">
                                                    <span className="mt-[5px] h-2 w-2 rounded-full bg-[var(--red)] shrink-0 motion-safe:animate-pulse" aria-hidden="true" />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <p className="text-[12.5px] font-semibold text-[var(--text)] truncate min-w-0">
                                                                {j.name} <span className="font-normal text-[var(--text3)]">· {j.code}</span>
                                                            </p>
                                                            {j.onboarding && <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--amber-light)] text-[#92400e]">Onboarding</span>}
                                                        </div>
                                                        <p className="text-[11px] text-[var(--text2)] mt-0.5">{joiningText(j)}{j.designation ? ` · ${j.designation}` : ""}</p>
                                                        <p className="text-[11px] font-medium text-[var(--red)] mt-0.5">
                                                            No site yet · added {fmtDate(j.addedOn)}{j.addedBy ? ` by ${j.addedBy}` : ""}{j.daysWithoutSite ? ` · waiting ${daysText(j.daysWithoutSite)}` : ""}
                                                        </p>
                                                        {assigning === j.id ? (
                                                            <AssignSiteForm compact joiner={j} onCancel={() => setAssigning(null)}
                                                                onDone={site => { setAssigning(null); toast.success(`${j.name} assigned to ${site}`); announceNewJoinersChanged(); fetchList() }} />
                                                        ) : data.canAssign ? (
                                                            <button type="button" onClick={() => setAssigning(j.id)}
                                                                className="mt-1.5 inline-flex items-center gap-1 h-7 px-2.5 rounded-[7px] text-[11.5px] font-semibold text-white bg-[var(--red)] hover:opacity-90">
                                                                <MapPin size={12} /> Assign site
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </section>
                                )}
                                {data.recentlyDeployed.length > 0 && (
                                    <section aria-label="Recently deployed">
                                        <h4 className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#15803d]">Recently deployed · last {data.recentDays} days</h4>
                                        {data.recentlyDeployed.map(j => (
                                            <div key={j.id} className="px-4 py-2.5 border-b border-[var(--border)] last:border-0">
                                                <div className="flex items-start gap-2">
                                                    <span className="mt-[5px] h-2 w-2 rounded-full bg-[#16a34a] shrink-0" aria-hidden="true" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[12.5px] font-semibold text-[var(--text)] truncate">{j.name} <span className="font-normal text-[var(--text3)]">· {j.code}</span></p>
                                                        <p className="text-[11px] text-[var(--text2)] mt-0.5">{joiningText(j)}</p>
                                                        <p className="text-[11px] font-medium text-[#15803d] mt-0.5">
                                                            Deployed at {j.site!.name} from {fmtDate(j.site!.since)}{j.site!.assignedBy ? ` · by ${j.site!.assignedBy}` : ""}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </section>
                                )}
                            </>
                        )}
                    </div>
                    <Link href="/employees/new-joiners" className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-[var(--border)] text-[12px] font-semibold text-[var(--accent)] hover:bg-[var(--surface2)]">
                        Open New Joiners & register <ArrowRight size={13} />
                    </Link>
                </div>
            )}
        </div>
    )
}
