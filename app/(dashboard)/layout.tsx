"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/Sidebar"
import { TopNav } from "@/components/TopNav"
import { InspectionStepper } from "@/components/InspectionStepper"
import { MobileBottomNav } from "@/components/MobileBottomNav"
import { cn } from "@/lib/utils"
import { COMPANY } from "@/lib/company"

const RAIL_KEY = "grows.sidebar.rail"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)

    // Desktop: full sidebar or icon-only rail. The choice is remembered; with
    // none saved, narrow screens (tablets, small laptops) start on the rail so
    // the page keeps its room. The phone drawer is always the full sidebar.
    const [railCollapsed, setRailCollapsed] = useState(false)
    useEffect(() => {
        try {
            const saved = localStorage.getItem(RAIL_KEY)
            setRailCollapsed(saved === null ? window.innerWidth < 1100 : saved === "1")
        } catch { /* storage blocked: keep the full sidebar */ }
    }, [])
    const toggleRail = () => setRailCollapsed(c => {
        try { localStorage.setItem(RAIL_KEY, c ? "0" : "1") } catch { /* not remembered */ }
        return !c
    })

    return (
        <div className="flex min-h-screen w-full bg-muted/10">
            {/* Skip navigation — hidden until focused */}
            <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-[var(--accent)] focus:text-white focus:px-4 focus:py-2 focus:rounded-lg">
                Skip to content
            </a>

            {/* Sidebar Desktop — a full-height deep-blue rail flush to the edge. */}
            <div className={cn("hidden md:block shrink-0 transition-[width] duration-200 ease-out", railCollapsed ? "w-[76px]" : "w-[280px]")}>
                <div className="sticky top-0 h-screen">
                    <Sidebar collapsedRail={railCollapsed} onToggleRail={toggleRail} />
                </div>
            </div>

            {/* Sidebar Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 md:hidden animate-in fade-in duration-300"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <div className={cn(
                "fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] transform transition-transform duration-300 ease-in-out md:hidden",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <Sidebar onMobileClose={() => setIsSidebarOpen(false)} />
            </div>

            <div className="flex flex-col w-full min-w-0">
                <TopNav onMenuClick={() => setIsSidebarOpen(true)} />
                <main className="flex-1 overflow-y-auto flex flex-col">
                    {/* Removed 500ms fade-in/slide animation — was adding
                        perceived 500ms latency to every page navigation. */}
                    {/* Content fills the window (it used to stop at 1280px and left empty
                        bands either side on 1920px screens); 2200px only reins in ultrawides. */}
                    <div id="main-content" className="flex-1 mx-auto w-full min-w-0 flex flex-col gap-0 p-0 lg:gap-8 lg:p-8 max-w-[2200px] [&>*]:w-full [&>*]:min-w-0">
                        <InspectionStepper />
                        {children}
                    </div>
                    {/* Bottom padding on phones clears the floating bottom nav,
                        so it never sits over the last row of a page. */}
                    <footer className="py-4 pb-[96px] md:pb-4 text-center text-[13px] text-muted-foreground/80 mt-auto">
                        Developed by <a href={COMPANY.developerUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline font-medium">{COMPANY.developerCredit}</a>
                    </footer>
                </main>
            </div>

            <MobileBottomNav onMore={() => setIsSidebarOpen(true)} />
        </div>
    )
}
