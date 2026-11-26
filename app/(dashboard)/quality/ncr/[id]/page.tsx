"use client"

// One NCR: facts, the 8D steps (D1–D8 with the 5 Whys), status, owner, due
// date, activity, and the 8D report as a PDF.
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Download, Loader2, Save } from "lucide-react"
import { COMPANY } from "@/lib/company"
import { NcrStatusPill } from "@/components/quality/NcrUi"

const card = "bg-white border border-[var(--border)] rounded-[14px]"
const input = "h-9 rounded-[9px] border border-[var(--border)] bg-white px-2.5 text-[13px] outline-none focus:border-[var(--accent)] disabled:bg-[var(--surface2)]"
const area = "w-full rounded-[9px] border border-[var(--border)] p-2.5 text-[13px] outline-none focus:border-[var(--accent)] disabled:bg-[var(--surface2)]"
const btn = "inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[9px] text-[13px] font-medium disabled:opacity-50"
const STEPS = [
    { s: "OPEN", label: "Open" }, { s: "CONTAINMENT", label: "Containment" }, { s: "ROOT_CAUSE", label: "Root cause" },
    { s: "ACTION", label: "Corrective action" }, { s: "VERIFICATION", label: "Verification" }, { s: "CLOSED", label: "Closed" },
]
const dayInput = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : "")

