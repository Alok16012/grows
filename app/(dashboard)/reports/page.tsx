"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns"
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    ComposedChart, Line, LineChart, AreaChart, Area,
    ZAxis,
} from "recharts"
import {
    LayoutDashboard,
    BarChart3,
    PieChart as PieChartIcon,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    CheckCircle2,
    ClipboardList,
    History,
    FileText,
    Search,
    ChevronRight,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    Printer,
    FileDown,
    Calendar,
    Building2,
    Users2,
    HardHat
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// ─── Colors & Theme ───────────────────────────────────────────────────────────
const THEME = {
    primary: "#2563eb",   // Blue
    success: "#16a34a",   // Green
    warning: "#ea580c",   // Orange
    danger: "#dc2626",    // Red
    info: "#0284c7",      // Sky Blue
    accent: "#7c3aed",    // Violet
    background: "#f8fafc",
    card: "#ffffff",
    border: "#e2e8f0",
    textMain: "#0f172a",
    textMuted: "#64748b"
}

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]

// ─── Types ────────────────────────────────────────────────────────────────────
interface Summary {
    totalInspected: number
    totalAccepted: number
    totalRework: number
    totalRejected: number
    acceptanceRate: number
    reworkRate: number
    rejectionRate: number
    reworkPPM: number
    rejectionPPM: number
    overallPPM: number
    period: string
    companyName: string
    partModel: string
}

interface PartWise {
    partName: string
    totalInspected: number
    totalAccepted: number
    totalRework: number
    totalRejected: number
    reworkPercent: number
    rejectionPercent: number
    qualityRate: number
}

interface DayWise {
    date: string
    totalInspected: number
    totalAccepted: number
    totalRework: number
    totalRejected: number
    qualityRate: number
}

interface LocationWise {
    location: string
    totalInspected: number
    totalRework: number
    totalRejected: number
}

interface TopDefect {
    defectName: string
    count: number
    percentage: number
}

interface ReportRecord {
    id: string
    inspector: string
    date: string
    company: string
    project: string
    inspected: number
    accepted: number
    rework: number
    rejected: number
    partName: string
    location: string
}

interface ReportData {
    summary: Summary
    partWise: PartWise[]
    dayWise: DayWise[]
    locationWise: LocationWise[]
    topDefects: TopDefect[]
    records: ReportRecord[]
}

// ─── Animated Counter Hook ────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1000) {
    const [value, setValue] = useState(0)
    const ref = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        if (target === 0) { setValue(0); return }
        let start = 0
        const step = Math.ceil(target / (duration / 30))
        if (ref.current) clearInterval(ref.current)
        ref.current = setInterval(() => {
            start += step
            if (start >= target) {
                setValue(target)
                if (ref.current) clearInterval(ref.current)
            } else {
                setValue(start)
            }
        }, 30)
        return () => { if (ref.current) clearInterval(ref.current) }
    }, [target, duration])

    return value
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color, icon: Icon, delay = 0 }: {
    label: string; value: number | string; color: string; icon: any; delay?: number
}) {
    const numericValue = typeof value === "number" ? value : 0
    const animated = useCountUp(numericValue)
    const displayValue = typeof value === "string" ? value : animated.toLocaleString()

    return (
        <Card
            className="border-none shadow-sm hover:shadow-md transition-shadow animate-fadeIn"
            style={{ animationDelay: `${delay}ms` }}
        >
            <CardContent className="p-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl" style={{ backgroundColor: `${color}15`, color }}>
                        <Icon className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                        <p className="text-2xl font-black text-slate-900 leading-none">{displayValue}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

// ─── Tab Button ──────────────────────────────────────────────────────────────
function TabButton({ name, active, onClick }: { name: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "px-5 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap",
                active
                    ? "bg-primary text-white shadow-md shadow-primary/20 scale-105"
                    : "text-muted-foreground hover:bg-slate-100"
            )}
        >
            {name}
        </button>
    )
}

