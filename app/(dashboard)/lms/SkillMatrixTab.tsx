"use client"

// Training (LMS) → Skill matrix: the skills list and, per site, staff × skills
// with levels 0–4. Levels rise from courses (theory) and on-the-job sign-offs;
// HR can also set a level here.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Download, Loader2, Plus, X } from "lucide-react"

type Skill = { id: string; code: string; name: string; category: string; siteId: string | null; courseId: string | null; description: string | null; isActive: boolean; siteName?: string | null; courseName?: string | null; people?: number }
type Emp = { id: string; employeeId: string; firstName: string; lastName: string; designation: string | null }
type Level = { employeeId: string; skillId: string; level: number; source: string; assessedAt: string }

const LEVELS = ["Not trained", "Theory done", "Under supervision", "Independent", "Can train others"]
const TONE = ["bg-[var(--surface2)] text-[var(--text3)]", "bg-[#fef3c7] text-[#92400e]", "bg-[#e3ebff] text-[#2f5be0]", "bg-[#dcfce7] text-[#166534]", "bg-[#166534] text-white"]
const CATS = ["PROCESS", "PART", "CUSTOMER", "SAFETY"]
const input = "h-9 rounded-[9px] border border-[var(--border)] bg-white px-2.5 text-[13px] outline-none focus:border-[var(--accent)]"
const btn = "inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[9px] text-[13px] font-medium disabled:opacity-50"

