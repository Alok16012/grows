"use client"

// One course module for the learner, with engagement tracking:
//  • active time (page visible + recent interaction, or a video playing)
//  • the parts of a YouTube / Vimeo / .mp4 video really watched, forward skips
//  • the pages of a PDF actually shown (page-by-page viewer)
// It reports to /api/lms/learn/track every ~20 s, and keeps "Mark done" locked
// until the rules in LMS → Settings → Tracking are met.
import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle, ChevronLeft, ChevronRight, ExternalLink, FileText, Loader2, Lock } from "lucide-react"
import { videoEmbed } from "@/lib/video-embed"
import { isPdfUrl } from "@/lib/lms-tracking"
import ModuleVideo from "@/components/lms/ModuleVideo"

type Range = [number, number]
type Mod = { id: string; title: string; videoUrl?: string; docUrl?: string; duration: number }
type Rules = { enforce: boolean; videoPct: number; minTimePct: number; allPdfPages: boolean; blockSkipAhead: boolean }
type Pending = { active: number; ranges: Range[]; skips: number; pages: number[]; duration?: number; docPages?: number }

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void; Vimeo?: any } }

function loadScript(src: string): Promise<void> {
    return new Promise((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) { res(); return }
        const s = document.createElement("script"); s.src = src; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error("load")); document.head.appendChild(s)
    })
}
function youtubeReady(): Promise<any> {
    if (window.YT?.Player) return Promise.resolve(window.YT)
    return new Promise(res => {
        const prev = window.onYouTubeIframeAPIReady
        window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT) }
        loadScript("https://www.youtube.com/iframe_api").catch(() => {})
    })
}

export default function TrackedModule({ enrollmentId, mod, isNext, isComplete, initialGaps, rules, onDone, busy }: {
    enrollmentId: string; mod: Mod; isNext: boolean; isComplete: boolean
    initialGaps: string[]; rules: Rules | null; onDone: () => void; busy: boolean
}) {
    const tracking = isNext && !isComplete
    const pending = useRef<Pending>({ active: 0, ranges: [], skips: 0, pages: [] })
    const lastInput = useRef(Date.now())
    const playing = useRef(false)
    const [gaps, setGaps] = useState<string[]>(initialGaps)
    useEffect(() => { setGaps(initialGaps) }, [initialGaps])

    const flush = useCallback(async (keepalive = false) => {
        const p = pending.current
        if (!p.active && !p.ranges.length && !p.skips && !p.pages.length && !p.duration && !p.docPages) return
        pending.current = { active: 0, ranges: [], skips: 0, pages: [] }
        try {
            const r = await fetch("/api/lms/learn/track", {
                method: "POST", headers: { "Content-Type": "application/json" }, keepalive,
                body: JSON.stringify({ enrollmentId, moduleId: mod.id, ...p }),
            })
            const d = await r.json().catch(() => null)
            if (d?.gaps) setGaps(d.gaps)
        } catch { /* next beat retries */ }
    }, [enrollmentId, mod.id])

    // Active-time counter + heartbeat.
    useEffect(() => {
        if (!tracking) return
        const bump = () => { lastInput.current = Date.now() }
        const evs = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel"]
        evs.forEach(e => window.addEventListener(e, bump, { passive: true }))
        const tick = setInterval(() => {
            const visible = document.visibilityState === "visible"
            if (visible && (playing.current || Date.now() - lastInput.current < 90_000)) pending.current.active += 1
        }, 1000)
        const beat = setInterval(() => flush(), 20_000)
        const onHide = () => { if (document.visibilityState === "hidden") flush(true) }
        document.addEventListener("visibilitychange", onHide)
        return () => { evs.forEach(e => window.removeEventListener(e, bump)); clearInterval(tick); clearInterval(beat); document.removeEventListener("visibilitychange", onHide); flush(true) }
    }, [tracking, flush])

    const blocked = !!rules?.enforce && gaps.length > 0
    return (
        <div>
            {mod.videoUrl && (tracking
                ? <TrackedVideo url={mod.videoUrl} title={mod.title} blockSkip={!!rules?.blockSkipAhead} pending={pending} playing={playing} />
                : <ModuleVideo url={mod.videoUrl} title={mod.title} />)}
            {mod.docUrl && <DocViewer url={mod.docUrl} title={mod.title} track={tracking} pending={pending} />}
            {tracking && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button onClick={async () => { await flush(); onDone() }} disabled={busy || blocked}
                        className="h-8 px-3 text-[12px] bg-[var(--accent)] text-white rounded-[6px] font-medium flex items-center gap-1 disabled:opacity-50">
                        {busy ? <Loader2 size={12} className="animate-spin" /> : blocked ? <Lock size={12} /> : <CheckCircle size={12} />} Mark done
                    </button>
                    {blocked && <ul className="text-[11.5px] text-[var(--text3)] space-y-0.5">{gaps.map(g => <li key={g}>• {g}</li>)}</ul>}
                </div>
            )}
        </div>
    )
}

