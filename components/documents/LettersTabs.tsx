"use client"

// Documents → HR Letters: one place for everything about letters.
//   Send & issued — issue a letter now, approvals, everything issued (recall / re-issue)
//   Auto letters  — which letter is made when (settings) and, per employee, sent or not
//   Templates     — the letter wording ({{variables}}), approval and on/off per template
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FileStack, FolderOpen, Send } from "lucide-react"

const TABS = [
    { href: "/documents/send", label: "Send & issued", icon: Send },
    { href: "/documents/letters", label: "Auto letters", icon: FileStack },
    { href: "/documents/types", label: "Templates", icon: FolderOpen },
]

export function LettersTabs() {
    const path = usePathname()
    return (
        <div className="space-y-3">
            <div>
                <h1 className="text-[24px] font-bold tracking-[-0.4px] text-[var(--text)]">HR Letters</h1>
                <p className="text-[13px] text-[var(--text3)] mt-0.5">Send letters, set which letter is made automatically and when, and keep the templates — all in one place.</p>
            </div>
            <nav className="flex gap-1 border-b border-[var(--border)] overflow-x-auto overflow-y-hidden" aria-label="HR Letters">
                {TABS.map(t => {
                    const on = path === t.href || path.startsWith(t.href + "/")
                    return (
                        <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13.5px] font-semibold border-b-2 whitespace-nowrap ${on ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"}`}>
                            <t.icon size={15} /> {t.label}
                        </Link>
                    )
                })}
            </nav>
        </div>
    )
}
