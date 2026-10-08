"use client"

import { useEffect, useState } from "react"
import { MobileHome } from "@/components/MobileHome"

/**
 * Picks the home screen for the device: the Zavtoo-style MobileHome on a
 * phone, the full dashboard from md (768px) up — the same breakpoint at which
 * the bottom bar gives way to the sidebar.
 *
 * Only the chosen one is mounted. Hiding the other with CSS would still mount
 * it, and the admin dashboard alone fires several heavy requests a phone
 * would pay for and never show. Nothing renders until the width is known;
 * these pages are client-rendered and load their data after mount anyway,
 * so that costs a single frame.
 */
export function ResponsiveHome({ desktop }: { desktop: React.ReactNode }) {
    const [isDesktop, setIsDesktop] = useState<boolean | null>(null)

    useEffect(() => {
        const mq = window.matchMedia("(min-width: 768px)")
        const sync = () => setIsDesktop(mq.matches)
        sync()
        mq.addEventListener("change", sync)
        return () => mq.removeEventListener("change", sync)
    }, [])

    if (isDesktop === null) return null
    return isDesktop ? <>{desktop}</> : <MobileHome />
}
