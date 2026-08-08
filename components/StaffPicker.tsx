"use client"

// Shared plumbing for the manager / inspector pickers on the project create and
// edit screens. Both screens ask the same question — "who can I put on this
// project?" — and got out of sync when the logic lived in each page.

export type PickerSite = { id: string; name: string; code?: string | null; city?: string | null }
export type Person = { id: string; name: string | null; email: string | null; phone?: string | null }

// Which pool of staff a picker is showing. A plain this-site/everyone toggle was
// not enough: "everyone" is a few hundred names, so pulling in one person from a
// neighbouring site meant scrolling the whole company. Naming the other site
// directly keeps every list short.
// "" = the project's own site, "ALL" = every site, anything else = that site's id.
export const SCOPE_ALL = "ALL"

// Names the site a picker is currently browsing, for empty-state copy.
export function scopeLabel(sites: PickerSite[], projectSiteId: string, scope: string): string {
    if (scope === SCOPE_ALL) return "any site"
    return sites.find((s) => s.id === (scope || projectSiteId))?.name || "this site"
}

export function matchPeople(people: Person[], search: string): Person[] {
    const q = search.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.phone || "").toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q))
}

// Loads one picker's staff for the site being browsed, then merges back anyone
// already ticked who is not in that list. Without the merge, selecting someone
// and then switching the filter would hide them while leaving them selected —
// the form would submit a name the user could no longer see.
export async function fetchStaff(
    role: "MANAGER" | "INSPECTION_BOY",
    projectSiteId: string,
    scope: string,
    keepIds: string[],
): Promise<Person[]> {
    const browseSiteId = scope === SCOPE_ALL ? "" : (scope || projectSiteId)
    const q = browseSiteId ? `&siteId=${encodeURIComponent(browseSiteId)}` : ""
    const raw = await fetch(`/api/users?role=${role}${q}`)
        .then((r) => (r.ok ? r.json() : [])).catch(() => [])
    const rows: Person[] = Array.isArray(raw) ? raw : []

    const seen = new Set(rows.map((p) => p.id))
    const missing = keepIds.filter((id) => !seen.has(id))
    if (missing.length === 0) return rows

    const extraRaw = await fetch(`/api/users?ids=${missing.join(",")}`)
        .then((r) => (r.ok ? r.json() : [])).catch(() => [])
    return [...rows, ...(Array.isArray(extraRaw) ? extraRaw : [])]
}

// Select All acts on what is currently VISIBLE, not on the whole pool — with a
// search or a site filter applied, "all" means the rows the user can actually see.
export function toggleAllVisible(
    visible: Person[],
    selected: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
) {
    const allShown = visible.length > 0 && visible.every((p) => selected.includes(p.id))
    const shownIds = new Set(visible.map((p) => p.id))
    setter((prev) => (allShown
        ? prev.filter((id) => !shownIds.has(id))
        : Array.from(new Set([...prev, ...visible.map((p) => p.id)]))))
}

export function allVisibleSelected(visible: Person[], selected: string[]): boolean {
    return visible.length > 0 && visible.every((p) => selected.includes(p.id))
}

export function ScopePicker({ sites, projectSiteId, value, onChange, loading, count, noun }: {
    sites: PickerSite[]
    projectSiteId: string
    value: string
    onChange: (v: string) => void
    loading: boolean
    count: number
    noun: string
}) {
    const projectSiteName = sites.find((s) => s.id === projectSiteId)?.name || "this site"
    const others = sites.filter((s) => s.id !== projectSiteId)
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 rounded-[10px] bg-[var(--surface2)] border border-[var(--border)] px-3 py-2">
            <label className="flex items-center gap-2 text-[11.5px] text-[var(--text3)] min-w-0">
                <span className="shrink-0">Showing {noun} from</span>
                <select value={value} onChange={(e) => onChange(e.target.value)}
                    className="h-7 max-w-[230px] px-2 text-[11.5px] font-medium text-[var(--text)] bg-white border border-[var(--border)] rounded-[7px] focus:outline-none focus:border-[var(--accent)]">
                    <option value="">{projectSiteName} — this project&apos;s site</option>
                    <option value={SCOPE_ALL}>All sites</option>
                    {others.length > 0 && (
                        <optgroup label="Another site">
                            {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </optgroup>
                    )}
                </select>
            </label>
            <span className="text-[11px] text-[var(--text3)] shrink-0">
                {loading ? "Loading…" : `${count} ${count === 1 ? noun.replace(/s$/, "") : noun}`}
            </span>
        </div>
    )
}
