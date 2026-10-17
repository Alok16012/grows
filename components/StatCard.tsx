"use client"

import type React from "react"
import { TrendingDown, TrendingUp, Minus } from "lucide-react"

// Decorative sparkline for the stat cards (fixed gentle wave — the app has no
// per-day employee history, so this is a visual cue, not real data).
function Sparkline({ color, seed = 0 }: { color: string; seed?: number }) {
    const base = [6, 10, 7, 13, 9, 15, 11, 17]
    const pts = base.map((v, i) => `${(i / (base.length - 1)) * 72},${22 - ((v + (seed % 3)) % 18)}`).join(" ")
    return (
        <svg viewBox="0 0 72 24" preserveAspectRatio="none" className="w-[84px] h-[30px] shrink-0">
            <polyline points={pts} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

// Gradient KPI tile, matching the admin dashboard's "Operations overview".
const STAT_GRADIENTS = {
    blue:   "linear-gradient(135deg,#2f6bff 0%,#1240d8 100%)",
    teal:   "linear-gradient(135deg,#14b8a6 0%,#0f766e 100%)",
    amber:  "linear-gradient(135deg,#ffd84d 0%,#f7a823 100%)",
    violet: "linear-gradient(135deg,#9b4dff 0%,#6d28d9 100%)",
    green:  "linear-gradient(135deg,#16a34a 0%,#166534 100%)",
    rose:   "linear-gradient(135deg,#f43f5e 0%,#be123c 100%)",
    sky:    "linear-gradient(135deg,#0284c7 0%,#075985 100%)",
    slate:  "linear-gradient(135deg,#64748b 0%,#334155 100%)",
} as const

export type StatTone = keyof typeof STAT_GRADIENTS

/** Grid for a row of StatCards — 2 per row on phones, all in one row on wide screens. */
export function statGridClass(count: number) {
    const xl = count >= 6 ? "xl:grid-cols-6" : count === 5 ? "xl:grid-cols-5" : count === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4"
    const lg = count >= 5 ? "lg:grid-cols-3" : count === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"
    return `grid grid-cols-2 ${lg} ${xl} gap-3 sm:gap-4`
}

/**
 * Gradient KPI tile used for the summary row at the top of every module page.
 * `value` may be a pre-formatted string (₹, %, decimals); numbers get en-IN grouping.
 * `trend` shows an arrow + text in the footer; `sub` shows plain footer text.
 */
export function StatCard({ label, value, icon, tone, trend, sub, seed = 0, onClick, active }: {
    label: string; value: number | string; icon: React.ReactNode; tone: StatTone
    trend?: { dir: "up" | "down" | "flat"; text: string }; sub?: string; seed?: number
    onClick?: () => void; active?: boolean
}) {
    const dark = tone === "amber"
    const Tag = onClick ? "button" : "div"
    const ink = dark ? "#3a2a00" : "#ffffff"
    return (
        <Tag
            {...(onClick ? { type: "button" as const, onClick } : {})}
            style={{ background: STAT_GRADIENTS[tone] }}
            aria-pressed={onClick && active !== undefined ? active : undefined}
            className={`relative overflow-hidden text-left rounded-[16px] p-4 sm:p-5 min-h-[128px] sm:min-h-[148px] flex flex-col transition-transform hover:-translate-y-0.5 shadow-[0_10px_24px_-12px_rgba(15,23,41,0.45)] ${active ? "ring-[3px] ring-offset-2 ring-offset-[var(--bg)] ring-[var(--accent)]" : ""} ${dark ? "text-[#1d1a0f]" : "text-white"}`}
        >
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10" />
            <div className="relative flex items-start justify-between mb-3 gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className={`w-8 h-8 sm:w-11 sm:h-11 rounded-[12px] flex items-center justify-center shrink-0 ${dark ? "bg-white/45" : "bg-white/20"}`}>
                        {icon}
                    </div>
                    <span className="min-w-0 text-[12.5px] sm:text-[15px] font-medium leading-tight">{label}</span>
                </div>
            </div>
            <div className="relative flex items-end justify-between gap-2">
                <p className="text-[28px] sm:text-[34px] font-bold leading-none tabular-nums tracking-[-0.02em]">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</p>
                <div className="hidden sm:block opacity-90 mb-0.5"><Sparkline color={dark ? "#b45309" : ink} seed={seed} /></div>
            </div>
            {trend && (
                <p className="relative mt-auto pt-2.5 text-[12.5px] sm:text-[13.5px] font-medium flex items-center gap-1.5">
                    {trend.dir === "up" ? <TrendingUp size={15} /> : trend.dir === "down" ? <TrendingDown size={15} /> : <Minus size={15} />}
                    {trend.text}
                </p>
            )}
            {!trend && sub && (
                <p className="relative mt-auto pt-2.5 text-[12.5px] sm:text-[13.5px] font-medium opacity-90 truncate">{sub}</p>
            )}
        </Tag>
    )
}
