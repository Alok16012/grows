"use client"

// "Refresher for a site": enrol everyone at one site in a course — for example
// after a customer complaint there — optionally sending people who already
// passed through it again.
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, RotateCcw, X } from "lucide-react"

const input = "h-9 w-full rounded-[9px] border border-[var(--border)] bg-white px-2.5 text-[13px] outline-none focus:border-[var(--accent)]"

export default function SiteRefresher({ onDone }: { onDone?: () => void }) {
    const [open, setOpen] = useState(false)
    const [courses, setCourses] = useState<{ id: string; title: string; courseCode: string }[]>([])
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [courseId, setCourseId] = useState("")
    const [siteId, setSiteId] = useState("")
    const [dueDays, setDueDays] = useState(7)
    const [includeCompleted, setIncludeCompleted] = useState(true)
    const [preview, setPreview] = useState<{ staff: number; toEnrol: number; toReset: number; already: number } | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (!open) return
        fetch("/api/lms/courses").then(r => r.json()).then(d => setCourses((Array.isArray(d) ? d : []).filter((c: any) => c.status === "PUBLISHED").map((c: any) => ({ id: c.id, title: c.title, courseCode: c.courseCode })))).catch(() => {})
        fetch("/api/sites?isActive=true").then(r => r.json()).then(d => setSites(Array.isArray(d) ? d.sort((a: any, b: any) => a.name.localeCompare(b.name)) : [])).catch(() => {})
    }, [open])
    useEffect(() => {
        setPreview(null)
        if (!courseId || !siteId) return
        fetch("/api/lms/enrollments/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, siteId, includeCompleted, preview: true }) })
            .then(r => r.json()).then(d => d?.staff !== undefined && setPreview(d)).catch(() => {})
    }, [courseId, siteId, includeCompleted])

    async function assign() {
        setBusy(true)
        try {
            const r = await fetch("/api/lms/enrollments/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, siteId, dueDays, includeCompleted }) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Could not assign")
            toast.success(`${d.enrolled} enrolled, ${d.reenrolled} sent through again`)
            setOpen(false); onDone?.()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }

    return (
        <>
            <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[9px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text2)]">
                <RotateCcw className="h-4 w-4" /> Refresher for a site
            </button>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
                    <div className="w-full max-w-md rounded-[14px] bg-white p-5 space-y-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between"><p className="text-[15px] font-semibold">Refresher for a site</p><button onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
                        <p className="text-[12px] text-[var(--text3)]">Everyone deployed at the site gets the course with a due date — useful after a customer complaint there.</p>
                        <label className="block text-[12px] text-[var(--text3)]">Course (published)<select className={`${input} mt-1`} value={courseId} onChange={e => setCourseId(e.target.value)}><option value="">Pick a course…</option>{courses.map(c => <option key={c.id} value={c.id}>{c.courseCode} {c.title}</option>)}</select></label>
                        <label className="block text-[12px] text-[var(--text3)]">Site<select className={`${input} mt-1`} value={siteId} onChange={e => setSiteId(e.target.value)}><option value="">Pick a site…</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                        <label className="block text-[12px] text-[var(--text3)]">Days to finish<input type="number" min={1} className={`${input} mt-1`} value={dueDays} onChange={e => setDueDays(Number(e.target.value))} /></label>
                        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-[var(--accent)]" checked={includeCompleted} onChange={e => setIncludeCompleted(e.target.checked)} /> Also send people who already passed it</label>
                        {preview && <p className="text-[12.5px] text-[var(--text2)]"><b>{preview.staff}</b> at the site: {preview.toEnrol} new, {preview.toReset} again, {preview.already} already on it.</p>}
                        <div className="flex justify-end gap-2 pt-1">
                            <button className="h-9 px-4 rounded-[9px] border border-[var(--border)] text-[13px]" onClick={() => setOpen(false)}>Cancel</button>
                            <button className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50" disabled={busy || !preview || preview.toEnrol + preview.toReset === 0} onClick={assign}>
                                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Assign
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
