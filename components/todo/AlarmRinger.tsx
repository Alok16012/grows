"use client"

// Rings to-do and note alarms anywhere in the app while it is open: a chime
// (repeats until answered, up to a minute), a pop-up with Done / Snooze /
// Open, and a system notification when the tab is in the background and the
// person allowed pop-ups. Each alarm rings once per time (its firedAt is
// saved), and only in one open tab.
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AlarmClock, Check, X } from "lucide-react"
import { useTodo, refreshTodo, todoOp } from "@/lib/useTodo"
import { alarmDue, alarmTime } from "@/lib/todo"

type Ring = { kind: "todo" | "note"; id: string; title: string; detail: string; at: string }

export async function enableAlarmNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) { alert("This browser can't show alarm pop-ups. Alarms still ring inside Growus."); return }
    const p = await Notification.requestPermission()
    alert(p === "granted" ? "Done — alarms will also pop up when Growus is in the background." : "Pop-ups are blocked in this browser. Alarms still ring inside Growus while it is open.")
}

function chime(ctx: AudioContext) {
    const t0 = ctx.currentTime
    for (const [i, f] of [880, 1175, 1568].entries()) {
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.type = "sine"; o.frequency.value = f
        g.gain.setValueAtTime(0.0001, t0 + i * 0.18)
        g.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.18 + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.5)
        o.connect(g).connect(ctx.destination)
        o.start(t0 + i * 0.18); o.stop(t0 + i * 0.18 + 0.55)
    }
}

export function AlarmRinger() {
    const { store } = useTodo()
    const [rings, setRings] = useState<Ring[]>([])
    const audio = useRef<AudioContext | null>(null)
    const loop = useRef<ReturnType<typeof setInterval> | null>(null)

    // Browsers only allow sound after the person has interacted with the page.
    useEffect(() => {
        const unlock = () => { try { audio.current ??= new (window.AudioContext || (window as any).webkitAudioContext)(); audio.current.resume() } catch {} }
        window.addEventListener("pointerdown", unlock, { once: true }); window.addEventListener("keydown", unlock, { once: true })
        const t = setInterval(() => { if (document.visibilityState === "visible") refreshTodo() }, 120_000)
        return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); clearInterval(t) }
    }, [])

    // Check every 15 seconds.
    useEffect(() => {
        const check = () => {
            if (!store) return
            const now = Date.now()
            const due: Ring[] = [
                ...store.todos.filter(t => alarmDue(t, now)).map(t => ({ kind: "todo" as const, id: t.id, title: t.title, detail: t.note || t.list, at: alarmTime(t)! })),
                ...store.notes.filter(n => alarmDue(n, now)).map(n => ({ kind: "note" as const, id: n.id, title: n.title || "Note reminder", detail: n.body.slice(0, 120), at: n.remindAt! })),
            ]
            for (const r of due) {
                // One tab rings it: the first to claim it in localStorage.
                const lock = `grows.alarm.${r.id}.${r.at}`
                try { if (localStorage.getItem(lock)) continue; localStorage.setItem(lock, "1") } catch {}
                todoOp({ op: "fired", kind: r.kind, id: r.id, at: r.at }, true)
                setRings(x => x.some(y => y.id === r.id) ? x : [...x, r])
                try {
                    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
                        const n = new Notification(`⏰ ${r.title}`, { body: r.detail || "To-do alarm", tag: lock })
                        n.onclick = () => { window.focus(); n.close() }
                    }
                } catch {}
            }
        }
        check()
        const t = setInterval(check, 15_000)
        return () => clearInterval(t)
    }, [store])

    // Chime every 4 seconds while something is ringing, for up to a minute.
    useEffect(() => {
        if (loop.current) { clearInterval(loop.current); loop.current = null }
        if (!rings.length) return
        let n = 0
        const play = () => { try { if (audio.current) chime(audio.current) } catch {} }
        play()
        loop.current = setInterval(() => { if (++n >= 15) { clearInterval(loop.current!); loop.current = null } else play() }, 4000)
        return () => { if (loop.current) clearInterval(loop.current) }
    }, [rings.length])

    const close = (id: string) => setRings(x => x.filter(r => r.id !== id))
    if (!rings.length) return null
    return (
        <div className="fixed z-[90] right-4 bottom-24 md:bottom-6 flex flex-col gap-3 w-[min(360px,calc(100vw-32px))]" role="alertdialog" aria-label="Alarms">
            {rings.map(r => (
                <div key={r.id} className="rounded-[20px] bg-white shadow-[0_18px_40px_rgba(40,48,100,0.22)] border border-[var(--border)] p-4 animate-in slide-in-from-bottom-2 fade-in">
                    <div className="flex items-start gap-3">
                        <span className="h-10 w-10 rounded-[12px] flex items-center justify-center shrink-0 text-white animate-pulse" style={{ background: "var(--violet)" }}><AlarmClock size={20} /></span>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">{r.kind === "todo" ? "To-do alarm" : "Note reminder"} · {new Date(r.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })}</p>
                            <p className="text-[15px] font-semibold text-[var(--text)] leading-snug break-words">{r.title}</p>
                            {r.detail && <p className="text-[12.5px] text-[var(--text2)] line-clamp-2">{r.detail}</p>}
                        </div>
                        <button onClick={() => close(r.id)} aria-label="Dismiss" className="p-1 text-[var(--text3)] hover:text-[var(--text)]"><X size={16} /></button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {r.kind === "todo" && <button onClick={() => { todoOp({ op: "toggleTodo", id: r.id, done: true }); close(r.id) }} className="h-8 px-3 rounded-full bg-[var(--accent)] text-white text-[12.5px] font-semibold inline-flex items-center gap-1"><Check size={13} /> Done</button>}
                        {r.kind === "todo" && [5, 10, 30].map(m => <button key={m} onClick={() => { todoOp({ op: "snooze", id: r.id, minutes: m }); close(r.id) }} className="h-8 px-3 rounded-full border border-[var(--border2)] text-[12.5px] text-[var(--text2)]">Snooze {m}m</button>)}
                        <Link href="/todo" onClick={() => close(r.id)} className="h-8 px-3 rounded-full border border-[var(--border2)] text-[12.5px] text-[var(--text2)] inline-flex items-center">Open</Link>
                    </div>
                </div>
            ))}
        </div>
    )
}
