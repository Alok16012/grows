"use client"

// Payslips to employees → Sending options (in Payroll → Pay & slips and Salary slips).
// When a payslip appears in the employee's My Profile and the app: sent by HR
// by hand (whole site or chosen employees), or automatically on lock / paid.
// Saves straight away (it isn't a dated salary rule). Never WhatsApp.
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Send } from "lucide-react"

type Mode = "manual" | "onLock" | "onPaid"
type S = { mode: Mode; notify: boolean; startFrom: string | null; modes: Record<Mode, string>; canSend: boolean }

const HELP: Record<Mode, string> = {
    manual: "Nothing reaches employees until HR presses Send on Salary slips — a whole site at once, or chosen employees.",
    onLock: "Each payslip shows to the employee the moment its payroll is locked.",
    onPaid: "Each payslip shows to the employee when the salary is marked paid. HR can still send a site or an employee earlier by hand.",
}

export function PayslipSendSettings({ compact, onChanged }: { compact?: boolean; onChanged?: () => void }) {
    const [s, setS] = useState<S | null>(null)
    const [busy, setBusy] = useState(false)
    useEffect(() => { fetch("/api/payroll/payslips/send?settings=1").then(r => r.ok ? r.json() : null).then(setS).catch(() => {}) }, [])
    if (!s) return <div style={{ padding: 8 }}><Loader2 size={16} className="animate-spin" /></div>
    async function save(p: Partial<Pick<S, "mode" | "notify" | "startFrom">>) {
        if (!s) return
        setBusy(true)
        try {
            const r = await fetch("/api/payroll/payslips/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", ...p }) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not save")
            setS({ ...s, ...p } as S); toast.success("Payslip sending saved"); onChanged?.()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const ro = !s.canSend || busy
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
            {!compact && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Send size={15} style={{ color: "var(--accent)" }} />
                    <h2 style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", margin: 0 }}>Payslips to employees</h2>
                    {busy && <Loader2 size={13} className="animate-spin" />}
                </div>
            )}
            {!compact && <p style={{ margin: 0, fontSize: 12, color: "var(--text3)" }}>When a processed payslip shows in the employee&apos;s My Profile and the app. In-app only — never sent on WhatsApp.</p>}
            {(Object.keys(s.modes) as Mode[]).map(m => (
                <label key={m} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, border: `1px solid ${s.mode === m ? "var(--accent)" : "var(--border)"}`, background: s.mode === m ? "var(--accent-light)" : "var(--surface)", cursor: ro ? "default" : "pointer" }}>
                    <input type="radio" name="payslip-mode" checked={s.mode === m} disabled={ro} onChange={() => save({ mode: m })} style={{ marginTop: 3 }} />
                    <span><b style={{ fontWeight: 600 }}>{s.modes[m]}</b><span style={{ display: "block", fontSize: 12, color: "var(--text3)" }}>{HELP[m]}</span></span>
                </label>
            ))}
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={s.notify} disabled={ro} onChange={e => save({ notify: e.target.checked })} /> Send the employee an in-app note “Your payslip is ready” when it reaches them</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                Apply from
                <input type="month" defaultValue={s.startFrom ?? ""} disabled={ro} onBlur={e => e.target.value && e.target.value !== s.startFrom && save({ startFrom: e.target.value })} style={{ height: 30, border: "1px solid var(--border)", borderRadius: 8, padding: "0 8px" }} />
                <span style={{ fontSize: 12, color: "var(--text3)" }}>Payslips of earlier months stay visible as they are.</span>
            </label>
            {!s.canSend && <p style={{ margin: 0, fontSize: 12, color: "#b45309" }}>Changing this needs Edit payroll (or Mark paid / Lock).</p>}
        </div>
    )
}
