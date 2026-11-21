"use client"

// Calculation Settings → OT rule by site, compact: pick a site from a dropdown,
// pick its one rule, Set. Only sites with a rule of their own are listed below;
// every other site uses the default rule. Saved with the rest of the settings,
// so it follows the same "applies from" month, versions and draft recalculation.
import { useEffect, useMemo, useState } from "react"
import { Pencil, X } from "lucide-react"
import type { OtRule, PayrollRules } from "@/lib/payroll-rules"

type Ot = PayrollRules["ot"]
type Site = { id: string; name: string }

const ALL = "__all__"
const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px" }
const box: React.CSSProperties = { height: 34, padding: "0 9px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5, background: "var(--surface)", color: "var(--text)", outline: "none" }
const field = (w: number | string): React.CSSProperties => ({ display: "flex", flexDirection: "column", gap: 4, width: w, minWidth: 0 })

export default function OtSiteRules({ ot, onChange }: { ot: Ot; onChange: (patch: Partial<Ot>) => void }) {
    const [sites, setSites] = useState<Site[]>([])
    const [siteId, setSiteId] = useState("")
    const [rule, setRule] = useState<OtRule>("BASIC_DA")
    const [rate, setRate] = useState("")
    useEffect(() => {
        fetch("/api/sites").then(r => r.ok ? r.json() : []).then(d => {
            if (Array.isArray(d)) setSites(d.map((s: any) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true })))
        }).catch(() => {})
    }, [])

    const f = `/${ot.rateDays}/${ot.rateHours}×${ot.multiplier}`
    const RULES: { value: OtRule; label: string }[] = [
        { value: "BASIC_DA", label: `(Basic+DA)${f}` },
        { value: "BASIC_DA_CONV", label: `(Basic+DA+Conveyance)${f}` },
        { value: "GROSS", label: `Gross${f}` },
        { value: "FIXED", label: "Fixed OT rate" },
    ]
    const ruleLabel = (r: OtRule) => RULES.find(x => x.value === r)?.label ?? r
    const nameOf = useMemo(() => new Map(sites.map(s => [s.id, s.name])), [sites])
    const own = Object.entries(ot.sites ?? {})
        .map(([id, r]) => ({ id, name: nameOf.get(id) ?? "(site removed)", ...r }))
        .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }))

    // Choosing a site shows the rule it has now.
    const pickSite = (id: string) => {
        setSiteId(id)
        const r = id && id !== ALL ? ot.sites?.[id] : undefined
        setRule(r?.rule ?? ot.defaultRule ?? "BASIC_DA")
        setRate(r?.rule === "FIXED" && r.fixedRate ? String(r.fixedRate) : "")
    }
    const set = () => {
        if (!siteId) return
        const fixedRate = rule === "FIXED" && Number(rate) > 0 ? Number(rate) : null
        const value = rule === "FIXED" ? { rule, fixedRate } : { rule }
        const next = { ...ot.sites }
        for (const id of siteId === ALL ? sites.map(s => s.id) : [siteId]) next[id] = value
        onChange({ sites: next })
        setSiteId(""); setRate("")
    }
    const remove = (id: string) => { const next = { ...ot.sites }; delete next[id]; onChange({ sites: next }) }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Formula and default */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                {([["rateDays", "Days"], ["rateHours", "Hours"], ["multiplier", "Multiply"]] as const).map(([k, l]) => (
                    <label key={k} style={field(78)}>
                        <span style={lbl}>{l}</span>
                        <input type="number" step="any" value={ot[k]} onChange={e => onChange({ [k]: e.target.value === "" ? 0 : Number(e.target.value) } as Partial<Ot>)} style={box} />
                    </label>
                ))}
                <label style={field(260)}>
                    <span style={lbl}>Default rule (all other sites)</span>
                    <select value={ot.defaultRule} onChange={e => onChange({ defaultRule: e.target.value as OtRule })} style={box}>
                        {RULES.map(r => <option key={r.value} value={r.value}>{r.value === "FIXED" ? "Fixed — employee's own OT rate" : r.label}</option>)}
                    </select>
                </label>
            </div>

            {/* Set one site's rule */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", padding: 10, borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <label style={field(220)}>
                    <span style={lbl}>Site</span>
                    <select value={siteId} onChange={e => pickSite(e.target.value)} style={box}>
                        <option value="">Select site…</option>
                        <option value={ALL}>All sites ({sites.length})</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}{ot.sites?.[s.id] ? " ✓" : ""}</option>)}
                    </select>
                </label>
                <label style={field(230)}>
                    <span style={lbl}>OT rule</span>
                    <select value={rule} onChange={e => setRule(e.target.value as OtRule)} style={box} disabled={!siteId}>
                        {RULES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                </label>
                {rule === "FIXED" && (
                    <label style={field(130)}>
                        <span style={lbl}>Rate ₹/hour</span>
                        <input type="number" min={0} step="any" value={rate} onChange={e => setRate(e.target.value)} placeholder="Own rate" disabled={!siteId}
                            title="Blank = each employee's own OT rate (Salary Master)" style={box} />
                    </label>
                )}
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
                                <span style={{ flex: "1 1 45%", color: "var(--text2)" }}>
                                    {ruleLabel(o.rule)}{o.rule === "FIXED" ? (o.fixedRate ? ` · ₹${o.fixedRate}/hr` : " · employee's own rate") : ""}
                                </span>
                                <button type="button" title="Change" onClick={() => pickSite(o.id)} style={{ border: "none", background: "none", color: "var(--text3)", cursor: "pointer" }}><Pencil size={13} /></button>
                                <button type="button" title="Use the default rule" onClick={() => remove(o.id)} style={{ border: "none", background: "none", color: "var(--text3)", cursor: "pointer" }}><X size={14} /></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
