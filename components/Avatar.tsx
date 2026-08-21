"use client"
import { useState } from "react"

const AVATAR_COLORS = [
    "#1a9e6e", "#3b82f6", "#8b5cf6",
    "#f59e0b", "#ef4444", "#06b6d4", "#f97316",
]

function hashColor(first: string, last: string): string {
    const idx = (first.charCodeAt(0) + (last.charCodeAt(0) || 0)) % AVATAR_COLORS.length
    return AVATAR_COLORS[idx]
}

export function Avatar({
    firstName,
    last: lastProp,
    lastName: lastNameProp,
    first: firstProp,
    name,
    photo,
    size = 36,
    className = "",
}: {
    firstName?: string
    first?: string
    last?: string
    lastName?: string
    name?: string
    photo?: string | null
    size?: number
    className?: string
}) {
    const [imgErr, setImgErr] = useState(false)
    const first = firstProp || firstName || name?.split(" ")[0] || ""
    const last = lastProp || lastNameProp || name?.split(" ").slice(1).join(" ") || ""
    const initials = `${first[0] || ""}${last[0] || ""}`.toUpperCase()
    const bg = hashColor(first, last)

    if (photo && !imgErr) {
        return (
            <img
                src={photo}
                alt=""
                width={size}
                height={size}
                className={`rounded-full object-cover shrink-0 select-none ${className}`}
                onError={() => setImgErr(true)}
            />
        )
    }

    return (
        <div
            aria-hidden="true"
            style={{ width: size, height: size, background: bg, fontSize: size * 0.35 }}
            className={`rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none ${className}`}
        >
            {initials || "?"}
        </div>
    )
}
