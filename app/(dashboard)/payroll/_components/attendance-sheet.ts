// Reading an attendance sheet and deciding, row by row, who can be paid for a
// month. Shared by the one-site upload and the all-sites upload so both apply
// exactly the same checks.

import type { PayrollRules } from "@/lib/payroll-rules"
import { fetchEmployeeOptions } from "@/lib/fetch-all-employees"

export type Site = { id: string; name: string; code?: string | null; city?: string | null; isActive?: boolean }

export type ParsedRow = {
    /** Row number as Excel shows it, for messages. */
    excelRow: number; rawEmployeeId: string; rawName: string
    /** Site columns, used by the all-sites sheet (empty when the sheet has none). */
    rawSite: string; rawSiteCode: string
    monthDays: number; days: number; otDays: number; otherDeduction: number; lwf: number
    canteenDays: number; penalty: number; advance: number; productionIncentive: number
    /** Manual canteen amount. null = derive from days x rate. */
    canteenAmount: number | null
    /** Cells that aren't a usable number ("abc", negative…), described for the user. */
    badCells: string[]
}

// ok: processed · warn: processed, with something to look at · skip: left out,
// with the reason · error: the file needs fixing; nothing is processed until it is.
export type RowState = "ok" | "warn" | "skip" | "error"

export type MatchedRow = ParsedRow & {
    state: RowState; note?: string
    employeeId?: string; dbName?: string; designation?: string
    /** The site this row is paid under (all-sites upload). */
    siteId?: string; siteName?: string
}

export type Employee = {
    id: string; employeeId: string; firstName: string; middleName?: string | null; lastName: string; designation?: string
    status?: string; dateOfJoining?: string | null; dateOfLeaving?: string | null
    deployments?: { siteId: string; site?: { id?: string; name: string; code?: string | null } | null }[]
}

export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
export const TEMPLATE_COLS = ["Employee ID","Employee Name","MONTH DAYS","DAYS","OT DAYS","OTHER DEDUCTION","LWF","CANTEEN DAYS","CANTEEN AMOUNT","PENALTY","ADVANCE","PRODUCTION INCENTIVE"]
export const TEMPLATE_SAMPLE = [
    ["EMP-0001","Rahul Kumar",   26,26,2,150,6,24,"",  50,1000,0],
    ["EMP-0002","Priya Sharma",  26,25,0,0,  6,20,"",  0,0,  500],
    // Canteen amount filled in: 1500 is charged and the 26 days are ignored.
    ["EMP-0003","Amit Singh",    26,26,1,200,6,26,1500,100,500,0],
]

const isEmpty = (v: unknown) => v === null || v === undefined || String(v).trim() === ""

/** Excel cell -> number; an empty cell takes the default. Text gives NaN, which validation reports. */
export function numCell(v: unknown, def: number): number {
    return isEmpty(v) ? def : Number(String(v).trim())
}

/** Excel cell -> optional amount. An empty cell means "not set", not zero. Text gives NaN. */
export function optAmount(v: unknown): number | null {
    return isEmpty(v) ? null : Number(String(v).trim())
}

export const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

/** Employee IDs are compared trimmed and case-insensitively. */
export const idKey = (id: string) => id.trim().toUpperCase()

// The template's employee rows, prefilled from the configured rules (Payroll →
// Calculation Settings). Shared by the downloads and the on-screen preview.
export function templateRows(employees: Employee[], rules: PayrollRules): (string | number)[][] {
    const md  = rules.defaults.monthDays
    const lwf = rules.lwf.employeeDefault
    return employees.map(e => [e.employeeId,`${e.firstName} ${e.lastName}`,md,md,0,0,lwf,0,"",0,0,0])
}

const norm = (v: unknown) => String(v).trim().toUpperCase().replace(/\s+/g," ")
const EMP_ID_VARIANTS = new Set(["EMPLOYEE ID","EMP ID","EMPLOYEEID","EMPID","EMPLOYEE CODE","EMP CODE","EMPCODE","EMPLOYEECODE","EMPLOYEE NO","EMP NO","EMPNO","EMPLOYEE NUMBER"])

/**
 * A sheet's rows (as SheetJS gives them with header: 1) → one ParsedRow per
 * employee line. Returns a message instead when the sheet can't be read.
 */
