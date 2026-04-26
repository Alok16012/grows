"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
    Search, CheckCircle2, ChevronRight,
    Building2, Users, Wallet, RefreshCw,
    ArrowRight, FileSpreadsheet, AlertCircle, IndianRupee
} from "lucide-react"
import { toast } from "sonner"

type SiteStatus = {
    siteId: string
    siteName: string
    siteCode: string
    siteCity: string
    processedCount: number
    totalGross: number
    totalNet: number
}

const MONTHS = ["January","February","March","April","May","June",
                 "July","August","September","October","November","December"]
const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")

export default function SelectSitesPage() {
    const router  = useRouter()
    const [month, setMonth] = useState(String(new Date().getMonth() + 1))
    const [year,  setYear]  = useState(String(new Date().getFullYear()))
    const [sites,    setSites]    = useState<SiteStatus[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [search,   setSearch]   = useState("")
    const [loading,  setLoading]  = useState(false)

    const fetchSites = useCallback(async () => {
        setLoading(true)
        setSelected(new Set())
        try {
            const res = await fetch(`/api/payroll/sites-status?month=${month}&year=${year}`)
            if (res.ok) setSites(await res.json())
            else setSites([])
        } catch { toast.error("Failed to load sites") }
        finally { setLoading(false) }
    }, [month, year])

    useEffect(() => { fetchSites() }, [fetchSites])

    const toggle = (id: string) =>
        setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

    const filtered = sites.filter(s =>
        s.siteName.toLowerCase().includes(search.toLowerCase()) ||
        (s.siteCode || "").toLowerCase().includes(search.toLowerCase())
    )

    const selSites   = sites.filter(s => selected.has(s.siteId))
    const totalEmps  = selSites.reduce((a, s) => a + s.processedCount, 0)
    const totalGross = selSites.reduce((a, s) => a + s.totalGross, 0)
    const totalNet   = selSites.reduce((a, s) => a + s.totalNet, 0)

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 40 }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)" }}>
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll")}>Payroll</span>
                <ChevronRight size={11} />
                <span style={{ fontWeight: 600, color: "var(--text2)" }}>Select Sites (Multi)</span>
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Select Sites — Wage Sheet</h1>
                    <p style={{ fontSize: 12, color: "var(--text3)", margin: "3px 0 0 0" }}>Only sites with processed payroll for the selected month are shown</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={month} onChange={e => setMonth(e.target.value)}
                        style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, fontWeight: 700, background: "var(--surface)", color: "var(--text)", outline: "none" }}>
                        {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                    <select value={year} onChange={e => setYear(e.target.value)}
                        style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, fontWeight: 700, background: "var(--surface)", color: "var(--text)", outline: "none" }}>
                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button onClick={fetchSites}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {[
                    { label: "Sites with Wage Sheet", value: sites.length, icon: Building2,     color: "#3b82f6" },
                    { label: "Selected Sites",         value: selected.size, icon: CheckCircle2, color: "#7c3aed" },
                    { label: "Combined Staff",          value: totalEmps,    icon: Users,         color: "#16a34a" },
                    { label: "Est. Net Payable",        value: selected.size ? fmt(totalNet) : "—", icon: Wallet, color: "#d97706" },
                ].map(s => (
                    <div key={s.label} style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color + "15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <s.icon size={18} style={{ color: s.color }} />
                        </div>
                        <div>
                            <p style={{ fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", margin: 0 }}>{s.label}</p>
                            <p style={{ fontSize: 18, fontWeight: 800, color: s.color, margin: "2px 0 0 0" }}>{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Sites grid */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" }}>
                {/* Toolbar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <FileSpreadsheet size={16} style={{ color: "var(--accent)" }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                            Sites with Wage Sheet — {MONTHS[parseInt(month) - 1]} {year}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>({sites.length} sites)</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {/* Select all */}
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text2)", cursor: "pointer", fontWeight: 600 }}>
                            <input type="checkbox"
                                checked={selected.size === filtered.length && filtered.length > 0}
                                onChange={e => setSelected(e.target.checked ? new Set(filtered.map(s => s.siteId)) : new Set())}
                                style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
                            Select All
                        </label>
                        {/* Search */}
                        <div style={{ position: "relative" }}>
                            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search site…"
                                style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6, borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, outline: "none", background: "var(--surface2)", color: "var(--text)", width: 180 }} />
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48, gap: 10 }}>
                        <RefreshCw size={20} className="animate-spin" style={{ color: "var(--accent)" }} />
                        <span style={{ fontSize: 13, color: "var(--text3)" }}>Loading…</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48, gap: 10 }}>
                        <AlertCircle size={32} style={{ color: "var(--text3)", opacity: 0.4 }} />
                        <p style={{ fontSize: 14, color: "var(--text3)", fontWeight: 700, margin: 0 }}>
                            No wage sheets found for {MONTHS[parseInt(month) - 1]} {year}
                        </p>
                        <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>Process payroll first to generate wage sheets</p>
                        <button onClick={() => router.push("/payroll/process")}
                            style={{ marginTop: 8, padding: "7px 18px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            Go to Process Payroll →
                        </button>
                    </div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                        {filtered.map(site => {
                            const isSel = selected.has(site.siteId)
                            return (
                                <div key={site.siteId} onClick={() => toggle(site.siteId)}
                                    style={{
                                        padding: "14px 16px", borderRadius: 12, cursor: "pointer", transition: "all 0.15s",
                                        border: isSel ? "2px solid var(--accent)" : "2px solid var(--border)",
                                        background: isSel ? "#f5f3ff" : "var(--surface2)",
                                        position: "relative",
                                    }}>
                                    {isSel && (
                                        <div style={{ position: "absolute", top: 10, right: 10 }}>
                                            <CheckCircle2 size={20} style={{ color: "var(--accent)" }} />
                                        </div>
                                    )}
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                        <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "#eff6ff", color: "#1d4ed8", letterSpacing: "0.3px" }}>
                                            {site.siteCode || "SITE"}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", margin: "0 0 2px 0", paddingRight: 24 }}>{site.siteName}</p>
                                    <p style={{ fontSize: 11, color: "var(--text3)", margin: "0 0 10px 0" }}>{site.siteCity || "—"}</p>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                                        <div>
                                            <p style={{ fontSize: 9, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", margin: "0 0 2px 0" }}>Staff</p>
                                            <p style={{ fontSize: 13, fontWeight: 800, color: "#16a34a", margin: 0 }}>{site.processedCount}</p>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: 9, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", margin: "0 0 2px 0" }}>Gross</p>
                                            <p style={{ fontSize: 12, fontWeight: 700, color: "#0369a1", margin: 0 }}>{fmt(site.totalGross)}</p>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: 9, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", margin: "0 0 2px 0" }}>Net</p>
                                            <p style={{ fontSize: 12, fontWeight: 700, color: "#15803d", margin: 0 }}>{fmt(site.totalNet)}</p>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Footer summary + action */}
            {selected.size > 0 && (
                <div style={{ position: "sticky", bottom: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                        <div>
                            <p style={{ fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", margin: 0 }}>Selected Sites</p>
                            <p style={{ fontSize: 16, fontWeight: 800, color: "#7c3aed", margin: 0 }}>{selected.size} sites</p>
                        </div>
                        <div>
                            <p style={{ fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", margin: 0 }}>Total Staff</p>
                            <p style={{ fontSize: 16, fontWeight: 800, color: "#16a34a", margin: 0 }}>{totalEmps} employees</p>
                        </div>
                        <div>
                            <p style={{ fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", margin: 0 }}>Total Gross</p>
                            <p style={{ fontSize: 16, fontWeight: 800, color: "#0369a1", margin: 0 }}>{fmt(totalGross)}</p>
                        </div>
                        <div>
                            <p style={{ fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", margin: 0 }}>Total Net</p>
                            <p style={{ fontSize: 16, fontWeight: 800, color: "#15803d", margin: 0 }}>{fmt(totalNet)}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => router.push(`/payroll/wagesheet?siteIds=${[...selected].join(",")}&month=${month}&year=${year}`)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                        <IndianRupee size={15} /> View Wage Sheet <ArrowRight size={15} />
                    </button>
                </div>
            )}
        </div>
    )
}
