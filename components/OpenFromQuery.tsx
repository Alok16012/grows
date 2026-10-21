"use client"

import { Suspense, useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

// Notification links point at one record (e.g. /expenses?id=…). A page renders
// this to open that record with its own drawer/modal handler, once, and then
// drops the param so a refresh doesn't keep reopening it.

type Props = {
    /** Query param carrying the record key. */
    param?: string
    /** Hold off until the page can open records (session known, list loaded). */
    ready?: boolean
    onOpen: (value: string) => void | Promise<void>
}

function OpenFromQueryInner({ param = "id", ready = true, onOpen }: Props) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const value = searchParams.get(param)
    // The page re-renders while the record loads; open each value only once.
    const handled = useRef<string | null>(null)

    useEffect(() => {
        if (!ready || !value || handled.current === value) return
        handled.current = value
        Promise.resolve()
            .then(() => onOpen(value))
            .catch(() => {})
            .finally(() => {
                // Read the live URL: the page may have changed other params meanwhile.
                const rest = new URLSearchParams(window.location.search)
                rest.delete(param)
                const qs = rest.toString()
                router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
            })
    }, [ready, value, param, onOpen, router, pathname])

    return null
}

// Own Suspense boundary: useSearchParams in a statically rendered page would
// otherwise push the whole page to client-side rendering and fail `next build`.
export function OpenFromQuery(props: Props) {
    return (
        <Suspense fallback={null}>
            <OpenFromQueryInner {...props} />
        </Suspense>
    )
}
