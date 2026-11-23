"use client"

// Auto-dial (power dialer): calls the list one after another. After each call's outcome is
// saved, the next number dials itself after a short countdown (Settings → auto-dial gap).
// Closing a call or a failed call pauses; Skip / Stop at any time.
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Pause, Play, SkipForward, Square } from "lucide-react"
import { CallPanel, loadDialerCtx, type CallEnd } from "@/components/dialer/CallButton"
import type { TargetType } from "@/lib/dialer"

export type DialItem = { type: TargetType; id: string; name: string; sub?: string; phone: string }

export function AutoDial({ queue, onFinish, onProgress }: { queue: DialItem[]; onFinish: (done: number) => void; onProgress?: () => void }) {
    const [i, setI] = useState(0)
    const [mode, setMode] = useState<"calling" | "countdown" | "paused">("calling")
    const [left, setLeft] = useState(0)
    const [gap, setGap] = useState(5)
    const [done, setDone] = useState(0)
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    useEffect(() => { loadDialerCtx().then(c => setGap(c.settings?.autoDialGapSec ?? 5)) }, [])
    // Countdown to the next call.
    useEffect(() => {
        if (mode !== "countdown") return
        if (left <= 0) { setMode("calling"); return }
        const t = setTimeout(() => setLeft(l => l - 1), 1000)
        return () => clearTimeout(t)
    }, [mode, left])
    const item = queue[i]
    useEffect(() => { if (!item) onFinish(done) }, [item, done, onFinish])
    if (!item || !mounted) return null
    const next = (fromSave: boolean) => {
        if (fromSave) setDone(d => d + 1)
        if (i + 1 >= queue.length) { setI(i + 1); return }
        setI(i + 1); setLeft(gap); setMode("countdown")
    }
    const ended = (how: CallEnd) => { if (how === "saved") { next(true); onProgress?.() } else setMode("paused") }
    // Stop also cancels a call already sent to the phone but not dialled yet.
    const stop = () => { fetch("/api/dialer/dial", { method: "DELETE" }).catch(() => {}); onFinish(done) }
    const counter = <span className="tabular-nums">{i + 1} of {queue.length}</span>
    if (mode === "calling") {
        return (
            <CallPanel key={`${item.type}:${item.id}:${i}`} phone={item.phone} targetType={item.type} targetId={item.id} name={item.name}
                onDone={ended} onClose={() => {}}
                banner={
                    <div className="flex items-center justify-between gap-2 px-4 py-2 bg-gray-900 text-white text-[12px] rounded-t-[14px]">
                        <span className="font-semibold">Auto-dial · {counter}</span>
                        <button onClick={stop} className="inline-flex items-center gap-1 opacity-80 hover:opacity-100"><Square size={11} /> Stop</button>
                    </div>
                } />
        )
    }
    return createPortal(
        <div className="fixed bottom-4 right-4 z-[80] w-[380px] max-w-[calc(100vw-2rem)] rounded-[14px] border border-[var(--border)] bg-white shadow-2xl overflow-hidden">
            <div className="px-4 py-2 bg-gray-900 text-white text-[12px] font-semibold">Auto-dial · {counter} · {done} done</div>
            <div className="p-4 space-y-3">
                <div>
                    <div className="text-[11.5px] uppercase font-semibold text-[var(--text3)]">{mode === "paused" ? "Paused — next" : `Next call in ${left}s`}</div>
                    <div className="text-[15px] font-bold text-[var(--text)]">{item.name}</div>
                    <div className="text-[12px] text-[var(--text3)]">{item.sub ? `${item.sub} · ` : ""}{item.phone}</div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setMode("calling")} className="h-9 px-3 rounded-[9px] bg-green-600 text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"><Play size={13} /> {mode === "paused" ? "Resume" : "Call now"}</button>
                    {mode === "countdown" && <button onClick={() => setMode("paused")} className="h-9 px-3 rounded-[9px] border border-[var(--border)] text-[12.5px] font-semibold inline-flex items-center gap-1.5"><Pause size={13} /> Pause</button>}
                    <button onClick={() => next(false)} className="h-9 px-3 rounded-[9px] border border-[var(--border)] text-[12.5px] font-semibold inline-flex items-center gap-1.5"><SkipForward size={13} /> Skip</button>
                    <button onClick={stop} className="h-9 px-3 rounded-[9px] border border-[var(--border)] text-[12.5px] font-semibold inline-flex items-center gap-1.5 ml-auto"><Square size={12} /> Stop</button>
                </div>
            </div>
        </div>, document.body)
}