async function api<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const r = await fetch(url, init?.body !== undefined ? { method: init.method ?? "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) } : { method: init?.method ?? "GET" })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d?.error || "Something went wrong")
    return d as T
}

export default function NcrPage({ params }: { params: { id: string } }) {
    const [n, setN] = useState<any>(null)
    const [form, setForm] = useState<any>({})
    const [owners, setOwners] = useState<{ id: string; name: string | null }[]>([])
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [note, setNote] = useState("")
    const [pdfBusy, setPdfBusy] = useState(false)

    const apply = (ncr: any) => {
        setN(ncr)
        setForm({
            title: ncr.title ?? "", severity: ncr.severity, ownerUserId: ncr.ownerUserId ?? "", dueDate: dayInput(ncr.dueDate), qtyAffected: ncr.qtyAffected ?? "",
            d1Team: ncr.d1Team ?? "", d2Problem: ncr.d2Problem ?? "", d3Containment: ncr.d3Containment ?? "", d3Date: dayInput(ncr.d3Date),
            d4RootCause: ncr.d4RootCause ?? "", d4Whys: [0, 1, 2, 3, 4].map(i => (Array.isArray(ncr.d4Whys) ? ncr.d4Whys[i] : "") ?? ""),
            d5Action: ncr.d5Action ?? "", d6Implemented: ncr.d6Implemented ?? "", d6Date: dayInput(ncr.d6Date), d7Prevention: ncr.d7Prevention ?? "",
            effective: ncr.effective, d8Closure: ncr.d8Closure ?? "",
        })
    }
    const load = useCallback(async () => {
        try { apply((await api<{ ncr: any }>(`/api/quality/ncr/${params.id}`)).ncr) } catch (e: any) { setError(e.message) }
    }, [params.id])
    useEffect(() => { load(); api<{ users: any[] }>("/api/quality/ncr?owners=1").then(d => setOwners(d.users)).catch(() => {}) }, [load])

    const set = (k: string, v: unknown) => setForm((f: any) => ({ ...f, [k]: v }))
    const ro = !n?.canEdit || n?.status === "CLOSED" || n?.status === "CANCELLED"

    async function save(extra: Record<string, unknown> = {}) {
        setSaving(true)
        try {
            const body = { ...form, d4Whys: form.d4Whys, qtyAffected: form.qtyAffected === "" ? null : form.qtyAffected, ownerUserId: form.ownerUserId || null, ...extra }
            const d = await api<{ ncr: any }>(`/api/quality/ncr/${params.id}`, { method: "PATCH", body })
            apply(d.ncr); setNote("")
            toast.success(extra.status ? "Status updated" : extra.note ? "Comment added" : "Saved")
        } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
    }
    async function comment() {
        if (!note.trim()) return
        setSaving(true)
        try { apply((await api<{ ncr: any }>(`/api/quality/ncr/${params.id}`, { method: "PATCH", body: { note } })).ncr); setNote(""); toast.success("Comment added") }
        catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
    }
    async function download() {
        setPdfBusy(true)
        try {
            const [{ pdf }, { NcrPDF }, React] = await Promise.all([import("@react-pdf/renderer"), import("@/components/quality/NcrPDF"), import("react")])
            const blob = await pdf(React.createElement(NcrPDF, { ncr: n, company: COMPANY.legalName || COMPANY.name }) as any).toBlob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a"); a.href = url; a.download = `${n.code}_8D.pdf`; document.body.appendChild(a); a.click(); a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 10_000)
        } catch (e) { console.error(e); toast.error("Could not build the PDF") } finally { setPdfBusy(false) }
    }

    if (error) return <div className="p-6 text-[13px] text-[#dc2626]">{error}</div>
    if (!n) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div>

    const stepIdx = STEPS.findIndex(x => x.s === n.status)
    const late = n.dueDate && !["CLOSED", "CANCELLED"].includes(n.status) && new Date(n.dueDate).getTime() < Date.now()
    // A plain element (not a component defined here), so typing never remounts the box and loses focus.
    const areaEl = (k: string, rows = 3, ph?: string) =>
        <textarea rows={rows} className={area} disabled={ro} value={form[k] ?? ""} placeholder={ph} onChange={e => set(k, e.target.value)} />

    return (
        <div className="max-w-[980px] mx-auto space-y-4 pb-12">
            <Link href="/quality?tab=ncr" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> NCR / 8D</Link>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-mono text-[12.5px] text-[var(--text3)]">{n.code} {n.source !== "MANUAL" ? "· opened automatically" : ""}</p>
                    <h1 className="text-[22px] font-bold tracking-[-0.4px] text-[var(--text)]">{n.title}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--text2)]">
                        <NcrStatusPill s={n.status} />
                        {n.project && <span>{n.project.name}{n.project.site ? ` · ${n.project.site.name}` : ""}</span>}
                        {n.inspection && <Link href={`/approvals/${n.inspection.id}`} className="text-[var(--accent)] underline">Inspection report</Link>}
                        {late && <span className="font-semibold text-[#dc2626]">Overdue</span>}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button className={`${btn} border border-[var(--border)] bg-white text-[var(--text2)]`} onClick={download} disabled={pdfBusy}>{pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download 8D</button>
                    {!ro && <button className={`${btn} bg-[var(--accent)] text-white`} onClick={() => save()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>}
                </div>
            </div>

            {/* Status steps */}
            <div className={`${card} p-3 flex flex-wrap items-center gap-1.5`}>
                {STEPS.map((x, i) => (
                    <button key={x.s} disabled={!n.canEdit || saving || x.s === n.status}
                        onClick={() => save({ status: x.s })}
                        className={`h-8 px-3 rounded-full text-[12px] font-medium border ${x.s === n.status ? "bg-[var(--accent)] text-white border-[var(--accent)]" : i < stepIdx ? "bg-[var(--accent-light)] text-[var(--accent)] border-transparent" : "bg-white text-[var(--text2)] border-[var(--border)]"} disabled:cursor-default`}>
                        {i + 1}. {x.label}
                    </button>
                ))}
                {n.canEdit && !["CLOSED", "CANCELLED"].includes(n.status) && (
                    <button className="ml-auto text-[12px] text-[var(--text3)] underline" disabled={saving}
                        onClick={() => { const why = prompt("Why is this NCR being cancelled?"); if (why?.trim()) save({ status: "CANCELLED", note: why }) }}>Cancel NCR</button>
                )}
                {n.canEdit && ["CLOSED", "CANCELLED"].includes(n.status) && <span className="ml-auto text-[12px] text-[var(--text3)]">Click a step to reopen.</span>}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
                <div className="space-y-3">
                    {[
                        { n: "D1", t: "Team", body: areaEl("d1Team", 2, "Who is working on this (names / roles)") },
                        { n: "D2", t: "Problem", body: areaEl("d2Problem", 4, "What, where, when, how many") },
                        { n: "D3", t: "Containment", body: <>{areaEl("d3Containment", 3, "Stop the problem reaching the customer: sort, hold, rework…")}<label className="mt-2 inline-flex items-center gap-2 text-[12px] text-[var(--text3)]">Contained on <input type="date" className={input} disabled={ro} value={form.d3Date} onChange={e => set("d3Date", e.target.value)} /></label></> },
                        { n: "D4", t: "Root cause (5 Whys)", body: <>
                            <div className="space-y-1.5 mb-2">
                                {form.d4Whys.map((w: string, i: number) => (
                                    <label key={i} className="flex items-center gap-2 text-[12px] text-[var(--text3)]"><span className="w-12 shrink-0">Why {i + 1}</span>
                                        <input className={`${input} flex-1`} disabled={ro} value={w} onChange={e => set("d4Whys", form.d4Whys.map((x: string, j: number) => j === i ? e.target.value : x))} /></label>
                                ))}
                            </div>
                            {areaEl("d4RootCause", 2, "The root cause, in one or two sentences")}
                        </> },
                        { n: "D5", t: "Permanent corrective action", body: areaEl("d5Action", 3, "What will remove the root cause") },
                        { n: "D6", t: "Implementation", body: <>{areaEl("d6Implemented", 3, "What was done, by whom")}<label className="mt-2 inline-flex items-center gap-2 text-[12px] text-[var(--text3)]">Implemented on <input type="date" className={input} disabled={ro} value={form.d6Date} onChange={e => set("d6Date", e.target.value)} /></label></> },
                        { n: "D7", t: "Prevent recurrence and verify", body: <>
                            {areaEl("d7Prevention", 3, "Process / control plan / training changes, and how effectiveness was checked")}
                            <div className="mt-2 flex flex-wrap gap-3 text-[12.5px]">
                                <label className="inline-flex items-center gap-1.5"><input type="radio" disabled={ro} checked={form.effective === true} onChange={() => set("effective", true)} className="accent-[var(--accent)]" /> Effective — problem hasn&apos;t come back</label>
                                <label className="inline-flex items-center gap-1.5"><input type="radio" disabled={ro} checked={form.effective === false} onChange={() => set("effective", false)} className="accent-[var(--accent)]" /> Not effective yet</label>
                            </div>
                        </> },
                        { n: "D8", t: "Closure", body: areaEl("d8Closure", 2, "Summary and team recognition") },
                    ].map(x => (
                        <div key={x.n} className={`${card} p-4`}>
                            <p className="text-[13.5px] font-semibold text-[var(--text)] mb-2"><span className="font-mono text-[var(--accent)] mr-1.5">{x.n}</span>{x.t}</p>
                            {x.body}
                        </div>
                    ))}
                </div>

                <div className="space-y-3">
                    <div className={`${card} p-4 space-y-2.5`}>
                        <label className="block text-[12px] text-[var(--text3)]">Title<input className={`${input} w-full mt-1`} disabled={ro} value={form.title} onChange={e => set("title", e.target.value)} /></label>
                        <label className="block text-[12px] text-[var(--text3)]">Severity
                            <select className={`${input} w-full mt-1`} disabled={ro} value={form.severity} onChange={e => set("severity", e.target.value)}>
                                <option value="CRITICAL">Critical</option><option value="MAJOR">Major</option><option value="MINOR">Minor</option>
                            </select>
                        </label>
                        <label className="block text-[12px] text-[var(--text3)]">Owner
                            <select className={`${input} w-full mt-1`} disabled={ro} value={form.ownerUserId} onChange={e => set("ownerUserId", e.target.value)}>
                                <option value="">— Nobody —</option>
                                {owners.map(o => <option key={o.id} value={o.id}>{o.name ?? o.id}</option>)}
                                {n.ownerUserId && !owners.some(o => o.id === n.ownerUserId) && <option value={n.ownerUserId}>{n.ownerName ?? "Current owner"}</option>}
                            </select>
                        </label>
                        <label className="block text-[12px] text-[var(--text3)]">Due<input type="date" className={`${input} w-full mt-1`} disabled={ro} value={form.dueDate} onChange={e => set("dueDate", e.target.value)} /></label>
                        <label className="block text-[12px] text-[var(--text3)]">Pieces affected<input type="number" min={0} className={`${input} w-full mt-1`} disabled={ro} value={form.qtyAffected} onChange={e => set("qtyAffected", e.target.value)} /></label>
                        <div className="text-[12px] text-[var(--text2)] space-y-0.5 pt-1">
                            {n.partName && <p>Part: <b>{n.partName}</b></p>}
                            {n.lotNumber && <p>Lot: <b>{n.lotNumber}</b></p>}
                            {n.qtyInspected != null && <p>Inspected: <b>{n.qtyInspected.toLocaleString("en-IN")}</b></p>}
                            {n.defect && <p>Defect: <b>{n.defect.code} {n.defect.name}</b></p>}
                            <p className="text-[var(--text3)]">Opened {new Date(n.createdAt).toLocaleDateString("en-GB")} by {n.createdByName ?? "—"}</p>
                            {n.closedAt && <p className="text-[var(--text3)]">{n.status === "CANCELLED" ? "Cancelled" : "Closed"} {new Date(n.closedAt).toLocaleDateString("en-GB")} by {n.closedByName ?? "—"}</p>}
                        </div>
                    </div>
                    <div className={`${card} p-4`}>
                        <p className="text-[13px] font-semibold text-[var(--text)] mb-2">Activity</p>
                        <div className="space-y-2 max-h-[360px] overflow-y-auto">
                            {n.events.map((e: any) => (
                                <div key={e.id} className="text-[12px]">
                                    <p className="text-[var(--text2)]"><b>{e.userName ?? "—"}</b> · {e.action === "CREATED" ? "opened" : e.action === "STATUS" ? "changed status" : e.action === "COMMENT" ? "commented" : "updated"} <span className="text-[var(--text3)]">{new Date(e.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></p>
                                    {e.note && <p className="text-[var(--text3)] whitespace-pre-wrap">{e.note}</p>}
                                </div>
                            ))}
                        </div>
                        {n.canEdit && (
                            <div className="mt-3 flex gap-1.5">
                                <input className={`${input} flex-1`} placeholder="Add a comment" value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === "Enter") comment() }} />
                                <button className={`${btn} border border-[var(--border)] bg-white text-[var(--text2)]`} disabled={saving || !note.trim()} onClick={comment}>Add</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
