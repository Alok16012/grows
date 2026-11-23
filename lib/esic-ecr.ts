// ESIC monthly contribution upload file ("ESIC ECR"), in the ESIC portal's
// own MC Excel template: Sheet1 with six columns, every cell text, saved as
// .xls (Excel 97-2003) — the portal rejects anything else.
//
//   A IP Number (10 digits)
//   B IP Name (only alphabets and space)
//   C No of Days for which wages paid/payable during the month (whole number, rounded up)
//   D Total Monthly Wages
//   E Reason Code for Zero working days (0 for all other cases)
//   F Last Working Day (DD/MM/YYYY) — only with 0 days and reason 2 (left service)
//
// Server-only (uses the xlsx writer).
import * as XLSX from "xlsx"

export type EsicEcrMember = {
    ipNumber: string | null
    name: string
    empCode: string
    days: number
    wages: number
    leftOn?: Date | null      // date of leaving, if any
}

const HEADERS = [
    "IP Number \n(10 Digits)",
    "IP Name\n( Only alphabets and space )",
    "No of Days for which wages paid/payable during the month",
    "Total Monthly Wages",
    " Reason Code for Zero workings days(numeric only; provide 0 for all other reasons- Click on the link for reference)",
    " Last Working Day\n( Format DD/MM/YYYY  or DD-MM-YYYY)",
]
const WIDTHS = [16.86, 31.21, 27.86, 25.43, 30.21, 27.43]

const ipOf = (v: string | null) => String(v ?? "").replace(/\D/g, "")
const nameOf = (v: string) => v.replace(/[^A-Za-z ]+/g, " ").replace(/\s+/g, " ").trim()
const ddmmyyyy = (d: Date) => {
    // IST calendar day
    const t = new Date(d.getTime() + 5.5 * 3600 * 1000)
    return `${String(t.getUTCDate()).padStart(2, "0")}/${String(t.getUTCMonth() + 1).padStart(2, "0")}/${t.getUTCFullYear()}`
}

/**
 * Builds the .xls. Anyone whose last working date (exit / F&F, else Employee
 * Master) is on or before the month's end gets reason 2 (left service) with
 * that date — client rule, also for a leaver who worked part of the month.
 * Everyone else gets 0 and no date.
 * Members without a valid 10-digit IP number can't be uploaded: they go on a
 * second sheet so payroll can fix them, never silently dropped.
 */
export function buildEsicEcrXls(members: EsicEcrMember[], period: { month: number; year: number }): { file: Buffer; rows: number; missing: number } {
    const monthEnd = new Date(Date.UTC(period.year, period.month, 0, 23, 59, 59))
    const daysInMonth = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate()
    const ok: string[][] = []
    const missing: string[][] = []
    for (const m of members) {
        const ip = ipOf(m.ipNumber)
        // Whole days, rounded up, never more than the month has (the portal rejects more; extra days stay paid in the wages).
        const days = Math.min(daysInMonth, Math.max(0, Math.ceil(Number(m.days) || 0)))
        const wages = days > 0 ? Math.max(0, Math.round(Number(m.wages) || 0)) : 0
        // Leaver (F&F last working date on or before the month end): reason 2 + that date, worked days or not.
        const left = m.leftOn && m.leftOn.getTime() <= monthEnd.getTime() ? m.leftOn : null
        if (ip.length !== 10) {
            missing.push([m.empCode, nameOf(m.name), ip || "(blank)", String(days), String(wages)])
            continue
        }
        ok.push([ip, nameOf(m.name), String(days), String(wages), left ? "2" : "0", left ? ddmmyyyy(left) : ""])
    }

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...ok])
    // Every cell text ("@"), as the portal asks.
    for (const addr of Object.keys(ws)) {
        if (addr.startsWith("!")) continue
        const c = ws[addr] as XLSX.CellObject
        c.t = "s"; c.v = String(c.v ?? ""); c.z = "@"
    }
    ws["!cols"] = WIDTHS.map(wch => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
    if (missing.length) {
        const ms = XLSX.utils.aoa_to_sheet([
            ["Not in the upload — no valid 10-digit IP number. Add the ESIC IP number in Employee Master, then download again."],
            ["Emp Code", "Name", "IP Number", "Days", "Wages"],
            ...missing,
        ])
        ms["!cols"] = [{ wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 8 }, { wch: 12 }]
        XLSX.utils.book_append_sheet(wb, ms, "Missing IP number")
    }
    const file = XLSX.write(wb, { bookType: "xls", type: "buffer" }) as Buffer
    return { file, rows: ok.length, missing: missing.length }
}
