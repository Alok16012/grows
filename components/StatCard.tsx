"use client"

import type React from "react"
import { TrendingDown, TrendingUp, Minus } from "lucide-react"

// Soft-tint KPI tile: a pale fill per tone, the label (with its icon) and the
// footer in the tone's mid shade, the figure in its darkest shade. Replaced the
// big gradient squares (about half the height, calmer on every page).
const SOFT = {
    blue:   { bg: "#eaf0ff", ink: "#0b3aa8", sub: "#3b5bb5" },
    teal:   { bg: "#e1f5ee", ink: "#085041", sub: "#0f6e56" },
    amber:  { bg: "#faeeda", ink: "#633806", sub: "#854f0b" },
    violet: { bg: "#efe7fe", ink: "#4c1d95", sub: "#6d4fe0" },
    green:  { bg: "#eaf3de", ink: "#27500a", sub: "#3b6d11" },
    rose:   { bg: "#fcebeb", ink: "#791f1f", sub: "#a32d2d" },
    sky:    { bg: "#e0f2fe", ink: "#0c4a6e", sub: "#075985" },
    slate:  { bg: "#eef1f5", ink: "#1e293b", sub: "#475569" },
} as const

export type StatTone = keyof typeof SOFT

/**
 * Container for a row of StatCards. On phones the cards form one swipeable
 * strip of equal, compact tiles (like a native app) instead of a ragged
 * 2-column grid; from 640px they lay out as a grid, all in one row on xl.
 */
export function statGridClass(count: number) {
    // Six across only on wide screens: beside the sidebar a 1280px laptop
    // leaves ~140px per tile and labels truncate ("Employe…"), so 3 × 2 there.
    const xl = count >= 6 ? "xl:grid-cols-3 2xl:grid-cols-6" : count === 5 ? "xl:grid-cols-5" : count === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4"
    const lg = count >= 5 ? "lg:grid-cols-3" : count === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"
    const sm = count === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
    return [
        "flex gap-2.5 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1",
        "[&>*]:shrink-0 [&>*]:basis-[44%] [&>*]:snap-start",
        `sm:grid ${sm} ${lg} ${xl} sm:gap-3 sm:overflow-visible sm:pb-0 sm:[&>*]:basis-auto`,
    ].join(" ")
}

/**
 * KPI tile used for the summary row at the top of every module page.
 * `value` may be a pre-formatted string (₹, %, decimals); numbers get en-IN grouping.
 * `trend` shows an arrow + text in the footer; `sub` shows plain footer text.
 * `seed` is accepted for older callers (it fed a decorative sparkline) and ignored.
 */
export function StatCard({ label, value, icon, tone, trend, sub, onClick, active, loading }: {
    label: string; value: number | string; icon: React.ReactNode; tone: StatTone
    trend?: { dir: "up" | "down" | "flat"; text: string }; sub?: string; seed?: number
    onClick?: () => void; active?: boolean
    /** Data still on its way: shows a pulsing bar instead of the value and
     *  hides the footer, so a slow load never reads as a real "0". */
    loading?: boolean
}) {
    const c = SOFT[tone] ?? SOFT.slate
    const Tag = onClick ? "button" : "div"
    const shown = typeof value === "number" ? value.toLocaleString("en-IN") : value
    return (
        <Tag
            {...(onClick ? { type: "button" as const, onClick } : {})}
            title={label}
            aria-pressed={onClick && active !== undefined ? active : undefined}
            style={{ background: c.bg }}
            className={`w-full h-full text-left rounded-[12px] px-3.5 py-2.5 flex flex-col min-w-0 transition-[filter] ${onClick ? "hover:brightness-[0.97]" : ""} ${active ? "ring-2 ring-offset-1 ring-offset-[var(--bg)] ring-[var(--accent)]" : ""}`}
        >
            <p className="flex items-center gap-1.5 text-[12px] font-semibold leading-tight min-w-0 [&>svg]:w-[14px] [&>svg]:h-[14px] [&>svg]:shrink-0" style={{ color: c.sub }}>
                {icon}<span className="truncate">{label}</span>
            </p>
            <div className="mt-1">
                {loading ? (
                    <span role="status" aria-label={`${label}: loading`} className="block h-[22px] w-16 rounded-[6px] animate-pulse bg-black/10" />
                ) : (
                    <p className="min-w-0 text-[19px] sm:text-[22px] font-bold leading-tight tabular-nums truncate" style={{ color: c.ink }}>{shown}</p>
                )}
            </div>
            {trend && !loading && (
                <p className="mt-0.5 text-[11px] leading-tight flex items-center gap-1 min-w-0" style={{ color: c.sub }}>
                    {trend.dir === "up" ? <TrendingUp size={12} className="shrink-0" /> : trend.dir === "down" ? <TrendingDown size={12} className="shrink-0" /> : <Minus size={12} className="shrink-0" />}
                    <span className="truncate">{trend.text}</span>
                </p>
            )}
            {!trend && sub && !loading && (
                <p className="mt-0.5 text-[11px] leading-tight truncate" style={{ color: c.sub }}>{sub}</p>
            )}
        </Tag>
    )
}
