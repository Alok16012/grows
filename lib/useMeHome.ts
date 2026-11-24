"use client"

// /api/me/home shared by the sidebar profile block and the desktop home, so the
// page makes one request; a check-in in either place refreshes both.
import { useCallback, useEffect, useState } from "react"

export type MeHome = {
    employee: { firstName: string; name?: string; photo?: string | null; code: string; designation: string | null; site: string | null } | null
    today: { checkIn: string | null; checkOut: string | null; status: string | null; workingHrs: number | null } | null
    month: { present: number; leave: number; absent: number }
    leave: { total: number; items: { code: string; name: string; available: number; color?: string | null }[] } | null
    tasks: { myOpen: number; myOverdue: number; awaitingMine: number; doneThisMonth?: number }
    holiday: { name: string; date: string } | null
    monthHolidays?: { name: string; date: string; type?: string | null }[]
    announcements: { id: string; title: string; category: string; publishedAt: string }[]
    celebrations: { name: string; kind: string; years: number | null }[]
    /** null when the viewer's role can't see staff data — the section is hidden. */
    newJoiners?: { name: string; designation: string | null; site: string | null; date: string }[] | null
}

let cache: { at: number; data: MeHome | null } | null = null
let inflight: Promise<MeHome | null> | null = null
const listeners = new Set<(d: MeHome | null) => void>()

function fetchHome(force = false): Promise<MeHome | null> {
    if (!force && cache && Date.now() - cache.at < 60_000) return Promise.resolve(cache.data)
    if (!force && inflight) return inflight
    inflight = fetch("/api/me/home").then(r => r.ok ? r.json() : null).then(j => (j && !j.error ? j as MeHome : null)).catch(() => null)
        .then(d => { cache = { at: Date.now(), data: d }; inflight = null; listeners.forEach(l => l(d)); return d })
    return inflight
}

export function useMeHome() {
    const [data, setData] = useState<MeHome | null>(cache?.data ?? null)
    useEffect(() => {
        listeners.add(setData)
        fetchHome().then(setData)
        return () => { listeners.delete(setData) }
    }, [])
    const reload = useCallback(() => { fetchHome(true) }, [])
    return { data, reload }
}

/** Check in / out from the browser (location when allowed), then refresh the shared data. */
export async function punchAttendance(action: "in" | "out") {
    const loc = await new Promise<{ lat: number; lng: number } | null>(res => {
        if (!navigator.geolocation) return res(null)
        navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { timeout: 5000 })
    })
    const r = await fetch("/api/me/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(loc ?? {}) }) })
    if (!r.ok) throw new Error((await r.text()) || "Couldn't save")
    fetchHome(true)
}