// ─── Video with watch tracking ───────────────────────────────────────────────

function TrackedVideo({ url, title, blockSkip, pending, playing }: { url: string; title: string; blockSkip: boolean; pending: React.MutableRefObject<Pending>; playing: React.MutableRefObject<boolean> }) {
    const v = videoEmbed(url)
    const frame = useRef<HTMLIFrameElement>(null)
    const video = useRef<HTMLVideoElement>(null)
    const last = useRef<number | null>(null)
    const furthest = useRef(0)

    // Shared: called with the player's current time while playing.
    const onTime = useCallback((t: number, duration: number | undefined, seek?: (s: number) => void) => {
        if (duration && duration > 0 && pending.current.duration !== duration) pending.current.duration = duration
        const prev = last.current
        if (prev !== null) {
            const d = t - prev
            if (d > 0 && d <= 2.5) { pending.current.ranges.push([prev, t]); furthest.current = Math.max(furthest.current, t) }
            else if (d > 2.5) {
                pending.current.skips += 1
                if (blockSkip && seek && t > furthest.current + 2) { seek(furthest.current); last.current = furthest.current; return }
            }
        }
        last.current = t
    }, [blockSkip, pending])

    useEffect(() => {
        if (!v || v.kind !== "iframe" || v.provider !== "YouTube" || !frame.current) return
        let player: any, poll: ReturnType<typeof setInterval> | null = null, dead = false
        youtubeReady().then(YT => {
            if (dead || !frame.current) return
            player = new YT.Player(frame.current, {
                events: {
                    onStateChange: (e: any) => {
                        playing.current = e.data === 1
                        if (e.data === 1 && !poll) poll = setInterval(() => { try { onTime(player.getCurrentTime(), player.getDuration(), s => player.seekTo(s, true)) } catch { } }, 1000)
                        if (e.data !== 1 && poll) { clearInterval(poll); poll = null; last.current = null }
                    },
                },
            })
        })
        return () => { dead = true; if (poll) clearInterval(poll); playing.current = false; try { player?.destroy?.() } catch { } }
    }, [v?.src]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!v || v.kind !== "iframe" || v.provider !== "Vimeo" || !frame.current) return
        let player: any, dead = false
        loadScript("https://player.vimeo.com/api/player.js").then(() => {
            if (dead || !frame.current || !window.Vimeo) return
            player = new window.Vimeo.Player(frame.current)
            player.on("play", () => { playing.current = true })
            player.on("pause", () => { playing.current = false; last.current = null })
            player.on("ended", () => { playing.current = false; last.current = null })
            player.on("timeupdate", (d: any) => onTime(d.seconds, d.duration, s => player.setCurrentTime(s)))
        }).catch(() => {})
        return () => { dead = true; playing.current = false; try { player?.unload?.() } catch { } }
    }, [v?.src]) // eslint-disable-line react-hooks/exhaustive-deps

    if (!v) return null
    if (v.kind === "link" || (v.kind === "iframe" && v.provider === "Google Drive")) {
        // Not measurable — shown as usual; time on the module still counts.
        return <ModuleVideo url={url} title={title} defaultOpen />
    }
    const src = v.kind === "iframe" && v.provider === "YouTube"
        ? `${v.src}&enablejsapi=1&playsinline=1&origin=${encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "")}`
        : v.src
    return (
        <div className="mt-2">
            <div className="relative w-full overflow-hidden rounded-[10px] bg-black" style={{ paddingTop: "56.25%" }}>
                {v.kind === "iframe" ? (
                    <iframe ref={frame} src={src} title={title} className="absolute inset-0 h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
                ) : (
                    <video ref={video} src={v.src} controls playsInline preload="metadata" className="absolute inset-0 h-full w-full"
                        onPlay={() => { playing.current = true }} onPause={() => { playing.current = false; last.current = null }} onEnded={() => { playing.current = false; last.current = null }}
                        onTimeUpdate={e => { const el = e.currentTarget; if (!el.paused) onTime(el.currentTime, el.duration, s => { el.currentTime = s }) }}
                        onLoadedMetadata={e => { pending.current.duration = e.currentTarget.duration }} />
                )}
            </div>
            <p className="text-[11px] text-[var(--text3)] mt-1">Your viewing is recorded for this course.</p>
        </div>
    )
}