export function parseAttendanceRows(rawRows: unknown[][], rules: PayrollRules): ParsedRow[] | string {
    const headerIdx = rawRows.findIndex(row=>Array.isArray(row)&&row.some(cell=>EMP_ID_VARIANTS.has(norm(cell))))
    if (headerIdx===-1) return "Could not find header row with 'Employee ID' column"
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
    if (rows.length===0) return "No data rows found"
    const pick = (row: Record<string,unknown>,...aliases: string[]) => {
        for (const a of aliases) { const v=row[a.toUpperCase().replace(/\s+/g," ")]; if(v!==undefined&&String(v).trim()!=="") return v }
        return undefined
    }
    const md = rules.defaults.monthDays
    const parsed: ParsedRow[] = rows.map(({ obj: row, excelRow })=>{
        const r: ParsedRow = {
            excelRow,
            rawEmployeeId: String(pick(row,"EMPLOYEE ID","EMP ID","EMP CODE","EMPLOYEE CODE","EMPLOYEE NO","EMP NO","EMPCODE","EMPLOYEEID")??"").trim(),
            rawName:       String(pick(row,"EMPLOYEE NAME","NAME","EMPLOYEE","EMP NAME")??"").trim(),
            rawSite:       String(pick(row,"SITE","SITE NAME")??"").trim(),
            rawSiteCode:   String(pick(row,"SITE CODE","SITECODE")??"").trim(),
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
            badCells: [],
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
    if (!parsed.length) return "No valid Employee ID rows found"
    return parsed
}

/** Reads the first sheet of an uploaded workbook into rows. */
export async function readWorkbookRows(file: File): Promise<unknown[][]> {
    const XLSX = await import("xlsx")
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" })
    return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" })
}

export type UploadContext = {
    employees: Employee[]
    empMap: Map<string, Employee>
    lockedIds: Set<string>
    monthStart: Date; nextMonth: Date; monthName: string
}

/**
 * Who could be paid this month. Everyone except people still in onboarding is
 * loaded, so a leaver's last month can be paid; payroll rows already locked for
 * the month are left alone by the server, so they're reported as skipped.
 */
export async function loadUploadContext(month: number, year: number): Promise<UploadContext> {
    const [optsRes, payRes] = await Promise.all([
        fetchEmployeeOptions<Employee>({}),
        fetch(`/api/payroll?month=${month}&year=${year}`).then(r => r.ok ? r.json() : []).catch(() => []),
    ])
    const empMap = new Map<string,Employee>()
    optsRes.employees.forEach(e=>empMap.set(idKey(e.employeeId),e))
    const payRows: { employeeId: string; status: string }[] = Array.isArray(payRes) ? payRes : (payRes?.payrolls ?? [])
    return {
        employees: optsRes.employees,
        empMap,
        lockedIds: new Set(payRows.filter(p => p.status !== "DRAFT").map(p => p.employeeId)),
        monthStart: new Date(Date.UTC(year, month - 1, 1)),
        nextMonth:  new Date(Date.UTC(year, month, 1)),
        monthName:  MONTHS[month - 1],
    }
}

// The Employee ID is the only key, so a mistyped ID that belongs to someone
// else would pay that person. The name in the file is checked against the
// name on record to catch that. The file must have the full first name and
// surname, and nothing that isn't in the name on record. Case, punctuation,
// word order and a left-out middle name don't matter; first name only,
// initials ("D. Kothawale", "Aniket N") or an extra word do. A blank name is
// flagged separately.
const nameTokens = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean)

export function nameMatches(fileName: string, emp: Pick<Employee, "firstName" | "middleName" | "lastName">): boolean {
    const file = nameTokens(fileName)
    const required = nameTokens(`${emp.firstName} ${emp.lastName}`)
    const allowed = new Set([...required, ...nameTokens(emp.middleName ?? "")])
    if (file.length === 0 || required.length === 0) return false
    return required.every(t => file.includes(t)) && file.every(t => allowed.has(t))
}

/** How many times each Employee ID appears in the file. */
export function idCounts(parsed: ParsedRow[]): Map<string, number> {
    const seen = new Map<string, number>()
    parsed.forEach(r => seen.set(idKey(r.rawEmployeeId), (seen.get(idKey(r.rawEmployeeId)) ?? 0) + 1))
    return seen
}

/**
 * One row's verdict. `targetSiteId` is the site the row would be paid under;
 * someone posted elsewhere (or nowhere) is still paid, with a warning.
 */
export function classifyRow(r: ParsedRow, ctx: UploadContext, times: number, targetSiteId: string): MatchedRow {
    const emp = ctx.empMap.get(idKey(r.rawEmployeeId))
    const base = { ...r, employeeId: emp?.id, dbName: emp ? `${emp.firstName} ${emp.lastName}` : undefined, designation: emp?.designation }
    if (r.badCells.length) return { ...base, state: "error", note: `Row ${r.excelRow}: ${r.badCells.join("; ")}` }
    if (times > 1) return { ...base, state: "error", note: `Row ${r.excelRow}: this Employee ID is in the file ${times} times — keep one row` }
    if (!emp) return { ...base, state: "skip", note: "Employee ID not found" }
    // A locked row can't change whatever else is true, so say that first.
    if (ctx.lockedIds.has(emp.id)) return { ...base, state: "skip", note: `${ctx.monthName} payroll is locked for this employee — unlock the month first` }
    const doj = emp.dateOfJoining ? new Date(emp.dateOfJoining) : null
    const dol = emp.dateOfLeaving ? new Date(emp.dateOfLeaving) : null
    if (doj && doj >= ctx.nextMonth) return { ...base, state: "skip", note: `Joined ${fmtDay(doj)}, after ${ctx.monthName}` }
    if (dol && dol < ctx.monthStart) return { ...base, state: "skip", note: `Left ${fmtDay(dol)}, before ${ctx.monthName}` }
    if (!dol && emp.status && ["RESIGNED","TERMINATED","INACTIVE"].includes(emp.status))
        return { ...base, state: "skip", note: `Status is ${emp.status.toLowerCase()} with no leaving date` }
    const warnings: string[] = []
    if (!r.rawName.trim()) warnings.push(`No name in the file to confirm this ID (${emp.firstName} ${emp.lastName})`)
    else if (!nameMatches(r.rawName, emp)) warnings.push(`Name in file "${r.rawName}" doesn't match this ID (${emp.firstName} ${emp.lastName}) — check the Employee ID`)
    if (dol && dol < ctx.nextMonth) warnings.push(`Left ${fmtDay(dol)} — final month`)
    const posted = emp.deployments?.[0]
    if (!posted) warnings.push("Not posted at any site")
    else if (posted.siteId !== targetSiteId) warnings.push(`Posted at ${posted.site?.name ?? "another site"}`)
    return { ...base, state: warnings.length ? "warn" : "ok", note: warnings.join(" · ") || undefined }
}

/** Staff on the rolls this month (posted at `siteId`, or at any site) who aren't in the file. */
export function missingStaff(ctx: UploadContext, parsed: ParsedRow[], siteId?: string): { label: string; site: string }[] {
    const inFile = new Set(parsed.map(r => idKey(r.rawEmployeeId)))
    return ctx.employees
        .filter(e => siteId ? e.deployments?.[0]?.siteId === siteId : !!e.deployments?.[0])
        .filter(e => e.status === "ACTIVE" || e.status === "ON_LEAVE")
        .filter(e => !e.dateOfJoining || new Date(e.dateOfJoining) < ctx.nextMonth)
        .filter(e => !inFile.has(idKey(e.employeeId)))
        .map(e => ({ label: `${e.firstName} ${e.lastName} (${e.employeeId})`, site: e.deployments?.[0]?.site?.name ?? "" }))
}

/** The attendance part of a /api/payroll/calculate request for these rows. */
export function attendancePayload(rows: MatchedRow[]) {
    return rows.map(r=>({
        employeeId: r.employeeId!, monthDays:r.monthDays, workedDays:r.days,
        otDays:r.otDays, otherDeductions:r.otherDeduction, lwf:r.lwf,
        canteenDays:r.canteenDays, canteenAmount:r.canteenAmount, penalty:r.penalty, advance:r.advance, productionIncentive:r.productionIncentive,
    }))
}

export const isReady = (r: MatchedRow) => (r.state === "ok" || r.state === "warn") && !!r.employeeId