// ─── PPM Box ──────────────────────────────────────────────────────────────────
function PpmBox({ label, value, color }: { label: string; value: number; color: string }) {
    const animated = useCountUp(value)
    return (
        <div className="flex-1 bg-white border rounded-2xl p-6 text-center shadow-sm" style={{ borderColor: THEME.border }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: THEME.textMuted }}>{label}</p>
            <p className="text-5xl font-black tabular-nums" style={{ color }}>{animated.toLocaleString()}</p>
            <p className="text-xs mt-2" style={{ color: THEME.textMuted }}>parts per million</p>
        </div>
    )
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white border rounded-xl shadow-xl p-3 text-sm" style={{ borderColor: THEME.border, minWidth: 160 }}>
            {label && <p className="font-bold mb-2" style={{ color: THEME.textMain }}>{label}</p>}
            {payload.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2 mb-1">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
                    <span style={{ color: THEME.textMuted }}>{p.name}:</span>
                    <span className="font-bold" style={{ color: THEME.textMain }}>{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
                </div>
            ))}
        </div>
    )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ value, color }: { value: number; color: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-2 rounded-full" style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }} />
            </div>
            <span className="text-xs font-bold w-12 text-right" style={{ color }}>{value.toFixed(1)}%</span>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
    const { data: session } = useSession()
    const role = session?.user?.role

    const now = new Date()
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
    const [selectedYear, setSelectedYear] = useState(now.getFullYear())
    const [selectedCompanyId, setSelectedCompanyId] = useState("all")
    const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
    const [data, setData] = useState<ReportData | null>(null)
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState("Dashboard")
    const [generated, setGenerated] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")

    // Fetch companies for admin/manager dropdown
    useEffect(() => {
        if (role === "ADMIN" || role === "MANAGER") {
            fetch("/api/companies")
                .then(r => r.json())
                .then(d => setCompanies(Array.isArray(d) ? d : []))
                .catch(() => { })
        }
    }, [role])

    const fetchReport = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                month: String(selectedMonth),
                year: String(selectedYear),
            })
            if (selectedCompanyId !== "all") params.set("companyId", selectedCompanyId)
            const res = await fetch(`/api/reports?${params.toString()}`)
            const d = await res.json()
            setData(d)
            setGenerated(true)
        } catch {
            // silent
        } finally {
            setLoading(false)
        }
    }, [selectedMonth, selectedYear, selectedCompanyId])

    // Auto-fetch on mount
    useEffect(() => {
        fetchReport()
    }, [])

    const handlePrint = () => window.print()

    const s = data?.summary

    // Filtering logic for the inspection report tab
    const filteredRecords = useMemo(() => {
        if (!data?.records) return []
        if (!searchTerm) return data.records
        const low = searchTerm.toLowerCase()
        return data.records.filter(r =>
            r.id.toLowerCase().includes(low) ||
            r.inspector.toLowerCase().includes(low) ||
            r.partName.toLowerCase().includes(low) ||
            r.location.toLowerCase().includes(low) ||
            r.project.toLowerCase().includes(low)
        )
    }, [data?.records, searchTerm])

    // Memoized chart data
    const pieData = useMemo(() => s ? [
        { name: "Accepted", value: s.totalAccepted, color: THEME.success },
        { name: "Rework", value: s.totalRework, color: THEME.warning },
        { name: "Rejected", value: s.totalRejected, color: THEME.danger },
    ] : [], [s])

    const areaData = useMemo(() => (data?.dayWise || []).map(d => ({
        ...d,
        label: (() => { try { return format(parseISO(d.date), "MMM dd") } catch { return d.date } })(),
    })), [data?.dayWise])

    const paretoData = useMemo(() => (data?.topDefects || []).map((d, i, arr) => {
        const cumSum = arr.slice(0, i + 1).reduce((a, b) => a + b.count, 0)
        const totalD = arr.reduce((a, b) => a + b.count, 0)
        return { ...d, cumulative: totalD > 0 ? parseFloat(((cumSum / totalD) * 100).toFixed(1)) : 0 }
    }), [data?.topDefects])

    return (
        <div className="min-h-screen pb-20 space-y-6" style={{ background: THEME.background }}>
            <style jsx global>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn { animation: fadeIn 0.4s ease-out both; }
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; -webkit-print-color-adjust: exact; }
                    .print-card { border: 1px solid #eee !important; box-shadow: none !important; }
                }
            `}</style>

            {/* ── TOP NAV BAR ─────────────────────────────────────── */}
            <header className="no-print bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="bg-primary p-1.5 rounded-lg text-white">
                        <ClipboardList className="h-5 w-5" />
                    </div>
                    <span className="font-black text-xl tracking-tight text-slate-900">QC PRO</span>
                </div>
                <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-[10px] font-bold py-0 h-5 px-1.5 border-slate-200 text-slate-400">v1.2.0</Badge>
                </div>
            </header>

            <div className="max-w-[1600px] mx-auto px-4 lg:px-8 space-y-6">
                {/* ── FILTER & TAB BAR ────────────────────────────────── */}
                <div className="no-print flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 py-4">
                    <div className="flex flex-wrap items-center gap-2 p-1 bg-white rounded-full border border-slate-200 shadow-sm overflow-x-auto max-w-full no-scrollbar">
                        {["Dashboard", "Graphical", "Pareto Chart", "Day Wise", "Part Wise", "Inspection Report"].map(tab => (
                            <TabButton
                                key={tab}
                                name={tab}
                                active={activeTab === tab}
                                onClick={() => setActiveTab(tab)}
                            />
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-1.5 shadow-sm">
                            {(role === "ADMIN" || role === "MANAGER") && (
                                <select
                                    className="bg-transparent text-sm font-bold focus:outline-none border-r border-slate-200 pr-3 mr-1"
                                    value={selectedCompanyId}
                                    onChange={e => setSelectedCompanyId(e.target.value)}
                                >
                                    <option value="all">Global View</option>
                                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            )}
                            <select
                                className="bg-transparent text-sm font-bold focus:outline-none border-r border-slate-200 pr-3 mr-1"
                                value={selectedMonth}
                                onChange={e => setSelectedMonth(Number(e.target.value))}
                            >
                                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                            </select>
                            <select
                                className="bg-transparent text-sm font-bold focus:outline-none"
                                value={selectedYear}
                                onChange={e => setSelectedYear(Number(e.target.value))}
                            >
                                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>

                        <Button
                            className="rounded-xl font-bold px-6 shadow-lg shadow-primary/20"
                            onClick={fetchReport}
                            disabled={loading}
                        >
                            {loading ? "Generating..." : "+ New Entry"}
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
                    </div>
                ) : !data ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white rounded-3xl border border-dashed border-slate-300">
                        <div className="p-6 bg-slate-50 rounded-full"><AlertCircle className="h-12 w-12 text-slate-200" /></div>
                        <h2 className="text-xl font-black text-slate-900">No report data loaded</h2>
                        <Button onClick={fetchReport} variant="secondary" className="font-bold">Initialize Dashboard</Button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* ── KPI SECTION ─────────────────────────────────── */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 print-avoid">
                            <KpiCard label="Total Inspected" value={s?.totalInspected || 0} color={THEME.info} icon={History} delay={0} />
                            <KpiCard label="Total Accepted" value={s?.totalAccepted || 0} color={THEME.success} icon={CheckCircle2} delay={100} />
                            <KpiCard label="Total Rework" value={s?.totalRework || 0} color={THEME.warning} icon={TrendingDown} delay={200} />
                            <KpiCard label="Total Rejected" value={s?.totalRejected || 0} color={THEME.danger} icon={AlertCircle} delay={300} />
                            <KpiCard label="Rework PPM" value={s?.reworkPPM || 0} color={THEME.accent} icon={TrendingUp} delay={400} />
                            <KpiCard label="Rejection PPM" value={s?.rejectionPPM || 0} color={THEME.danger} icon={AlertCircle} delay={500} />
                        </div>

                        {/* ── TAB CONTENT ─────────────────────────────────── */}
                        <div className="animate-fadeIn">
                            {activeTab === "Dashboard" && (
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                                    {/* Overall Status - Donut */}
                                    <Card className="lg:col-span-4 border-none shadow-sm overflow-hidden flex flex-col">
                                        <CardHeader className="pb-0">
                                            <CardTitle className="text-lg font-black text-slate-800">Overall Status</CardTitle>
                                        </CardHeader>
                                        <CardContent className="flex-1 flex flex-col justify-center items-center py-8">
                                            {(s?.totalInspected || 0) > 0 ? (
                                                <div className="w-full h-[300px] relative">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <PieChart>
                                                            <Pie
                                                                data={pieData}
                                                                innerRadius={80}
                                                                outerRadius={120}
                                                                paddingAngle={8}
                                                                dataKey="value"
                                                                stroke="none"
                                                            >
                                                                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                                                            </Pie>
                                                            <Tooltip content={<CustomTooltip />} />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                        <span className="text-4xl font-black text-slate-900 leading-none">{s?.acceptanceRate.toFixed(1)}%</span>
                                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">Acceptance</span>
                                                    </div>
                                                </div>
                                            ) : <EmptyState />}
                                            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-4">
                                                {pieData.map(e => (
                                                    <div key={e.name} className="flex items-center gap-2">
                                                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: e.color }} />
                                                        <span className="text-[11px] font-bold text-slate-600">{e.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Trend Analysis - Area Chart */}
                                    <Card className="lg:col-span-8 border-none shadow-sm flex flex-col">
                                        <CardHeader className="pb-0 flex flex-row items-center justify-between">
                                            <div>
                                                <CardTitle className="text-lg font-black text-slate-800">Trend Analysis</CardTitle>
                                                <CardDescription className="text-xs font-bold text-slate-400 mt-0.5">Daily inspection performance and PPM trends</CardDescription>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="flex-1 pt-6">
                                            {areaData.length > 0 ? (
                                                <ResponsiveContainer width="100%" height={320}>
                                                    <AreaChart data={areaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                        <defs>
                                                            <linearGradient id="colorAccepted" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor={THEME.success} stopOpacity={0.1} />
                                                                <stop offset="95%" stopColor={THEME.success} stopOpacity={0} />
                                                            </linearGradient>
                                                            <linearGradient id="colorInspected" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor={THEME.primary} stopOpacity={0.1} />
                                                                <stop offset="95%" stopColor={THEME.primary} stopOpacity={0} />
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                        <XAxis
                                                            dataKey="label"
                                                            axisLine={false}
                                                            tickLine={false}
                                                            tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
                                                            dy={10}
                                                        />
                                                        <YAxis
                                                            axisLine={false}
                                                            tickLine={false}
                                                            tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
                                                        />
                                                        <Tooltip content={<CustomTooltip />} />
                                                        <Area
                                                            type="monotone"
                                                            dataKey="totalInspected"
                                                            name="Inspected"
                                                            stroke={THEME.primary}
                                                            strokeWidth={3}
                                                            fillOpacity={1}
                                                            fill="url(#colorInspected)"
                                                        />
                                                        <Area
                                                            type="monotone"
                                                            dataKey="totalAccepted"
                                                            name="Accepted"
                                                            stroke={THEME.success}
                                                            strokeWidth={3}
                                                            fillOpacity={1}
                                                            fill="url(#colorAccepted)"
                                                        />
                                                        <Line
                                                            type="monotone"
                                                            dataKey="totalRejected"
                                                            name="Rejected"
                                                            stroke={THEME.danger}
                                                            strokeWidth={3}
                                                            dot={{ r: 4, fill: THEME.danger, strokeWidth: 2, stroke: "white" }}
                                                        />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            ) : <EmptyState />}
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                            {activeTab === "Graphical" && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <Card className="border-none shadow-sm p-6">
                                        <CardTitle className="text-lg font-black mb-6">Part-Wise Quality Split</CardTitle>
                                        {data.partWise.length > 0 ? (
                                            <ResponsiveContainer width="100%" height={400}>
                                                <BarChart data={data.partWise} layout="vertical" margin={{ left: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                                                    <YAxis dataKey="partName" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} width={120} />
                                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
                                                    <Bar dataKey="totalAccepted" name="Accepted" stackId="a" fill={THEME.success} radius={[0, 0, 0, 0]} />
                                                    <Bar dataKey="totalRework" name="Rework" stackId="a" fill={THEME.warning} />
                                                    <Bar dataKey="totalRejected" name="Rejected" stackId="a" fill={THEME.danger} radius={[0, 4, 4, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : <EmptyState />}
                                    </Card>
                                    <Card className="border-none shadow-sm p-6">
                                        <CardTitle className="text-lg font-black mb-6">Comparison by Location</CardTitle>
                                        {data.locationWise.length > 0 ? (
                                            <ResponsiveContainer width="100%" height={400}>
                                                <BarChart data={data.locationWise}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="location" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
                                                    <Bar dataKey="totalInspected" name="Inspected" fill={THEME.info} radius={[4, 4, 0, 0]} barSize={40} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : <EmptyState />}
                                    </Card>
                                </div>
                            )}

                            {activeTab === "Pareto Chart" && (
                                <Card className="border-none shadow-sm p-8">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                                        <div>
                                            <CardTitle className="text-2xl font-black text-slate-900">Top Defect Analysis</CardTitle>
                                            <CardDescription className="font-bold text-slate-400">Identify 80% of quality issues from 20% of defect types (Pareto Principle)</CardDescription>
                                        </div>
                                        <Badge variant="secondary" className="bg-orange-50 text-orange-600 border-orange-100 font-black px-4 py-1 self-start md:self-center">
                                            Major Defects Only
                                        </Badge>
                                    </div>
                                    {data.topDefects.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={450}>
                                            <ComposedChart data={paretoData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="defectName" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} angle={-45} textAnchor="end" height={80} dy={20} />
                                                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                                                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} unit="%" />
                                                <Tooltip content={<CustomTooltip />} />
                                                <Bar yAxisId="left" dataKey="count" name="Frequency" fill={THEME.danger} radius={[4, 4, 0, 0]} barSize={60} />
                                                <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulative %" stroke={THEME.warning} strokeWidth={4} dot={{ r: 6, fill: THEME.warning, strokeWidth: 3, stroke: "white" }} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    ) : <EmptyState />}
                                </Card>
                            )}

                            {activeTab === "Day Wise" && (
                                <Card className="border-none shadow-sm overflow-hidden">
                                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                        <CardTitle className="text-lg font-black">Daily Inspection Log</CardTitle>
                                        <Button variant="outline" size="sm" className="font-bold h-8 rounded-lg" onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Print Log</Button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-100">
                                                    {["Date", "Inspected", "Accepted", "Rework", "Rejected", "Quality Status"].map(h => (
                                                        <th key={h} className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-400">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {data.dayWise.map((d, i) => (
                                                    <tr key={d.date} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-4 font-bold text-slate-700">{format(parseISO(d.date), "dd MMM yyyy, EEE")}</td>
                                                        <td className="px-6 py-4 font-black text-slate-900">{d.totalInspected.toLocaleString()}</td>
                                                        <td className="px-6 py-4 font-bold text-green-600 bg-green-50/30">{d.totalAccepted.toLocaleString()}</td>
                                                        <td className="px-6 py-4 font-bold text-orange-600">{d.totalRework.toLocaleString()}</td>
                                                        <td className="px-6 py-4 font-bold text-red-600">{d.totalRejected.toLocaleString()}</td>
                                                        <td className="px-6 py-4 w-48"><ProgressBar value={d.qualityRate} color={d.qualityRate >= 99 ? THEME.success : d.qualityRate >= 95 ? THEME.warning : THEME.danger} /></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            )}

                            {activeTab === "Part Wise" && (
                                <Card className="border-none shadow-sm overflow-hidden">
                                    <div className="p-6 border-b border-slate-100">
                                        <CardTitle className="text-lg font-black">Performance by Component</CardTitle>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-100">
                                                    {["Component", "Inspected", "Accepted", "Rework", "Rejected", "Quality Rate"].map(h => (
                                                        <th key={h} className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-400">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {data.partWise.map((p, i) => (
                                                    <tr key={p.partName} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-4 font-black text-slate-800">{p.partName}</td>
                                                        <td className="px-6 py-4 font-bold text-blue-600">{p.totalInspected.toLocaleString()}</td>
                                                        <td className="px-6 py-4 font-bold text-green-600">{p.totalAccepted.toLocaleString()}</td>
                                                        <td className="px-6 py-4 font-bold text-orange-600">{p.totalRework.toLocaleString()}</td>
                                                        <td className="px-6 py-4 font-bold text-red-600">{p.totalRejected.toLocaleString()}</td>
                                                        <td className="px-6 py-4 w-48"><ProgressBar value={p.qualityRate} color={p.qualityRate >= 99 ? THEME.success : p.qualityRate >= 95 ? THEME.warning : THEME.danger} /></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            )}

                            {/* Inspector Wise removed as per request */}

                            {activeTab === "Inspection Report" && (
                                <Card className="border-none shadow-sm overflow-hidden">
                                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div>
                                            <CardTitle className="text-lg font-black">Raw Inspection Records</CardTitle>
                                            <CardDescription className="text-xs font-bold text-slate-400">Export or search through individual inspection entries</CardDescription>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                <Input
                                                    className="pl-9 h-9 w-[240px] rounded-xl border-slate-200 bg-slate-50/50 font-bold text-sm focus:bg-white transition-all"
                                                    placeholder="Search records..."
                                                    value={searchTerm}
                                                    onChange={e => setSearchTerm(e.target.value)}
                                                />
                                            </div>
                                            <Button variant="outline" className="h-9 rounded-xl font-black text-xs border-slate-200"><FileDown className="h-4 w-4 mr-2" />CSV</Button>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-100">
                                                    {["Date", "Inspector", "Company", "Project", "Part", "Location", "Inspected", "Accepted"].map(h => (
                                                        <th key={h} className="px-6 py-4 text-left font-black uppercase tracking-wider text-slate-400">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {filteredRecords.map(r => (
                                                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-4 font-bold text-slate-500 whitespace-nowrap">{format(new Date(r.date), "dd MMM, HH:mm")}</td>
                                                        <td className="px-6 py-4 font-black text-slate-800">{r.inspector}</td>
                                                        <td className="px-6 py-4 font-bold text-slate-600">{r.company}</td>
                                                        <td className="px-6 py-4 font-bold text-slate-400">{r.project}</td>
                                                        <td className="px-6 py-4"><Badge variant="outline" className="bg-slate-100/50 border-slate-200 text-slate-900 font-bold">{r.partName}</Badge></td>
                                                        <td className="px-6 py-4 font-bold text-slate-500">{r.location}</td>
                                                        <td className="px-6 py-4 font-black text-slate-900">{r.inspected}</td>
                                                        <td className="px-6 py-4 font-black text-green-600">{r.accepted}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {filteredRecords.length === 0 && (
                                            <div className="py-20 flex flex-col items-center gap-2 text-slate-400">
                                                <Search className="h-8 w-8 opacity-20" />
                                                <p className="font-bold">No records matching your search</p>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center p-12 text-center h-full min-h-[300px]">
            <div className="p-4 rounded-full bg-slate-50 mb-4 animate-bounce">
                <ClipboardList className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="font-bold text-slate-900">No data available</h3>
            <p className="text-sm text-slate-500 max-w-[200px] mt-1 font-medium">Please select a different period or check your current filters.</p>
        </div>
    )
}