async function api<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const r = await fetch(url, init?.body !== undefined ? { method: init.method ?? "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) } : { method: init?.method ?? "GET" })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d?.error || "Something went wrong")
    return d as T
}

export default function SkillMatrixTab() {
    const [skills, setSkills] = useState<Skill[]>([])
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [courses, setCourses] = useState<{ id: string; title: string; courseCode: string }[]>([])
    const [siteId, setSiteId] = useState("")
    const [matrix, setMatrix] = useState<{ employees: Emp[]; skills: Skill[]; levels: Level[]; multiskilled: number; rule: any; canEdit: boolean } | null>(null)
    const [loading, setLoading] = useState(false)
    const [edit, setEdit] = useState<Partial<Skill> | null>(null)
    const [cell, setCell] = useState<{ emp: Emp; skill: Skill; level: number } | null>(null)
    const [error, setError] = useState<string | null>(null)

    const loadSkills = useCallback(() => api<{ skills: Skill[] }>("/api/lms/skills").then(d => { setSkills(d.skills); setError(null) }).catch(e => setError(e.message)), [])
    useEffect(() => {
        loadSkills()
        fetch("/api/sites?isActive=true").then(r => r.json()).then(d => setSites(Array.isArray(d) ? d.sort((a: any, b: any) => a.name.localeCompare(b.name)) : [])).catch(() => {})
        fetch("/api/lms/courses").then(r => r.json()).then(d => setCourses((Array.isArray(d) ? d : d?.courses ?? []).map((c: any) => ({ id: c.id, title: c.title, courseCode: c.courseCode })))).catch(() => {})
    }, [loadSkills])

    const loadMatrix = useCallback(async () => {
        if (!siteId) { setMatrix(null); return }
        setLoading(true)
        try { setMatrix(await api(`/api/lms/skills/matrix?siteId=${siteId}`)) } catch (e: any) { toast.error(e.message) } finally { setLoading(false) }
    }, [siteId])
    useEffect(() => { loadMatrix() }, [loadMatrix])

    const levelOf = useMemo(() => new Map((matrix?.levels ?? []).map(l => [`${l.employeeId}|${l.skillId}`, l])), [matrix])

    async function saveSkill(body: any) {
        try {
            if (edit?.id) await api(`/api/lms/skills/${edit.id}`, { method: "PATCH", body }); else await api("/api/lms/skills", { body })
            toast.success("Skill saved"); setEdit(null); loadSkills(); loadMatrix()
        } catch (e: any) { toast.error(e.message) }
    }
    async function saveLevel(level: number) {
        if (!cell) return
        try { await api("/api/lms/skills/matrix", { method: "PUT", body: { employeeId: cell.emp.id, skillId: cell.skill.id, level } }); setCell(null); loadMatrix() }
        catch (e: any) { toast.error(e.message) }
    }
    function exportCsv() {
        if (!matrix) return
        const head = ["Employee ID", "Name", "Designation", ...matrix.skills.map(s => `${s.code} ${s.name}`)]
        const rows = matrix.employees.map(e => [e.employeeId, `${e.firstName} ${e.lastName}`.trim(), e.designation ?? "", ...matrix.skills.map(s => String(levelOf.get(`${e.id}|${s.id}`)?.level ?? 0))])
        const csv = [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `skill-matrix-${sites.find(s => s.id === siteId)?.name ?? "site"}.csv`; a.click()
    }

    if (error) return <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-5 text-[13px] text-[#dc2626]">{error}</div>

    return (
        <div className="space-y-4">
            {/* Skills */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px]">
                <div className="flex flex-wrap items-center gap-2 p-4 border-b border-[var(--border)]">
                    <div>
                        <p className="text-[14px] font-semibold text-[var(--text)]">Skills</p>
                        <p className="text-[12px] text-[var(--text3)]">Levels: 0 not trained · 1 theory done (course passed) · 2 under supervision · 3 independent (on-the-job sign-off) · 4 can train others.</p>
                    </div>
                    <div className="flex-1" />
                    <Link href="/lms/ojt" className={`${btn} border border-[var(--border)] bg-white text-[var(--text2)]`}>On-the-job sign-off</Link>
                    <button className={`${btn} bg-[var(--accent)] text-white`} onClick={() => setEdit({ category: "PROCESS" })}><Plus className="h-4 w-4" /> Add skill</button>
                </div>
                {skills.length === 0 ? <p className="p-5 text-[13px] text-[var(--text3)]">No skills yet. Add the skills you track today, e.g. “Firewall visual inspection”, “Thread gauge checking”, or a customer part like “Kratos tray”.</p> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead className="bg-[var(--surface2)]"><tr className="text-left text-[11px] uppercase text-[var(--text3)]">
                                <th className="px-3 py-2">Code</th><th className="px-3 py-2">Skill</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Site</th><th className="px-3 py-2">Course (theory)</th><th className="px-3 py-2 text-right">People</th><th className="px-3 py-2" />
                            </tr></thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {skills.map(s => (
                                    <tr key={s.id} className={s.isActive ? "" : "opacity-50"}>
                                        <td className="px-3 py-2 font-mono text-[12px] text-[var(--text3)]">{s.code}</td>
                                        <td className="px-3 py-2 font-medium">{s.name}</td>
                                        <td className="px-3 py-2 text-[12px]">{s.category[0] + s.category.slice(1).toLowerCase()}</td>
                                        <td className="px-3 py-2 text-[12px]">{s.siteName ?? "All sites"}</td>
                                        <td className="px-3 py-2 text-[12px]">{s.courseName ?? "—"}</td>
                                        <td className="px-3 py-2 text-right font-mono">{s.people ?? 0}</td>
                                        <td className="px-3 py-2 text-right"><button className="text-[12px] text-[var(--accent)]" onClick={() => setEdit(s)}>Edit</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Matrix */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px]">
                <div className="flex flex-wrap items-center gap-2 p-4 border-b border-[var(--border)]">
                    <p className="text-[14px] font-semibold text-[var(--text)] mr-2">Matrix</p>
                    <select className={input} value={siteId} onChange={e => setSiteId(e.target.value)}>
                        <option value="">Pick a site…</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {loading && <Loader2 className="h-4 w-4 animate-spin text-[var(--text3)]" />}
                    {matrix && <span className="text-[12.5px] text-[var(--text2)]"><b className="font-mono">{matrix.multiskilled}</b> of {matrix.employees.length} multiskilled (≥{matrix.rule.multiskillMinSkills} skills at level {matrix.rule.multiskillMinLevel}+)</span>}
                    <div className="flex-1" />
                    {matrix && <button className={`${btn} border border-[var(--border)] bg-white text-[var(--text2)]`} onClick={exportCsv}><Download className="h-4 w-4" /> Excel (CSV)</button>}
                </div>
                {!matrix ? <p className="p-5 text-[13px] text-[var(--text3)]">Pick a site to see who can do what.</p>
                    : matrix.skills.length === 0 ? <p className="p-5 text-[13px] text-[var(--text3)]">No skills apply to this site yet.</p>
                    : (
                        <div className="overflow-auto max-h-[65vh]">
                            <table className="text-[12px] border-separate border-spacing-0">
                                <thead className="sticky top-0 z-[2] bg-[var(--surface)]"><tr>
                                    <th className="sticky left-0 z-[3] bg-[var(--surface)] px-3 py-2 text-left min-w-[200px] border-b border-[var(--border)]">Employee</th>
                                    {matrix.skills.map(s => <th key={s.id} className="px-1.5 py-2 border-b border-[var(--border)] align-bottom"><div className="w-[78px] text-[10.5px] font-medium text-[var(--text2)] leading-tight" title={s.name}>{s.name}</div></th>)}
                                </tr></thead>
                                <tbody>
                                    {matrix.employees.map(e => (
                                        <tr key={e.id}>
                                            <td className="sticky left-0 z-[1] bg-[var(--surface)] px-3 py-1.5 border-b border-[var(--border)]"><p className="font-medium text-[var(--text)]">{e.firstName} {e.lastName}</p><p className="text-[10.5px] text-[var(--text3)]">{e.employeeId}{e.designation ? ` · ${e.designation}` : ""}</p></td>
                                            {matrix.skills.map(s => {
                                                const l = levelOf.get(`${e.id}|${s.id}`)
                                                const lv = l?.level ?? 0
                                                return (
                                                    <td key={s.id} className="px-1.5 py-1.5 border-b border-[var(--border)] text-center">
                                                        <button disabled={!matrix.canEdit} onClick={() => setCell({ emp: e, skill: s, level: lv })}
                                                            title={`${LEVELS[lv]}${l ? ` · ${l.source.toLowerCase()} · ${new Date(l.assessedAt).toLocaleDateString("en-GB")}` : ""}`}
                                                            className={`h-7 w-9 rounded-[6px] font-mono font-semibold ${TONE[lv]} disabled:cursor-default`}>{lv}</button>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </div>

            {edit && <SkillForm initial={edit} sites={sites} courses={courses} onClose={() => setEdit(null)} onSave={saveSkill} />}
            {cell && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCell(null)}>
                    <div className="w-full max-w-sm rounded-[14px] bg-white p-5 space-y-2" onClick={e => e.stopPropagation()}>
                        <p className="text-[14px] font-semibold">{cell.emp.firstName} {cell.emp.lastName}</p>
                        <p className="text-[12px] text-[var(--text3)] mb-2">{cell.skill.name}</p>
                        {LEVELS.map((label, i) => (
                            <button key={i} onClick={() => saveLevel(i)} className={`w-full flex items-center gap-2 h-9 px-3 rounded-[9px] border text-[13px] ${cell.level === i ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
                                <span className={`h-6 w-7 rounded-[5px] font-mono font-semibold flex items-center justify-center ${TONE[i]}`}>{i}</span>{label}
                            </button>
                        ))}
                        <p className="text-[11px] text-[var(--text3)] pt-1">Usually levels come from courses and on-the-job sign-offs; set here only to correct the record.</p>
                    </div>
                </div>
            )}
        </div>
    )
}

function SkillForm({ initial, sites, courses, onClose, onSave }: { initial: Partial<Skill>; sites: { id: string; name: string }[]; courses: { id: string; title: string; courseCode: string }[]; onClose: () => void; onSave: (b: any) => void }) {
    const [name, setName] = useState(initial.name ?? "")
    const [category, setCategory] = useState(initial.category ?? "PROCESS")
    const [siteId, setSiteId] = useState(initial.siteId ?? "")
    const [courseId, setCourseId] = useState(initial.courseId ?? "")
    const [description, setDescription] = useState(initial.description ?? "")
    const [isActive, setActive] = useState(initial.isActive ?? true)
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="w-full max-w-md rounded-[14px] bg-white p-5 space-y-3" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between"><p className="text-[15px] font-semibold">{initial.id ? `Edit ${initial.code}` : "Add a skill"}</p><button onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button></div>
                <label className="block text-[12px] text-[var(--text3)]">Skill<input className={`${input} w-full mt-1`} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Firewall visual inspection" /></label>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block text-[12px] text-[var(--text3)]">Category<select className={`${input} w-full mt-1`} value={category} onChange={e => setCategory(e.target.value)}>{CATS.map(c => <option key={c} value={c}>{c[0] + c.slice(1).toLowerCase()}</option>)}</select></label>
                    <label className="block text-[12px] text-[var(--text3)]">Site<select className={`${input} w-full mt-1`} value={siteId} onChange={e => setSiteId(e.target.value)}><option value="">All sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                </div>
                <label className="block text-[12px] text-[var(--text3)]">Course that gives the theory level (optional)
                    <select className={`${input} w-full mt-1`} value={courseId} onChange={e => setCourseId(e.target.value)}><option value="">— None —</option>{courses.map(c => <option key={c.id} value={c.id}>{c.courseCode} {c.title}</option>)}</select>
                </label>
                <label className="block text-[12px] text-[var(--text3)]">What “independent” means (optional)<textarea rows={2} className="w-full mt-1 rounded-[9px] border border-[var(--border)] p-2.5 text-[13px] outline-none" value={description} onChange={e => setDescription(e.target.value)} /></label>
                {initial.id && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-[var(--accent)]" checked={isActive} onChange={e => setActive(e.target.checked)} /> Active</label>}
                <div className="flex justify-end gap-2"><button className={`${btn} border border-[var(--border)] bg-white`} onClick={onClose}>Cancel</button>
                    <button className={`${btn} bg-[var(--accent)] text-white`} disabled={name.trim().length < 2} onClick={() => onSave({ name, category, siteId: siteId || null, courseId: courseId || null, description, isActive })}>Save</button></div>
            </div>
        </div>
    )
}
