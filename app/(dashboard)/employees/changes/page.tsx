"use client"

// People → Changes & approvals — the one approvals queue for employee data.
//   Approvals — what employees changed or uploaded themselves (My Profile), and
//               sensitive changes made by HR (bank, PAN, Aadhaar, UAN, name …)
//               waiting for a second person; approve or reject with a reason.
//   Movements — transfers, promotions, designation / department / manager
//               changes with an effective date (applied on that date).
//   Settings  — which fields need approval, and for whom.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Plus, X } from "lucide-react"
import { APPROVABLE_FIELDS } from "@/lib/employee-change-fields"
import { ProfileApprovals } from "@/components/onboarding/ProfileApprovals"

type Change = { field: string; label: string; from: string | null; to: string | null }
type Req = { id: string; requestNo: string; employeeId: string; employee: string; employeeCode: string; requestedBy: string; requestedByName: string; source: string; changes: Change[]; reason: string | null; status: string; decidedByName: string | null; decidedAt: string | null; decisionNote: string | null; createdAt: string }
type Mv = { id: string; employeeId: string; employee: string; employeeCode: string; type: string; effectiveDate: string; status: string; note: string | null; to: any; from: any; createdByName: string | null; appliedAt: string | null }

const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)] whitespace-nowrap"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px] align-top"
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const day = (s: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"
const TYPE_LABEL: Record<string, string> = { TRANSFER: "Transfer", PROMOTION: "Promotion", REDESIGNATION: "New designation", DEPARTMENT: "Department change", MANAGER: "New manager" }

export default function ChangesPage() {
    const [tab, setTab] = useState<"pending" | "all" | "movements" | "settings">("pending")
    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
            <div>
                <Link href="/employees" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Employees</Link>
                <h1 className="text-[22px] font-bold text-[var(--text)] mt-1">Changes &amp; approvals</h1>
                <p className="text-[12.5px] text-[var(--text3)]">One queue for every employee data change — what employees updated or uploaded themselves and sensitive changes made by HR — plus transfers, promotions and other moves with an effective date.</p>
            </div>
            <div className="flex gap-1 border-b border-[var(--border)] overflow-x-auto">
                {([["pending", "Waiting for approval"], ["all", "All requests"], ["movements", "Movements"], ["settings", "Approval settings"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>
            {(tab === "pending" || tab === "all") && (
                <div className="space-y-6">
                    <ProfileApprovalsSection />
                    <section className="space-y-2">
                        <h2 className="text-[15px] font-semibold text-[var(--text)]">Changes made by HR</h2>
                        <p className="text-[12px] text-[var(--text3)] -mt-1">Sensitive fields changed by someone in HR, waiting for a second person.</p>
                        <Requests status={tab === "pending" ? "PENDING" : "ALL"} />
                    </section>
                </div>
            )}
            {tab === "movements" && <Movements />}
            {tab === "settings" && <ApprovalSettings />}
        </div>
    )
}

function Requests({ status }: { status: string }) {
    const [d, setD] = useState<{ requests: Req[]; me: string; canDecide: boolean } | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    // Employees' own updates are in the section above (ProfileApprovals); here only changes made by HR.
    const load = useCallback(() => { setD(null); fetch(`/api/employees/changes?status=${status}&source=HR`).then(r => r.ok ? r.json() : { requests: [], me: "", canDecide: false }).then(setD).catch(() => toast.error("Couldn't load")) }, [status])
    useEffect(() => { load() }, [load])
    async function act(r: Req, action: string) {
        let note: string | null = null
        if (action === "REJECT") { note = prompt(`Why reject ${r.requestNo}?`); if (!note) return }
        if (action === "APPROVE" && !confirm(`Approve ${r.requestNo} for ${r.employee}? ${r.changes.map(c => c.label).join(", ")} will be changed.`)) return
        setBusy(r.id)
        try {
            const res = await fetch(`/api/employees/changes/${r.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }) })
            const j = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(j?.error || "Could not save")
            toast.success(action === "APPROVE" ? "Approved and applied" : action === "REJECT" ? "Rejected" : "Withdrawn"); load()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
    }
    if (!d) return <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div>
    if (!d.requests.length) return <p className="text-[13px] text-[var(--text3)] bg-white border border-[var(--border)] rounded-[12px] p-6 text-center">{status === "PENDING" ? "Nothing waiting for approval." : "No change requests yet."}</p>
    return (
        <div className="space-y-3">
            {d.requests.map(r => (
                <div key={r.id} className="bg-white border border-[var(--border)] rounded-[12px] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div>
                            <Link href={`/employees/profile/${r.employeeId}`} className="text-[14px] font-semibold text-[var(--text)] hover:text-[var(--accent)]">{r.employee}</Link>
                            <span className="ml-2 text-[11.5px] font-mono text-[var(--text3)]">{r.employeeCode} · {r.requestNo}</span>
                            <p className="text-[11.5px] text-[var(--text3)]">{r.source === "SELF" ? "Asked by the employee" : `Changed by ${r.requestedByName}`} · {day(r.createdAt)}{r.reason ? ` · “${r.reason}”` : ""}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.status === "PENDING" ? "bg-amber-50 text-amber-700" : r.status === "APPROVED" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{r.status.toLowerCase()}</span>
                    </div>
                    <table className="w-full mb-2">
                        <thead><tr><th className={th}>Field</th><th className={th}>Now</th><th className={th}>Change to</th></tr></thead>
                        <tbody>{r.changes.map(c => <tr key={c.field}><td className={td}><b>{c.label}</b></td><td className={`${td} text-[var(--text3)] line-through decoration-[var(--text3)]/50`}>{c.from ?? "—"}</td><td className={`${td} font-semibold text-[var(--text)]`}>{c.to ?? "— (clear)"}</td></tr>)}</tbody>
                    </table>
                    {r.status !== "PENDING" && <p className="text-[11.5px] text-[var(--text3)]">{r.status === "CANCELLED" ? "Withdrawn" : `${r.status === "APPROVED" ? "Approved" : "Rejected"} by ${r.decidedByName ?? "—"}`} · {day(r.decidedAt)}{r.decisionNote ? ` · “${r.decisionNote}”` : ""}</p>}
                    {r.status === "PENDING" && (
                        <div className="flex flex-wrap gap-2 justify-end">
                            {r.requestedBy === d.me && <button className="h-8 px-3 rounded-[8px] border border-[var(--border)] text-[12.5px]" disabled={busy === r.id} onClick={() => act(r, "CANCEL")}>Withdraw</button>}
                            {d.canDecide && <button className="h-8 px-3 rounded-[8px] border border-red-200 text-red-600 text-[12.5px] font-semibold" disabled={busy === r.id} onClick={() => act(r, "REJECT")}>Reject</button>}
                            {d.canDecide && <button className="h-8 px-3 rounded-[8px] bg-[var(--accent)] text-white text-[12.5px] font-semibold" disabled={busy === r.id} onClick={() => act(r, "APPROVE")}>Approve &amp; apply</button>}
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

function Movements() {
    const [d, setD] = useState<{ movements: Mv[]; canEdit: boolean } | null>(null)
    const [open, setOpen] = useState(false)
    const load = useCallback(() => { fetch("/api/employees/movements").then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [])
    useEffect(() => { load() }, [load])
    async function act(m: Mv, action: string) {
        if (!confirm(action === "cancel" ? "Cancel this scheduled change?" : "Apply it now instead of on its date?")) return
        const r = await fetch(`/api/employees/movements/${m.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
        if (!r.ok) toast.error((await r.json().catch(() => ({})))?.error || "Could not save"); else { toast.success("Done"); load() }
    }
    const show = (v: any) => v ? [v.site !== undefined && `Site: ${v.site ?? "—"}`, v.designation !== undefined && `Designation: ${v.designation}`, v.department !== undefined && `Department: ${v.department ?? "—"}`, v.manager !== undefined && `Manager: ${v.manager ?? "—"}`].filter(Boolean).join(" · ") : ""
    if (!d) return <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div>
    return (
        <div className="space-y-3">
            {d.canEdit && <div className="flex justify-end"><button className={btn} onClick={() => setOpen(true)}><Plus size={14} /> New movement</button></div>}
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full min-w-[820px]">
                    <thead><tr><th className={th}>Employee</th><th className={th}>Change</th><th className={th}>From</th><th className={th}>Effective</th><th className={th}>Status</th><th className={th}></th></tr></thead>
                    <tbody>
                        {!d.movements.length && <tr><td className={`${td} text-center text-[var(--text3)] py-8`} colSpan={6}>No movements yet.</td></tr>}
                        {d.movements.map(m => (
                            <tr key={m.id}>
                                <td className={td}><Link href={`/employees/profile/${m.employeeId}`} className="font-semibold hover:text-[var(--accent)]">{m.employee}</Link><span className="block text-[11px] text-[var(--text3)]">{m.employeeCode}</span></td>
                                <td className={td}><b>{TYPE_LABEL[m.type] ?? m.type}</b><span className="block text-[11.5px] text-[var(--text2)]">{show(m.to)}</span>{m.note && <span className="block text-[11px] text-[var(--text3)]">{m.note}</span>}</td>
                                <td className={`${td} text-[11.5px] text-[var(--text3)]`}>{show(m.from)}</td>
                                <td className={td}>{day(m.effectiveDate)}</td>
                                <td className={td}><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.status === "SCHEDULED" ? "bg-[var(--accent-light)] text-[var(--accent-text)]" : m.status === "APPLIED" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{m.status.toLowerCase()}</span></td>
                                <td className={`${td} text-right whitespace-nowrap`}>{d.canEdit && m.status === "SCHEDULED" && (<><button className="text-[12px] font-semibold text-[var(--accent)] mr-2" onClick={() => act(m, "applyNow")}>Apply now</button><button className="text-[12px] font-semibold text-red-600" onClick={() => act(m, "cancel")}>Cancel</button></>)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {open && <NewMovement onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load() }} />}
        </div>
    )
}

function NewMovement({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [type, setType] = useState("TRANSFER")
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
    const [q, setQ] = useState("")
    const [emps, setEmps] = useState<{ id: string; code: string; name: string; designation: string | null; site: string | null }[]>([])
    const [picked, setPicked] = useState<Map<string, string>>(new Map())
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [depts, setDepts] = useState<{ id: string; name: string }[]>([])
    const [managers, setManagers] = useState<{ id: string; name: string; role: string }[]>([])
    const [masterDes, setMasterDes] = useState<string[]>([])
    const [to, setTo] = useState<{ siteId?: string; designation?: string; departmentId?: string; managerId?: string }>({})
    const [note, setNote] = useState("")
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        fetch("/api/sites?isActive=true").then(r => r.ok ? r.json() : []).then(d => { const l = Array.isArray(d) ? d : d?.sites ?? []; setSites(l.map((s: any) => ({ id: s.id, name: s.name })).sort((a: any, b: any) => a.name.localeCompare(b.name))) }).catch(() => {})
        fetch("/api/employees/masters").then(r => r.json()).then(d => { setDepts((d.departments ?? []).filter((x: any) => x.isActive)); setMasterDes((d.master ?? []).map((m: any) => m.name)) }).catch(() => {})
        fetch("/api/employees/manager-options").then(r => r.json()).then(d => setManagers(Array.isArray(d) ? d : [])).catch(() => {})
        const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k)
    }, [onClose])
    useEffect(() => {
        if (q.trim().length < 2) { setEmps([]); return }
        const t = setTimeout(() => fetch(`/api/employees?${new URLSearchParams({ search: q, status: "ACTIVE", pageSize: "12", lite: "1" })}`).then(r => r.ok ? r.json() : { employees: [] }).then(d => setEmps((d.employees ?? []).map((e: any) => ({ id: e.id, code: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(), designation: e.designation ?? null, site: e.deployments?.[0]?.site?.name ?? null })))).catch(() => {}), 250)
        return () => clearTimeout(t)
    }, [q])
    const need = useMemo(() => ({ TRANSFER: ["siteId"], PROMOTION: ["designation", "departmentId", "managerId"], REDESIGNATION: ["designation"], DEPARTMENT: ["departmentId"], MANAGER: ["managerId"] } as Record<string, string[]>)[type], [type])
    async function save() {
        setBusy(true)
        try {
            const r = await fetch("/api/employees/movements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, effectiveDate: date, employeeIds: Array.from(picked.keys()), to, note }) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not save")
            toast.success(`${j.created} movement(s) saved${j.applied ? `, ${j.applied} applied now` : ` — they apply on ${date}`}`); onSaved()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const lbl = "block text-[11px] font-semibold uppercase text-[var(--text3)]"
    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label="New movement" className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-[14px] border border-[var(--border)] shadow-xl">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)]"><h3 className="text-[15px] font-semibold">New movement</h3><button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button></div>
                <div className="p-5 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <label className={lbl}>What changes<select value={type} onChange={e => { setType(e.target.value); setTo({}) }} className={`${box} w-full`}>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                        <label className={lbl}>Effective from<input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${box} w-full`} /></label>
                    </div>
                    <div>
                        <label className={lbl}>Employees<input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or code" className={`${box} w-full`} /></label>
                        {emps.length > 0 && <div className="border border-[var(--border)] rounded-[9px] mt-1 max-h-[160px] overflow-y-auto">{emps.map(e => <button key={e.id} onClick={() => setPicked(p => new Map(p).set(e.id, e.name))} className="block w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[var(--surface2)]"><b>{e.name}</b> <span className="text-[var(--text3)]">{e.code} · {e.designation ?? ""} · {e.site ?? ""}</span></button>)}</div>}
                        <div className="flex flex-wrap gap-1 mt-1.5">{Array.from(picked.entries()).map(([id, n]) => <span key={id} className="px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[12px]">{n} <button onClick={() => setPicked(p => { const x = new Map(p); x.delete(id); return x })} aria-label={`Remove ${n}`}>×</button></span>)}</div>
                    </div>
                    {need.includes("siteId") && <label className={lbl}>New site<select value={to.siteId ?? ""} onChange={e => setTo(t => ({ ...t, siteId: e.target.value }))} className={`${box} w-full`}><option value="">Pick…</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
                    {need.includes("designation") && <label className={lbl}>New designation<input list="mv-des" value={to.designation ?? ""} onChange={e => setTo(t => ({ ...t, designation: e.target.value }))} className={`${box} w-full`} /><datalist id="mv-des">{masterDes.map(x => <option key={x} value={x} />)}</datalist></label>}
                    {need.includes("departmentId") && <label className={lbl}>New department{type === "PROMOTION" ? " (optional)" : ""}<select value={to.departmentId ?? ""} onChange={e => setTo(t => ({ ...t, departmentId: e.target.value }))} className={`${box} w-full`}><option value="">{type === "PROMOTION" ? "No change" : "Pick…"}</option>{depts.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
                    {need.includes("managerId") && <label className={lbl}>New reporting manager{type === "PROMOTION" ? " (optional)" : ""}<select value={to.managerId ?? ""} onChange={e => setTo(t => ({ ...t, managerId: e.target.value }))} className={`${box} w-full`}><option value="">{type === "PROMOTION" ? "No change" : "Pick…"}</option>{managers.map(x => <option key={x.id} value={x.id}>{x.name} — {x.role}</option>)}</select></label>}
                    <label className={lbl}>Note<input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Promotion letter dated …" className={`${box} w-full`} /></label>
                    <p className="text-[11.5px] text-[var(--text3)]">Today or earlier: applied now. A later date: applied automatically that day; the old values are kept in the history.</p>
                    <div className="flex justify-end gap-2"><button onClick={onClose} className="h-9 px-4 rounded-[9px] border border-[var(--border)] text-[13px]">Cancel</button><button onClick={save} disabled={busy || !picked.size} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Save</button></div>
                </div>
            </div>
        </div>, document.body)
}

function ApprovalSettings() {
    const [s, setS] = useState<any | null>(null)
    const [busy, setBusy] = useState(false)
    useEffect(() => { fetch("/api/employees/quality").then(r => r.json()).then(d => setS(d.settings)).catch(() => toast.error("Couldn't load")) }, [])
    if (!s) return <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div>
    const ap = s.approval
    const set = (p: any) => setS((x: any) => ({ ...x, approval: { ...x.approval, ...p } }))
    async function save() {
        setBusy(true)
        try { const r = await fetch("/api/employees/quality", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }); if (!r.ok) throw new Error("Could not save"); toast.success("Approval settings saved") }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-5 space-y-3 max-w-3xl">
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={ap.selfService} onChange={e => set({ selfService: e.target.checked })} /> When an <b>employee</b> changes these in My Profile, HR approves first</label>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={ap.hrChanges} onChange={e => set({ hrChanges: e.target.checked })} /> When <b>HR</b> changes these in the employee form, a second person approves</label>
            <label className="flex items-center gap-2 text-[13px] pl-6"><input type="checkbox" disabled={!ap.hrChanges} checked={ap.adminBypass} onChange={e => set({ adminBypass: e.target.checked })} /> Admins change them directly</label>
            <div>
                <p className="text-[12px] font-semibold text-[var(--text2)] mb-1">Fields that need approval</p>
                <div className="grid sm:grid-cols-3 gap-1.5">
                    {APPROVABLE_FIELDS.map(f => (
                        <label key={f.key} className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={ap.fields.includes(f.key)} onChange={e => set({ fields: e.target.checked ? [...ap.fields, f.key] : ap.fields.filter((k: string) => k !== f.key) })} /> {f.label}</label>
                    ))}
                </div>
            </div>
            <div className="flex justify-end"><button onClick={save} disabled={busy} className={btn}>Save</button></div>
        </div>
    )
}

// Employees' own updates and uploads (My Profile → My Details / Documents),
// with the per-field approve and document preview. Hidden for people who can't
// see them (the API refuses).
function ProfileApprovalsSection() {
    const [ok, setOk] = useState<boolean | null>(null)
    useEffect(() => { fetch("/api/onboarding/approvals?count=1").then(r => setOk(r.ok)).catch(() => setOk(false)) }, [])
    if (!ok) return null
    return (
        <section className="space-y-2">
            <h2 className="text-[15px] font-semibold text-[var(--text)]">Updates by employees</h2>
            <p className="text-[12px] text-[var(--text3)] -mt-1">Details and documents employees changed or uploaded themselves, waiting before they go into the record.</p>
            <ProfileApprovals />
        </section>
    )
}
