"use client"

import { useEffect, useRef, useState } from "react"
import { ScanLine, X } from "lucide-react"

// "Scan" for traceability fields (lot / batch, machine, supplier, part no.).
// Uses the browser's built-in BarcodeDetector (Chrome on Android — what the
// inspectors use); elsewhere it says so and the number is typed instead.
type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }

export default function BarcodeScanButton({ onResult, disabled }: { onResult: (value: string) => void; disabled?: boolean }) {
    const [open, setOpen] = useState(false)
    return (
        <>
            <button type="button" disabled={disabled} onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1 h-[28px] px-[10px] rounded-[7px] border border-[var(--border)] bg-[var(--surface2)] text-[11.5px] font-[600] text-[var(--text2)] active:scale-95 disabled:opacity-40">
                <ScanLine className="h-[13px] w-[13px]" /> Scan
            </button>
            {open && <ScannerModal onClose={() => setOpen(false)} onResult={v => { onResult(v); setOpen(false) }} />}
        </>
    )
}

function ScannerModal({ onClose, onResult }: { onClose: () => void; onResult: (v: string) => void }) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let stream: MediaStream | null = null
        let stopped = false
        let timer: ReturnType<typeof setTimeout> | null = null
        const Ctor = (window as any).BarcodeDetector
        if (!Ctor) { setError("This browser can't scan codes. Please type the number instead (scanning works in Chrome on Android)."); return }
        const detector: Detector = new Ctor()
        ;(async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
                if (stopped) return
                const v = videoRef.current!
                v.srcObject = stream
                await v.play()
                const tick = async () => {
                    if (stopped) return
                    try {
                        const found = await detector.detect(v)
                        const value = found.find(f => f.rawValue?.trim())?.rawValue.trim()
                        if (value) { if (navigator.vibrate) navigator.vibrate(60); onResult(value.slice(0, 200)); return }
                    } catch { /* frame not ready */ }
                    timer = setTimeout(tick, 250)
                }
                tick()
            } catch {
                setError("Couldn't open the camera. Allow camera access, or type the number instead.")
            }
        })()
        return () => { stopped = true; if (timer) clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()) }
    }, [onResult])

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-label="Scan a barcode or QR code">
            <div className="w-full max-w-sm rounded-[14px] bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                    <p className="text-[13px] font-semibold text-[var(--text)]">Point the camera at the barcode or QR code</p>
                    <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-[var(--surface2)]"><X className="h-4 w-4" /></button>
                </div>
                {error ? (
                    <p className="rounded-[10px] bg-[#fef3c7] p-3 text-[12.5px] text-[#92400e]">{error}</p>
                ) : (
                    <div className="relative overflow-hidden rounded-[10px] bg-black">
                        <video ref={videoRef} playsInline muted className="block w-full" />
                        <div className="pointer-events-none absolute inset-x-6 top-1/2 h-[2px] -translate-y-1/2 bg-red-500/80" />
                    </div>
                )}
            </div>
        </div>
    )
}
