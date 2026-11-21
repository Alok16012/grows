"use client"

// Calculation Settings → OT rule by site. Pick a site, pick its one OT rule,
// Set. The rules themselves are settings too: "Edit OT rules" opens a popup to
// add, change or remove them (salary parts ÷ days ÷ hours × multiplier, or a
// fixed rate). Everything is saved with the rest of the settings, so it follows
// the same "applies from" month, versions and draft recalculation.
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Pencil, Plus, Settings2, Trash2, X } from "lucide-react"
import { OT_PARTS, OT_PART_LABELS, otFormulaLabel, otFormulaText, type OtFormula, type OtPart, type PayrollRules } from "@/lib/payroll-rules"

type Ot = PayrollRules["ot"]
type Site = { id: string; name: string }

const ALL = "__all__"
const EDIT = "__edit__"
const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px" }
const box: React.CSSProperties = { height: 34, padding: "0 9px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5, background: "var(--surface)", color: "var(--text)", outline: "none" }
const field = (w: number | string): React.CSSProperties => ({ display: "flex", flexDirection: "column", gap: 4, width: w, minWidth: 0 })
const iconBtn: React.CSSProperties = { height: 34, width: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text2)", cursor: "pointer", flexShrink: 0 }

export default function OtSiteRules({ ot, onChange }: { ot: Ot; onChange: (patch: Partial<Ot>) => void }) {
    const [sites, setSites] = useState<Site[]>([])
    const [siteId, setSiteId] = useState("")
    const [rule, setRule] = useState("")
    const [editing, setEditing] = useState(false)
    useEffect(() => {
        fetch("/api/sites").then(r => r.ok ? r.json() : []).then(d => {
            if (Array.isArray(d)) setSites(d.map((s: any) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true })))
        }).catch(() => {})
    }, [])

    const formulas = ot.formulas ?? []
    const byId = useMemo(() => new Map(formulas.map(f => [f.id, f])), [formulas])
    const nameOf = useMemo(() => new Map(sites.map(s => [s.id, s.name])), [sites])
    const own = Object.entries(ot.sites ?? {})
        .map(([id, r]) => ({ id, name: nameOf.get(id) ?? "(site removed)", formula: byId.get(r.rule) }))
        .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }))

    // Choosing a site shows the rule it has now.
    const pickSite = (id: string) => {
        setSiteId(id)
        setRule((id && id !== ALL ? ot.sites?.[id]?.rule : undefined) ?? ot.defaultRule)
    }
    const set = () => {
        if (!siteId || !byId.has(rule)) return
        const next = { ...ot.sites }
        for (const id of siteId === ALL ? sites.map(s => s.id) : [siteId]) next[id] = { rule }
        onChange({ sites: next })
        setSiteId("")
    }
    const remove = (id: string) => { const next = { ...ot.sites }; delete next[id]; onChange({ sites: next }) }
    const ruleOptions = formulas.map(f => <option key={f.id} value={f.id}>{otFormulaLabel(f)}</option>)

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Default rule + the rules popup */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                <label style={field(300)}>
                    <span style={lbl}>Default rule (all other sites)</span>
                    <select value={ot.defaultRule} onChange={e => e.target.value === EDIT ? setEditing(true) : onChange({ defaultRule: e.target.value })} style={box}>
                        {ruleOptions}
                        <option value={EDIT}>⚙ Add / edit OT rules…</option>
                    </select>
                </label>
                <button type="button" onClick={() => setEditing(true)} style={{ ...iconBtn, width: "auto", padding: "0 12px", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
                    <Settings2 size={14} /> Edit OT rules ({formulas.length})
                </button>
            </div>

            {/* Set one site's rule */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", padding: 10, borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <label style={field(220)}>
                    <span style={lbl}>Site</span>
                    <select value={siteId} onChange={e => pickSite(e.target.value)} style={box}>
                        <option value="">Select site…</option>
                        <option value={ALL}>All sites ({sites.length})</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}{ot.sites?.[s.id] ? " ✓" : ""}</option>)}
                    </select>
                </label>
                <label style={field(260)}>
                    <span style={lbl}>OT rule</span>
                    <select value={rule} onChange={e => e.target.value === EDIT ? setEditing(true) : setRule(e.target.value)} style={box} disabled={!siteId}>
                        {ruleOptions}
                        <option value={EDIT}>⚙ Add / edit OT rules…</option>
                    </select>
                </label>
                <button type="button" title="Edit OT rules" onClick={() => setEditing(true)} style={iconBtn}><Settings2 size={15} /></button>
                <button type="button" onClick={set} disabled={!siteId}
                    style={{ height: 34, padding: "0 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: siteId ? "pointer" : "not-allowed", opacity: siteId ? 1 : 0.5 }}>
                    Set rule
                </button>
            </div>

            {/* Sites with their own rule */}
            {own.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>All {sites.length || ""} sites use the default rule. Pick a site above to give it its own.</p>
            ) : (
                <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "var(--text2)", background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                        {own.length} site{own.length === 1 ? "" : "s"} with their own rule · {Math.max(sites.length - own.length, 0)} on the default
                    </div>
                    <div style={{ maxHeight: 220, overflowY: "auto" }}>
                        {own.map(o => (
                            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                                <span style={{ flex: "1 1 40%", fontWeight: 600, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                                <span style={{ flex: "1 1 45%", color: "var(--text2)" }}>{o.formula ? otFormulaLabel(o.formula) : "—"}</span>
                                <button type="button" title="Change" onClick={() => pickSite(o.id)} style={{ border: "none", background: "none", color: "var(--text3)", cursor: "pointer" }}><Pencil size={13} /></button>
                                <button type="button" title="Use the default rule" onClick={() => remove(o.id)} style={{ border: "none", background: "none", color: "var(--text3)", cursor: "pointer" }}><X size={14} /></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {editing && <OtRulesPopup ot={ot} onChange={onChange} onClose={() => setEditing(false)} />}
        </div>
    )
}

// ── The OT rules popup ───────────────────────────────────────────────────────
const SAMPLE: Record<OtPart, number> = { basic: 12000, da: 2511, hra: 0, washing: 500, conveyance: 1000, leaveWithWages: 0, bonus: 0, otherAllowance: 0 }

function OtRulesPopup({ ot, onChange, onClose }: { ot: Ot; onChange: (patch: Partial<Ot>) => void; onClose: () => void }) {
    const formulas = ot.formulas ?? []
    useEffect(() => {
        const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
        document.addEventListener("keydown", k)
        return () => document.removeEventListener("keydown", k)
    }, [onClose])

    const save = (list: OtFormula[]) => onChange({ formulas: list })
    const patch = (id: string, p: Partial<OtFormula>) => save(formulas.map(f => f.id === id ? { ...f, ...p } : f))
    const add = () => {
        const id = `R${Date.now().toString(36)}`
        save([...formulas, { id, name: "", kind: "FORMULA", parts: ["basic", "da"], days: 26, hours: 8, multiplier: 2, fixedRate: null }])
    }
    const del = (f: OtFormula) => {
        const users = Object.values(ot.sites ?? {}).filter(s => s.rule === f.id).length
        if (users && !confirm(`${users} site${users === 1 ? " uses" : "s use"} this rule. Remove it? Those sites go back to the default rule.`)) return
        const sites = Object.fromEntries(Object.entries(ot.sites ?? {}).filter(([, s]) => s.rule !== f.id))
        onChange({ formulas: formulas.filter(x => x.id !== f.id), sites })
    }
    const sampleRate = (f: OtFormula) => {
        if (f.kind === "FIXED") return f.fixedRate ? `₹${f.fixedRate}/hr for everyone` : "each employee's own OT rate (Salary Master)"
        const base = f.parts.reduce((a, p) => a + SAMPLE[p], 0)
        return `₹${base.toLocaleString("en-IN")} ÷ ${f.days} ÷ ${f.hours} × ${f.multiplier} = ₹${(base / (f.days || 1) / (f.hours || 1) * f.multiplier).toFixed(2)}/hr`
    }

    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
            style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div role="dialog" aria-modal="true" aria-label="OT rules"
                style={{ width: "100%", maxWidth: 640, maxHeight: "90vh", display: "flex", flexDirection: "column", background: "var(--surface)", borderRadius: 14, border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)" }}>OT rules</h3>
                        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text3)" }}>OT rate per hour = ticked salary parts ÷ days ÷ hours × multiply, or a fixed rate. Full-month salary amounts are used. Example uses Basic ₹12,000, DA ₹2,511, Washing ₹500, Conveyance ₹1,000.</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", color: "var(--text3)", cursor: "pointer", padding: 4 }}><X size={18} /></button>
                </div>

                <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                    {formulas.map(f => {
                        const isDefault = f.id === ot.defaultRule
                        const users = Object.values(ot.sites ?? {}).filter(s => s.rule === f.id).length
                        return (
                            <div key={f.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: "1 1 200px" }}>
                                        {otFormulaText(f)}
                                        {isDefault && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: "#15803d", background: "#dcfce7", padding: "1px 7px", borderRadius: 20 }}>default</span>}
                                        {users > 0 && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: "var(--text3)" }}>{users} site{users === 1 ? "" : "s"}</span>}
                                    </span>
                                    <select value={f.kind} onChange={e => patch(f.id, e.target.value === "FIXED" ? { kind: "FIXED" } : { kind: "FORMULA", parts: f.parts.length ? f.parts : ["basic", "da"] })} style={{ ...box, width: 130 }}>
                                        <option value="FORMULA">Formula</option>
                                        <option value="FIXED">Fixed rate</option>
                                    </select>
                                    <button type="button" title={isDefault ? "The default rule can't be removed — pick another default first" : "Remove rule"} disabled={isDefault} onClick={() => del(f)}
                                        style={{ ...iconBtn, color: isDefault ? "var(--border2)" : "#dc2626", cursor: isDefault ? "not-allowed" : "pointer" }}><Trash2 size={14} /></button>
                                </div>
                                <label style={field("100%")}>
                                    <span style={lbl}>Name (optional)</span>
                                    <input value={f.name} maxLength={60} placeholder="e.g. Client OT policy" onChange={e => patch(f.id, { name: e.target.value })} style={box} />
                                </label>
                                {f.kind === "FORMULA" ? (<>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                        {OT_PARTS.map(p => {
                                            const on = f.parts.includes(p)
                                            return (
                                                <button key={p} type="button" onClick={() => {
                                                    const parts = on ? f.parts.filter(x => x !== p) : OT_PARTS.filter(x => x === p || f.parts.includes(x))
                                                    if (parts.length) patch(f.id, { parts })
                                                }} style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "var(--surface)", color: on ? "#fff" : "var(--text2)" }}>
                                                    {on ? "✓ " : "+ "}{OT_PART_LABELS[p]}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                                        {([["days", "÷ Days"], ["hours", "÷ Hours"], ["multiplier", "× Multiply"]] as const).map(([k, l]) => (
                                            <label key={k} style={field(96)}>
                                                <span style={lbl}>{l}</span>
                                                <input type="number" step="any" min={0} value={f[k]} onChange={e => patch(f.id, { [k]: e.target.value === "" ? 0 : Number(e.target.value) } as Partial<OtFormula>)} style={box} />
                                            </label>
                                        ))}
                                    </div>
                                </>) : (
                                    <label style={field(170)}>
                                        <span style={lbl}>Rate ₹/hour</span>
                                        <input type="number" min={0} step="any" value={f.fixedRate ?? ""} placeholder="Employee's own rate"
                                            onChange={e => patch(f.id, { fixedRate: e.target.value === "" ? null : Number(e.target.value) })} style={box} />
                                    </label>
                                )}
                                <p style={{ margin: 0, fontSize: 11.5, color: "var(--text3)" }}>Example: {sampleRate(f)}</p>
                            </div>
                        )
                    })}
                    <button type="button" onClick={add} style={{ ...iconBtn, width: "100%", gap: 6, fontSize: 12.5, fontWeight: 600, borderStyle: "dashed" }}><Plus size={14} /> Add OT rule</button>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 11.5, color: "var(--text3)" }}>Changes are kept when you click Save on the settings page.</span>
                    <button type="button" onClick={onClose} style={{ height: 34, padding: "0 18px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Done</button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
