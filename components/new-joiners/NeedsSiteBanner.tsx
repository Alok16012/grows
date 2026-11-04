"use client"

// "3 new joiners need a site" — a red strip for the Employee Directory and the
// dashboard, linking to the New Joiners page. Shows nothing when everyone is
// placed or the user can't see employees.

import { useEffect, useState } from "react"
import Link from "next/link"
import { MapPin, ArrowRight } from "lucide-react"
import { NEW_JOINERS_CHANGED } from "./format"

export function NeedsSiteBanner({ className = "" }: { className?: string }) {
    const [n, setN] = useState(0)
    useEffect(() => {
        let alive = true
        const load = () => fetch("/api/new-joiners?count=1")
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (alive && d) setN(d.needsSite ?? 0) })
            .catch(() => {})
        load()
        window.addEventListener(NEW_JOINERS_CHANGED, load)
        return () => { alive = false; window.removeEventListener(NEW_JOINERS_CHANGED, load) }
    }, [])
    if (n <= 0) return null
    return (
        <Link href="/employees/new-joiners" role="status"
            className={`flex items-center gap-2.5 rounded-[12px] border border-[#fecaca] bg-[var(--red-light)] px-4 py-2.5 text-[13px] text-[#991b1b] hover:border-[var(--red)] transition-colors ${className}`}>
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                <span className="absolute inset-0 rounded-full bg-[var(--red)] opacity-75 motion-safe:animate-ping" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-[var(--red)]" />
            </span>
            <MapPin size={15} className="shrink-0" />
            <span className="flex-1"><b>{n} new joiner{n === 1 ? "" : "s"}</b> {n === 1 ? "needs" : "need"} a site</span>
            <span className="font-semibold inline-flex items-center gap-1 shrink-0">Assign <ArrowRight size={14} /></span>
        </Link>
    )
}
