"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { can } from "@/lib/can"
import { ChevronLeft, Loader2, Send, Ban, RotateCcw, Trash2 } from "lucide-react"
import { JobDetailView } from "@/components/jobs/JobDetailView"
import { JobPosting, STATUS_META, JobStatus } from "@/components/jobs/constants"

export default function JobDetailPage() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()
    const { data: session } = useSession()
    const canManage = can(session, "jobs.manage")

    const [job, setJob] = useState<JobPosting | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        ;(async () => {
            try {
                const res = await fetch(`/api/jobs/${id}`)
                if (!res.ok) throw new Error()
                setJob(await res.json())
            } catch {
                toast.error("Failed to load job")
            } finally {
                setLoading(false)
            }
        })()
    }, [id])

    const setStatus = async (status: JobStatus) => {
        setBusy(true)
        try {
            const res = await fetch(`/api/jobs/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setJob(data)
            toast.success(`Job ${STATUS_META[status].label.toLowerCase()}`)
        } catch (e: any) {
            toast.error(e.message || "Update failed")
        } finally {
            setBusy(false)
        }
    }

    const remove = async () => {
        if (!confirm("Delete this job posting? This cannot be undone.")) return
        setBusy(true)
        try {
            const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" })
            if (!res.ok) throw new Error()
            toast.success("Job deleted")
            router.push("/jobs")
        } catch {
            toast.error("Delete failed")
            setBusy(false)
        }
    }

    if (loading) {
        return <div className="flex items-center justify-center py-24 text-[var(--text3)]"><Loader2 className="animate-spin" /></div>
    }
    if (!job) {
        return <div className="p-8 text-center text-[var(--text2)]">Job not found.</div>
    }

    return (
        <div className="p-4 lg:p-0">
            <button onClick={() => router.push("/jobs")} className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text2)] hover:text-[var(--text)] mb-4">
                <ChevronLeft size={16} /> Back to Jobs
            </button>

            <div className="flex flex-wrap items-center justify-end gap-3 mb-4">
                {canManage && (
                    <div className="flex items-center gap-2">
                        {job.status !== "PUBLISHED" && (
                            <button onClick={() => setStatus("PUBLISHED")} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-50">
                                <Send size={14} /> Publish
                            </button>
                        )}
                        {job.status === "PUBLISHED" && (
                            <button onClick={() => setStatus("CLOSED")} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[12px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-50">
                                <Ban size={14} /> Close
                            </button>
                        )}
                        {job.status === "CLOSED" && (
                            <button onClick={() => setStatus("DRAFT")} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[12px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-50">
                                <RotateCcw size={14} /> Reopen as draft
                            </button>
                        )}
                        <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                            <Trash2 size={14} /> Delete
                        </button>
                    </div>
                )}
            </div>

            <div className="max-w-5xl">
                <JobDetailView
                    job={job}
                    onApply={() => toast.info("Candidate application flow isn't enabled yet.")}
                />
                {job.creator && (
                    <p className="text-[12px] text-[var(--text3)] mt-3">
                        Posted by {job.creator.name} · {new Date(job.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                )}
            </div>
        </div>
    )
}
