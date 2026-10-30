"use client"
// Upload Attendance → All sites: one workbook with every employee of every
// site for a month. Each row is checked exactly like the one-site upload
// (attendance-sheet.ts), then payroll is processed site by site through the
// same /api/payroll/calculate call the one-site upload makes.

import { useState, useRef, useEffect, useMemo } from "react"
import {
    Upload, Download, CheckCircle2, XCircle, Loader2, FileSpreadsheet, AlertCircle,
    AlertTriangle, MinusCircle, Users, RefreshCw, Building2,
} from "lucide-react"
import { toast } from "sonner"
import { payrollYears } from "./payroll-years"
import { fetchEmployeeOptions } from "@/lib/fetch-all-employees"
import { monthEndKey } from "@/lib/employee-filter"
import { compareSiteNames } from "@/lib/site-sort"
import type { PayrollRules } from "@/lib/payroll-rules"
import {
    type Site, type Employee, type MatchedRow, type RowState, type ParsedRow,
    MONTHS, TEMPLATE_COLS, templateRows, idKey,
    parseAttendanceRows, readWorkbookRows, loadUploadContext, idCounts, classifyRow, missingStaff,
    attendancePayload, isReady,
} from "./attendance-sheet"

const ALL_COLS = ["Site Code", "Site", ...TEMPLATE_COLS]

