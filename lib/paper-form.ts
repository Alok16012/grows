// The inspector's photos of the filled paper form (Inspection → Attachments).
// Kept in Inspection.paperFormPhoto: one page is the plain image URL (as it
// always was), several pages are a JSON list of URLs. No schema change, and
// every existing single-photo inspection reads the same. Client-safe.

export const MAX_PAPER_PAGES = 15

/** The pages, in order, from the stored value (URL, JSON list, or empty). */
export function paperPages(value: unknown): string[] {
    const s = typeof value === "string" ? value.trim() : ""
    if (!s) return []
    if (s.startsWith("[")) {
        try {
            const a = JSON.parse(s)
            if (Array.isArray(a)) return a.filter((x): x is string => typeof x === "string" && x.trim() !== "")
        } catch { /* not a list — treat as one URL */ }
    }
    return [s]
}

/** The value to store for these pages: "" for none, the URL for one, a JSON list for more. */
export function paperValue(pages: string[]): string {
    const list = pages.filter(p => typeof p === "string" && p.trim() !== "").slice(0, MAX_PAPER_PAGES)
    return list.length === 0 ? "" : list.length === 1 ? list[0] : JSON.stringify(list)
}

export const isPdfUrl = (u: string) => /\.pdf($|\?)/i.test(u)
