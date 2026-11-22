"use client"

// Dashboard strip: your open / overdue tasks and tasks waiting for your approval. Hidden when there is nothing.
import { useEffect, useState } from "react"
import Link from "next/link"
import { ListChecks } from "lucide-react"

export function MyTasksBanner() {
    const [c, setC] = useState<{ myOpen: number; myOverdue: number; awaitingMine: number } | null>(null)
    useEffect(() => { fetch("/api/tasks?view=mine&status=open").then(r => r.ok ? r.json() : null).then(j => setC(j?.counts ?? null)).catch(() => {}) }, [])
    if (!c || (!c.myOpen && !c.awaitingMine)) return null
    return (
        <Link href="/tasks" className={`flex items-center gap-3 rounded-[12px] border px-4 py-3 text-[13px] ${c.myOverdue ? "border-red-200 bg-red-50" : "border-[var(--border)] bg-white"}`}>
            <ListChecks size={18} className={c.myOverdue ? "text-red-600" : "text-[var(--accent)]"} />
            <span className="flex-1">
                <b>{c.myOpen} task{c.myOpen === 1 ? "" : "s"}</b> open for you
                {c.myOverdue ? <span className="text-red-600 font-semibold"> · {c.myOverdue} overdue</span> : null}
                {c.awaitingMine ? <span className="text-amber-700 font-semibold"> · {c.awaitingMine} waiting for your approval</span> : null}
            </span>
            <span className="text-[var(--accent)] font-semibold">Open tasks →</span>
        </Link>
    )
}
