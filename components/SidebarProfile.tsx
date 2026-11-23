"use client"

// Top of the sidebar (soft theme, client reference): the signed-in person's
// photo, name and designation, and — for anyone with an employee record —
// the Check-in / Check-out pair. Photo falls back to the login photo, then initials.
import { useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react"
import { useMeHome, punchAttendance } from "@/lib/useMeHome"

const hm = (s: string | null | undefined) => s ? new Date(s).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""

export function SidebarProfile({ roleLabel, onNavigate }: { roleLabel: string; onNavigate?: () => void }) {
    const { data: session } = useSession()
    const { data } = useMeHome()
    const [busy, setBusy] = useState<"in" | "out" | null>(null)
    const emp = data?.employee ?? null
    const name = emp?.name || session?.user?.name || "Signed in"
    const photo = emp?.photo || (session?.user as any)?.image || null
    const initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase()
    const inAt = data?.today?.checkIn, outAt = data?.today?.checkOut

    async function go(action: "in" | "out") {
        setBusy(action)
        try { await punchAttendance(action); toast.success(action === "in" ? "Checked in" : "Checked out") }
        catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
    }

    return (
        <div className="px-4 pt-2 pb-4 shrink-0 flex flex-col items-center text-center">
            <Link href="/profile" onClick={onNavigate} className="h-[84px] w-[84px] rounded-[20px] overflow-hidden bg-[var(--accent-light)] shadow-[0_10px_24px_rgba(40,48,100,0.14)] flex items-center justify-center" title="My profile">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {photo ? <img src={photo} alt={name} className="h-full w-full object-cover" /> : <span className="text-[26px] font-bold text-[var(--accent)]">{initials}</span>}
            </Link>
            <p className="mt-2.5 text-[15.5px] font-bold text-[var(--text)] leading-tight truncate max-w-full">{name}</p>
            <p className="text-[12.5px] text-[var(--text2)] truncate max-w-full">{emp?.designation || roleLabel}</p>
            {emp && (
                <div className="mt-3 w-full grid grid-cols-2 gap-1 p-1 rounded-[16px] bg-white border border-[var(--border)] shadow-[var(--shadow-card)]">
                    <button onClick={() => go("in")} disabled={!!inAt || !!busy}
                        className={`h-[58px] rounded-[12px] flex flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide ${!inAt ? "bg-[#3ecf8e] text-white shadow-[0_6px_14px_rgba(62,207,142,0.35)]" : "text-[var(--text3)]"}`}>
                        {busy === "in" ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
                        {inAt ? `IN ${hm(inAt)}` : "CHECK-IN"}
                    </button>
                    <button onClick={() => go("out")} disabled={!inAt || !!outAt || !!busy}
                        className={`h-[58px] rounded-[12px] flex flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide ${inAt && !outAt ? "bg-[#f05252] text-white shadow-[0_6px_14px_rgba(240,82,82,0.30)]" : "text-[var(--text3)]"}`}>
                        {busy === "out" ? <Loader2 size={17} className="animate-spin" />
                            : <span className={`h-6 w-6 rounded-[7px] flex items-center justify-center ${inAt && !outAt ? "bg-white/25" : "bg-[#fde2e2] text-[#e02424]"}`}><ArrowLeft size={14} /></span>}
                        {outAt ? `OUT ${hm(outAt)}` : "CHECK-OUT"}
                    </button>
                </div>
            )}
        </div>
    )
}
