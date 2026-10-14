"use client"

import { ResponsiveHome } from "@/components/ResponsiveHome"
import { AdminOverview } from "@/components/dashboard/AdminOverview"
import { XCircle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useCachedFetch } from "@/lib/useCachedFetch"

// Phones get the Zavtoo-style MobileHome; md and up get the operations overview.
export default function AdminHome() {
    return <ResponsiveHome desktop={<AdminDashboard />} />
}

function AdminDashboard() {
    // Cached fetch: revisits paint the last snapshot instantly and refresh in
    // the background — critical because the server is far from most users.
    const { data: stats, loading } = useCachedFetch<any>("/api/admin/stats")

    if (loading) {
        return (
            <div className="space-y-5 animate-pulse p-4 lg:p-0">
                <Skeleton className="h-14 w-80 rounded-[14px]" />
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-[156px] w-full rounded-[16px]" />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Skeleton className="h-64 rounded-[16px]" />
                    <Skeleton className="h-64 rounded-[16px]" />
                </div>
            </div>
        )
    }

    if (!stats || stats.error) {
        return (
            <div className="flex h-[400px] flex-col items-center justify-center m-4 rounded-[14px] border border-dashed border-[var(--border)] bg-white">
                <XCircle size={40} className="text-[var(--red)] mb-4" />
                <h3 className="text-[18px] font-bold text-[var(--text)] mb-2">Failed to load data</h3>
                <p className="text-[13px] text-[var(--text2)] mb-6">{stats?.error || "Connection error"}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-2 bg-[var(--accent)] text-white text-[13px] font-semibold rounded-[8px] hover:opacity-90 transition-all"
                >
                    Retry
                </button>
            </div>
        )
    }

    return <AdminOverview stats={stats} />
}