// ─── Reading material ────────────────────────────────────────────────────────

function DocViewer({ url, title, track, pending }: { url: string; title: string; track: boolean; pending: React.MutableRefObject<Pending> }) {
    const [open, setOpen] = useState(track)
    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 h-8 px-3 mt-2 rounded-[8px] bg-[var(--accent)]/10 text-[12.5px] font-medium text-[var(--accent)]">
                <FileText size={15} /> Open reading material
            </button>
        )
    }
    return isPdfUrl(url) ? <PdfPages url={url} track={track} pending={pending} /> : <DocFrame url={url} title={title} />
}

/** PowerPoint / Word / Google Drive / other: shown in a frame (time on the module is what's measured). */
function DocFrame({ url, title }: { url: string; title: string }) {
    let src = url
    try {
        const u = new URL(url)
        const drive = /\/file\/d\/([\w-]+)/.exec(u.pathname)?.[1]
        if (u.hostname === "drive.google.com" && drive) src = `https://drive.google.com/file/d/${drive}/preview`
        else if (u.hostname === "docs.google.com") src = url.replace(/\/(edit|view)(\?.*)?$/, "/preview")
        else if (/\.(pptx?|docx?|xlsx?)(\?|$)/i.test(u.pathname)) src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
    } catch { /* keep as is */ }
    return (
        <div className="mt-2">
            <div className="relative w-full overflow-hidden rounded-[10px] border border-[var(--border)] bg-white" style={{ paddingTop: "62%" }}>
                <iframe src={src} title={title} className="absolute inset-0 h-full w-full" />
            </div>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text3)] mt-1 hover:underline"><ExternalLink size={12} /> Open in a new tab</a>
        </div>
    )
}

/** PDF shown one page at a time; a page counts as seen after 3 s on screen. */
function PdfPages({ url, track, pending }: { url: string; track: boolean; pending: React.MutableRefObject<Pending> }) {
    const canvas = useRef<HTMLCanvasElement>(null)
    const box = useRef<HTMLDivElement>(null)
    const docRef = useRef<any>(null)
    const [pages, setPages] = useState(0)
    const [page, setPage] = useState(1)
    const [seen, setSeen] = useState<Set<number>>(new Set())
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let dead = false
        ;(async () => {
            try {
                // @ts-ignore — legacy build has no bundled types
                const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf")
                pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.js", import.meta.url).toString()
                const doc = await pdfjs.getDocument({ url }).promise
                if (dead) return
                docRef.current = doc
                setPages(doc.numPages)
                if (track) pending.current.docPages = doc.numPages
            } catch { if (!dead) setError("This PDF can't be shown here.") }
        })()
        return () => { dead = true }
    }, [url, track, pending])

    useEffect(() => {
        const doc = docRef.current
        if (!doc || !canvas.current || !box.current) return
        let cancelled = false, task: any
        doc.getPage(page).then((p: any) => {
            if (cancelled || !canvas.current || !box.current) return
            const width = box.current.clientWidth || 600
            const base = p.getViewport({ scale: 1 })
            const vp = p.getViewport({ scale: (width / base.width) * (window.devicePixelRatio || 1) })
            const c = canvas.current
            c.width = vp.width; c.height = vp.height; c.style.width = "100%"
            task = p.render({ canvasContext: c.getContext("2d"), viewport: vp })
        })
        // Seen after 3 s on screen.
        const t = track ? setTimeout(() => { pending.current.pages.push(page); setSeen(s => new Set(s).add(page)) }, 3000) : null
        return () => { cancelled = true; if (t) clearTimeout(t); try { task?.cancel?.() } catch { } }
    }, [page, pages, track, pending])

    if (error) return <DocFrame url={url} title="Document" />
    return (
        <div className="mt-2">
            <div ref={box} className="rounded-[10px] border border-[var(--border)] bg-white overflow-hidden">
                {!pages ? <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div> : <canvas ref={canvas} />}
            </div>
            {pages > 0 && (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="h-8 px-3 rounded-[8px] border border-[var(--border)] text-[12px] inline-flex items-center gap-1 disabled:opacity-40"><ChevronLeft size={14} /> Previous</button>
                    <span className="text-[12px] text-[var(--text2)]">Page {page} of {pages}{track ? ` · ${seen.size} seen` : ""}</span>
                    <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} className="h-8 px-3 rounded-[8px] border border-[var(--border)] text-[12px] inline-flex items-center gap-1 disabled:opacity-40">Next <ChevronRight size={14} /></button>
                </div>
            )}
        </div>
    )
}
