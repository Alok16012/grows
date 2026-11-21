"use client"

// Calculation Settings → OT rule by site. Each site has exactly one OT rule
// (picking one clears the others). Saved with the rest of the settings, so it
// follows the same "applies from" month, versions and draft auto-recalculation.
import { useEffect, useMemo, useState } from "react"
import { Search, RotateCcw } from "lucide-react"
import type { OtRule, PayrollRules } from "@/lib/payroll-rules"

type Ot = PayrollRules["ot"]
type Site = { id: string; name: string }

const th: React.CSSProperties = { padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "var(--text2)", textAlign: "center", borderBottom: "1px solid var(--border)", background: "var(--surface2)", whiteSpace: "nowrap" }
const td: React.CSSProperties = { padding: "7px 10px", fontSize: 12.5, borderBottom: "1px solid var(--border)", textAlign: "center" }
const input: React.CSSProperties = { padding: "6px 9px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5, background: "var(--surface)", color: "var(--text)", outline: "none" }

export default function OtSiteRules({ ot, onChange }: { ot: Ot; onChange: (patch: Partial<Ot>) => void }) {
    const [sites, setSites] = useState<Site[]>([])
    const [q, setQ] = useState("")
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
    const shown = useMemo(() => {
        const s = q.trim().toLowerCase()
        return s ? sites.filter(x => x.name.toLowerCase().includes(s)) : sites
    }, [sites, q])

    const setSite = (id: string, rule: OtRule | null, fixedRate?: number | null) => {
        const next = { ...ot.sites }
        if (rule === null) delete next[id]
        else next[id] = rule === "FIXED" ? { rule, fixedRate: fixedRate ?? next[id]?.fixedRate ?? null } : { rule }
        onChange({ sites: next })
    }
    const applyToShown = (rule: OtRule) => {
        const next = { ...ot.sites }
        for (const s of shown) next[s.id] = rule === "FIXED" ? { rule, fixedRate: next[s.id]?.fixedRate ?? null } : { rule }
        onChange({ sites: next })
    }
    const custom = Object.keys(ot.sites ?? {}).length

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                {([["rateDays", "Divide by days"], ["rateHours", "Divide by hours"], ["multiplier", "Multiply by"]] as const).map(([k, l]) => (
                    <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4, width: 120 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{l}</span>
                        <input type="number" step="any" value={ot[k]} onChange={e => onChange({ [k]: e.target.value === "" ? 0 : Number(e.target.value) } as Partial<Ot>)} style={input} />
                    </label>
                ))}
                <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 230 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Sites with no rule of their own</span>
                    <select value={ot.defaultRule} onChange={e => onChange({ defaultRule: e.target.value as OtRule })} style={input}>
                        {RULES.map(r => <option key={r.value} value={r.value}>{r.value === "FIXED" ? "Fixed — each employee's own OT rate" : r.label}</option>)}
                    </select>
                </label>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
                    <Search size={13} style={{ position: "absolute", left: 9, top: 9, color: "var(--text3)" }} />
                    <input placeholder="Search sites" value={q} onChange={e => setQ(e.target.value)} style={{ ...input, width: "100%", paddingLeft: 28 }} />
                </div>
                <select value="" onChange={e => { if (e.target.value) applyToShown(e.target.value as OtRule) }} style={input} aria-label="Apply one rule to every listed site">
                    <option value="">Apply to all {q ? "listed" : ""} sites ({shown.length})…</option>
                    {RULES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <span style={{ fontSize: 11.5, color: "var(--text3)" }}>{custom} site{custom === 1 ? "" : "s"} with their own rule</span>
            </div>

            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                    <thead>
                        <tr>
                            <th style={{ ...th, textAlign: "left", width: 40 }}>#</th>
                            <th style={{ ...th, textAlign: "left" }}>Site</th>
                            {RULES.map(r => <th key={r.value} style={th}>{r.label}</th>)}
                            <th style={th}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.length === 0 && (
                            <tr><td colSpan={7} style={{ ...td, color: "var(--text3)", padding: 18 }}>{sites.length ? "No site matches the search." : "Loading sites…"}</td></tr>
                        )}
                        {shown.map((s, i) => {
                            const own = ot.sites?.[s.id]
                            const active = own?.rule ?? ot.defaultRule
                            return (
                                <tr key={s.id}>
                                    <td style={{ ...td, textAlign: "left", color: "var(--text3)" }}>{i + 1}</td>
                                    <td style={{ ...td, textAlign: "left", fontWeight: 600, color: "var(--text)" }}>
                                        {s.name}
                                        {!own && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: "var(--text3)" }}>(default)</span>}
                                    </td>
                                    {RULES.map(r => (
                                        <td key={r.value} style={td}>
                                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                                <input type="radio" name={`ot-${s.id}`} checked={active === r.value} onChange={() => setSite(s.id, r.value)}
                                                    aria-label={`${s.name}: ${r.label}`} style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} />
                                                {r.value === "FIXED" && (
                                                    <input type="number" min={0} step="any" disabled={active !== "FIXED"}
                                                        placeholder="Own rate" title="₹ per hour for everyone at this site. Blank = each employee's own OT rate."
                                                        value={own?.rule === "FIXED" && own.fixedRate ? own.fixedRate : ""}
                                                        onChange={e => setSite(s.id, "FIXED", e.target.value === "" ? null : Number(e.target.value))}
                                                        style={{ ...input, width: 86, opacity: active === "FIXED" ? 1 : 0.4 }} />
                                                )}
                                            </div>
                                        </td>
                                    ))}
                                    <td style={td}>
                                        {own && <button type="button" onClick={() => setSite(s.id, null)} title="Use the default rule" style={{ border: "none", background: "none", color: "var(--text3)", cursor: "pointer" }}><RotateCcw size={13} /></button>}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
