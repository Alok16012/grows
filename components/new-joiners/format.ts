// Display helpers shared by the New Joiners alert and page.

export function fmtDate(iso: string | null | undefined): string {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** "today", "1 day", "5 days". */
export function daysText(n: number | null | undefined): string {
    if (n == null) return ""
    if (n <= 0) return "today"
    return `${n} day${n === 1 ? "" : "s"}`
}

/** "Joined 28 Oct 2026", "Joins 12 Nov 2026 (in 8 days)", "No joining date". */
export function joiningText(j: { joiningDate: string | null; joinsInDays: number | null }): string {
    if (!j.joiningDate) return "No joining date"
    if (j.joinsInDays != null && j.joinsInDays > 0) return `Joins ${fmtDate(j.joiningDate)} (in ${daysText(j.joinsInDays)})`
    return `Joined ${fmtDate(j.joiningDate)}`
}

/** Tell the badge (and any open page) that a posting changed. */
export const NEW_JOINERS_CHANGED = "grows:new-joiners-changed"
export function announceNewJoinersChanged() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(NEW_JOINERS_CHANGED))
}
