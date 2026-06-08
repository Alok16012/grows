"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { can } from "@/lib/can"
import {
    Plus, Search, Loader2, Briefcase, MapPin, IndianRupee, Users, Target,
} from "lucide-react"
import {
    JobPosting, STATUS_META, formatExperience, formatSalary,
} from "@/components/jobs/constants"

const STATUS_FILTERS = ["ALL", "PUBLISHED", "DRAFT", "CLOSED"] as const

export default function JobsPage() {
    const { data: session } = useSession()
    const canView = can(session, "jobs.view")
    const canManage = can(session, "jobs.manage")

    const [jobs, setJobs] = useState<JobPosting[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("ALL")

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (status !== "ALL") params.set("status", status)
            if (search.trim()) params.set("search", search.trim())
            const res = await fetch(`/api/jobs?${params.toString()}`)
            if (!res.ok) throw new Error()
            setJobs(await res.json())
        } catch {
            toast.error("Failed to load jobs")
        } finally {
            setLoading(false)
        }
    }, [status, search])

    useEffect(() => {
        if (!canView) return
        const t = setTimeout(load, 250)
        return () => clearTimeout(t)
    }, [load, canView])

    if (!canView) {
        return <div className="p-8 text-center text-[var(--text2)]">You don&apos;t have access to job postings.</div>
    }

    return (
        <div className="p-4 lg:p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text)]">Jobs</h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">Internal job postings for the organisation</p>
                </div>
                {canManage && (
                    <Link
                        href="/jobs/new"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90"
                    >
                        <Plus size={16} /> Post a job
                    </Link>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-5">
                <div className="relative flex-1 min-w-[220px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by title, role, department or location"
                        className="w-full rounded-lg border border-[var(--border)] bg-white pl-9 pr-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    />
                </div>
                <div className="flex items-center gap-1.5">
                    {STATUS_FILTERS.map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatus(s)}
                            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                                status === s ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
                            }`}
                        >
                            {s === "ALL" ? "All" : STATUS_META[s].label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-[var(--text3)]">
                    <Loader2 className="animate-spin" />
                </div>
            ) : jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-14 w-14 rounded-full bg-[var(--surface2)] flex items-center justify-center mb-3">
                        <Target className="text-[var(--text3)]" />
                    </div>
                    <p className="text-[var(--text)] font-medium">No jobs yet</p>
                    <p className="text-[13px] text-[var(--text3)] mt-1">
                        {canManage ? "Post your first internal opening to get started." : "Check back later for openings."}
                    </p>
                    {canManage && (
                        <Link href="/jobs/new" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[13px] font-medium">
                            <Plus size={16} /> Post a job
                        </Link>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {jobs.map((job) => {
                        const meta = STATUS_META[job.status]
                        return (
                            <Link
                                key={job.id}
                                href={`/jobs/${job.id}`}
                                className="rounded-xl border border-[var(--border)] bg-white p-4 hover:shadow-md hover:border-[var(--accent)]/40 transition-all"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-semibold text-[var(--text)] truncate">{job.title}</h3>
                                    <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                                </div>
                                {job.department && <p className="text-[12px] text-[var(--text3)] mt-0.5 truncate">{job.department}</p>}

                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[12px] text-[var(--text2)]">
                                    <span className="inline-flex items-center gap-1">
                                        <Briefcase size={13} />
                                        {formatExperience(job.workExpMin, job.workExpMax, job.freshersAllowed)}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <IndianRupee size={13} />
                                        {formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod)}
                                    </span>
                                    {job.jobLocation && (
                                        <span className="inline-flex items-center gap-1">
                                            <MapPin size={13} /> {job.jobLocation}
                                        </span>
                                    )}
                                </div>

                                {job.skills?.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                        {job.skills.slice(0, 4).map((s) => (
                                            <span key={s} className="px-2 py-0.5 rounded-full border border-[var(--border)] text-[11px] text-[var(--text2)]">{s}</span>
                                        ))}
                                        {job.skills.length > 4 && <span className="text-[11px] text-[var(--text3)]">+{job.skills.length - 4}</span>}
                                    </div>
                                )}

                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)] text-[11px] text-[var(--text3)]">
                                    <span className="inline-flex items-center gap-1"><Users size={12} /> {job.openings} opening{job.openings === 1 ? "" : "s"}</span>
                                    <span>{new Date(job.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
