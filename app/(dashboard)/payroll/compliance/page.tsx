"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import {
    Download, Loader2, ShieldCheck, Users, IndianRupee,
    RefreshCw, ArrowLeft, LayoutDashboard, AlertCircle
} from "lucide-react"
import { toast } from "sonner"

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]


type StatsData = {
    totalEmployees: number
    grossPay: number
    totalDeduction: number
    netPay: number
}

type ReportItem = {
    id: string
    label: string
    type: string
    badge?: string
}

const PF_REPORTS: ReportItem[] = [
    { id: "pf-deduction", label: "PF Deduction Report", type: "pf-deduction" },
    { id: "pf-summary", label: "PF Summary", type: "pf-summary" },
    { id: "pf-challan", label: "PF Challan", type: "pf-challan" },
    { id: "pf-ecr", label: "PF ECR File (For EPFO)", type: "pf-ecr" },
    { id: "pf-register", label: "PF Register (UAN Wise)", type: "pf-register" },
]

const ESIC_REPORTS: ReportItem[] = [
    { id: "esic-deduction", label: "ESIC Deduction Report", type: "esic-deduction" },
    { id: "esic-summary", label: "ESIC Summary", type: "esic-summary" },
    { id: "esic-challan", label: "ESIC Challan", type: "esic-challan" },
]

const PT_REPORTS: ReportItem[] = [
    { id: "pt-deduction", label: "PT Deduction Report", type: "pt-deduction" },
    { id: "pt-summary", label: "PT Summary", type: "pt-summary" },
    { id: "pt-challan", label: "PT Challan", type: "pt-challan" },
]

function fmt(n: number) {
    return "₹" + Math.round(n).toLocaleString("en-IN")
}

