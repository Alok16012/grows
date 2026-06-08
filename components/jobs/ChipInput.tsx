"use client"

import { useState } from "react"
import { X, Plus } from "lucide-react"

// Tag/chip multi-select with free typing + clickable suggestions.
export function ChipInput({
    label,
    optional,
    value,
    onChange,
    suggestions = [],
    placeholder = "Type and press Enter",
}: {
    label?: string
    optional?: boolean
    value: string[]
    onChange: (next: string[]) => void
    suggestions?: string[]
    placeholder?: string
}) {
    const [draft, setDraft] = useState("")

    const add = (raw: string) => {
        const v = raw.trim()
        if (!v) return
        if (value.some((x) => x.toLowerCase() === v.toLowerCase())) return
        onChange([...value, v])
        setDraft("")
    }
    const remove = (v: string) => onChange(value.filter((x) => x !== v))

    const remainingSuggestions = suggestions.filter(
        (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())
    )

    return (
        <div>
            {label && (
                <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">
                    {label}{" "}
                    {optional && <span className="text-[var(--text3)] font-normal">(Optional)</span>}
                </label>
            )}
            <div className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-2 focus-within:ring-2 focus-within:ring-[var(--accent)]/30">
                <div className="flex flex-wrap gap-2">
                    {value.map((v) => (
                        <span
                            key={v}
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)] text-[var(--accent-text)] bg-[var(--accent-light)] px-2.5 py-1 text-[13px]"
                        >
                            {v}
                            <button type="button" onClick={() => remove(v)} className="hover:opacity-70">
                                <X size={13} />
                            </button>
                        </span>
                    ))}
                    <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") {
                                e.preventDefault()
                                add(draft)
                            } else if (e.key === "Backspace" && !draft && value.length) {
                                remove(value[value.length - 1])
                            }
                        }}
                        placeholder={value.length ? "" : placeholder}
                        className="flex-1 min-w-[120px] bg-transparent outline-none text-[13px] py-1 placeholder:text-[var(--text3)]"
                    />
                </div>
            </div>
            {remainingSuggestions.length > 0 && (
                <div className="mt-2">
                    <p className="text-[11px] text-[var(--text3)] mb-1">Suggestions</p>
                    <div className="flex flex-wrap gap-2">
                        {remainingSuggestions.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => add(s)}
                                className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
                            >
                                <Plus size={12} /> {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
