"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/Sidebar"
import { TopNav } from "@/components/TopNav"
import { InspectionStepper } from "@/components/InspectionStepper"
import { cn } from "@/lib/utils"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)

    // Load sidebar state from localStorage on desktop if we wanted to
    // But for mobile it should always be closed by default

    return (
        <div className="flex min-h-screen w-full bg-muted/10">
            {/* Sidebar Desktop */}
            <div className="hidden border-r bg-white md:block w-64 shrink-0 transition-all duration-300">
                <Sidebar />
            </div>

            {/* Sidebar Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 md:hidden animate-in fade-in duration-300"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <div className={cn(
                "fixed inset-y-0 left-0 z-50 w-72 bg-white transform transition-transform duration-300 ease-in-out md:hidden",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <Sidebar onMobileClose={() => setIsSidebarOpen(false)} />
            </div>

            <div className="flex flex-col w-full min-w-0">
                <TopNav onMenuClick={() => setIsSidebarOpen(true)} />
                <main className="flex-1 overflow-y-auto flex flex-col">
                    {/* Removed 500ms fade-in/slide animation — was adding
                        perceived 500ms latency to every page navigation. */}
                    <div className="flex-1 mx-auto w-full flex flex-col gap-0 p-0 lg:gap-8 lg:p-8 max-w-7xl">
                        <InspectionStepper />
                        {children}
                    </div>
                    <footer className="py-4 text-center text-[13px] text-muted-foreground/80 mt-auto">
                        Developed by <a href="https://blinks-ai.com" target="_blank" rel="noopener noreferrer" className="text-[#1a9e6e] hover:underline font-medium">Blinks AI</a>
                    </footer>
                </main>
            </div>
        </div>
    )
}
