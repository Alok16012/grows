"use client"

// Payroll → Salary slips → Send to employees, site by site. A payslip shows in
// the employee's My Profile (and the app) only once its site is sent.
// In-app only — never WhatsApp.
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Send, Settings2 } from "lucide-react"

type Row = { siteId: string; site: string; ready: number; draft: number; sent: { at: string; byName: string; count: number } | null }
type Data = { warnings?: string[]; requireSend: boolean; startFrom: string | null; alwaysVisible: boolean; canSend: boolean; sites: Row[] }
const when = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })

export function SendPayslipsPanel({ month, year, focusSiteId }: { month: number; year: number; focusSiteId?: string }) {
    const [d, setD] = useState<Data | null>(null)
    const [sel, setSel] = useState<Set<string>>(new Set())
    const [busy, setBusy] = useState(false)
    const [open, setOpen] = useState(false)
    const [cfg, setCfg] = useState(false)
    const load = useCallback(() => { fetch(`/api/payroll/payslips/send?month=${month}&year=${year}`).then(r => r.ok ? r.json() : null).then(setD).catch(() => {}) }, [month, year])
    useEffect(() => { load(); setSel(new Set()) }, [load])
    if (!d || !d.sites.length) return null
    const notSent = d.sites.filter(s => s.ready > 0 && !s.sent)
    const sentCount = d.sites.filter(s => s.sent).length
    const label = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" })

    async function call(body: any, ok: string) {
        setBusy(true)
        try {
            const r = await fetch("/api/payroll/payslips/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not send")
            toast.success(ok.replace("{n}", String(j.employees ?? ""))); setSel(new Set()); load()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    function send(ids: string[]) {
        const rows = d!.sites.filter(s => ids.includes(s.siteId))
        const drafts = rows.reduce((a, s) => a + s.draft, 0)
        const warn = d!.warnings?.length ? "\n\nCheck first:\n• " + d!.warnings.join("\n• ") : ""
        if (!confirm(`Send ${label} payslips to employees of ${rows.length} site(s)?${warn}\n\nThey appear in each employee's My Profile → Payslip and in the app, with an in-app note.${drafts ? `\n\n${drafts} payslip(s) at these sites are still drafts and will not be sent until processed.` : ""}`)) return
        call({ action: "send", month, year, siteIds: ids }, "Payslips sent to {n} employee(s)")
    }
    function unsend(id: string, site: string) {
        if (!confirm(`Take back ${label} payslips for ${site}? Employees there will no longer see them until you send again.`)) return
        call({ action: "unsend", month, year, siteIds: [id] }, "Taken back")
    }

    return (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, fontSize: 12.5 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Send size={14} style={{ color: "var(--accent)" }} />
                    <b>Send to employees</b>
                    {d.alwaysVisible
                        ? <span style={{ color: "var(--text3)" }}>{d.requireSend ? `Months before ${d.startFrom} are already visible to employees.` : "Sending is switched off — employees see payslips as soon as they are processed."}</span>
                        : <span style={{ color: notSent.length ? "#b45309" : "#15803d" }}>{sentCount} of {d.sites.length} site(s) sent{notSent.length ? ` · ${notSent.length} ready, not sent` : ""}</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                    {d.canSend && !d.alwaysVisible && notSent.length > 0 && <button disabled={busy} onClick={() => send(notSent.map(s => s.siteId))} style={btnP}>{busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send all ready ({notSent.length})</button>}
                    <button onClick={() => setOpen(o => !o)} style={btnG}>{open ? "Hide sites" : "By site"}</button>
                    {d.canSend && <button onClick={() => setCfg(c => !c)} style={btnG} aria-label="Sending settings"><Settings2 size={12} /></button>}
                </div>
            </div>
            {d.warnings && d.warnings.length > 0 && !d.alwaysVisible && (
                <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 12 }}>⚠ {d.warnings.join(" · ")}</div>
            )}
            {cfg && d.canSend && (
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={d.requireSend} onChange={e => call({ action: "settings", requireSend: e.target.checked }, "Saved")} /> Employees see a payslip only after it is sent</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>Needed from<input type="month" defaultValue={d.startFrom ?? ""} onBlur={e => e.target.value && e.target.value !== d.startFrom && call({ action: "settings", startFrom: e.target.value }, "Saved")} style={{ height: 28, border: "1px solid var(--border)", borderRadius: 6, padding: "0 6px" }} /> <span style={{ color: "var(--text3)" }}>(earlier months stay visible)</span></label>
                </div>
            )}
            {open && (
                <div style={{ marginTop: 10, maxHeight: 280, overflowY: "auto", borderTop: "1px solid var(--border)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr style={{ textAlign: "left", color: "var(--text3)", fontSize: 11 }}><th style={th}></th><th style={th}>Site</th><th style={th}>Ready</th><th style={th}>Draft</th><th style={th}>Sent</th><th style={th}></th></tr></thead>
                        <tbody>{d.sites.map(s => (
                            <tr key={s.siteId} style={{ background: focusSiteId && s.siteId === focusSiteId ? "var(--accent-light)" : undefined }}>
                                <td style={td}>{d.canSend && !d.alwaysVisible && s.ready > 0 && !s.sent && <input type="checkbox" aria-label={`Select ${s.site}`} checked={sel.has(s.siteId)} onChange={e => setSel(x => { const n = new Set(x); if (e.target.checked) n.add(s.siteId); else n.delete(s.siteId); return n })} />}</td>
                                <td style={td}>{s.site}</td>
                                <td style={td}>{s.ready}</td>
                                <td style={{ ...td, color: s.draft ? "#b45309" : "var(--text3)" }}>{s.draft}</td>
                                <td style={td}>{d.alwaysVisible ? "—" : s.sent ? <span style={{ color: "#15803d" }}>{when(s.sent.at)} · {s.sent.byName}</span> : <span style={{ color: "var(--text3)" }}>not sent</span>}</td>
                                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                                    {d.canSend && !d.alwaysVisible && (s.sent
                                        ? <button disabled={busy} onClick={() => unsend(s.siteId, s.site)} style={btnG}>Take back</button>
                                        : s.ready > 0 && <button disabled={busy} onClick={() => send([s.siteId])} style={btnG}>Send</button>)}
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                    {d.canSend && sel.size > 0 && <div style={{ padding: "8px 0" }}><button disabled={busy} onClick={() => send(Array.from(sel))} style={btnP}>Send selected ({sel.size})</button></div>}
                </div>
            )}
        </div>
    )
}

const th: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--border)", fontWeight: 600 }
const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--border)" }
const btnP: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }
const btnG: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }
