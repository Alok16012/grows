/**
 * The sheets of the Excel inspection report, in workbook order. Users pick
 * which of them to export (all by default); ReportExcel.ts builds only those.
 * Kept apart from ReportExcel.ts so the page can show the list without
 * loading the workbook builder.
 */
export type ReportSheetKey = "dashboard" | "summary" | "pareto" | "inspector" | "shift" | "top5" | "detailed"

export const REPORT_SHEETS: { key: ReportSheetKey; label: string; note: string; file: string }[] = [
    { key: "dashboard", label: "Dashboard", note: "Summary tiles and all charts", file: "Dashboard" },
    { key: "summary", label: "Summary", note: "Totals by site, part, day and week", file: "Summary" },
    { key: "pareto", label: "Pareto Analysis", note: "Defects by quantity with cumulative %, and the Pareto chart", file: "Pareto" },
    { key: "inspector", label: "Inspector-Wise Comparison", note: "Each inspector's quantities, rates and PPM, with chart", file: "InspectorWise" },
    { key: "shift", label: "Shift-Wise Comparison", note: "Each shift's quantities, rates and PPM, with chart", file: "ShiftWise" },
    { key: "top5", label: "Top 5 Defects", note: "Most frequent defects, split into rework and rejected", file: "Top5Defects" },
    { key: "detailed", label: "Detailed Inspection Data", note: "Daily inspection report: every inspection and its defects", file: "DailyInspection" },
]

export const ALL_REPORT_SHEETS: ReportSheetKey[] = REPORT_SHEETS.map(s => s.key)