export default function ComplianceDownloadsPage() {
    const { data: session } = useSession()
    const router = useRouter()

    const now = new Date()
    const [month, setMonth] = useState(now.getMonth() + 1)
    const [year, setYear] = useState(now.getFullYear())
    const [state, setState] = useState("All States")

    const [employeeStates, setEmployeeStates] = useState<string[]>([])
    const [stats, setStats] = useState<StatsData | null>(null)
    const [loading, setLoading] = useState(false)
    const [dataLoaded, setDataLoaded] = useState(false)

    useEffect(() => {
        // Fetch distinct employee states from DB
        fetch("/api/employees")
            .then(r => r.json())
            .then((data: Array<{ state?: string }>) => {
                const states = Array.from(new Set(
                    (Array.isArray(data) ? data : (data as { data?: Array<{ state?: string }> }).data ?? [])
                        .map((e) => e.state)
                        .filter((s): s is string => !!s && s.trim() !== "")
                )).sort()
                setEmployeeStates(states)
            })
            .catch(() => {})
    }, [])

    const [downloading, setDownloading] = useState<string | null>(null)

    const role = session?.user?.role as string | undefined
    if (role && role !== "ADMIN" && role !== "MANAGER") {
        return <div className="p-8 text-[var(--text2)]">Access denied.</div>
    }

    const handleLoad = async () => {
        setLoading(true)
        setDataLoaded(false)
        setStats(null)
        try {
            const stateParam = state !== "All States" ? `&state=${encodeURIComponent(state)}` : ""
            const res = await fetch(`/api/payroll/reports/compliance?month=${month}&year=${year}&type=pf-summary${stateParam}`)
            if (!res.ok) {
                const msg = await res.text()
                toast.error(msg || "No payroll data found for this period.")
                setLoading(false)
                return
            }
            const data = await res.json()
            // Compute stats from the data
            const s: StatsData = {
                totalEmployees: data.length,
                grossPay: data.reduce((acc: number, r: Record<string, number>) => acc + (r.grossSalary || 0), 0),
                totalDeduction: data.reduce((acc: number, r: Record<string, number>) => acc + (r.totalDeductions || 0), 0),
                netPay: data.reduce((acc: number, r: Record<string, number>) => acc + (r.netSalary || 0), 0),
            }
            setStats(s)
            setDataLoaded(true)
            toast.success(`Loaded compliance data for ${MONTHS[month - 1]} ${year}.`)
        } catch (err) {
            console.error(err)
            toast.error("Failed to load compliance data.")
        } finally {
            setLoading(false)
        }
    }

    const handleReset = () => {
        setStats(null)
        setDataLoaded(false)
        setMonth(now.getMonth() + 1)
        setYear(now.getFullYear())
        setState("All States")
    }

    const handleDownload = async (item: ReportItem) => {
        setDownloading(item.id)
        try {
            const stateParam = state !== "All States" ? `&state=${encodeURIComponent(state)}` : ""
            const res = await fetch(`/api/payroll/reports/compliance?month=${month}&year=${year}&type=${item.type}${stateParam}`)
            if (!res.ok) {
                const msg = await res.text()
                toast.error(msg || "No data found.")
                return
            }
            const data = await res.json()
            if (!data || data.length === 0) {
                toast.error("No data to download for this report.")
                return
            }

            const wb = XLSX.utils.book_new()
            const ws = XLSX.utils.json_to_sheet(data)

            // Auto column widths
            const cols = Object.keys(data[0] || {})
            ws["!cols"] = cols.map(k => ({ wch: Math.max(k.length + 2, 14) }))

            XLSX.utils.book_append_sheet(wb, ws, item.label.substring(0, 31))
            const fileName = `${item.label.replace(/[^a-zA-Z0-9 ]/g, "").replace(/ /g, "_")}_${MONTHS[month - 1]}_${year}.xlsx`
            XLSX.writeFile(wb, fileName)
            toast.success(`Downloaded: ${fileName}`)
        } catch (err) {
            console.error(err)
            toast.error("Download failed.")
        } finally {
            setDownloading(null)
        }
    }

    const StatCard = ({ label, value, color }: { label: string; value: string; color: string }) => (
        <div className={`flex-1 min-w-[150px] bg-white border border-[var(--border)] rounded-[12px] p-4 ${color}`}>
            <p className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide mb-1">{label}</p>
            <p className="text-[18px] font-bold text-[var(--text)]">{value}</p>
        </div>
    )

    const SectionHeader = ({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) => (
        <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-[8px] bg-[var(--accent-light)] flex items-center justify-center">
                {icon}
            </div>
            <h3 className="text-[14px] font-semibold text-[var(--text)]">{title}</h3>
            <span className="ml-auto text-[11px] font-semibold text-[var(--accent)] bg-[var(--accent-light)] px-2.5 py-1 rounded-full">
                {count} Downloads
            </span>
        </div>
    )

    const ReportRow = ({ item }: { item: ReportItem }) => (
        <div className="flex items-center justify-between py-2.5 px-3 rounded-[8px] hover:bg-[var(--surface2)] transition-colors group">
            <span className="text-[13px] text-[var(--text2)] group-hover:text-[var(--text)]">{item.label}</span>
            <button
                onClick={() => handleDownload(item)}
                disabled={!dataLoaded || downloading === item.id}
                title={!dataLoaded ? "Load compliance data first" : `Download ${item.label}`}
                className="h-8 w-8 rounded-[8px] flex items-center justify-center border border-[var(--border)] bg-white hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-all text-[var(--text3)]"
            >
                {downloading === item.id
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Download size={13} />
                }
            </button>
        </div>
    )

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push("/payroll")}
                        className="p-2 rounded-[8px] hover:bg-[var(--surface2)] text-[var(--text3)] transition-colors"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="text-[20px] font-semibold text-[var(--text)] flex items-center gap-2">
                            <ShieldCheck size={20} className="text-[var(--accent)]" />
                            Compliance Downloads
                        </h1>
                        <p className="text-[13px] text-[var(--text2)] mt-0.5">
                            Download PF, ESIC and Professional Tax compliance reports
                        </p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                <div className="flex flex-wrap gap-3 items-end">
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
                    {employeeStates.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">State (PT Filter)</label>
                            <select
                                value={state}
                                onChange={e => setState(e.target.value)}
                                className="h-9 px-3 border border-[var(--border)] rounded-[8px] text-[13px] bg-white text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 min-w-[160px]"
                            >
                                <option value="All States">All States</option>
                                {employeeStates.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <button
                        onClick={handleLoad}
                        disabled={loading}
                        className="flex items-center gap-2 bg-[var(--accent)] hover:opacity-90 disabled:opacity-60 text-white rounded-[10px] text-[13px] font-medium px-4 py-2 transition-all h-9"
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                        {loading ? "Loading..." : "Load Compliance Data"}
                    </button>
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-2 border border-[var(--border)] hover:bg-[var(--surface2)] text-[var(--text2)] rounded-[10px] text-[13px] font-medium px-4 py-2 transition-colors h-9"
                    >
                        <RefreshCw size={14} />
                        Reset
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            {stats && (
                <div className="flex flex-wrap gap-3">
                    <StatCard label="Total Employees" value={String(stats.totalEmployees)} color="border-l-4 border-l-blue-400" />
                    <StatCard label="Gross Pay" value={fmt(stats.grossPay)} color="border-l-4 border-l-emerald-400" />
                    <StatCard label="Total Deduction" value={fmt(stats.totalDeduction)} color="border-l-4 border-l-red-400" />
                    <StatCard label="Net Pay" value={fmt(stats.netPay)} color="border-l-4 border-l-violet-400" />
                </div>
            )}

            {!dataLoaded && !loading && (
                <div className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-200 rounded-[10px] text-[13px] text-amber-700">
                    <AlertCircle size={15} className="shrink-0" />
                    Select a payroll month and click "Load Compliance Data" to enable downloads.
                </div>
            )}

            {/* PF Section */}
            <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                <SectionHeader
                    icon={<span className="text-[11px] font-bold text-[var(--accent)]">PF</span>}
                    title="Provident Fund (PF)"
                    count={PF_REPORTS.length}
                />
                <div className="space-y-0.5">
                    {PF_REPORTS.map(item => <ReportRow key={item.id} item={item} />)}
                </div>
            </div>

            {/* ESIC Section */}
            <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                <SectionHeader
                    icon={<span className="text-[10px] font-bold text-[var(--accent)]">ESI</span>}
                    title="ESIC"
                    count={ESIC_REPORTS.length}
                />
                <div className="space-y-0.5">
                    {ESIC_REPORTS.map(item => <ReportRow key={item.id} item={item} />)}
                </div>
            </div>

            {/* PT Section */}
            <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                <SectionHeader
                    icon={<span className="text-[10px] font-bold text-[var(--accent)]">PT</span>}
                    title="Professional Tax (PT)"
                    count={PT_REPORTS.length}
                />
                <div className="space-y-0.5">
                    {PT_REPORTS.map(item => <ReportRow key={item.id} item={item} />)}
                </div>
            </div>

            {/* Note */}
            <p className="text-[12px] text-[var(--text3)] text-center px-4">
                Compliance documents will be generated based on processed payroll data.
            </p>

            {/* Footer Buttons */}
            <div className="flex flex-wrap gap-3 justify-center pb-4">
                <button
                    onClick={() => router.push("/payroll")}
                    className="flex items-center gap-2 border border-[var(--border)] hover:bg-[var(--surface2)] text-[var(--text2)] rounded-[10px] text-[13px] font-medium px-5 py-2.5 transition-colors"
                >
                    <ArrowLeft size={14} />
                    Back to Payroll Processing
                </button>
                <button
                    onClick={() => router.push("/admin")}
                    className="flex items-center gap-2 bg-[var(--accent)] hover:opacity-90 text-white rounded-[10px] text-[13px] font-medium px-5 py-2.5 transition-all"
                >
                    <LayoutDashboard size={14} />
                    Go to Dashboard
                </button>
            </div>
        </div>
    )
}
