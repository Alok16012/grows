"use client"
import { Suspense } from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import {
    Loader2, Play, RefreshCw, ChevronRight,
    AlertCircle, CheckCircle2, Users, MapPin, Building2, Search,
    Unlock, Trash2, FileUp
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
type Site = { id: string; name: string; code?: string; city?: string }
type SiteStatus = { siteId: string | null; processedCount: number }

type Employee = {
    id: string; employeeId: string; firstName: string; lastName: string
    designation?: string; gender?: string
    employeeSalary?: {
        basic: number; da: number; washing: number; conveyance: number
        leaveWithWages: number; otherAllowance: number
        complianceType?: string; status?: string
    } | null
}

type AttRow = {
    monthDays: number; workedDays: number; otDays: number
    canteenDays: number; penalty: number; advance: number
    otherDeductions: number; productionIncentive: number; lwf: number
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const fmt = (n: number) => n ? "₹" + Math.round(n).toLocaleString("en-IN") : "—"

function ProcessPayrollPage() {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [month, setMonth] = useState(String(searchParams.get("month") ?? new Date().getMonth() + 1))
    const [year,  setYear]  = useState(String(searchParams.get("year")  ?? new Date().getFullYear()))

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

    // Load site processing status for current month/year
    const fetchSiteStatus = useCallback(async () => {
        setLoadingStatus(true)
        try {
            const res = await fetch(`/api/payroll/sites-status?month=${month}&year=${year}`)
            if (res.ok) {
                const data = await res.json()
                if (Array.isArray(data)) setSiteStatus(data)
            }
        } catch {} finally {
            setLoadingStatus(false)
        }
    }, [month, year])

    useEffect(() => { fetchSiteStatus() }, [fetchSiteStatus])

    // Load employees when site selected
    const fetchEmployees = useCallback(async (siteId: string) => {
        setLoadingEmployees(true)
        setFetched(false)
        setEmployees([])
        try {
            const res = await fetch(`/api/employees?siteId=${siteId}&status=ACTIVE`)
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            setEmployees(Array.isArray(data) ? data : [])
            setFetched(true)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to fetch employees")
        } finally {
            setLoadingEmployees(false)
        }
    }, [])

    const selectSite = (id: string) => {
        setSelectedSiteId(id)
        setSearch("")
        setAttRows({})
        if (id) fetchEmployees(id)
        else { setEmployees([]); setFetched(false) }
    }

    const defaultDays = new Date(parseInt(year), parseInt(month), 0).getDate()

    const setAtt = (empId: string, field: keyof AttRow, value: string) => {
        setAttRows(prev => ({ ...prev, [empId]: { ...prev[empId], [field]: parseFloat(value) || 0 } }))
    }

    const handleAttFileUpload = async (file: File) => {
        if (!employees.length) { toast.error("Load employees first"); return }
        try {
            const buf = await file.arrayBuffer()
            const wb  = XLSX.read(buf, { type: "array" })
            const ws  = wb.Sheets[wb.SheetNames[0]]
            const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" })
            // Find header row — look for "Employee ID" or "EMP ID" (case-insensitive)
            const headerIdx = rawRows.findIndex(row =>
                Array.isArray(row) && row.some(cell =>
                    ["employee id", "emp id", "employeeid", "empid"].includes(String(cell).trim().toLowerCase())
                )
            )
            if (headerIdx === -1) { toast.error("Cannot find 'Employee ID' column in file"); return }
            // Normalise headers to UPPERCASE for case-insensitive matching
            const headers = (rawRows[headerIdx] as unknown[]).map(h => String(h).trim().toUpperCase())
            const dataRows = rawRows.slice(headerIdx + 1).filter(row =>
                Array.isArray(row) && row.some(cell => String(cell).trim() !== "")
            )
            const empMap = new Map(employees.map(e => [e.employeeId.toUpperCase(), e.id]))
            // Helper: get value from normalised obj by multiple possible column names
            const col = (obj: Record<string, unknown>, ...names: string[]) => {
                for (const n of names) {
                    const v = obj[n.toUpperCase()]
                    if (v !== undefined && v !== "") return v
                }
                return undefined
            }
            let matched = 0
            const updates: Record<string, Partial<AttRow>> = {}
            for (const row of dataRows) {
                const obj: Record<string, unknown> = {}
                headers.forEach((h, i) => { obj[h] = (row as unknown[])[i] ?? "" })
                const empCode = String(col(obj, "Employee ID", "EMP ID", "Emp ID", "EMPID") ?? "").trim().toUpperCase()
                const empId   = empMap.get(empCode)
                if (!empId) continue
                const workedDaysVal = Number(col(obj, "DAYS", "Days", "PRESENT DAYS", "WORKED DAYS", "PRESENT") ?? defaultDays)
                updates[empId] = {
                    monthDays:           defaultDays,   // always total calendar working days — NOT from Excel
                    workedDays:          workedDaysVal || defaultDays,
                    otDays:              Number(col(obj, "OT DAYS", "OT Days", "OT HRS", "OT Hrs", "OTDAYS", "OTHOURS") ?? 0),
                    otherDeductions:     Number(col(obj, "OTHER DEDUCTION", "Other Deduction", "OTHER DED") ?? 0),
                    lwf:                 Number(col(obj, "LWF") ?? 0),
                    canteenDays:         Number(col(obj, "CANTEEN DAYS", "Canteen Days", "CANTEEN") ?? 0),
                    penalty:             Number(col(obj, "PENALTY", "Penalty") ?? 0),
                    advance:             Number(col(obj, "ADVANCE", "Advance") ?? 0),
                    productionIncentive: Number(col(obj, "PRODUCTION INCENTIVE", "Production Incentive", "PROD INCENTIVE") ?? 0),
                }
                matched++
            }
            if (matched === 0) {
                toast.error("No employees matched — check Employee IDs in file match the system")
                return
            }
            setAttRows(prev => ({ ...prev, ...updates }))
            toast.success(`Attendance loaded: ${matched}/${employees.length} employees matched`)
        } catch (e) {
            console.error("[ATT_UPLOAD]", e)
            toast.error("Failed to parse attendance file — check format")
        }
    }

    const handleProcess = async () => {
        if (!selectedSiteId) { toast.error("Select a site"); return }
        if (!employees.length) { toast.error("No employees found for this site"); return }

        setProcessing(true)
        try {
            const attendance = employees.map(emp => {
                const a = attRows[emp.id] ?? {}
                return {
                    employeeId:          emp.id,
                    monthDays:           a.monthDays           ?? defaultDays,
                    workedDays:          a.workedDays          ?? defaultDays,
                    otDays:              a.otDays              ?? 0,
                    canteenDays:         a.canteenDays         ?? 0,
                    penalty:             a.penalty             ?? 0,
                    advance:             a.advance             ?? 0,
                    otherDeductions:     a.otherDeductions     ?? 0,
                    productionIncentive: a.productionIncentive ?? 0,
                    lwf:                 a.lwf                 ?? 0,
                }
            })

            const res = await fetch("/api/payroll/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ siteId: selectedSiteId, month: parseInt(month), year: parseInt(year), attendance })
            })
            if (!res.ok) throw new Error(await res.text())
            const result = await res.json()
            const siteName = sites.find(s => s.id === selectedSiteId)?.name ?? "site"
            toast.success(`${siteName}: Processed ${result.processedCount} employees`)
            await fetchSiteStatus()
            selectSite("")
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Process failed")
        } finally {
            setProcessing(false)
        }
    }

    const handleUnlock = async () => {
        if (!confirm(`Unlock payroll ${MONTHS[parseInt(month)-1]} ${year}? Status will reset to DRAFT and can be reprocessed.`)) return
        setResetting(true)
        try {
            const res = await fetch(`/api/payroll/reset?month=${month}&year=${year}&action=unlock`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Payroll unlocked — you can now reprocess")
            await fetchSiteStatus()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Unlock failed")
        } finally { setResetting(false) }
    }

    const handleDelete = async () => {
        if (!selectedSiteId) return
        const siteName = sites.find(s => s.id === selectedSiteId)?.name ?? "this site"
        if (!confirm(`Delete all payroll records for "${siteName}" — ${MONTHS[parseInt(month)-1]} ${year}? This cannot be undone.`)) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/payroll/reset?month=${month}&year=${year}&siteId=${selectedSiteId}&action=delete`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            toast.success(`Payroll deleted for ${siteName}`)
            await fetchSiteStatus()
            selectSite("")
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Delete failed")
        } finally { setDeleting(false) }
    }

    const filtered       = employees.filter(e => !search || `${e.firstName} ${e.lastName} ${e.employeeId}`.toLowerCase().includes(search.toLowerCase()))
    const selectedSite   = sites.find(s => s.id === selectedSiteId)
    const getStatus      = (siteId: string) => siteStatus.find(s => s.siteId === siteId)
    const activeSites    = sites.filter(s => (getStatus(s.id)?.processedCount ?? 0) > 0)
    const approvedCount  = employees.filter(e => e.employeeSalary?.status === "APPROVED").length
    const totalGrossEst  = employees.reduce((s, e) => {
        const sal = e.employeeSalary
        const basic = sal?.status === "APPROVED" ? sal.basic : (e as any).basicSalary ?? 0
        if (sal?.status === "APPROVED") {
            const isCALL = sal.complianceType === "CALL"
            const hra    = isCALL ? 0 : Math.round((sal.basic + sal.da) * 0.05)
            const bonus  = isCALL ? 0 : Math.round(7000 / 12)
            return s + sal.basic + sal.da + hra + sal.washing + sal.conveyance + sal.leaveWithWages + bonus + sal.otherAllowance
        }
        return s + basic
    }, 0)
    const processedSites = siteStatus.filter(s => (s.processedCount ?? 0) > 0).length

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 32 }}>

            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)" }}>
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll")}>Payroll</span>
                <ChevronRight size={11} />
                <span style={{ fontWeight: 600, color: "var(--text2)" }}>Process Payroll</span>
            </div>

            {/* Title */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>Process Payroll — Site Wise</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {loadingStatus && <Loader2 size={13} className="animate-spin" style={{ color: "var(--text3)" }} />}
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>{processedSites}/{sites.length} sites done</span>
                </div>
            </div>

            {/* Stepper */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, overflowX: "auto", whiteSpace: "nowrap", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
                {["Upload Attendance", "Process Payroll", "Wage Sheet", "Compliance Reports", "Lock Payroll"].map((s, i) => (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7,
                            background: i === 1 ? "var(--accent-light)" : "transparent",
                            color: i === 1 ? "var(--accent)" : "var(--text3)", fontSize: 12, fontWeight: i === 1 ? 700 : 400 }}>
                            <div style={{ width: 18, height: 18, borderRadius: 4, background: i === 1 ? "var(--accent)" : "var(--border)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: i === 1 ? "#fff" : "var(--text3)", fontSize: 10, fontWeight: 700 }}>{i + 1}</div>
                            {s}
                        </div>
                        {i < 4 && <ChevronRight size={11} style={{ color: "var(--text3)", opacity: 0.3 }} />}
                    </div>
                ))}
            </div>

            {/* Month / Year row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 16px" }}>
                <span style={labelSt}>Month</span>
                <select value={month} onChange={e => { setMonth(e.target.value); selectSite("") }} style={selectSt}>
                    {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
                <span style={labelSt}>Year</span>
                <select value={year} onChange={e => { setYear(e.target.value); selectSite("") }} style={selectSt}>
                    {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text3)" }}>
                    <span>{MONTHS[parseInt(month) - 1]} {year}</span>
                    <button onClick={fetchSiteStatus} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "none", cursor: "pointer", display: "flex" }}>
                        <RefreshCw size={12} style={{ color: "var(--text3)" }} />
                    </button>
                </div>
            </div>

            {/* Two-panel layout */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

                {/* ── LEFT: Site list ──────────────────────────────────── */}
                <div style={{ width: 256, flexShrink: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)" }}>Sites</span>
                        <span style={{ fontSize: 10, color: "var(--text3)", background: "var(--surface2)", borderRadius: 10, padding: "2px 7px" }}>{activeSites.length}</span>
                    </div>

                    <div style={{ overflowY: "auto", maxHeight: 560 }}>
                        {loadingSites ? (
                            <div style={{ padding: 24, textAlign: "center" }}>
                                <Loader2 size={16} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} />
                            </div>
                        ) : (
                            <>
                                {/* All Sites overview option */}
                                <div onClick={() => selectSite("")}
                                    style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                                        background: !selectedSiteId ? "var(--accent-light)" : "transparent",
                                        borderLeft: !selectedSiteId ? "3px solid var(--accent)" : "3px solid transparent" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                        <Building2 size={13} style={{ color: !selectedSiteId ? "var(--accent)" : "var(--text3)" }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: !selectedSiteId ? "var(--accent)" : "var(--text2)" }}>All Sites</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2, marginLeft: 20 }}>
                                        {processedSites} / {activeSites.length} processed
                                    </div>
                                </div>

                                {/* Individual sites */}
                                {activeSites.map(site => {
                                    const st      = getStatus(site.id)
                                    const isDone  = (st?.processedCount ?? 0) > 0
                                    const isSel   = selectedSiteId === site.id
                                    return (
                                        <div key={site.id} onClick={() => selectSite(site.id)}
                                            style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                                                background: isSel ? "var(--accent-light)" : "transparent",
                                                borderLeft: isSel ? "3px solid var(--accent)" : "3px solid transparent" }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                                    <MapPin size={12} style={{ color: isSel ? "var(--accent)" : "var(--text3)", flexShrink: 0 }} />
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: isSel ? "var(--accent)" : "var(--text)",
                                                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                        {site.name}
                                                    </span>
                                                </div>
                                                {isDone
                                                    ? <CheckCircle2 size={13} style={{ color: "#16a34a", flexShrink: 0 }} />
                                                    : <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#d1d5db", flexShrink: 0 }} />}
                                            </div>
                                            <div style={{ fontSize: 10, marginTop: 2, marginLeft: 18, display: "flex", gap: 6 }}>
                                                {site.code && <span style={{ color: "var(--text3)" }}>{site.code}</span>}
                                                {isDone
                                                    ? <span style={{ color: "#16a34a", fontWeight: 600 }}>{st!.processedCount} processed</span>
                                                    : <span style={{ color: "#f59e0b", fontWeight: 600 }}>Pending</span>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Overview or employee table ────────────────── */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>

                    {!selectedSiteId ? (
                        /* ── Overview: grid of site cards ── */
                        <>
                            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
                                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 3px 0" }}>
                                    {MONTHS[parseInt(month) - 1]} {year} — Payroll Overview
                                </p>
                                <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>
                                    Select a site from the left panel to enter attendance and process payroll.
                                </p>
                            </div>

                            {activeSites.length === 0 && !loadingSites ? (
                                <div style={{ padding: 40, textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
                                    <MapPin size={28} style={{ color: "var(--text3)", opacity: 0.3, margin: "0 auto 8px" }} />
                                    <p style={{ fontSize: 13, color: "var(--text3)", margin: 0 }}>No attendance uploaded yet for this period</p>
                                </div>
                            ) : (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
                                    {activeSites.map(site => {
                                        const st     = getStatus(site.id)
                                        const isDone = (st?.processedCount ?? 0) > 0
                                        return (
                                            <div key={site.id} onClick={() => selectSite(site.id)}
                                                style={{ padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                                                    border: `1px solid ${isDone ? "#86efac" : "var(--border)"}`,
                                                    background: isDone ? "#f0fdf4" : "var(--surface)" }}
                                                onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.07)")}
                                                onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
                                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                        <MapPin size={13} style={{ color: isDone ? "#16a34a" : "var(--accent)", flexShrink: 0 }} />
                                                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{site.name}</span>
                                                    </div>
                                                    <span style={{ padding: "2px 7px", borderRadius: 20, fontSize: 9, fontWeight: 700, whiteSpace: "nowrap",
                                                        background: isDone ? "#dcfce7" : "#fef9c3",
                                                        color: isDone ? "#15803d" : "#854d0e" }}>
                                                        {isDone ? "✓ Done" : "Pending"}
                                                    </span>
                                                </div>
                                                {site.code && <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2, marginLeft: 19 }}>{site.code}</div>}
                                                <div style={{ marginTop: 10, fontSize: 11 }}>
                                                    {isDone
                                                        ? <span style={{ color: "#15803d", fontWeight: 600 }}>{st!.processedCount} employees processed</span>
                                                        : <span style={{ color: "var(--text3)" }}>Click to process →</span>}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    ) : (
                        /* ── Site employee table ── */
                        <>
                            {/* Hidden file input for attendance upload */}
                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleAttFileUpload(f); e.target.value = "" }} />

                            {/* Site header bar */}
                            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <MapPin size={15} style={{ color: "var(--accent)" }} />
                                    <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{selectedSite?.name}</span>
                                    {selectedSite?.code && <span style={{ fontSize: 11, color: "var(--text3)" }}>{selectedSite.code}</span>}
                                    {getStatus(selectedSiteId) && (
                                        <span style={{ padding: "2px 8px", borderRadius: 20, background: "#dcfce7", color: "#15803d", fontSize: 10, fontWeight: 700 }}>
                                            ✓ Previously Processed
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => fileInputRef.current?.click()} disabled={!fetched}
                                        title="Upload attendance Excel to auto-fill rows"
                                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "none", fontSize: 12, color: "var(--text2)", cursor: "pointer", opacity: fetched ? 1 : 0.5 }}>
                                        <FileUp size={12} /> Upload Attendance
                                    </button>
                                    <button onClick={() => fetchEmployees(selectedSiteId)} disabled={loadingEmployees}
                                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "none", fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                                        <RefreshCw size={12} className={loadingEmployees ? "animate-spin" : ""} /> Refresh
                                    </button>
                                    {getStatus(selectedSiteId) && (
                                        <>
                                            <button onClick={handleUnlock} disabled={resetting || deleting}
                                                title="Unlock payroll to reprocess"
                                                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid #f59e0b", background: "#fffbeb", fontSize: 12, color: "#b45309", fontWeight: 600, cursor: "pointer", opacity: (resetting || deleting) ? 0.6 : 1 }}>
                                                {resetting ? <Loader2 size={12} className="animate-spin" /> : <Unlock size={12} />}
                                                {resetting ? "Unlocking…" : "Unlock"}
                                            </button>
                                            <button onClick={handleDelete} disabled={resetting || deleting}
                                                title="Delete payroll for this site"
                                                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fef2f2", fontSize: 12, color: "#dc2626", fontWeight: 600, cursor: "pointer", opacity: (resetting || deleting) ? 0.6 : 1 }}>
                                                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                {deleting ? "Deleting…" : "Delete"}
                                            </button>
                                        </>
                                    )}
                                    <button onClick={handleProcess} disabled={processing || !fetched || employees.length === 0}
                                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: (processing || !fetched) ? 0.6 : 1 }}>
                                        {processing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                                        {processing ? "Processing…" : "Process Payroll"}
                                    </button>
                                </div>
                            </div>

                            {/* Mini stat cards */}
                            {fetched && (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                                    {[
                                        { label: "Total Staff",       value: String(employees.length),                              color: "#3b82f6" },
                                        { label: "Salary Approved",   value: `${approvedCount}/${employees.length}`,                 color: approvedCount < employees.length ? "#f59e0b" : "#16a34a" },
                                        { label: "Est. Gross (Full)", value: fmt(totalGrossEst),                                     color: "#0369a1" },
                                        { label: "Default Days",      value: String(defaultDays),                                    color: "#7c3aed" },
                                    ].map(s => (
                                        <div key={s.label} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
                                            <p style={{ fontSize: 9, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", margin: 0 }}>{s.label}</p>
                                            <p style={{ fontSize: 14, fontWeight: 700, color: s.color, margin: "2px 0 0 0" }}>{s.value}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Employee table */}
                            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                                {/* Search bar */}
                                <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                                    <Search size={13} style={{ color: "var(--text3)", flexShrink: 0 }} />
                                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…"
                                        style={{ flex: 1, border: "none", outline: "none", fontSize: 12, background: "transparent", color: "var(--text)" }} />
                                    {fetched && <span style={{ fontSize: 11, color: "var(--text3)", whiteSpace: "nowrap" }}>{filtered.length} / {employees.length}</span>}
                                </div>

                                <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                                                <th style={th}>#</th>
                                                <th style={th}>Emp ID</th>
                                                <th style={{ ...th, textAlign: "left" }}>Name / Designation</th>
                                                <th style={th}>Basic</th>
                                                <th style={th}>DA</th>
                                                <th style={th}>Washing</th>
                                                <th style={th}>Conv.</th>
                                                <th style={th}>Other</th>
                                                <th style={{ ...th, color: "#0369a1" }}>Gross</th>
                                                <th style={{ ...th, background: "#eff6ff" }}>Work Days</th>
                                                <th style={{ ...th, background: "#eff6ff" }}>Present</th>
                                                <th style={th}>OT</th>
                                                <th style={th}>Canteen</th>
                                                <th style={th}>Advance</th>
                                                <th style={th}>Penalty</th>
                                                <th style={th}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {loadingEmployees ? (
                                                <tr><td colSpan={16} style={{ padding: "40px 0", textAlign: "center" }}>
                                                    <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} />
                                                </td></tr>
                                            ) : !fetched ? (
                                                <tr><td colSpan={16} style={{ padding: "30px", textAlign: "center", color: "var(--text3)", fontSize: 12 }}>Loading…</td></tr>
                                            ) : filtered.length === 0 ? (
                                                <tr><td colSpan={16} style={{ padding: "30px 16px", textAlign: "center" }}>
                                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--text3)", fontSize: 12 }}>
                                                        <Users size={24} style={{ opacity: 0.2 }} />
                                                        {employees.length === 0 ? "No active employees found at this site" : "No results match your search"}
                                                    </div>
                                                </td></tr>
                                            ) : filtered.map((emp, i) => {
                                                const sal      = emp.employeeSalary
                                                const att      = attRows[emp.id] ?? {}
                                                const isCALL   = sal?.complianceType === "CALL"
                                                const hra      = sal && !isCALL ? Math.round((sal.basic + sal.da) * 0.05) : 0
                                                const bonus    = sal && !isCALL ? Math.round(7000 / 12) : 0
                                                const fullGross = sal ? sal.basic + sal.da + hra + sal.washing + sal.conveyance + sal.leaveWithWages + bonus + sal.otherAllowance : 0
                                                const approved = sal?.status === "APPROVED"
                                                return (
                                                    <tr key={emp.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                                                        <td style={td}>{i + 1}</td>
                                                        <td style={{ ...td, color: "var(--accent)", fontWeight: 700 }}>{emp.employeeId}</td>
                                                        <td style={{ ...td, textAlign: "left" }}>
                                                            <div style={{ fontWeight: 600, color: "var(--text)" }}>{emp.firstName} {emp.lastName}</div>
                                                            <div style={{ fontSize: 10, color: "var(--text3)" }}>{emp.designation || "—"}</div>
                                                        </td>
                                                        <td style={td}>{sal ? fmt(sal.basic) : "—"}</td>
                                                        <td style={td}>{sal ? fmt(sal.da) : "—"}</td>
                                                        <td style={td}>{sal ? fmt(sal.washing) : "—"}</td>
                                                        <td style={td}>{sal ? fmt(sal.conveyance) : "—"}</td>
                                                        <td style={td}>{sal ? fmt(sal.otherAllowance) : "—"}</td>
                                                        <td style={{ ...td, fontWeight: 700, color: "#0369a1" }}>{fmt(fullGross)}</td>
                                                        <td style={{ ...td, background: "#eff6ff" }}>
                                                            <input type="number" min={1} max={31} value={att.monthDays ?? defaultDays}
                                                                onChange={e => setAtt(emp.id, "monthDays", e.target.value)} style={attInput} />
                                                        </td>
                                                        <td style={{ ...td, background: "#eff6ff" }}>
                                                            <input type="number" min={0} max={31} value={att.workedDays ?? defaultDays}
                                                                onChange={e => setAtt(emp.id, "workedDays", e.target.value)} style={attInput} />
                                                        </td>
                                                        <td style={td}>
                                                            <input type="number" min={0} value={att.otDays ?? 0}
                                                                onChange={e => setAtt(emp.id, "otDays", e.target.value)} style={attInput} />
                                                        </td>
                                                        <td style={td}>
                                                            <input type="number" min={0} value={att.canteenDays ?? 0}
                                                                onChange={e => setAtt(emp.id, "canteenDays", e.target.value)} style={attInput} />
                                                        </td>
                                                        <td style={td}>
                                                            <input type="number" min={0} value={att.advance ?? 0}
                                                                onChange={e => setAtt(emp.id, "advance", e.target.value)} style={attInput} />
                                                        </td>
                                                        <td style={td}>
                                                            <input type="number" min={0} value={att.penalty ?? 0}
                                                                onChange={e => setAtt(emp.id, "penalty", e.target.value)} style={attInput} />
                                                        </td>
                                                        <td style={td}>
                                                            <span style={{ padding: "2px 7px", borderRadius: 20, fontSize: 9, fontWeight: 700,
                                                                background: approved ? "#dcfce7" : "#fef9c3",
                                                                color: approved ? "#15803d" : "#854d0e" }}>
                                                                {approved ? "Approved" : (sal ? "Pending" : "No Salary")}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                        {fetched && employees.length > 0 && (
                                            <tfoot>
                                                <tr style={{ background: "var(--surface2)", borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                                                    <td colSpan={3} style={{ ...td, textAlign: "right", fontSize: 10, color: "var(--text3)", textTransform: "uppercase" }}>
                                                        Total ({employees.length})
                                                    </td>
                                                    <td style={td}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.basic ?? 0), 0))}</td>
                                                    <td style={td}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.da ?? 0), 0))}</td>
                                                    <td style={td}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.washing ?? 0), 0))}</td>
                                                    <td style={td}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.conveyance ?? 0), 0))}</td>
                                                    <td style={td}>{fmt(employees.reduce((s, e) => s + (e.employeeSalary?.otherAllowance ?? 0), 0))}</td>
                                                    <td style={{ ...td, color: "#0369a1" }}>{fmt(totalGrossEst)}</td>
                                                    <td colSpan={7} />
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>

                            {/* Banners */}
                            {fetched && approvedCount < employees.length && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde047" }}>
                                    <AlertCircle size={13} style={{ color: "#a16207", flexShrink: 0 }} />
                                    <span style={{ fontSize: 11, color: "#a16207" }}>
                                        {employees.length - approvedCount} employee(s) have no approved salary structure — basic salary will be used as fallback.
                                    </span>
                                </div>
                            )}
                            {fetched && employees.length > 0 && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, background: "#dcfce7", border: "1px solid #86efac" }}>
                                    <CheckCircle2 size={13} style={{ color: "#15803d", flexShrink: 0 }} />
                                    <span style={{ fontSize: 11, color: "#15803d" }}>
                                        {employees.length} employees ready. Attendance defaults to {defaultDays} days — edit inline above if needed, then click <b>Process Payroll</b>.
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Shared styles ─────────────────────────────────────────────────────────────
const labelSt: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap"
}
const selectSt: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)",
    fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none"
}
const th: React.CSSProperties = {
    padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "var(--text3)",
    textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center", whiteSpace: "nowrap"
}
const td: React.CSSProperties = {
    padding: "6px 10px", textAlign: "center", color: "var(--text)", whiteSpace: "nowrap"
}
const attInput: React.CSSProperties = {
    width: 50, padding: "3px 4px", borderRadius: 5, border: "1px solid var(--border)",
    textAlign: "center", fontSize: 11, outline: "none", background: "var(--surface)", color: "var(--text)"
}

export default function ProcessPayrollPageWrapper() {
    return (
        <Suspense>
            <ProcessPayrollPage />
        </Suspense>
    )
}
