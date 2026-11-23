"use client"

// Dashboard: "An asset has been issued to you" — blinks until the employee
// answers Received / Not received for each item. Shows nothing when there is
// nothing to confirm.
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Check, Loader2, Package, X } from "lucide-react"

type Item = { id: string; issueNo: string; name: string; quantity: number; size: string | null; issuedAt: string; reportedAt?: string }

export function AssetReceiptCard() {
    const [pending, setPending] = useState<Item[]>([])
    const [reported, setReported] = useState<Item[]>([])
    const [busy, setBusy] = useState<string | null>(null)
    const load = useCallback(() => {
        fetch("/api/me/asset-confirmations").then(r => r.ok ? r.json() : null).then(d => {
            if (d) { setPending(d.pending ?? []); setReported(d.reported ?? []) }
        }).catch(() => {})
    }, [])
    useEffect(() => { load() }, [load])

    async function answer(i: Item, received: boolean) {
        let note: string | null = null
        if (!received) {
            note = window.prompt(`Tell HR about ${i.name} (optional) — e.g. "never given", "wrong size":`, "")
            if (note === null) return
        }
        setBusy(i.id)
        try {
            const r = await fetch(`/api/assets/issues/${i.id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(received ? { action: "ACKNOWLEDGE" } : { action: "NOT_RECEIVED", note }),
            })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Couldn't save")
            toast.success(received ? `${i.name}: marked as received` : `${i.name}: HR has been told it didn't reach you`)
            load()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
    }

    if (!pending.length && !reported.length) return null
    const day = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    return (
        <div className={pending.length ? "asset-ack-blink" : ""} style={{ borderRadius: 14, border: `1.5px solid ${pending.length ? "#f59e0b" : "var(--border)"}`, background: pending.length ? "#fffbeb" : "var(--surface)", padding: "12px 14px" }}>
            <style>{`
                @keyframes assetAckBlink { 0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.55) } 50% { box-shadow: 0 0 0 7px rgba(245,158,11,0) } }
                @keyframes assetAckDot { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }
                .asset-ack-blink { animation: assetAckBlink 1.6s ease-in-out infinite }
                .asset-ack-dot { animation: assetAckDot 1s ease-in-out infinite }
                @media (prefers-reduced-motion: reduce) { .asset-ack-blink, .asset-ack-dot { animation: none } }
            `}</style>
            {pending.length > 0 && (
                <>
                    <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#92400e" }}>
                        <span className="asset-ack-dot" style={{ width: 9, height: 9, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
                        <Package size={16} /> {pending.length === 1 ? "An item has been issued to you" : `${pending.length} items have been issued to you`}
                    </p>
                    <p style={{ margin: "2px 0 10px 17px", fontSize: 12, color: "#a16207" }}>Please confirm whether you received it.</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {pending.map(i => (
                            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#fff", border: "1px solid #fde68a", borderRadius: 10, padding: "8px 10px" }}>
                                <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{i.name}{i.size ? ` · Size ${i.size}` : ""}{i.quantity > 1 ? ` × ${i.quantity}` : ""}</p>
                                    <p style={{ margin: 0, fontSize: 11.5, color: "var(--text3)" }}>Issued {day(i.issuedAt)} · {i.issueNo}</p>
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button type="button" disabled={busy === i.id} onClick={() => answer(i, true)}
                                        style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                                        {busy === i.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />} Received
                                    </button>
                                    <button type="button" disabled={busy === i.id} onClick={() => answer(i, false)}
                                        style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fff", color: "#b91c1c", fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                                        <X size={14} /> Not received
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
            {reported.length > 0 && (
                <p style={{ margin: pending.length ? "10px 0 0" : 0, fontSize: 12, color: "var(--text2)" }}>
                    You reported {reported.map(i => i.name).join(", ")} as not received — HR is checking. If it reaches you, confirm it in My Profile → Assets.
                </p>
            )}
        </div>
    )
}
