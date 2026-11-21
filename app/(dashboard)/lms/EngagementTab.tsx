"use client"

// Training (LMS) → Engagement: per learner, how they really went through a
// course — active minutes, video watched, skips, PDF pages, score — and flags.
import { useEffect, useState } from "react"
import { Download, Loader2 } from "lucide-react"

export default function EngagementTab() {
    const [courses, setCourses] = useState<{ id: string; title: string; courseCode: string }[]>([])
    const [courseId, setCourseId] = useState("")
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [flaggedOnly, setFlaggedOnly] = useState(false)

    useEffect(() => { fetch("/api/lms/courses").then(r => r.json()).then(d => setCourses((Array.isArray(d) ? d : []).map((c: any) => ({ id: c.id, title: c.title, courseCode: c.courseCode })))).catch(() => {}) }, [])
    useEffect(() => {
        if (!courseId) { setData(null); return }
        setLoading(true)
        fetch(`/api/lms/engagement?courseId=${courseId}`).then(r => r.json()).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
    }, [courseId])

    const rows: any[] = (data?.rows ?? []).filter((r: any) => !flaggedOnly || r.flags.length)
    function exportCsv() {
        const head = ["Employee ID", "Name", "Status", "Progress %", "Active min", "Planned min", "Video watched %", "Forward skips", "PDF pages seen", "Quiz score", "Attempts", "Flags"]
        const body = rows.map(r => [r.code, r.name, r.status, r.progress, r.activeMin, r.plannedMin, r.videoPct ?? "", r.skips, r.pagesTotal ? `${r.pagesSeen}/${r.pagesTotal}` : "", r.score ?? "", r.attempts, r.flags.join("; ")])
        const csv = [head, ...body].map(x => x.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `engagement-${data?.course ?? "course"}.csv`; a.click()
    }

    return (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px]">
            <div className="flex flex-wrap items-center gap-2 p-4 border-b border-[var(--border)]">
                <select className="h-9 rounded-[9px] border border-[var(--border)] bg-white px-2.5 text-[13px]" value={courseId} onChange={e => setCourseId(e.target.value)}>
                    <option value="">Pick a course…</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.courseCode} {c.title}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--text2)]"><input type="checkbox" className="accent-[var(--accent)]" checked={flaggedOnly} onChange={e => setFlaggedOnly(e.target.checked)} /> Flagged only</label>
                {loading && <Loader2 className="h-4 w-4 animate-spin text-[var(--text3)]" />}
                <div className="flex-1" />
                {data?.rows?.length > 0 && <button onClick={exportCsv} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[9px] border border-[var(--border)] bg-white text-[13px] text-[var(--text2)]"><Download className="h-4 w-4" /> Excel (CSV)</button>}
            </div>
            {!courseId ? <p className="p-5 text-[13px] text-[var(--text3)]">Pick a course to see how each learner actually went through it: time spent, video watched, skipping, pages read.</p>
                : data?.error ? <p className="p-5 text-[13px] text-[#dc2626]">{data.error}</p>
                : !rows.length ? <p className="p-5 text-[13px] text-[var(--text3)]">{flaggedOnly ? "Nobody flagged." : "No one enrolled yet."}</p>
                : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead className="bg-[var(--surface2)]"><tr className="text-left text-[11px] uppercase text-[var(--text3)]">
                                <th className="px-3 py-2">Learner</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Active / planned min</th>
                                {data.hasVideo && <th className="px-3 py-2 text-right">Video watched</th>}
                                <th className="px-3 py-2 text-right">Skips</th>
                                {data.hasPdf && <th className="px-3 py-2 text-right">PDF pages</th>}
                                <th className="px-3 py-2 text-right">Score</th><th className="px-3 py-2">Flags</th>
                            </tr></thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {rows.map(r => (
                                    <tr key={r.id} className={r.flags.length ? "bg-[#fffbeb]" : ""}>
                                        <td className="px-3 py-2"><p className="font-medium text-[var(--text)]">{r.name}</p><p className="text-[11px] text-[var(--text3)]">{r.code}</p></td>
                                        <td className="px-3 py-2">{r.status === "COMPLETED" ? "Completed" : r.status === "FAILED" ? "Failed" : `${r.progress}%`}</td>
                                        <td className="px-3 py-2 text-right font-mono">{r.activeMin} / {r.plannedMin}</td>
                                        {data.hasVideo && <td className={`px-3 py-2 text-right font-mono ${r.videoPct !== null && r.videoPct < 50 ? "text-[#dc2626]" : ""}`}>{r.videoPct === null ? "—" : `${r.videoPct}%`}</td>}
                                        <td className={`px-3 py-2 text-right font-mono ${r.skips >= 5 ? "text-[#dc2626]" : ""}`}>{r.skips}</td>
                                        {data.hasPdf && <td className="px-3 py-2 text-right font-mono">{r.pagesTotal ? `${r.pagesSeen}/${r.pagesTotal}` : "—"}</td>}
                                        <td className="px-3 py-2 text-right font-mono">{r.score != null ? `${Math.round(r.score)}%` : "—"}</td>
                                        <td className="px-3 py-2 text-[11.5px] text-[#b45309]">{r.flags.join(" · ")}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
        </div>
    )
}
