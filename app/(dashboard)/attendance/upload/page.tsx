"use client"

import { useState, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import {
    Upload, Download, CheckCircle2, XCircle, Loader2,
    FileSpreadsheet, ArrowLeft, AlertCircle, Users
} from "lucide-react"
import { toast } from "sonner"

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

// Excel columns expected
const TEMPLATE_COLS = [
    "Employee ID",
    "Employee Name",
    "DAYS",
    "OT DAYS",
    "OTHER DEDUCTION",
    "LWF",
    "CANTEEN DAYS",
    "CANTEEN",
    "PENALTY",
    "ADVANCE",
]

const TEMPLATE_SAMPLE = [
    ["EMP001","John Doe",26,2,150,10,24,1200,50,1000],
    ["EMP002","Jane Smith",25,0,0,10,20,1000,0,0],
]

type ParsedRow = {
    rowIndex: number
    rawEmployeeId: string
    rawName: string
    days: number
    otDays: number
    otherDeduction: number
    lwf: number
    canteenDays: number
    canteen: number
    penalty: number
    advance: number
}

type MatchedRow = ParsedRow & {
    matched: boolean
    employeeId?: string // DB uuid
    dbName?: string
}

type Employee = {
    id: string
    employeeId: string
    firstName: string
    lastName: string
}

function downloadTemplate() {
    const wb = XLSX.utils.book_new()
    const wsData = [TEMPLATE_COLS, ...TEMPLATE_SAMPLE]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    // Column widths
    ws["!cols"] = TEMPLATE_COLS.map((_, i) => ({ wch: i === 1 ? 24 : 16 }))
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Template")
    XLSX.writeFile(wb, "Attendance_Template.xlsx")
}

export default function AttendanceUploadPage() {
    const { data: session } = useSession()
    const router = useRouter()

    const now = new Date()
    const [month, setMonth] = useState(now.getMonth() + 1)
    const [year, setYear] = useState(now.getFullYear())

    const [file, setFile] = useState<File | null>(null)
    const [parsing, setParsing] = useState(false)
    const [matched, setMatched] = useState<MatchedRow[] | null>(null)
    const [processing, setProcessing] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const role = session?.user?.role as string | undefined
    if (role && role !== "ADMIN" && role !== "MANAGER") {
        return <div className="p-8 text-[var(--text2)]">Access denied.</div>
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] ?? null
        setFile(f)
        setMatched(null)
    }

    const handleValidate = useCallback(async () => {
        if (!file) { toast.error("Please choose a file first."); return }
        setParsing(true)
        setMatched(null)

        try {
            // 1. Parse Excel
            const buf = await file.arrayBuffer()
            const wb = XLSX.read(buf, { type: "array" })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })

            if (rows.length === 0) {
                toast.error("File is empty or has no data rows.")
                setParsing(false)
                return
            }

            const parsed: ParsedRow[] = rows.map((row, i) => ({
                rowIndex: i + 2,
                rawEmployeeId: String(row["Employee ID"] ?? row["employee id"] ?? row["EMP ID"] ?? "").trim(),
                rawName: String(row["Employee Name"] ?? row["employee name"] ?? row["Name"] ?? "").trim(),
                days: Number(row["DAYS"] ?? row["Days"] ?? row["days"] ?? 26),
                otDays: Number(row["OT DAYS"] ?? row["OT Days"] ?? row["otDays"] ?? 0),
                otherDeduction: Number(row["OTHER DEDUCTION"] ?? row["Other Deduction"] ?? row["otherDeduction"] ?? 0),
                lwf: Number(row["LWF"] ?? row["lwf"] ?? 0),
                canteenDays: Number(row["CANTEEN DAYS"] ?? row["Canteen Days"] ?? row["canteenDays"] ?? 0),
                canteen: Number(row["CANTEEN"] ?? row["Canteen"] ?? row["canteen"] ?? 0),
                penalty: Number(row["PENALTY"] ?? row["Penalty"] ?? row["penalty"] ?? 0),
                advance: Number(row["ADVANCE"] ?? row["Advance"] ?? row["advance"] ?? 0),
            })).filter(r => r.rawEmployeeId !== "")

            if (parsed.length === 0) {
                toast.error("No valid rows found. Ensure 'Employee ID' column exists.")
                setParsing(false)
                return
            }

            // 2. Fetch all employees
            const empRes = await fetch("/api/employees?limit=10000")
            if (!empRes.ok) { toast.error("Failed to load employees."); setParsing(false); return }
            const empData = await empRes.json()
            const employees: Employee[] = (empData.employees ?? empData) as Employee[]

            // 3. Match
            const empMap = new Map<string, Employee>()
            employees.forEach(e => empMap.set(e.employeeId.toUpperCase(), e))

            const matchedRows: MatchedRow[] = parsed.map(r => {
                const emp = empMap.get(r.rawEmployeeId.toUpperCase())
                return {
                    ...r,
                    matched: !!emp,
                    employeeId: emp?.id,
                    dbName: emp ? `${emp.firstName} ${emp.lastName}` : undefined,
                }
            })

            setMatched(matchedRows)
            const foundCount = matchedRows.filter(r => r.matched).length
            toast.success(`Validated: ${foundCount}/${matchedRows.length} employees matched.`)
        } catch (err) {
            console.error(err)
            toast.error("Failed to parse file. Ensure it is a valid .xlsx or .xls file.")
        } finally {
            setParsing(false)
        }
    }, [file])

    const handleProcess = async () => {
        if (!matched) return
        const validRows = matched.filter(r => r.matched && r.employeeId)
        if (validRows.length === 0) { toast.error("No matched employees to process."); return }

        setProcessing(true)
        try {
            const attendance = validRows.map(r => ({
                employeeId: r.employeeId!,
                monthDays: r.days,
                workedDays: r.days,
                otDays: r.otDays,
                otherDeductions: r.otherDeduction,
                lwf: r.lwf,
                canteenDays: r.canteenDays,
                canteen: r.canteen,
                penalty: r.penalty,
                advance: r.advance,
            }))

            const res = await fetch("/api/payroll/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month, year, attendance }),
            })

            if (!res.ok) {
                const msg = await res.text()
                toast.error(msg || "Payroll calculation failed.")
                return
            }

            const data = await res.json()
            toast.success(`Payroll processed for ${data.processedCount} employees.`)
            router.push("/payroll")
        } catch (err) {
            console.error(err)
            toast.error("An error occurred while processing payroll.")
        } finally {
            setProcessing(false)
        }
    }

    const matchedCount = matched ? matched.filter(r => r.matched).length : 0
    const unmatchedCount = matched ? matched.filter(r => !r.matched).length : 0

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-2">
                <button
                    onClick={() => router.push("/attendance")}
                    className="p-2 rounded-[8px] hover:bg-[var(--surface2)] text-[var(--text3)] transition-colors"
                >
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h1 className="text-[20px] font-semibold text-[var(--text)]">Upload Attendance</h1>
                    <p className="text-[13px] text-[var(--text2)] mt-0.5">Import attendance data from Excel to process payroll</p>
                </div>
            </div>

            {/* Month / Year selector */}
            <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                <h2 className="text-[14px] font-semibold text-[var(--text)] mb-4">Payroll Month</h2>
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Month</label>
                        <select
                            value={month}
                            onChange={e => setMonth(Number(e.target.value))}
                            className="h-9 px-3 border border-[var(--border)] rounded-[8px] text-[13px] bg-white text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                        >
                            {MONTHS.map((m, i) => (
                                <option key={m} value={i + 1}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Year</label>
                        <select
                            value={year}
                            onChange={e => setYear(Number(e.target.value))}
                            className="h-9 px-3 border border-[var(--border)] rounded-[8px] text-[13px] bg-white text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                        >
                            {[2024, 2025, 2026, 2027].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Step 1: Download Template */}
            <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="h-6 w-6 rounded-full bg-[var(--accent)] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">1</span>
                            <h2 className="text-[14px] font-semibold text-[var(--text)]">Download Template</h2>
                        </div>
                        <p className="text-[12px] text-[var(--text2)] ml-8">
                            Download the Excel template, fill in attendance data, then upload it below.
                        </p>
                    </div>
                    <button
                        onClick={downloadTemplate}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[10px] text-[13px] font-medium px-4 py-2 transition-colors shrink-0"
                    >
                        <Download size={15} />
                        Download Template
                    </button>
                </div>

                {/* Template preview */}
                <div className="mt-4 overflow-x-auto rounded-[8px] border border-[var(--border)]">
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="bg-[var(--surface2)]">
                                {TEMPLATE_COLS.map(col => (
                                    <th key={col} className="px-3 py-2 text-left font-semibold text-[var(--text)] whitespace-nowrap border-b border-[var(--border)]">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {TEMPLATE_SAMPLE.map((row, i) => (
                                <tr key={i} className="border-b border-[var(--border)] last:border-0">
                                    {row.map((cell, j) => (
                                        <td key={j} className="px-3 py-2 text-[var(--text2)] whitespace-nowrap">
                                            {String(cell)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Step 2: Upload */}
            <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                <div className="flex items-center gap-2 mb-4">
                    <span className="h-6 w-6 rounded-full bg-[var(--accent)] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">2</span>
                    <h2 className="text-[14px] font-semibold text-[var(--text)]">Upload Excel File</h2>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 border border-[var(--border)] hover:bg-[var(--surface2)] text-[var(--text)] rounded-[10px] text-[13px] font-medium px-4 py-2 transition-colors"
                    >
                        <FileSpreadsheet size={15} />
                        {file ? file.name : "Choose File"}
                    </button>
                    {file && (
                        <button
                            onClick={handleValidate}
                            disabled={parsing}
                            className="flex items-center gap-2 bg-[var(--accent)] hover:opacity-90 disabled:opacity-60 text-white rounded-[10px] text-[13px] font-medium px-4 py-2 transition-all"
                        >
                            {parsing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                            {parsing ? "Validating..." : "Upload & Validate"}
                        </button>
                    )}
                </div>

                {file && (
                    <p className="text-[11px] text-[var(--text3)] mt-2 ml-1">
                        Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </p>
                )}
            </div>

            {/* Step 3: Validation Results */}
            {matched !== null && (
                <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="h-6 w-6 rounded-full bg-[var(--accent)] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">3</span>
                        <h2 className="text-[14px] font-semibold text-[var(--text)]">Validation Results</h2>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap gap-3 mb-4">
                        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-[8px]">
                            <CheckCircle2 size={15} className="text-emerald-600" />
                            <span className="text-[12px] font-medium text-emerald-700">{matchedCount} Matched</span>
                        </div>
                        {unmatchedCount > 0 && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-[8px]">
                                <XCircle size={15} className="text-red-500" />
                                <span className="text-[12px] font-medium text-red-600">{unmatchedCount} Not Found</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface2)] border border-[var(--border)] rounded-[8px]">
                            <Users size={15} className="text-[var(--text3)]" />
                            <span className="text-[12px] font-medium text-[var(--text2)]">{matched.length} Total Rows</span>
                        </div>
                    </div>

                    {unmatchedCount > 0 && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-[8px] mb-4 text-[12px] text-amber-700">
                            <AlertCircle size={14} className="mt-0.5 shrink-0" />
                            <span>Some Employee IDs were not found in the system. Only matched employees will be processed.</span>
                        </div>
                    )}

                    {/* Table */}
                    <div className="overflow-x-auto rounded-[8px] border border-[var(--border)]">
                        <table className="w-full text-[12px]">
                            <thead>
                                <tr className="bg-[var(--surface2)]">
                                    <th className="px-3 py-2 text-left font-semibold text-[var(--text)] border-b border-[var(--border)]">Status</th>
                                    <th className="px-3 py-2 text-left font-semibold text-[var(--text)] border-b border-[var(--border)]">Emp ID</th>
                                    <th className="px-3 py-2 text-left font-semibold text-[var(--text)] border-b border-[var(--border)]">Name (File)</th>
                                    <th className="px-3 py-2 text-left font-semibold text-[var(--text)] border-b border-[var(--border)]">Name (DB)</th>
                                    <th className="px-3 py-2 text-right font-semibold text-[var(--text)] border-b border-[var(--border)]">Days</th>
                                    <th className="px-3 py-2 text-right font-semibold text-[var(--text)] border-b border-[var(--border)]">OT Days</th>
                                    <th className="px-3 py-2 text-right font-semibold text-[var(--text)] border-b border-[var(--border)]">Other Ded.</th>
                                    <th className="px-3 py-2 text-right font-semibold text-[var(--text)] border-b border-[var(--border)]">LWF</th>
                                    <th className="px-3 py-2 text-right font-semibold text-[var(--text)] border-b border-[var(--border)]">Canteen Days</th>
                                    <th className="px-3 py-2 text-right font-semibold text-[var(--text)] border-b border-[var(--border)]">Canteen</th>
                                    <th className="px-3 py-2 text-right font-semibold text-[var(--text)] border-b border-[var(--border)]">Penalty</th>
                                    <th className="px-3 py-2 text-right font-semibold text-[var(--text)] border-b border-[var(--border)]">Advance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matched.map((r, i) => (
                                    <tr key={i} className={`border-b border-[var(--border)] last:border-0 ${!r.matched ? "bg-red-50/50" : ""}`}>
                                        <td className="px-3 py-2">
                                            {r.matched
                                                ? <CheckCircle2 size={14} className="text-emerald-500" />
                                                : <XCircle size={14} className="text-red-400" />
                                            }
                                        </td>
                                        <td className="px-3 py-2 font-mono text-[var(--text)]">{r.rawEmployeeId}</td>
                                        <td className="px-3 py-2 text-[var(--text2)]">{r.rawName || "—"}</td>
                                        <td className="px-3 py-2 text-[var(--text2)]">{r.dbName || <span className="text-red-400 italic">not found</span>}</td>
                                        <td className="px-3 py-2 text-right text-[var(--text2)]">{r.days}</td>
                                        <td className="px-3 py-2 text-right text-[var(--text2)]">{r.otDays}</td>
                                        <td className="px-3 py-2 text-right text-[var(--text2)]">{r.otherDeduction}</td>
                                        <td className="px-3 py-2 text-right text-[var(--text2)]">{r.lwf}</td>
                                        <td className="px-3 py-2 text-right text-[var(--text2)]">{r.canteenDays}</td>
                                        <td className="px-3 py-2 text-right text-[var(--text2)]">{r.canteen}</td>
                                        <td className="px-3 py-2 text-right text-[var(--text2)]">{r.penalty}</td>
                                        <td className="px-3 py-2 text-right text-[var(--text2)]">{r.advance}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Process Button */}
                    {matchedCount > 0 && (
                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={handleProcess}
                                disabled={processing}
                                className="flex items-center gap-2 bg-[var(--accent)] hover:opacity-90 disabled:opacity-60 text-white rounded-[10px] text-[13px] font-medium px-5 py-2.5 transition-all"
                            >
                                {processing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                {processing ? "Processing..." : `Process Payroll for ${matchedCount} Employee${matchedCount !== 1 ? "s" : ""}`}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
