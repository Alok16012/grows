"use client"

// Payroll → Salary slips → Payslips to employees.
//   • Send all ready sites, one site, or chosen sites
//   • Open a site (or search) to send / take back chosen employees
//   • ⚙ how sending works (manual / automatic on lock / on paid) — same as Payroll → Settings
// A payslip shows in the employee's My Profile (and the app) once it reaches them.
// In-app only — never WhatsApp.
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ChevronDown, ChevronRight, Loader2, Search, Send, Settings2, Undo2 } from "lucide-react"
import { PayslipSendSettings } from "@/components/payroll/PayslipSendSettings"

type Mode = "manual" | "onLock" | "onPaid"
type Row = { siteId: string; site: string; ready: number; draft: number; paid: number; empSent: number; sent: { at: string; byName: string; count: number } | null }
type Data = { warnings?: string[]; mode: Mode; notify: boolean; startFrom: string | null; modes: Record<Mode, string>; alwaysVisible: boolean; canSend: boolean; sites: Row[] }
type Emp = { employeeId: string; code: string; name: string; designation: string | null; site: string; siteId: string; status: string; net: number; hasLogin: boolean; visible: boolean; sentBy: "employee" | "site" | "auto" | null; sentAt: string | null }
const when = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`

export function SendPayslipsPanel({ month, year, focusSiteId }: { month: number; year: number; focusSiteId?: string }) {
    const [d, setD] = useState<Data | null>(null)
    const [sel, setSel] = useState<Set<string>>(new Set())
    const [busy, setBusy] = useState(false)
    const [open, setOpen] = useState(false)
    const [cfg, setCfg] = useState(false)
    const [site, setSite] = useState<string | null>(null)   // site whose employees are shown
    const [q, setQ] = useState("")
    const [emps, setEmps] = useState<Emp[] | null>(null)
    const [eSel, setESel] = useState<Set<string>>(new Set())
    const label = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" })

    const load = useCallback(() => { fetch(`/api/payroll/payslips/send?month=${month}&year=${year}`).then(r => r.ok ? r.json() : null).then(setD).catch(() => {}) }, [month, year])
    const loadEmps = useCallback((siteId: string | null, query: string) => {
        if (!siteId && !query.trim()) { setEmps(null); return }
        setEmps(null)
        const qs = new URLSearchParams({ month: String(month), year: String(year), employees: "1", ...(siteId ? { siteId } : {}), ...(query.trim() ? { q: query.trim() } : {}) })
        fetch(`/api/payroll/payslips/send?${qs}`).then(r => r.ok ? r.json() : { employees: [] }).then(j => setEmps(j.employees ?? [])).catch(() => setEmps([]))
    }, [month, year])
    useEffect(() => { load(); setSel(new Set()); setSite(null); setEmps(null); setESel(new Set()) }, [load])
    useEffect(() => { const t = setTimeout(() => { if (q.trim()) { setSite(null); loadEmps(null, q) } else if (!site) setEmps(null) }, 350); return () => clearTimeout(t) }, [q, loadEmps, site])
    if (!d) return null
    // No payslips for this month yet: still show the bar, so the sending settings are always reachable.
    if (!d.sites.length) return (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 12, fontSize: 12.5 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Send size={14} style={{ color: "var(--accent)" }} /><b>Payslips to employees</b>
                    <span style={{ padding: "2px 8px", borderRadius: 99, background: "var(--accent-light)", color: "var(--accent)", fontSize: 11, fontWeight: 600 }}>{d.mode === "manual" ? "Manual" : d.mode === "onLock" ? "Automatic on lock" : "Automatic on paid"}</span>
                    <span style={{ color: "var(--text3)" }}>No payslips for {label} yet — process payroll first.</span>
                </div>
                {d.canSend && <button onClick={() => setCfg(c => !c)} style={btnG} aria-label="How sending works"><Settings2 size={12} /> Settings</button>}
            </div>
            {cfg && d.canSend && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}><PayslipSendSettings compact onChanged={load} /></div>}
        </div>
    )
    const manualish = d.mode !== "onLock" && !d.alwaysVisible
    const notSent = d.sites.filter(s => s.ready > 0 && !s.sent)
    const sentCount = d.sites.filter(s => s.sent).length

    async function call(body: any, ok: string) {
        setBusy(true)
        try {
            const r = await fetch("/api/payroll/payslips/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not send")
            toast.success(ok.replace("{n}", String(j.employees ?? "")) + (j.skippedDraft ? ` · ${j.skippedDraft} still draft, not sent` : ""))
            setSel(new Set()); setESel(new Set()); load(); if (site || q.trim()) loadEmps(site, q)
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const warnText = d.warnings?.length ? "\n\nCheck first:\n• " + d.warnings.join("\n• ") : ""
    function sendSites(ids: string[]) {
        const rows = d!.sites.filter(s => ids.includes(s.siteId))
        const drafts = rows.reduce((a, s) => a + s.draft, 0)
        if (!confirm(`Send ${label} payslips to all employees of ${rows.length} site(s)?${warnText}\n\nThey appear in each employee's My Profile → Payslips and in the app${d!.notify ? ", with an in-app note" : ""}.${drafts ? `\n\n${drafts} payslip(s) at these sites are still drafts and are not sent until locked.` : ""}`)) return
        call({ action: "send", month, year, siteIds: ids }, "Payslips sent to {n} employee(s)")
    }
    function sendEmployees(ids: string[]) {
        if (!confirm(`Send ${label} payslips to ${ids.length} chosen employee(s)?${warnText}`)) return
        call({ action: "sendEmployees", month, year, employeeIds: ids }, "Payslips sent to {n} employee(s)")
    }
    const openSite = (id: string) => { if (site === id) { setSite(null); setEmps(null) } else { setQ(""); setSite(id); setESel(new Set()); loadEmps(id, "") } }
    const sendable = (emps ?? []).filter(e => e.status !== "DRAFT" && !e.visible)
    const pickedEmps = (emps ?? []).filter(e => eSel.has(e.employeeId))

    return (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 12, fontSize: 12.5 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Send size={14} style={{ color: "var(--accent)" }} />
                    <b>Payslips to employees</b>
                    <span style={{ padding: "2px 8px", borderRadius: 99, background: "var(--accent-light)", color: "var(--accent)", fontSize: 11, fontWeight: 600 }}>{d.mode === "manual" ? "Manual" : d.mode === "onLock" ? "Automatic on lock" : "Automatic on paid"}</span>
                    {d.alwaysVisible
                        ? <span style={{ color: "var(--text3)" }}>{d.mode === "onLock" ? "Employees see payslips as soon as payroll is locked." : `Months before ${d.startFrom} are already visible to employees.`}</span>
                        : <span style={{ color: notSent.length ? "#b45309" : "#15803d" }}>{sentCount} of {d.sites.length} site(s) sent{notSent.length ? ` · ${notSent.length} ready, not sent` : ""}{d.mode === "onPaid" ? " · paid ones reach employees automatically" : ""}</span>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {d.canSend && manualish && notSent.length > 0 && <button disabled={busy} onClick={() => sendSites(notSent.map(s => s.siteId))} style={btnP}>{busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send all ready sites ({notSent.length})</button>}
                    <button onClick={() => setOpen(o => !o)} style={btnG}>{open ? "Hide" : "By site / employee"}</button>
                    {d.canSend && <button onClick={() => setCfg(c => !c)} style={btnG} aria-label="How sending works"><Settings2 size={12} /> Settings</button>}
                </div>
            </div>
            {d.warnings && d.warnings.length > 0 && manualish && (
                <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 12 }}>⚠ {d.warnings.join(" · ")}</div>
            )}
            {cfg && d.canSend && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}><PayslipSendSettings compact onChanged={load} /></div>}
            {open && (
                <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                    {manualish && (
                        <div style={{ position: "relative", maxWidth: 320, marginBottom: 8 }}>
                            <Search size={13} style={{ position: "absolute", left: 9, top: 9, color: "var(--text3)" }} />
                            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find an employee by name or code" style={{ width: "100%", height: 32, border: "1px solid var(--border)", borderRadius: 8, padding: "0 10px 0 28px", fontSize: 12.5 }} />
                        </div>
                    )}
                    {q.trim() ? <EmpTable /> : (
                        <div style={{ maxHeight: 420, overflowY: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr style={{ textAlign: "left", color: "var(--text3)", fontSize: 11 }}><th style={th}></th><th style={th}>Site</th><th style={th}>Ready</th><th style={th}>Draft</th><th style={th}>Paid</th><th style={th}>Sent</th><th style={th}></th></tr></thead>
                                <tbody>{d.sites.map(s => (
                                    <SiteRows key={s.siteId} s={s} />
                                ))}</tbody>
                            </table>
                            {d.canSend && sel.size > 0 && <div style={{ padding: "8px 0" }}><button disabled={busy} onClick={() => sendSites(Array.from(sel))} style={btnP}>Send selected sites ({sel.size})</button></div>}
                        </div>
                    )}
                </div>
            )}
        </div>
    )

    function SiteRows({ s }: { s: Row }) {
        const isOpen = site === s.siteId
        return (
            <>
                <tr style={{ background: focusSiteId && s.siteId === focusSiteId ? "var(--accent-light)" : undefined }}>
                    <td style={td}>{d!.canSend && manualish && s.ready > 0 && !s.sent && <input type="checkbox" aria-label={`Select ${s.site}`} checked={sel.has(s.siteId)} onChange={e => setSel(x => { const n = new Set(x); if (e.target.checked) n.add(s.siteId); else n.delete(s.siteId); return n })} />}</td>
                    <td style={td}><button onClick={() => openSite(s.siteId)} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "none", padding: 0, cursor: "pointer", color: "var(--text)", fontWeight: 600, fontSize: 12.5 }}>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{s.site}</button></td>
                    <td style={td}>{s.ready}</td>
                    <td style={{ ...td, color: s.draft ? "#b45309" : "var(--text3)" }}>{s.draft}</td>
                    <td style={{ ...td, color: "var(--text3)" }}>{s.paid}</td>
                    <td style={td}>{d!.alwaysVisible ? "—" : s.sent ? <span style={{ color: "#15803d" }}>Whole site · {when(s.sent.at)} · {s.sent.byName}</span> : s.empSent ? <span style={{ color: "var(--accent)" }}>{s.empSent} employee(s)</span> : <span style={{ color: "var(--text3)" }}>not sent</span>}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        {d!.canSend && manualish && (s.sent
                            ? <button disabled={busy} onClick={() => confirm(`Take back ${label} payslips for ${s.site}? Employees there no longer see them (except ones sent one by one or already paid in "on paid" mode).`) && call({ action: "unsend", month, year, siteIds: [s.siteId] }, "Taken back")} style={btnG}><Undo2 size={12} /> Take back</button>
                            : s.ready > 0 && <button disabled={busy} onClick={() => sendSites([s.siteId])} style={btnG}><Send size={12} /> Send site</button>)}
                    </td>
                </tr>
                {isOpen && <tr><td colSpan={7} style={{ padding: "4px 0 10px 24px", borderBottom: "1px solid var(--border)" }}><EmpTable /></td></tr>}
            </>
        )
    }

    function EmpTable() {
        if (!emps) return <div style={{ padding: 10 }}><Loader2 size={14} className="animate-spin" /></div>
        if (!emps.length) return <p style={{ padding: 8, color: "var(--text3)" }}>No payslips found.</p>
        const allPick = sendable.length > 0 && sendable.every(e => eSel.has(e.employeeId))
        return (
            <div>
                <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr style={{ textAlign: "left", color: "var(--text3)", fontSize: 11, position: "sticky", top: 0, background: "var(--surface2)" }}>
                            <th style={th}>{d!.canSend && manualish && sendable.length > 0 && <input type="checkbox" aria-label="Select all not sent" checked={allPick} onChange={e => setESel(e.target.checked ? new Set(sendable.map(x => x.employeeId)) : new Set())} />}</th>
                            <th style={th}>Employee</th>{q.trim() && <th style={th}>Site</th>}<th style={th}>Status</th><th style={th}>Net</th><th style={th}>Employee sees it</th><th style={th}></th>
                        </tr></thead>
                        <tbody>{emps.map(e => (
                            <tr key={e.employeeId}>
                                <td style={td}>{d!.canSend && manualish && e.status !== "DRAFT" && !e.visible && <input type="checkbox" aria-label={`Select ${e.name}`} checked={eSel.has(e.employeeId)} onChange={x => setESel(s => { const n = new Set(s); if (x.target.checked) n.add(e.employeeId); else n.delete(e.employeeId); return n })} />}</td>
                                <td style={td}><b style={{ fontWeight: 600 }}>{e.name}</b><span style={{ color: "var(--text3)" }}> · {e.code}</span>{!e.hasLogin && <span style={{ color: "#b45309" }} title="No login — they can't open the app yet"> · no login</span>}</td>
                                {q.trim() && <td style={td}>{e.site}</td>}
                                <td style={{ ...td, color: e.status === "DRAFT" ? "#b45309" : "var(--text2)" }}>{e.status === "DRAFT" ? "Draft" : e.status === "PAID" ? "Paid" : "Locked"}</td>
                                <td style={td}>{inr(e.net)}</td>
                                <td style={td}>{e.visible ? <span style={{ color: "#15803d" }}>Yes{e.sentBy === "employee" ? " · sent one by one" : e.sentBy === "site" ? " · with site" : " · automatic"}{e.sentAt ? ` · ${when(e.sentAt)}` : ""}</span> : <span style={{ color: "var(--text3)" }}>{e.status === "DRAFT" ? "Not yet (draft)" : "Not sent"}</span>}</td>
                                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                                    {d!.canSend && manualish && e.status !== "DRAFT" && (!e.visible
                                        ? <button disabled={busy} onClick={() => sendEmployees([e.employeeId])} style={btnG}><Send size={12} /> Send</button>
                                        : e.sentBy === "employee" && <button disabled={busy} onClick={() => call({ action: "unsendEmployees", month, year, employeeIds: [e.employeeId] }, "Taken back")} style={btnG}><Undo2 size={12} /> Take back</button>)}
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
                {d!.canSend && pickedEmps.length > 0 && <div style={{ paddingTop: 8 }}><button disabled={busy} onClick={() => sendEmployees(pickedEmps.map(e => e.employeeId))} style={btnP}><Send size={12} /> Send to selected employees ({pickedEmps.length})</button></div>}
            </div>
        )
    }
}

const th: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--border)", fontWeight: 600 }
const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--border)" }
const btnP: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }
const btnG: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }
