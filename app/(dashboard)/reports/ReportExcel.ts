// The complete inspection report as one Excel workbook, a sheet per section:
// Dashboard, Summary, Pareto Analysis, Inspector-Wise Comparison, Shift-Wise
// Comparison, Top 5 Defects and Detailed Inspection Data (client request, Nov
// 2026, modelled on their monthly MIS workbook).
//
// Built with ExcelJS because the sheets need formatting (fills, borders, number
// formats, frozen headers) and pictures, which the `xlsx` package used for the
// single-sheet exports cannot write. ExcelJS cannot create native Excel charts,
// so each chart goes in as a picture — the same images the PDF uses. All the
// numbers are real cells: quantities are numbers and percentages are fractions
// with a percent format, so they can be summed, sorted and filtered in Excel.
//
// No DOM access here: the page captures the charts and saves the result.

import type { Workbook, Worksheet, Cell } from "exceljs"

export type ReportExcelInput = {
    data: any
    siteName: string
    project: string
    inspector: string
    period: string
    generatedOn?: Date
    /** PNG data URLs, captured from the page's chart zone. Any may be missing. */
    chartImages?: Partial<Record<"pie" | "trend" | "partWise" | "location" | "inspector" | "shift" | "pareto" | "week" | "dayDefects", string | null>>
}

// Same three quantity colours as the charts and the PDF.
const K = {
    navy: "FF0A1F4F", white: "FFFFFFFF", text: "FF1F2937", muted: "FF6B7280",
    green: "FF16A34A", orange: "FFD97706", red: "FFDC2626",
    greenBg: "FFEAF7EE", orangeBg: "FFFDF3E3", redBg: "FFFDECEC",
    band: "FFF4F6FB", border: "FFD5DAE4", total: "FFE8ECF5",
}
const INT = "#,##0"
const PCT = "0.00%"
const DATE = "dd-mmm-yy"
const IST_MS = 5.5 * 60 * 60 * 1000

type Tone = "green" | "orange" | "red"
type Col = {
    header: string
    key: string
    width: number
    fmt?: string
    tone?: Tone
    align?: "left" | "right" | "center"
    /** How the total row fills this column: a sum, a fixed value, or blank. */
    total?: "sum" | ((rows: Record<string, any>[]) => any)
}

const num = (v: unknown) => Number(v) || 0
const share = (part: number, total: number) => (total > 0 ? part / total : 0)
const ppm = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1_000_000) : 0)
const border = () => {
    const side = { style: "thin" as const, color: { argb: K.border } }
    return { top: side, left: side, bottom: side, right: side }
}
const fill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } })

