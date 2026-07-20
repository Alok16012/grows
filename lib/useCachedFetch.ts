"use client"

import { useEffect, useRef, useState } from "react"

// Stale-while-revalidate fetch backed by sessionStorage.
//
// The server sits far from many users (~400ms+ per round trip), so pages that
// re-fetch on every visit feel slow even when nothing changed. This hook paints
// the last known response instantly (same tab session), then refreshes in the
// background and updates in place.
export function useCachedFetch<T>(url: string, maxAgeMs = 5 * 60_000) {
    const key = `swr:${url}`
    const [data, setData] = useState<T | null>(() => {
        if (typeof window === "undefined") return null
        try {
            const raw = sessionStorage.getItem(key)
            if (!raw) return null
            const { t, v } = JSON.parse(raw)
            if (Date.now() - t > maxAgeMs) return null
            return v as T
        } catch { return null }
    })
    // Only show the loading skeleton when we have nothing cached to paint.
    const [loading, setLoading] = useState(data === null)
    const aborted = useRef(false)

    useEffect(() => {
        aborted.current = false
        fetch(url)
            .then(r => (r.ok ? r.json() : null))
            .then(v => {
                if (aborted.current) return
                if (v !== null) {
                    setData(v)
                    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })) } catch { /* quota */ }
                }
                setLoading(false)
            })
            .catch(() => { if (!aborted.current) setLoading(false) })
        return () => { aborted.current = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url])

    return { data, loading }
}
