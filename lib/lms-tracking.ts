import { videoEmbed } from "@/lib/video-embed"

// LMS engagement tracking: how much of a module's video was really watched,
// how long the learner was active on it, which PDF pages they saw — and
// whether that is enough to mark the module done (LMS → Settings → Tracking).

export type Range = [number, number]

/** Merge watched ranges (seconds) so replays never count twice. */
export function mergeRanges(ranges: Range[]): Range[] {
    const r = ranges
        .filter(x => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1]) && x[1] > x[0])
        .map(([a, b]) => [Math.max(0, a), b] as Range)
        .sort((a, b) => a[0] - b[0])
    const out: Range[] = []
    for (const [a, b] of r) {
        const last = out[out.length - 1]
        if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b)   // within 1 s = continuous
        else out.push([a, b])
    }
    return out
}

export const rangesTotal = (ranges: Range[]) => ranges.reduce((n, [a, b]) => n + (b - a), 0)

/** Can this module's video be measured? (YouTube, Vimeo, .mp4 yes; Drive / other links no.) */
export function videoTrackable(url: string | null | undefined): boolean {
    const v = videoEmbed(url)
    return !!v && (v.kind === "file" || (v.kind === "iframe" && (v.provider === "YouTube" || v.provider === "Vimeo")))
}

export const isPdfUrl = (url: string | null | undefined) => !!url && /\.pdf(\?|#|$)/i.test(url)

export type TrackingRules = { enforce: boolean; videoPct: number; minTimePct: number; allPdfPages: boolean; blockSkipAhead: boolean }
export type ModuleShape = { videoUrl?: string | null; docUrl?: string | null; duration: number }
export type ProgressShape = { activeSeconds: number; videoDuration: number | null; watchedSeconds: number; docPages: number | null; pagesSeen: unknown }

/** What still stands between the learner and "Mark done" (empty = allowed). */
export function completionGaps(mod: ModuleShape, p: ProgressShape | null, rules: TrackingRules): string[] {
    if (!rules.enforce) return []
    const gaps: string[] = []
    const active = p?.activeSeconds ?? 0
    const needSecs = Math.round((mod.duration * 60 * rules.minTimePct) / 100)
    if (needSecs > 0 && active < needSecs) gaps.push(`Spend at least ${Math.ceil(needSecs / 60)} min on this module (${Math.floor(active / 60)} min so far)`)
    if (mod.videoUrl && videoTrackable(mod.videoUrl) && rules.videoPct > 0) {
        const dur = p?.videoDuration ?? 0
        const pct = dur > 0 ? ((p?.watchedSeconds ?? 0) / dur) * 100 : 0
        if (dur <= 0) gaps.push("Watch the video")
        else if (pct + 0.5 < rules.videoPct) gaps.push(`Watch at least ${rules.videoPct}% of the video (${Math.floor(pct)}% so far)`)
    }
    if (mod.docUrl && isPdfUrl(mod.docUrl) && rules.allPdfPages) {
        const pages = p?.docPages ?? 0
        const seen = Array.isArray(p?.pagesSeen) ? (p!.pagesSeen as number[]).length : 0
        if (pages <= 0) gaps.push("Open the document")
        else if (seen < pages) gaps.push(`Read every page of the document (${seen} of ${pages} seen)`)
    }
    return gaps
}
