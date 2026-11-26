"use client"

// Approval page sidebar: NCRs raised from this inspection, and "Open NCR".
import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { ShieldAlert } from "lucide-react"
import { canAny } from "@/lib/can"
import { NcrStatusPill, NewNcrModal } from "./NcrUi"

export function NcrCard({ inspectionId, canOpen }: { inspectionId: string; canOpen: boolean }) {
    const { data: session } = useSession()
    const [rows, setRows] = useState<{ id: string; code: string; title: string; status: string; inspectionId: string | null }[] | null>(null)
    const [open, setOpen] = useState(false)
    const canManage = canAny(session, ["projects.manage", "approvals.manage"])

    useEffect(() => {
        fetch(`/api/quality/ncr?status=all&inspectionId=${encodeURIComponent(inspectionId)}`).then(r => r.ok ? r.json() : null)
            .then(d => setRows(d?.rows ?? []))
            .catch(() => setRows([]))
    }, [inspectionId])

    if (rows === null || (!rows.length && !(canManage && canOpen))) return null
    return (
        <div className="bg-white border border-[var(--border)] rounded-[14px] p-4">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text)] mb-2"><ShieldAlert className="h-3.5 w-3.5" /> Non-conformance</p>
            {rows.map(r => (
                <Link key={r.id} href={`/quality/ncr/${r.id}`} className="block rounded-[9px] border border-[var(--border)] p-2 mb-1.5 hover:bg-[var(--surface2)]">
                    <p className="font-mono text-[11px] text-[var(--accent)]">{r.code}</p>
                    <p className="text-[12px] text-[var(--text)] truncate">{r.title}</p>
                    <div className="mt-1"><NcrStatusPill s={r.status} /></div>
                </Link>
            ))}
            {canManage && canOpen && (
                <button onClick={() => setOpen(true)} className="mt-1 w-full h-8 rounded-[9px] border border-[var(--border)] text-[12px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)]">
                    {rows.length ? "Open another NCR" : "Open an NCR (8D)"}
                </button>
            )}
            {open && <NewNcrModal inspectionId={inspectionId} onClose={() => setOpen(false)} onDone={id => { window.location.href = `/quality/ncr/${id}` }} />}
        </div>
    )
}
