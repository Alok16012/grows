"use client"
// "Selected: A × B ×" strip above a people picker, each chip removable. Shared
// by the Assignments wizard and the project team pickers (Create / Edit
// Project), so the people already ticked stay visible however long the list
// is or whatever it is filtered to.

import { useRef } from "react"
import { X } from "lucide-react"

type Named = { id: string; name: string | null }

export function SelectedPeopleChips({ people, ids, onRemove, fallback = "Unnamed", className = "mb-2" }: {
    /** The list currently loaded. */
    people: Named[]
    ids: string[]
    onRemove: (id: string) => void
    /** Shown for someone whose name has never been loaded. */
    fallback?: string
    className?: string
}) {
    // Names stay known after the list changes (another site picked, a search
    // typed), so a chip doesn't turn into "Unnamed" for someone still selected.
    const names = useRef(new Map<string, string>())
    for (const p of people) if (p.name) names.current.set(p.id, p.name)

    if (ids.length === 0) return null
    return (
        <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
            <span className="text-[11px] font-medium text-[var(--text3)]">Selected:</span>
            {ids.map(id => {
                const name = names.current.get(id) || fallback
                return (
                    <span key={id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent)] text-[11px] font-semibold">
                        {name}
                        <button type="button" onClick={() => onRemove(id)} aria-label={`Remove ${name}`}
                            className="p-0.5 rounded-full hover:bg-[var(--accent)]/15 transition-colors">
                            <X size={10} strokeWidth={2.5} />
                        </button>
                    </span>
                )
            })}
        </div>
    )
}
