"use client"
// mobile-responsive
import { useState, useEffect, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import { format, parseISO } from "date-fns"
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    ComposedChart, Line, AreaChart, Area
} from "recharts"
import {
    LayoutDashboard,
    PieChart as PieChartIcon,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    CheckCircle2,
    Calendar,
    FileSpreadsheet,
    FileText,
    Search,
    ChevronRight,
    ExternalLink,
    Terminal,
    Target,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Columns,
    SlidersHorizontal,
    X,
    Check,
    Trash2
} from "lucide-react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const THEME = {
    primary: "#3b82f6",
    success: "#1a9e6e",
    warning: "#d97706",
    danger: "#dc2626",
    info: "#06b6d4"
}

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]

const YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]

function useCountUp(target: number, duration = 1000) {
    const [value, setValue] = useState(0)

    useEffect(() => {
        if (!target) { setValue(0); return }
        let start = 0
        const step = Math.ceil(target / (duration / 30))
        const timer = setInterval(() => {
            start += step
            if (start >= target) {
                setValue(target)
                clearInterval(timer)
            } else {
                setValue(start)
            }
        }, 30)
        return () => clearInterval(timer)
    }, [target, duration])

    return value
}

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-[#1a1a18] rounded-[8px] p-[12px] shadow-lg border border-[#333] z-50">
            {label && <p className="text-[11px] font-[600] text-[#9e9b95] uppercase mb-[8px]">{label}</p>}
            <div className="space-y-[6px]">
                {payload.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-[16px]">
                        <div className="flex items-center gap-[6px]">
                            <div className="w-[8px] h-[8px] rounded-full" style={{ backgroundColor: p.color || p.fill }} />
                            <span className="text-[12px] text-white font-[500]">{p.name}:</span>
                        </div>
                        <span className="text-[12.5px] font-[700] text-white font-mono">{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function ProgressBar({ value, color }: { value: number; color: string }) {
    return (
        <div className="flex items-center gap-[8px]">
            <div className="flex-1 h-[6px] rounded-full bg-[#f5f4f0] overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
                />
            </div>
            <span className="text-[11px] font-[700] w-[36px] text-right" style={{ color }}>{value.toFixed(1)}%</span>
        </div>
    )
}

export default function ReportsPage() {
    const { data: session } = useSession()
    const role = session?.user?.role

    const now = new Date()
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
    const [selectedYear, setSelectedYear] = useState(now.getFullYear())
    const [dateFilterMode, setDateFilterMode] = useState<"month" | "single" | "range">("month")
    const todayStr = now.toISOString().slice(0, 10)
    const [dateFrom, setDateFrom] = useState(todayStr)
    const [dateTo, setDateTo] = useState(todayStr)
    const [mounted, setMounted] = useState(false)
    const [selectedCompanyId, setSelectedCompanyId] = useState("all")
    const [selectedProjectId, setSelectedProjectId] = useState("all")
    const [selectedInspectorId, setSelectedInspectorId] = useState("all")
    const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])

    useEffect(() => {
        setMounted(true)
    }, [])
    const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
    const [inspectors, setInspectors] = useState<{ id: string; name: string }[]>([])

    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState("Dashboard")
    const [searchTerm, setSearchTerm] = useState("")
    const [exportingPdf, setExportingPdf] = useState(false)
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const [deleting, setDeleting] = useState(false)

    // Table features — sorting
    const [sortKey, setSortKey] = useState<string>("date")
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
    // Column visibility
    const ALL_COLS = ["date", "inspector", "company", "project", "part", "location", "inspected", "accepted", "rework", "rejected"] as const
    type ColKey = typeof ALL_COLS[number]
    const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(ALL_COLS))
    const [showColMenu, setShowColMenu] = useState(false)
    // Per-column filters
    const [showFilterRow, setShowFilterRow] = useState(false)
    const [colFilters, setColFilters] = useState<Partial<Record<ColKey, string>>>({})

    useEffect(() => {
        if (!mounted) return
        if (role === "ADMIN" || role === "MANAGER") {
            fetch("/api/companies").then(r => r.json()).then(d => setCompanies(Array.isArray(d) ? d : [])).catch(() => { })
            fetch("/api/users?role=INSPECTION_BOY").then(r => r.json()).then(d => setInspectors(Array.isArray(d) ? d : [])).catch(() => { })
        } else if (role === "INSPECTION_BOY") {
            // Fetch projects the inspector is assigned to, derive unique companies
            fetch("/api/projects").then(r => r.json()).then((allProjects: any[]) => {
                if (!Array.isArray(allProjects)) return
                const companyMap = new Map<string, { id: string; name: string }>()
                allProjects.forEach(p => {
                    if (p.company) companyMap.set(p.company.id, { id: p.company.id, name: p.company.name })
                })
                setCompanies(Array.from(companyMap.values()))
            }).catch(() => { })
        }
    }, [role, mounted])

    useEffect(() => {
        if (selectedCompanyId === "all") {
            setProjects([])
            setSelectedProjectId("all")
            return
        }
        fetch(`/api/projects?companyId=${selectedCompanyId}`)
            .then(r => r.json())
            .then(d => setProjects(Array.isArray(d) ? d : []))
            .catch(() => { })
        setSelectedProjectId("all")
    }, [selectedCompanyId])

    const fetchReport = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (dateFilterMode === "month") {
                params.set("month", String(selectedMonth))
                params.set("year", String(selectedYear))
            } else if (dateFilterMode === "single") {
                params.set("dateFrom", dateFrom)
                params.set("dateTo", dateFrom)
            } else {
                params.set("dateFrom", dateFrom)
                params.set("dateTo", dateTo)
            }
            if (selectedCompanyId !== "all") params.set("companyId", selectedCompanyId)
            if (selectedProjectId !== "all") params.set("projectId", selectedProjectId)
            if (selectedInspectorId !== "all") params.set("inspectorId", selectedInspectorId)

            const res = await fetch(`/api/reports?${params.toString()}`)
            const d = await res.json()
            setData(d)
        } catch {
        } finally {
            setLoading(false)
        }
    }, [selectedMonth, selectedYear, dateFilterMode, dateFrom, dateTo, selectedCompanyId, selectedProjectId, selectedInspectorId])

    useEffect(() => {
        fetchReport()
    }, [fetchReport])

    const filteredRecords = useMemo(() => {
        if (!data?.records) return []
        let rows = data.records as any[]
        // Global search
        if (searchTerm) {
            const low = searchTerm.toLowerCase()
            rows = rows.filter((r: any) =>
                (r.id && r.id.toLowerCase().includes(low)) ||
                (r.inspector && r.inspector.toLowerCase().includes(low)) ||
                (r.partName && r.partName.toLowerCase().includes(low)) ||
                (r.location && r.location.toLowerCase().includes(low)) ||
                (r.project && r.project.toLowerCase().includes(low))
            )
        }
        // Per-column filters
        Object.entries(colFilters).forEach(([key, val]) => {
            if (!val) return
            const low = val.toLowerCase()
            rows = rows.filter((r: any) => {
                const cell = key === "date" ? (r.date ? new Date(r.date).toLocaleDateString("en-GB") : "")
                    : key === "part" ? (r.partName || "")
                        : (r[key] ?? "")
                return String(cell).toLowerCase().includes(low)
            })
        })
        // Sorting
        rows = [...rows].sort((a: any, b: any) => {
            let av: any, bv: any
            if (sortKey === "date") { av = new Date(a.date || 0).getTime(); bv = new Date(b.date || 0).getTime() }
            else if (sortKey === "part") { av = (a.partName || "").toLowerCase(); bv = (b.partName || "").toLowerCase() }
            else if (["inspected", "accepted", "rework", "rejected"].includes(sortKey)) { av = a[sortKey] ?? 0; bv = b[sortKey] ?? 0 }
            else { av = (a[sortKey] || "").toLowerCase(); bv = (b[sortKey] || "").toLowerCase() }
            if (av < bv) return sortDir === "asc" ? -1 : 1
            if (av > bv) return sortDir === "asc" ? 1 : -1
            return 0
        })
        return rows
    }, [data?.records, searchTerm, colFilters, sortKey, sortDir])

    const handleExportExcel = () => {
        let formattedData: any = []
        let sheetName = ""
        let fileNamePrefix = ""

        if (activeTab === "Day Wise") {
            if (!data?.dayWise || data.dayWise.length === 0) return
            formattedData = data.dayWise.map((d: any) => ({
                "Date": d.date ? format(parseISO(d.date), "dd MMM yyyy, EEE") : "—",
                "Inspected": d.totalInspected,
                "Accepted": d.totalAccepted,
                "Rework": d.totalRework,
                "Rejected": d.totalRejected,
                "Quality Rate": d.qualityRate.toFixed(1) + "%"
            }))
            sheetName = "Day Wise"
            fileNamePrefix = "DayWiseReport"
        } else if (activeTab === "Part Wise") {
            if (!data?.partWise || data.partWise.length === 0) return
            formattedData = data.partWise.map((p: any) => ({
                "Component": p.partName,
                "Inspected": p.totalInspected,
                "Accepted": p.totalAccepted,
                "Rework": p.totalRework,
                "Rejected": p.totalRejected,
                "Quality Rate": p.qualityRate.toFixed(1) + "%"
            }))
            sheetName = "Part Wise"
            fileNamePrefix = "PartWiseReport"
        } else {
            if (!filteredRecords || filteredRecords.length === 0) return
            formattedData = filteredRecords.map((r: any) => {
                const row: any = {
                    "Date": r.date ? format(new Date(r.date), "dd/MM/yyyy HH:mm") : "—",
                    "Shift": r.shift || "—",
                    "Company": r.company || "—",
                    "Project": r.project || "—",
                    "Location": r.location || "—",
                    "Part Name": r.partName || "—",
                    "Part Number": r.partNumber || "—",
                    "Inspected Qty": r.inspected || 0,
                    "Accepted Qty": r.accepted || 0,
                    "Rework Qty": r.rework || 0,
                    "Rejected Qty": r.rejected || 0,
                    "Rework %": r.inspected ? ((r.rework / r.inspected) * 100).toFixed(2) + "%" : "0%",
                    "Rejected %": r.inspected ? ((r.rejected / r.inspected) * 100).toFixed(2) + "%" : "0%",
                    "Rework PPM": r.inspected ? Math.round((r.rework / r.inspected) * 1000000) : 0,
                    "Rejection PPM": r.inspected ? Math.round((r.rejected / r.inspected) * 1000000) : 0,
                    "Inspector Name": r.inspector || "—"
                }

                const baseKeys = ["id", "date", "shift", "company", "project", "location", "partName", "partNumber", "inspected", "accepted", "rework", "rejected", "inspector"]
                Object.keys(r).forEach(k => {
                    if (!baseKeys.includes(k) && typeof r[k] === 'number') {
                        row[k] = r[k]
                    }
                })
                return row
            })
            sheetName = "Inspections"
            fileNamePrefix = "InspectionReport"
        }

        const worksheet = XLSX.utils.json_to_sheet(formattedData)
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

        const companyName = companies.find(c => c.id === selectedCompanyId)?.name || "Global"
        const fileName = `${fileNamePrefix}_${companyName.replace(/\s+/g, '')}_${MONTHS[selectedMonth - 1]}_${selectedYear}.xlsx`
        XLSX.writeFile(workbook, fileName)
    }

    const handleExportPdf = async () => {
        if (!data) return
        setExportingPdf(true)
        try {
            const [{ pdf }, { ReportDocument }] = await Promise.all([
                import("@react-pdf/renderer"),
                import("./ReportPDF")
            ])
            const companyName = companies.find(c => c.id === selectedCompanyId)?.name || "Global View"
            const period = `${MONTHS[selectedMonth - 1]} ${selectedYear}`
            const project = projects.find(p => p.id === selectedProjectId)?.name || "All Projects"
            const inspector = inspectors.find(i => i.id === selectedInspectorId)?.name || "All Inspectors"

            const logoUrl = `${window.location.origin}/logo.png`

            const blob = await pdf(
                <ReportDocument
                    data={data}
                    companyName={companyName}
                    period={period}
                    project={project}
                    inspector={inspector}
                    logoUrl={logoUrl}
                />
            ).toBlob()

            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `QualityReport_${companyName.replace(/\s+/g, "")}_${MONTHS[selectedMonth - 1]}_${selectedYear}.pdf`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error("PDF generation failed", err)
        } finally {
            setExportingPdf(false)
        }
    }

    const handleDeleteRecord = async (inspectionId: string) => {
        setDeleting(true)
        try {
            const res = await fetch(`/api/inspections/${inspectionId}`, { method: "DELETE" })
            if (!res.ok) throw new Error("Delete failed")
            toast.success("Inspection record deleted")
            setDeleteConfirmId(null)
            // Remove from local data
            setData((prev: any) => {
                if (!prev?.records) return prev
                return { ...prev, records: prev.records.filter((r: any) => r.id !== inspectionId) }
            })
        } catch {
            toast.error("Failed to delete record")
        } finally {
            setDeleting(false)
        }
    }

    const s = data?.summary
    const pieData = useMemo(() => s ? [
        { name: "Accepted", value: s.totalAccepted, color: THEME.success },
        { name: "Rework", value: s.totalRework, color: THEME.warning },
        { name: "Rejected", value: s.totalRejected, color: THEME.danger },
    ] : [], [s])

    const areaData = useMemo(() => (data?.dayWise || []).map((d: any) => ({
        ...d,
        label: (() => { try { return format(parseISO(d.date), "MMM dd") } catch { return d.date } })(),
    })), [data?.dayWise])

    const paretoData = useMemo(() => (data?.topDefects || []).map((d: any, i: number, arr: any[]) => {
        const cumSum = arr.slice(0, i + 1).reduce((a, b: any) => a + b.count, 0)
        const totalD = arr.reduce((a, b: any) => a + b.count, 0)
        return { ...d, cumulative: totalD > 0 ? parseFloat(((cumSum / totalD) * 100).toFixed(1)) : 0 }
    }), [data?.topDefects])

    const StatCard = ({ label, value, bg, iconBg, iconColor, icon: Icon }: any) => {
        const animatedValue = useCountUp(value)
        return (
            <div className="bg-white border border-[#e8e6e1] rounded-[12px] p-[12px_14px] md:p-[16px_18px] print-card">
                <div className={`w-[32px] h-[32px] rounded-full flex items-center justify-center mb-[10px] ${iconBg}`}>
                    <Icon className="h-[16px] w-[16px]" style={{ color: iconColor }} />
                </div>
                <div className="text-[10.5px] font-[600] text-[#9e9b95] uppercase tracking-[0.5px] mb-[6px]">{label}</div>
                <div className="text-[28px] font-[700] font-mono tracking-[-1px] text-[#1a1a18] leading-none">
                    {animatedValue.toLocaleString()}
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-[100vh] bg-[#f5f4f0] pb-[40px]" id="reports-print-area">
            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; -webkit-print-color-adjust: exact; }
                    .print-card { border: 1px solid #e8e6e1 !important; box-shadow: none !important; break-inside: avoid; }
                    #reports-print-area { background: white !important; }
                }
            `}</style>

            {/* FILTER ROW */}
            <div className="no-print bg-white border-b border-[#e8e6e1] p-3 md:p-[12px_24px] sticky top-0 z-20">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-[10px] md:gap-[12px]">
                    {/* Company */}
                    {[
                        { label: "Company", value: selectedCompanyId, options: companies, setter: setSelectedCompanyId, allLabel: "Global View" },
                        { label: "Project", value: selectedProjectId, options: projects, setter: setSelectedProjectId, allLabel: "All Projects", disabled: selectedCompanyId === "all" },
                        { label: "Inspector", value: selectedInspectorId, options: inspectors, setter: setSelectedInspectorId, allLabel: "All Inspectors" },
                    ].map((filter, idx) => (
                        <div key={idx} className="flex flex-col">
                            <label className="text-[10.5px] font-[600] text-[#9e9b95] uppercase tracking-[0.6px] mb-[5px]">{filter.label}</label>
                            <div className="relative">
                                <select
                                    value={filter.value}
                                    onChange={e => filter.setter(e.target.value)}
                                    disabled={filter.disabled}
                                    className={`w-full bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] p-[9px_14px] text-[13px] text-[#1a1a18] font-[500] outline-none appearance-none transition-all focus:border-[#1a9e6e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,158,110,0.08)] ${filter.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                    {filter.allLabel && <option value="all">{filter.allLabel}</option>}
                                    {filter.options.map((opt: any) => (
                                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                                    ))}
                                </select>
                                <ChevronRight className="absolute right-[12px] top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95] pointer-events-none rotate-90" />
                            </div>
                        </div>
                    ))}

                    {/* DATE FILTER — spans last 2 columns on desktop */}
                    <div className="col-span-2 sm:col-span-3 md:col-span-2 flex flex-col gap-[6px]">
                        {/* Mode toggle */}
                        <div className="flex items-center justify-between">
                            <label className="text-[10.5px] font-[600] text-[#9e9b95] uppercase tracking-[0.6px]">Date Filter</label>
                            <div className="flex bg-[#f9f8f5] border border-[#e8e6e1] rounded-[8px] p-[2px] gap-[2px]">
                                {(["month", "single", "range"] as const).map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => setDateFilterMode(mode)}
                                        className={`px-[10px] py-[4px] rounded-[6px] text-[11px] font-[600] transition-colors whitespace-nowrap ${dateFilterMode === mode
                                            ? "bg-[#1a1a18] text-white"
                                            : "text-[#6b6860] hover:text-[#1a1a18]"
                                            }`}
                                    >
                                        {mode === "month" ? "Month" : mode === "single" ? "Single Day" : "Date Range"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Month mode */}
                        {dateFilterMode === "month" && (
                            <div className="grid grid-cols-2 gap-[8px]">
                                <div className="relative">
                                    <select
                                        value={selectedMonth}
                                        onChange={e => setSelectedMonth(Number(e.target.value))}
                                        className="w-full bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] p-[9px_14px] text-[13px] text-[#1a1a18] font-[500] outline-none appearance-none transition-all focus:border-[#1a9e6e] focus:bg-white cursor-pointer"
                                    >
                                        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                    </select>
                                    <ChevronRight className="absolute right-[12px] top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95] pointer-events-none rotate-90" />
                                </div>
                                <div className="relative">
                                    <select
                                        value={selectedYear}
                                        onChange={e => setSelectedYear(Number(e.target.value))}
                                        className="w-full bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] p-[9px_14px] text-[13px] text-[#1a1a18] font-[500] outline-none appearance-none transition-all focus:border-[#1a9e6e] focus:bg-white cursor-pointer"
                                    >
                                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                    <ChevronRight className="absolute right-[12px] top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95] pointer-events-none rotate-90" />
                                </div>
                            </div>
                        )}

                        {/* Single day mode */}
                        {dateFilterMode === "single" && (
                            <div className="flex items-center gap-[8px]">
                                <Calendar className="h-[14px] w-[14px] text-[#9e9b95] flex-shrink-0" />
                                <input
                                    type="date"
                                    value={dateFrom}
                                    max={todayStr}
                                    onChange={e => setDateFrom(e.target.value)}
                                    className="flex-1 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] p-[8px_12px] text-[13px] text-[#1a1a18] font-[500] outline-none transition-all focus:border-[#1a9e6e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,158,110,0.08)] cursor-pointer"
                                />
                            </div>
                        )}

                        {/* Date range mode */}
                        {dateFilterMode === "range" && (
                            <div className="flex items-center gap-[8px]">
                                <input
                                    type="date"
                                    value={dateFrom}
                                    max={dateTo}
                                    onChange={e => setDateFrom(e.target.value)}
                                    className="flex-1 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] p-[8px_12px] text-[13px] text-[#1a1a18] font-[500] outline-none transition-all focus:border-[#1a9e6e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,158,110,0.08)] cursor-pointer"
                                />
                                <span className="text-[11px] font-[600] text-[#9e9b95] flex-shrink-0">to</span>
                                <input
                                    type="date"
                                    value={dateTo}
                                    min={dateFrom}
                                    max={todayStr}
                                    onChange={e => setDateTo(e.target.value)}
                                    className="flex-1 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] p-[8px_12px] text-[13px] text-[#1a1a18] font-[500] outline-none transition-all focus:border-[#1a9e6e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,158,110,0.08)] cursor-pointer"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* TABS ROW */}
            <div className="no-print bg-white border-b border-[#e8e6e1] p-3 md:p-[10px_24px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="bg-white border border-[#e8e6e1] rounded-[10px] p-[4px] flex gap-[2px] overflow-x-auto">
                    {["Dashboard", "Graphical", "Pareto Chart", "Day Wise", "Part Wise", "Inspection Report"].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`p-[7px_14px] rounded-[7px] text-[13px] font-[500] transition-colors whitespace-nowrap ${activeTab === tab
                                ? "bg-[#1a1a18] text-white"
                                : "bg-transparent text-[#6b6860] hover:bg-[#f9f8f5] hover:text-[#1a1a18]"
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-[6px]">
                    {!["Day Wise", "Part Wise", "Inspection Report"].includes(activeTab) && (
                        <button
                            onClick={handleExportPdf}
                            disabled={loading || exportingPdf}
                            className="flex items-center gap-[6px] bg-[#dc2626] text-white shadow-sm border-none rounded-[9px] text-[13px] font-[600] px-[12px] py-[8px] hover:bg-[#b91c1c] transition-colors disabled:opacity-50"
                        >
                            <FileText className="h-[14px] w-[14px]" />
                            <span className="hidden sm:inline">{exportingPdf ? "Generating PDF..." : "Export Full Report PDF"}</span>
                            <span className="sm:hidden">PDF</span>
                        </button>
                    )}
                    {(["Day Wise", "Part Wise", "Inspection Report"].includes(activeTab)) && (
                        <button
                            onClick={handleExportExcel}
                            disabled={loading || (activeTab === "Day Wise" ? !data?.dayWise?.length : activeTab === "Part Wise" ? !data?.partWise?.length : !filteredRecords?.length)}
                            className="flex items-center gap-[6px] bg-[#1a9e6e] text-white shadow-sm border-none rounded-[9px] text-[13px] font-[600] px-[12px] py-[8px] hover:bg-[#158a5e] focus:bg-[#158a5e] transition-colors disabled:opacity-50"
                        >
                            <FileSpreadsheet className="h-[14px] w-[14px]" />
                            Excel
                        </button>
                    )}
                    <button
                        onClick={fetchReport}
                        disabled={loading}
                        className="flex items-center gap-[6px] bg-[#1a9e6e] text-white border-none rounded-[9px] text-[13px] font-[600] px-[12px] py-[8px] hover:bg-[#158a5e] transition-colors disabled:opacity-50 shadow-sm"
                    >
                        {loading ? <div className="h-[14px] w-[14px] rounded-full border-2 border-white border-t-transparent animate-spin" /> : <ExternalLink className="h-[14px] w-[14px]" />}
                        <span className="hidden sm:inline">Update Dashboard</span>
                        <span className="sm:hidden">Update</span>
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="p-3 md:p-[20px_24px]">

                {/* Print Header Visible Only in PDF */}
                <div className="hidden print:block mb-[24px] border-b border-[#1a1a18] pb-[16px]">
                    <h1 className="text-[24px] font-[700] text-[#1a1a18]">{companies.find(c => c.id === selectedCompanyId)?.name || "Global View"} - {activeTab}</h1>
                    <p className="text-[12px] font-[500] text-[#6b6860] mt-[4px]">
                        Period: {MONTHS[selectedMonth - 1]} {selectedYear} •
                        Project: {projects.find(p => p.id === selectedProjectId)?.name || "All"} •
                        Inspector: {inspectors.find(i => i.id === selectedInspectorId)?.name || "All"}
                    </p>
                </div>

                {loading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 md:gap-[14px]">
                        {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-[110px] rounded-[12px] w-full bg-white border border-[#e8e6e1]" />)}
                    </div>
                ) : !data ? (
                    <div className="flex flex-col items-center justify-center p-[60px] bg-white border border-[#e8e6e1] rounded-[14px]">
                        <AlertCircle className="h-[32px] w-[32px] text-[#d4d1ca] mb-[12px]" />
                        <h2 className="text-[14px] font-[600] text-[#1a1a18]">No data loaded</h2>
                        <p className="text-[12px] text-[#9e9b95] mt-[4px]">Click Update Dashboard to refresh.</p>
                    </div>
                ) : (
                    <div className="space-y-[16px]">

                        {/* DASHBOARD STAT CARDS */}
                        {activeTab === "Dashboard" && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 md:gap-[14px]">
                                <StatCard label="TOTAL INSPECTED" value={s?.totalInspected || 0} iconBg="bg-[#eff6ff]" iconColor="#3b82f6" icon={Terminal} />
                                <StatCard label="TOTAL ACCEPTED" value={s?.totalAccepted || 0} iconBg="bg-[#e8f7f1]" iconColor="#1a9e6e" icon={CheckCircle2} />
                                <StatCard label="TOTAL REWORK" value={s?.totalRework || 0} iconBg="bg-[#fef3c7]" iconColor="#d97706" icon={TrendingDown} />
                                <StatCard label="TOTAL REJECTED" value={s?.totalRejected || 0} iconBg="bg-[#fef2f2]" iconColor="#dc2626" icon={AlertCircle} />
                                <StatCard label="REWORK PPM" value={s?.reworkPPM || 0} iconBg="bg-[#fef3c7]" iconColor="#d97706" icon={Target} />
                                <StatCard label="REJECTION PPM" value={s?.rejectionPPM || 0} iconBg="bg-[#fef2f2]" iconColor="#dc2626" icon={AlertCircle} />
                            </div>
                        )}

                        {activeTab === "Dashboard" && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
                                <div className="bg-white border border-[#e8e6e1] rounded-[14px] p-[20px] print-card">
                                    <div className="mb-[16px]">
                                        <h3 className="text-[14px] font-[600] text-[#1a1a18]">Overall Status</h3>
                                        <p className="text-[11px] font-[500] text-[#9e9b95] mt-[2px]">Acceptance vs Rejection</p>
                                    </div>
                                    {(s?.totalInspected || 0) > 0 ? (
                                        <div className="flex flex-col items-center">
                                            <div className="w-full h-[280px] relative">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie data={pieData} innerRadius={85} outerRadius={115} paddingAngle={4} dataKey="value" stroke="none">
                                                            {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                                                        </Pie>
                                                        <Tooltip content={<CustomTooltip />} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                    <span className="text-[40px] font-[700] text-[#1a1a18] font-mono tracking-[-1px] leading-none">{s?.acceptanceRate.toFixed(1)}%</span>
                                                    <span className="text-[10px] font-[600] text-[#9e9b95] uppercase tracking-[1px] mt-[6px]">Quality Rate</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap justify-center gap-[16px] mt-[16px]">
                                                {pieData.map(e => (
                                                    <div key={e.name} className="flex items-center gap-[6px]">
                                                        <div className="w-[10px] h-[10px] rounded-[3px]" style={{ backgroundColor: e.color }} />
                                                        <span className="text-[12px] font-[500] text-[#6b6860]">{e.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : <div className="h-[280px] flex items-center justify-center text-[13px] text-[#9e9b95]">No inspection data</div>}
                                </div>

                                <div className="bg-white border border-[#e8e6e1] rounded-[14px] p-[20px] print-card">
                                    <div className="mb-[16px]">
                                        <h3 className="text-[14px] font-[600] text-[#1a1a18]">Performance Trend</h3>
                                        <p className="text-[11px] font-[500] text-[#9e9b95] mt-[2px]">Daily inspection volume over selected month</p>
                                    </div>
                                    {areaData.length > 0 ? (
                                        <div className="h-[320px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={areaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="colorAccepted" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={THEME.success} stopOpacity={0.1} /><stop offset="95%" stopColor={THEME.success} stopOpacity={0} /></linearGradient>
                                                        <linearGradient id="colorInspected" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={THEME.primary} stopOpacity={0.1} /><stop offset="95%" stopColor={THEME.primary} stopOpacity={0} /></linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 500, fill: "#9e9b95" }} dy={10} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 500, fill: "#9e9b95" }} />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Area type="monotone" dataKey="totalInspected" name="Inspected" stroke={THEME.primary} strokeWidth={2} fillOpacity={1} fill="url(#colorInspected)" />
                                                    <Area type="monotone" dataKey="totalAccepted" name="Accepted" stroke={THEME.success} strokeWidth={2} fillOpacity={1} fill="url(#colorAccepted)" />
                                                    <Line type="monotone" dataKey="totalRejected" name="Rejected" stroke={THEME.danger} strokeWidth={2} dot={{ r: 3, fill: THEME.danger, strokeWidth: 2, stroke: "white" }} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : <div className="h-[320px] flex items-center justify-center text-[13px] text-[#9e9b95]">No trend data available</div>}
                                </div>
                            </div>
                        )}

                        {activeTab === "Dashboard" && (
                            <div className="bg-white border border-[#e8e6e1] rounded-[14px] p-[20px] print-card">
                                <div className="flex items-center justify-between mb-[18px]">
                                    <div>
                                        <h3 className="text-[14px] font-[600] text-[#1a1a18]">Top 5 Defects</h3>
                                        <p className="text-[11px] font-[500] text-[#9e9b95] mt-[2px]">Most frequent defects this period</p>
                                    </div>
                                    <Badge variant="outline" className="bg-[#fef2f2] text-[#dc2626] border-transparent font-[600] px-[10px] py-[2px] text-[11px]">
                                        {(data?.topDefects || []).length > 0 ? `${Math.min(5, data.topDefects.length)} Defects` : "No Data"}
                                    </Badge>
                                </div>
                                {(data?.topDefects || []).slice(0, 5).length > 0 ? (
                                    <div className="space-y-[12px]">
                                        {(data.topDefects as any[]).slice(0, 5).map((d: any, i: number) => (
                                            <div key={i} className="flex items-center gap-[12px]">
                                                <div className="w-[22px] h-[22px] rounded-full bg-[#fef2f2] flex items-center justify-center flex-shrink-0">
                                                    <span className="text-[10px] font-[700] text-[#dc2626]">{i + 1}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-[4px]">
                                                        <span className="text-[13px] font-[600] text-[#1a1a18] truncate">{d.defectName}</span>
                                                        <span className="text-[12px] font-[700] text-[#dc2626] ml-[8px] flex-shrink-0">{d.count} <span className="text-[10px] font-[500] text-[#9e9b95]">({d.percentage.toFixed(1)}%)</span></span>
                                                    </div>
                                                    <div className="h-[5px] rounded-full bg-[#f5f4f0] overflow-hidden">
                                                        <div className="h-full rounded-full bg-[#dc2626] transition-all duration-700" style={{ width: `${d.percentage}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-[120px] flex items-center justify-center text-[13px] text-[#9e9b95]">No defect data for this period</div>
                                )}
                            </div>
                        )}

                        {activeTab === "Graphical" && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
                                <div className="bg-white border border-[#e8e6e1] rounded-[14px] p-[20px] print-card">
                                    <h3 className="text-[14px] font-[600] text-[#1a1a18] mb-[20px]">Part-Wise Quality Split</h3>
                                    {data.partWise.length > 0 ? (
                                        <div className="h-[400px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={data.partWise} layout="vertical" margin={{ left: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9e9b95" }} />
                                                    <YAxis dataKey="partName" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6b6860" }} width={100} />
                                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f9f8f5" }} />
                                                    <Bar dataKey="totalAccepted" name="Accepted" stackId="a" fill={THEME.success} radius={0} />
                                                    <Bar dataKey="totalRework" name="Rework" stackId="a" fill={THEME.warning} />
                                                    <Bar dataKey="totalRejected" name="Rejected" stackId="a" fill={THEME.danger} radius={[0, 4, 4, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : <div className="h-[400px] flex items-center justify-center text-[13px] text-[#9e9b95]">No parts data</div>}
                                </div>
                                <div className="bg-white border border-[#e8e6e1] rounded-[14px] p-[20px] print-card">
                                    <h3 className="text-[14px] font-[600] text-[#1a1a18] mb-[20px]">Comparison by Location</h3>
                                    {data.locationWise.length > 0 ? (
                                        <div className="h-[400px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={data.locationWise}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                    <XAxis dataKey="location" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6b6860" }} dy={10} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9e9b95" }} />
                                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f9f8f5" }} />
                                                    <Bar dataKey="totalInspected" name="Inspected" fill={THEME.info} radius={[4, 4, 0, 0]} barSize={40} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : <div className="h-[400px] flex items-center justify-center text-[13px] text-[#9e9b95]">No locations data</div>}
                                </div>
                            </div>
                        )}

                        {activeTab === "Pareto Chart" && (
                            <div className="bg-white border border-[#e8e6e1] rounded-[14px] p-[20px] print-card">
                                <div className="flex items-center justify-between mb-[24px]">
                                    <div>
                                        <h3 className="text-[14px] font-[600] text-[#1a1a18]">Top Defect Analysis</h3>
                                        <p className="text-[11px] font-[500] text-[#9e9b95] mt-[2px]">Defect frequency vs cumulative impact</p>
                                    </div>
                                    <Badge variant="outline" className="bg-[#fef3c7] text-[#d97706] border-transparent font-[600] px-[10px] py-[2px] text-[11px]">
                                        Major Defects Only
                                    </Badge>
                                </div>
                                {paretoData.length > 0 ? (
                                    <div className="h-[450px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={paretoData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                <XAxis dataKey="defectName" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6b6860" }} angle={-45} textAnchor="end" height={80} dy={20} />
                                                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9e9b95" }} />
                                                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9e9b95" }} unit="%" />
                                                <Tooltip content={<CustomTooltip />} />
                                                <Bar yAxisId="left" dataKey="count" name="Frequency" fill={THEME.danger} radius={[4, 4, 0, 0]} barSize={50} />
                                                <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulative %" stroke={THEME.warning} strokeWidth={3} dot={{ r: 4, fill: THEME.warning, strokeWidth: 2, stroke: "white" }} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : <div className="h-[450px] flex items-center justify-center text-[13px] text-[#9e9b95]">No defect data to plot</div>}
                            </div>
                        )}

                        {activeTab === "Day Wise" && (
                            <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden print-card">
                                <div className="p-[16px_20px] border-b border-[#e8e6e1]">
                                    <h3 className="text-[14px] font-[600] text-[#1a1a18]">Daily Inspection Log</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-[#f9f8f5] border-b border-[#e8e6e1]">
                                                {["Date", "Inspected", "Accepted", "Rework", "Rejected", "Quality Status"].map(h => (
                                                    <th key={h} className="p-[10px_16px] text-left text-[11px] font-[600] text-[#9e9b95] uppercase tracking-[0.5px]">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e8e6e1]">
                                            {data.dayWise.map((d: any) => (
                                                <tr key={d.date} className="hover:bg-[#f9f8f5] transition-colors">
                                                    <td className="p-[12px_16px] text-[13px] text-[#1a1a18] font-[500]">{(() => { try { return format(parseISO(d.date), "dd MMM yyyy, EEE") } catch { return d.date || "—" } })()}</td>
                                                    <td className="p-[12px_16px] text-[13px] font-[600] font-mono text-left">{d.totalInspected.toLocaleString()}</td>
                                                    <td className="p-[12px_16px] text-[13px] font-[600] font-mono text-[#1a9e6e] text-left">{d.totalAccepted.toLocaleString()}</td>
                                                    <td className="p-[12px_16px] text-[13px] font-[600] font-mono text-[#d97706] text-left">{d.totalRework.toLocaleString()}</td>
                                                    <td className="p-[12px_16px] text-[13px] font-[600] font-mono text-[#dc2626] text-left">{d.totalRejected.toLocaleString()}</td>
                                                    <td className="p-[12px_16px] w-[200px]"><ProgressBar value={d.qualityRate} color={d.qualityRate >= 99 ? THEME.success : d.qualityRate >= 95 ? THEME.warning : THEME.danger} /></td>
                                                </tr>
                                            ))}
                                            {data.dayWise.length === 0 && (
                                                <tr><td colSpan={6} className="p-[30px] text-center text-[13px] text-[#9e9b95]">No daily data available.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === "Part Wise" && (
                            <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden print-card">
                                <div className="p-[16px_20px] border-b border-[#e8e6e1]">
                                    <h3 className="text-[14px] font-[600] text-[#1a1a18]">Performance by Component</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-[#f9f8f5] border-b border-[#e8e6e1]">
                                                {["Component", "Inspected", "Accepted", "Rework", "Rejected", "Quality Rate"].map(h => (
                                                    <th key={h} className="p-[10px_16px] text-left text-[11px] font-[600] text-[#9e9b95] uppercase tracking-[0.5px]">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e8e6e1]">
                                            {data.partWise.map((p: any) => (
                                                <tr key={p.partName} className="hover:bg-[#f9f8f5] transition-colors">
                                                    <td className="p-[12px_16px] text-[13px] text-[#1a1a18] font-[500]">{p.partName}</td>
                                                    <td className="p-[12px_16px] text-[13px] font-[600] font-mono text-left">{p.totalInspected.toLocaleString()}</td>
                                                    <td className="p-[12px_16px] text-[13px] font-[600] font-mono text-[#1a9e6e] text-left">{p.totalAccepted.toLocaleString()}</td>
                                                    <td className="p-[12px_16px] text-[13px] font-[600] font-mono text-[#d97706] text-left">{p.totalRework.toLocaleString()}</td>
                                                    <td className="p-[12px_16px] text-[13px] font-[600] font-mono text-[#dc2626] text-left">{p.totalRejected.toLocaleString()}</td>
                                                    <td className="p-[12px_16px] w-[200px]"><ProgressBar value={p.qualityRate} color={p.qualityRate >= 99 ? THEME.success : p.qualityRate >= 95 ? THEME.warning : THEME.danger} /></td>
                                                </tr>
                                            ))}
                                            {data.partWise.length === 0 && (
                                                <tr><td colSpan={6} className="p-[30px] text-center text-[13px] text-[#9e9b95]">No component data available.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === "Inspection Report" && (() => {
                            const COL_META: { key: ColKey; label: string; numeric: boolean }[] = [
                                { key: "date", label: "Date", numeric: false },
                                { key: "inspector", label: "Inspector", numeric: false },
                                { key: "company", label: "Company", numeric: false },
                                { key: "project", label: "Project", numeric: false },
                                { key: "part", label: "Part", numeric: false },
                                { key: "location", label: "Location", numeric: false },
                                { key: "inspected", label: "Inspected", numeric: true },
                                { key: "accepted", label: "Accepted", numeric: true },
                                { key: "rework", label: "Rework", numeric: true },
                                { key: "rejected", label: "Rejected", numeric: true },
                            ]
                            const visibleMeta = COL_META.filter(c => visibleCols.has(c.key))

                            const handleSort = (key: string) => {
                                if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
                                else { setSortKey(key); setSortDir("desc") }
                            }

                            const SortIcon = ({ col }: { col: string }) => {
                                if (sortKey !== col) return <ArrowUpDown className="h-[11px] w-[11px] text-[#c5c3bd] ml-[4px] inline" />
                                return sortDir === "asc"
                                    ? <ArrowUp className="h-[11px] w-[11px] text-[#1a9e6e] ml-[4px] inline" />
                                    : <ArrowDown className="h-[11px] w-[11px] text-[#1a9e6e] ml-[4px] inline" />
                            }

                            return (
                                <div className="bg-white border border-[#e8e6e1] rounded-[14px] mt-[16px] overflow-hidden no-print">
                                    {/* Header bar */}
                                    <div className="p-[14px_18px] border-b border-[#e8e6e1] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        <div>
                                            <h3 className="text-[13.5px] font-[600] text-[#1a1a18]">Inspection Record Explorer</h3>
                                            <p className="text-[10.5px] font-[600] text-[#9e9b95] uppercase tracking-[0.6px] mt-[2px]">
                                                {filteredRecords.length} record{filteredRecords.length !== 1 ? "s" : ""} &nbsp;·&nbsp; LIVE DATA FEED
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-[8px] flex-wrap">
                                            {/* Global search */}
                                            <div className="relative">
                                                <Search className="absolute left-[10px] top-1/2 -translate-y-1/2 h-[13px] w-[13px] text-[#9e9b95]" />
                                                <Input
                                                    className="w-[200px] pl-[30px] h-[34px] bg-[#f9f8f5] border border-[#e8e6e1] rounded-[8px] text-[12.5px] font-[500] focus-visible:ring-0 focus:border-[#1a9e6e] focus:bg-white transition-all shadow-none"
                                                    placeholder="Search all..."
                                                    value={searchTerm}
                                                    onChange={e => setSearchTerm(e.target.value)}
                                                />
                                            </div>
                                            {/* Filter toggle */}
                                            <button
                                                onClick={() => setShowFilterRow(v => !v)}
                                                className={`flex items-center gap-[5px] h-[34px] px-[10px] rounded-[8px] border text-[12px] font-[600] transition-colors ${showFilterRow || Object.values(colFilters).some(Boolean)
                                                        ? "bg-[#1a9e6e] text-white border-[#1a9e6e]"
                                                        : "bg-[#f9f8f5] text-[#6b6860] border-[#e8e6e1] hover:border-[#1a9e6e] hover:text-[#1a9e6e]"
                                                    }`}
                                                title="Column filters"
                                            >
                                                <SlidersHorizontal className="h-[13px] w-[13px]" />
                                                <span className="hidden sm:inline">Filter</span>
                                                {Object.values(colFilters).some(Boolean) && (
                                                    <span className="bg-white text-[#1a9e6e] rounded-full w-[16px] h-[16px] text-[10px] font-[700] flex items-center justify-center">
                                                        {Object.values(colFilters).filter(Boolean).length}
                                                    </span>
                                                )}
                                            </button>
                                            {/* Column visibility */}
                                            <div className="relative">
                                                <button
                                                    onClick={() => setShowColMenu(v => !v)}
                                                    className={`flex items-center gap-[5px] h-[34px] px-[10px] rounded-[8px] border text-[12px] font-[600] transition-colors ${showColMenu
                                                            ? "bg-[#1a1a18] text-white border-[#1a1a18]"
                                                            : "bg-[#f9f8f5] text-[#6b6860] border-[#e8e6e1] hover:border-[#1a1a18] hover:text-[#1a1a18]"
                                                        }`}
                                                    title="Show/hide columns"
                                                >
                                                    <Columns className="h-[13px] w-[13px]" />
                                                    <span className="hidden sm:inline">Columns</span>
                                                </button>
                                                {showColMenu && (
                                                    <div className="absolute right-0 top-[38px] z-[50] bg-white border border-[#e8e6e1] rounded-[10px] shadow-lg p-[8px] min-w-[160px]">
                                                        <p className="text-[10px] font-[700] text-[#9e9b95] uppercase tracking-[0.6px] px-[8px] pt-[4px] pb-[8px] border-b border-[#f5f4f0] mb-[4px]">Visible Columns</p>
                                                        {COL_META.map(c => (
                                                            <button
                                                                key={c.key}
                                                                onClick={() => {
                                                                    setVisibleCols(prev => {
                                                                        const next = new Set(prev)
                                                                        if (next.has(c.key)) { if (next.size > 1) next.delete(c.key) }
                                                                        else next.add(c.key)
                                                                        return next
                                                                    })
                                                                }}
                                                                className="w-full flex items-center gap-[8px] px-[8px] py-[5px] rounded-[6px] hover:bg-[#f9f8f5] transition-colors text-left"
                                                            >
                                                                <div className={`w-[14px] h-[14px] rounded-[3px] border flex items-center justify-center flex-shrink-0 ${visibleCols.has(c.key) ? "bg-[#1a9e6e] border-[#1a9e6e]" : "border-[#d4d1ca]"
                                                                    }`}>
                                                                    {visibleCols.has(c.key) && <Check className="h-[9px] w-[9px] text-white" />}
                                                                </div>
                                                                <span className="text-[12.5px] font-[500] text-[#1a1a18]">{c.label}</span>
                                                            </button>
                                                        ))}
                                                        <button
                                                            onClick={() => setVisibleCols(new Set(ALL_COLS))}
                                                            className="w-full text-center text-[11px] font-[600] text-[#1a9e6e] mt-[6px] pt-[6px] border-t border-[#f5f4f0] hover:underline"
                                                        >Reset all</button>
                                                    </div>
                                                )}
                                            </div>
                                            {/* Clear all col filters */}
                                            {Object.values(colFilters).some(Boolean) && (
                                                <button
                                                    onClick={() => setColFilters({})}
                                                    className="flex items-center gap-[4px] h-[34px] px-[8px] rounded-[8px] border border-[#fca5a5] bg-[#fef2f2] text-[#dc2626] text-[11.5px] font-[600] hover:bg-[#fee2e2] transition-colors"
                                                >
                                                    <X className="h-[11px] w-[11px]" /> Clear filters
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Click-outside overlay for col menu */}
                                    {showColMenu && <div className="fixed inset-0 z-[40]" onClick={() => setShowColMenu(false)} />}

                                    <div className="overflow-x-auto">
                                        {filteredRecords.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center p-[60px]">
                                                <Search className="h-[32px] w-[32px] text-[#d4d1ca] mb-[10px]" />
                                                <p className="text-[13px] text-[#9e9b95]">No records matching your filters</p>
                                            </div>
                                        ) : (
                                            <table className="w-full">
                                                <thead>
                                                    {/* Column headers with sort */}
                                                    <tr className="bg-[#f9f8f5] border-b border-[#e8e6e1]">
                                                        {visibleMeta.map(c => (
                                                            <th
                                                                key={c.key}
                                                                onClick={() => handleSort(c.key)}
                                                                className={`p-[10px_16px] text-[11px] font-[600] text-[#9e9b95] uppercase tracking-[0.5px] cursor-pointer select-none hover:text-[#1a1a18] hover:bg-[#f0efeb] transition-colors group ${c.numeric ? "text-right" : "text-left"
                                                                    }`}
                                                            >
                                                                <span className="inline-flex items-center gap-[2px]">
                                                                    {c.label}
                                                                    <SortIcon col={c.key} />
                                                                </span>
                                                            </th>
                                                        ))}
                                                        {role === "ADMIN" && <th className="p-[10px_16px] text-[11px] font-[600] text-[#9e9b95] uppercase tracking-[0.5px] text-right w-[60px]">Actions</th>}
                                                    </tr>
                                                    {/* Filter row */}
                                                    {showFilterRow && (
                                                        <tr className="bg-[#fafaf8] border-b border-[#e8e6e1]">
                                                            {visibleMeta.map(c => (
                                                                <td key={c.key} className="p-[4px_8px]">
                                                                    <input
                                                                        type={c.numeric ? "number" : "text"}
                                                                        placeholder={`Filter ${c.label}…`}
                                                                        value={colFilters[c.key] || ""}
                                                                        onChange={e => setColFilters(prev => ({ ...prev, [c.key]: e.target.value }))}
                                                                        className={`w-full bg-white border border-[#e8e6e1] rounded-[6px] px-[8px] py-[5px] text-[11.5px] text-[#1a1a18] placeholder-[#c5c3bd] outline-none focus:border-[#1a9e6e] focus:shadow-[0_0_0_2px_rgba(26,158,110,0.1)] transition-all ${c.numeric ? "text-right" : "text-left"
                                                                            } ${colFilters[c.key] ? "border-[#1a9e6e] bg-[#f0faf6]" : ""
                                                                            }`}
                                                                    />
                                                                </td>
                                                            ))}
                                                            {role === "ADMIN" && <td />}
                                                        </tr>
                                                    )}
                                                </thead>
                                                <tbody className="divide-y divide-[#e8e6e1]">
                                                    {filteredRecords.map((r: any) => (
                                                        <tr key={r.id} className="hover:bg-[#f9f8f5] transition-colors">
                                                            {visibleCols.has("date") && <td className="p-[12px_16px] text-[12.5px] font-mono text-[#6b6860] whitespace-nowrap">{r.date ? format(new Date(r.date), "dd/MM/yyyy") : "—"}</td>}
                                                            {visibleCols.has("inspector") && <td className="p-[12px_16px] text-[13px] font-[500] text-[#1a1a18] whitespace-nowrap">{r.inspector}</td>}
                                                            {visibleCols.has("company") && <td className="p-[12px_16px] text-[13px] text-[#6b6860]">{r.company}</td>}
                                                            {visibleCols.has("project") && <td className="p-[12px_16px] text-[13px] text-[#6b6860]">{r.project}</td>}
                                                            {visibleCols.has("part") && <td className="p-[12px_16px] text-[13px] text-[#6b6860]">{r.partName}</td>}
                                                            {visibleCols.has("location") && <td className="p-[12px_16px] text-[13px] text-[#6b6860]">{r.location}</td>}
                                                            {visibleCols.has("inspected") && <td className="p-[12px_16px] text-[13px] font-[600] font-mono text-right text-[#1a1a18]">{r.inspected}</td>}
                                                            {visibleCols.has("accepted") && <td className={`p-[12px_16px] text-[13px] font-[600] font-mono text-right ${r.accepted > 0 ? "text-[#0d6b4a]" : "text-[#1a1a18]"}`}>{r.accepted}</td>}
                                                            {visibleCols.has("rework") && <td className={`p-[12px_16px] text-[13px] font-[600] font-mono text-right ${r.rework > 0 ? "text-[#d97706]" : "text-[#1a1a18]"}`}>{r.rework}</td>}
                                                            {visibleCols.has("rejected") && <td className={`p-[12px_16px] text-[13px] font-[600] font-mono text-right ${r.rejected > 0 ? "text-[#dc2626]" : "text-[#1a1a18]"}`}>{r.rejected}</td>}
                                                            {role === "ADMIN" && (
                                                                <td className="p-[8px_12px] text-right">
                                                                    <button
                                                                        onClick={() => setDeleteConfirmId(r.id)}
                                                                        className="h-[28px] w-[28px] rounded-[7px] bg-[#fef2f2] border border-[#fca5a5] flex items-center justify-center hover:bg-[#fee2e2] transition-colors ml-auto"
                                                                        title="Delete record"
                                                                    >
                                                                        <Trash2 className="h-[13px] w-[13px] text-[#dc2626]" />
                                                                    </button>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            )
                        })()}

                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 w-[360px] max-w-[90vw]">
                        <div className="w-[44px] h-[44px] bg-[#fef2f2] rounded-full flex items-center justify-center mb-4">
                            <Trash2 className="h-5 w-5 text-[#dc2626]" />
                        </div>
                        <h3 className="text-[16px] font-semibold text-[#1a1a18] mb-1">Delete Inspection Record?</h3>
                        <p className="text-[13px] text-[#6b6860] mb-5 leading-relaxed">This action is permanent and cannot be undone. All responses associated with this record will be deleted.</p>
                        <div className="flex gap-2.5">
                            <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="flex-1 py-2.5 bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[13px] font-medium hover:bg-[#f9f8f5] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteRecord(deleteConfirmId)}
                                disabled={deleting}
                                className="flex-1 py-2.5 bg-[#dc2626] text-white rounded-[9px] text-[13px] font-medium hover:bg-[#b91c1c] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {deleting ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Delete Record
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
