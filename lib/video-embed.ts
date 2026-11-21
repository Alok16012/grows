// Turn a video link pasted into a course module into something that plays
// inside the app. YouTube (watch, youtu.be, shorts, live, embed), Vimeo,
// Google Drive files and direct .mp4 / .webm links are supported; anything
// else is opened in a new tab.

export type VideoEmbed =
    | { kind: "iframe"; src: string; provider: "YouTube" | "Vimeo" | "Google Drive" }
    | { kind: "file"; src: string }
    | { kind: "link"; src: string }

export function videoEmbed(raw: string | null | undefined): VideoEmbed | null {
    const url = (raw ?? "").trim()
    if (!url) return null
    let u: URL
    try { u = new URL(url) } catch { return null }
    const host = u.hostname.replace(/^www\.|^m\./, "")

    // YouTube — privacy-enhanced (no-cookie) player.
    let yt: string | null = null
    if (host === "youtu.be") yt = u.pathname.slice(1).split("/")[0]
    else if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
        if (u.pathname === "/watch") yt = u.searchParams.get("v")
        else {
            const m = /^\/(shorts|embed|live|v)\/([\w-]{6,})/.exec(u.pathname)
            if (m) yt = m[2]
        }
    }
    if (yt && /^[\w-]{6,20}$/.test(yt)) {
        const start = u.searchParams.get("t") ?? u.searchParams.get("start")
        const secs = start ? parseInt(start.replace(/s$/, ""), 10) : NaN
        return { kind: "iframe", provider: "YouTube", src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1${Number.isFinite(secs) && secs > 0 ? `&start=${secs}` : ""}` }
    }

    // Vimeo
    if (host === "vimeo.com" || host === "player.vimeo.com") {
        const id = /(\d{6,})/.exec(u.pathname)?.[1]
        if (id) return { kind: "iframe", provider: "Vimeo", src: `https://player.vimeo.com/video/${id}` }
    }

    // Google Drive file (shared "anyone with the link")
    if (host === "drive.google.com") {
        const id = /\/file\/d\/([\w-]+)/.exec(u.pathname)?.[1] ?? u.searchParams.get("id")
        if (id) return { kind: "iframe", provider: "Google Drive", src: `https://drive.google.com/file/d/${id}/preview` }
    }

    // A video file
    if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(u.pathname)) return { kind: "file", src: url }

    return /^https?:$/.test(u.protocol) ? { kind: "link", src: url } : null
}
