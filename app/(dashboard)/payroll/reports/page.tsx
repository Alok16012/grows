"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import {
    Download, Loader2, FileText, RefreshCw, ArrowLeft,
    LayoutDashboard, AlertCircle, Search, Info, Building2
} from "lucide-react"
import { toast } from "sonner"

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]

const BANK_FORMATS = [
    "Standard NEFT Format",
    "SBI Format",
    "HDFC Format",
    "ICICI Format",
]

const REPORT_TYPES = ["Select Report", "Wage Sheet", "Bank NEFT File"]

type Site = { id: string; name: string }

type DownloadHistoryItem = {
    id: string
    reportType: string
    month: string
    site: string
    option: string
    downloadedBy: string
    downloadedOn: string
}

const HISTORY_KEY = "payroll_download_history"

function getHistory(): DownloadHistoryItem[] {
    if (typeof window === "undefined") return []
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]")
    } catch {
        return []
    }
}

function saveHistory(item: Omit<DownloadHistoryItem, "id">) {
    const history = getHistory()
    const newItem: DownloadHistoryItem = { ...item, id: Date.now().toString() }
    const updated = [newItem, ...history].slice(0, 10)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
    return updated
}

export default function ReportsDownloadsPage() {
    const { data: session } = useSession()
    const router = useRouter()

    const now = new Date()
    const [month, setMonth] = useState(now.getMonth() + 1)
    const [year, setYear] = useState(now.getFullYear())
    const [reportType, setReportType] = useState("Select Report")
    const [selectedSite, setSelectedSite] = useState("all")
    const [downloadOption, setDownloadOption] = useState<"site-wise" | "combine">("site-wise")

    const [sites, setSites] = useState<Site[]>([])
    const [loadingSites, setLoadingSites] = useState(false)

    const [wageFormat, setWageFormat] = useState<"excel" | "pdf">("excel")
    const [bankFormat, setBankFormat] = useState(BANK_FORMATS[0])

    const [downloadingWage, setDownloadingWage] = useState(false)
    const [downloadingBank, setDownloadingBank] = useState(false)

    const [history, setHistory] = useState<DownloadHistoryItem[]>([])

    const role = session?.user?.role as string | undefined

    useEffect(() => {
        setHistory(getHistory())
        fetchSites()
    }, [])

    const fetchSites = async () => {
        setLoadingSites(true)
        try {
            const res = await fetch("/api/sites")
            if (res.ok) {
                const data = await res.json()
                setSites(data)
            }
        } catch {
            // silently fail
        } finally {
            setLoadingSites(false)
        }
    }

    if (role && role !== "ADMIN" && role !== "MANAGER") {
        return <div className="p-8 text-[var(--text2)]">Access denied.</div>
    }

    const monthLabel = `${MONTHS[month - 1]} ${year}`
    const siteName = selectedSite === "all"
        ? "All Sites"
        : sites.find(s => s.id === selectedSite)?.name ?? "All Sites"

    const handleViewSummary = () => {
        if (reportType === "Select Report") {
            toast.error("Please select a Report Type.")
            return
        }
        toast.info(`Showing summary for ${reportType} — ${monthLabel}`)
    }

    const handleReset = () => {
        setMonth(now.getMonth() + 1)
        setYear(now.getFullYear())
        setReportType("Select Report")
        setSelectedSite("all")
        setDownloadOption("site-wise")
        setWageFormat("excel")
        setBankFormat(BANK_FORMATS[0])
    }

    const handleDownloadWage = async () => {
        if (wageFormat === "pdf") {
            toast.info("PDF format coming soon — downloading Excel instead.")
        }
        setDownloadingWage(true)
        try {
            const siteParam = downloadOption === "site-wise" && selectedSite !== "all"
                ? `&siteId=${encodeURIComponent(selectedSite)}`
                : ""
            const res = await fetch(`/api/payroll/export?month=${month}&year=${year}${siteParam}`)
            if (!res.ok) {
                const msg = await res.text()
                toast.error(msg || "No payroll data found for this period.")
                return
            }
            const data = await res.json()
            if (!data || data.length === 0) {
                toast.error("No data to download.")
                return
            }

            const wb = XLSX.utils.book_new()
            const ws = XLSX.utils.json_to_sheet(data)
            const cols = Object.keys(data[0] || {})
            ws["!cols"] = cols.map(k => ({ wch: Math.max(k.length + 2, 14) }))
            XLSX.utils.book_append_sheet(wb, ws, "Wage Sheet")
            const fileName = `Wage_Sheet_${MONTHS[month - 1]}_${year}.xlsx`
            XLSX.writeFile(wb, fileName)

            const updated = saveHistory({
                reportType: "Wage Sheet",
                month: monthLabel,
                site: siteName,
                option: downloadOption === "combine" ? "Combined" : "Site Wise",
                downloadedBy: session?.user?.name ?? "Admin",
                downloadedOn: new Date().toLocaleString("en-IN"),
            })
            setHistory(updated)
            toast.success(`Downloaded: ${fileName}`)
        } catch (err) {
            console.error(err)
            toast.error("Download failed.")
        } finally {
            setDownloadingWage(false)
        }
    }

    const handleDownloadBank = async () => {
        setDownloadingBank(true)
        try {
            const siteParam = downloadOption === "site-wise" && selectedSite !== "all"
                ? `&siteId=${encodeURIComponent(selectedSite)}`
                : ""
            const res = await fetch(`/api/payroll/reports/bank-sheet?month=${month}&year=${year}${siteParam}`)
            if (!res.ok) {
                const msg = await res.text()
                toast.error(msg || "No processed payroll data found.")
                return
            }
            const data = await res.json()
            if (!data || data.length === 0) {
                toast.error("No bank data to download.")
                return
            }

            const wb = XLSX.utils.book_new()
            const ws = XLSX.utils.json_to_sheet(data)
            const cols = Object.keys(data[0] || {})
            ws["!cols"] = cols.map(k => ({ wch: Math.max(k.length + 2, 16) }))
            XLSX.utils.book_append_sheet(wb, ws, "Bank NEFT")
            const fileName = `Bank_NEFT_${MONTHS[month - 1]}_${year}.xlsx`
            XLSX.writeFile(wb, fileName)

            const updated = saveHistory({
                reportType: "Bank NEFT File",
                month: monthLabel,
                site: siteName,
                option: downloadOption === "combine" ? "Combined" : "Site Wise",
                downloadedBy: session?.user?.name ?? "Admin",
                downloadedOn: new Date().toLocaleString("en-IN"),
            })
            setHistory(updated)
            toast.success(`Downloaded: ${fileName}`)
        } catch (err) {
            console.error(err)
            toast.error("Download failed.")
        } finally {
            setDownloadingBank(false)
        }
    }

    const handleDownloadAgain = async (item: DownloadHistoryItem) => {
        if (item.reportType === "Wage Sheet") {
            await handleDownloadWage()
        } else {
            await handleDownloadBank()
        }
    }

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div>
                {/* Breadcrumb */}
                <nav className="flex items-center gap-1.5 text-[12px] text-[var(--text3)] mb-3">
                    <button onClick={() => router.push("/admin")} className="hover:text-[var(--accent)] transition-colors">
                        Home
                    </button>
                    <span>/</span>
                    <span className="text-[var(--text)]">Reports &amp; Downloads</span>
                </nav>

                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-[10px] bg-[var(--accent-light)] flex items-center justify-center shrink-0">
                        <FileText size={20} className="text-[var(--accent)]" />
                    </div>
                    <div>
                        <h1 className="text-[22px] font-semibold text-[var(--text)]">Reports &amp; Downloads</h1>
                        <p className="text-[13px] text-[var(--text2)] mt-0.5">
                            Download Wage Sheet and Bank NEFT File for the processed payroll.
                        </p>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                <div className="flex flex-wrap gap-4 items-end">
                    {/* Payroll Month */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[12px] font-medium text-[var(--text3)]">
                            Payroll Month <span className="text-[var(--red)]">*</span>
                        </label>
                        <div className="flex gap-2">
                            <select
                                value={month}
                                onChange={e => setMonth(Number(e.target.value))}
                                className="h-9 px-3 border border-[var(--border)] rounded-[8px] text-[13px] bg-white text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                            >
                                {MONTHS.map((m, i) => (
                                    <option key={m} value={i + 1}>{m}</option>
                                ))}
                            </select>
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

                    {/* Report Type */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[12px] font-medium text-[var(--text3)]">
                            Report Type <span className="text-[var(--red)]">*</span>
                        </label>
                        <select
                            value={reportType}
                            onChange={e => setReportType(e.target.value)}
                            className="h-9 px-3 border border-[var(--border)] rounded-[8px] text-[13px] bg-white text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 min-w-[160px]"
                        >
                            {REPORT_TYPES.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>

                    {/* Site */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[12px] font-medium text-[var(--text3)]">Site</label>
                        <select
                            value={selectedSite}
                            onChange={e => setSelectedSite(e.target.value)}
                            disabled={loadingSites}
                            className="h-9 px-3 border border-[var(--border)] rounded-[8px] text-[13px] bg-white text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 min-w-[150px] disabled:opacity-60"
                        >
                            <option value="all">All Sites</option>
                            {sites.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Download Option */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[12px] font-medium text-[var(--text3)]">Download Option</label>
                        <div className="flex items-center gap-4 h-9">
                            <label className="flex items-center gap-1.5 cursor-pointer text-[13px] text-[var(--text2)]">
                                <input
                                    type="radio"
                                    name="downloadOption"
                                    value="site-wise"
                                    checked={downloadOption === "site-wise"}
                                    onChange={() => setDownloadOption("site-wise")}
                                    className="accent-[var(--accent)]"
                                />
                                Site Wise
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-[13px] text-[var(--text2)]">
                                <input
                                    type="radio"
                                    name="downloadOption"
                                    value="combine"
                                    checked={downloadOption === "combine"}
                                    onChange={() => setDownloadOption("combine")}
                                    className="accent-[var(--accent)]"
                                />
                                Combine (All Sites)
                            </label>
                        </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-2 ml-auto">
                        <button
                            onClick={handleViewSummary}
                            className="flex items-center gap-2 bg-[var(--accent)] hover:opacity-90 text-white rounded-[10px] text-[13px] font-medium px-4 py-2 transition-all h-9"
                        >
                            <Search size={13} />
                            View Summary
                        </button>
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-2 border border-[var(--border)] hover:bg-[var(--surface2)] text-[var(--text2)] rounded-[10px] text-[13px] font-medium px-4 py-2 transition-colors h-9"
                        >
                            <RefreshCw size={13} />
                            Reset
                        </button>
                    </div>
                </div>
            </div>

            {/* Download Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Wage Sheet Card */}
                <div className="bg-white border border-[var(--border)] rounded-[14px] p-5 flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-[12px] bg-emerald-50 flex items-center justify-center shrink-0">
                                <FileText size={24} className="text-emerald-600" />
                            </div>
                            <div>
                                <h2 className="text-[15px] font-semibold text-[var(--text)]">WAGE SHEET</h2>
                                <p className="text-[12px] text-[var(--text3)] mt-0.5">Download employee wage sheet.</p>
                            </div>
                        </div>
                        <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full shrink-0">
                            Excel / PDF
                        </span>
                    </div>

                    {/* Info box */}
                    <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-[8px] px-3 py-2.5">
                        <Info size={13} className="text-blue-500 mt-0.5 shrink-0" />
                        <p className="text-[12px] text-blue-700">
                            Includes: Employee Details, Earnings, Deductions, Net Pay and Site Summary.
                        </p>
                    </div>

                    {/* Format radio */}
                    <div>
                        <p className="text-[12px] font-medium text-[var(--text3)] mb-2">Download Format</p>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-1.5 cursor-pointer text-[13px] text-[var(--text2)]">
                                <input
                                    type="radio"
                                    name="wageFormat"
                                    value="excel"
                                    checked={wageFormat === "excel"}
                                    onChange={() => setWageFormat("excel")}
                                    className="accent-emerald-600"
                                />
                                Excel (.xlsx)
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-[13px] text-[var(--text2)]">
                                <input
                                    type="radio"
                                    name="wageFormat"
                                    value="pdf"
                                    checked={wageFormat === "pdf"}
                                    onChange={() => setWageFormat("pdf")}
                                    className="accent-emerald-600"
                                />
                                PDF (.pdf)
                            </label>
                        </div>
                    </div>

                    <button
                        onClick={handleDownloadWage}
                        disabled={downloadingWage}
                        className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-[10px] text-[13px] font-medium px-4 py-3 transition-all mt-auto"
                    >
                        {downloadingWage
                            ? <Loader2 size={15} className="animate-spin" />
                            : <Download size={15} />
                        }
                        {downloadingWage ? "Downloading..." : "Download Wage Sheet"}
                    </button>
                </div>

                {/* Bank NEFT Card */}
                <div className="bg-white border border-[var(--border)] rounded-[14px] p-5 flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-[12px] bg-blue-50 flex items-center justify-center shrink-0">
                                <Building2 size={24} className="text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-[15px] font-semibold text-[var(--text)]">BANK NEFT FILE</h2>
                                <p className="text-[12px] text-[var(--text3)] mt-0.5">Download bank transfer file for salary payment.</p>
                            </div>
                        </div>
                        <span className="text-[11px] font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full shrink-0">
                            Excel / CSV
                        </span>
                    </div>

                    {/* Info box */}
                    <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-[8px] px-3 py-2.5">
                        <Info size={13} className="text-blue-500 mt-0.5 shrink-0" />
                        <p className="text-[12px] text-blue-700">
                            Includes: Account Number, IFSC, Employee Name, Net Pay and Transfer Amount.
                        </p>
                    </div>

                    {/* Bank format select */}
                    <div>
                        <p className="text-[12px] font-medium text-[var(--text3)] mb-2">Bank Format</p>
                        <select
                            value={bankFormat}
                            onChange={e => setBankFormat(e.target.value)}
                            className="w-full h-9 px-3 border border-[var(--border)] rounded-[8px] text-[13px] bg-white text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-300"
                        >
                            {BANK_FORMATS.map(f => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={handleDownloadBank}
                        disabled={downloadingBank}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-[10px] text-[13px] font-medium px-4 py-3 transition-all mt-auto"
                    >
                        {downloadingBank
                            ? <Loader2 size={15} className="animate-spin" />
                            : <Download size={15} />
                        }
                        {downloadingBank ? "Downloading..." : "Download Bank NEFT File"}
                    </button>
                </div>
            </div>

            {/* Recently Downloaded */}
            <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                <h3 className="text-[14px] font-semibold text-[var(--text)] mb-4">Recently Downloaded</h3>
                {history.length === 0 ? (
                    <div className="flex items-center gap-2 text-[13px] text-[var(--text3)] py-6 justify-center">
                        <AlertCircle size={15} />
                        No downloads yet for this month.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="border-b border-[var(--border)]">
                                    <th className="text-left pb-2 pr-4 text-[12px] font-medium text-[var(--text3)] whitespace-nowrap">Report Type</th>
                                    <th className="text-left pb-2 pr-4 text-[12px] font-medium text-[var(--text3)] whitespace-nowrap">Month</th>
                                    <th className="text-left pb-2 pr-4 text-[12px] font-medium text-[var(--text3)] whitespace-nowrap">Site</th>
                                    <th className="text-left pb-2 pr-4 text-[12px] font-medium text-[var(--text3)] whitespace-nowrap">Option</th>
                                    <th className="text-left pb-2 pr-4 text-[12px] font-medium text-[var(--text3)] whitespace-nowrap">Downloaded By</th>
                                    <th className="text-left pb-2 pr-4 text-[12px] font-medium text-[var(--text3)] whitespace-nowrap">Downloaded On</th>
                                    <th className="text-left pb-2 text-[12px] font-medium text-[var(--text3)]">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map(item => (
                                    <tr key={item.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface2)] transition-colors">
                                        <td className="py-2.5 pr-4 whitespace-nowrap">
                                            <span className="flex items-center gap-1.5 text-[var(--text)]">
                                                {item.reportType === "Wage Sheet"
                                                    ? <FileText size={13} className="text-emerald-600" />
                                                    : <Building2 size={13} className="text-blue-600" />
                                                }
                                                {item.reportType}
                                            </span>
                                        </td>
                                        <td className="py-2.5 pr-4 text-[var(--text2)] whitespace-nowrap">{item.month}</td>
                                        <td className="py-2.5 pr-4 text-[var(--text2)] whitespace-nowrap">{item.site}</td>
                                        <td className="py-2.5 pr-4 text-[var(--text2)] whitespace-nowrap">{item.option}</td>
                                        <td className="py-2.5 pr-4 text-[var(--text2)] whitespace-nowrap">{item.downloadedBy}</td>
                                        <td className="py-2.5 pr-4 text-[var(--text2)] whitespace-nowrap">{item.downloadedOn}</td>
                                        <td className="py-2.5">
                                            <button
                                                onClick={() => handleDownloadAgain(item)}
                                                className="flex items-center gap-1 text-[var(--accent)] hover:underline text-[12px] font-medium whitespace-nowrap"
                                            >
                                                <Download size={12} />
                                                Download Again
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Note Box */}
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-[10px] px-4 py-3">
                <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-[12px] text-blue-700">
                    <strong>Note:</strong> Reports will be generated based on the processed payroll data. Please verify the payroll before downloading.
                </p>
            </div>

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
                    className="flex items-center gap-2 bg-[#1e3a5f] hover:opacity-90 text-white rounded-[10px] text-[13px] font-medium px-5 py-2.5 transition-all"
                >
                    <LayoutDashboard size={14} />
                    Go to Dashboard
                </button>
            </div>
        </div>
    )
}
