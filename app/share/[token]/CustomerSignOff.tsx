"use client"

import { useRef, useState } from "react"
import { CheckCircle2, Loader2, PenTool } from "lucide-react"

// Public report → "Acknowledge this report": the customer types their name and
// signs; it is stored on the inspection and shown in the PDF and to approvers.
export default function CustomerSignOff({ token, signed, onSigned }: {
    token: string
    signed: { name: string | null; at: string | null; signature: string | null } | null
    onSigned: () => void
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawing = useRef(false)
    const [hasInk, setHasInk] = useState(false)
    const [name, setName] = useState("")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (signed?.at) {
        return (
            <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[14px] p-5">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-[#15803d]"><CheckCircle2 className="h-4 w-4" /> Acknowledged by {signed.name || "the customer"}</p>
                <p className="mt-0.5 text-[12px] text-[#166534]">{new Date(signed.at).toLocaleString("en-IN")}</p>
                {signed.signature && <img src={signed.signature} alt="Customer signature" className="mt-2 max-h-20 rounded border border-[#bbf7d0] bg-white" />}
            </div>
        )
    }

    const pos = (e: React.MouseEvent | React.TouchEvent) => {
        const c = canvasRef.current!, r = c.getBoundingClientRect()
        const p = "touches" in e ? e.touches[0] : (e as React.MouseEvent)
        return { x: (p.clientX - r.left) * (c.width / r.width), y: (p.clientY - r.top) * (c.height / r.height) }
    }
    const start = (e: React.MouseEvent | React.TouchEvent) => {
        const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return
        drawing.current = true
        const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y)
    }
    const move = (e: React.MouseEvent | React.TouchEvent) => {
        if (!drawing.current) return
        const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return
        const { x, y } = pos(e); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#0f1729"; ctx.lineTo(x, y); ctx.stroke()
        setHasInk(true)
    }
    const stop = () => { drawing.current = false }
    const clear = () => { const c = canvasRef.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); setHasInk(false) }

    const submit = async () => {
        setBusy(true); setError(null)
        try {
            const signature = canvasRef.current!.toDataURL("image/png")
            const r = await fetch(`/api/share/${token}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, signature }) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Could not save")
            onSigned()
        } catch (e: any) { setError(e.message) } finally { setBusy(false) }
    }

    return (
        <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
            <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-3"><PenTool className="h-3.5 w-3.5" /> Acknowledge this report</p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={80}
                className="w-full h-10 rounded-[10px] border border-[var(--border)] px-3 text-[14px] outline-none focus:border-[var(--accent)]" />
            <canvas ref={canvasRef} width={500} height={150}
                className="mt-2 w-full touch-none rounded-[10px] border-2 border-dashed border-[var(--border)] bg-[var(--surface2)] cursor-crosshair"
                onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
                onTouchStart={start} onTouchMove={move} onTouchEnd={stop} />
            <p className="mt-1 text-center text-[11px] text-[var(--text3)]">Sign above</p>
            {error && <p className="mt-1 text-[12px] text-[#dc2626]">{error}</p>}
            <div className="mt-2 flex gap-2">
                <button onClick={clear} type="button" className="h-10 rounded-[10px] border border-[var(--border)] px-4 text-[13px] text-[var(--text2)]">Clear</button>
                <button onClick={submit} disabled={busy || !hasInk || name.trim().length < 2}
                    className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] bg-[var(--accent)] text-[13px] font-medium text-white disabled:opacity-40">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Acknowledge report
                </button>
            </div>
            <p className="mt-2 text-[11px] text-[var(--text3)]">By signing you confirm you have received and reviewed this inspection report.</p>
        </div>
    )
}
