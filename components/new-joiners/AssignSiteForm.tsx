"use client"

// The "Assign site" form used by the top-bar alert and the New Joiners page.
// Saves through POST /api/deployments (source: new-joiners), the same route as
// the Deployments screen, so the posting and its record are identical.

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import type { NewJoiner } from "@/lib/new-joiners"

type Site = { id: string; name: string; code?: string | null; city?: string | null; isActive?: boolean }

let sitesCache: Promise<Site[]> | null = null
function loadSites(): Promise<Site[]> {
    if (!sitesCache) {
        sitesCache = fetch("/api/sites?isActive=true")
            .then(r => (r.ok ? r.json() : []))
            .then((d: unknown) => (Array.isArray(d) ? (d as Site[]).filter(s => s.isActive !== false) : []))
            .catch(() => [])
        // Refresh on the next open, so a site added meanwhile shows up.
        sitesCache.finally(() => setTimeout(() => { sitesCache = null }, 60_000))
    }
    return sitesCache
}

const todayKey = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Joining date if they join later; otherwise today. */
export function defaultStartDate(j: Pick<NewJoiner, "joiningDate">): string {
    const today = todayKey()
    const join = j.joiningDate ? j.joiningDate.slice(0, 10) : null
    return join && join > today ? join : today
}

export function AssignSiteForm({ joiner, onDone, onCancel, compact }: {
    joiner: NewJoiner
    onDone: (siteName: string) => void
    onCancel: () => void
    compact?: boolean
}) {
    const [sites, setSites] = useState<Site[] | null>(null)
    const [siteId, setSiteId] = useState("")
    const [startDate, setStartDate] = useState(defaultStartDate(joiner))
    const [shift, setShift] = useState("")
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const siteRef = useRef<HTMLSelectElement>(null)
    useEffect(() => { loadSites().then(setSites) }, [])
    // Focus without scrolling: autoFocus scrolled pages that are wider than the
    // phone screen sideways.
    useEffect(() => { if (sites) siteRef.current?.focus({ preventScroll: true }) }, [sites])

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!siteId) { setError("Pick a site"); return }
        if (!startDate) { setError("Pick the date the posting starts"); return }
        setSaving(true); setError(null)
        try {
            const res = await fetch("/api/deployments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId: joiner.id, siteId, startDate, shift: shift || null, source: "new-joiners" }),
            })
            if (!res.ok) {
                const t = await res.text()
                let msg = t
                try { msg = JSON.parse(t).error ?? t } catch { /* plain text */ }
                setError(msg || "Could not assign the site")
                return
            }
            onDone(sites?.find(s => s.id === siteId)?.name ?? "the site")
        } catch {
            setError("Could not reach the server. Check the connection and try again.")
        } finally {
            setSaving(false)
        }
    }

    const field = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
    return (
        <form onSubmit={submit} className={compact ? "mt-2 space-y-2" : "space-y-3"} aria-label={`Assign a site to ${joiner.name}`}>
            <div className={compact ? "space-y-2" : "grid gap-3 sm:grid-cols-3"}>
                <label className="block">
                    <span className="block text-[10.5px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Site <span className="text-[var(--red)]">*</span></span>
                    <select value={siteId} onChange={e => { setSiteId(e.target.value); setError(null) }} className={field} disabled={!sites || saving} ref={siteRef}>
                        <option value="">{sites ? (sites.length ? "Choose a site…" : "No active sites") : "Loading sites…"}</option>
                        {sites?.map(s => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}{s.city ? ` · ${s.city}` : ""}</option>)}
                    </select>
                </label>
                <div className={compact ? "grid grid-cols-2 gap-2" : "contents"}>
                    <label className="block">
                        <span className="block text-[10.5px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">From <span className="text-[var(--red)]">*</span></span>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={field} disabled={saving} />
                    </label>
                    <label className="block">
                        <span className="block text-[10.5px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Shift</span>
                        <input type="text" value={shift} onChange={e => setShift(e.target.value.slice(0, 40))} placeholder="Optional" className={field} disabled={saving} />
                    </label>
                </div>
            </div>
            {error && <p role="alert" className="text-[11.5px] font-medium text-[var(--red)]">{error}</p>}
            <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={onCancel} disabled={saving} className="h-8 px-3 rounded-[8px] text-[12.5px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)]">Cancel</button>
                <button type="submit" disabled={saving || !sites} className="h-8 px-3.5 rounded-[8px] text-[12.5px] font-semibold text-white bg-[var(--accent)] hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-1.5">
                    {saving && <Loader2 size={13} className="animate-spin" />} Assign site
                </button>
            </div>
        </form>
    )
}
