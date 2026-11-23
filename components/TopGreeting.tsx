"use client"

// Top bar, desktop: "Good afternoon Ahmed!   11:30 AM   Sunday, 23 Nov 2026"
// (soft theme, client reference). Ticks every 30 seconds.
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"

export function TopGreeting() {
    const { data: session } = useSession()
    const [now, setNow] = useState<Date | null>(null)
    useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t) }, [])
    if (!now) return null
    const h = now.getHours()
    const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
    const first = (session?.user?.name ?? "").trim().split(/\s+/)[0]
    return (
        <div className="hidden md:flex items-center gap-6 lg:gap-8 min-w-0 whitespace-nowrap">
            <span className="text-[15px] font-medium text-[var(--text)] truncate">{greet}{first ? ` ${first}` : ""}!</span>
            <span className="text-[14px] text-[var(--text2)] tabular-nums">{now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase()}</span>
            <span className="hidden lg:inline text-[14px] text-[var(--text2)]">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
    )
}
