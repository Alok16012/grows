"use client"
import { payrollYears, currentPayrollMonth, currentPayrollYear } from "./payroll-years"
import { useState, useRef, useCallback, useEffect } from "react"
import { fetchEmployeeOptions } from "@/lib/fetch-all-employees"
import { monthEndKey } from "@/lib/employee-filter"
// xlsx is lazy-loaded — only needed when a sheet is actually read or written.
// Eager import adds ~430KB to this page's initial bundle.
const loadXLSX = () => import("xlsx")
import {
    Upload, Download, CheckCircle2, XCircle, Loader2,
    FileSpreadsheet, AlertCircle, AlertTriangle, MinusCircle, Users, MapPin, RefreshCw, X
} from "lucide-react"
import { toast } from "sonner"
import { DEFAULT_PAYROLL_RULES, PayrollRules } from "@/lib/payroll-rules"

type Site = { id: string; name: string; code?: string; city?: string }
type ParsedRow = {
    /** Row number as Excel shows it, for messages. */
    excelRow: number; rawEmployeeId: string; rawName: string
    monthDays: number; days: number; otDays: number; otherDeduction: number; lwf: number
    canteenDays: number; penalty: number; advance: number; productionIncentive: number
    /** Manual canteen amount. null = derive from days x rate. */
    canteenAmount: number | null
    /** Cells that aren't a usable number ("abc", negative…), described for the user. */
    badCells: string[]
}
// ok: processed · warn: processed, with something to look at · skip: left out,
// with the reason · error: the file needs fixing; nothing is processed until it is.
type RowState = "ok" | "warn" | "skip" | "error"
type MatchedRow = ParsedRow & { state: RowState; note?: string; employeeId?: string; dbName?: string; designation?: string }
type Employee  = {
    id: string; employeeId: string; firstName: string; lastName: string; designation?: string
    status?: string; dateOfJoining?: string | null; dateOfLeaving?: string | null
    deployments?: { siteId: string; site?: { name: string } | null }[]
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const TEMPLATE_COLS = ["Employee ID","Employee Name","MONTH DAYS","DAYS","OT DAYS","OTHER DEDUCTION","LWF","CANTEEN DAYS","CANTEEN AMOUNT","PENALTY","ADVANCE","PRODUCTION INCENTIVE"]
const TEMPLATE_SAMPLE = [
    ["EMP-0001","Rahul Kumar",   26,26,2,150,6,24,"",  50,1000,0],
    ["EMP-0002","Priya Sharma",  26,25,0,0,  6,20,"",  0,0,  500],
    // Canteen amount filled in: 1500 is charged and the 26 days are ignored.
    ["EMP-0003","Amit Singh",    26,26,1,200,6,26,1500,100,500,0],
]

const isEmpty = (v: unknown) => v === null || v === undefined || String(v).trim() === ""

/** Excel cell -> number; an empty cell takes the default. Text gives NaN, which validation reports. */
function numCell(v: unknown, def: number): number {
    return isEmpty(v) ? def : Number(String(v).trim())
}

/** Excel cell -> optional amount. An empty cell means "not set", not zero. Text gives NaN. */
function optAmount(v: unknown): number | null {
    return isEmpty(v) ? null : Number(String(v).trim())
}

const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

// The template's employee rows, prefilled from the configured rules (Payroll →
// Calculation Settings). Shared by the download and the on-screen preview,
// which used to show its own hardcoded 26 days and ₹10 LWF.
function templateRows(employees: Employee[], rules: PayrollRules): (string | number)[][] {
    const md  = rules.defaults.monthDays
    const lwf = rules.lwf.employeeDefault
    return employees.map(e => [e.employeeId,`${e.firstName} ${e.lastName}`,md,md,0,0,lwf,0,"",0,0,0])
}

async function downloadTemplate(siteName: string, employees: Employee[], rules: PayrollRules) {
    const XLSX = await loadXLSX()
    const wb = XLSX.utils.book_new()
    const sheetName = `${siteName.slice(0,20)} Attendance`
    const header = [`SITE: ${siteName}`,"","","","","","","","","","",""]
    const empRows = employees.length > 0 ? templateRows(employees, rules) : TEMPLATE_SAMPLE
    const wsData = [header,TEMPLATE_COLS,...empRows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws["!cols"] = TEMPLATE_COLS.map((_,i) => ({ wch: i<=1?22:16 }))
    XLSX.utils.book_append_sheet(wb,ws,sheetName)
    XLSX.writeFile(wb,`Attendance_${siteName.replace(/\s+/g,"_")}.xlsx`)
}

const card: React.CSSProperties = { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }
const stepBadge: React.CSSProperties = { width:24, height:24, borderRadius:"50%", background:"var(--accent)", color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }
const inputSt: React.CSSProperties = { padding:"7px 10px", borderRadius:8, border:"1px solid var(--border)", fontSize:13, background:"var(--surface)", color:"var(--text)", outline:"none", fontWeight:600 }
const btnPrimary: React.CSSProperties = { display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:8, border:"none", background:"var(--accent)", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }
const btnOutline: React.CSSProperties = { display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface)", color:"var(--text2)", fontSize:13, fontWeight:500, cursor:"pointer" }

export default function AttendancePanel({ onClose, onDone, initialMonth, initialYear }: { onClose: () => void; onDone?: (period?: { month: number; year: number }) => void; initialMonth?: number; initialYear?: number }) {
    const [month,    setMonth]    = useState(initialMonth ?? currentPayrollMonth())
    const [year,     setYear]     = useState(initialYear  ?? currentPayrollYear())
    const [siteId,   setSiteId]   = useState("")
    const [sites,    setSites]    = useState<Site[]>([])
    const [sitesLoading, setSitesLoading] = useState(true)
    const [file,     setFile]     = useState<File|null>(null)
    const [rules,    setRules]    = useState<PayrollRules>(DEFAULT_PAYROLL_RULES)
    useEffect(() => {
        fetch("/api/payroll/rules")
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.rules) setRules(d.rules) })
            .catch(() => { /* template falls back to defaults */ })
    }, [])
    const [parsing,  setParsing]  = useState(false)
    const [matched,  setMatched]  = useState<MatchedRow[]|null>(null)
    const [processing, setProcessing] = useState(false)
    const [siteEmployees, setSiteEmployees] = useState<Employee[]>([])
    const [siteEmpLoading, setSiteEmpLoading] = useState(false)
    // Site staff who had joined by month end but aren't in the uploaded file.
    const [missingStaff, setMissingStaff] = useState<string[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    // The template lists who had joined by the end of the chosen month. A slow
    // answer for a site that's no longer selected is dropped.
    useEffect(() => {
        if (!siteId) { setSiteEmployees([]); return }
        let cancelled = false
        setSiteEmpLoading(true)
        fetchEmployeeOptions<Employee>({ siteId, status: "ACTIVE", joinedBy: monthEndKey(month, year) })
            .then(d => { if (!cancelled) setSiteEmployees(d.employees) })
            .catch(() => { if (!cancelled) setSiteEmployees([]) })
            .finally(() => { if (!cancelled) setSiteEmpLoading(false) })
        return () => { cancelled = true }
    }, [siteId, month, year])

    // Results belong to one site and month; changing either starts over.
    const resetResults = () => { setMatched(null); setMissingStaff([]) }

    useEffect(() => {
        fetch("/api/sites?isActive=true").then(r=>r.json()).then(data=>{
            // Default to the first site only if the user hasn't already picked one.
            if (Array.isArray(data)) { setSites(data); if (data.length>0) setSiteId(prev => prev || data[0].id) }
        }).catch(()=>toast.error("Failed to load sites")).finally(()=>setSitesLoading(false))
    }, [])

    const selectedSite = sites.find(s=>s.id===siteId)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFile(e.target.files?.[0]??null); resetResults()
    }

    const handleValidate = useCallback(async () => {
        if (!siteId) { toast.error("Select a site first"); return }
        if (!file)   { toast.error("Choose an Excel file first"); return }
        setParsing(true); resetResults()
        try {
            const XLSX = await loadXLSX()
            const buf = await file.arrayBuffer()
            const wb  = XLSX.read(buf,{type:"array"})
            const ws  = wb.Sheets[wb.SheetNames[0]]
            const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:""})
            const norm = (v: unknown) => String(v).trim().toUpperCase().replace(/\s+/g," ")
            const EMP_ID_VARIANTS = new Set(["EMPLOYEE ID","EMP ID","EMPLOYEEID","EMPID","EMPLOYEE CODE","EMP CODE","EMPCODE","EMPLOYEECODE","EMPLOYEE NO","EMP NO","EMPNO","EMPLOYEE NUMBER"])
            const headerIdx = rawRows.findIndex(row=>Array.isArray(row)&&row.some(cell=>EMP_ID_VARIANTS.has(norm(cell))))
            if (headerIdx===-1) { toast.error("Could not find header row with 'Employee ID' column"); setParsing(false); return }
            const headers = (rawRows[headerIdx] as unknown[]).map(h=>norm(h))
            // Keep each row's position in the sheet so messages can name the Excel row.
            const dataRows = rawRows
                .map((row, idx) => ({ row, excelRow: idx + 1 }))
                .slice(headerIdx+1)
                .filter(({ row })=>Array.isArray(row)&&row.some(cell=>String(cell).trim()!==""))
            const rows = dataRows.map(({ row, excelRow })=>{
                const obj: Record<string,unknown> = {}
                headers.forEach((h,i)=>{obj[h]=(row as unknown[])[i]??""})
                return { obj, excelRow }
            })
            if (rows.length===0) { toast.error("No data rows found"); setParsing(false); return }
            const pick = (row: Record<string,unknown>,...aliases: string[]) => {
                for (const a of aliases) { const v=row[a.toUpperCase().replace(/\s+/g," ")]; if(v!==undefined&&String(v).trim()!=="") return v }
                return undefined
            }
            const md = rules.defaults.monthDays
            const parsed: ParsedRow[] = rows.map(({ obj: row, excelRow })=>{
                const r = {
                    excelRow,
                    rawEmployeeId: String(pick(row,"EMPLOYEE ID","EMP ID","EMP CODE","EMPLOYEE CODE","EMPLOYEE NO","EMP NO","EMPCODE","EMPLOYEEID")??"").trim(),
                    rawName:       String(pick(row,"EMPLOYEE NAME","NAME","EMPLOYEE","EMP NAME")??"").trim(),
                    monthDays:     numCell(pick(row,"MONTH DAYS","MONTHDAYS","TOTAL DAYS","WORKING DAYS IN MONTH"), md),
                    days:          numCell(pick(row,"DAYS WORKED","DAYS","PRESENT DAYS","WORKED DAYS","PRESENT","PAID DAYS","ATT DAYS","ATTENDANCE"), md),
                    otDays:        numCell(pick(row,"OT DAYS","OTDAYS","OVERTIME","OT"), 0),
                    otherDeduction:numCell(pick(row,"OTHER DEDUCTION","OTHER DED","OTH DED"), 0),
                    lwf:           numCell(pick(row,"LWF","LABOUR WELFARE FUND"), 0),
                    canteenDays:   numCell(pick(row,"CANTEEN DAYS","CANTEEN","MESS DAYS"), 0),
                    // Optional override. An empty cell means "work it out from
                    // days x rate"; a 0 means "no canteen this month".
                    canteenAmount: optAmount(pick(row,"CANTEEN AMOUNT","CANTEEN AMT","CANTEEN RS","MESS AMOUNT")),
                    penalty:       numCell(pick(row,"PENALTY","FINE"), 0),
                    advance:       numCell(pick(row,"ADVANCE","ADV","LOAN"), 0),
                    productionIncentive: numCell(pick(row,"PRODUCTION INCENTIVE","PROD INCENTIVE","PROD INC","INCENTIVE","PI"), 0),
                    badCells: [] as string[],
                }
                // Text in a number column used to become 0 days (or 0 deduction)
                // without a word; negative values are always typos.
                const checks: [string, number | null][] = [
                    ["Month days", r.monthDays], ["Days", r.days], ["OT days", r.otDays], ["Other deduction", r.otherDeduction],
                    ["LWF", r.lwf], ["Canteen days", r.canteenDays], ["Canteen amount", r.canteenAmount], ["Penalty", r.penalty],
                    ["Advance", r.advance], ["Production incentive", r.productionIncentive],
                ]
                for (const [label, v] of checks) {
                    if (v === null) continue
                    if (!Number.isFinite(v)) r.badCells.push(`${label} is not a number`)
                    else if (v < 0) r.badCells.push(`${label} can't be negative`)
                }
                return r
            }).filter(r=>r.rawEmployeeId&&!/^(SR|TOTAL|GRAND TOTAL|—)$/i.test(r.rawEmployeeId))
            if (!parsed.length) { toast.error("No valid Employee ID rows found"); setParsing(false); return }

            // Everyone except people still in onboarding, so a leaver's last month
            // can be paid; who may actually be paid this month is decided below.
            // Payroll rows already locked for the month are left alone by the
            // server, so they're shown as skipped here instead of disappearing.
            const [optsRes, payRes] = await Promise.all([
                fetchEmployeeOptions<Employee>({}),
                fetch(`/api/payroll?month=${month}&year=${year}`).then(r => r.ok ? r.json() : []).catch(() => []),
            ])
            const empMap = new Map<string,Employee>()
            optsRes.employees.forEach(e=>empMap.set(e.employeeId.trim().toUpperCase(),e))
            const payRows: { employeeId: string; status: string }[] = Array.isArray(payRes) ? payRes : (payRes?.payrolls ?? [])
            const lockedIds = new Set(payRows.filter(p => p.status !== "DRAFT").map(p => p.employeeId))

            const monthStart = new Date(Date.UTC(year, month - 1, 1))
            const nextMonth  = new Date(Date.UTC(year, month, 1))
            const monthName  = MONTHS[month - 1]
            const key = (id: string) => id.trim().toUpperCase()
            const seen = new Map<string, number>()
            parsed.forEach(r => seen.set(key(r.rawEmployeeId), (seen.get(key(r.rawEmployeeId)) ?? 0) + 1))

            const matchedRows: MatchedRow[] = parsed.map(r=>{
                const emp = empMap.get(key(r.rawEmployeeId))
                const base = { ...r, employeeId: emp?.id, dbName: emp ? `${emp.firstName} ${emp.lastName}` : undefined, designation: emp?.designation }
                if (r.badCells.length) return { ...base, state: "error" as const, note: `Row ${r.excelRow}: ${r.badCells.join("; ")}` }
                const times = seen.get(key(r.rawEmployeeId)) ?? 0
                if (times > 1) return { ...base, state: "error" as const, note: `Row ${r.excelRow}: this Employee ID is in the file ${times} times — keep one row` }
                if (!emp) return { ...base, state: "skip" as const, note: "Employee ID not found" }
                // A locked row can't change whatever else is true, so say that first.
                if (lockedIds.has(emp.id)) return { ...base, state: "skip" as const, note: `${MONTHS[month - 1]} payroll is locked for this employee — unlock the month first` }
                const doj = emp.dateOfJoining ? new Date(emp.dateOfJoining) : null
                const dol = emp.dateOfLeaving ? new Date(emp.dateOfLeaving) : null
                if (doj && doj >= nextMonth) return { ...base, state: "skip" as const, note: `Joined ${fmtDay(doj)}, after ${monthName}` }
                if (dol && dol < monthStart) return { ...base, state: "skip" as const, note: `Left ${fmtDay(dol)}, before ${monthName}` }
                if (!dol && emp.status && ["RESIGNED","TERMINATED","INACTIVE"].includes(emp.status))
                    return { ...base, state: "skip" as const, note: `Status is ${emp.status.toLowerCase()} with no leaving date` }
                const warnings: string[] = []
                if (dol && dol < nextMonth) warnings.push(`Left ${fmtDay(dol)} — final month`)
                const posted = emp.deployments?.[0]
                if (!posted) warnings.push("Not posted at any site")
                else if (posted.siteId !== siteId) warnings.push(`Posted at ${posted.site?.name ?? "another site"}`)
                return { ...base, state: warnings.length ? "warn" as const : "ok" as const, note: warnings.join(" · ") || undefined }
            })

            // Who works at this site and had joined by month end, but isn't in the file.
            const inFile = new Set(parsed.map(r => key(r.rawEmployeeId)))
            const missing = optsRes.employees
                .filter(e => e.deployments?.[0]?.siteId === siteId)
                .filter(e => e.status === "ACTIVE" || e.status === "ON_LEAVE")
                .filter(e => !e.dateOfJoining || new Date(e.dateOfJoining) < nextMonth)
                .filter(e => !inFile.has(key(e.employeeId)))
                .map(e => `${e.firstName} ${e.lastName} (${e.employeeId})`)

            setMatched(matchedRows)
            setMissingStaff(missing)
            const ready  = matchedRows.filter(r => r.state === "ok" || r.state === "warn").length
            const errors = matchedRows.filter(r => r.state === "error").length
            if (errors) toast.error(`${errors} row(s) need fixing before anything can be processed`)
            else toast.success(`${ready} of ${matchedRows.length} rows ready to process at ${selectedSite?.name}`)
        } catch(err) { console.error(err); toast.error("Failed to read the file") }
        finally { setParsing(false) }
    }, [file,siteId,selectedSite,rules,month,year])

    const handleProcess = async () => {
        if (!matched||!siteId) return
        if (matched.some(r => r.state === "error")) { toast.error("Fix the rows with errors and upload again"); return }
        const valid = matched.filter(r=>(r.state === "ok" || r.state === "warn") && r.employeeId)
        if (!valid.length) { toast.error("No employees to process"); return }
        setProcessing(true)
        try {
            const attendance = valid.map(r=>({
                employeeId: r.employeeId!, monthDays:r.monthDays, workedDays:r.days,
                otDays:r.otDays, otherDeductions:r.otherDeduction, lwf:r.lwf,
                canteenDays:r.canteenDays, canteenAmount:r.canteenAmount, penalty:r.penalty, advance:r.advance, productionIncentive:r.productionIncentive,
            }))
            const res = await fetch("/api/payroll/calculate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({siteId,month,year,attendance})})
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            toast.success(`Payroll processed for ${data.processedCount} employees at ${selectedSite?.name}`)
            onDone?.({ month, year })
        } catch(e: unknown) { toast.error(e instanceof Error?e.message:"Processing failed") }
        finally { setProcessing(false) }
    }

    const readyRows  = matched?.filter(r=>r.state==="ok"||r.state==="warn") ?? []
    const readyCount = readyRows.length
    const skipCount  = matched?.filter(r=>r.state==="skip").length??0
    const errorCount = matched?.filter(r=>r.state==="error").length??0
    const warnCount  = matched?.filter(r=>r.state==="warn").length??0
    const sumOf = (f: (r: MatchedRow) => number) => Math.round(readyRows.reduce((s,r)=>s+f(r),0)*1000)/1000
    const previewRows = siteEmployees.length > 0 ? templateRows(siteEmployees, rules) : TEMPLATE_SAMPLE
    const STATE_STYLE: Record<RowState, { icon: React.ReactNode; bg: string; noteColor: string }> = {
        ok:    { icon: <CheckCircle2 size={14} style={{ color:"#16a34a" }} />, bg: "var(--surface)", noteColor: "var(--text3)" },
        warn:  { icon: <AlertTriangle size={14} style={{ color:"#d97706" }} />, bg: "#fffbeb",       noteColor: "#a16207" },
        skip:  { icon: <MinusCircle size={14} style={{ color:"#9ca3af" }} />,   bg: "var(--surface2)", noteColor: "var(--text3)" },
        error: { icon: <XCircle size={14} style={{ color:"#dc2626" }} />,       bg: "#fff5f5",       noteColor: "#dc2626" },
    }

    return (
        <div style={{ display:"flex", flexDirection:"column", gap:18, paddingBottom:32 }}>
            {/* Panel Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"14px 20px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12 }}>
                <div>
                    <p style={{ fontSize:16, fontWeight:800, color:"var(--text)", margin:0 }}>Upload Attendance</p>
                    <p style={{ fontSize:12, color:"var(--text3)", margin:"2px 0 0 0" }}>Upload attendance for one site and one month at a time.</p>
                </div>
                <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"var(--text3)" }}>
                    <X size={16} />
                </button>
            </div>

            {/* Step 1: Select Site & Month */}
            <div style={card}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                    <div style={stepBadge}>1</div>
                    <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", margin:0 }}>Select Site & Month</p>
                </div>
                {/* Media queries can't live in inline styles — the column count
                    moves to Tailwind so the three selects stack on mobile. */}
                <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr]" style={{ gap:12 }}>
                    <div>
                        <label style={{ fontSize:10, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.5px", display:"block", marginBottom:5 }}>Site *</label>
                        {sitesLoading ? (
                            <div style={{ height:36, display:"flex", alignItems:"center", gap:6, color:"var(--text3)", fontSize:12 }}>
                                <Loader2 size={14} className="animate-spin" /> Loading sites…
                            </div>
                        ) : (
                            <select value={siteId} onChange={e=>{setSiteId(e.target.value);resetResults()}} style={{...inputSt,width:"100%"}}>
                                <option value="">— Select Site —</option>
                                {sites.map(s=><option key={s.id} value={s.id}>{s.name}{s.code?` (${s.code})`:""}{s.city?` — ${s.city}`:""}</option>)}
                            </select>
                        )}
                    </div>
                    <div>
                        <label style={{ fontSize:10, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.5px", display:"block", marginBottom:5 }}>Month *</label>
                        <select value={month} onChange={e=>{setMonth(Number(e.target.value));resetResults()}} style={{...inputSt,width:"100%"}}>
                            {MONTHS.map((m,i)=><option key={m} value={i+1}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize:10, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.5px", display:"block", marginBottom:5 }}>Year *</label>
                        <select value={year} onChange={e=>{setYear(Number(e.target.value));resetResults()}} style={{...inputSt,width:"100%"}}>
                            {payrollYears().map(y=><option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
                {selectedSite && (
                    <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:8, background:"var(--accent-light)", border:"1px solid var(--accent)30" }}>
                        <MapPin size={13} style={{ color:"var(--accent)" }} />
                        <span style={{ fontSize:12, color:"var(--accent)", fontWeight:600 }}>
                            {selectedSite.name}{selectedSite.city?` · ${selectedSite.city}`:""} — {MONTHS[month-1]} {year}
                        </span>
                    </div>
                )}
            </div>

            {/* Step 2: Download Template */}
            <div style={card}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={stepBadge}>2</div>
                        <div>
                            <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", margin:0 }}>Download Template</p>
                            <p style={{ fontSize:12, color:"var(--text3)", margin:"2px 0 0 0" }}>Fill in the Excel template with attendance data for this site and month</p>
                        </div>
                    </div>
                    {/* Wait for the site's staff: downloading early gave the example rows. */}
                    <button onClick={()=>downloadTemplate(selectedSite!.name,siteEmployees, rules)} disabled={!siteId||siteEmpLoading}
                        style={{...btnPrimary, background:"#16a34a", opacity:(!siteId||siteEmpLoading)?0.5:1}}>
                        {siteEmpLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download Template{selectedSite?` — ${selectedSite.name}`:""}
                    </button>
                </div>
                {siteId && !siteEmpLoading && siteEmployees.length === 0 && (
                    <p style={{ fontSize:12, color:"#a16207", margin:"12px 0 0 0" }}>
                        Nobody is posted at this site for {MONTHS[month-1]} {year}, so the template has example rows. Replace them with real Employee IDs.
                    </p>
                )}
                <div style={{ marginTop:14, overflowX:"auto", borderRadius:8, border:"1px solid var(--border)" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                        <thead>
                            <tr style={{ background:"var(--surface2)" }}>
                                {TEMPLATE_COLS.map(c=>(
                                    <th key={c} style={{ padding:"7px 10px", textAlign:"left", fontWeight:700, color:"var(--text3)", borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" }}>{c}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {siteEmpLoading ? (
                                <tr><td colSpan={TEMPLATE_COLS.length} style={{ padding:"10px", color:"var(--text3)" }}>
                                    <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}><Loader2 size={12} className="animate-spin" /> Loading site staff…</span>
                                </td></tr>
                            ) : previewRows.map((row,i,arr)=>(
                                <tr key={i} style={{ borderBottom:i<arr.length-1?"1px solid var(--border)":"none" }}>
                                    {row.map((cell,j)=>(
                                        <td key={j} style={{ padding:"6px 10px", color:"var(--text2)", whiteSpace:"nowrap" }}>{String(cell)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Step 3: Upload */}
            <div style={card}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                    <div style={stepBadge}>3</div>
                    <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", margin:0 }}>Upload & Validate Excel</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} style={{ display:"none" }} />
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                    <button onClick={()=>fileInputRef.current?.click()} style={btnOutline}>
                        <FileSpreadsheet size={14} style={{ color:"#16a34a" }} />
                        {file ? file.name : "Choose Excel File"}
                    </button>
                    {file && (
                        <button onClick={handleValidate} disabled={parsing||!siteId}
                            style={{...btnPrimary, opacity:(!siteId||parsing)?0.6:1}}>
                            {parsing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                            {parsing ? "Validating…" : "Upload & Validate"}
                        </button>
                    )}
                    {matched && (
                        <button onClick={()=>{setFile(null);setMatched(null);if(fileInputRef.current)fileInputRef.current.value=""}} style={btnOutline}>
                            <RefreshCw size={13} /> Clear
                        </button>
                    )}
                </div>
                {file && <p style={{ fontSize:11, color:"var(--text3)", marginTop:6 }}>{file.name} — {(file.size/1024).toFixed(1)} KB</p>}
            </div>

            {/* Step 4: Validation Results */}
            {matched && (
                <div style={card}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                        <div style={stepBadge}>4</div>
                        <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", margin:0 }}>
                            Validation Results — {selectedSite?.name}
                        </p>
                    </div>
                    <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
                        {[
                            { label:"Rows in file",      value:matched.length, color:"#6b7280", bg:"var(--surface2)", border:"var(--border)" },
                            { label:"Ready to process",  value:readyCount,     color:"#15803d", bg:"#dcfce7",         border:"#86efac" },
                            { label:"Skipped",           value:skipCount,      color:"#6b7280", bg:"var(--surface2)", border:"var(--border)" },
                            { label:"Errors",            value:errorCount,     color:"#dc2626", bg:"#fee2e2",         border:"#fca5a5" },
                        ].map(s=>(
                            <div key={s.label} style={{ padding:"8px 16px", borderRadius:8, background:s.bg, border:`1px solid ${s.border}`, display:"flex", alignItems:"center", gap:8 }}>
                                <Users size={14} style={{ color:s.color }} />
                                <span style={{ fontSize:13, fontWeight:700, color:s.color }}>{s.value} {s.label}</span>
                            </div>
                        ))}
                    </div>
                    {errorCount>0 && (
                        <div role="alert" style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", borderRadius:8, background:"#fef2f2", border:"1px solid #fca5a5", marginBottom:10, fontSize:12, color:"#b91c1c" }}>
                            <XCircle size={14} style={{ flexShrink:0 }} />
                            {errorCount} row(s) have errors (see the note on each). Fix them in the file and upload it again — nothing is processed until then.
                        </div>
                    )}
                    {skipCount>0 && (
                        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", borderRadius:8, background:"#fffbeb", border:"1px solid #fde047", marginBottom:10, fontSize:12, color:"#a16207" }}>
                            <AlertCircle size={14} style={{ flexShrink:0 }} />
                            {skipCount} row(s) will be skipped — the note on each says why.
                        </div>
                    )}
                    {warnCount>0 && (
                        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", borderRadius:8, background:"#fffbeb", border:"1px solid #fde68a", marginBottom:10, fontSize:12, color:"#a16207" }}>
                            <AlertTriangle size={14} style={{ flexShrink:0 }} />
                            {warnCount} row(s) will be processed but are worth a look (another site, or leaving this month).
                        </div>
                    )}
                    {missingStaff.length>0 && (
                        <details style={{ padding:"9px 12px", borderRadius:8, background:"var(--surface2)", border:"1px solid var(--border)", marginBottom:12, fontSize:12, color:"var(--text2)" }}>
                            <summary style={{ cursor:"pointer" }}>
                                {missingStaff.length} employee(s) posted at {selectedSite?.name} aren&apos;t in this file and won&apos;t be paid by this upload.
                            </summary>
                            <p style={{ margin:"8px 0 0 0", lineHeight:1.6 }}>{missingStaff.join(", ")}</p>
                        </details>
                    )}
                    <div style={{ overflowX:"auto", borderRadius:8, border:"1px solid var(--border)" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                            <thead>
                                <tr style={{ background:"var(--surface2)", borderBottom:"1px solid var(--border)" }}>
                                    {["","Emp ID","Name (File)","Name (DB)","Designation","Note","Days","OT Days","Other Ded.","LWF","Canteen Days","Canteen ₹","Penalty","Advance","Prod. Inc."].map(h=>(
                                        <th key={h} style={{ padding:"8px 10px", textAlign:h===""?"center":"left", fontSize:10, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.4px", whiteSpace:"nowrap" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {matched.map((r,i)=>{
                                    const st = STATE_STYLE[r.state]
                                    const num = (v: number | null) => v === null ? "—" : Number.isFinite(v) ? (v || "—") : "?"
                                    return (
                                    <tr key={i} style={{ borderBottom:"1px solid var(--border)", background:st.bg }}>
                                        <td style={{ padding:"7px 10px", textAlign:"center" }} title={r.state}>{st.icon}</td>
                                        <td style={{ padding:"7px 10px", fontFamily:"monospace", color:"var(--accent)", fontWeight:700, whiteSpace:"nowrap" }}>{r.rawEmployeeId}</td>
                                        <td style={{ padding:"7px 10px", color:"var(--text2)" }}>{r.rawName||"—"}</td>
                                        <td style={{ padding:"7px 10px", color:r.dbName?"var(--text)":"#dc2626", fontWeight:r.dbName?600:400, fontStyle:r.dbName?"normal":"italic" }}>{r.dbName??"not found"}</td>
                                        <td style={{ padding:"7px 10px", color:"var(--text3)" }}>{r.designation||"—"}</td>
                                        <td style={{ padding:"7px 10px", color:st.noteColor, minWidth:180 }}>{r.note ?? ""}</td>
                                        <td style={{ padding:"7px 10px", textAlign:"right", fontWeight:700 }}>{Number.isFinite(r.days) ? r.days : "?"}</td>
                                        <td style={{ padding:"7px 10px", textAlign:"right" }}>{Number.isFinite(r.otDays) ? r.otDays : "?"}</td>
                                        <td style={{ padding:"7px 10px", textAlign:"right" }}>{num(r.otherDeduction)}</td>
                                        <td style={{ padding:"7px 10px", textAlign:"right" }}>{num(r.lwf)}</td>
                                        <td style={{ padding:"7px 10px", textAlign:"right" }}>{num(r.canteenDays)}</td>
                                        <td style={{ padding:"7px 10px", textAlign:"right" }}>{r.canteenAmount === null ? "—" : Number.isFinite(r.canteenAmount) ? r.canteenAmount : "?"}</td>
                                        <td style={{ padding:"7px 10px", textAlign:"right" }}>{num(r.penalty)}</td>
                                        <td style={{ padding:"7px 10px", textAlign:"right" }}>{num(r.advance)}</td>
                                        <td style={{ padding:"7px 10px", textAlign:"right" }}>{num(r.productionIncentive)}</td>
                                    </tr>
                                )})}
                            </tbody>
                            {readyCount>0 && (
                                <tfoot>
                                    <tr style={{ background:"var(--surface2)", borderTop:"2px solid var(--border)", fontWeight:700 }}>
                                        <td colSpan={6} style={{ padding:"8px 10px", fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.4px" }}>Total of rows to process ({readyCount} employees)</td>
                                        {/* Days can be fractional (half days), so sums are rounded. */}
                                        <td style={{ padding:"8px 10px", textAlign:"right", color:"var(--text)" }}>{sumOf(r=>r.days)}</td>
                                        <td style={{ padding:"8px 10px", textAlign:"right", color:"var(--text)" }}>{sumOf(r=>r.otDays)}</td>
                                        <td style={{ padding:"8px 10px", textAlign:"right" }}>{sumOf(r=>r.otherDeduction)||"—"}</td>
                                        <td style={{ padding:"8px 10px", textAlign:"right" }}>{sumOf(r=>r.lwf)||"—"}</td>
                                        <td style={{ padding:"8px 10px", textAlign:"right" }}>{sumOf(r=>r.canteenDays)||"—"}</td>
                                        <td style={{ padding:"8px 10px", textAlign:"right" }}>{sumOf(r=>r.canteenAmount??0)||"—"}</td>
                                        <td style={{ padding:"8px 10px", textAlign:"right" }}>{sumOf(r=>r.penalty)||"—"}</td>
                                        <td style={{ padding:"8px 10px", textAlign:"right" }}>{sumOf(r=>r.advance)||"—"}</td>
                                        <td style={{ padding:"8px 10px", textAlign:"right" }}>{sumOf(r=>r.productionIncentive)||"—"}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    <div style={{ marginTop:16, display:"flex", justifyContent:"flex-end", gap:10, flexWrap:"wrap" }}>
                        <button onClick={()=>{setFile(null);resetResults();if(fileInputRef.current)fileInputRef.current.value=""}} style={btnOutline}>Upload Another File</button>
                        <button onClick={handleProcess} disabled={processing||errorCount>0||readyCount===0}
                            title={errorCount>0 ? "Fix the rows with errors and upload again" : readyCount===0 ? "No rows can be processed" : undefined}
                            style={{...btnPrimary, background:"#16a34a", opacity:(processing||errorCount>0||readyCount===0)?0.5:1, cursor:(errorCount>0||readyCount===0)?"not-allowed":"pointer", fontSize:13, padding:"9px 20px"}}>
                            {processing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {processing ? "Processing…" : `Process Payroll — ${readyCount} Employees at ${selectedSite?.name}`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