/** A calendar day in IST as an Excel date (ExcelJS writes dates as UTC). */
function istDay(value: unknown): Date | null {
    if (!value) return null
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00Z`)
    const t = new Date(value as any).getTime()
    if (Number.isNaN(t)) return null
    const d = new Date(t + IST_MS)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Title band, then one line saying what the report covers. Returns the next free row. */
function heading(ws: Worksheet, title: string, input: ReportExcelInput, span: number): number {
    ws.mergeCells(1, 1, 1, span)
    const t = ws.getCell(1, 1)
    t.value = title
    t.font = { bold: true, size: 14, color: { argb: K.white } }
    t.fill = fill(K.navy)
    t.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
    ws.getRow(1).height = 28
    ws.mergeCells(2, 1, 2, span)
    const m = ws.getCell(2, 1)
    const on = (input.generatedOn ?? new Date()).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    m.value = `Site: ${input.siteName}   |   Project: ${input.project}   |   Inspector: ${input.inspector}   |   Period: ${input.period}   |   Generated: ${on}`
    m.font = { size: 10, color: { argb: K.muted } }
    m.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
    ws.getRow(2).height = 20
    return 4
}

/** A small section label above a table. */
function label(ws: Worksheet, row: number, col: number, text: string, span = 4) {
    ws.mergeCells(row, col, row, col + span - 1)
    const c = ws.getCell(row, col)
    c.value = text
    c.font = { bold: true, size: 11, color: { argb: K.navy } }
    c.alignment = { vertical: "middle" }
    ws.getRow(row).height = 20
}

function styleBody(c: Cell, col: Col, zebra: boolean) {
    c.border = border()
    c.alignment = { vertical: "middle", horizontal: col.align ?? (col.fmt ? "right" : "left") }
    if (col.fmt) c.numFmt = col.fmt
    c.font = { size: 10, color: { argb: col.tone ? K[col.tone] : K.text }, bold: !!col.tone }
    if (zebra) c.fill = fill(K.band)
}

/**
 * A formatted table: navy header, bordered rows with light banding, an optional
 * bold total row. Sets column widths. Returns the next free row.
 */
function table(ws: Worksheet, top: number, left: number, cols: Col[], rows: Record<string, any>[], opts: { totalLabel?: string; empty?: string } = {}): number {
    cols.forEach((col, i) => {
        const c = ws.getCell(top, left + i)
        c.value = col.header
        c.font = { bold: true, size: 10, color: { argb: K.white } }
        c.fill = fill(K.navy)
        c.border = border()
        c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
        const column = ws.getColumn(left + i)
        column.width = Math.max(column.width ?? 0, col.width)
    })
    ws.getRow(top).height = 30
    let r = top + 1
    if (!rows.length) {
        ws.mergeCells(r, left, r, left + cols.length - 1)
        const c = ws.getCell(r, left)
        c.value = opts.empty ?? "No data for this period"
        c.font = { italic: true, size: 10, color: { argb: K.muted } }
        c.alignment = { horizontal: "center" }
        return r + 2
    }
    rows.forEach((row, n) => {
        cols.forEach((col, i) => {
            const c = ws.getCell(r, left + i)
            c.value = row[col.key] ?? (col.fmt ? 0 : "")
            styleBody(c, col, n % 2 === 1)
        })
        r++
    })
    if (opts.totalLabel) {
        cols.forEach((col, i) => {
            const c = ws.getCell(r, left + i)
            c.value = i === 0 ? opts.totalLabel!
                : col.total === "sum" ? rows.reduce((a, row) => a + num(row[col.key]), 0)
                : typeof col.total === "function" ? col.total(rows)
                : ""
            styleBody(c, col, false)
            c.font = { bold: true, size: 10, color: { argb: col.tone ? K[col.tone] : K.text } }
            c.fill = fill(K.total)
        })
        r++
    }
    return r + 1
}

/** Places a captured chart; `width` in pixels, height from the capture's own shape. */
function picture(wb: Workbook, ws: Worksheet, dataUrl: string | null | undefined, col: number, row: number, width: number, shape: number) {
    if (!dataUrl || !dataUrl.startsWith("data:image/png")) return false
    const id = wb.addImage({ base64: dataUrl, extension: "png" })
    // tl is zero-based; keep the chart's proportions so text isn't squashed.
    ws.addImage(id, { tl: { col: col - 1, row: row - 1 }, ext: { width, height: Math.round(width / shape) } })
    return true
}

// Columns shared by the quantity tables (part, inspector, shift, day, site).
const qtyCols = (first: Col, extra: Col[] = []): Col[] => [
    first,
    ...extra,
    { header: "Total Inspected", key: "inspected", width: 16, fmt: INT, tone: "green", total: "sum" },
    { header: "Total Accepted", key: "accepted", width: 16, fmt: INT, tone: "green", total: "sum" },
    { header: "Total Rework", key: "rework", width: 14, fmt: INT, tone: "orange", total: "sum" },
    { header: "Total Rejected", key: "rejected", width: 14, fmt: INT, tone: "red", total: "sum" },
    { header: "Acceptance (%)", key: "acceptPct", width: 15, fmt: PCT, total: rows => share(sum(rows, "accepted"), sum(rows, "inspected")) },
    { header: "Rework (%)", key: "reworkPct", width: 13, fmt: PCT, total: rows => share(sum(rows, "rework"), sum(rows, "inspected")) },
    { header: "Rejected (%)", key: "rejectPct", width: 13, fmt: PCT, total: rows => share(sum(rows, "rejected"), sum(rows, "inspected")) },
    { header: "PPM (Rework)", key: "reworkPpm", width: 14, fmt: INT, total: rows => ppm(sum(rows, "rework"), sum(rows, "inspected")) },
    { header: "PPM (Rejected)", key: "rejectPpm", width: 15, fmt: INT, total: rows => ppm(sum(rows, "rejected"), sum(rows, "inspected")) },
]
const sum = (rows: Record<string, any>[], key: string) => rows.reduce((a, r) => a + num(r[key]), 0)

/** API aggregate row → the keys `qtyCols` reads. */
function qtyRow(name: Record<string, any>, a: any): Record<string, any> {
    const inspected = num(a.totalInspected), accepted = num(a.totalAccepted), rework = num(a.totalRework), rejected = num(a.totalRejected)
    return {
        ...name, inspected, accepted, rework, rejected,
        acceptPct: share(accepted, inspected), reworkPct: share(rework, inspected), rejectPct: share(rejected, inspected),
        reworkPpm: ppm(rework, inspected), rejectPpm: ppm(rejected, inspected),
    }
}

export async function buildReportWorkbook(input: ReportExcelInput): Promise<ArrayBuffer> {
    const mod: any = await import("exceljs")
    const ExcelJS = mod.default?.Workbook ? mod.default : mod
    const wb: Workbook = new ExcelJS.Workbook()
    wb.creator = "Growus ERP"
    wb.created = input.generatedOn ?? new Date()

    const { data } = input
    const img = input.chartImages ?? {}
    const s = data?.summary ?? {}
    const total = num(s.totalInspected)
    const defects: any[] = data?.topDefects ?? []
    const shiftRecorded = data?.dimensionsPresent?.shift !== false

    // ── 1. Dashboard ────────────────────────────────────────────────────────
    {
        const ws = wb.addWorksheet("Dashboard", { views: [{ showGridLines: false }] })
        // A margin, then 12 equal columns (~89px each): a tile spans 4, a chart 6.
        const SPAN = 13
        for (let c = 1; c <= SPAN; c++) ws.getColumn(c).width = c === 1 ? 3 : 12
        heading(ws, "DASHBOARD — Quality Inspection Report", input, SPAN)
        // Three rows of three tiles: quantity, rate, PPM for each colour.
        const tiles: [string, number | string, string, string, Tone][][] = [
            [["Total Inspected", total, INT, "Quantity checked (units)", "green"],
             ["Total Accepted", num(s.totalAccepted), INT, "Quantity passed (units)", "green"],
             ["Acceptance Rate (%)", share(num(s.totalAccepted), total), PCT, "Accepted / Inspected x 100", "green"]],
            [["Total Rework", num(s.totalRework), INT, "Quantity sent for rework (units)", "orange"],
             ["Rework Rate (%)", share(num(s.totalRework), total), PCT, "Rework / Inspected x 100", "orange"],
             ["Rework PPM", num(s.reworkPPM), INT, "Rework per million inspected", "orange"]],
            [["Total Rejected", num(s.totalRejected), INT, "Quantity rejected (units)", "red"],
             ["Rejected Rate (%)", share(num(s.totalRejected), total), PCT, "Rejected / Inspected x 100", "red"],
             ["Rejected PPM", num(s.rejectionPPM), INT, "Rejected per million inspected", "red"]],
        ]
        let r = 4
        for (const rowTiles of tiles) {
            rowTiles.forEach(([name, value, fmt, hint, tone], i) => {
                const c = 2 + i * 4
                const bg = fill(K[`${tone}Bg` as const])
                for (const [dr, text, font, f] of [
                    [0, name, { bold: true, size: 10, color: { argb: K.text } }, undefined],
                    [1, value, { bold: true, size: 18, color: { argb: K[tone] } }, fmt],
                    [2, hint, { size: 9, color: { argb: K.muted } }, undefined],
                ] as const) {
                    ws.mergeCells(r + dr, c, r + dr, c + 3)
                    const cell = ws.getCell(r + dr, c)
                    cell.value = text as any
                    cell.font = font as any
                    cell.fill = bg
                    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
                    if (f) cell.numFmt = f
                }
            })
            ws.getRow(r).height = 18; ws.getRow(r + 1).height = 30; ws.getRow(r + 2).height = 16
            r += 4
        }
        ws.mergeCells(r, 2, r, SPAN)
        const o = ws.getCell(r, 2)
        o.value = `Overall PPM (rework + rejected, per million inspected): ${num(s.overallPPM).toLocaleString("en-IN")}`
        o.font = { bold: true, size: 10, color: { argb: K.text } }
        r += 2

        // The charts of the client's own dashboard, two across and in its order,
        // then the two it doesn't have. A missing chart leaves no gap.
        const BARS = "Green = total inspected, orange = total rework, red = total rejected."
        const charts: [title: string, url: string | null | undefined, shape: number, caption: string][] = [
            ["Defect Wise (Pareto)", img.pareto, 700 / 320, "Bars: orange = rework defects, red = rejected defects. Line: cumulative %."],
            ["Week Wise", img.week, 700 / 300, BARS],
            ["Shift Wise", shiftRecorded ? img.shift : null, 700 / 300, BARS],
            ["Inspector Wise", img.inspector, 700 / 340, BARS + " Busiest 15."],
            ["Overall Status", img.pie, 500 / 280, "Green = accepted, orange = rework, red = rejected. Whole ring = total inspected."],
            ["Part Wise", img.partWise, 700 / 340, BARS + " Busiest 12; all parts are on the Summary sheet."],
            ["Rework / Rejection Qty (day wise)", img.dayDefects, 700 / 300, "Orange = total rework, red = total rejected, per day."],
            ["Daily Performance Trend", img.trend, 700 / 260, BARS + " Quantity per day."],
            ["Location Wise", img.location, 700 / 260, "Green = total inspected quantity."],
        ]
        const shown = charts.filter(c => !!c[1])
        const WIDTH = 520 // just under 6 columns
        for (let i = 0; i < shown.length; i += 2) {
            const pair = shown.slice(i, i + 2)
            const rowsUsed = Math.max(...pair.map(([, , shape]) => Math.ceil(WIDTH / shape / 20))) + 1
            pair.forEach(([title, url, shape, caption], k) => {
                const c = 2 + k * 6
                label(ws, r, c, title, 6)
                picture(wb, ws, url, c, r + 1, WIDTH, shape)
                ws.mergeCells(r + rowsUsed + 1, c, r + rowsUsed + 1, c + 5)
                const l = ws.getCell(r + rowsUsed + 1, c)
                l.value = caption
                l.font = { size: 9, color: { argb: K.muted } }
                l.alignment = { wrapText: true, vertical: "top" }
            })
            ws.getRow(r + rowsUsed + 1).height = 26
            r += rowsUsed + 3
        }
    }

    // ── 2. Summary ──────────────────────────────────────────────────────────
    {
        const ws = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] })
        let r = heading(ws, `FINAL INSPECTION SUMMARY — ${input.period}`, input, 11)
        label(ws, r, 1, "Site-wise summary")
        const sites: any[] = data?.siteWise?.length ? data.siteWise : [{ siteName: input.siteName, ...{ totalInspected: total, totalAccepted: s.totalAccepted, totalRework: s.totalRework, totalRejected: s.totalRejected } }]
        // The client's own summary columns. Their "Total FG Qty." is Accepted minus
        // Rejected (cell K4 of their SUMMARY sheet), kept exactly as they compute it.
        r = table(ws, r + 1, 1, [
            { header: "Part Model / Site", key: "name", width: 34 },
            { header: "Total Inspection", key: "inspected", width: 16, fmt: INT, tone: "green", total: "sum" },
            { header: "Total Qty. Accepted", key: "accepted", width: 16, fmt: INT, tone: "green", total: "sum" },
            { header: "Total Qty. Rework", key: "rework", width: 14, fmt: INT, tone: "orange", total: "sum" },
            { header: "Total Qty. Rejected", key: "rejected", width: 14, fmt: INT, tone: "red", total: "sum" },
            { header: "Rework (%)", key: "reworkPct", width: 15, fmt: PCT, total: rows => share(sum(rows, "rework"), sum(rows, "inspected")) },
            { header: "Rejected (%)", key: "rejectPct", width: 13, fmt: PCT, total: rows => share(sum(rows, "rejected"), sum(rows, "inspected")) },
            { header: "PPM (REWORK)", key: "reworkPpm", width: 13, fmt: INT, total: rows => ppm(sum(rows, "rework"), sum(rows, "inspected")) },
            { header: "PPM (REJECTED)", key: "rejectPpm", width: 14, fmt: INT, total: rows => ppm(sum(rows, "rejected"), sum(rows, "inspected")) },
            { header: "Total FG Qty.", key: "fg", width: 15, fmt: INT, total: "sum" },
            { header: "Acceptance (%)", key: "acceptPct", width: 14, fmt: PCT, total: rows => share(sum(rows, "accepted"), sum(rows, "inspected")) },
        ], sites.map(x => { const q = qtyRow({ name: x.siteName }, x); return { ...q, fg: q.accepted - q.rejected } }), { totalLabel: "Total" })

        label(ws, r, 1, "Part-Wise Summary")
        r = table(ws, r + 1, 1,
            qtyCols({ header: "Part Name", key: "name", width: 34 }),
            (data?.partWise ?? []).map((p: any) => qtyRow({ name: p.partNumber ? `${p.partName}  (${p.partNumber})` : p.partName }, p)),
            { totalLabel: "Grand Total" })

        label(ws, r, 1, "Day-Wise Summary")
        const days = (data?.dayWise ?? []).map((d: any) => qtyRow({ name: istDay(d.date) ?? d.date }, d))
        r = table(ws, r + 1, 1, qtyCols({ header: "Inspection Date", key: "name", width: 34, fmt: DATE, align: "left" }), days, { totalLabel: "Grand Total" })

        // Week of the month, as in the client's own workbook (days 1-7, 8-14, …).
        label(ws, r, 1, "Week-Wise Summary")
        const weeks = new Map<number, any>()
        for (const d of data?.dayWise ?? []) {
            const day = Number(String(d.date).slice(8, 10)) || 1
            const w = Math.ceil(day / 7)
            const a = weeks.get(w) ?? { totalInspected: 0, totalAccepted: 0, totalRework: 0, totalRejected: 0 }
            a.totalInspected += num(d.totalInspected); a.totalAccepted += num(d.totalAccepted); a.totalRework += num(d.totalRework); a.totalRejected += num(d.totalRejected)
            weeks.set(w, a)
        }
        table(ws, r + 1, 1, qtyCols({ header: "Week", key: "name", width: 34 }),
            [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([w, a]) => qtyRow({ name: `Week ${w}` }, a)), { totalLabel: "Grand Total" })
    }

    // ── 3. Pareto Analysis ──────────────────────────────────────────────────
    {
        const ws = wb.addWorksheet("Pareto Analysis", { views: [{ showGridLines: false }] })
        let r = heading(ws, "PARETO ANALYSIS — Defect Frequency", input, 16)
        const allQty = defects.reduce((a, d) => a + num(d.count), 0)
        let running = 0
        const rows = defects.map((d, i) => {
            running += num(d.count)
            return { rank: i + 1, name: d.defectName, qty: num(d.count), rework: num(d.rework), rejected: num(d.rejected), cumQty: running, cumPct: share(running, allQty) }
        })
        label(ws, r, 1, defects.length >= 15 ? "Top 15 defects by quantity" : "Defects by quantity")
        table(ws, r + 1, 1, [
            { header: "#", key: "rank", width: 5, align: "center" },
            { header: "DEFECTS", key: "name", width: 30 },
            { header: "DEFECT QTY", key: "qty", width: 12, fmt: INT, total: "sum" },
            { header: "REWORK", key: "rework", width: 12, fmt: INT, tone: "orange", total: "sum" },
            { header: "REJECTED", key: "rejected", width: 12, fmt: INT, tone: "red", total: "sum" },
            { header: "CUMM QTY", key: "cumQty", width: 12, fmt: INT },
            { header: "CUMM%", key: "cumPct", width: 11, fmt: PCT },
        ], rows, { totalLabel: "TOTAL", empty: "No defects recorded for this period" })
        for (let c = 9; c <= 16; c++) ws.getColumn(c).width = 13
        if (picture(wb, ws, img.pareto, 9, r + 1, 720, 700 / 320)) {
            const below = r + 2 + Math.ceil(720 / (700 / 320) / 20)
            ws.mergeCells(below, 9, below, 16)
            const l = ws.getCell(below, 9)
            l.value = "Bars: orange = rework defects, red = rejected defects (left scale). Line: cumulative % (right scale)."
            l.font = { size: 9, color: { argb: K.muted } }
        }

    }

    // ── 4 & 5. Inspector-Wise and Shift-Wise Comparison ─────────────────────
    const comparison = (sheet: string, title: string, first: string, list: any[], nameKey: string, url: string | null | undefined, empty: string) => {
        const ws = wb.addWorksheet(sheet, { views: [{ showGridLines: false }] })
        const r = heading(ws, title, input, 10)
        const next = table(ws, r, 1, qtyCols({ header: first, key: "name", width: 30 }), list.map(x => qtyRow({ name: x[nameKey] }, x)), { totalLabel: "Grand Total", empty })
        if (picture(wb, ws, url, 1, next + 1, 760, 700 / (sheet.startsWith("Shift") ? 300 : 340))) {
            const below = next + 2 + Math.ceil(760 / (700 / 340) / 20)
            ws.mergeCells(below, 1, below, 10)
            const l = ws.getCell(below, 1)
            l.value = `Green = total inspected, orange = total rework, red = total rejected.${!sheet.startsWith("Shift") && list.length > 15 ? " Chart shows the 15 busiest; the table lists everyone." : ""}`
            l.font = { size: 9, color: { argb: K.muted } }
        }
    }
    comparison("Inspector-Wise Comparison", "INSPECTOR-WISE COMPARISON", "Inspector Name", data?.inspectorWise ?? [], "inspectorName", img.inspector, "No inspections for this period")
    comparison("Shift-Wise Comparison", "SHIFT-WISE COMPARISON", "Shift", shiftRecorded ? data?.shiftWise ?? [] : [], "shiftName", shiftRecorded ? img.shift : null,
        "These inspection forms do not record a shift")

    // ── 6. Top 5 Defects ────────────────────────────────────────────────────
    {
        const ws = wb.addWorksheet("Top 5 Defects", { views: [{ showGridLines: false }] })
        const r = heading(ws, "TOP 5 DEFECTS", input, 6)
        const next = table(ws, r, 1, [
            { header: "Rank", key: "rank", width: 8, align: "center" },
            { header: "Defect", key: "name", width: 34 },
            { header: "Rework Defects", key: "rework", width: 16, fmt: INT, tone: "orange", total: "sum" },
            { header: "Rejected Defects", key: "rejected", width: 16, fmt: INT, tone: "red", total: "sum" },
            { header: "Total Qty", key: "qty", width: 14, fmt: INT, total: "sum" },
            { header: "Share of all defects (%)", key: "sharePct", width: 22, fmt: PCT, total: rows => rows.reduce((a, x) => a + num(x.sharePct), 0) },
        ], defects.slice(0, 5).map((d, i) => ({ rank: i + 1, name: d.defectName, rework: num(d.rework), rejected: num(d.rejected), qty: num(d.count), sharePct: num(d.percentage) / 100 })),
            { totalLabel: "Total", empty: "No defects recorded for this period" })
        const sp = data?.defectSplit
        const spTotal = num(sp?.exact) + num(sp?.estimated) + num(sp?.unclassified)
        if (sp && spTotal > 0 && num(sp.estimated) > 0) {
            ws.mergeCells(next, 1, next + 1, 6)
            const n = ws.getCell(next, 1)
            n.value = `Rework / rejected split follows each inspection's own rework and rejected totals. ${(share(num(sp.estimated), spTotal) * 100).toFixed(2)}% of the defect quantity is from inspections with both, where the split is in proportion.`
            n.font = { size: 9, italic: true, color: { argb: K.muted } }
            n.alignment = { wrapText: true, vertical: "top" }
        }
    }

    // ── 7. Detailed Inspection Data ─────────────────────────────────────────
    {
        const ws = wb.addWorksheet("Detailed Inspection Data")
        const records: any[] = data?.records ?? []
        const fields: any[] = data?.formFields ?? []
        // Defect columns in form order, only those recorded at least once in the
        // period (a multi-project view can carry hundreds of unused defects).
        //
        // Answers are matched to a column by trimmed, case-insensitive label —
        // the same key the API uses to build `formFields`. A record's answers
        // are keyed by the label exactly as the form has it, and some labels
        // carry stray spaces ("LEQUERE NOT OK "); looked up as-is, those
        // quantities were silently left out of the sheet.
        const keyOf = (label: unknown) => String(label ?? "").trim().toLowerCase()
        const answers: Map<string, string[]>[] = records.map(rec => {
            const m = new Map<string, string[]>()
            for (const [label, value] of Object.entries((rec.fields ?? {}) as Record<string, string>)) {
                const k = keyOf(label)
                m.set(k, [...(m.get(k) ?? []), String(value ?? "")])
            }
            return m
        })
        // Quantities under variants of one label add up; text answers are joined.
        const qtyOf = (i: number, label: string) => (answers[i].get(keyOf(label)) ?? []).reduce((a, v) => a + num(v), 0)
        const textOf = (i: number, label: string) => (answers[i].get(keyOf(label)) ?? []).filter(v => v !== "").join(", ")

        const defectLabels: string[] = fields.filter(f => f.category === "DEFECT").map(f => f.label)
            .filter(l => records.some((_, i) => qtyOf(i, l) > 0))
        // Other answers the fixed columns don't already show.
        const extraLabels: string[] = fields.filter(f => f.category !== "DEFECT" && !f.fixedColumn).map(f => f.label)
            .filter(l => records.some((_, i) => textOf(i, l) !== ""))

        // The client's REMARK column: a form field called "Remark(s)", when there is one.
        const remarkLabel = extraLabels.find(l => /^remarks?$/i.test(l.trim()))
        const otherLabels = extraLabels.filter(l => l !== remarkLabel)

        // Column order of the client's own daily sheet: the ten fixed columns, a
        // column per defect, then INSPECTOR NAME, TOTAL (defects added up),
        // REMARK and DIFFERENCE (TOTAL minus rework + rejected, which should be
        // 0). What the app knows beyond that follows on the right.
        const D0 = 11 // first defect column
        const nDef = defectLabels.length
        const cols: Col[] = [
            { header: "INSP. DATE", key: "date", width: 13, fmt: DATE, align: "left" },
            { header: "SHIFT", key: "shift", width: 9, align: "center" },
            { header: "PART NO.", key: "partNumber", width: 14 },
            { header: "PART NAME", key: "partName", width: 32 },
            { header: "INSPECTED QTY", key: "inspected", width: 13, fmt: INT, tone: "green", total: "sum" },
            { header: "ACCEPTED QTY", key: "accepted", width: 13, fmt: INT, tone: "green", total: "sum" },
            { header: "REWORK QTY", key: "rework", width: 11, fmt: INT, tone: "orange", total: "sum" },
            { header: "REWORK %", key: "reworkPct", width: 10, fmt: PCT, total: rows => share(sum(rows, "rework"), sum(rows, "inspected")) },
            { header: "REJECTED QTY", key: "rejected", width: 12, fmt: INT, tone: "red", total: "sum" },
            { header: "REJECTED %", key: "rejectPct", width: 11, fmt: PCT, total: rows => share(sum(rows, "rejected"), sum(rows, "inspected")) },
            ...defectLabels.map((l, k): Col => ({ header: l.toUpperCase(), key: `d${k}`, width: 11, fmt: INT, total: "sum" })),
            { header: "INSPECTOR NAME", key: "inspector", width: 24 },
            { header: "TOTAL", key: "defectTotal", width: 10, fmt: INT, total: "sum" },
            { header: "REMARK", key: "remark", width: 22 },
            { header: "DIFFERENCE", key: "difference", width: 13, fmt: INT, total: "sum" },
            { header: "REWORK PPM", key: "reworkPpm", width: 11, fmt: INT, total: rows => ppm(sum(rows, "rework"), sum(rows, "inspected")) },
            { header: "REJECTED PPM", key: "rejectPpm", width: 12, fmt: INT, total: rows => ppm(sum(rows, "rejected"), sum(rows, "inspected")) },
            { header: "SITE", key: "site", width: 24 },
            { header: "PROJECT", key: "project", width: 22 },
            { header: "LOCATION", key: "location", width: 16 },
            ...otherLabels.map((l, k): Col => ({ header: l.toUpperCase(), key: `x${k}`, width: 18 })),
        ]
        const r = heading(ws, "DAILY INSPECTION REPORT — Detailed Inspection Data", input, Math.min(cols.length, 16))
        const rows = records.map((rec, n) => {
            const inspected = num(rec.inspected), rework = num(rec.rework), rejected = num(rec.rejected)
            const defectQty = defectLabels.map(l => qtyOf(n, l))
            const defectTotal = defectQty.reduce((a, v) => a + v, 0)
            const row: Record<string, any> = {
                date: istDay(rec.date) ?? "", shift: rec.shift || "", partNumber: rec.partNumber || "", partName: rec.partName || "",
                inspected, accepted: num(rec.accepted), rework, rejected,
                reworkPct: share(rework, inspected), rejectPct: share(rejected, inspected),
                inspector: rec.inspector || "", defectTotal, remark: remarkLabel ? textOf(n, remarkLabel) : "",
                difference: defectTotal - (rejected + rework),
                reworkPpm: ppm(rework, inspected), rejectPpm: ppm(rejected, inspected),
                site: rec.site || "", project: rec.project || "", location: rec.location || "",
            }
            // A blank defect cell reads better than a wall of zeros, and still sums.
            defectQty.forEach((v, k) => { row[`d${k}`] = v > 0 ? v : null })
            otherLabels.forEach((l, k) => { row[`x${k}`] = textOf(n, l) })
            return row
        }).sort((a, b) => (a.date instanceof Date && b.date instanceof Date ? a.date.getTime() - b.date.getTime() : 0))
        table(ws, r, 1, cols, rows, { totalLabel: "TOTAL", empty: "No inspections for this period" })

        if (rows.length) {
            // Live formulas where the client's sheet has them, each with its value
            // already worked out so the file reads the same before Excel recalculates.
            const L = (c: number) => ws.getColumn(c).letter
            const first = r + 1, last = r + rows.length, totalRow = last + 1
            const cTotal = D0 + nDef + 1, cDiff = cTotal + 2
            const ratio = (top: string, R: number) => `IF(E${R}=0,0,${top}${R}/E${R})`
            const put = (R: number, c: number, formula: string, result: number) => { ws.getCell(R, c).value = { formula, result } as any }
            rows.forEach((row, k) => {
                const R = first + k
                // Blank defect cells: `table` writes 0 for an empty numeric cell; clear those.
                for (let d = 0; d < nDef; d++) if (row[`d${d}`] === null) ws.getCell(R, D0 + d).value = null
                put(R, 8, ratio("G", R), row.reworkPct)
                put(R, 10, ratio("I", R), row.rejectPct)
                if (nDef) put(R, cTotal, `SUM(${L(D0)}${R}:${L(D0 + nDef - 1)}${R})`, row.defectTotal)
                put(R, cDiff, `${L(cTotal)}${R}-(I${R}+G${R})`, row.difference)
            })
            const colSum = (c: number, key: string) => put(totalRow, c, `SUM(${L(c)}${first}:${L(c)}${last})`, sum(rows, key))
            colSum(5, "inspected"); colSum(6, "accepted"); colSum(7, "rework"); colSum(9, "rejected")
            for (let d = 0; d < nDef; d++) colSum(D0 + d, `d${d}`)
            colSum(cTotal, "defectTotal"); colSum(cDiff, "difference")
            put(totalRow, 8, ratio("G", totalRow), share(sum(rows, "rework"), sum(rows, "inspected")))
            put(totalRow, 10, ratio("I", totalRow), share(sum(rows, "rejected"), sum(rows, "inspected")))
            ws.autoFilter = { from: { row: r, column: 1 }, to: { row: last, column: cols.length } }
        }
        // Keep the header and the date / shift / part columns in view while scrolling.
        ws.views = [{ state: "frozen", xSplit: 4, ySplit: r, showGridLines: false }]
        ws.getRow(r).height = 42
    }

    return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