const card: React.CSSProperties = { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }
const stepBadge: React.CSSProperties = { width:24, height:24, borderRadius:"50%", background:"var(--accent)", color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }
const inputSt: React.CSSProperties = { padding:"7px 10px", borderRadius:8, border:"1px solid var(--border)", fontSize:13, background:"var(--surface)", color:"var(--text)", outline:"none", fontWeight:600 }
const btnPrimary: React.CSSProperties = { display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:8, border:"none", background:"var(--accent)", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }
const btnOutline: React.CSSProperties = { display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface)", color:"var(--text2)", fontSize:13, fontWeight:500, cursor:"pointer" }
const th: React.CSSProperties = { padding:"8px 10px", textAlign:"left", fontSize:10, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.4px", whiteSpace:"nowrap" }
const td: React.CSSProperties = { padding:"7px 10px" }

const STATE_STYLE: Record<RowState, { icon: React.ReactNode; bg: string; noteColor: string }> = {
    ok:    { icon: <CheckCircle2 size={14} style={{ color:"#16a34a" }} />, bg: "var(--surface)",  noteColor: "var(--text3)" },
    warn:  { icon: <AlertTriangle size={14} style={{ color:"#d97706" }} />, bg: "#fffbeb",        noteColor: "#a16207" },
    skip:  { icon: <MinusCircle size={14} style={{ color:"#9ca3af" }} />,   bg: "var(--surface2)", noteColor: "var(--text3)" },
    error: { icon: <XCircle size={14} style={{ color:"#dc2626" }} />,       bg: "#fff5f5",        noteColor: "#dc2626" },
}

type SiteRun = { status: "pending" | "running" | "done" | "failed"; processed?: number; message?: string }
const siteNorm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ")

/**
 * The site a row is paid under: its Site Code, else its Site name, else where
 * the employee is posted. Names aren't unique (two sites can share one), so a
 * name that matches more than one site asks for the code instead of guessing.
 */
function resolveSite(r: ParsedRow, emp: Employee | undefined, sites: Site[]): { site?: Site; error?: string; fromFile: boolean } {
    if (r.rawSiteCode) {
        const s = sites.find(x => x.code && siteNorm(x.code) === siteNorm(r.rawSiteCode))
        return s ? { site: s, fromFile: true } : { error: `Site code "${r.rawSiteCode}" not found`, fromFile: true }
    }
    if (r.rawSite) {
        const byName = sites.filter(x => siteNorm(x.name) === siteNorm(r.rawSite))
        if (byName.length === 1) return { site: byName[0], fromFile: true }
        if (byName.length > 1) return { error: `Site "${r.rawSite}" matches ${byName.length} sites — fill in the Site Code column`, fromFile: true }
        const byCode = sites.find(x => x.code && siteNorm(x.code) === siteNorm(r.rawSite))
        return byCode ? { site: byCode, fromFile: true } : { error: `Site "${r.rawSite}" not found`, fromFile: true }
    }
    const posted = emp?.deployments?.[0]
    if (posted) {
        const s = sites.find(x => x.id === posted.siteId)
        return { site: s ?? { id: posted.siteId, name: posted.site?.name ?? "Unknown site" }, fromFile: false }
    }
    return { fromFile: false }
}

async function downloadAllSitesTemplate(employees: Employee[], rules: PayrollRules, month: number, year: number) {
    const XLSX = await import("xlsx")
    // Grouped by site (A–Z), then by name; anyone not posted anywhere goes last
    // with the site left blank for whoever fills the sheet.
    const sorted = [...employees].sort((a, b) => {
        const sa = a.deployments?.[0]?.site, sb = b.deployments?.[0]?.site
        if (!!sa !== !!sb) return sa ? -1 : 1
        return (sa && sb ? compareSiteNames(sa, sb) : 0)
            || `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    })
    const body = templateRows(sorted, rules).map((row, i) => {
        const s = sorted[i].deployments?.[0]?.site
        return [s?.code ?? "", s?.name ?? "", ...row]
    })
    const title = [`ALL SITES — ${MONTHS[month - 1]} ${year}`, ...Array(ALL_COLS.length - 1).fill("")]
    const ws = XLSX.utils.aoa_to_sheet([title, ALL_COLS, ...body])
    ws["!cols"] = ALL_COLS.map((_, i) => ({ wch: i === 1 || i === 3 ? 24 : i === 0 || i === 2 ? 13 : 15 }))
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: body.length + 1, c: ALL_COLS.length - 1 } }) }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "All Sites")
    XLSX.writeFile(wb, `Attendance_All_Sites_${MONTHS[month - 1]}_${year}.xlsx`)
}

export default function AllSitesUpload({ month, year, setMonth, setYear, rules, onDone }: {
    month: number; year: number; setMonth: (m: number) => void; setYear: (y: number) => void
    rules: PayrollRules; onDone?: (period?: { month: number; year: number }) => void
}) {
    const [staff, setStaff] = useState<Employee[]>([])
    const [staffLoading, setStaffLoading] = useState(true)
    const [file, setFile] = useState<File | null>(null)
    const [parsing, setParsing] = useState(false)
    const [rows, setRows] = useState<MatchedRow[] | null>(null)
    const [missing, setMissing] = useState<{ label: string; site: string }[]>([])
    const [view, setView] = useState<"attention" | "all">("attention")
    const [runs, setRuns] = useState<Record<string, SiteRun>>({})
    const [processing, setProcessing] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Every site, active or not: a sheet may name a site by code or name, and
    // someone can still be posted at a site that has since been closed. Kept as
    // a promise so validation can wait for it: validating before the list
    // arrived reported every site code as "not found".
    const sitesReq = useRef<Promise<Site[]> | null>(null)
    const loadSites = () => {
        sitesReq.current ??= fetch("/api/sites")
            .then(r => { if (!r.ok) throw new Error(); return r.json() })
            .then((d: unknown) => {
                const list = Array.isArray(d) ? d as Site[] : []
                if (!list.length) throw new Error()
                return list
            })
            .catch(() => { sitesReq.current = null; throw new Error("Couldn't load the site list — try again") })
        return sitesReq.current
    }
    useEffect(() => { loadSites().catch(() => { /* retried when validating */ }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Who goes in the template: active staff who had joined by month end.
    useEffect(() => {
        let cancelled = false
        setStaffLoading(true)
        fetchEmployeeOptions<Employee>({ status: "ACTIVE", joinedBy: monthEndKey(month, year) })
            .then(d => { if (!cancelled) setStaff(d.employees) })
            .catch(() => { if (!cancelled) setStaff([]) })
            .finally(() => { if (!cancelled) setStaffLoading(false) })
        return () => { cancelled = true }
    }, [month, year])

    const reset = () => { setRows(null); setMissing([]); setRuns({}) }

    const perSiteStaff = useMemo(() => {
        const m = new Map<string, { site: { name: string; code?: string | null }; count: number }>()
        let unposted = 0
        for (const e of staff) {
            const s = e.deployments?.[0]
            if (!s) { unposted++; continue }
            const cur = m.get(s.siteId) ?? { site: { name: s.site?.name ?? "—", code: s.site?.code }, count: 0 }
            cur.count++
            m.set(s.siteId, cur)
        }
        return { list: [...m.values()].sort((a, b) => compareSiteNames(a.site, b.site)), unposted }
    }, [staff])

    const handleValidate = async () => {
        if (!file) { toast.error("Choose an Excel file first"); return }
        setParsing(true); reset()
        try {
            const parsed = parseAttendanceRows(await readWorkbookRows(file), rules)
            if (typeof parsed === "string") { toast.error(parsed); return }
            let siteList: Site[]
            try { siteList = await loadSites() }
            catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't load the site list — try again"); return }
            const ctx = await loadUploadContext(month, year)
            const counts = idCounts(parsed)
            const result: MatchedRow[] = parsed.map(r => {
                const emp = ctx.empMap.get(idKey(r.rawEmployeeId))
                const where = resolveSite(r, emp, siteList)
                const row = classifyRow(r, ctx, counts.get(idKey(r.rawEmployeeId)) ?? 0, where.site?.id ?? "")
                const withSite = { ...row, siteId: where.site?.id, siteName: where.site?.name }
                if (row.state === "error") return withSite
                if (where.error) return { ...withSite, state: "error" as const, note: `Row ${r.excelRow}: ${where.error}` }
                if (row.state === "skip") return withSite
                if (!where.site) return { ...withSite, state: "skip" as const, note: "No site — fill in the Site Code column" }
                return withSite
            })
            setRows(result)
            setMissing(missingStaff(ctx, parsed))
            setView(result.some(r => r.state !== "ok") ? "attention" : "all")
            const errors = result.filter(r => r.state === "error").length
            const ready = result.filter(isReady)
            const siteCount = new Set(ready.map(r => r.siteId)).size
            if (errors) toast.error(`${errors} row(s) need fixing before anything can be processed`)
            else toast.success(`${ready.length} of ${result.length} rows ready across ${siteCount} site(s)`)
        } catch (err) { console.error(err); toast.error("Failed to read the file") }
        finally { setParsing(false) }
    }

    // Ready rows per site, in site order.
    const groups = useMemo(() => {
        const m = new Map<string, { siteId: string; name: string; ready: MatchedRow[]; skipped: number; errors: number }>()
        for (const r of rows ?? []) {
            const key = r.siteId ?? ""
            const g = m.get(key) ?? { siteId: key, name: r.siteName ?? "No site", ready: [], skipped: 0, errors: 0 }
            if (isReady(r)) g.ready.push(r)
            else if (r.state === "error") g.errors++
            else g.skipped++
            m.set(key, g)
        }
        return [...m.values()].sort((a, b) => (!a.siteId ? 1 : !b.siteId ? -1 : compareSiteNames(a, b)))
    }, [rows])

    const errorCount = rows?.filter(r => r.state === "error").length ?? 0
    const skipCount  = rows?.filter(r => r.state === "skip").length ?? 0
    const warnCount  = rows?.filter(r => r.state === "warn").length ?? 0
    const readyCount = rows?.filter(isReady).length ?? 0
    const sitesToRun = groups.filter(g => g.siteId && g.ready.length > 0)

    // One site at a time, the same request the one-site upload sends. A site
    // that fails doesn't stop the rest; it can be retried on its own.
    const processSites = async (only?: string[]) => {
        if (errorCount > 0) { toast.error("Fix the rows with errors and upload again"); return }
        const todo = sitesToRun.filter(g => !only || only.includes(g.siteId))
        if (!todo.length) { toast.error("No employees to process"); return }
        setProcessing(true)
        setRuns(prev => ({ ...prev, ...Object.fromEntries(todo.map(g => [g.siteId, { status: "pending" as const }])) }))
        let failed = 0, processed = 0
        for (const g of todo) {
            setRuns(prev => ({ ...prev, [g.siteId]: { status: "running" } }))
            try {
                const res = await fetch("/api/payroll/calculate", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ siteId: g.siteId, month, year, attendance: attendancePayload(g.ready) }),
                })
                if (!res.ok) throw new Error((await res.text()) || `Failed (${res.status})`)
                const data = await res.json()
                processed += data.processedCount ?? 0
                setRuns(prev => ({ ...prev, [g.siteId]: { status: "done", processed: data.processedCount } }))
            } catch (e) {
                failed++
                setRuns(prev => ({ ...prev, [g.siteId]: { status: "failed", message: e instanceof Error ? e.message : "Processing failed" } }))
            }
        }
        setProcessing(false)
        // Sites that failed earlier and weren't part of this run are still outstanding.
        const stillFailed = Object.entries(runs).filter(([id, r]) => r.status === "failed" && !todo.some(g => g.siteId === id)).length
        if (failed) toast.error(`${failed} site(s) failed — see the site list, then retry them`)
        else {
            toast.success(`Payroll processed for ${processed} employees across ${todo.length} site(s)`)
            if (!stillFailed) onDone?.({ month, year })
        }
    }
    const failedSites = Object.entries(runs).filter(([, r]) => r.status === "failed").map(([id]) => id)
    const shownRows = (rows ?? []).filter(r => view === "all" || r.state !== "ok")

    return (
        <>
            {/* Step 1: Month */}
            <div style={card}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                    <div style={stepBadge}>1</div>
                    <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", margin:0 }}>Select Month</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr]" style={{ gap:12 }}>
                    <div>
                        <label htmlFor="all-month" style={{ fontSize:10, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.5px", display:"block", marginBottom:5 }}>Month *</label>
                        <select id="all-month" value={month} onChange={e => { setMonth(Number(e.target.value)); reset() }} disabled={processing} style={{ ...inputSt, width:"100%" }}>
                            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="all-year" style={{ fontSize:10, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.5px", display:"block", marginBottom:5 }}>Year *</label>
                        <select id="all-year" value={year} onChange={e => { setYear(Number(e.target.value)); reset() }} disabled={processing} style={{ ...inputSt, width:"100%" }}>
                            {payrollYears().map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Step 2: Template */}
            <div style={card}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={stepBadge}>2</div>
                        <div>
                            <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", margin:0 }}>Download Template</p>
                            <p style={{ fontSize:12, color:"var(--text3)", margin:"2px 0 0 0" }}>
                                One sheet with every site&apos;s staff for {MONTHS[month - 1]} {year}, grouped by site. Keep the Site Code column.
                            </p>
                        </div>
                    </div>
                    <button onClick={() => downloadAllSitesTemplate(staff, rules, month, year)} disabled={staffLoading || staff.length === 0}
                        style={{ ...btnPrimary, background:"#16a34a", opacity:(staffLoading || staff.length === 0) ? 0.5 : 1 }}>
                        {staffLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download Template — All Sites
                    </button>
                </div>
                <div style={{ marginTop:14, overflowX:"auto", borderRadius:8, border:"1px solid var(--border)", maxHeight:260, overflowY:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead>
                            <tr style={{ background:"var(--surface2)", borderBottom:"1px solid var(--border)" }}>
                                <th style={th}>Site</th><th style={th}>Site Code</th><th style={{ ...th, textAlign:"right" }}>Employees</th>
                            </tr>
                        </thead>
                        <tbody>
                            {staffLoading ? (
                                <tr><td colSpan={3} style={{ ...td, color:"var(--text3)" }}>
                                    <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}><Loader2 size={12} className="animate-spin" /> Loading staff…</span>
                                </td></tr>
                            ) : perSiteStaff.list.map(s => (
                                <tr key={`${s.site.code}-${s.site.name}`} style={{ borderBottom:"1px solid var(--border)" }}>
                                    <td style={{ ...td, color:"var(--text)" }}>{s.site.name}</td>
                                    <td style={{ ...td, color:"var(--text3)", fontFamily:"monospace" }}>{s.site.code || "—"}</td>
                                    <td style={{ ...td, textAlign:"right", fontVariantNumeric:"tabular-nums" }}>{s.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!staffLoading && (
                    <p style={{ fontSize:12, color:"var(--text3)", margin:"10px 0 0 0" }}>
                        {staff.length} employees across {perSiteStaff.list.length} sites.
                        {perSiteStaff.unposted > 0 && <> {perSiteStaff.unposted === 1 ? "1 person isn't" : `${perSiteStaff.unposted} people aren't`} posted at any site — at the end of the sheet with the site blank; fill in a Site Code to pay them.</>}
                    </p>
                )}
            </div>

            {/* Step 3: Upload */}
            <div style={card}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                    <div style={stepBadge}>3</div>
                    <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", margin:0 }}>Upload & Validate Excel</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={e => { setFile(e.target.files?.[0] ?? null); reset() }} style={{ display:"none" }} />
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                    <button onClick={() => fileInputRef.current?.click()} disabled={processing} style={btnOutline}>
                        <FileSpreadsheet size={14} style={{ color:"#16a34a" }} /> {file ? file.name : "Choose Excel File"}
                    </button>
                    {file && (
                        <button onClick={handleValidate} disabled={parsing || processing} style={{ ...btnPrimary, opacity:(parsing || processing) ? 0.6 : 1 }}>
                            {parsing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {parsing ? "Validating…" : "Upload & Validate"}
                        </button>
                    )}
                    {rows && !processing && (
                        <button onClick={() => { setFile(null); reset(); if (fileInputRef.current) fileInputRef.current.value = "" }} style={btnOutline}>
                            <RefreshCw size={13} /> Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Step 4: Results */}
            {rows && (
                <div style={card}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                        <div style={stepBadge}>4</div>
                        <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", margin:0 }}>Validation Results — All sites, {MONTHS[month - 1]} {year}</p>
                    </div>
                    <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
                        {[
                            { label:"Rows in file",     value:rows.length,       color:"#6b7280", bg:"var(--surface2)", border:"var(--border)" },
                            { label:"Ready to process", value:readyCount,        color:"#15803d", bg:"#dcfce7",         border:"#86efac" },
                            { label:"Sites",            value:sitesToRun.length, color:"#1d4ed8", bg:"#eff6ff",         border:"#bfdbfe" },
                            { label:"Skipped",          value:skipCount,         color:"#6b7280", bg:"var(--surface2)", border:"var(--border)" },
                            { label:"Errors",           value:errorCount,        color:"#dc2626", bg:"#fee2e2",         border:"#fca5a5" },
                        ].map(s => (
                            <div key={s.label} style={{ padding:"8px 16px", borderRadius:8, background:s.bg, border:`1px solid ${s.border}`, display:"flex", alignItems:"center", gap:8 }}>
                                <Users size={14} style={{ color:s.color }} />
                                <span style={{ fontSize:13, fontWeight:700, color:s.color }}>{s.value} {s.label}</span>
                            </div>
                        ))}
                    </div>
                    {errorCount > 0 && (
                        <div role="alert" style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", borderRadius:8, background:"#fef2f2", border:"1px solid #fca5a5", marginBottom:10, fontSize:12, color:"#b91c1c" }}>
                            <XCircle size={14} style={{ flexShrink:0 }} />
                            {errorCount} row(s) have errors (see the note on each). Fix them in the file and upload it again — no site is processed until then.
                        </div>
                    )}
                    {skipCount > 0 && (
                        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", borderRadius:8, background:"#fffbeb", border:"1px solid #fde047", marginBottom:10, fontSize:12, color:"#a16207" }}>
                            <AlertCircle size={14} style={{ flexShrink:0 }} /> {skipCount} row(s) will be skipped — the note on each says why.
                        </div>
                    )}
                    {warnCount > 0 && (
                        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", borderRadius:8, background:"#fffbeb", border:"1px solid #fde68a", marginBottom:10, fontSize:12, color:"#a16207" }}>
                            <AlertTriangle size={14} style={{ flexShrink:0 }} /> {warnCount} row(s) will be processed but are worth a look (name missing or not matching the ID, paid under a site they aren&apos;t posted at, or leaving this month).
                        </div>
                    )}
                    {missing.length > 0 && (
                        <details style={{ padding:"9px 12px", borderRadius:8, background:"var(--surface2)", border:"1px solid var(--border)", marginBottom:12, fontSize:12, color:"var(--text2)" }}>
                            <summary style={{ cursor:"pointer" }}>{missing.length} employee(s) posted at a site aren&apos;t in this file and won&apos;t be paid by this upload.</summary>
                            <p style={{ margin:"8px 0 0 0", lineHeight:1.6 }}>{missing.map(m => `${m.label}${m.site ? ` — ${m.site}` : ""}`).join(", ")}</p>
                        </details>
                    )}

                    {/* Per site: what will happen, then what did. */}
                    <div style={{ overflowX:"auto", borderRadius:8, border:"1px solid var(--border)", marginBottom:14 }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                            <thead>
                                <tr style={{ background:"var(--surface2)", borderBottom:"1px solid var(--border)" }}>
                                    <th style={th}>Site</th><th style={{ ...th, textAlign:"right" }}>Ready</th><th style={{ ...th, textAlign:"right" }}>Skipped</th>
                                    <th style={{ ...th, textAlign:"right" }}>Errors</th><th style={th}>Payroll</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map(g => {
                                    const run = runs[g.siteId]
                                    return (
                                        <tr key={g.siteId || "none"} style={{ borderBottom:"1px solid var(--border)" }}>
                                            <td style={{ ...td, color:"var(--text)", fontWeight:600 }}><span style={{ display:"inline-flex", alignItems:"center", gap:6 }}><Building2 size={12} style={{ color:"var(--text3)" }} />{g.name}</span></td>
                                            <td style={{ ...td, textAlign:"right", fontVariantNumeric:"tabular-nums", color:"#15803d", fontWeight:700 }}>{g.ready.length || "—"}</td>
                                            <td style={{ ...td, textAlign:"right", fontVariantNumeric:"tabular-nums" }}>{g.skipped || "—"}</td>
                                            <td style={{ ...td, textAlign:"right", fontVariantNumeric:"tabular-nums", color: g.errors ? "#dc2626" : undefined }}>{g.errors || "—"}</td>
                                            <td style={{ ...td, color:"var(--text2)" }}>
                                                {!run ? (g.siteId && g.ready.length ? "Not processed yet" : "—")
                                                    : run.status === "pending" ? "Waiting…"
                                                    : run.status === "running" ? <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}><Loader2 size={12} className="animate-spin" /> Processing…</span>
                                                    : run.status === "done" ? <span style={{ color:"#15803d", fontWeight:600 }}>Processed {run.processed}</span>
                                                    : <span style={{ color:"#dc2626" }}>Failed: {run.message}</span>}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap", marginBottom:8 }}>
                        <div role="tablist" aria-label="Rows shown" style={{ display:"flex", padding:3, borderRadius:9, background:"var(--surface2)", border:"1px solid var(--border)" }}>
                            {([["attention", `Needs a look (${rows.filter(r => r.state !== "ok").length})`], ["all", `All rows (${rows.length})`]] as const).map(([v, label]) => (
                                <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                                    style={{ padding:"5px 12px", borderRadius:7, border:"none", fontSize:12, fontWeight:600, cursor:"pointer", background: view === v ? "var(--surface)" : "transparent", color: view === v ? "var(--text)" : "var(--text3)" }}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ overflow:"auto", borderRadius:8, border:"1px solid var(--border)", maxHeight:480 }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                            <thead style={{ position:"sticky", top:0, background:"var(--surface2)", zIndex:1 }}>
                                <tr style={{ borderBottom:"1px solid var(--border)" }}>
                                    {["", "Row", "Emp ID", "Name", "Site", "Note", "Days", "OT Days", "Other Ded.", "LWF", "Canteen Days", "Canteen ₹", "Penalty", "Advance", "Prod. Inc."].map(h => (
                                        <th key={h} style={{ ...th, textAlign: h === "" ? "center" : "left" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {shownRows.length === 0 ? (
                                    <tr><td colSpan={15} style={{ ...td, color:"var(--text3)" }}>Every row is ready to process.</td></tr>
                                ) : shownRows.map((r, i) => {
                                    const st = STATE_STYLE[r.state]
                                    const num = (v: number | null) => v === null ? "—" : Number.isFinite(v) ? (v || "—") : "?"
                                    return (
                                        <tr key={i} style={{ borderBottom:"1px solid var(--border)", background:st.bg }}>
                                            <td style={{ ...td, textAlign:"center" }} title={r.state}>{st.icon}</td>
                                            <td style={{ ...td, color:"var(--text3)", fontVariantNumeric:"tabular-nums" }}>{r.excelRow}</td>
                                            <td style={{ ...td, fontFamily:"monospace", color:"var(--accent)", fontWeight:700, whiteSpace:"nowrap" }}>{r.rawEmployeeId}</td>
                                            <td style={{ ...td, color: r.dbName ? "var(--text)" : "#dc2626", fontStyle: r.dbName ? "normal" : "italic" }}>{r.dbName ?? (r.rawName || "not found")}</td>
                                            <td style={{ ...td, color:"var(--text2)", whiteSpace:"nowrap" }}>{r.siteName ?? (r.rawSite || r.rawSiteCode || "—")}</td>
                                            <td style={{ ...td, color:st.noteColor, minWidth:200 }}>{r.note ?? ""}</td>
                                            <td style={{ ...td, textAlign:"right", fontWeight:700 }}>{Number.isFinite(r.days) ? r.days : "?"}</td>
                                            <td style={{ ...td, textAlign:"right" }}>{Number.isFinite(r.otDays) ? r.otDays : "?"}</td>
                                            <td style={{ ...td, textAlign:"right" }}>{num(r.otherDeduction)}</td>
                                            <td style={{ ...td, textAlign:"right" }}>{num(r.lwf)}</td>
                                            <td style={{ ...td, textAlign:"right" }}>{num(r.canteenDays)}</td>
                                            <td style={{ ...td, textAlign:"right" }}>{r.canteenAmount === null ? "—" : Number.isFinite(r.canteenAmount) ? r.canteenAmount : "?"}</td>
                                            <td style={{ ...td, textAlign:"right" }}>{num(r.penalty)}</td>
                                            <td style={{ ...td, textAlign:"right" }}>{num(r.advance)}</td>
                                            <td style={{ ...td, textAlign:"right" }}>{num(r.productionIncentive)}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop:16, display:"flex", justifyContent:"flex-end", gap:10, flexWrap:"wrap" }}>
                        {failedSites.length > 0 && !processing && (
                            <button onClick={() => processSites(failedSites)} style={btnOutline}><RefreshCw size={13} /> Retry {failedSites.length} failed site(s)</button>
                        )}
                        <button onClick={() => processSites()} disabled={processing || errorCount > 0 || readyCount === 0 || Object.values(runs).some(r => r.status === "done")}
                            title={errorCount > 0 ? "Fix the rows with errors and upload again" : readyCount === 0 ? "No rows can be processed" : undefined}
                            style={{ ...btnPrimary, background:"#16a34a", fontSize:13, padding:"9px 20px",
                                opacity:(processing || errorCount > 0 || readyCount === 0 || Object.values(runs).some(r => r.status === "done")) ? 0.5 : 1,
                                cursor:(errorCount > 0 || readyCount === 0) ? "not-allowed" : "pointer" }}>
                            {processing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {processing
                                ? `Processing ${Object.values(runs).filter(r => r.status === "done" || r.status === "failed").length + 1} of ${Object.keys(runs).length} sites…`
                                : `Process Payroll — ${readyCount} Employees across ${sitesToRun.length} Sites`}
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}
