"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { fetchAllEmployees } from "@/lib/fetch-all-employees"
import { can } from "@/lib/can"
// xlsx is lazy-loaded — only needed when a sheet is actually read or written.
// Eager import adds ~430KB to this page's initial bundle.
const loadXLSX = () => import("xlsx")
import {
    Loader2, Play, RefreshCw, ChevronRight,
    AlertCircle, CheckCircle2, Users, MapPin, Building2, Search,
    Unlock, Trash2, FileUp, X
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
type Site     = { id: string; name: string; code?: string; city?: string }
type SiteStatus = { siteId: string | null; processedCount: number }

type Employee = {
    id: string; employeeId: string; firstName: string; lastName: string
    designation?: string; gender?: string
    employeeSalary?: {
        basic: number; da: number; washing: number; conveyance: number
        leaveWithWages: number; otherAllowance: number
        bonus?: number; complianceType?: string; status?: string
    } | null
}
type AttRow = {
    monthDays: number; workedDays: number; otDays: number
    canteenDays: number; penalty: number; advance: number
    /** Manual canteen amount. null = derive from days x rate. */
    canteenAmount: number | null
    otherDeductions: number; productionIncentive: number; lwf: number
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const fmt = (n: number) => n ? "₹" + Math.round(n).toLocaleString("en-IN") : "—"
const defaultDays = 26

// ─── Styles ───────────────────────────────────────────────────────────────────
const th: React.CSSProperties = { padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center", whiteSpace: "nowrap" }
const thGroup: React.CSSProperties = { padding: "5px 10px", fontSize: 9, fontWeight: 800, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.6px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }
const td: React.CSSProperties = { padding: "6px 10px", textAlign: "center", color: "var(--text)", whiteSpace: "nowrap" }
const attInput: React.CSSProperties = { width: 50, padding: "3px 4px", borderRadius: 5, border: "1px solid var(--border)", textAlign: "center", fontSize: 11, outline: "none", background: "var(--surface)", color: "var(--text)" }

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProcessPanel({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
    const { data: session } = useSession()
    const canManage = can(session, "payroll.manage")

    const [month, setMonth] = useState(String(new Date().getMonth() + 1))
    const [year,  setYear]  = useState(String(new Date().getFullYear()))

    const [sites,          setSites]          = useState<Site[]>([])
    const [siteStatus,     setSiteStatus]     = useState<SiteStatus[]>([])
    const [selectedSiteId, setSelectedSiteId] = useState("")
    const [employees,      setEmployees]      = useState<Employee[]>([])
    const [attRows,        setAttRows]        = useState<Record<string, Partial<AttRow>>>({})

    const [loadingSites,     setLoadingSites]     = useState(true)
    const [loadingStatus,    setLoadingStatus]    = useState(false)
    const [loadingEmployees, setLoadingEmployees] = useState(false)
    const [processing,       setProcessing]       = useState(false)
    const [resetting,        setResetting]        = useState(false)
    const [deleting,         setDeleting]         = useState(false)
    const [fetched,          setFetched]          = useState(false)
    const [search,           setSearch]           = useState("")
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Load sites once
    useEffect(() => {
        fetch("/api/sites?isActive=true")
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setSites(data) })
            .catch(() => toast.error("Failed to load sites"))
            .finally(() => setLoadingSites(false))
    }, [])

    const fetchSiteStatus = useCallback(async () => {
        setLoadingStatus(true)
        try {
            const res = await fetch(`/api/payroll/sites-status?month=${month}&year=${year}`)
            if (res.ok) {
                const data = await res.json()
                if (Array.isArray(data)) setSiteStatus(data)
            }
        } catch {} finally { setLoadingStatus(false) }
    }, [month, year])

    useEffect(() => { fetchSiteStatus() }, [fetchSiteStatus])

    const fetchEmployees = useCallback(async (siteId: string) => {
        setLoadingEmployees(true); setFetched(false); setEmployees([])
        try {
            // Every employee on the site, not just the first page: this grid is
            // what tells /api/payroll/calculate who to pay, so anyone missing
            // here is simply never paid.
            const [empAll, payRes] = await Promise.all([
                fetchAllEmployees<Employee>({ siteId, status: "ACTIVE" }),
                fetch(`/api/payroll?siteId=${siteId}&month=${month}&year=${year}`),
            ])
            setEmployees(empAll.employees)
            if (empAll.truncated) {
                toast.warning(`Loaded ${empAll.employees.length} of ${empAll.total} employees on this site — process in smaller batches so nobody is left out.`)
            }
            if (payRes.ok) {
                const payrolls: any[] = await payRes.json()
                if (Array.isArray(payrolls) && payrolls.length > 0) {
                    const filled: Record<string, Partial<AttRow>> = {}
                    for (const p of payrolls) {
                        filled[p.employeeId] = {
                            monthDays: p.workingDays ?? defaultDays, workedDays: p.presentDays ?? defaultDays,
                            otDays: p.otDays ?? 0, canteenDays: p.canteenDays ?? 0, canteenAmount: p.canteenAmount ?? null,
                            penalty: p.penalty ?? 0, advance: p.advance ?? 0,
                            otherDeductions: p.otherDeductions ?? 0, productionIncentive: p.productionIncentive ?? 0,
                            // Restore what was entered for this saved run — the
                            // standalone Process page does the same; forcing 0
                            // here silently dropped LWF on every reprocess.
                            lwf: p.lwf ?? 0,
                        }
                    }
                    setAttRows(filled)
                }
            }
            setFetched(true)
        } catch (e: any) {
            toast.error(e.message || "Failed to fetch employees")
        } finally { setLoadingEmployees(false) }
    }, [month, year])

    const selectSite = (id: string) => {
        setSelectedSiteId(id); setSearch(""); setAttRows({})
        if (id) fetchEmployees(id)
        else { setEmployees([]); setFetched(false) }
    }

    const setAtt = (empId: string, field: keyof AttRow, value: string) =>
        setAttRows(prev => ({ ...prev, [empId]: { ...prev[empId], [field]: value === "" ? 0 : parseFloat(value) } }))

    /** Blank clears the override back to null; "0" stays a real zero. */
    const setAttOptional = (empId: string, field: keyof AttRow, value: string) =>
        setAttRows(prev => ({ ...prev, [empId]: { ...prev[empId],
            [field]: value.trim() === "" || !Number.isFinite(parseFloat(value)) ? null : parseFloat(value) } }))

    /** Excel cell -> optional amount. An empty cell means "not set", not zero. */
    const optAmount = (v: unknown): number | null => {
        if (v === null || v === undefined) return null
        if (typeof v === "string" && v.trim() === "") return null
        const n = Number(v)
        return Number.isFinite(n) ? n : null
    }

    const handleAttFileUpload = async (file: File) => {
        if (!employees.length) { toast.error("Load employees first"); return }
        try {
            const XLSX = await loadXLSX()
            const buf = await file.arrayBuffer()
            const wb  = XLSX.read(buf, { type: "array" })
            const ws  = wb.Sheets[wb.SheetNames[0]]
            const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" })
            const EMP_ID_VARIANTS = ["employee id","emp id","employeeid","empid","employee code","emp code","empcode","employeecode","employee no","emp no","empno","employee number"]
            const normCell = (v: unknown) => String(v).trim().toLowerCase().replace(/\s+/g, " ")
            const headerIdx = rawRows.findIndex(row => Array.isArray(row) && row.some(cell => EMP_ID_VARIANTS.includes(normCell(cell))))
            if (headerIdx === -1) { toast.error("Cannot find Employee ID column"); return }
            const headers = (rawRows[headerIdx] as unknown[]).map(h => String(h).trim().toUpperCase().replace(/\s+/g, " "))
            const dataRows = rawRows.slice(headerIdx + 1).filter(row => Array.isArray(row) && row.some(cell => String(cell).trim() !== ""))
            const empMap = new Map(employees.map(e => [e.employeeId.trim().toUpperCase(), e.id]))
            const col = (obj: Record<string, unknown>, ...names: string[]) => { for (const n of names) { const v = obj[n.toUpperCase().replace(/\s+/g, " ")]; if (v !== undefined && String(v).trim() !== "") return v } return undefined }
            let matched = 0
            const updates: Record<string, Partial<AttRow>> = {}
            const unmatched: string[] = []
            for (const row of dataRows) {
                const obj: Record<string, unknown> = {}
                headers.forEach((h, i) => { obj[h] = (row as unknown[])[i] ?? "" })
                const empCode = String(col(obj,"EMPLOYEE ID","EMP ID","EMPID","EMPLOYEE CODE","EMP CODE","EMPCODE","EMPLOYEECODE","EMPLOYEE NO","EMP NO","EMPNO") ?? "").trim().toUpperCase()
                if (!empCode || /^(TOTAL|GRAND TOTAL|SR|—|-)$/i.test(empCode)) continue
                const empId = empMap.get(empCode)
                if (!empId) { unmatched.push(empCode); continue }
                const workedDaysRaw = col(obj,"DAYS WORKED","DAYS","PRESENT DAYS","WORKED DAYS","PRESENT","ATTENDANCE","WORKING DAYS","P","ATT DAYS","ATT","PAID DAYS")
                const monthDaysRaw  = col(obj,"MONTH DAYS","MONTH WORKING DAYS","MONTHDAYS","WORKING DAYS IN MONTH","TOTAL DAYS")
                updates[empId] = {
                    monthDays: monthDaysRaw !== undefined && monthDaysRaw !== "" ? Number(monthDaysRaw) : defaultDays,
                    workedDays: workedDaysRaw !== undefined && workedDaysRaw !== "" ? Number(workedDaysRaw) : defaultDays,
                    otDays: Number(col(obj,"OT DAYS","OT HRS","OTDAYS","OTHOURS","OT","OVERTIME","OT HOURS","OVER TIME") ?? 0),
                    otherDeductions: Number(col(obj,"OTHER DEDUCTION","OTHER DED","OTHER DEDUCTIONS","OTHER","OTH DED") ?? 0),
                    // The attendance template has an LWF column — honor it like
                    // the standalone Process page does.
                    lwf: Number(col(obj,"LWF","LABOUR WELFARE FUND") ?? 0),
                    canteenDays: Number(col(obj,"CANTEEN DAYS","CANTEEN","MESS DAYS","FOOD DAYS") ?? 0),
                    canteenAmount: optAmount(col(obj,"CANTEEN AMOUNT","CANTEEN AMT","CANTEEN RS","MESS AMOUNT")),
                    penalty: Number(col(obj,"PENALTY","FINE") ?? 0),
                    advance: Number(col(obj,"ADVANCE","ADV","LOAN") ?? 0),
                    productionIncentive: Number(col(obj,"PRODUCTION INCENTIVE","PROD INCENTIVE","PROD INC","INCENTIVE","PI") ?? 0),
                }
                matched++
            }
            if (matched === 0) { toast.error(unmatched.length > 0 ? `No match — IDs: ${unmatched.slice(0,5).join(", ")}` : "No employees matched"); return }
            setAttRows(prev => ({ ...prev, ...updates }))
            matched === employees.length ? toast.success(`Attendance loaded: ${matched}/${employees.length} matched`) : toast.warning(`Attendance loaded: ${matched}/${employees.length} matched${unmatched.length > 0 ? ` (${unmatched.length} unmatched)` : ""}`)
        } catch (e) { toast.error("Failed to parse attendance file") }
    }

    const handleProcess = async () => {
        if (!selectedSiteId) { toast.error("Select a site"); return }
        if (!employees.length) { toast.error("No employees found for this site"); return }
        setProcessing(true)
        try {
            const attendance = employees.map(emp => {
                const a = attRows[emp.id] ?? {}
                return { employeeId: emp.id, monthDays: a.monthDays ?? defaultDays, workedDays: a.workedDays ?? defaultDays, otDays: a.otDays ?? 0, canteenDays: a.canteenDays ?? 0, canteenAmount: a.canteenAmount ?? null, penalty: a.penalty ?? 0, advance: a.advance ?? 0, otherDeductions: a.otherDeductions ?? 0, productionIncentive: a.productionIncentive ?? 0, lwf: a.lwf ?? 0 }
            })
            const res = await fetch("/api/payroll/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ siteId: selectedSiteId, month: parseInt(month), year: parseInt(year), attendance }),
            })
            if (!res.ok) throw new Error(await res.text())
            const result = await res.json()
            const siteName = sites.find(s => s.id === selectedSiteId)?.name ?? "site"
            if (result.failedCount > 0) {
                toast.warning(`${siteName}: ${result.processedCount}/${result.totalEmployees} processed. ${result.failedCount} failed — retry.`, { duration: 8000 })
                await fetchSiteStatus()
            } else {
                toast.success(`${siteName}: All ${result.processedCount} employees processed ✓`)
                await fetchSiteStatus()
                selectSite("")
                onDone?.()
            }
        } catch (e: any) { toast.error(e.message || "Process failed") }
        finally { setProcessing(false) }
    }

    const handleUnlock = async () => {
        if (!confirm(`Unlock payroll ${MONTHS[parseInt(month)-1]} ${year}? Status will reset to DRAFT.`)) return
        setResetting(true)
        try {
            const res = await fetch(`/api/payroll/reset?month=${month}&year=${year}&action=unlock`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Payroll unlocked — you can now reprocess")
            await fetchSiteStatus()
        } catch (e: any) { toast.error(e.message || "Unlock failed") }
        finally { setResetting(false) }
    }

    const handleDelete = async () => {
        if (!selectedSiteId) return
        const siteName = sites.find(s => s.id === selectedSiteId)?.name ?? "this site"
        if (!confirm(`Delete payroll for "${siteName}" — ${MONTHS[parseInt(month)-1]} ${year}?`)) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/payroll/reset?month=${month}&year=${year}&siteId=${selectedSiteId}&action=delete`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            toast.success(`Payroll deleted for ${siteName}`)
            await fetchSiteStatus(); selectSite("")
        } catch (e: any) { toast.error(e.message || "Delete failed") }
        finally { setDeleting(false) }
    }

    const filtered      = employees.filter(e => !search || `${e.firstName} ${e.lastName} ${e.employeeId}`.toLowerCase().includes(search.toLowerCase()))
    const selectedSite  = sites.find(s => s.id === selectedSiteId)
    const getStatus     = (siteId: string) => siteStatus.find(s => s.siteId === siteId)
    const activeSites   = sites.filter(s => (getStatus(s.id)?.processedCount ?? 0) > 0)
    const approvedCount = employees.filter(e => e.employeeSalary?.status === "APPROVED").length
    const totalGrossEst = employees.reduce((s, e) => {
        const sal = e.employeeSalary
        if (!sal) return s + ((e as any).basicSalary ?? 0)
        const isCALL = sal.complianceType === "CALL"
        return s + sal.basic + sal.da + (isCALL ? 0 : ((sal as any).hra ?? 0)) + sal.washing + sal.conveyance + sal.leaveWithWages + (isCALL ? 0 : (sal.bonus ?? 0)) + sal.otherAllowance
    }, 0)
    const processedSites = siteStatus.filter(s => (s.processedCount ?? 0) > 0).length

    return (
        <div style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--surface)", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.07)" }}>

            {/* Panel Header */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Play size={15} style={{ color: "#7c3aed" }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Process Payroll — Site Wise</span>
                    </div>

                    {/* Month / Year inline */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                        <select value={month} onChange={e => { setMonth(e.target.value); selectSite("") }}
                            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }}>
                            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                        </select>
                        <select value={year} onChange={e => { setYear(e.target.value); selectSite("") }}
                            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }}>
                            {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <button onClick={fetchSiteStatus}
                            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "none", cursor: "pointer", display: "flex", alignItems: "center" }}>
                            <RefreshCw size={12} style={{ color: "var(--text3)" }} className={loadingStatus ? "animate-spin" : ""} />
                        </button>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>{processedSites}/{sites.length} sites done</span>
                    </div>
                </div>
                <button onClick={onClose}
                    style={{ padding: "5px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}>
                    <X size={15} style={{ color: "var(--text3)" }} />
                </button>
            </div>

            {/* Two-panel body */}
            <div style={{ display: "flex", gap: 0, minHeight: 400 }}>

                {/* ── Left: Site list ── */}
                <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid var(--border)", overflowY: "auto", maxHeight: 600 }}>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface2)" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text2)" }}>Sites</span>
                        <span style={{ fontSize: 10, color: "var(--text3)", background: "var(--border)", borderRadius: 10, padding: "1px 7px" }}>{activeSites.length}</span>
                    </div>
                    {loadingSites ? (
                        <div style={{ padding: 24, textAlign: "center" }}><Loader2 size={16} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} /></div>
                    ) : (
                        <>
                            {/* All sites */}
                            <div onClick={() => selectSite("")}
                                style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)", background: !selectedSiteId ? "var(--accent-light)" : "transparent", borderLeft: !selectedSiteId ? "3px solid var(--accent)" : "3px solid transparent" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                    <Building2 size={12} style={{ color: !selectedSiteId ? "var(--accent)" : "var(--text3)" }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: !selectedSiteId ? "var(--accent)" : "var(--text2)" }}>All Sites</span>
                                </div>
                                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2, marginLeft: 19 }}>{processedSites} / {sites.length} processed</div>
                            </div>
                            {/* Individual sites */}
                            {sites.map(site => {
                                const st = getStatus(site.id); const isDone = (st?.processedCount ?? 0) > 0; const isSel = selectedSiteId === site.id
                                return (
                                    <div key={site.id} onClick={() => selectSite(site.id)}
                                        style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)", background: isSel ? "var(--accent-light)" : "transparent", borderLeft: isSel ? "3px solid var(--accent)" : "3px solid transparent" }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                                                <MapPin size={11} style={{ color: isSel ? "var(--accent)" : "var(--text3)", flexShrink: 0 }} />
                                                <span style={{ fontSize: 12, fontWeight: 600, color: isSel ? "var(--accent)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{site.name}</span>
                                            </div>
                                            {isDone ? <CheckCircle2 size={12} style={{ color: "#16a34a", flexShrink: 0 }} /> : <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#d1d5db", flexShrink: 0 }} />}
                                        </div>
                                        <div style={{ fontSize: 10, marginTop: 2, marginLeft: 16, color: isDone ? "#16a34a" : "#f59e0b", fontWeight: 600 }}>
                                            {isDone ? `${st!.processedCount} processed` : "Pending"}
                                        </div>
                                    </div>
                                )
                            })}
                        </>
                    )}
                </div>

                {/* ── Right: Content ── */}
                <div style={{ flex: 1, minWidth: 0, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>

                    {!selectedSiteId ? (
                        // Overview grid
                        <>
                            <p style={{ fontSize: 13, color: "var(--text3)", margin: 0 }}>Select a site from the left to enter attendance and process payroll.</p>
                            {activeSites.length > 0 && (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                                    {activeSites.map(site => {
                                        const st = getStatus(site.id); const isDone = (st?.processedCount ?? 0) > 0
                                        return (
                                            <div key={site.id} onClick={() => selectSite(site.id)}
                                                style={{ padding: "12px 14px", borderRadius: 10, cursor: "pointer", border: `1px solid ${isDone ? "#86efac" : "var(--border)"}`, background: isDone ? "#f0fdf4" : "var(--surface)" }}
                                                onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.07)"}
                                                onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                                        <MapPin size={12} style={{ color: isDone ? "#16a34a" : "var(--accent)", flexShrink: 0 }} />
                                                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{site.name}</span>
                                                    </div>
                                                    <span style={{ padding: "2px 6px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: isDone ? "#dcfce7" : "#fef9c3", color: isDone ? "#15803d" : "#854d0e", flexShrink: 0 }}>{isDone ? "✓" : "Pending"}</span>
                                                </div>
                                                <div style={{ marginTop: 8, fontSize: 11, color: isDone ? "#15803d" : "var(--text3)", fontWeight: 600 }}>
                                                    {isDone ? `${st!.processedCount} employees` : "Click to process →"}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                            {activeSites.length === 0 && !loadingSites && (
                                <div style={{ padding: 40, textAlign: "center", border: "1px solid var(--border)", borderRadius: 10 }}>
                                    <MapPin size={24} style={{ color: "var(--text3)", opacity: 0.3, margin: "0 auto 8px" }} />
                                    <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>No sites found. Make sure sites are active.</p>
                                </div>
                            )}
                        </>
                    ) : (
                        // Site employee table
                        <>
                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleAttFileUpload(f); e.target.value = "" }} />

                            {/* Site action bar */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: "10px 14px", background: "var(--surface2)", borderRadius: 10, border: "1px solid var(--border)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                    <MapPin size={13} style={{ color: "var(--accent)" }} />
                                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{selectedSite?.name}</span>
                                    {selectedSite?.code && <span style={{ fontSize: 10, color: "var(--text3)" }}>{selectedSite.code}</span>}
                                    {getStatus(selectedSiteId) && <span style={{ padding: "2px 7px", borderRadius: 20, background: "#dcfce7", color: "#15803d", fontSize: 10, fontWeight: 700 }}>✓ Previously Processed</span>}
                                </div>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    <button onClick={() => fileInputRef.current?.click()} disabled={!fetched}
                                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "none", fontSize: 11, color: "var(--text2)", cursor: "pointer", opacity: fetched ? 1 : 0.5 }}>
                                        <FileUp size={11} /> Upload Attendance
                                    </button>
                                    <button onClick={() => fetchEmployees(selectedSiteId)} disabled={loadingEmployees}
                                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "none", fontSize: 11, color: "var(--text2)", cursor: "pointer" }}>
                                        <RefreshCw size={11} className={loadingEmployees ? "animate-spin" : ""} /> Refresh
                                    </button>
                                    {getStatus(selectedSiteId) && (
                                        <>
                                            <button onClick={handleUnlock} disabled={resetting || deleting || !canManage} title={canManage ? undefined : "Requires payroll manage permission"}
                                                style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: "1px solid #f59e0b", background: "#fffbeb", fontSize: 11, color: "#b45309", fontWeight: 600, cursor: "pointer", opacity: (resetting||deleting) ? 0.6 : 1 }}>
                                                {resetting ? <Loader2 size={11} className="animate-spin" /> : <Unlock size={11} />}
                                                {resetting ? "Unlocking…" : "Unlock"}
                                            </button>
                                            <button onClick={handleDelete} disabled={resetting || deleting || !canManage} title={canManage ? undefined : "Requires payroll manage permission"}
                                                style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: "1px solid #fca5a5", background: "#fef2f2", fontSize: 11, color: "#dc2626", fontWeight: 600, cursor: "pointer", opacity: (resetting||deleting) ? 0.6 : 1 }}>
                                                {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                                {deleting ? "Deleting…" : "Delete"}
                                            </button>
                                        </>
                                    )}
                                    <button onClick={handleProcess} disabled={processing || !fetched || employees.length === 0 || !canManage} title={canManage ? undefined : "Requires payroll manage permission"}
                                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 7, border: "none", background: "#16a34a", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: (processing||!fetched) ? 0.6 : 1 }}>
                                        {processing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                                        {processing ? "Processing…" : "Process Payroll"}
                                    </button>
                                </div>
                            </div>

                            {/* Mini stats */}
                            {fetched && (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                                    {[
                                        { label: "Total Staff",     value: String(employees.length),                 color: "#3b82f6" },
                                        { label: "Salary Approved", value: `${approvedCount}/${employees.length}`,   color: approvedCount < employees.length ? "#f59e0b" : "#16a34a" },
                                        { label: "Est. Gross",      value: fmt(totalGrossEst),                        color: "#0369a1" },
                                        { label: "Default Days",    value: String(defaultDays),                       color: "#7c3aed" },
                                    ].map(s => (
                                        <div key={s.label} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
                                            <p style={{ fontSize: 9, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", margin: 0 }}>{s.label}</p>
                                            <p style={{ fontSize: 13, fontWeight: 700, color: s.color, margin: "2px 0 0 0" }}>{s.value}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Employee table */}
                            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                                <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                                    <Search size={12} style={{ color: "var(--text3)", flexShrink: 0 }} />
                                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…"
                                        style={{ flex: 1, border: "none", outline: "none", fontSize: 12, background: "transparent", color: "var(--text)" }} />
                                    {fetched && <span style={{ fontSize: 10, color: "var(--text3)", whiteSpace: "nowrap" }}>{filtered.length} / {employees.length}</span>}
                                </div>
                                <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
                                    <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                        <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
                                            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                                                <th colSpan={3} style={{ ...thGroup, color: "#1B3A6B", background: "#DCE6F1" }}>IDENTIFICATION</th>
                                                <th colSpan={11} style={{ ...thGroup, color: "#1B3A6B", background: "#D6E4F5" }}>ATTENDANCE (editable)</th>
                                                <th colSpan={9} style={{ ...thGroup, color: "#1D6B3E", background: "#D5EDDA" }}>SALARY STRUCTURE</th>
                                                <th rowSpan={2} style={{ ...th, background: "#FFF8E1", color: "#7B5E00" }}>Status</th>
                                            </tr>
                                            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                                                <th style={th}>#</th><th style={th}>Emp Code</th><th style={{ ...th, textAlign: "left" }}>Name</th>
                                                <th style={{ ...th, background: "#eff6ff" }}>Month<br/>Days</th>
                                                <th style={{ ...th, background: "#eff6ff" }}>LOP</th>
                                                <th style={{ ...th, background: "#eff6ff" }}>Days</th>
                                                <th style={{ ...th, background: "#eff6ff" }}>OT<br/>Days</th>
                                                <th style={{ ...th, background: "#eff6ff" }}>OT<br/>Hrs</th>
                                                <th style={{ ...th, background: "#eff6ff" }}>Canteen<br/>Days</th>
                                                <th style={{ ...th, background: "#eff6ff" }}>Canteen ₹<br/><span style={{ fontWeight: 400, fontSize: 9 }}>blank = days×rate</span></th>
                                                <th style={{ ...th, background: "#eff6ff" }}>Other<br/>Ded</th>
                                                <th style={{ ...th, background: "#eff6ff" }}>LWF</th>
                                                <th style={{ ...th, background: "#eff6ff" }}>Penalty</th>
                                                <th style={{ ...th, background: "#eff6ff" }}>Advance</th>
                                                <th style={{ ...th, background: "#eff6ff" }}>Prod<br/>Inc</th>
                                                <th style={{ ...th, background: "#f0fdf4" }}>BASIC</th>
                                                <th style={{ ...th, background: "#f0fdf4" }}>DA</th>
                                                <th style={{ ...th, background: "#f0fdf4" }}>HRA</th>
                                                <th style={{ ...th, background: "#f0fdf4" }}>Washing</th>
                                                <th style={{ ...th, background: "#f0fdf4" }}>Convence</th>
                                                <th style={{ ...th, background: "#f0fdf4" }}>LWW</th>
                                                <th style={{ ...th, background: "#f0fdf4" }}>BONUS</th>
                                                <th style={{ ...th, background: "#f0fdf4" }}>Other</th>
                                                <th style={{ ...th, background: "#dcfce7", color: "#15803d" }}>GROSS</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {loadingEmployees ? (
                                                <tr><td colSpan={24} style={{ padding: "40px", textAlign: "center" }}><Loader2 size={18} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} /></td></tr>
                                            ) : !fetched ? (
                                                <tr><td colSpan={24} style={{ padding: "24px", textAlign: "center", color: "var(--text3)", fontSize: 12 }}>Loading…</td></tr>
                                            ) : filtered.length === 0 ? (
                                                <tr><td colSpan={24} style={{ padding: "32px", textAlign: "center" }}>
                                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--text3)", fontSize: 12 }}>
                                                        <Users size={22} style={{ opacity: 0.2 }} />
                                                        {employees.length === 0 ? "No active employees at this site" : "No results match your search"}
                                                    </div>
                                                </td></tr>
                                            ) : filtered.map((emp, i) => {
                                                const sal = emp.employeeSalary; const att = attRows[emp.id] ?? {}
                                                const isCALL = sal?.complianceType === "CALL"
                                                const hra = sal && !isCALL ? ((sal as any).hra ?? 0) : 0
                                                const bonus = sal && !isCALL ? ((sal as any).bonus ?? 0) : 0
                                                const fullGross = sal ? sal.basic + sal.da + hra + sal.washing + sal.conveyance + sal.leaveWithWages + bonus + sal.otherAllowance : 0
                                                const approved = sal?.status === "APPROVED"
                                                const monthDays = att.monthDays ?? defaultDays; const workedDays = att.workedDays ?? defaultDays
                                                const lop = monthDays - workedDays; const otDays = att.otDays ?? 0; const otHrs = Math.round(otDays * 8 * 100) / 100
                                                return (
                                                    <tr key={emp.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                                                        <td style={td}>{i+1}</td>
                                                        <td style={{ ...td, color: "var(--accent)", fontWeight: 700 }}>{emp.employeeId}</td>
                                                        <td style={{ ...td, textAlign: "left" }}>
                                                            <div style={{ fontWeight: 600, color: "var(--text)" }}>{emp.firstName} {emp.lastName}</div>
                                                            <div style={{ fontSize: 10, color: "var(--text3)" }}>{emp.designation || "—"}</div>
                                                        </td>
                                                        <td style={{ ...td, background: "#eff6ff" }}><input type="number" min={1} max={31} value={att.monthDays ?? defaultDays} onChange={e => setAtt(emp.id, "monthDays", e.target.value)} style={attInput} /></td>
                                                        <td style={{ ...td, background: "#eff6ff", color: lop < 0 ? "#16a34a" : lop > 0 ? "#dc2626" : "var(--text3)", fontWeight: 700, fontSize: 10 }}>{lop}</td>
                                                        <td style={{ ...td, background: "#eff6ff" }}><input type="number" min={0} max={31} value={att.workedDays ?? defaultDays} onChange={e => setAtt(emp.id, "workedDays", e.target.value)} style={attInput} /></td>
                                                        <td style={{ ...td, background: "#eff6ff" }}><input type="number" min={0} step="0.01" value={att.otDays ?? 0} onChange={e => setAtt(emp.id, "otDays", e.target.value)} style={attInput} /></td>
                                                        <td style={{ ...td, background: "#eff6ff", color: "var(--text3)", fontSize: 10 }}>{otHrs}</td>
                                                        <td style={{ ...td, background: "#eff6ff" }}><input type="number" min={0} value={att.canteenDays ?? 0} onChange={e => setAtt(emp.id, "canteenDays", e.target.value)} style={attInput} /></td>
                                                        <td style={{ ...td, background: "#eff6ff" }}><input type="number" min={0} placeholder="auto" value={att.canteenAmount ?? ""} onChange={e => setAttOptional(emp.id, "canteenAmount", e.target.value)} style={attInput} /></td>
                                                        <td style={{ ...td, background: "#eff6ff" }}><input type="number" min={0} value={att.otherDeductions ?? 0} onChange={e => setAtt(emp.id, "otherDeductions", e.target.value)} style={attInput} /></td>
                                                        <td style={{ ...td, background: "#eff6ff" }}><input type="number" min={0} value={att.lwf ?? 0} onChange={e => setAtt(emp.id, "lwf", e.target.value)} style={attInput} /></td>
                                                        <td style={{ ...td, background: "#eff6ff" }}><input type="number" min={0} value={att.penalty ?? 0} onChange={e => setAtt(emp.id, "penalty", e.target.value)} style={attInput} /></td>
                                                        <td style={{ ...td, background: "#eff6ff" }}><input type="number" min={0} value={att.advance ?? 0} onChange={e => setAtt(emp.id, "advance", e.target.value)} style={attInput} /></td>
                                                        <td style={{ ...td, background: "#eff6ff" }}><input type="number" min={0} value={att.productionIncentive ?? 0} onChange={e => setAtt(emp.id, "productionIncentive", e.target.value)} style={attInput} /></td>
                                                        <td style={{ ...td, background: "#f0fdf4" }}>{sal ? fmt(sal.basic) : "—"}</td>
                                                        <td style={{ ...td, background: "#f0fdf4" }}>{sal ? fmt(sal.da) : "—"}</td>
                                                        <td style={{ ...td, background: "#f0fdf4", color: "#1d4ed8" }}>{sal ? fmt(hra) : "—"}</td>
                                                        <td style={{ ...td, background: "#f0fdf4" }}>{sal ? fmt(sal.washing) : "—"}</td>
                                                        <td style={{ ...td, background: "#f0fdf4" }}>{sal ? fmt(sal.conveyance) : "—"}</td>
                                                        <td style={{ ...td, background: "#f0fdf4" }}>{sal ? fmt(sal.leaveWithWages) : "—"}</td>
                                                        <td style={{ ...td, background: "#f0fdf4", color: "#1d4ed8" }}>{sal ? fmt(bonus) : "—"}</td>
                                                        <td style={{ ...td, background: "#f0fdf4" }}>{sal ? fmt(sal.otherAllowance) : "—"}</td>
                                                        <td style={{ ...td, background: "#dcfce7", fontWeight: 700, color: "#15803d" }}>{fmt(fullGross)}</td>
                                                        <td style={td}>
                                                            <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                                                                <span style={{ padding: "2px 6px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: approved ? "#dcfce7" : "#fef9c3", color: approved ? "#15803d" : "#854d0e" }}>{approved ? "Approved" : sal ? "Pending" : "No Salary"}</span>
                                                                <span style={{ padding: "1px 5px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: attRows[emp.id] ? "#dbeafe" : "#f3f4f6", color: attRows[emp.id] ? "#1d4ed8" : "#9ca3af" }}>{attRows[emp.id] ? "✓ Att" : "Default"}</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                        {fetched && employees.length > 0 && (
                                            <tfoot>
                                                <tr style={{ background: "var(--surface2)", borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                                                    <td colSpan={3} style={{ ...td, textAlign: "right", fontSize: 10, color: "var(--text3)", textTransform: "uppercase" }}>Total ({employees.length})</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{employees.reduce((s, e) => s + (attRows[e.id]?.monthDays ?? defaultDays), 0)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{employees.reduce((s, e) => s + ((attRows[e.id]?.monthDays ?? defaultDays) - (attRows[e.id]?.workedDays ?? defaultDays)), 0)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{employees.reduce((s, e) => s + (attRows[e.id]?.workedDays ?? defaultDays), 0)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{Math.round(employees.reduce((s, e) => s + (attRows[e.id]?.otDays ?? 0), 0) * 1000) / 1000}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{Math.round(employees.reduce((s, e) => s + (attRows[e.id]?.otDays ?? 0) * 8, 0) * 100) / 100}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{employees.reduce((s, e) => s + (attRows[e.id]?.canteenDays ?? 0), 0)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{employees.reduce((s, e) => s + (attRows[e.id]?.canteenAmount ?? 0), 0) || "—"}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{employees.reduce((s, e) => s + (attRows[e.id]?.otherDeductions ?? 0), 0)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{employees.reduce((s, e) => s + (attRows[e.id]?.lwf ?? 0), 0)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{employees.reduce((s, e) => s + (attRows[e.id]?.penalty ?? 0), 0)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{employees.reduce((s, e) => s + (attRows[e.id]?.advance ?? 0), 0)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{employees.reduce((s, e) => s + (attRows[e.id]?.productionIncentive ?? 0), 0)}</td>
                                                    <td style={{ ...td, background: "#f0fdf4" }}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.basic ?? 0), 0))}</td>
                                                    <td style={{ ...td, background: "#f0fdf4" }}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.da ?? 0), 0))}</td>
                                                    <td style={{ ...td, background: "#f0fdf4" }}>{fmt(employees.reduce((s, e) => { const sa = e.employeeSalary as any; if (!sa || sa.complianceType === "CALL") return s; return s + (sa.hra ?? 0) }, 0))}</td>
                                                    <td style={{ ...td, background: "#f0fdf4" }}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.washing ?? 0), 0))}</td>
                                                    <td style={{ ...td, background: "#f0fdf4" }}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.conveyance ?? 0), 0))}</td>
                                                    <td style={{ ...td, background: "#f0fdf4" }}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.leaveWithWages ?? 0), 0))}</td>
                                                    <td style={{ ...td, background: "#f0fdf4" }}>{fmt(employees.reduce((s, e) => { const sa = e.employeeSalary as any; if (!sa || sa.complianceType === "CALL") return s; return s + (sa.bonus ?? 0) }, 0))}</td>
                                                    <td style={{ ...td, background: "#f0fdf4" }}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.otherAllowance ?? 0), 0))}</td>
                                                    <td style={{ ...td, background: "#dcfce7", color: "#15803d" }}>{fmt(totalGrossEst)}</td>
                                                    <td />
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>

                            {/* Banners */}
                            {fetched && approvedCount < employees.length && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde047" }}>
                                    <AlertCircle size={12} style={{ color: "#a16207", flexShrink: 0 }} />
                                    <span style={{ fontSize: 11, color: "#a16207" }}>{employees.length - approvedCount} employee(s) have no approved salary — basic salary will be used.</span>
                                </div>
                            )}
                            {fetched && employees.length > 0 && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#dcfce7", border: "1px solid #86efac" }}>
                                    <CheckCircle2 size={12} style={{ color: "#15803d", flexShrink: 0 }} />
                                    <span style={{ fontSize: 11, color: "#15803d" }}>{employees.length} employees ready. Edit attendance inline, then click <b>Process Payroll</b>.</span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
