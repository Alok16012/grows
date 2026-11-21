"use client"

// A course module's video, played inside the app (YouTube, Vimeo, Google
// Drive, .mp4). Collapsed to a "Watch video" button until opened, so a long
// module list stays light on phones.
import { useState } from "react"
import { ExternalLink, PlayCircle } from "lucide-react"
import { videoEmbed } from "@/lib/video-embed"

export default function ModuleVideo({ url, title, defaultOpen = false }: { url: string; title: string; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen)
    const v = videoEmbed(url)
    if (!v) return null
    if (v.kind === "link") {
        return (
            <a href={v.src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)] mt-2 hover:underline">
                <ExternalLink size={14} /> Open video
            </a>
        )
    }
    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 h-8 px-3 mt-2 rounded-[8px] bg-[var(--accent)]/10 text-[12.5px] font-medium text-[var(--accent)]">
                <PlayCircle size={15} /> Watch video
            </button>
        )
    }
    return (
        <div className="mt-2">
            <div className="relative w-full overflow-hidden rounded-[10px] bg-black" style={{ paddingTop: "56.25%" }}>
                {v.kind === "iframe" ? (
                    <iframe src={v.src} title={title} className="absolute inset-0 h-full w-full" loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
                ) : (
                    <video src={v.src} controls playsInline preload="metadata" className="absolute inset-0 h-full w-full" />
                )}
            </div>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text3)] mt-1 hover:underline">
                <ExternalLink size={12} /> Open in {v.kind === "iframe" ? v.provider : "a new tab"}
            </a>
        </div>
    )
}
